// convex/categories.ts
// Queries and mutations to manage product discovery categories.

import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getPublicUrl } from "./media/api";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { validateUploadedFile } from "./lib/uploads";
import { ImageAsset, VerticalTypeValidator, SizeSystemValidator } from "./schema";
import {
  isProductGloballyEligible,
  resolveDeliverableBoutiqueIds,
} from "./lib/catalogEligibility";

// ─── HIERARCHY INVARIANTS ───────────────────────────────────────────────────
//
// The tree is deliberately capped at two levels: a top-level category and its
// children. Everything downstream assumes that shape — the seller picker offers
// "parent, then subcategory", the storefront groups a parent with its children,
// and getCatalogPage walks descendants on every parent-level browse. Allowing a
// third level would silently change all three.

const MAX_CATEGORY_DEPTH = 2;

/**
 * A slug is the category's public URL and the only key the storefront resolves
 * against. Two categories sharing one would make which of them a link opens a
 * matter of insertion order.
 */
async function assertSlugAvailable(
  ctx: { db: any },
  slug: string,
  exceptId?: Id<"categories">,
) {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) throw new Error("Slug is required.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    throw new Error(
      `Invalid slug "${slug}". Use lowercase letters, numbers and single hyphens, e.g. "party-wear".`,
    );
  }
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_slug", (q: any) => q.eq("slug", trimmed))
    .first();
  if (existing && existing._id !== exceptId) {
    throw new Error(
      `The slug "${trimmed}" is already used by the category "${existing.name}". Slugs must be unique.`,
    );
  }
  return trimmed;
}

/**
 * Validates a proposed parent for `childId` (undefined when creating).
 *
 * Rejects self-parenting, cycles, parents that are themselves children (which
 * would create a third level), and — when the category already has children of
 * its own — any attempt to demote it under another parent.
 */
async function assertValidParent(
  ctx: { db: any },
  parentId: Id<"categories"> | undefined,
  childId?: Id<"categories">,
) {
  if (!parentId) return;

  if (childId && parentId === childId) {
    throw new Error("A category cannot be its own parent.");
  }

  const parent = await ctx.db.get(parentId);
  if (!parent)
    throw new Error("The selected parent category no longer exists.");

  if (parent.parentId) {
    throw new Error(
      `"${parent.name}" is already a subcategory of another category. Categories nest at most ${MAX_CATEGORY_DEPTH} levels deep.`,
    );
  }

  if (childId) {
    const children = await ctx.db
      .query("categories")
      .withIndex("by_parentId", (q: any) => q.eq("parentId", childId))
      .collect();
    if (children.length > 0) {
      throw new Error(
        `This category has ${children.length} subcategor${children.length === 1 ? "y" : "ies"} of its own, so it cannot become a subcategory. Move or reassign its children first.`,
      );
    }
  }
}

/**
 * Fetch categories.
 * If onlyActive is true, returns active ones sorted by sortOrder.
 * Otherwise, returns all categories.
 */
export const getCategories = query({
  args: { onlyActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let categories;
    if (args.onlyActive) {
      categories = await ctx.db
        .query("categories")
        .withIndex("by_active_and_sortOrder", (q) => q.eq("active", true))
        .collect();
    } else {
      categories = await ctx.db.query("categories").collect();
    }

    return Promise.all(
      categories.map(async (cat) => {
        let imageUrl = cat.imageUrl || null;
        if (cat.imageStorageId) {
          if (typeof cat.imageStorageId === "object") {
            imageUrl = getPublicUrl(cat.imageStorageId as any);
          } else if (
            typeof cat.imageStorageId === "string" &&
            cat.imageStorageId.startsWith("http")
          ) {
            imageUrl = cat.imageStorageId;
          } else {
            try {
              imageUrl = await ctx.storage.getUrl(cat.imageStorageId as any);
            } catch (e) {
              console.error(
                "Failed to get url for storage id",
                cat.imageStorageId,
                e,
              );
            }
          }
        }
        let homepageImageUrl = cat.homepageImage || null;
        if (cat.homepageImage && !cat.homepageImage.startsWith("http")) {
          try {
            homepageImageUrl = await ctx.storage.getUrl(
              cat.homepageImage as any,
            );
          } catch (e) {
            console.error(
              "Failed to get url for homepage image",
              cat.homepageImage,
              e,
            );
          }
        }
        return {
          ...cat,
          imageUrl,
          homepageImageUrl,
        };
      }),
    );
  },
});

/**
 * Create a new category.
 * Admin-only mutation.
 */
export const createCategory = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    imageStorageId: v.optional(
      v.union(v.id("_storage"), v.string(), ImageAsset),
    ),
    imageUrl: v.optional(v.string()),
    homepageImage: v.optional(v.string()),
    homepageOrder: v.optional(v.number()),
    icon: v.optional(v.string()),
    active: v.boolean(),
    sortOrder: v.number(),
    featured: v.optional(v.boolean()),
    showOnHomepage: v.optional(v.boolean()),
    parentId: v.optional(v.id("categories")),
    isFreeSize: v.optional(v.boolean()),
    seoIntro: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    verticalType: v.optional(VerticalTypeValidator),
    sizeSystem: v.optional(SizeSystemValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const slug = await assertSlugAvailable(ctx, args.slug);
    await assertValidParent(ctx, args.parentId);

    if (
      args.imageStorageId &&
      typeof args.imageStorageId === "string" &&
      !args.imageStorageId.startsWith("http")
    ) {
      // Validate category image (max 5MB, MIME: jpeg/png/webp) (legacy storage IDs only)
      const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
      const maxImageBytes = 5 * 1024 * 1024;
      await validateUploadedFile(
        ctx,
        args.imageStorageId as any,
        undefined,
        allowedImageMimes,
        maxImageBytes,
      );
    }

    const categoryId = await ctx.db.insert("categories", {
      name: args.name,
      slug,
      imageStorageId: args.imageStorageId,
      imageUrl: args.imageUrl,
      homepageImage: args.homepageImage,
      homepageOrder: args.homepageOrder,
      icon: args.icon,
      active: args.active,
      sortOrder: args.sortOrder,
      featured: args.featured,
      showOnHomepage: args.showOnHomepage,
      parentId: args.parentId,
      isFreeSize: args.isFreeSize,
      seoIntro: args.seoIntro,
      seoDescription: args.seoDescription,
      verticalType: args.verticalType,
      sizeSystem: args.sizeSystem,
      createdAt: Date.now(),
    });
    return categoryId;
  },
});

/**
 * Update an existing category.
 * Admin-only mutation.
 */
export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    slug: v.string(),
    imageStorageId: v.optional(
      v.union(v.id("_storage"), v.string(), ImageAsset),
    ),
    imageUrl: v.optional(v.string()),
    homepageImage: v.optional(v.string()),
    homepageOrder: v.optional(v.number()),
    icon: v.optional(v.string()),
    active: v.boolean(),
    sortOrder: v.number(),
    featured: v.optional(v.boolean()),
    showOnHomepage: v.optional(v.boolean()),
    parentId: v.optional(v.id("categories")),
    isFreeSize: v.optional(v.boolean()),
    seoIntro: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    verticalType: v.optional(VerticalTypeValidator),
    sizeSystem: v.optional(SizeSystemValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const slug = await assertSlugAvailable(ctx, args.slug, args.id);
    await assertValidParent(ctx, args.parentId, args.id);

    if (
      args.imageStorageId &&
      typeof args.imageStorageId === "string" &&
      !args.imageStorageId.startsWith("http")
    ) {
      // Validate new category image if changed (legacy storage IDs only)
      const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
      const maxImageBytes = 5 * 1024 * 1024;
      await validateUploadedFile(
        ctx,
        args.imageStorageId as any,
        undefined,
        allowedImageMimes,
        maxImageBytes,
      );
    }

    const oldCategory = await ctx.db.get(args.id);
    if (!oldCategory) throw new Error("Category not found");

    // Clean up old image if it was replaced and it's a native storage ID
    if (
      args.imageStorageId &&
      oldCategory.imageStorageId &&
      oldCategory.imageStorageId !== args.imageStorageId
    ) {
      if (
        typeof oldCategory.imageStorageId === "string" &&
        !oldCategory.imageStorageId.startsWith("http")
      ) {
        try {
          await ctx.storage.delete(oldCategory.imageStorageId as any);
        } catch (e) {
          console.warn(
            `Failed to delete old storage id ${oldCategory.imageStorageId}`,
            e,
          );
        }
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name,
      slug,
      imageStorageId: args.imageStorageId,
      imageUrl: args.imageUrl,
      homepageImage: args.homepageImage,
      homepageOrder: args.homepageOrder,
      icon: args.icon,
      active: args.active,
      sortOrder: args.sortOrder,
      featured: args.featured,
      showOnHomepage: args.showOnHomepage,
      parentId: args.parentId,
      isFreeSize: args.isFreeSize,
      seoIntro: args.seoIntro,
      seoDescription: args.seoDescription,
      verticalType: args.verticalType,
      sizeSystem: args.sizeSystem,
    });
    return args.id;
  },
});

/**
 * Toggle category active status.
 * Admin-only mutation.
 */
export const toggleCategory = mutation({
  args: {
    id: v.id("categories"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.patch(args.id, {
      active: args.active,
    });
    return args.id;
  },
});

/**
 * Delete a category.
 * Admin-only mutation.
 */
export const deleteCategory = mutation({
  args: {
    id: v.id("categories"),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error("Category not found");

    // Deleting a parent would leave its children pointing at a missing row.
    // getCatalogPage resolves descendants by parentId, so those children would
    // still browse and list but could never be reached from their parent again.
    const children = await ctx.db
      .query("categories")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.id))
      .collect();
    if (children.length > 0) {
      throw new Error(
        `Cannot delete "${category.name}". ${children.length} subcategor${children.length === 1 ? "y belongs" : "ies belong"} to it: ${children.map((c) => c.name).join(", ")}. Move or delete those first.`,
      );
    }

    // Check if there are products in this category
    const products = await ctx.db
      .query("products")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.id))
      .collect();

    if (products.length > 0) {
      const activeCount = products.filter((p) => p.active).length;
      const totalCount = products.length;
      throw new Error(
        `Cannot delete category. ${totalCount} products currently belong to this category (${activeCount} active). Move or delete those products first.`,
      );
    }

    // Clean up associated image from storage if native
    if (
      category.imageStorageId &&
      typeof category.imageStorageId === "string" &&
      !category.imageStorageId.startsWith("http")
    ) {
      try {
        await ctx.storage.delete(category.imageStorageId as any);
      } catch (e) {
        console.warn(
          `Failed to delete storage id ${category.imageStorageId}, it may have already been deleted.`,
          e,
        );
      }
    }

    await ctx.db.delete(args.id);

    // Log category deletion
    await ctx.db.insert("auditLogs", {
      actorId: adminUser._id,
      actorRole: "admin",
      action: "category.deleted",
      entityType: "categories",
      entityId: args.id,
      before: JSON.stringify(category),
      metadata: JSON.stringify({
        name: category.name,
        slug: category.slug,
      }),
      createdAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Fetch a single category by its slug.
 */
export const getCategoryBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Category hierarchy with global and location-aware serviceable product counts.
 * Single source of truth for CategoryPillRail, MobileFilterDrawer, and CatalogEmptyState.
 *
 * Reuses canonical eligibility & serviceability rules so category counts and
 * actual product results in getCatalogPage never disagree.
 */
export const getCategoryHierarchy = query({
  args: {
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    boutiqueId: v.optional(v.id("boutiques")),
  },
  handler: async (ctx, args) => {
    // 1. Fetch active categories
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_active_and_sortOrder", (q) => q.eq("active", true))
      .collect();

    // 2. Fetch active products
    let activeProducts;
    if (args.boutiqueId) {
      activeProducts = await ctx.db
        .query("products")
        .withIndex("by_boutiqueId_active", (q) =>
          q.eq("boutiqueId", args.boutiqueId!).eq("active", true),
        )
        .collect();
    } else {
      activeProducts = await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }

    // 3. Fetch approved boutiques
    let approvedBoutiques;
    if (args.boutiqueId) {
      const b = await ctx.db.get(args.boutiqueId);
      approvedBoutiques = b && b.status === "APPROVED" ? [b] : [];
    } else {
      approvedBoutiques = await ctx.db
        .query("boutiques")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .collect();
    }
    const boutiqueMap = new Map<string, any>(
      approvedBoutiques.map((b) => [b._id, b]),
    );

    // 4. Resolve deliverable boutique IDs if user coordinates provided
    const hasUserCoords =
      args.userLat !== undefined &&
      args.userLat !== null &&
      args.userLng !== undefined &&
      args.userLng !== null &&
      !(args.userLat === 0 && args.userLng === 0);

    let deliverableBoutiqueIds: Set<string> | null = null;
    if (hasUserCoords) {
      deliverableBoutiqueIds = await resolveDeliverableBoutiqueIds(
        ctx,
        args.userLat!,
        args.userLng!,
        approvedBoutiques,
      );
    }

    // 5. Filter active products by canonical eligibility rules
    const now = Date.now();
    const eligibleProductsByCatId = new Map<
      string,
      { id: string; serviceable: boolean }[]
    >();

    let totalGlobalCount = 0;
    let totalServiceableCount = 0;

    for (const p of activeProducts) {
      const boutique = boutiqueMap.get(p.boutiqueId);
      const isEligible = isProductGloballyEligible(p, boutique, {
        isSpecificBoutique: !!args.boutiqueId,
        now,
      });
      if (!isEligible) continue;

      const serviceable = deliverableBoutiqueIds
        ? deliverableBoutiqueIds.has(p.boutiqueId)
        : true;

      totalGlobalCount++;
      if (serviceable) {
        totalServiceableCount++;
      }

      const catId = p.categoryId as string;
      let list = eligibleProductsByCatId.get(catId);
      if (!list) {
        list = [];
        eligibleProductsByCatId.set(catId, list);
      }
      list.push({ id: p._id, serviceable });
    }

    // 6. Build category tree
    const byOrder = (a: any, b: any) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);

    const roots = categories.filter((c) => !c.parentId).sort(byOrder);
    const childrenByParentId = new Map<string, any[]>();
    for (const cat of categories) {
      if (cat.parentId) {
        let list = childrenByParentId.get(cat.parentId);
        if (!list) {
          list = [];
          childrenByParentId.set(cat.parentId, list);
        }
        list.push(cat);
      }
    }

    const resultRoots = roots.map((root) => {
      const children = (childrenByParentId.get(root._id) || []).sort(byOrder);

      const formattedChildren = children.map((child) => {
        const childProducts = eligibleProductsByCatId.get(child._id) || [];
        const globalCount = childProducts.length;
        const serviceableCount = childProducts.filter(
          (p) => p.serviceable,
        ).length;

        return {
          _id: child._id,
          name: child.name,
          slug: child.slug,
          sortOrder: child.sortOrder,
          parentId: child.parentId,
          icon: child.icon,
          imageUrl: child.imageUrl,
          globalCount,
          serviceableCount,
          isComingSoon: globalCount === 0,
        };
      });

      const rootDirectProducts = eligibleProductsByCatId.get(root._id) || [];
      let rootGlobalCount = rootDirectProducts.length;
      let rootServiceableCount = rootDirectProducts.filter(
        (p) => p.serviceable,
      ).length;

      for (const child of formattedChildren) {
        rootGlobalCount += child.globalCount;
        rootServiceableCount += child.serviceableCount;
      }

      return {
        _id: root._id,
        name: root.name,
        slug: root.slug,
        sortOrder: root.sortOrder,
        icon: root.icon,
        imageUrl: root.imageUrl,
        globalCount: rootGlobalCount,
        serviceableCount: rootServiceableCount,
        isComingSoon: rootGlobalCount === 0,
        children: formattedChildren,
      };
    });

    return {
      roots: resultRoots,
      totalGlobalCount,
      totalServiceableCount,
    };
  },
});

/**
 * Seed or update the Bedsheet category with bed_linen sizing and proper attributes schema.
 */
export const seedBedsheetAttributes = mutation({
  args: {},
  handler: async (ctx) => {
    const bedsheet = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", "bedsheet"))
      .first();

    if (!bedsheet) {
      return { success: false, reason: "Bedsheet category not found" };
    }

    await ctx.db.patch(bedsheet._id, {
      sizeSystem: "bed_linen",
      isFreeSize: false,
    });

    // `fabric` is deliberately absent: the global Material picker in Step 4 now
    // shows bedsheet-specific options via MATERIAL_OPTIONS_BY_SLUG, so asking
    // again here would be redundant. Same for `careInstructions` — Care is a
    // mandatory global field.
    const bedsheetFields = [
      {
        key: "threadCount",
        label: "Thread Count",
        type: "number" as const,
        options: undefined,
        required: false,
        unit: "TC",
        helpText: "e.g. 180, 210, 300, 400",
      },
      {
        key: "sheetType",
        label: "Sheet Type",
        type: "select" as const,
        options: ["Flat", "Fitted (Elastic)", "Fitted with Flat Set"],
        required: true,
        unit: undefined,
        helpText: "Flat or fitted elastic sheet",
      },
      {
        key: "pillowCovers",
        label: "Pillow Covers Included",
        type: "select" as const,
        options: ["None", "1 Pillow Cover", "2 Pillow Covers", "4 Pillow Covers"],
        required: true,
        unit: undefined,
        helpText: "Number of pillow covers included in pack",
      },
      {
        key: "dimensions",
        label: "Dimensions",
        type: "text" as const,
        options: undefined,
        required: false,
        unit: undefined,
        helpText: "e.g. 90 x 100 inches / 228 x 254 cm",
      },
      {
        key: "pattern",
        label: "Pattern / Print",
        type: "select" as const,
        options: ["Solid / Plain", "Floral", "Geometric", "Striped", "Abstract", "Traditional / Ethnic", "Polka Dots", "Embroidered"],
        required: false,
        unit: undefined,
        helpText: undefined,
      },
    ];

    const existing = await ctx.db
      .query("attributeSets")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", bedsheet._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fields: bedsheetFields,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("attributeSets", {
        categoryId: bedsheet._id,
        fields: bedsheetFields,
        updatedAt: Date.now(),
      });
    }

    return {
      success: true,
      categoryId: bedsheet._id,
      fieldCount: bedsheetFields.length,
      sizeSystem: "bed_linen",
    };
  },
});
