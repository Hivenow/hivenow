import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { VerticalTypeValidator } from "./schema";
import { getPlatformMarkupRate } from "./pricingHelpers";
import { calculateProductPricing, DEFAULT_TIER_SLABS, getPlatformConfig, calculateAllInclusivePricePaise } from "./pricingService";



/**
 * Migration to backfill the productPerformance table for all historical orders and claims.
 * Keeps convex queries strictly read-only and aggregates all stats safely in O(1) fields.
 */
export const backfillProductPerformance = internalMutation({
  args: {},
  handler: async (ctx) => {
    // If run from client, enforce admin check. Bypassed for Convex CLI run command.
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const products = await ctx.db.query("products").collect();
    const allClaims = await ctx.db.query("claims").collect();
    
    // Group claims by orderItemId for efficient O(N) access
    const claimsByOrderItemId = new Map<string, any[]>();
    for (const claim of allClaims) {
      const list = claimsByOrderItemId.get(claim.orderItemId) || [];
      list.push(claim);
      claimsByOrderItemId.set(claim.orderItemId, list);
    }

    let backfilledCount = 0;
    for (const product of products) {
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .collect();

      let salesRevenue = 0;
      let orderCount = 0;
      let claimCount = 0;
      let approvedClaimCount = 0;
      let lastSoldAt: number | undefined = undefined;

      for (const item of orderItems) {
        const order = await ctx.db.get(item.orderId);
        if (!order) continue;

        let shipmentDelivered = false;
        if (order.shipmentId) {
          const shipment = await ctx.db.get(order.shipmentId);
          if (shipment && shipment.status === "delivered") {
            shipmentDelivered = true;
          }
        }

        const isDelivered = order.status === "delivered" || shipmentDelivered;

        if (isDelivered) {
          salesRevenue += item.subtotal || (item.priceAtPurchase * item.quantity);
          orderCount += item.quantity;
          
          const soldTime = order.deliveredAt || order.updatedAt || order.createdAt;
          if (lastSoldAt === undefined || soldTime > lastSoldAt) {
            lastSoldAt = soldTime;
          }
        }

        const itemClaims = claimsByOrderItemId.get(item._id) || [];
        for (const claim of itemClaims) {
          claimCount++;
          if (claim.status === "refund_approved" || claim.status === "refunded") {
            approvedClaimCount++;
          }
        }
      }

      const existing = await ctx.db
        .query("productPerformance")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          salesRevenue,
          orderCount,
          claimCount,
          approvedClaimCount,
          lastSoldAt,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("productPerformance", {
          productId: product._id,
          boutiqueId: product.boutiqueId,
          salesRevenue,
          orderCount,
          claimCount,
          approvedClaimCount,
          lastSoldAt,
          updatedAt: Date.now(),
        });
      }
      backfilledCount++;
    }

    return { success: true, backfilledCount };
  },
});

/**
 * Migration to backfill merchantTier to 'Bronze' and approvalStatus to 'approved' for legacy records.
 */
export const backfillListingApprovalFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const boutiques = await ctx.db.query("boutiques").collect();
    let boutiqueCount = 0;
    for (const b of boutiques) {
      if (!b.merchantTier) {
        await ctx.db.patch(b._id, {
          merchantTier: "Bronze",
        });
        boutiqueCount++;
      }
    }

    const products = await ctx.db.query("products").collect();
    let productCount = 0;
    for (const p of products) {
      if (!p.approvalStatus) {
        await ctx.db.patch(p._id, {
          approvalStatus: "approved",
        });
        productCount++;
      }
    }

    return { success: true, boutiqueCount, productCount };
  }
});

/**
 * Migration to backfill the slug field for all approved boutiques that lack one.
 * Uses a basic slugify function based on the boutiqueName.
 */
export const backfillBoutiqueSlugs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const boutiques = await ctx.db.query("boutiques").collect();
    let backfilledCount = 0;

    for (const b of boutiques) {
      if (!b.slug) {
        // Basic slugify
        let baseSlug = b.boutiqueName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        if (!baseSlug) {
          baseSlug = `shop-${b._id.slice(-6)}`;
        }

        // Handle collisions (just in case)
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await ctx.db
            .query("boutiques")
            .filter((q) => q.eq(q.field("slug"), uniqueSlug))
            .first();
          if (!existing) break;
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }

        await ctx.db.patch(b._id, { slug: uniqueSlug });
        backfilledCount++;
      }
    }

    return `Backfilled slugs for ${backfilledCount} boutiques.`;
  }
});

/**
 * One-off fix for demo-seeded products whose slug retained raw spaces from the
 * product name (seedMutations.ts hyphenated the boutique name but not the
 * name segment, e.g. "linen-house-formal top-1"). Rewrites any product slug
 * containing whitespace to hyphenated form; the trailing globalIndex already
 * made each slug unique, so no collision handling is needed.
 */
export const fixSeedProductSlugSpaces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const products = await ctx.db.query("products").collect();
    let fixedCount = 0;

    for (const p of products) {
      if (/\s/.test(p.slug)) {
        const fixedSlug = p.slug.trim().replace(/\s+/g, "-").toLowerCase();
        await ctx.db.patch(p._id, { slug: fixedSlug });
        fixedCount++;
      }
    }

    return `Fixed ${fixedCount} product slugs containing spaces.`;
  }
});

/**
 * Phase 1 Migration: Set basePrice and bump customer price by 15%
 */
export const migrateProductPricesPhase1 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    // 1. Migrate Products
    const products = await ctx.db.query("products").collect();
    let updatedProducts = 0;
    
    for (const product of products) {
      if (product.basePrice === undefined) {
        const basePrice = product.price; // Treat current price as basePrice
        const newCustomerPrice = Math.floor(basePrice * 1.15); // Add 15% markup
        
        await ctx.db.patch(product._id, {
          basePrice: basePrice,
          price: newCustomerPrice,
        });
        updatedProducts++;
      }
    }

    // 2. Migrate Product Variants
    const variants = await ctx.db.query("productVariants").collect();
    let updatedVariants = 0;
    
    for (const variant of variants) {
      if (variant.basePrice === undefined) {
        const basePrice = variant.price;
        const newCustomerPrice = Math.floor(basePrice * 1.15);
        
        await ctx.db.patch(variant._id, {
          basePrice: basePrice,
          price: newCustomerPrice,
        });
        updatedVariants++;
      }
    }

    return `Successfully migrated ${updatedProducts} products and ${updatedVariants} variants to the new pricing model.`;
  },
});

/**
 * Migration to seed/backfill platformSettings with the default tiered slabs.
 */
export const migratePlatformSettingsToTiered = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const settings = await ctx.db.query("platformSettings").first();
    if (settings) {
      await ctx.db.patch(settings._id, {
        markupType: "tiered",
        markupTiers: DEFAULT_TIER_SLABS,
        updatedAt: Date.now()
      });
      return "Successfully updated existing platform settings with tiered slabs.";
    } else {
      await ctx.db.insert("platformSettings", {
        markupRate: 0.15,
        platformFeeRate: 0.02,
        markupType: "tiered",
        markupTiers: DEFAULT_TIER_SLABS,
        updatedAt: Date.now()
      });
      return "Successfully seeded new platform settings with default tiered slabs.";
    }
  }
});

/**
 * Migration to recalculate all product prices according to all-inclusive upfront pricing.
 * Sets storefront price = Base Price + Handling Fee + Platform Fee + GST.
 */
export const recalculateAllProductPrices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity !== null) {
      await requireRole(ctx, "admin");
    }

    const config = await getPlatformConfig(ctx);
    const products = await ctx.db.query("products").collect();
    let updatedCount = 0;
    const now = Date.now();

    // Preload all boutiques to resolve pricing tiers in O(1)
    const boutiques = await ctx.db.query("boutiques").collect();
    const boutiqueTierMap = new Map<string, string>();
    for (const b of boutiques) {
      boutiqueTierMap.set(b._id, (b as any).pricingTier || "bronze");
    }

    for (const product of products) {
      let basePrice = product.basePrice ?? product.price;
      let baseDiscountPrice = product.baseDiscountPrice ?? product.discountPrice;

      if (!basePrice || basePrice <= 0) {
        basePrice = product.price;
        baseDiscountPrice = product.discountPrice;
      }

      // Sanitize basePrice to clean integer paise (e.g. 90000 paise for ₹900)
      if (basePrice % 100 !== 0) {
        if (Math.abs((basePrice - 57.82) % 100) < 1) {
          basePrice = Math.round(basePrice - 57.82);
        } else {
          basePrice = Math.round(basePrice / 100) * 100;
        }
      }
      if (baseDiscountPrice && baseDiscountPrice % 100 !== 0) {
        if (Math.abs((baseDiscountPrice - 57.82) % 100) < 1) {
          baseDiscountPrice = Math.round(baseDiscountPrice - 57.82);
        } else {
          baseDiscountPrice = Math.round(baseDiscountPrice / 100) * 100;
        }
      }

      const tierKey = boutiqueTierMap.get(product.boutiqueId) || "bronze";
      const targetPrice = calculateAllInclusivePricePaise(basePrice, tierKey, config);
      const targetDiscountPrice = baseDiscountPrice ? calculateAllInclusivePricePaise(baseDiscountPrice, tierKey, config) : undefined;

      await ctx.db.patch(product._id, {
        basePrice,
        baseDiscountPrice,
        price: targetPrice,
        discountPrice: targetDiscountPrice,
        updatedAt: now,
      });
      updatedCount++;
    }


    return `Successfully recalculated and updated prices for ${updatedCount} products to all-inclusive upfront pricing.`;
  },
});




/**
 * Backfills `sameDayEligible: true` across the catalogue.
 *
 * This was never a real seller choice: both boutique product forms held it as dead state
 * initialised to `false` with no UI attached, so every product was written false by default and
 * no seller could ever change it. Hive fulfils every order through Porter under one platform-wide
 * 90-minute promise, so the flag is a platform constant rather than per-product metadata. The
 * forms no longer send it and both write paths now set true; this aligns the existing rows.
 */
export const backfillSameDayEligible = internalMutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const p of products) {
      if (p.sameDayEligible !== true) {
        await ctx.db.patch(p._id, { sameDayEligible: true });
        updated++;
      }
    }
    return { total: products.length, updated };
  },
});

/**
 * One-time: give the flat category list a hierarchy.
 *
 * Every category in production is currently top-level, which is why the seller
 * picker is a flat wall and the storefront cannot group anything. This creates
 * the three parents that do not exist yet and files the existing categories
 * under them.
 *
 * It touches the `categories` table only. No product is read, moved or
 * re-categorised: a product keeps its categoryId, and getCatalogPage reaches it
 * from the new parent by walking parentId. Nothing about pricing, payouts or
 * serviceability depends on the category tree.
 *
 * Declared as an internalMutation: it is not reachable from any client, only
 * from the CLI and from other server functions. The other migrations in this
 * file gate on `if (identity !== null) requireRole(...)`, which lets an
 * unauthenticated caller through — worth revisiting, but out of scope here.
 *
 * Runs as a dry run by default and reports exactly what it would do. Pass
 * `{ apply: true }` to write.
 *
 *   npx convex run --prod migrations:buildCategoryHierarchy
 *   npx convex run --prod migrations:buildCategoryHierarchy '{"apply":true}'
 *
 * Reversal: clear parentId on the children and delete the three created
 * parents. Both are ordinary admin operations on the categories screen.
 */
export const buildCategoryHierarchy = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    // Parents to create, keyed by the marker used in the mapping below.
    const PARENTS = [
      { marker: "WOMEN", name: "Women's Fashion", slug: "womens-fashion", sortOrder: 1, verticalType: "apparel" as const },
      { marker: "MEN",   name: "Men's Fashion",   slug: "mens-fashion",   sortOrder: 2, verticalType: "apparel" as const },
      { marker: "ACC",   name: "Accessories",     slug: "accessories",    sortOrder: 3, verticalType: "handbag" as const },
    ];

    // Existing category slug -> parent marker.
    // Deliberately absent: t-shirts, pinteresty, frok. Each is ambiguous and
    // stays top-level until someone decides where it belongs.
    const MAPPING: Record<string, string> = {
      "sarees":         "WOMEN",
      "kurtis":         "WOMEN",
      "lehengas":       "WOMEN",
      "anarkalis":      "WOMEN",
      "gowns":          "WOMEN",
      "indo-western":   "WOMEN",
      "blouses":        "WOMEN",
      "dupattas":       "WOMEN",
      "co-ord-sets":    "WOMEN",
      "fusion-wear":    "WOMEN",
      "tops":           "WOMEN",
      "maternity-wear": "WOMEN",
      "night-wear":     "WOMEN",
      "korean-wear":    "WOMEN",
      "ethnic-wer":     "MEN",
      "handbags":       "ACC",
    };

    // Slugs and names that disagree today. Old slugs keep working through the
    // redirects added in apps/customer/next.config.ts.
    const RENAMES: Record<string, { name?: string; slug?: string }> = {
      "ethnic-wer": { name: "Men's Ethnic Wear", slug: "mens-ethnic-wear" },
      "handbags":   { name: "Handbags",          slug: "handbags" },
    };

    // Categories that sell in one size only.
    const FREE_SIZE_SLUGS = new Set(["sarees", "dupattas"]);

    const existing = await ctx.db.query("categories").collect();
    const bySlug = new Map(existing.map((c) => [c.slug, c]));

    const plan: string[] = [];
    const warnings: string[] = [];
    const parentIds = new Map<string, any>();

    // 1. Parents
    for (const parent of PARENTS) {
      const found = bySlug.get(parent.slug);
      if (found) {
        parentIds.set(parent.marker, found._id);
        plan.push(`reuse parent "${found.name}" (/${found.slug})`);
        continue;
      }
      plan.push(`CREATE parent "${parent.name}" (/${parent.slug}, ${parent.verticalType})`);
      if (apply) {
        const id = await ctx.db.insert("categories", {
          name:           parent.name,
          slug:           parent.slug,
          active:         true,
          sortOrder:      parent.sortOrder,
          showOnHomepage: true,
          verticalType:   parent.verticalType,
          createdAt:      Date.now(),
        });
        parentIds.set(parent.marker, id);
      }
    }

    // 2. Children
    for (const [slug, marker] of Object.entries(MAPPING)) {
      const category = bySlug.get(slug);
      if (!category) {
        warnings.push(`no category with slug "${slug}" — skipped`);
        continue;
      }
      if (category.parentId) {
        warnings.push(`"${category.name}" already has a parent — left alone`);
        continue;
      }

      const rename = RENAMES[slug];
      const patch: Record<string, unknown> = { parentId: parentIds.get(marker) };
      let note = `"${category.name}" (/${slug}) -> ${marker}`;

      if (rename?.name && rename.name !== category.name) {
        patch.name = rename.name;
        note += `, rename to "${rename.name}"`;
      }
      if (rename?.slug && rename.slug !== category.slug) {
        patch.slug = rename.slug;
        note += `, reslug to /${rename.slug}`;
      }
      if (!category.verticalType) {
        patch.verticalType = marker === "ACC" ? "handbag" : "apparel";
        note += `, vertical = ${patch.verticalType}`;
      }
      if (FREE_SIZE_SLUGS.has(slug) && category.isFreeSize !== true) {
        patch.isFreeSize = true;
        note += ", one size only";
      }

      plan.push(note);
      if (apply) await ctx.db.patch(category._id, patch);
    }

    // 3. Anything left top-level, so nothing is silently forgotten.
    for (const category of existing) {
      if (MAPPING[category.slug]) continue;
      if (PARENTS.some((p) => p.slug === category.slug)) continue;
      warnings.push(`"${category.name}" (/${category.slug}) stays top-level — not in the mapping`);
    }

    return {
      applied: apply,
      plan,
      warnings,
      note: apply
        ? "Categories updated. No product was read or modified."
        : "Dry run. Re-run with {\"apply\":true} to write.",
    };
  },
});

/**
 * Corrects a single category's `verticalType`.
 *
 * `buildCategoryHierarchy` only filled in a vertical where one was missing, so
 * a row that already carried the wrong value kept it. `handbags` is the live
 * case: it sits under the `accessories` parent (handbag) while still declaring
 * `apparel`, and `resolveVerticalTypeForCategory` reads the category directly
 * rather than walking parentId, so new products filed there would be stamped
 * apparel and validated against apparel spec keys.
 *
 * Only the one field is patched. Existing products are deliberately left alone:
 * a product snapshots its vertical once at creation and is never recomputed, so
 * changing the category cannot retroactively alter how an existing product's
 * specs validate. The dry run reports which products would have been affected
 * had that not been the rule, so the blast radius is visible before writing.
 *
 *   npx convex run --prod migrations:setCategoryVerticalType '{"slug":"handbags","verticalType":"handbag"}'
 *   npx convex run --prod migrations:setCategoryVerticalType '{"slug":"handbags","verticalType":"handbag","apply":true}'
 *
 * Reversal: run it again with the previous value.
 */
export const setCategoryVerticalType = internalMutation({
  args: {
    slug: v.string(),
    verticalType: VerticalTypeValidator,
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!category) throw new Error(`No category with slug "${args.slug}"`);

    const parent = category.parentId ? await ctx.db.get(category.parentId) : null;

    const products = await ctx.db
      .query("products")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", category._id))
      .collect();

    const stamped = products.reduce<Record<string, number>>((acc, p) => {
      const key = (p as { verticalType?: string }).verticalType ?? "(unset)";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    if (category.verticalType === args.verticalType) {
      return {
        applied: false,
        note: `"${category.name}" is already ${args.verticalType}. Nothing to do.`,
      };
    }

    const change = `"${category.name}" (/${category.slug}): ${category.verticalType ?? "(unset)"} -> ${args.verticalType}`;

    if (apply) await ctx.db.patch(category._id, { verticalType: args.verticalType });

    return {
      applied: apply,
      change,
      parent: parent ? `${parent.name} (${parent.verticalType ?? "(unset)"})` : "(top-level)",
      existingProducts: products.length,
      existingProductVerticals: stamped,
      note: apply
        ? "Category updated. Existing products keep the vertical they were stamped with at creation; only products created from now on pick up the new value."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * Read-only census of the catalogue by category.
 *
 * Phase 0 of the taxonomy rework: every decision about what to keep, merge,
 * rename or delete depends on knowing where the products actually are, and
 * nothing in the admin UI shows that. Reports per category the number of
 * products, how many are active, and which verticals those products were
 * stamped with at creation — the last one matters because re-parenting a
 * category never restamps its existing products.
 *
 * Also reports products whose categoryId points at a category that no longer
 * exists, which would otherwise be invisible.
 *
 * Writes nothing.
 *
 *   npx convex run --prod migrations:categoryProductCensus
 */
export const categoryProductCensus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    const byId = new Map(categories.map((c) => [c._id as string, c]));

    const rows = await Promise.all(
      categories.map(async (category) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_categoryId", (q) => q.eq("categoryId", category._id))
          .collect();

        const verticals = products.reduce<Record<string, number>>((acc, p) => {
          const key = (p as { verticalType?: string }).verticalType ?? "(unset)";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});

        const parent = category.parentId ? byId.get(category.parentId as string) : undefined;

        return {
          name:        category.name,
          slug:        category.slug,
          parent:      parent ? parent.slug : null,
          active:      category.active,
          vertical:    category.verticalType ?? "(unset)",
          products:    products.length,
          activeProducts: products.filter((p) => p.active === true).length,
          productVerticals: verticals,
        };
      })
    );

    // Products pointing at a category that has since been deleted.
    const allProducts = await ctx.db.query("products").collect();
    const orphaned = allProducts.filter(
      (p) => p.categoryId && !byId.has(p.categoryId as string)
    ).length;
    const uncategorised = allProducts.filter((p) => !p.categoryId).length;

    return {
      totalProducts: allProducts.length,
      totalCategories: categories.length,
      orphanedProducts: orphaned,
      uncategorisedProducts: uncategorised,
      rows: rows.sort((a, b) => b.products - a.products),
    };
  },
});

/**
 * Re-files a category under a different parent, or detaches it to top level.
 *
 * The admin screen can already do this, but doing it there is what detached
 * three categories by accident: `updateCategory` replaces the whole row, so a
 * parent left unset in the form is written as undefined. This touches
 * `parentId` and nothing else, reports the move before making it, and refuses
 * the two structurally invalid cases rather than writing a broken tree.
 *
 * Products are not read or moved: they keep their categoryId, and the storefront
 * reaches them from the new parent by walking parentId in selectCatalogProducts.
 *
 *   npx convex run --prod migrations:setCategoryParent '{"slug":"pinteresty","parentSlug":"womens-fashion"}'
 *   npx convex run --prod migrations:setCategoryParent '{"slug":"pinteresty","parentSlug":"womens-fashion","apply":true}'
 *
 * Reversal: run it again with the previous parent, or with parentSlug omitted
 * to return the category to top level.
 */
export const setCategoryParent = internalMutation({
  args: {
    slug: v.string(),
    parentSlug: v.optional(v.string()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!category) throw new Error(`No category with slug "${args.slug}"`);

    // A category with children of its own cannot become someone's child:
    // nesting is capped at two levels by MAX_CATEGORY_DEPTH.
    const ownChildren = await ctx.db
      .query("categories")
      .withIndex("by_parentId", (q) => q.eq("parentId", category._id))
      .collect();
    if (args.parentSlug && ownChildren.length > 0) {
      throw new Error(
        `"${category.name}" has ${ownChildren.length} subcategories of its own, so it cannot become a subcategory. Move them first.`
      );
    }

    let parent = null;
    if (args.parentSlug) {
      parent = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", args.parentSlug!))
        .first();
      if (!parent) throw new Error(`No category with slug "${args.parentSlug}"`);
      if (parent._id === category._id) throw new Error("A category cannot be its own parent.");
      if (parent.parentId) {
        throw new Error(`"${parent.name}" is itself a subcategory. Nesting is two levels deep.`);
      }
    }

    const currentParent = category.parentId ? await ctx.db.get(category.parentId) : null;
    const from = currentParent ? `/${currentParent.slug}` : "(top-level)";
    const to = parent ? `/${parent.slug}` : "(top-level)";

    if (from === to) {
      return { applied: false, note: `"${category.name}" is already under ${to}. Nothing to do.` };
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", category._id))
      .collect();

    if (apply) {
      await ctx.db.patch(category._id, {
        parentId: parent ? parent._id : undefined,
      });
    }

    return {
      applied: apply,
      change: `"${category.name}" (/${category.slug}): ${from} -> ${to}`,
      productsInCategory: products.length,
      note: apply
        ? "Category re-filed. No product was read or modified."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * Edits a category's display fields without disturbing the rest of the row.
 *
 * `updateCategory` is a full replace: every field the admin form does not send
 * is written as undefined, which is how three categories silently lost their
 * parent. This patches only the fields actually passed, so changing a name
 * cannot detach a category or clear its image.
 *
 * Reports the before and after of each field before writing.
 *
 *   npx convex run --prod migrations:setCategoryFields '{"slug":"mens-fashion","active":true}'
 *   npx convex run --prod migrations:setCategoryFields '{"slug":"mens-fashion","active":true,"apply":true}'
 *
 * Reversal: run it again with the previous values, which the dry run prints.
 */
export const setCategoryFields = internalMutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    active: v.optional(v.boolean()),
    showOnHomepage: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!category) throw new Error(`No category with slug "${args.slug}"`);

    const patch: Record<string, unknown> = {};
    const changes: string[] = [];

    const consider = <T,>(field: string, next: T | undefined, current: T) => {
      if (next === undefined || next === current) return;
      patch[field] = next;
      changes.push(`${field}: ${JSON.stringify(current)} -> ${JSON.stringify(next)}`);
    };

    consider("name", args.name, category.name);
    consider("active", args.active, category.active);
    consider("showOnHomepage", args.showOnHomepage, category.showOnHomepage);
    consider("sortOrder", args.sortOrder, category.sortOrder);

    if (changes.length === 0) {
      return { applied: false, note: `"${category.name}" already matches. Nothing to do.` };
    }

    if (apply) await ctx.db.patch(category._id, patch);

    return {
      applied: apply,
      category: `${category.name} (/${category.slug})`,
      changes,
      note: apply ? "Category updated. Parent, image and every other field untouched." : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * One-time: re-files the two products misfiled under "T-Shirts".
 *
 * Neither is a t-shirt. A census of the catalogue found the category holds a
 * 3-piece salwar set and a linen top, which is why it sat at top level looking
 * unclassifiable. They are moved to the closest existing categories rather than
 * new ones, so the taxonomy gains no empty nodes on the strength of two rows.
 *
 * Deliberately not a generic "move products" mutation. The two moves are named
 * here by product id, and every one of them is checked against the state this
 * was written for: the product must still exist, still carry the same name, and
 * still sit in the category it is being moved out of. Anything else aborts
 * without writing, because it means the catalogue changed underneath this and
 * the intended move may no longer be the right one.
 *
 * Only `categoryId` is patched. Price, inventory, seller, vertical, details and
 * slug are untouched — and re-categorising never restamps a product's vertical,
 * which is set once at creation.
 *
 * Idempotent: a product already in its destination is reported and skipped, so
 * re-running is safe and does nothing.
 *
 * The T-Shirts category is left in place. Deleting it is a separate step, after
 * this has been verified, so the two changes have their own rollback boundary.
 *
 *   npx convex run --prod migrations:refileMisfiledTshirtProducts
 *   npx convex run --prod migrations:refileMisfiledTshirtProducts '{"apply":true}'
 *
 * Reversal: move both products back to the t-shirts category.
 */
export const refileMisfiledTshirtProducts = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const MOVES = [
      {
        productId: "n175gfhrexn5253n3b6z0c8ca18dm39d",
        expectedName: "3-piece Crush Fabric Salwar Set",
        fromSlug: "t-shirts",
        toSlug: "co-ord-sets",
      },
      {
        productId: "n17b6e2vt5rftjj32n1efk7qc58cs1dj",
        expectedName: "Yellow cotton-linen slitted top",
        fromSlug: "t-shirts",
        toSlug: "tops",
      },
    ];

    const categoryBySlug = async (slug: string) => {
      const category = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (!category) throw new Error(`Aborted: no category with slug "${slug}".`);
      return category;
    };

    const plan: string[] = [];
    const alreadyDone: string[] = [];

    for (const move of MOVES) {
      const product = await ctx.db.get(move.productId as Id<"products">);
      if (!product) {
        throw new Error(`Aborted: product ${move.productId} no longer exists.`);
      }
      if (product.name !== move.expectedName) {
        throw new Error(
          `Aborted: product ${move.productId} is now named "${product.name}", expected "${move.expectedName}". The catalogue changed since this migration was written.`
        );
      }

      const from = await categoryBySlug(move.fromSlug);
      const to = await categoryBySlug(move.toSlug);
      if (!to.active) {
        throw new Error(`Aborted: destination category "${to.name}" is inactive.`);
      }

      if (product.categoryId === to._id) {
        alreadyDone.push(`"${product.name}" is already in ${to.name}`);
        continue;
      }
      if (product.categoryId !== from._id) {
        throw new Error(
          `Aborted: "${product.name}" is not in ${from.name} any more. Expected it there before moving it to ${to.name}.`
        );
      }

      plan.push(`"${product.name}": ${from.name} -> ${to.name}`);
      if (apply) await ctx.db.patch(product._id, { categoryId: to._id });
    }

    return {
      applied: apply,
      plan,
      alreadyDone,
      productsChanged: plan.length,
      note: apply
        ? "Products re-filed. Only categoryId was written; the T-Shirts category still exists and is now expected to be empty."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * Broadens the Men's Fashion and Accessories taxonomies at the child level.
 *
 * Women's arrived with fifteen established subcategories; Men's and Accessories
 * had one each, because the earlier cleanup deliberately restructured existing
 * production categories rather than inventing new ones. This adds the missing
 * children, now that the lists have been decided rather than guessed.
 *
 * No new parent is created. The three parents are the marketplace's real
 * verticals, and a parent should represent one of those rather than reserve a
 * name for inventory that may never arrive.
 *
 * The retired `t-shirts` row is reused rather than replaced. It holds no
 * products, its slug is the natural one, and its identity was always correct --
 * the fault was two women's products filed into it, which have since been moved.
 * Creating `mens-t-shirts` alongside it would leave two categories meaning the
 * same thing. `frok` stays retired: unlike t-shirts, its name is a typo rather
 * than a category anyone would search for.
 *
 * `Kurtas` is deliberately absent. Men's Ethnic Wear already covers kurtas,
 * sherwanis and nehru jackets, and offering both would leave a seller with a
 * kurta unable to tell which one to pick -- the same ambiguity that put a salwar
 * set under T-Shirts. If Ethnic Wear later earns subdivision, that is its own
 * decision.
 *
 * Categories are created without images. The admin screen requires an image
 * only when creating a category, not when editing one, so these stay editable
 * and images can be added as inventory arrives.
 *
 * Touches the `categories` table only. No product is read, moved or
 * re-categorised.
 *
 *   npx convex run --prod migrations:expandMensAndAccessories
 *   npx convex run --prod migrations:expandMensAndAccessories '{"apply":true}'
 *
 * Reversal: deactivate or delete the created categories, and return t-shirts to
 * top level and inactive.
 */
export const expandMensAndAccessories = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const TSHIRTS_SLUG = "t-shirts";
    const TSHIRTS_PARENT = "mens-fashion";

    const NEW_CATEGORIES = [
      // Men's Fashion -- every one apparel.
      { name: "Shirts",                slug: "mens-shirts",      parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Polos",                 slug: "mens-polos",       parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Trousers",              slug: "mens-trousers",    parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Jeans",                 slug: "mens-jeans",       parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Shorts",                slug: "mens-shorts",      parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Jackets",               slug: "mens-jackets",     parentSlug: "mens-fashion", vertical: "apparel"   as const },
      { name: "Sweatshirts & Hoodies", slug: "mens-sweatshirts", parentSlug: "mens-fashion", vertical: "apparel"   as const },
      // Accessories -- the vertical differs per row, since there is no
      // "accessories" vertical and each one sets its own returns policy and the
      // built-in seller form used when the category has no attributes of its own.
      { name: "Wallets",          slug: "wallets",          parentSlug: "accessories", vertical: "handbag"   as const },
      { name: "Belts",            slug: "belts",            parentSlug: "accessories", vertical: "lifestyle" as const },
      { name: "Watches",          slug: "watches",          parentSlug: "accessories", vertical: "lifestyle" as const },
      { name: "Sunglasses",       slug: "sunglasses",       parentSlug: "accessories", vertical: "lifestyle" as const },
      { name: "Jewellery",        slug: "jewellery",        parentSlug: "accessories", vertical: "jewellery" as const },
      { name: "Hair Accessories", slug: "hair-accessories", parentSlug: "accessories", vertical: "lifestyle" as const },
      { name: "Scarves & Stoles", slug: "scarves-stoles",   parentSlug: "accessories", vertical: "apparel"   as const },
      { name: "Hats & Caps",      slug: "hats-caps",        parentSlug: "accessories", vertical: "apparel"   as const },
    ];

    const existing = await ctx.db.query("categories").collect();
    const bySlug = new Map(existing.map((c) => [c.slug, c]));

    const reused: string[] = [];
    const toCreate: string[] = [];
    const toModify: string[] = [];
    const warnings: string[] = [];

    // Parents must exist, be active, and be top level before anything is filed
    // under them.
    const parentIds = new Map<string, Id<"categories">>();
    for (const parentSlug of [TSHIRTS_PARENT, "accessories"]) {
      const parent = bySlug.get(parentSlug);
      if (!parent) throw new Error(`Aborted: no parent category with slug "${parentSlug}".`);
      if (!parent.active) {
        throw new Error(`Aborted: parent "${parent.name}" (/${parent.slug}) is inactive.`);
      }
      if (parent.parentId) {
        throw new Error(`Aborted: "${parent.name}" is itself a subcategory; nesting is two levels deep.`);
      }
      parentIds.set(parentSlug, parent._id);
      reused.push(`parent "${parent.name}" (/${parent.slug})`);
    }

    // Children that already exist and need no work.
    for (const slug of ["handbags", "mens-ethnic-wear"]) {
      const category = bySlug.get(slug);
      if (!category) {
        warnings.push(`expected existing category "${slug}" is missing`);
        continue;
      }
      const parent = category.parentId ? await ctx.db.get(category.parentId) : null;
      reused.push(`"${category.name}" (/${category.slug}) already under ${parent ? parent.name : "(top-level)"}`);
    }

    // T-Shirts: reactivate and file under Men's Fashion, keeping name and slug.
    const tshirts = bySlug.get(TSHIRTS_SLUG);
    if (!tshirts) {
      warnings.push(`no category with slug "${TSHIRTS_SLUG}" -- nothing to reuse`);
    } else {
      const products = await ctx.db
        .query("products")
        .withIndex("by_categoryId", (q) => q.eq("categoryId", tshirts._id))
        .collect();
      if (products.length > 0) {
        throw new Error(
          `Aborted: "${tshirts.name}" holds ${products.length} products. It was expected to be empty before being reused for Men's.`
        );
      }

      const parentId = parentIds.get(TSHIRTS_PARENT)!;
      const changes: string[] = [];
      const patch: Record<string, unknown> = {};
      if (!tshirts.active) {
        patch.active = true;
        changes.push("reactivate");
      }
      if (tshirts.parentId !== parentId) {
        patch.parentId = parentId;
        changes.push("file under Men's Fashion");
      }
      if (changes.length === 0) {
        reused.push(`"${tshirts.name}" (/${tshirts.slug}) already active under Men's Fashion`);
      } else {
        toModify.push(`"${tshirts.name}" (/${tshirts.slug}): ${changes.join(", ")}`);
        if (apply) await ctx.db.patch(tshirts._id, patch);
      }
    }

    // New children.
    let sortOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder || 0), 0);
    for (const spec of NEW_CATEGORIES) {
      const clash = bySlug.get(spec.slug);
      if (clash) {
        const parent = clash.parentId ? await ctx.db.get(clash.parentId) : null;
        warnings.push(
          `slug "${spec.slug}" already belongs to "${clash.name}" under ${parent ? parent.name : "(top-level)"} -- skipped`
        );
        continue;
      }

      sortOrder++;
      toCreate.push(
        `"${spec.name}" (/${spec.slug}) under ${spec.parentSlug}, ${spec.vertical}, sortOrder ${sortOrder}`
      );

      if (apply) {
        await ctx.db.insert("categories", {
          name:           spec.name,
          slug:           spec.slug,
          active:         true,
          sortOrder,
          // Children stay off the homepage: the homepage block filters on
          // showOnHomepage with no level filter, so a child set true renders
          // beside the parents as though it were one.
          showOnHomepage: false,
          parentId:       parentIds.get(spec.parentSlug)!,
          verticalType:   spec.vertical,
          createdAt:      Date.now(),
        });
      }
    }

    // Reported rather than changed: the Accessories parent still declares the
    // handbag vertical, which stops describing it once it holds jewellery and
    // watches. It only matters for a product filed directly on the parent, and
    // a parent with children is not selectable in the seller picker, so this is
    // left as a decision rather than folded into a taxonomy migration.
    const accessories = bySlug.get("accessories");
    if (accessories && accessories.verticalType === "handbag") {
      warnings.push(
        `"Accessories" still declares verticalType "handbag"; consider "lifestyle" now that it spans jewellery and watches`
      );
    }

    return {
      applied: apply,
      reused,
      toModify,
      toCreate,
      warnings,
      categoriesCreated: apply ? toCreate.length : 0,
      productChanges: 0,
      note: apply
        ? "Categories updated. No product was read, moved or re-categorised."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * Removes the five collectionProducts mappings whose products were hard-deleted.
 *
 * deleteProduct (products.ts) removes the product document and its image storage but leaves the
 * collectionProducts rows pointing at it. A merchandiser then sees a curated rail silently render
 * fewer cards than it is configured for, with nothing to indicate why: "Trending in Kochi" is
 * bound to seven products and can only draw four, and "The Premium Edit" is capped at seven with
 * three mapped.
 *
 * Deliberately NOT a "delete every mapping whose product is missing" sweep. Each row is named
 * explicitly, with the productId it is expected to carry, so this cannot widen its own blast
 * radius if the data shifts between review and execution — a product created mid-write, or a
 * mapping edited since the audit, aborts the whole run rather than being swept up in it.
 *
 * The five were audited individually first: every one points at a genuinely deleted product
 * document (a valid products id that no longer resolves), none is pinned, and both owning
 * boutiques still exist and are APPROVED. No mapping in the table was merely inactive or out of
 * stock, so there is no ambiguous case being caught up in this.
 *
 * Convex mutations are transactional: any throw below rolls the whole thing back, so a failed
 * precondition leaves the table exactly as it was rather than half-cleaned.
 *
 * Run:  npx convex run --prod migrations:removeDanglingCollectionProducts
 *       npx convex run --prod migrations:removeDanglingCollectionProducts '{"apply":true}'
 */
export const removeDanglingCollectionProducts = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const MAPPINGS = [
      { mappingId: "v976gbyknpngcny5fqhzd3rssx8bxswa", expectedProductId: "n175txpen5a854gpfjpq0wtx9n8a2sd7", collectionSlug: "trending-in-kochi" },
      { mappingId: "v97d9h8mrcpvh1xzsg9yg2x3mx8cnye4", expectedProductId: "n17ancnepf9cenrc3ss30n3zv58cac4w", collectionSlug: "trending-in-kochi" },
      { mappingId: "v976r04kdt9bbvf17xqs4rr10n8cmvc5", expectedProductId: "n170368031hywgp0rkxche9vhd8ca5d4", collectionSlug: "trending-in-kochi" },
      { mappingId: "v97cda8ctccpz2vh7en1bj52b98cnmk4", expectedProductId: "n170368031hywgp0rkxche9vhd8ca5d4", collectionSlug: "quiet-luxury" },
      { mappingId: "v972zgh14p1hea8912zjacz2wx8cmbc8", expectedProductId: "n17ancnepf9cenrc3ss30n3zv58cac4w", collectionSlug: "quiet-luxury" },
    ];

    const before = (await ctx.db.query("collectionProducts").collect()).length;
    const plan: string[] = [];

    for (const target of MAPPINGS) {
      const mapping = await ctx.db.get(target.mappingId as Id<"collectionProducts">);
      if (!mapping) {
        throw new Error(
          `Aborted: collectionProducts row ${target.mappingId} no longer exists. It may already have been removed — re-run the audit before retrying.`
        );
      }

      // The row must still name the product the audit found on it. If it names a different one,
      // the mapping was re-pointed after the audit and is no longer the row that was reviewed.
      if (String(mapping.productId) !== target.expectedProductId) {
        throw new Error(
          `Aborted: mapping ${target.mappingId} now points at product ${String(mapping.productId)}, expected ${target.expectedProductId}.`
        );
      }

      // Defensive precondition, and the actual justification for the delete: the product must
      // still be absent. A resolving product here means it came back (restored, or the id was
      // reused) and the mapping is live again, so nothing should be removed.
      const product = await ctx.db.get(mapping.productId);
      if (product) {
        throw new Error(
          `Aborted: product ${target.expectedProductId} now exists, so mapping ${target.mappingId} is no longer dangling.`
        );
      }

      // collectionProducts.collectionId is a plain string in the schema, not a typed id, so it
      // has to be normalised before it can be read.
      const collectionRef = ctx.db.normalizeId("collections", mapping.collectionId);
      const collection = collectionRef ? await ctx.db.get(collectionRef) : null;
      const slug = collection ? (collection as any).slug : "(collection missing)";
      if (collection && slug !== target.collectionSlug) {
        throw new Error(
          `Aborted: mapping ${target.mappingId} belongs to collection "${slug}", expected "${target.collectionSlug}".`
        );
      }

      plan.push(`${target.collectionSlug}: drop mapping ${target.mappingId} -> deleted product ${target.expectedProductId}`);
    }

    if (apply) {
      for (const target of MAPPINGS) {
        await ctx.db.delete(target.mappingId as Id<"collectionProducts">);
      }
    }

    const after = apply ? (await ctx.db.query("collectionProducts").collect()).length : before;

    return {
      applied: apply,
      matched: MAPPINGS.length,
      deleted: apply ? MAPPINGS.length : 0,
      collectionProductsBefore: before,
      collectionProductsAfter: after,
      plan,
      note: apply
        ? "Only collectionProducts rows were deleted. No product, collection, order, inventory or block was read for writing."
        : 'Dry run. Re-run with "apply":true to write.',
    };
  },
});

/**
 * Migration to correct the "ethic-wear" typo in the categories table to "ethnic-wear" / "Ethnic Wear".
 */
export const fixEthicWearCategory = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const cat = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", "ethic-wear"))
      .first();

    if (!cat) {
      return { status: "already_fixed_or_missing" };
    }

    if (args.apply) {
      await ctx.db.patch(cat._id, {
        name: "Ethnic Wear",
        slug: "ethnic-wear",
      });
      return { status: "patched", id: cat._id, previousName: cat.name };
    }

    return { status: "dry_run", id: cat._id, name: cat.name };
  },
});


/**
 * Adds Notebooks under Accessories, for a partner's stationery listing.
 *
 * Filed under Accessories rather than a new top-level Stationery parent: the
 * parents stand for the marketplace's real verticals, and one notebook listing
 * does not earn a vertical of its own. Lifestyle, like Belts, Watches and Hair
 * Accessories, since there is no stationery vertical and lifestyle's defaults
 * already fit: free size, and no garment sizing or fabric fields.
 *
 * Idempotent. If `notebooks` already exists under Accessories it is reported
 * and left untouched, so re-running is a no-op. A `notebooks` slug anywhere
 * else aborts rather than guessing which one was meant.
 *
 * Touches the `categories` table only. No product is read, moved or
 * re-categorised, and no existing category is modified.
 *
 *   npx convex run --prod migrations:addNotebooksCategory
 *   npx convex run --prod migrations:addNotebooksCategory '{"apply":true}'
 *
 * Reversal: deactivate the created category from the admin categories screen.
 */
export const addNotebooksCategory = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const SPEC = {
      name:       "Notebooks",
      slug:       "notebooks",
      parentSlug: "accessories",
      vertical:   "lifestyle" as const,
    };

    const parent = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", SPEC.parentSlug))
      .first();
    if (!parent) throw new Error(`Aborted: no parent category with slug "${SPEC.parentSlug}".`);
    if (!parent.active) {
      throw new Error(`Aborted: parent "${parent.name}" (/${parent.slug}) is inactive.`);
    }
    if (parent.parentId) {
      throw new Error(`Aborted: "${parent.name}" is itself a subcategory; nesting is two levels deep.`);
    }

    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", SPEC.slug))
      .collect();
    if (existing.length > 1) {
      throw new Error(`Aborted: ${existing.length} categories already use the slug "${SPEC.slug}".`);
    }
    const clash = existing[0];
    if (clash) {
      if (clash.parentId !== parent._id) {
        throw new Error(
          `Aborted: slug "${SPEC.slug}" already belongs to "${clash.name}", which is not under ${parent.name}.`
        );
      }
      return {
        applied: false,
        status: "already_exists",
        id: clash._id,
        parentId: parent._id,
        active: clash.active,
        verticalType: clash.verticalType ?? null,
        categoriesCreated: 0,
        productChanges: 0,
        note: `"${clash.name}" (/${clash.slug}) already exists under ${parent.name}. Nothing to do.`,
      };
    }

    const all = await ctx.db.query("categories").collect();
    const sortOrder = all.reduce((max, c) => Math.max(max, c.sortOrder || 0), 0) + 1;

    const willCreate = {
      name:           SPEC.name,
      slug:           SPEC.slug,
      active:         true,
      sortOrder,
      // Off the homepage, like every other subcategory: the homepage block
      // filters on showOnHomepage with no level filter, so a child set true
      // renders beside the parents as though it were one.
      showOnHomepage: false,
      parentId:       parent._id,
      verticalType:   SPEC.vertical,
    };

    const id = apply
      ? await ctx.db.insert("categories", { ...willCreate, createdAt: Date.now() })
      : null;

    return {
      applied: apply,
      status: apply ? "created" : "dry_run",
      id,
      parent: { id: parent._id, name: parent.name, slug: parent.slug },
      willCreate,
      categoriesCreated: apply ? 1 : 0,
      productChanges: 0,
      note: apply
        ? "Category created. No product was read, moved or re-categorised."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});

/**
 * Adds Post Cards under Accessories, for the same stationery partner as
 * Notebooks.
 *
 * Same placement and vertical as addNotebooksCategory, for the same reasons: no
 * top-level Stationery parent for a handful of listings, and lifestyle's
 * defaults (free size, no garment fields) already fit a pack of cards. The slug
 * matches no sizing rule in packages/types/src/verticals.ts, so sizing resolves
 * to lifestyle's free size without a code change.
 *
 * Idempotent. If `post-cards` already exists under Accessories it is reported
 * and left untouched, so re-running is a no-op. A `post-cards` slug anywhere
 * else aborts rather than guessing which one was meant.
 *
 * Touches the `categories` table only. No product is read, moved or
 * re-categorised, and no existing category is modified.
 *
 *   npx convex run --prod migrations:addPostCardsCategory
 *   npx convex run --prod migrations:addPostCardsCategory '{"apply":true}'
 *
 * Reversal: deactivate the created category from the admin categories screen.
 */
export const addPostCardsCategory = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;

    const SPEC = {
      name:       "Post Cards",
      slug:       "post-cards",
      parentSlug: "accessories",
      vertical:   "lifestyle" as const,
    };

    const parent = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", SPEC.parentSlug))
      .first();
    if (!parent) throw new Error(`Aborted: no parent category with slug "${SPEC.parentSlug}".`);
    if (!parent.active) {
      throw new Error(`Aborted: parent "${parent.name}" (/${parent.slug}) is inactive.`);
    }
    if (parent.parentId) {
      throw new Error(`Aborted: "${parent.name}" is itself a subcategory; nesting is two levels deep.`);
    }

    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", SPEC.slug))
      .collect();
    if (existing.length > 1) {
      throw new Error(`Aborted: ${existing.length} categories already use the slug "${SPEC.slug}".`);
    }
    const clash = existing[0];
    if (clash) {
      if (clash.parentId !== parent._id) {
        throw new Error(
          `Aborted: slug "${SPEC.slug}" already belongs to "${clash.name}", which is not under ${parent.name}.`
        );
      }
      return {
        applied: false,
        status: "already_exists",
        id: clash._id,
        parentId: parent._id,
        active: clash.active,
        verticalType: clash.verticalType ?? null,
        categoriesCreated: 0,
        productChanges: 0,
        note: `"${clash.name}" (/${clash.slug}) already exists under ${parent.name}. Nothing to do.`,
      };
    }

    const all = await ctx.db.query("categories").collect();
    const sortOrder = all.reduce((max, c) => Math.max(max, c.sortOrder || 0), 0) + 1;

    const willCreate = {
      name:           SPEC.name,
      slug:           SPEC.slug,
      active:         true,
      sortOrder,
      // Off the homepage, like every other subcategory: the homepage block
      // filters on showOnHomepage with no level filter, so a child set true
      // renders beside the parents as though it were one.
      showOnHomepage: false,
      parentId:       parent._id,
      verticalType:   SPEC.vertical,
    };

    const id = apply
      ? await ctx.db.insert("categories", { ...willCreate, createdAt: Date.now() })
      : null;

    return {
      applied: apply,
      status: apply ? "created" : "dry_run",
      id,
      parent: { id: parent._id, name: parent.name, slug: parent.slug },
      willCreate,
      categoriesCreated: apply ? 1 : 0,
      productChanges: 0,
      note: apply
        ? "Category created. No product was read, moved or re-categorised."
        : "Dry run. Re-run with \"apply\":true to write.",
    };
  },
});
