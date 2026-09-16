// convex/products.ts
// Product CRUD and queries for the Boutique Portal and Customer App.

import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getMyBoutique, requireRole, getAuthenticatedUser, getCurrentUserOrNull } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import { validateUploadedFile } from "./lib/uploads";
import { resolveBoutiqueStatus } from "./lib/boutiqueStatus";
import { getBoutiqueStatus } from "./shared/boutiqueStatus";
import { extractR2ObjectKeys } from "./media/api";
import {
  toCatalogCard,
  applyCatalogFilters,
  applyCatalogSort,
  DEFAULT_SORT,
  displayPricing,
} from "./shared/catalog";
import { updateBoutiqueProductCount } from "./boutiques";
import { normalizeEmail } from "./users";
import { resolveDeliveryLabel, resolveDeliveryCountdown } from "./lib/deliveryEta";
import { resolveDiscoveryContext } from "./lib/discoveryContext";
import { rankProducts } from "./lib/productSearch";
import {
  getAllowedSpecKeys,
  getVerticalConfig,
  resolveVerticalTypeForCategory,
  validateAndCleanProductDetails,
  validateProductDetailsForCategory,
} from "./lib/verticals";
import { internal } from "./_generated/api";
import {
  getPlatformMarkupRate,
  getPlatformSettings,
  getPlatformConfig,
  calculateProductPricing,
  calculateAllInclusivePrice,
  calculateAllInclusivePricePaise,
  DEFAULT_COMMISSION_TIERS,
  DEFAULT_HANDLING_CHARGE_PAISE,
  DEFAULT_PLATFORM_FEE_PAISE,
  DEFAULT_GST_RATE_PERCENT,
  PlatformConfig,
} from "./pricingService";



import { checkRateLimit } from "./lib/rateLimit";
import { getPublicUrl } from "./media/api";
import { haversineKm, resolveServiceability, resolveBoutiqueCoords } from "./lib/serviceability";
import { ImageAsset } from "./schema";
import { triggerNotification } from "./lib/notifications";

// Mirrors the seller-facing photo step's requirement (ProductForm.tsx) so the
// rule holds even when a client bypasses the wizard and calls the mutation directly.
const MIN_PRODUCT_IMAGES = 3;
const MAX_PRODUCT_IMAGES = 5;

// Helper to generate unique slugs with robust regex formatting
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rand = Math.random().toString(36).substring(2, 6);
  return `${base}-${rand}`;
}

// Helper to get a boutique's merchant tier — pure O(1) field read.
// merchantTier is always set to "Bronze" on boutique creation and backfilled by migration.
// The actual tier promotion is computed by the daily performance_recalc cron job.
async function getBoutiqueMerchantTier(_ctx: any, boutique: any): Promise<"Bronze" | "Silver" | "Gold" | "Elite"> {
  if (!boutique) return "Bronze";
  return boutique.merchantTier ?? "Bronze";
}

// Helper to enrich products in batch (resolves N+1 query patterns)
export async function enrichProducts(ctx: any, products: any[], resolveAllImages: boolean = false) {
  if (products.length === 0) return [];

  const categoryIds = Array.from(new Set(products.map(p => p.categoryId)));
  const boutiqueIds = Array.from(new Set(products.map(p => p.boutiqueId)));

  const [categories, boutiques] = await Promise.all([
    Promise.all(categoryIds.map(id => ctx.db.get(id))),
    Promise.all(boutiqueIds.map(id => ctx.db.get(id)))
  ]);

  const categoryMap = new Map(categories.filter(Boolean).map(c => [c!._id, c]));
  const boutiqueMap = new Map(boutiques.filter(Boolean).map(b => [b!._id, b]));

  // Batch resolve merchantTier and statusRes per unique boutique
  const boutiqueEnrichedMap = new Map();
  await Promise.all(
    boutiques.filter(Boolean).map(async (boutique) => {
      const merchantTier = await getBoutiqueMerchantTier(ctx, boutique);
      const statusRes = await resolveBoutiqueStatus(ctx.db, boutique);
      boutiqueEnrichedMap.set(boutique!._id.toString(), {
        merchantTier,
        statusRes
      });
    })
  );

  return await Promise.all(
    products.map(async (product) => {
      // Safely handle missing/empty images array across products
      const rawImages: any[] = Array.isArray(product.images)
        ? product.images
        : product.imageUrl
        ? [product.imageUrl]
        : [];
      const imagesToResolve = resolveAllImages
        ? rawImages
        : rawImages.length > 0
        ? [rawImages[0]]
        : [];

      const resolvedImages = await Promise.all(
        imagesToResolve.map(async (imgId: any) => {
          if (!imgId) return "";
          if (typeof imgId === "object" && imgId.objectKey) {
            return getPublicUrl(imgId, "pdp"); // Provide PDP variant for products
          }
          if (typeof imgId === "string" && imgId.startsWith("http")) return imgId;
          try {
            const url = await ctx.storage.getUrl(imgId);
            return url || "";
          } catch {
            return imgId;
          }
        })
      );

      const category = categoryMap.get(product.categoryId);
      const boutique = boutiqueMap.get(product.boutiqueId);

      const imageUrl = resolvedImages[0] || product.imageUrl || "";
      const imageUrls = resolveAllImages ? resolvedImages : [imageUrl].filter(Boolean);

      const enrichedData = product.boutiqueId ? boutiqueEnrichedMap.get(product.boutiqueId.toString()) : null;
      const merchantTier = enrichedData?.merchantTier || "Bronze";
      const statusRes = enrichedData?.statusRes || null;

      const logoUrl = boutique?.logoUrl ? getPublicUrl(boutique.logoUrl, "thumbnail") : undefined;
      const isReturnsAccepted = product.returnsAccepted !== undefined
        ? product.returnsAccepted
        : (boutique?.returnsAcceptedDefault !== false);

      return {
        ...product,
        rating: product.averageRating,
        reviewCount: product.reviewCount,
        // Delivery promise resolved server-side against this boutique's real hours and prep time
        // (see convex/lib/deliveryEta.ts). No distance is available on this path, so it falls back
        // to prep time; the homepage path adds a measured ETA via OperationsService.
        deliveryLabel: resolveDeliveryLabel({
          sameDayEligible: product.sameDayEligible,
          boutique: boutique
            ? {
                openingTime: boutique.openingTime,
                closingTime: boutique.closingTime,
                weeklyClosedDays: boutique.weeklyClosedDays,
                holidayDates: boutique.holidayDates,
                prepTimeMinutes: boutique.prepTimeMinutes,
                isAcceptingOrders: statusRes ? statusRes.isAcceptingOrders : undefined,
              }
            : null,
        }),
        // Structured timestamps for the PDP/QuickView live countdown pill. Same window logic as
        // deliveryLabel above — kept separate since the pill needs real epoch ms, not a string.
        deliveryCountdown: resolveDeliveryCountdown({
          sameDayEligible: product.sameDayEligible,
          boutique: boutique
            ? {
                openingTime: boutique.openingTime,
                closingTime: boutique.closingTime,
                weeklyClosedDays: boutique.weeklyClosedDays,
                holidayDates: boutique.holidayDates,
                prepTimeMinutes: boutique.prepTimeMinutes,
                isAcceptingOrders: statusRes ? statusRes.isAcceptingOrders : undefined,
              }
            : null,
        }),
        returnsAccepted: isReturnsAccepted,
        imageStorageIds: product.images,
        images: imageUrls.filter(Boolean),
        imageUrl,
        imageUrls,
        categoryName: category?.name || "Uncategorized",
        boutiqueName: boutique?.boutiqueName || "Unknown Boutique",
        boutique: boutique ? {
          id: boutique._id,
          name: boutique.boutiqueName,
          slug: boutique.slug,
          city: boutique.addressDetails?.city || "Kochi",
          rating: boutique.averageRating,
          reviewCount: boutique.reviewCount,
          verified: boutique.status === "APPROVED",
          sameDayDelivery: product.sameDayEligible,
          latitude: boutique.latitude,
          longitude: boutique.longitude,
          deliveryRadiusKm: boutique.deliveryRadiusKm,
          merchantTier,
          trustTier: merchantTier,
          storeStatus: statusRes ? statusRes.resolvedStatus : "closed",
          isAcceptingOrders: statusRes ? statusRes.isAcceptingOrders : false,
          storeMessage: boutique.storeMessage,
          pauseReason: boutique.pauseReason,
          closedUntil: boutique.closedUntil,
          prepTimeMinutes: boutique.prepTimeMinutes,
          openingTime: boutique.openingTime,
          closingTime: boutique.closingTime,
          weeklyClosedDays: boutique.weeklyClosedDays,
          holidayDates: boutique.holidayDates,
          description: boutique.description || "",
          ownerName: boutique.ownerName || "",
          logoUrl,
          returnsAcceptedDefault: boutique.returnsAcceptedDefault !== false,
        } : null,
      };
    })
  );
}

// Single-item wrapper for backward compatibility
async function enrichProduct(ctx: any, product: any) {
  const enriched = await enrichProducts(ctx, [product], true);
  return enriched[0];
}



/**
 * Computes product catalog content quality score (0-100) and details.
 */
export function getProductQualityDetails(
  product: any,
  verticalTypeOverride?: string | null
) {
  // Records written before verticals existed carry no verticalType and resolve
  // to apparel, whose rules below reproduce the previous hardcoded scoring
  // exactly — same fields, same points, same order, same wording.
  const config = getVerticalConfig(verticalTypeOverride ?? product?.verticalType);
  const missing: string[] = [];
  const gains: Array<{ field: string; points: number; label: string }> = [];
  let score = 0;

  // 1. Cover Image (15 pts)
  if (product.images && product.images.length >= 1) {
    score += 15;
  } else {
    missing.push("Add a cover image");
    gains.push({ field: "coverImage", points: 15, label: "Add a cover image (+15)" });
  }

  // 2. 3+ Images (20 pts)
  if (product.images && product.images.length >= 3) {
    score += 20;
  } else {
    missing.push("Add at least 3 photos");
    gains.push({ field: "images3", points: 20, label: "Add at least 3 photos (+20)" });
  }

  // 3. Description (15 pts)
  if (product.description && product.description.trim().length >= 20) {
    score += 15;
  } else {
    missing.push("Add a descriptive description");
    gains.push({ field: "description", points: 15, label: "Add a descriptive description (+15)" });
  }

  // 4. Vertical-specific fields (50 pts, distributed by the vertical registry).
  // `source` decides where the value is read from: a top-level product column,
  // or a key inside `products.details`.
  for (const rule of config.quality.scoredFields) {
    const raw =
      rule.source === "column"
        ? product?.[rule.field]
        : product?.details?.[rule.field];
    const present = typeof raw === "string" ? raw.trim() !== "" : Boolean(raw);

    if (present) {
      score += rule.points;
    } else {
      missing.push(rule.missingLabel);
      gains.push({ field: rule.field, points: rule.points, label: rule.label });
    }
  }

  return {
    score,
    canBeFeatured: score >= 70,
    missing,
    gains,
  };
}

/**
 * Public query to get a product's content quality details.
 */
export const getProductQuality = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    return getProductQualityDetails(product);
  },
});

/**
 * Helper to validate live product quality constraints.
 */
async function validateProductQuality(
  ctx: any,
  args: {
    active: boolean;
    featured: boolean;
    images: any[];
    description: string;
    price: number;
    discountPrice?: number;
    categoryId: any;
    sizes: string[];
    stockBySize: Record<string, number>;
    measurementMatrix?: Array<{ size: string; chest: string; waist: string; shoulder: string; length: string }>;
    material?: string;
    materialType?: string;
    care?: string;
    origin?: string;
    fitNote?: string;
    story?: string;
    occasion?: string;
    fitRecommendation?: "runs_small" | "true_to_size" | "runs_large";
    silhouette?: "slim_fit" | "regular_fit" | "relaxed_fit" | "oversized" | "skinny_fit" | "straight_fit" | "tapered_fit" | "wide_leg" | "bootcut";
    details?: Record<string, string>;
  },
  existingImages?: string[], // Pre-approved images already stored in the product record (e.g. from CSV import)
  // The product's vertical. Mutation args carry no verticalType of their own, so
  // the caller passes the resolved value; without it a non-apparel product would
  // be scored against apparel rules at the featuring gate.
  verticalType?: string | null
) {
  // Mutation Guard: Reject resolved HTTP/HTTPS URLs inside mutations
  // Exception: images that already exist in the product's database record are pre-approved
  // (covers CSV-imported products with external URLs that haven't been re-uploaded yet)
  const preApproved = new Set<string>();
  (existingImages ?? []).forEach((img: any) => {
    if (typeof img === "string") {
      preApproved.add(img);
    } else if (img && typeof img === "object") {
      if (img.objectKey) preApproved.add(img.objectKey);
      if (img.assetId) preApproved.add(img.assetId);
      if (img.variants?.card) preApproved.add(img.variants.card);
      if (img.variants?.pdp) preApproved.add(img.variants.pdp);
      if (img.variants?.thumbnail) preApproved.add(img.variants.thumbnail);
      if (img.variants?.zoom) preApproved.add(img.variants.zoom);
    }
  });

  const containsNewUrls = args.images.some((img: any) => {
    if (typeof img !== "string") return false;
    if (!img.startsWith("http://") && !img.startsWith("https://")) return false;
    if (preApproved.has(img)) return false;
    if (
      img.includes("unsplash.com") ||
      // Canonical public image domain. Without this, product images served from
      // the CDN would be treated as untrusted third-party URLs.
      img.includes("cdn.hivenow.in") ||
      // Legacy development endpoint — still trusted so rows written before the
      // custom domain went live keep validating.
      img.includes(".r2.dev") ||
      img.includes(".cloudflarestorage.com") ||
      img.includes(".convex.cloud") ||
      img.includes(".convex.site")
    ) {
      return false;
    }
    return true;
  });

  if (containsNewUrls) {
    throw new Error(
      "Security Exception: Expected raw Convex storage IDs or Cloudflare R2 assets for product images, but received unsupported external URLs. Ensure you are passing valid storage references."
    );
  }

  // 1. Enforce hard operational blocks first (regardless of draft/live status)
  if (args.price <= 0) {
    throw new Error("Price must be greater than 0 before saving.");
  }
  if (args.discountPrice !== undefined) {
    if (args.discountPrice <= 0) {
      throw new Error("Discount price must be greater than 0.");
    }
    if (args.discountPrice >= args.price) {
      throw new Error("Discount price must be less than regular price.");
    }
  }

  // 2. Drafts are allowed without further content quality checks
  if (!args.active) return;

  // 3. Hard blocks for active (live) products
  if (args.images.length === 0) {
    throw new Error("At least one cover photo is required for active products.");
  }
  if (!args.description || args.description.trim() === "") {
    throw new Error("Product description is required for active products.");
  }
  const totalStock = Object.values(args.stockBySize).reduce((sum, val) => sum + val, 0);
  if (totalStock <= 0) {
    throw new Error("Total stock must be greater than 0 before going live.");
  }

  // 4. Validate featuring gate (Featured products must have a quality score of >= 70%)
  const quality = getProductQualityDetails(args, verticalType);
  if (args.featured && !quality.canBeFeatured) {
    throw new Error(
      `Product cannot be featured. Minimum content quality score of 70% required (current score: ${quality.score}%). Please complete more details (e.g. size charts, material details, care instructions, or story).`
    );
  }
}

/**
 * Create a new product.
 */
export const createProduct = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    categoryId: v.union(v.id("categories"), v.string()),
    price: v.number(),
    discountPrice: v.optional(v.number()),
    mrp: v.optional(v.number()),
    compareAtPrice: v.optional(v.number()),
    images: v.array(v.union(v.string(), ImageAsset)), // Storage IDs, URLs, or ImageAsset
    sizes: v.array(v.string()),
    stockBySize: v.record(v.string(), v.number()),
    // Retained as optional for older clients; the value is ignored — Hive fulfils every product
    // through Porter under the platform-wide 90-minute promise, so this is never a per-item choice.
    sameDayEligible: v.optional(v.boolean()),
    featured: v.boolean(),
    active: v.boolean(),
    measurementMatrix: v.optional(v.array(v.object({
                         size: v.string(),
                         chest: v.string(),
                         waist: v.string(),
                         shoulder: v.string(),
                         length: v.string(),
                       }))),
    material: v.optional(v.string()),
    materialType: v.optional(v.string()),
    care: v.optional(v.string()),
    origin: v.optional(v.string()),
    fitNote: v.optional(v.string()),
    story: v.optional(v.string()),
    occasion: v.optional(v.string()),
    details: v.optional(v.record(v.string(), v.string())),
    fitRecommendation: v.optional(v.union(
                         v.literal("runs_small"),
                         v.literal("true_to_size"),
                         v.literal("runs_large")
                       )),
    silhouette: v.optional(v.union(
                         v.literal("slim_fit"),
                         v.literal("regular_fit"),
                         v.literal("relaxed_fit"),
                         v.literal("oversized"),
                         v.literal("skinny_fit"),
                         v.literal("straight_fit"),
                         v.literal("tapered_fit"),
                         v.literal("wide_leg"),
                         v.literal("bootcut")
                       )),
    returnsAccepted: v.optional(v.boolean()),
    approvalStatus: v.optional(v.string()),
    photoSource: v.optional(v.union(v.literal("in_store"), v.literal("ai_enhanced"))),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);

    // Resolve categoryId, which older clients may send as a slug or a name.
    //
    // An unmatched value used to fall through to allCategories[0], filing the
    // product under whichever category sorted first and reporting success. A
    // category that cannot be resolved is a caller error, not a default.
    let resolvedCategoryId: any = args.categoryId;
    const allCategories = await ctx.db.query("categories").collect();
    if (typeof args.categoryId === "string") {
      const searchCat = args.categoryId.toLowerCase();
      const matched = allCategories.find(
        (c: any) => c._id === args.categoryId || c.slug === args.categoryId || (c.name ? c.name.toLowerCase() : "") === searchCat
      );
      if (!matched) {
        throw new Error(
          `Unknown category "${args.categoryId}". Choose a category from the list before publishing.`
        );
      }
      resolvedCategoryId = matched._id;
    }

    // Snapshot the vertical from the category being filed under. Resolved once,
    // here, and never recomputed on later edits.
    const verticalType = await resolveVerticalTypeForCategory(ctx.db, resolvedCategoryId);

    // Validate quality gate if active
    await validateProductQuality(ctx, args, undefined, verticalType);

    // Trim and drop empty values; strictly reject unrecognized specification keys.
    const cleanedDetails: Record<string, string> = args.details
      ? ((await validateProductDetailsForCategory(
          ctx.db,
          resolvedCategoryId,
          args.details,
          verticalType
        )) ?? {})
      : {};

    if (args.images.length < MIN_PRODUCT_IMAGES || args.images.length > MAX_PRODUCT_IMAGES) {
      throw new Error(
        `Please upload between ${MIN_PRODUCT_IMAGES} and ${MAX_PRODUCT_IMAGES} photos (got ${args.images.length}).`
      );
    }

    // Validate images in parallel (max 5MB, MIME: jpeg/png/webp)
    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxImageBytes = 5 * 1024 * 1024;
    await Promise.all(
      args.images.map((img: any) =>
        validateUploadedFile(ctx, img, undefined, allowedImageMimes, maxImageBytes)
      )
    );

    const slug = generateSlug(args.name);
    const now = Date.now();

    for (const [size, qty] of Object.entries(args.stockBySize)) {
      if (qty < 0) {
        throw new Error(`Stock level for size ${size} cannot be negative.`);
      }
    }
    const totalStock = Object.values(args.stockBySize).reduce((sum, val) => sum + val, 0);
    let active = args.active;
    let autoDeactivatedBecauseOutOfStock = false;
    if (totalStock === 0) {
      active = false;
      autoDeactivatedBecauseOutOfStock = true;
    }

    const merchantTier = boutique.merchantTier || "Bronze";
    const approvalStatus = active 
      ? (merchantTier === "Bronze" ? "pending" : "approved")
      : undefined;

    let hasPrimary = false;
    const sortedImages = [...args.images].sort((a: any, b: any) => {
      const orderA = typeof a === "object" ? (a.displayOrder ?? 999) : 999;
      const orderB = typeof b === "object" ? (b.displayOrder ?? 999) : 999;
      return orderA - orderB;
    });

    args.images = sortedImages.map((img: any) => {
      if (typeof img === "string") return img;
      let role = img.imageRole;
      if (role === "PRIMARY") {
        if (hasPrimary) {
          role = "OTHER"; // Only first wins
        } else {
          hasPrimary = true;
        }
      }
      return { ...img, imageRole: role };
    });

    if (!hasPrimary && args.images.length > 0) {
      const firstObjIndex = args.images.findIndex((img: any) => typeof img === "object");
      if (firstObjIndex !== -1) {
        (args.images[firstObjIndex] as any).imageRole = "PRIMARY";
      } else if (args.images.length > 0) {
        // If no object with imageRole exists, we force the first string as "PRIMARY" is not possible.
        // Assuming string images are primary by default if no objects exist.
      }
    }

    const config = await getPlatformConfig(ctx);

    // Storefront price = seller base price (in paise) + platform charges & GST (in paise) (All-inclusive display)
    const customerPrice = calculateAllInclusivePricePaise(args.price, (boutique as any)?.pricingTier || "bronze", config);
    const customerDiscountPrice = args.discountPrice ? calculateAllInclusivePricePaise(args.discountPrice, (boutique as any)?.pricingTier || "bronze", config) : undefined;




    const productId = await ctx.db.insert("products", {
      boutiqueId: boutique._id,
      name: args.name,
      slug,
      description: args.description,
      categoryId: resolvedCategoryId as any,
      verticalType,
      photoSource: args.photoSource,
      basePrice: args.price,
      price: customerPrice,
      baseDiscountPrice: args.discountPrice,
      discountPrice: customerDiscountPrice,
      mrp: args.mrp ?? args.compareAtPrice,
      compareAtPrice: args.compareAtPrice ?? args.mrp,
      images: args.images,
      sizes: args.sizes,
      stockBySize: args.stockBySize,
      sameDayEligible: true, // platform-wide Porter 90-min promise, not a per-product toggle
      featured: args.featured,
      active,
      autoDeactivatedBecauseOutOfStock,
      measurementMatrix: args.measurementMatrix,
      material: args.material,
      materialType: args.materialType,
      care: args.care,
      origin: args.origin,
      fitNote: args.fitNote,
      story: args.story,
      occasion: args.occasion,
      details: args.details ? cleanedDetails : undefined,
      fitRecommendation: args.fitRecommendation,
      silhouette: args.silhouette,
      createdAt: now,
      updatedAt: now,
      approvalStatus,
    });

    // Automatically log the initial stock movement for each size
    for (const [size, qty] of Object.entries(args.stockBySize)) {
      if (qty <= 0) continue;
      await ctx.db.insert("inventoryMovements", {
        productId,
        boutiqueId: boutique._id,
        size,
        beforeQty: 0,
        afterQty: qty,
        adjustmentQty: qty,
        reason: "initial_stock",
        source: "creation",
        createdBy: user._id,
        createdAt: now,
      });
    }

    await updateBoutiqueProductCount(ctx, boutique._id);

    // Trigger ops Slack alert if product is pending approval
    if (approvalStatus === "pending") {
      const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
      if (superadmin) {
        const catDoc = await ctx.db.get(resolvedCategoryId);
        await triggerNotification(ctx, superadmin._id, "slack", "product_pending_approval", "product", productId, JSON.stringify({
          productName: args.name,
          boutiqueName: boutique.boutiqueName || boutique.name || "Boutique",
          price: customerPrice,
          category: (catDoc as any)?.name || undefined,
        }));
      }
    }

    return productId;
  },
});

// Helper to check if an image is shared by other products in the same boutique
async function isImageShared(ctx: any, boutiqueId: any, excludeProductId: any, imgId: string): Promise<boolean> {
  const siblingProducts = await ctx.db
    .query("products")
    .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutiqueId))
    .collect();
  
  return siblingProducts.some((p: any) => 
    p._id !== excludeProductId && 
    p.images && 
    p.images.includes(imgId)
  );
}

/**
 * Update an existing product.
 */
export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.string(),
    description: v.string(),
    categoryId: v.union(v.id("categories"), v.string()),
    price: v.number(),
    discountPrice: v.optional(v.number()),
    mrp: v.optional(v.number()),
    compareAtPrice: v.optional(v.number()),
    images: v.array(v.union(v.string(), ImageAsset)),
    sizes: v.array(v.string()),
    stockBySize: v.record(v.string(), v.number()),
    // Retained as optional for older clients; the value is ignored — Hive fulfils every product
    // through Porter under the platform-wide 90-minute promise, so this is never a per-item choice.
    sameDayEligible: v.optional(v.boolean()),
    featured: v.boolean(),
    active: v.boolean(),
    measurementMatrix: v.optional(v.array(v.object({
                         size: v.string(),
                         chest: v.string(),
                         waist: v.string(),
                         shoulder: v.string(),
                         length: v.string(),
                       }))),
    material: v.optional(v.string()),
    materialType: v.optional(v.string()),
    care: v.optional(v.string()),
    origin: v.optional(v.string()),
    fitNote: v.optional(v.string()),
    story: v.optional(v.string()),
    occasion: v.optional(v.string()),
    details: v.optional(v.record(v.string(), v.string())),
    fitRecommendation: v.optional(v.union(
                         v.literal("runs_small"),
                         v.literal("true_to_size"),
                         v.literal("runs_large")
                       )),
    silhouette: v.optional(v.union(
                         v.literal("slim_fit"),
                         v.literal("regular_fit"),
                         v.literal("relaxed_fit"),
                         v.literal("oversized"),
                         v.literal("skinny_fit"),
                         v.literal("straight_fit"),
                         v.literal("tapered_fit"),
                         v.literal("wide_leg"),
                         v.literal("bootcut")
                       )),
    returnsAccepted: v.optional(v.boolean()),
    approvalStatus: v.optional(v.string()),
    photoSource: v.optional(v.union(v.literal("in_store"), v.literal("ai_enhanced"))),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);
    const product = await ctx.db.get(args.id);
    if (!product || product.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized: Product does not belong to your boutique.");
    }

    // The product's vertical is a snapshot taken at creation. It is read here,
    // never recomputed — updateProduct can change categoryId, and that must not
    // retroactively change how the product's specifications validate or how its
    // quality is scored.
    const verticalType = product.verticalType;

    // Trim and drop empty values; strictly reject unrecognized specification keys.
    const cleanedDetails: Record<string, string> | undefined =
      args.details !== undefined
        ? await validateProductDetailsForCategory(
            ctx.db,
            (args.categoryId ?? product.categoryId) as Id<"categories">,
            args.details,
            verticalType
          )
        : undefined;

    // Validate quality gate if active — pass existing images to skip the URL guard for pre-existing URLs
    await validateProductQuality(ctx, args, product.images as any, verticalType);

    if (args.images.length < MIN_PRODUCT_IMAGES || args.images.length > MAX_PRODUCT_IMAGES) {
      throw new Error(
        `Please upload between ${MIN_PRODUCT_IMAGES} and ${MAX_PRODUCT_IMAGES} photos (got ${args.images.length}).`
      );
    }

    // Validate images in parallel (max 5MB, MIME: jpeg/png/webp)
    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxImageBytes = 5 * 1024 * 1024;
    await Promise.all(
      args.images.map((img: any) =>
        validateUploadedFile(ctx, img, undefined, allowedImageMimes, maxImageBytes)
      )
    );

    // Clean up replaced images from storage if necessary and they are not shared
    const removedImages = product.images.filter(img => !args.images.includes(img));
    for (const imgId of removedImages) {
      if (typeof imgId === "string" && !imgId.startsWith("http") && !imgId.includes("/")) {
        try {
          const shared = await isImageShared(ctx, boutique._id, product._id, imgId as string);
          if (!shared) {
            await ctx.storage.delete(imgId as any);
          }
        } catch (e) {
          console.error("Failed to delete storage file:", imgId, e);
        }
      }
    }

    for (const [size, qty] of Object.entries(args.stockBySize)) {
      if (qty < 0) {
        throw new Error(`Stock level for size ${size} cannot be negative.`);
      }
    }

    const currentStockBySize = product.stockBySize || {};
    const now = Date.now();
    const bulkMovementId = `product_update_${now}`;

    // Loop through the new stockBySize map and find diffs
    const allSizes = Array.from(new Set([...Object.keys(currentStockBySize), ...Object.keys(args.stockBySize)]));

    for (const size of allSizes) {
      const beforeQty = currentStockBySize[size] ?? 0;
      const afterQty = args.stockBySize[size] ?? 0;
      const adjustmentQty = afterQty - beforeQty;

      if (adjustmentQty === 0) continue;

      await ctx.db.insert("inventoryMovements", {
        productId: product._id,
        boutiqueId: boutique._id,
        size,
        beforeQty,
        afterQty,
        adjustmentQty,
        reason: "stock_recount",
        source: "manual",
        createdBy: user._id,
        bulkMovementId,
        createdAt: now,
      });
    }

    const beforeTotalStock = Object.values(currentStockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const totalStock = Object.values(args.stockBySize).reduce((sum, val) => sum + val, 0);
    let active = args.active;
    let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

    if (totalStock === 0) {
      active = false;
      autoDeactivatedBecauseOutOfStock = true;
    } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
      active = true;
      autoDeactivatedBecauseOutOfStock = false;
    } else if (totalStock > 0) {
      autoDeactivatedBecauseOutOfStock = false;
    }

    // Safety Guard: Current merchant tier always wins on edit.
    // If the merchant is Bronze and the final product state is active, it goes back to pending.
    // If the merchant is Silver+ and active, it is auto-approved.
    // If inactive (draft), approvalStatus is set to undefined to bypass queues.
    const merchantTier = boutique.merchantTier || "Bronze";
    const approvalStatus = active 
      ? (merchantTier === "Bronze" ? "pending" : "approved")
      : undefined;

    const config = await getPlatformConfig(ctx);

    // Storefront price = seller base price (in paise) + platform charges & GST (in paise) (All-inclusive display)
    const customerPrice = calculateAllInclusivePricePaise(args.price, (boutique as any)?.pricingTier || "bronze", config);
    const customerDiscountPrice = args.discountPrice ? calculateAllInclusivePricePaise(args.discountPrice, (boutique as any)?.pricingTier || "bronze", config) : undefined;




    // Resolve categoryId if passed as slug or name string
    let resolvedCategoryId: any = args.categoryId;
    const allCategories = await ctx.db.query("categories").collect();
    if (allCategories.length > 0 && typeof args.categoryId === "string") {
      const searchCat = args.categoryId.toLowerCase();
      const matched = allCategories.find(
        (c: any) => c._id === args.categoryId || c.slug === args.categoryId || (c.name ? c.name.toLowerCase() : "") === searchCat
      );
      resolvedCategoryId = matched ? matched._id : (allCategories[0]?._id as any);
    }

    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      categoryId: resolvedCategoryId as any,
      basePrice: args.price,
      price: customerPrice,
      baseDiscountPrice: args.discountPrice,
      discountPrice: customerDiscountPrice,
      mrp: args.mrp ?? args.compareAtPrice,
      compareAtPrice: args.compareAtPrice ?? args.mrp,
      images: args.images,
      photoSource: args.photoSource,
      sizes: args.sizes,
      stockBySize: args.stockBySize,
      sameDayEligible: true, // platform-wide Porter 90-min promise, not a per-product toggle
      featured: args.featured,
      active,
      autoDeactivatedBecauseOutOfStock,
      measurementMatrix: args.measurementMatrix,
      material: args.material,
      materialType: args.materialType,
      care: args.care,
      origin: args.origin,
      fitNote: args.fitNote,
      story: args.story,
      occasion: args.occasion,
      ...(cleanedDetails !== undefined ? { details: cleanedDetails } : {}),
      fitRecommendation: args.fitRecommendation,
      silhouette: args.silhouette,
      updatedAt: now,
      approvalStatus,
    });

    await updateBoutiqueProductCount(ctx, boutique._id);

    // Trigger ops Slack alert if edited product is pending approval
    if (approvalStatus === "pending") {
      let superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
      if (!superadmin) {
        superadmin = await ctx.db.query("users").first();
      }
      if (superadmin) {
        const catDoc = await ctx.db.get(resolvedCategoryId);
        await triggerNotification(
          ctx, 
          superadmin._id, 
          "slack", 
          "product_edited_pending_approval", 
          "product", 
          `${args.id}_edit_${now}`, 
          JSON.stringify({
            productName: args.name,
            boutiqueName: boutique.boutiqueName || boutique.name || "Boutique",
            price: customerPrice,
            category: (catDoc as any)?.name || undefined,
            isEdit: true,
          })
        );
      }
    }

    return args.id;
  },
});

/**
 * Delete a product.
 */
export const deleteProduct = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    const product = await ctx.db.get(args.id);
    if (!product || product.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized: Product does not belong to your boutique.");
    }

    // Extract R2 objectKeys and schedule background cleanup
    const objectKeys = extractR2ObjectKeys(product.images || []);
    if (objectKeys.length > 0) {
      await ctx.scheduler.runAfter(0, internal.media.api.deleteR2Objects, {
        objectKeys,
        actorId: boutique._id,
      });
    }

    // Clean up all legacy images from storage if they are not shared by other products
    for (const imgId of product.images || []) {
      if (imgId && typeof imgId === "string" && !imgId.startsWith("http")) {
        const shared = await isImageShared(ctx, boutique._id, product._id, imgId as string);
        if (!shared) {
          try {
            await ctx.storage.delete(imgId as any);
          } catch (e) {
            console.error("Failed to delete image storage:", imgId, e);
          }
        }
      }
    }

    await ctx.db.delete(args.id);
    await updateBoutiqueProductCount(ctx, boutique._id);
    return { id: args.id, objectKeys };
  },
});

/**
 * Toggle active status of a product.
 */
export const toggleProductStatus = mutation({
  args: { id: v.id("products"), active: v.boolean() },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    const product = await ctx.db.get(args.id);
    if (!product || product.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized");
    }

    const merchantTier = boutique.merchantTier || "Bronze";
    let approvalStatus = product.approvalStatus;
    if (args.active) {
      // If Bronze merchant activates a product, check if it's already approved. If not, trigger pending review.
      if (approvalStatus !== "approved") {
        approvalStatus = merchantTier === "Bronze" ? "pending" : "approved";
      }
    } else {
      // Toggled to inactive (draft)
      approvalStatus = undefined;
    }

    await ctx.db.patch(args.id, {
      active: args.active,
      approvalStatus,
      updatedAt: Date.now(),
    });
    await updateBoutiqueProductCount(ctx, boutique._id);
    return args.id;
  },
});

/**
 * Fetch all products for the logged-in boutique.
 */
export const getBoutiqueProducts = query({
  args: {},
  handler: async (ctx) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    const products = await ctx.db
      .query("products")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .collect();

    // Fetch all active/awaiting reservations for this boutique (excluding awaiting_payment as they are physically deducted)
    const reservations1 = await ctx.db.query("reservations").withIndex("by_boutiqueId_status", (q) => q.eq("boutiqueId", boutique._id).eq("status", "reservation_active")).collect();
    const reservations2 = await ctx.db.query("reservations").withIndex("by_boutiqueId_status", (q) => q.eq("boutiqueId", boutique._id).eq("status", "awaiting_store_confirmation")).collect();
    
    const allLockedReservations = [...reservations1, ...reservations2];

    // Build locked stock map: productId -> size -> count
    const lockedStockMap: Record<string, Record<string, number>> = {};
    for (const res of allLockedReservations) {
      if (!res.productId || !res.size) continue;
      if (!lockedStockMap[res.productId]) lockedStockMap[res.productId] = {};
      const prodMap = lockedStockMap[res.productId]!;
      prodMap[res.size] = (prodMap[res.size] || 0) + 1;
    }

    const enriched = await enrichProducts(ctx, products, true);
    return enriched.map(p => ({
      ...p,
      lockedStockBySize: lockedStockMap[p._id] || {}
    }));
  },
});

/**
 * Fetch a single product details by either ID or slug.
 */
async function getApprovedBoutiqueIds(ctx: any): Promise<Set<string>> {
  const approved = await ctx.db
    .query("boutiques")
    .withIndex("by_status", (q: any) => q.eq("status", "APPROVED"))
    .collect();
  return new Set(approved.map((b: any) => b._id));
}

export function isPurchasableProduct(product: any, boutique: any): boolean {
  return (
    product.active === true &&
    product.adminHidden !== true &&
    (!product.approvalStatus || product.approvalStatus === "approved") &&
    boutique &&
    boutique.status === "APPROVED"
  );
}

export function getTotalStock(stockBySize?: Record<string, number>): number {
  if (!stockBySize) return 0;
  return Object.values(stockBySize).reduce((sum, val) => sum + val, 0);
}

export const getProduct = query({
  args: {
    id: v.optional(v.id("products")),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let product: any = null;
    if (args.id) {
      product = await ctx.db.get(args.id);
    } else if (args.slug) {
      const slug = args.slug;
      product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
    }

    if (!product) return null;

    if (product.adminHidden) {
      const currentUser = await getCurrentUserOrNull(ctx);
      const isAdmin = currentUser?.role === "admin";
      let isOwner = false;
      if (currentUser && (currentUser.role === "boutique" || currentUser.role === "boutique_owner")) {
        const boutique = await ctx.db.get(product.boutiqueId) as any;
        if (boutique) {
          const isPrimaryOwner = boutique.ownerUserId === currentUser._id || boutique.userId === currentUser._id;
          const isStaffMember = currentUser.email ? (
            (boutique.staffEmail1 && normalizeEmail(boutique.staffEmail1) === normalizeEmail(currentUser.email)) ||
            (boutique.staffEmail2 && normalizeEmail(boutique.staffEmail2) === normalizeEmail(currentUser.email))
          ) : false;
          if (isPrimaryOwner || isStaffMember) {
            isOwner = true;
          }
        }
      }

      if (!isAdmin && !isOwner) {
        return null;
      }
    }

    const boutique = await ctx.db.get(product.boutiqueId) as any;
    const purchasable = isPurchasableProduct(product, boutique);

    const enriched = await enrichProduct(ctx, product);

    // The category's attribute schema decides which of product.details a shopper
    // sees, under what label and unit. Only the presentation half is sent: options,
    // required flags and help text belong to the seller form. Categories without a
    // schema get no field at all, and the product page falls back to the
    // vertical's spec keys exactly as before.
    const attributeSet = await ctx.db
      .query("attributeSets")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", product.categoryId))
      .first();
    const withSchema =
      attributeSet && attributeSet.fields.length > 0
        ? {
            ...enriched,
            attributeFields: attributeSet.fields.map((f) => ({
              key: f.key,
              label: f.label,
              unit: f.unit,
            })),
          }
        : enriched;

    if (!purchasable) {
      return {
        ...withSchema,
        isUnavailable: true,
      };
    }
    return withSchema;
  },
});

/**
 * Fetch a product to use as a "template" when a seller adds another colour of
 * their own listing. Unlike getProduct (public, used for the customer PDP and
 * the boutique's own edit flow), this only ever returns a product owned by the
 * calling boutique — a seller must not be able to prefill a new listing from a
 * different boutique's product by guessing/passing its id.
 */
export const getMyProductToTemplate = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    const product = await ctx.db.get(args.id);
    if (!product || product.boutiqueId !== boutique._id) {
      return null;
    }
    return enrichProduct(ctx, product);
  },
});

/**
 * Public query to fetch products matching filters (for Customer App).
 * Supports multi-category, price range, and location-based delivery radius filtering.
 */
/**
 * Candidate cap per descendant category in the catalog selection below.
 * Generous relative to a 12-item page, because serviceability and stock filters
 * run after the fetch and can discard a large share of the candidates.
 */
const CATEGORY_CANDIDATE_LIMIT = 200;

/** Argument shape shared by getActiveProducts and getCatalogPage. */
type CatalogSelectionArgs = {
  categoryIds?: Id<"categories">[];
  featuredOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  userLat?: number;
  userLng?: number;
  boutiqueId?: Id<"boutiques">;
};

/**
 * Selects, filters, scores and enriches the catalog for a shopper.
 *
 * Extracted verbatim from getActiveProducts so getCatalogPage can reuse the
 * exact same selection, serviceability and scoring rules rather than a second
 * implementation that could drift. getActiveProducts is now a thin wrapper, so
 * its five other callers (shop page, recommendations, related products,
 * sitemap, mobile app) are unaffected.
 */
async function selectCatalogProducts(ctx: QueryCtx, args: CatalogSelectionArgs) {
  {
    let products;
    if (args.boutiqueId) {
      products = await ctx.db
        .query("products")
        .withIndex("by_boutiqueId_active", (q) => q.eq("boutiqueId", args.boutiqueId!).eq("active", true))
        .collect();
    } else if (args.categoryIds && args.categoryIds.length > 0) {
      // Recursively fetch all active descendant category IDs
      const allCategories = await ctx.db
        .query("categories")
        .withIndex("by_active_and_sortOrder", (q) => q.eq("active", true))
        .collect();

      const categoryIdSet = new Set<string>();

      const resolveDescendants = (id: string) => {
        if (categoryIdSet.has(id)) return;
        categoryIdSet.add(id);
        const children = allCategories.filter((c) => c.parentId === id);
        for (const child of children) {
          resolveDescendants(child._id);
        }
      };

      for (const catId of args.categoryIds) {
        resolveDescendants(catId);
      }

      const uniqueCategoryIds = Array.from(categoryIdSet);

      // Bounded per category, mirroring the take(200) on the uncategorised
      // branch below. An unbounded .collect() per descendant category meant a
      // broad parent category could pull the entire catalogue into one query.
      const categoryProductsList = await Promise.all(
        uniqueCategoryIds.map((catId) =>
          ctx.db
            .query("products")
            .withIndex("by_categoryId", (q) => q.eq("categoryId", catId as any))
            .filter((q) => q.eq(q.field("active"), true))
            .take(CATEGORY_CANDIDATE_LIMIT)
        )
      );
      products = categoryProductsList.flat();
    } else {
      products = await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("active", true))
        .take(200);
    }


    // Optimize lookups by filtering approved boutiques early
    const approvedBoutiqueIds = await getApprovedBoutiqueIds(ctx);
    let filtered = products.filter((p) => approvedBoutiqueIds.has(p.boutiqueId) && p.adminHidden !== true && (!p.approvalStatus || p.approvalStatus === "approved"));

    // If browsing general catalog (no specific boutiqueId filter), hide products from boutiques that are currently closed
    if (!args.boutiqueId) {
      // Fetch each distinct boutique once, in parallel. This previously awaited
      // inside a for-loop over every product: the memo meant each boutique was
      // only read once, but the reads were fully serialised, so latency scaled
      // with the number of distinct boutiques in the result.
      const distinctBoutiqueIds = Array.from(new Set(filtered.map((p) => p.boutiqueId)));
      const boutiqueDocs = await Promise.all(
        distinctBoutiqueIds.map((id) => ctx.db.get(id))
      );
      const boutiqueCache = new Map<string, any>();
      distinctBoutiqueIds.forEach((id, i) => boutiqueCache.set(id as string, boutiqueDocs[i]));

      // One timestamp for the whole pass, so two products from the same
      // boutique can't disagree about whether it is open.
      const now = Date.now();
      filtered = filtered.filter((p) => {
        const b = boutiqueCache.get(p.boutiqueId);
        if (!b) return false;
        const status = getBoutiqueStatus(b, now);
        return (
          status.type === "OPEN" ||
          status.type === "CLOSED_TODAY" ||
          status.type === "CLOSED_EXTENDED"
        );
      });
    }

    // Featured filter
    if (args.featuredOnly) {
      filtered = filtered.filter(p => p.featured === true);
    }

    // Price range filter (normalized customer selling price in Rupees)
    if (args.minPrice !== undefined || args.maxPrice !== undefined) {
      filtered = filtered.filter((p) => {
        const sellingPrice = displayPricing(p).price;
        if (args.minPrice !== undefined && sellingPrice < args.minPrice) return false;
        if (args.maxPrice !== undefined && sellingPrice > args.maxPrice) return false;
        return true;
      });
    }


    // Location-based delivery radius filter & scoring
    let boutiqueStatsMap = new Map<string, { distanceKm: number; durationMin: number; hiveScore: number }>();
    
    if (args.userLat !== undefined && args.userLng !== undefined) {
      const boutiques = await ctx.db
        .query("boutiques")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .collect();

      const startLat = Math.round(args.userLat * 1000) / 1000;
      const startLng = Math.round(args.userLng * 1000) / 1000;

      // Batch load cached distances for these user coords
      const cachedDistances = await ctx.db
        .query("cachedRoadDistances")
        .withIndex("by_start_end", (q) => q.eq("startLat", startLat).eq("startLng", startLng))
        .collect();

      const cacheMap = new Map<string, { distanceKm: number; durationMin: number }>();
      for (const cd of cachedDistances) {
        const key = `${cd.endLat.toFixed(6)},${cd.endLng.toFixed(6)}`;
        cacheMap.set(key, { distanceKm: cd.distanceKm, durationMin: cd.durationMin });
      }

      // Batch load hiveScores for boutiques
      const boutiqueScores = await ctx.db
        .query("hiveScores")
        .withIndex("by_entityType_score", (q) => q.eq("entityType", "boutique"))
        .collect();
      const scoreMap = new Map<string, any>();
      for (const bs of boutiqueScores) {
        scoreMap.set(bs.entityId, bs);
      }

      const deliverableBoutiqueIds = new Set<string>();

      for (const b of boutiques) {
        const bLat = b.latitude ?? b.addressDetails?.lat;
        const bLng = b.longitude ?? b.addressDetails?.lng;
        if (bLat === undefined || bLng === undefined) continue;

        // A measured road distance for this pair when the cache holds one.
        const cacheKey = `${bLat.toFixed(6)},${bLng.toFixed(6)}`;
        const cached = cacheMap.get(cacheKey);

        // Eligibility comes from the shared rule rather than being decided here.
        //
        // This previously compared RAW straight-line distance against a 15km default, while the
        // gate that actually allows an order compares an estimated ROAD distance against 13km —
        // so the grid offered products checkout would refuse. Worse, an uncached pair used
        // straight-line while a cached one used measured road distance, so the same boutique
        // moved in and out of range as the cache backfilled behind the shopper.
        //
        // The cache is now precision, not a different algorithm: resolveServiceability applies
        // one rule either way, using the measured figure when there is one and scaling the
        // straight-line estimate when there is not.
        const decision = resolveServiceability(args.userLat, args.userLng, b as any, {
          measuredRoadKm: cached ? cached.distanceKm : null,
        });

        // Distance and ETA are still reported for every boutique the loop reaches, including
        // out-of-range ones — the cards below read them for display, and suppressing them here
        // would blank the ETA on a product that is merely being ranked, not hidden.
        const distanceKm = decision.distanceKm ?? haversineKm(args.userLat, args.userLng, bLat, bLng);
        const durationMin = cached ? cached.durationMin : (distanceKm / 25) * 60;

        if (decision.status === "serviceable") {
          deliverableBoutiqueIds.add(b._id);

          // Calculate normalized MerchantScore:
          // 40% Fulfillment + 30% SameDaySla + 20% ClaimQuality + 10% PrepTime
          const bs = scoreMap.get(b._id);
          const fulfillmentScore = bs?.components?.orderCompletionRate ?? 80;
          const sameDaySla = bs?.components?.deliverySuccessRate ?? 80;
          const claimQuality = 100 - (bs?.components?.claimRate ?? 0);
          
          // Prep time score: smaller prep time is higher score
          const prepTimeMin = b.averagePrepTime ?? 30;
          const prepScore = prepTimeMin <= 30 ? 100 : prepTimeMin <= 60 ? 70 : 30;

          const merchantScore = Math.round(
            0.40 * fulfillmentScore +
            0.30 * sameDaySla +
            0.20 * claimQuality +
            0.10 * prepScore
          );

          boutiqueStatsMap.set(b._id, {
            distanceKm,
            durationMin,
            hiveScore: merchantScore,
          });
        }
      }

      filtered = filtered.filter((p) => deliverableBoutiqueIds.has(p.boutiqueId));
    }


    const enriched = await enrichProducts(ctx, filtered);

    let purchasable = enriched.filter((p) => p.active && p.boutique && p.boutique.verified && getTotalStock(p.stockBySize) > 0);

    if (args.userLat !== undefined && args.userLng !== undefined) {
      const scoredProducts = purchasable.map((p) => {
        const stats = boutiqueStatsMap.get(p.boutiqueId);
        if (!stats) return { product: p, score: 0 };

        // 1. EtaScore (Buckets: <=45m = 100, 45-90m = 85, 90-120m = 60, 120-180m = 30, >180m = 0)
        const prepTime = p.boutique?.averagePrepTime ?? 30;
        const eta = stats.durationMin + prepTime;
        let etaScore = 0;
        if (eta <= 45) etaScore = 100;
        else if (eta <= 90) etaScore = 85;
        else if (eta <= 120) etaScore = 60;
        else if (eta <= 180) etaScore = 30;
        else etaScore = 0;

        // 2. DistanceScore (Decays from 100 to 0 starting after 1km)
        let distanceScore = 100;
        if (stats.distanceKm > 1.0) {
          distanceScore = Math.max(0, Math.min(100, 100 - ((stats.distanceKm - 1.0) / (15.0 - 1.0)) * 100));
        }

        // 3. MerchantScore
        const merchantScore = stats.hiveScore;

        // 4. SlaScore
        const slaScore = p.sameDayEligible ? 100 : 0;

        // 5. PopularityScore
        const popularityScore = p.featured ? 100 : 0;

        // HiveScore = 35% ETA + 25% Distance + 20% Merchant + 10% SLA + 10% Popularity
        const hiveScore = Math.round(
          0.35 * etaScore +
          0.25 * distanceScore +
          0.20 * merchantScore +
          0.10 * slaScore +
          0.10 * popularityScore
        );

        return {
          product: {
            ...p,
            estimatedDistanceKm: stats.distanceKm,
            estimatedDurationMin: stats.durationMin,
            estimatedEtaMinutes: Math.round(eta),
            hiveScore,
          },
          score: hiveScore,
        };
      });

      scoredProducts.sort((a, b) => b.score - a.score);
      return scoredProducts.map((sp) => sp.product);
    }

    return purchasable;
  }
}

/**
 * Full catalog selection. Unchanged in behaviour and signature.
 *
 * Still returns every matching product, which is correct for its remaining
 * consumers: the sitemap needs the whole catalogue, the shop page is already
 * scoped to a single boutique, and the recommendation rails use the result as a
 * candidate pool. The product listing page no longer uses this — see
 * getCatalogPage below.
 */
export const getActiveProducts = query({
  args: {
    categoryIds: v.optional(v.array(v.id("categories"))),
    featuredOnly: v.optional(v.boolean()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    boutiqueId: v.optional(v.id("boutiques")),
  },
  handler: async (ctx, args) => {
    return await selectCatalogProducts(ctx, args);
  },
});

/**
 * One page of the product listing grid.
 *
 * Replaces the previous arrangement, where the client fetched the entire
 * filtered catalogue and called .slice() on it. Selection, occasion/new-arrival
 * filtering, and ordering all happen here over the full candidate set — so the
 * ordering is still global and page 2 genuinely continues page 1 — but only one
 * page of narrow cards crosses the wire.
 *
 * Deliberately offset-based rather than cursor-based (.paginate). The grid uses
 * numbered page controls that can jump to an arbitrary page, which a cursor
 * cannot express; and every sort mode this page offers is computed per-request
 * from the shopper's coordinates rather than read from an index, so a cursor
 * over an index would not produce the ordering the shopper asked for.
 */
export const getCatalogPage = query({
  args: {
    categoryIds: v.optional(v.array(v.id("categories"))),
    featuredOnly: v.optional(v.boolean()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    boutiqueId: v.optional(v.id("boutiques")),
    // Post-selection filters — neither is indexable. See convex/shared/catalog.ts.
    occasions: v.optional(v.array(v.string())),
    sizes: v.optional(v.array(v.string())),
    newArrivals: v.optional(v.boolean()),
    sort: v.optional(
      v.union(
        v.literal("trending"),
        v.literal("nearby"),
        v.literal("priceAsc"),
        v.literal("priceDesc")
      )
    ),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Capped at the grid's own page size. This is a public query, so the cap is
    // the API contract, not a hint — without it a caller could request a page
    // large enough to reintroduce the full-catalogue transfer this replaced.
    // Raise deliberately if a second consumer ever needs a larger page.
    const pageSize = Math.min(Math.max(args.pageSize ?? 12, 1), 12);
    const requestedPage = Math.max(args.page ?? 1, 1);

    // Discovery identity for this coordinate. Resolved from active pincode centroids, never from
    // a caller-supplied city string. It answers which service area a shopper is in, which is a
    // different question from whether anyone can deliver to them — selectCatalogProducts settles
    // that separately through resolveServiceability — and the two stay independently observable.
    const discovery = await resolveDiscoveryContext(ctx, { lat: args.userLat, lng: args.userLng });

    const enriched = await selectCatalogProducts(ctx, args);

    const cards = enriched.map(toCatalogCard);
    const filtered = applyCatalogFilters(cards, {
      newArrivals: args.newArrivals,
      occasions: args.occasions,
      sizes: args.sizes,
    });
    const sorted = applyCatalogSort(filtered, args.sort ?? DEFAULT_SORT);

    const totalCount = sorted.length;
    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    // Clamp rather than return an empty page: a shopper sitting on page 5 who
    // narrows a filter should land on the last real page, not on nothing.
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;

    return {
      products: sorted.slice(start, start + pageSize),
      totalCount,
      totalPages,
      page,
      pageSize,
      // Additive; nothing consumes it yet. See the note above resolveDiscoveryContext.
      discovery,
    };
  },
});

/**
 * Update stock levels for a product.
 */
export const updateInventory = mutation({
  args: {
    productId: v.id("products"),
    stockBySize: v.record(v.string(), v.number()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);
    const product = await ctx.db.get(args.productId);
    if (!product || product.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized");
    }

    for (const [size, qty] of Object.entries(args.stockBySize)) {
      if (qty < 0) {
        throw new Error(`Stock level for size ${size} cannot be negative.`);
      }
    }

    const currentStockBySize = product.stockBySize || {};
    const now = Date.now();
    const bulkMovementId = `inline_update_${now}`;

    // Loop through the new stockBySize map and find diffs
    const allSizes = Array.from(new Set([...Object.keys(currentStockBySize), ...Object.keys(args.stockBySize)]));

    for (const size of allSizes) {
      const beforeQty = currentStockBySize[size] ?? 0;
      const afterQty = args.stockBySize[size] ?? 0;
      const adjustmentQty = afterQty - beforeQty;

      if (adjustmentQty === 0) continue;

      await ctx.db.insert("inventoryMovements", {
        productId: product._id,
        boutiqueId: boutique._id,
        size,
        beforeQty,
        afterQty,
        adjustmentQty,
        reason: "stock_recount",
        source: "manual",
        createdBy: user._id,
        bulkMovementId,
        createdAt: now,
      });
    }

    const beforeTotalStock = Object.values(currentStockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const totalStock = Object.values(args.stockBySize).reduce((sum, val) => sum + val, 0);
    let active = product.active;
    let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

    const isApproved = !product.approvalStatus || product.approvalStatus === "approved";

    if (totalStock === 0) {
      active = false;
      autoDeactivatedBecauseOutOfStock = true;
    } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
      if (isApproved) {
        active = true;
      }
      autoDeactivatedBecauseOutOfStock = false;
    } else if (totalStock > 0) {
      autoDeactivatedBecauseOutOfStock = false;
    }

    const updatedSizes = Array.from(new Set([...(product.sizes || []), ...Object.keys(args.stockBySize)]));
    await ctx.db.patch(args.productId, {
      sizes: updatedSizes,
      stockBySize: args.stockBySize,
      active,
      autoDeactivatedBecauseOutOfStock,
      updatedAt: now,
      lastVerifiedAt: now,
      verifiedBy: user._id,
    });
    return args.productId;
  },
});

export const verifyProducts = mutation({
  args: {
    productIds: v.array(v.id("products")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const boutique = await getMyBoutique(ctx);
    const now = Date.now();
    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product || product.boutiqueId !== boutique._id) {
        throw new Error("Unauthorized");
      }
      await ctx.db.patch(id, {
        lastVerifiedAt: now,
        verifiedBy: user._id,
      });
    }
    return args.productIds;
  },
});

/**
 * Adjust stock levels for specific sizes with structured reasoning and audit trails.
 */
export const adjustInventory = mutation({
  args: {
    productId: v.id("products"),
    adjustments: v.record(v.string(), v.number()),
    reason: v.union(
      v.literal("in_store_sale"),
      v.literal("damaged_item"),
      v.literal("returned_item"),
      v.literal("stock_recount"),
      v.literal("restock"),
      v.literal("online_order"),
      v.literal("inventory_transfer"),
      v.literal("sample_given"),
      v.literal("online_order_reversal"),
      v.literal("order_cancelled")
    ),
    notes: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);
    const product = await ctx.db.get(args.productId);
    if (!product || product.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized: Product does not belong to your boutique.");
    }

    const currentStockBySize = { ...product.stockBySize };
    const now = Date.now();

    for (const [size, adjustmentQty] of Object.entries(args.adjustments)) {
      if (adjustmentQty === 0) continue;
      const beforeQty = currentStockBySize[size] ?? 0;
      const afterQty = beforeQty + adjustmentQty;
      
      // Prevent negative stock levels
      if (afterQty < 0) {
        throw new Error(`Cannot reduce stock below zero. Size "${size}" only has ${beforeQty} units available.`);
      }

      currentStockBySize[size] = afterQty;

      await ctx.db.insert("inventoryMovements", {
        productId: product._id,
        boutiqueId: boutique._id,
        size,
        beforeQty,
        afterQty,
        adjustmentQty,
        reason: args.reason,
        source: "manual",
        createdBy: user._id,
        notes: args.notes,
        createdAt: now,
      });
    }

    const beforeTotalStock = Object.values(product.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const totalStock = Object.values(currentStockBySize).reduce((sum, val) => sum + val, 0);
    let active = product.active;
    let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

    const isApproved = !product.approvalStatus || product.approvalStatus === "approved";

    if (totalStock === 0) {
      active = false;
      autoDeactivatedBecauseOutOfStock = true;
    } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
      if (isApproved) {
        active = true;
      }
      autoDeactivatedBecauseOutOfStock = false;
    } else if (totalStock > 0) {
      autoDeactivatedBecauseOutOfStock = false;
    }

    await ctx.db.patch(product._id, {
      stockBySize: currentStockBySize,
      active,
      autoDeactivatedBecauseOutOfStock,
      updatedAt: now,
    });

    return product._id;
  },
});

/**
 * Log a stock verification check (Quick Verification or Full Stock Count).
 */
export const verifyInventory = mutation({
  args: {
    verificationType: v.union(v.literal("quick"), v.literal("full")),
    notes: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);

    const verificationId = await ctx.db.insert("inventoryVerifications", {
      boutiqueId: boutique._id,
      verifiedBy: user._id,
      verificationType: args.verificationType,
      notes: args.notes,
      createdAt: Date.now(),
    });

    return verificationId;
  },
});

/**
 * Restock multiple product variants in bulk.
 */
export const bulkRestock = mutation({
  args: {
    items: v.array(
      v.object({
        productId: v.id("products"),
        adjustments: v.record(v.string(), v.number()),
      })
    ),
    notes: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);
    const now = Date.now();
    const bulkMovementId = `bulk_restock_${now}`;

    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product || product.boutiqueId !== boutique._id) {
        throw new Error(`Unauthorized: Product ${item.productId} does not belong to your boutique.`);
      }

      const currentStockBySize = { ...product.stockBySize };

      for (const [size, adjustmentQty] of Object.entries(item.adjustments)) {
        if (adjustmentQty <= 0) continue; // Bulk restock only allows positive adjustments

        const beforeQty = currentStockBySize[size] ?? 0;
        const afterQty = beforeQty + adjustmentQty;
        currentStockBySize[size] = afterQty;

        await ctx.db.insert("inventoryMovements", {
          productId: product._id,
          boutiqueId: boutique._id,
          size,
          beforeQty,
          afterQty,
          adjustmentQty,
          reason: "restock",
          source: "manual",
          createdBy: user._id,
          bulkMovementId,
          notes: args.notes,
          createdAt: now,
        });
      }

      const beforeTotalStock = Object.values(product.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
      const totalStock = Object.values(currentStockBySize).reduce((sum, val) => sum + val, 0);
      let active = product.active;
      let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

      if (totalStock === 0) {
        active = false;
        autoDeactivatedBecauseOutOfStock = true;
      } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
        active = true;
        autoDeactivatedBecauseOutOfStock = false;
      } else if (totalStock > 0) {
        autoDeactivatedBecauseOutOfStock = false;
      }

      const updatedSizes = Array.from(new Set([...(product.sizes || []), ...Object.keys(currentStockBySize)]));
      await ctx.db.patch(product._id, {
        sizes: updatedSizes,
        stockBySize: currentStockBySize,
        active,
        autoDeactivatedBecauseOutOfStock,
        updatedAt: now,
      });
    }

    return bulkMovementId;
  },
});

/**
 * Retrieve the inventory audit logs for the boutique (paginated).
 */
export const getInventoryHistory = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, args.token, true);

    const result = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_boutiqueId_createdAt", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich movements with product names and operator names
    const enrichedPage = await Promise.all(
      result.page.map(async (movement) => {
        const product = await ctx.db.get(movement.productId);
        const operator = await ctx.db.get(movement.createdBy);

        let operatorName = "Unknown";
        if (operator) {
          if (operator.role === "boutique" || operator.role === "boutique_owner") {
            const boutiqueOwner = await ctx.db
              .query("customerProfiles")
              .withIndex("by_userId", (q) => q.eq("userId", operator._id))
              .unique();
            operatorName = boutiqueOwner?.displayName || operator.email || "Boutique Staff";
          } else if (operator.role === "admin") {
            operatorName = `Admin (${operator.email || "Staff"})`;
          } else {
            operatorName = operator.email || "Customer";
          }
        }

        return {
          ...movement,
          productName: product?.name || "Unknown Product",
          operatorName,
        };
      })
    );

    return {
      page: enrichedPage,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Fetch dashboard metrics for the logged-in boutique.
 */
export const getDashboardMetrics = query({
  args: {},
  handler: async (ctx) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    const merchantTier = await getBoutiqueMerchantTier(ctx, boutique);
    const hiveScore = boutique.hiveScore || 100;

    // TODO: Add compound index on by_boutiqueId_active or by_boutiqueId_status to optimize dashboard metrics count.
    const products = await ctx.db
      .query("products")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .take(1000);

    const [
      dbPendingConfirmation,
      dbConfirmed,
      dbPacked,
      dbPickupScheduled,
      dbPickedUp,
      dbInTransit,
      dbOutForDelivery,
      dbDelivered,
    ] = await Promise.all([
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "pending_confirmation")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "confirmed")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "packed")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "pickup_scheduled")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "picked_up")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "in_transit")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "out_for_delivery")).take(500),
      ctx.db.query("orders").withIndex("by_boutiqueId_status", q => q.eq("boutiqueId", boutique._id).eq("status", "delivered")).take(1000),
    ]);

    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.active).length;
    const liveCount = products.filter(p => p.active && (!p.approvalStatus || p.approvalStatus === "approved")).length;
    const pendingCount = products.filter(p => p.active && p.approvalStatus === "pending").length;
    const changesRequestedCount = products.filter(p => p.active && p.approvalStatus === "changes_requested").length;
    const draftCount = products.filter(p => !p.active).length;

    const pendingOrders = dbPendingConfirmation.length + dbConfirmed.length;
    const completedOrders = dbDelivered.length;

    const claims = await ctx.db
      .query("claims")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .collect();

    const allRecentBoutiqueOrders = [
      ...dbPendingConfirmation,
      ...dbConfirmed,
      ...dbPacked,
      ...dbPickupScheduled,
      ...dbPickedUp,
      ...dbInTransit,
      ...dbOutForDelivery,
      ...dbDelivered,
    ];

    const totalBoutiqueOrders = boutique.totalOrders ?? allRecentBoutiqueOrders.length;
    const claimRate = totalBoutiqueOrders > 0 ? (claims.length / totalBoutiqueOrders) * 100 : 0;

    const fulfillmentOrders = 
      dbConfirmed.length +
      dbPacked.length +
      dbPickupScheduled.length +
      dbPickedUp.length +
      dbInTransit.length +
      dbOutForDelivery.length;

    // Calculate low stock alerts (number of products having any size with stock <= 2)
    const lowStockAlerts = products.filter(p => {
      const stock = p.stockBySize || {};
      return Object.values(stock).some((qty: any) => qty <= 2);
    }).length;

    // Categorized stock alerts details
    const criticalAlerts: { productName: string; size: string; productId: string }[] = [];
    const warningAlerts: { productName: string; size: string; stock: number; productId: string }[] = [];

    products.forEach((p) => {
      const stock = p.stockBySize || {};
      p.sizes.forEach((size: string) => {
        const qty = stock[size] ?? 0;
        if (qty === 0) {
          criticalAlerts.push({
            productId: p._id,
            productName: p.name,
            size,
          });
        } else if (qty === 1 || qty === 2) {
          warningAlerts.push({
            productId: p._id,
            productName: p.name,
            size,
            stock: qty,
          });
        }
      });
    });

    // Sum revenue from delivered orders (stored in rupees)
    const rawRevenue = allRecentBoutiqueOrders
      .filter(o => o.status === "delivered" || o.paymentStatus === "paid")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const revenue = rawRevenue;

    // Operational Metrics calculations for Merchant Dashboard Cockpit
    const nowLocal = new Date();
    const startOfToday = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate()).getTime();
    const todaysOrders = allRecentBoutiqueOrders.filter(o => o.createdAt >= startOfToday).length;

    // Acceptance time (orderAcceptedAt - createdAt)
    const acceptedOrders = allRecentBoutiqueOrders.filter(o => o.orderAcceptedAt !== undefined);
    const totalAcceptanceTime = acceptedOrders.reduce((sum, o) => sum + (o.orderAcceptedAt! - o.createdAt), 0);
    const avgAcceptanceTimeMs = acceptedOrders.length > 0 ? totalAcceptanceTime / acceptedOrders.length : 0;

    // Order Fulfillment Rate (30-day window)
    const thirtyDaysAgoMs = nowLocal.getTime() - (30 * 24 * 60 * 60 * 1000);
    const last30DaysOrders = allRecentBoutiqueOrders.filter(o => o.createdAt >= thirtyDaysAgoMs);
    let closedOrderCount = 0;
    let deliveredOrderCount = 0;
    
    last30DaysOrders.forEach(o => {
      if (o.status === "delivered") {
        closedOrderCount++;
        deliveredOrderCount++;
      } else if (o.status === "cancelled") {
        const reason = (o.cancelReason || "").toLowerCase();
        const isMerchantFault = reason.includes("out of stock") || reason.includes("stock") || reason.includes("boutique owner") || reason.includes("merchant");
        if (isMerchantFault) {
          closedOrderCount++;
        }
      }
    });
    const orderFulfillmentRate = closedOrderCount > 0 ? (deliveredOrderCount / closedOrderCount) * 100 : 100;

    // Same-Day Success % (delivered within 8 hours of confirmation/creation)
    const deliveredOrders = dbDelivered;
    let sameDayCount = 0;
    for (const o of deliveredOrders) {
      const startTime = o.orderAcceptedAt || o.confirmedAt || o.createdAt;
      const endTime = o.deliveredAt;
      if (endTime && startTime) {
        if (endTime - startTime <= 8 * 3600 * 1000) {
          sameDayCount++;
        }
      }
    }
    const sameDaySuccessRate = deliveredOrders.length > 0 
      ? (sameDayCount / deliveredOrders.length) * 100 
      : 100;

    // Get latest inventory verification timestamp
    const lastVerification = await ctx.db
      .query("inventoryVerifications")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .first();

    const lastInventoryVerification = lastVerification?.createdAt ?? null;
    const daysElapsed = lastInventoryVerification
      ? Math.floor((Date.now() - lastInventoryVerification) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate Inventory Status Confidence Level
    let inventoryStatus: "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION" | "CRITICAL" = "CRITICAL";
    if (daysElapsed !== null) {
      if (daysElapsed <= 4) inventoryStatus = "EXCELLENT";
      else if (daysElapsed <= 14) inventoryStatus = "NEEDS_ATTENTION";
    }

    // Pending Actions Stats
    const ordersAwaitingConfirmationCount = dbPendingConfirmation.length;
    const draftProductsCount = products.filter((p) => !p.active).length;

    let outOfStockVariantsCount = 0;
    let lowStockVariantsCount = 0;
    let healthyVariantsCount = 0;

    products.forEach((p) => {
      const stock = p.stockBySize || {};
      p.sizes.forEach((size: string) => {
        const qty = stock[size] ?? 0;
        if (qty === 0) {
          outOfStockVariantsCount++;
        } else if (qty > 0 && qty <= 2) {
          lowStockVariantsCount++;
        } else {
          healthyVariantsCount++;
        }
      });
    });

    const pendingActionsStats = {
      lowStockVariantsCount,
      ordersAwaitingConfirmationCount,
      draftProductsCount,
    };

    const inventoryHealthStats = {
      outOfStock: outOfStockVariantsCount,
      lowStock: lowStockVariantsCount,
      healthy: healthyVariantsCount,
    };

    // Get recent 5 inventory movements for the activity feed
    const recentMovementsRaw = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_boutiqueId_createdAt", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .take(5);

    const recentMovements = await Promise.all(
      recentMovementsRaw.map(async (movement) => {
        const product = await ctx.db.get(movement.productId);
        const operator = await ctx.db.get(movement.createdBy);

        let operatorName = "Unknown";
        if (operator) {
          if (operator.role === "boutique" || operator.role === "boutique_owner") {
            const boutiqueOwner = await ctx.db
              .query("customerProfiles")
              .withIndex("by_userId", (q) => q.eq("userId", operator._id))
              .unique();
            operatorName = boutiqueOwner?.displayName || operator.email || "Boutique Staff";
          } else if (operator.role === "admin") {
            operatorName = `Admin (${operator.email || "Staff"})`;
          } else {
            operatorName = operator.email || "Customer";
          }
        }

        return {
          ...movement,
          productName: product?.name || "Unknown Product",
          operatorName,
        };
      })
    );

    // Get recent 5 orders enriched with details
    const recentOrdersRaw = await ctx.db
      .query("orders")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .take(5);

    const recentOrders = await Promise.all(
      recentOrdersRaw.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect();
        return {
          ...order,
          items,
        };
      })
    );

    // Get recent 5 products
    const recentProductsRaw = [...products]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    const recentProducts = await Promise.all(
      recentProductsRaw.map(p => enrichProduct(ctx, p))
    );

    return {
      totalProducts,
      activeProducts,
      liveCount,
      pendingCount,
      changesRequestedCount,
      draftCount,
      pendingOrders,
      completedOrders,
      fulfillmentOrders,
      lowStockAlerts,
      revenue,
      recentOrders,
      recentProducts,
      lastInventoryVerification,
      inventoryStatus,
      pendingActionsStats,
      inventoryHealthStats,
      recentMovements,
      criticalAlerts: criticalAlerts.slice(0, 10),
      warningAlerts: warningAlerts.slice(0, 10),
      // Sprint 3.0A operational metrics
      todaysOrders,
      avgAcceptanceTimeMs,
      orderFulfillmentRate,
      sameDaySuccessRate,
      merchantTier,
      trustTier: merchantTier,
      hiveScore,
      hiveScoreLabel: (() => {
        if (hiveScore >= 90) return "Excellent";
        if (hiveScore >= 75) return "Good";
        if (hiveScore >= 50) return "Fair";
        return "Poor";
      })(),
      claimRate,
      nextTierMessage: (() => {
        let msg = "";
        if (merchantTier === "Bronze") {
          const scoreDiff = 80 - hiveScore;
          if (scoreDiff > 0) {
            msg = `Increase Hive Score by ${scoreDiff} points to reach Silver.`;
          } else {
            msg = `Fulfill 1 order to reach Silver.`;
          }
        } else if (merchantTier === "Silver") {
          const scoreNeed = Math.max(0, 90 - hiveScore);
          const ordersNeed = Math.max(0, 40 - completedOrders);
          if (scoreNeed > 0 && ordersNeed > 0) {
            msg = `Need ${scoreNeed} score points and ${ordersNeed} more deliveries to reach Gold.`;
          } else if (scoreNeed > 0) {
            msg = `Increase Hive Score by ${scoreNeed} points to reach Gold.`;
          } else if (ordersNeed > 0) {
            msg = `Need ${ordersNeed} more delivery to reach Gold.`;
          }
        } else if (merchantTier === "Gold") {
          const scoreNeed = Math.max(0, 95 - hiveScore);
          const ordersNeed = Math.max(0, 100 - completedOrders);
          const claimRateOk = claimRate < 2;
          
          if (scoreNeed > 0 || ordersNeed > 0 || !claimRateOk) {
            const parts: string[] = [];
            if (scoreNeed > 0) parts.push(`increase score by ${scoreNeed} pts`);
            if (ordersNeed > 0) parts.push(`need ${ordersNeed} more deliveries`);
            if (!claimRateOk) parts.push("reduce claim rate below 2%");
            msg = `To reach Elite: ${parts.join(", ")}.`;
          }
        } else if (merchantTier === "Elite") {
          msg = "You have achieved Elite status! Keep up the excellent work!";
        }
        return msg;
      })(),
    };
  },
});

/**
 * Public query to search products matching a term and user location range (optional).
 */
export const checkSearchRateLimitInternal = internalMutation({
  args: { userId: v.optional(v.string()), sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Signed-in callers key on a server-derived identity, which is the only key here that is
    // actually trustworthy — it cannot be rotated to mint a fresh bucket.
    if (args.userId) {
      await checkRateLimit(ctx, `search:${args.userId}`, 30, 60 * 1000);
      return;
    }

    // Anonymous callers previously fell back to a single shared `search:anon:global` bucket when
    // no sessionId was supplied. That was the worst of both worlds: it stopped nobody (an
    // attacker just sends a random sessionId and gets a private bucket) while letting one caller
    // exhaust the shared 30/min and lock every other signed-out shopper out of search. Skipping
    // the limit is strictly safer than a bucket that only harms legitimate users.
    if (!args.sessionId) return;

    // NOTE: sessionId is client-generated and rotatable, so this bounds honest usage rather than
    // deliberate abuse — it keeps one shopper's tab from hammering search, nothing more. Real
    // anonymous abuse protection needs a server-derived signal (IP / edge layer), which Convex
    // does not expose to queries, mutations or actions. Tracked as separate architecture work.
    await checkRateLimit(ctx, `search:anon:${args.sessionId}`, 30, 60 * 1000);
  },
});

export const searchProductsInternal = internalQuery({
  args: {
    searchTerm: v.string(),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Punctuation-only or single-character input can match nearly everything.
    if (args.searchTerm.replace(/[^a-zA-Z0-9]/g, "").length < 2) {
      return { products: [], totalMatchedCount: 0, relatedOnly: false };
    }

    // Every visible product is ranked in memory across name, category, shop, details, material
    // and description (see lib/productSearch.ts). The name-only search index missed products
    // whose name lacks the shopper's word, and multi-word queries were scored as one phrase.
    const approvedBoutiqueIds = await getApprovedBoutiqueIds(ctx);
    const [activeProducts, categories, allApprovedBoutiques] = await Promise.all([
      ctx.db.query("products").withIndex("by_active", (q) => q.eq("active", true)).collect(),
      ctx.db.query("categories").collect(),
      ctx.db.query("boutiques").withIndex("by_status", (q) => q.eq("status", "APPROVED")).collect(),
    ]);

    const visibleProducts = activeProducts.filter(
      (p: any) =>
        approvedBoutiqueIds.has(p.boutiqueId) &&
        p.adminHidden !== true &&
        (!p.approvalStatus || p.approvalStatus === "approved")
    );

    const boutiquesMap = new Map<string, any>(
      allApprovedBoutiques.map((b: any) => [b._id.toString(), b])
    );

    const ranked = rankProducts(args.searchTerm, visibleProducts, {
      categoriesById: new Map(categories.map((c: any) => [c._id.toString(), c])),
      boutiqueNamesById: new Map(
        allApprovedBoutiques.map((b: any) => [b._id.toString(), b.boutiqueName ?? ""])
      ),
    });
    const relatedOnly = ranked.length > 0 && !ranked[0]!.matchedAllTerms;

    let matched = ranked.map((r) => r.product);

    // Filter by location if coordinates are provided.
    //
    // This used to compare raw straight-line distance against b.deliveryRadiusKm with no default,
    // so it disagreed with the order gate twice over: it admitted boutiques an order would
    // refuse, and it silently excluded any boutique with no radius set, since `distance <=
    // undefined` is false. It also read only top-level coordinates, so a boutique carrying them
    // on addressDetails was dropped here while Shop found it.
    //
    // The cached road distances are read for the same reason Shop reads them: without that, the
    // same shopper and boutique could be serviceable in search and not in the catalogue whenever
    // a measurement existed that contradicted the estimate.
    if (args.userLat !== undefined && args.userLng !== undefined) {
      const startLat = Math.round(args.userLat * 1000) / 1000;
      const startLng = Math.round(args.userLng * 1000) / 1000;
      const cachedDistances = await ctx.db
        .query("cachedRoadDistances")
        .withIndex("by_start_end", (q) => q.eq("startLat", startLat).eq("startLng", startLng))
        .collect();
      const cacheMap = new Map<string, number>();
      for (const cd of cachedDistances) {
        cacheMap.set(`${cd.endLat.toFixed(6)},${cd.endLng.toFixed(6)}`, cd.distanceKm);
      }

      const deliverableBoutiqueIds = new Set(
        [...boutiquesMap.values()]
          .filter((b: any) => {
            const coords = resolveBoutiqueCoords(b);
            const measured = coords
              ? cacheMap.get(`${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`)
              : undefined;
            return (
              resolveServiceability(args.userLat, args.userLng, b, {
                measuredRoadKm: measured ?? null,
              }).status === "serviceable"
            );
          })
          .map((b: any) => b._id)
      );

      matched = matched.filter((p: any) => deliverableBoutiqueIds.has(p.boutiqueId));
    }

    const enriched = await enrichProducts(ctx, matched);
    const activeEnriched = enriched.filter(
      (p: any) => p.active && p.boutique && getTotalStock(p.stockBySize) > 0
    );

    // Resolved here rather than in the searchProducts action, which has no database access.
    // Discovery identity is a separate question from the delivery filtering above.
    const discovery = await resolveDiscoveryContext(ctx, { lat: args.userLat, lng: args.userLng });

    return {
      products: activeEnriched,
      totalMatchedCount: activeEnriched.length,
      // True when no product contained every word, so these are related rather than exact results.
      relatedOnly,
      // Additive; nothing consumes it yet.
      discovery,
    };
  },
});

export const searchProducts = action({
  args: {
    searchTerm: v.string(),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    
    // Check rate limiting using internal mutation (cast to any to prevent compile recursion)
    await ctx.runMutation((internal as any).products.checkSearchRateLimitInternal, {
      userId: identity?.subject || undefined,
      sessionId: args.sessionId,
    });

    // Call the sanitized internal query
    return await ctx.runQuery((internal as any).products.searchProductsInternal, {
      searchTerm: args.searchTerm,
      userLat: args.userLat,
      userLng: args.userLng,
    });
  },
});

/**
 * Retrieve top performing products sorted by salesRevenue DESC (delivered orders only)
 */
export const getMostLovedProducts = query({
  args: {
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;
    
    // Fetch productPerformance records sorted by salesRevenue using index
    const performances = await ctx.db
      .query("productPerformance")
      .withIndex("by_salesRevenue")
      .order("desc")
      .take(Math.max(50, limit * 4));
    
    // Extract productIds
    const productIds = performances.map((p) => p.productId);
    
    // Fetch active approved boutiques
    const approvedBoutiques = await ctx.db
      .query("boutiques")
      .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
      .collect();
    const approvedBoutiqueIds = new Set(
      approvedBoutiques
        .filter(b => !b.boutiqueName.startsWith("Chaos Test Boutique") && !b.boutiqueName.startsWith("Mock Boutique") && b.isTestData !== true)
        .map((b) => b._id.toString())
    );
    
    let products: any[] = [];
    for (const pid of productIds) {
      try {
        const prod = await ctx.db.get(pid);
        if (prod && prod.active && !prod.adminHidden && (!prod.approvalStatus || prod.approvalStatus === "approved") && approvedBoutiqueIds.has(prod.boutiqueId.toString())) {
          const stock = getTotalStock(prod.stockBySize);
          if (stock > 0) {
            products.push(prod);
          }
        }
      } catch (e) {
        // Safe skip if ID is invalid or not found
      }
    }
    
    // Filter by delivery radius if user coordinates are provided
    if (args.userLat !== undefined && args.userLng !== undefined) {
      const deliverableBoutiqueIds = new Set(
        approvedBoutiques
          .filter((b) => {
            const dist = haversineKm(args.userLat!, args.userLng!, b.latitude, b.longitude);
            return dist <= b.deliveryRadiusKm;
          })
          .map((b) => b._id.toString())
      );
      
      products = products.filter((p) => deliverableBoutiqueIds.has(p.boutiqueId.toString()));
    }
    
    // If not enough products, backfill with active products
    if (products.length < limit) {
      const activeProducts = await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
      const filtered = activeProducts.filter((p) => {
        const stock = getTotalStock(p.stockBySize);
        return approvedBoutiqueIds.has(p.boutiqueId.toString()) && 
               !p.adminHidden && 
               (!p.approvalStatus || p.approvalStatus === "approved") && 
               stock > 0;
      });
      
      let extra = filtered;
      if (args.userLat !== undefined && args.userLng !== undefined) {
        const deliverableBoutiqueIds = new Set(
          approvedBoutiques
            .filter((b) => {
              const dist = haversineKm(args.userLat!, args.userLng!, b.latitude, b.longitude);
              return dist <= b.deliveryRadiusKm;
            })
            .map((b) => b._id.toString())
        );
        extra = extra.filter((p) => deliverableBoutiqueIds.has(p.boutiqueId.toString()));
      }
      
      for (const p of extra) {
        if (!products.some((existing) => existing._id === p._id)) {
          products.push(p);
        }
        if (products.length >= limit) break;
      }
    }
    
    const enriched = await enrichProducts(ctx, products.slice(0, limit));
    return enriched.filter((p) => p.active && p.boutique && p.boutique.verified && getTotalStock(p.stockBySize) > 0);
  }
});

/**
 * Public query to fetch curated recommendations optimized for the customer Cart Drawer empty state.
 * Returns up to 4 active, verified, nearby/trending products.
 */
export const getCartDrawerRecommendations = query({
  args: {
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const activeProducts = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const approvedBoutiqueIds = await getApprovedBoutiqueIds(ctx);
    let filtered = activeProducts.filter(
      (p) =>
        approvedBoutiqueIds.has(p.boutiqueId.toString()) &&
        p.adminHidden !== true &&
        (!p.approvalStatus || p.approvalStatus === "approved")
    );

    if (args.userLat !== undefined && args.userLng !== undefined) {
      const approvedBoutiques = await ctx.db
        .query("boutiques")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .collect();

      const deliverableBoutiqueIds = new Set(
        approvedBoutiques
          .filter((b) => {
            const bLat = b.latitude ?? b.addressDetails?.lat;
            const bLng = b.longitude ?? b.addressDetails?.lng;
            if (bLat === undefined || bLng === undefined) return false;
            const dist = haversineKm(args.userLat!, args.userLng!, bLat, bLng);
            const effectiveRadius = b.deliveryRadiusKm ?? 15;
            return dist <= effectiveRadius;
          })
          .map((b) => b._id.toString())
      );

      filtered = filtered.filter((p) => deliverableBoutiqueIds.has(p.boutiqueId.toString()));
    }

    const enriched = await enrichProducts(ctx, filtered);
    const purchasable = enriched.filter(
      (p) =>
        p.active &&
        p.boutique &&
        p.boutique.verified &&
        getTotalStock(p.stockBySize) > 0
    );

    purchasable.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b._creationTime - a._creationTime;
    });

    return purchasable.slice(0, 4);
  },
});

/**
 * Run an audit on products to check for quality score inconsistencies, image URL leakages,
 * duplicate storage IDs, empty image arrays, and unresolvable Convex storage IDs.
 */
export const runQualityScoreAudit = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const products = await ctx.db.query("products").take(500);
    
    let totalAudited = 0;
    let corruptedCount = 0;
    let emptyImagesCount = 0;
    let containsHttpCount = 0;
    let duplicateStorageIdsCount = 0;
    let unresolvableStorageIdsCount = 0;
    
    let auditedProducts: Array<{
      id: string;
      name: string;
      issues: string[];
      imagesCount: number;
      qualityScore: number;
    }> = [];
    
    for (const prod of products) {
      totalAudited++;
      const issues: string[] = [];
      const images = prod.images || [];
      const imagesCount = images.length;
      
      // 1. Check empty images
      if (imagesCount === 0) {
        emptyImagesCount++;
        issues.push("Empty image array");
      }
      
      // 2. Check HTTP/HTTPS URL leakage (database corruption from expired URLs)
      // We ignore Unsplash mock URLs to prevent false positives on seeded products
      if (images.length > 0) {
        const hasHttp = images.some((img: any) =>
          typeof img === "string" && (img.startsWith("http://") || img.startsWith("https://")) &&
          !img.includes("unsplash.com")
        );
        if (hasHttp) {
          containsHttpCount++;
          issues.push("Contains resolved HTTP/HTTPS URLs (corrupted reference)");
        }
      }
      
      // 3. Check duplicate storage IDs within the same product
      const uniqueIds = new Set(images);
      if (uniqueIds.size < imagesCount) {
        duplicateStorageIdsCount++;
        issues.push("Contains duplicate storage IDs");
      }
      
      // 4. Check quality score vs image count mismatch (mismatched database state)
      const quality = getProductQualityDetails(prod);
      if (imagesCount >= 3 && quality.score < 35) {
        issues.push(`Low quality score (${quality.score}%) despite having ${imagesCount} images`);
      }
      
      // 5. Check if storage IDs can actually be resolved in Convex storage
      let hasUnresolvable = false;
      for (const imgId of images) {
        if (imgId && typeof imgId === "string" && !imgId.startsWith("http")) {
          try {
            const url = await ctx.storage.getUrl(imgId as any);
            if (!url) {
              hasUnresolvable = true;
            }
          } catch {
            hasUnresolvable = true;
          }
        }
      }
      if (hasUnresolvable) {
        unresolvableStorageIdsCount++;
        issues.push("Contains orphaned/unresolvable Convex storage IDs");
      }
      
      if (issues.length > 0) {
        corruptedCount++;
        auditedProducts.push({
          id: prod._id,
          name: prod.name,
          issues,
          imagesCount,
          qualityScore: quality.score,
        });
      }
    }
    
    return {
      status: "success",
      totalAudited,
      corruptedCount,
      metrics: {
        emptyImagesCount,
        containsHttpCount,
        duplicateStorageIdsCount,
        unresolvableStorageIdsCount,
      },
      corruptedProducts: auditedProducts,
    };
  },
});



