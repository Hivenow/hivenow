// convex/adminProducts.ts
// Admin-only product moderation query and mutation APIs.

import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { updateBoutiqueProductCount } from "./boutiques";
import { getPublicUrl, extractR2ObjectKeys } from "./media/api";
import { getAllowedSpecKeys, validateAndCleanProductDetails, validateProductDetailsForCategory } from "./lib/verticals";
import {
  getPlatformConfig,
  calculateAllInclusivePricePaise,
  calculateTierPlatformCharges,
  calculateSellerItemPricing,
} from "./pricingService";
import { triggerNotification } from "./lib/notifications";


/**
 * Quality Score helper function.
 * Calculates score from 6 key listing completeness signals:
 * Photos (16.6%), Description length (16.6%), Price (16.6%), Category (16.6%), Inventory presence (16.6%), Size chart (17%)
 */
export function computeQualityChecks(product: any, categoryName: string) {
  const totalStock = Object.values(product.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
  
  const checks = {
    photos: product.images && product.images.length >= 3,
    description: product.description && product.description.trim().length > 50,
    price: product.price && product.price > 0,
    category: product.categoryId !== undefined,
    inventory: product.sizes && product.sizes.length >= 1 && totalStock > 0,
    sizingChart: true,
  };

  // clothing category check
  const isClothingCategory = ["lehengas", "kurtis", "suits", "salwar suits"].includes(categoryName.toLowerCase());
  if (isClothingCategory) {
    if (!product.measurementMatrix || !Array.isArray(product.measurementMatrix) || product.measurementMatrix.length === 0) {
      checks.sizingChart = false;
    } else {
      // Check that every size in product.sizes has a non-empty chest, waist, shoulder, length
      for (const size of product.sizes) {
        const entry = product.measurementMatrix.find((m: any) => m.size === size);
        if (!entry || !entry.chest?.trim() || !entry.waist?.trim() || !entry.shoulder?.trim() || !entry.length?.trim()) {
          checks.sizingChart = false;
          break;
        }
      }
    }
  }

  let scoreSum = 0;
  scoreSum += checks.photos ? 16.6 : 0;
  scoreSum += checks.description ? 16.6 : 0;
  scoreSum += checks.price ? 16.6 : 0;
  scoreSum += checks.category ? 16.6 : 0;
  scoreSum += checks.inventory ? 16.6 : 0;
  scoreSum += checks.sizingChart ? 17 : 0;

  const qualityScore = Math.max(0, Math.min(100, Math.round(scoreSum)));

  return { qualityScore, qualityChecks: checks };
}

/**
 * Fetch all products with admin filters (search, boutique, status, sandbox filtering) and rich metrics.
 */
export const getAdminProducts = query({
  args: {
    searchTerm: v.optional(v.string()),
    boutiqueId: v.optional(v.id("boutiques")),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("out_of_stock"),
      v.literal("recently_created"),
      v.literal("moderated"),
      v.literal("needs_review"),
      v.literal("pending_approval")
    )),
    excludeTestData: v.optional(v.boolean()),
    sortBy: v.optional(v.union(
      v.literal("lowest_quality"),
      v.literal("highest_claims"),
      v.literal("highest_revenue"),
      v.literal("highest_risk"),
      v.literal("recently_uploaded")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const limit = args.limit ?? 50;

    let products;
    if (args.status === "moderated") {
      products = await ctx.db
        .query("products")
        .withIndex("by_adminHidden", (q) => q.eq("adminHidden", true))
        .take(limit);
    } else if (args.boutiqueId) {
      products = await ctx.db
        .query("products")
        .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", args.boutiqueId!))
        .take(limit);
    } else {
      products = await ctx.db
        .query("products")
        .order("desc")
        .take(limit);
    }

    // 1. Load boutiques maps for sandbox checking and trust tiers
    const boutiqueIds = Array.from(new Set(products.map(p => p.boutiqueId)));
    const boutiques = await Promise.all(boutiqueIds.map(id => ctx.db.get(id)));
    const boutiqueMap = new Map(boutiques.filter(Boolean).map(b => [b!._id, b]));

    // Isolate Sandbox/test data
    const excludeTestData = args.excludeTestData ?? true;
    if (excludeTestData) {
      products = products.filter(p => {
        const b = boutiqueMap.get(p.boutiqueId);
        return b?.isSandbox !== true && b?.isTestData !== true;
      });
    }

    // 2. Load categories and performance metrics in batch
    const categoryIds = Array.from(new Set(products.map(p => p.categoryId)));
    const categories = await Promise.all(categoryIds.map(id => ctx.db.get(id)));
    const categoryMap = new Map(categories.filter(Boolean).map(c => [c!._id, c]));

    const performanceRows = await Promise.all(
      products.map(p =>
        ctx.db
          .query("productPerformance")
          .withIndex("by_productId", (q: any) => q.eq("productId", p._id))
          .first()
      )
    );
    const performanceMap = new Map(performanceRows.filter(Boolean).map(r => [r!.productId, r]));

    // 3. Enrich products
    let enriched: any[] = [];
    for (const p of products) {
      const resolvedImages = await Promise.all(
        p.images.map(async (imgId: any) => {
          if (!imgId) return "";
          if (typeof imgId !== "string") {
            return getPublicUrl(imgId, "pdp");
          }
          if (imgId.startsWith("http")) return imgId;
          try {
            const url = await ctx.storage.getUrl(imgId as any);
            return url || "";
          } catch {
            return imgId;
          }
        })
      );
      const imageUrl = resolvedImages[0] || "";
      const imageUrls = resolvedImages.filter(Boolean);

      const category = categoryMap.get(p.categoryId);
      const categoryName = category?.name || "Uncategorized";
      const boutique = boutiqueMap.get(p.boutiqueId);

      // Performance Stats
      const perf = performanceMap.get(p._id);
      const salesRevenue = perf?.salesRevenue ?? 0;
      const orderCount = perf?.orderCount ?? 0;
      const claimCount = perf?.claimCount ?? 0;
      const approvedClaimCount = perf?.approvedClaimCount ?? 0;
      const lastSoldAt = perf?.lastSoldAt;
      const statsPending = !perf;

      // Quality score
      const { qualityScore, qualityChecks } = computeQualityChecks(p, categoryName);

      // Merchant tier
      const merchantTier = boutique?.merchantTier || "Bronze";
      let trustTier = "Bronze 🥉";
      if (merchantTier === "Elite") trustTier = "Elite 👑";
      else if (merchantTier === "Gold") trustTier = "Gold 🥇";
      else if (merchantTier === "Silver") trustTier = "Silver 🥈";

      // Needs review flag
      const totalStock = Object.values(p.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
      const needsReview = qualityScore < 100 || totalStock < 5 || claimCount > 0 || p.adminHidden === true;

      // Risk score: claimScore + qualityPenalty + stockPenalty + revenueImpact
      const claimScore = claimCount * 40;
      const qualityPenalty = 100 - qualityScore;
      const stockPenalty = totalStock === 0 ? 100 : totalStock === 1 ? 50 : totalStock < 5 ? 20 : 0;
      const revenueImpact = Math.min(50, Math.floor(salesRevenue / 500000)); // Threshold of ₹5000 (500,000 paise)
      const riskScore = claimScore + qualityPenalty + stockPenalty + revenueImpact;

      enriched.push({
        ...p,
        createdAt: p.createdAt ?? p._creationTime,
        approvedAt: p.approvedAt,
        updatedAt: p.updatedAt ?? p.createdAt ?? p._creationTime,
        images: imageUrls,
        imageUrl,
        imageUrls,
        categoryName,
        boutiqueName: boutique?.boutiqueName || "Unknown Boutique",
        salesRevenue,
        orderCount,
        claimCount,
        approvedClaimCount,
        lastSoldAt,
        statsPending,
        qualityScore,
        qualityChecks,
        trustTier,
        needsReview,
        riskScore,
        totalStock,
        approvalStatus: p.approvalStatus,
        approvalNotes: p.approvalNotes,
        lastModeratedAt: p.lastModeratedAt,
      });
    }

    // 4. Apply filters
    if (args.boutiqueId) {
      enriched = enriched.filter(p => p.boutiqueId.toString() === args.boutiqueId!.toString());
    }

    if (args.status) {
      if (args.status === "active") {
        enriched = enriched.filter(p => p.active === true && p.adminHidden !== true);
      } else if (args.status === "inactive") {
        enriched = enriched.filter(p => p.active === false && p.adminHidden !== true);
      } else if (args.status === "out_of_stock") {
        enriched = enriched.filter(p => p.totalStock === 0);
      } else if (args.status === "recently_created") {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        enriched = enriched.filter(p => (p.createdAt ?? p._creationTime) >= sevenDaysAgo);
      } else if (args.status === "moderated") {
        enriched = enriched.filter(p => p.adminHidden === true);
      } else if (args.status === "needs_review") {
        enriched = enriched.filter(p => p.needsReview === true);
      } else if (args.status === "pending_approval") {
        enriched = enriched.filter(p => p.approvalStatus === "pending");
      }
    }

    if (args.searchTerm) {
      const term = args.searchTerm.toLowerCase().trim();
      enriched = enriched.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term)
      );
    }

    // 5. Apply sorting
    const sortBy = args.sortBy || "recently_uploaded";
    if (sortBy === "lowest_quality") {
      enriched.sort((a, b) => a.qualityScore - b.qualityScore);
    } else if (sortBy === "highest_claims") {
      enriched.sort((a, b) => b.claimCount - a.claimCount);
    } else if (sortBy === "highest_revenue") {
      enriched.sort((a, b) => b.salesRevenue - a.salesRevenue);
    } else if (sortBy === "highest_risk") {
      enriched.sort((a, b) => b.riskScore - a.riskScore);
    } else {
      enriched.sort((a, b) => b.createdAt - a.createdAt);
    }

    return enriched;
  },
});

/**
 * Catalog Control Tower Dashboard KPI Metrics.
 * Returns overall clamped Catalog Health Score, Revenue at Risk (paise), and Failing Quality Gate Count.
 */
export const getCatalogDashboardMetricsAdmin = query({
  args: {
    nowBucket: v.optional(v.number()),
  },
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // TODO: Maintain a counter or table of active counts to avoid full scan for allProducts/orders
    const allProducts = await ctx.db.query("products").withIndex("by_active", q => q.eq("active", true)).collect();
    const categories = await ctx.db.query("categories").withIndex("by_active_and_sortOrder", q => q.eq("active", true)).collect();
    const categoryMap = new Map(categories.map(c => [c._id, c]));

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", thirtyDaysAgo))
      .collect();
    const activeClaimsStatuses = ["submitted", "under_review", "evidence_requested", "refund_approved", "refunded", "return_received"];
    const activeClaimsLists = await Promise.all(
      activeClaimsStatuses.map(status =>
        ctx.db.query("claims").withIndex("by_status", q => q.eq("status", status as any)).collect()
      )
    );
    const activeClaims = activeClaimsLists.flat();

    let totalQualityScore = 0;
    let activeProductCount = 0;
    const totalProductsCount = allProducts.length || 1;
    const moderatedProductsCount = allProducts.filter(p => p.adminHidden === true).length;

    for (const p of allProducts) {
      const category = categoryMap.get(p.categoryId);
      const categoryName = category?.name || "Uncategorized";
      const { qualityScore } = computeQualityChecks(p, categoryName);

      if (p.active && !p.adminHidden) {
        totalQualityScore += qualityScore;
        activeProductCount++;
      }
    }

    const averageQuality = activeProductCount > 0 ? (totalQualityScore / activeProductCount) : 100;
    const disputeRate = (activeClaims.length / Math.max(1, orders.length)) * 100; // in percent
    const moderatedRatio = (moderatedProductsCount / totalProductsCount) * 100; // in percent

    // averageQuality - (disputeRate * 5) - (moderatedRatio * 50)
    const rawScore = averageQuality - (disputeRate * 5) - (moderatedRatio * 50);
    const catalogHealthScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    // Revenue at Risk (Delivered or Paid in last 30 days from inactive/moderated/quality < 60 products)
    const recentOrders = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", q => q.gte("createdAt", thirtyDaysAgo))
      .collect();

    const recentOrdersFiltered = recentOrders.filter(
      (o) => o.status === "delivered" || o.paymentStatus === "paid"
    );

    let revenueAtRisk = 0;
    for (const order of recentOrdersFiltered) {
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
        .collect();

      for (const item of orderItems) {
        const product = await ctx.db.get(item.productId);
        if (!product) continue;

        const category = categoryMap.get(product.categoryId);
        const categoryName = category?.name || "Uncategorized";
        const { qualityScore } = computeQualityChecks(product, categoryName);

        const isAtRisk = !product.active || product.adminHidden === true || qualityScore < 60;
        if (isAtRisk) {
          revenueAtRisk += item.subtotal || (item.priceAtPurchase * item.quantity);
        }
      }
    }

    // Failing Quality Gate Count (active non-hidden products with qualityScore < 100)
    let failingQualityGateCount = 0;
    for (const p of allProducts) {
      if (p.active && !p.adminHidden) {
        const category = categoryMap.get(p.categoryId);
        const categoryName = category?.name || "Uncategorized";
        const { qualityScore } = computeQualityChecks(p, categoryName);
        if (qualityScore < 100) {
          failingQualityGateCount++;
        }
      }
    }

    return {
      catalogHealthScore,
      revenueAtRisk,
      failingQualityGateCount,
    };
  },
});


/**
 * Deactivate a product from admin console with a logged reason.
 */
export const deactivateProductAdmin = mutation({
  args: {
    productId: v.id("products"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");
    
    if (args.reason.trim().length < 10) {
      throw new Error("Administrative reason must be at least 10 characters long.");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const now = Date.now();
    await ctx.db.patch(args.productId, {
      active: false,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminUser._id,
      actorRole: "admin",
      action: "product.deactivated_admin",
      entityType: "products",
      entityId: args.productId,
      metadata: JSON.stringify({
        reason: args.reason,
        productName: product.name,
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    return args.productId;
  },
});

/**
 * Reactivate a product from admin console with verification.
 */
export const reactivateProductAdmin = mutation({
  args: {
    productId: v.id("products"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");

    if (args.reason.trim().length < 10) {
      throw new Error("Administrative reason must be at least 10 characters long.");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    // Guard reactivation against stock === 0
    const totalStock = Object.values(product.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
    if (totalStock === 0) {
      throw new Error("Cannot reactivate a product with zero stock.");
    }

    const now = Date.now();
    await ctx.db.patch(args.productId, {
      active: true,
      autoDeactivatedBecauseOutOfStock: false,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminUser._id,
      actorRole: "admin",
      action: "product.reactivated_admin",
      entityType: "products",
      entityId: args.productId,
      metadata: JSON.stringify({
        reason: args.reason,
        productName: product.name,
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    return args.productId;
  },
});

/**
 * Toggle product adminHidden state (moderation status).
 */
export const toggleProductHiddenAdmin = mutation({
  args: {
    productId: v.id("products"),
    adminHidden: v.boolean(),
    moderationCategory: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const now = Date.now();
    const reasonText = args.reason?.trim() || "";

    if (args.adminHidden) {
      if (!args.moderationCategory) {
        throw new Error("Moderation category is required to hide a product.");
      }
      if (reasonText.length < 10) {
        throw new Error("Administrative reason of at least 10 characters is required to hide a product.");
      }

      await ctx.db.patch(args.productId, {
        adminHidden: true,
        moderationCategory: args.moderationCategory,
        adminHiddenReason: reasonText,
        adminHiddenAt: now,
        adminHiddenBy: adminUser._id,
        updatedAt: now,
      });
    } else {
      if (reasonText.length < 10) {
        throw new Error("Administrative reason of at least 10 characters is required to lift moderation.");
      }

      await ctx.db.patch(args.productId, {
        adminHidden: false,
        moderationCategory: undefined,
        adminHiddenReason: undefined,
        adminHiddenAt: undefined,
        adminHiddenBy: undefined,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: adminUser._id,
      actorRole: "admin",
      action: args.adminHidden ? "product.moderated" : "product.unmoderated",
      entityType: "products",
      entityId: args.productId,
      metadata: JSON.stringify({
        reason: reasonText,
        category: args.moderationCategory,
        productName: product.name,
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    return args.productId;
  },
});

/**
 * Retrieve the moderation history of a specific product from audit logs.
 */
export const getProductModerationHistory = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const product = await ctx.db.get(args.productId);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_entityType_entityId", (q) =>
        q.eq("entityType", "products").eq("entityId", args.productId)
      )
      .collect();

    // Filter to all product lifecycle actions
    const lifecycleActions = [
      "product.approve",
      "product.request_changes",
      "product.moderated",
      "product.unmoderated",
      "product.deactivated_admin",
      "product.reactivated_admin",
      "product.updated_admin",
      "product.image_replaced_admin",
    ];

    const filteredLogs = logs.filter((log) => lifecycleActions.includes(log.action));

    // Enrich with actor email
    const enrichedLogs: any[] = await Promise.all(
      filteredLogs.map(async (log) => {
        let actorEmail = "System";
        if (log.actorId) {
          const user = await ctx.db.get(log.actorId);
          if (user) {
            actorEmail = user.email || "No Email";
          }
        }
        return {
          ...log,
          actorEmail,
        };
      })
    );

    // Ensure the initial product upload/creation event is always present in the timeline
    if (product) {
      const initialUploadTime = product.createdAt ?? product._creationTime;
      const boutique = await ctx.db.get(product.boutiqueId);
      const storeName = (boutique as any)?.boutiqueName || (boutique as any)?.name || "Store";
      enrichedLogs.push({
        _id: `synthetic-create-${product._id}` as any,
        _creationTime: initialUploadTime,
        actorRole: "merchant",
        action: "product.created",
        entityType: "products",
        entityId: product._id,
        metadata: JSON.stringify({
          productName: product.name,
          boutiqueName: storeName,
          category: product.categoryId,
        }),
        createdAt: initialUploadTime,
        actorEmail: `${storeName} (Merchant)`,
      });
    }

    // Sort by createdAt descending (newest first)
    enrichedLogs.sort((a, b) => b.createdAt - a.createdAt);

    return enrichedLogs;
  },
});

/**
 * Approve a product listing.
 * Admin-only mutation.
 */
export const approveProductAdmin = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      approvalStatus: "approved",
      approvedAt: now,
      approvedBy: admin._id,
      lastModeratedAt: now,
      approvalNotes: undefined, // Clear feedback notes
    });

    // Write system audit logs
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "product.approve",
      entityType: "products",
      entityId: args.id,
      metadata: JSON.stringify({
        name: product.name,
        boutiqueId: product.boutiqueId,
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    const boutique = await ctx.db.get(product.boutiqueId);
    await triggerNotification(ctx, admin._id, "slack", "admin_product_approved", "product", args.id, JSON.stringify({
      productName: product.name,
      boutiqueName: boutique?.name || "Boutique",
    }));

    return args.id;
  },
});

/**
 * Request changes for a product listing.
 * Admin-only mutation.
 */
export const requestChangesProductAdmin = mutation({
  args: { id: v.id("products"), notes: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    // Enforce safety guard: require meaningful notes of at least 10 characters
    if (args.notes.trim().length < 10) {
      throw new Error("Safety Guard: Please provide a meaningful note of at least 10 characters detailing the requested changes.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      approvalStatus: "changes_requested",
      approvalNotes: args.notes.trim(),
      lastModeratedAt: now,
    });

    const boutique = await ctx.db.get(product.boutiqueId);
    await triggerNotification(ctx, admin._id, "slack", "admin_product_rejected", "product", args.id, JSON.stringify({
      productName: product.name,
      boutiqueName: boutique?.name || "Boutique",
      reason: args.notes.trim(),
    }));

    // Write system audit logs
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "product.request_changes",
      entityType: "products",
      entityId: args.id,
      metadata: JSON.stringify({
        name: product.name,
        boutiqueId: product.boutiqueId,
        notes: args.notes.trim(),
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    return args.id;
  },
});

/**
 * Update product details from admin console.
 * Admin-only mutation.
 */
/**
 * Price split for the admin product editor, from the same pricing engine
 * checkout and the seller portal use, with the product's boutique tier.
 */
export const getProductPricingPreviewAdmin = query({
  args: {
    productId: v.id("products"),
    basePricePaise: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (!(args.basePricePaise > 0)) return null;
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const boutique = await ctx.db.get(product.boutiqueId);
    const tierKey = (boutique as any)?.pricingTier || "bronze";
    const config = await getPlatformConfig(ctx);

    const charges = calculateTierPlatformCharges(tierKey, config);
    const seller = calculateSellerItemPricing(args.basePricePaise, tierKey, config);
    return {
      tierName: seller.tierName,
      customerPricePaise: calculateAllInclusivePricePaise(args.basePricePaise, tierKey, config),
      handlingChargePaise: charges.handlingChargePaise,
      platformFeePaise: charges.platformFeePaise,
      platformChargesGstPaise: charges.platformChargesGstPaise,
      sellerCommissionPercent: seller.sellerCommissionPercent,
      sellerCommissionPaise: seller.sellerCommissionPaise,
      sellerCommissionGstPaise: seller.sellerCommissionGstPaise,
      sellerPayoutPaise: seller.sellerPayoutPaise,
    };
  },
});

export const updateProductDetailsAdmin = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    price: v.optional(v.number()),
    discountPrice: v.optional(v.number()),
    sizes: v.optional(v.array(v.string())),
    stockBySize: v.optional(v.record(v.string(), v.number())),
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
    material: v.optional(v.string()),
    care: v.optional(v.string()),
    origin: v.optional(v.string()),
    fitNote: v.optional(v.string()),
    story: v.optional(v.string()),
    occasion: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    const now = Date.now();

    // Clean details if provided, strictly rejecting invalid keys
    const cleanedDetails: Record<string, string> | undefined =
      args.details !== undefined
        ? await validateProductDetailsForCategory(
            ctx.db,
            (args.categoryId ?? product.categoryId) as Id<"categories">,
            args.details,
            product.verticalType
          )
        : undefined;

    // Compute stock totals if sizes/stock modified
    const currentStockBySize = product.stockBySize || {};
    const updatedStockBySize = args.stockBySize !== undefined ? args.stockBySize : currentStockBySize;
    const totalStock = Object.values(updatedStockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);

    // Active state logic based on stock and input args
    let active = args.active !== undefined ? args.active : product.active;
    let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

    if (totalStock === 0) {
      active = false;
      autoDeactivatedBecauseOutOfStock = true;
    } else if (product.autoDeactivatedBecauseOutOfStock && totalStock > 0) {
      active = true;
      autoDeactivatedBecauseOutOfStock = false;
    } else if (totalStock > 0) {
      autoDeactivatedBecauseOutOfStock = false;
    }

    // Pricing — all DB values and args.price are in PAISE. args.price is the
    // seller's BASE price; the stored `price` is the all-inclusive storefront
    // price, computed exactly as the seller's own create/update does. Writing
    // the base price into `price` drops the fees and makes checkout reject the
    // item as a subtotal mismatch.
    const basePricePaise = args.price !== undefined ? args.price : (product.basePrice ?? product.price ?? 0);
    let customerPrice = product.price;
    const baseDiscountPricePaise = args.discountPrice !== undefined ? args.discountPrice : product.baseDiscountPrice;
    let customerDiscountPrice = product.discountPrice;

    if (args.price !== undefined || args.discountPrice !== undefined) {
      const boutique = await ctx.db.get(product.boutiqueId);
      const tierKey = (boutique as any)?.pricingTier || "bronze";
      const config = await getPlatformConfig(ctx);
      customerPrice = calculateAllInclusivePricePaise(basePricePaise, tierKey, config);
      customerDiscountPrice = baseDiscountPricePaise
        ? calculateAllInclusivePricePaise(baseDiscountPricePaise, tierKey, config)
        : undefined;
    }


    // Prepare updates
    const updates: any = {
      updatedAt: now,
      active,
      autoDeactivatedBecauseOutOfStock,
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
    if (args.price !== undefined) {
      updates.basePrice = args.price;
      updates.price = customerPrice;
    }
    if (args.discountPrice !== undefined || args.price !== undefined) {
      updates.baseDiscountPrice = baseDiscountPricePaise;
      updates.discountPrice = customerDiscountPrice;
    }
    if (args.sizes !== undefined) updates.sizes = args.sizes;
    if (args.stockBySize !== undefined) updates.stockBySize = args.stockBySize;
    if (cleanedDetails !== undefined) updates.details = cleanedDetails;
    if (args.fitRecommendation !== undefined) updates.fitRecommendation = args.fitRecommendation;
    if (args.silhouette !== undefined) updates.silhouette = args.silhouette;
    if (args.material !== undefined) updates.material = args.material;
    if (args.care !== undefined) updates.care = args.care;
    if (args.origin !== undefined) updates.origin = args.origin;
    if (args.fitNote !== undefined) updates.fitNote = args.fitNote;
    if (args.story !== undefined) updates.story = args.story;
    if (args.occasion !== undefined) updates.occasion = args.occasion;

    await ctx.db.patch(args.id, updates);

    // Audit Log entry
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "product.updated_admin",
      entityType: "products",
      entityId: args.id,
      metadata: JSON.stringify({
        productName: product.name,
        modifiedFields: Object.keys(updates).filter(k => k !== "updatedAt"),
      }),
      createdAt: now,
    });

    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    return args.id;
  },
});

// ─── ADMIN HARD DELETE ──────────────────────────────────────────────────────

/**
 * Admin-only mutation that permanently deletes a product.
 *
 * R2 objects are cleaned by a scheduled internal action, which only runs if this
 * mutation commits. Object keys come from the product record, never from the client.
 *
 * Legacy Convex storage IDs are cleaned inline via ctx.storage.delete().
 */
export const deleteProductAdmin = mutation({
  args: {
    productId: v.id("products"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found.");
    }

    // Extract R2 objectKeys from ImageAsset entries
    const objectKeys = extractR2ObjectKeys(product.images || []);

    // Clean legacy Convex storage IDs (strings that aren't URLs or ImageAssets)
    for (const img of product.images || []) {
      if (img && typeof img === "string" && !img.startsWith("http")) {
        try {
          await ctx.storage.delete(img as any);
        } catch (e) {
          console.error("[deleteProductAdmin] Legacy storage delete failed:", img, e);
        }
      }
    }

    // Schedule R2 object cleanup
    if (objectKeys.length > 0) {
      await ctx.scheduler.runAfter(0, internal.media.api.deleteR2Objects, {
        objectKeys,
        actorId: admin._id,
      });
    }

    // Hard delete the product document
    await ctx.db.delete(args.productId);
    await updateBoutiqueProductCount(ctx, product.boutiqueId);

    // Audit log
    const boutique = await ctx.db.get(product.boutiqueId);
    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: admin._id,
      action: "products.admin_hard_delete",
      entityType: "products",
      entityId: args.productId,
      metadata: JSON.stringify({
        productName: product.name,
        boutiqueName: (boutique as any)?.boutiqueName || (boutique as any)?.name || "Unknown",
        reason: args.reason,
        r2ObjectKeys: objectKeys,
      }),
      createdAt: Date.now(),
    });

    return { productId: args.productId, objectKeys };
  },
});

// ─── ADMIN IMAGE REPLACE ────────────────────────────────────────────────────

/**
 * Admin-only mutation that replaces a single image in a product's images array.
 *
 * Used by the admin crop workflow: the frontend crops the image client-side,
 * uploads the cropped version to R2 via /api/upload/r2, then calls this mutation
 * to swap the old entry (string URL or ImageAsset) with the new one.
 *
 * The old R2 object (if it was an ImageAsset) is scheduled for deletion.
 */
export const replaceProductImageAdmin = mutation({
  args: {
    productId: v.id("products"),
    imageIndex: v.number(),
    // The new image — can be a plain URL string or a full ImageAsset object
    newImage: v.union(
      v.string(),
      v.object({
        assetId: v.string(),
        ownerType: v.string(),
        ownerId: v.string(),
        storageProvider: v.string(),
        bucket: v.string(),
        objectKey: v.string(),
        status: v.union(v.literal("pending"), v.literal("processing"), v.literal("ready"), v.literal("failed"), v.literal("deleted")),
        displayOrder: v.number(),
        width: v.number(),
        height: v.number(),
        size: v.number(),
        mime: v.string(),
        checksum: v.optional(v.string()),
        contentHash: v.optional(v.string()),
        alt: v.optional(v.string()),
        imageRole: v.optional(
          v.union(
            v.literal("PRIMARY"),
            v.literal("BACK"),
            v.literal("DETAIL"),
            v.literal("FABRIC"),
            v.literal("LIFESTYLE"),
            v.literal("OTHER")
          )
        ),
        variants: v.optional(v.object({
          thumbnail: v.optional(v.string()),
          card: v.optional(v.string()),
          pdp: v.optional(v.string()),
          zoom: v.optional(v.string()),
        })),
        uploadedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product not found" });
    }

    const images = [...(product.images || [])];
    if (args.imageIndex < 0 || args.imageIndex >= images.length) {
      throw new ConvexError({
        code: "INVALID_INDEX",
        message: `Invalid image index ${args.imageIndex}. Product has ${images.length} images.`,
      });
    }

    // Capture old image for potential R2 cleanup
    const oldImage = images[args.imageIndex];
    let oldObjectKeys: string[] = [];
    try {
      oldObjectKeys = extractR2ObjectKeys([oldImage]);
    } catch {
      // Old image might be a plain URL string — no R2 key to extract
    }

    // Replace the image at the specified index
    images[args.imageIndex] = args.newImage as any;

    const now = Date.now();
    await ctx.db.patch(args.productId, {
      images,
      updatedAt: now,
    });

    // Schedule R2 cleanup for the old image (best-effort, don't fail the mutation)
    if (oldObjectKeys.length > 0) {
      try {
        await ctx.scheduler.runAfter(0, internal.media.api.deleteR2Objects, {
          objectKeys: oldObjectKeys,
          actorId: admin._id,
        });
      } catch (e) {
        console.error("[replaceProductImageAdmin] R2 cleanup scheduling failed:", e);
      }
    }

    // Audit log
    try {
      await ctx.db.insert("auditLogs", {
        actorId: admin._id,
        actorRole: "admin",
        action: "product.image_replaced_admin",
        entityType: "products",
        entityId: args.productId,
        metadata: JSON.stringify({
          productName: product.name,
          imageIndex: args.imageIndex,
          oldObjectKeys,
          newImageType: typeof args.newImage === "string" ? "url" : "ImageAsset",
        }),
        createdAt: now,
      });
    } catch (e) {
      // Don't fail the mutation just because audit logging failed
      console.error("[replaceProductImageAdmin] Audit log insert failed:", e);
    }

    return { productId: args.productId, imageIndex: args.imageIndex };
  },
});
