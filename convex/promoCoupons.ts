// convex/promoCoupons.ts
// Admin promo coupon system: CRUD, validation, usage tracking.
// Completely separate from exchange coupons (convex/coupons.ts).

import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireRole, getAuthenticatedUser, getMyBoutique } from "./lib/auth";

// ─── Discount math (shared) ─────────────────────────────────────────────────

/**
 * The one discount calculation for promo coupons. The coupon card, the review
 * page price breakdown and the checkout session all call this, so the customer
 * is shown and charged the same amount to the paisa.
 *
 * `productSubtotalPaise` is the all-inclusive item total the customer sees
 * (delivery excluded).
 */
export function computePromoDiscountPaise(
  coupon: Pick<Doc<"promoCoupons">, "discountType" | "discountValue" | "maxDiscountPaise">,
  productSubtotalPaise: number
): number {
  if (productSubtotalPaise <= 0) return 0;
  if (coupon.discountType === "percentage") {
    const raw = Math.round((productSubtotalPaise * coupon.discountValue) / 100);
    const capped = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
    return Math.min(capped, productSubtotalPaise);
  }
  return Math.min(coupon.discountValue, productSubtotalPaise);
}

/** Normalises a new coupon code and rejects reserved or duplicate codes. */
async function claimCouponCode(ctx: MutationCtx, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
  if (!code || code.length < 3) {
    throw new ConvexError("Coupon code must be at least 3 characters (A-Z, 0-9, dash, underscore).");
  }
  if (code.startsWith("HIVE-")) {
    throw new ConvexError("Codes starting with HIVE- are reserved for exchange coupons.");
  }
  const existing = await ctx.db
    .query("promoCoupons")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (existing) {
    throw new ConvexError(`Coupon code "${code}" already exists.`);
  }
  return code;
}

// ─── Admin: Create ──────────────────────────────────────────────────────────

export const createPromoCoupon = mutation({
  args: {
    code: v.string(),
    description: v.string(),
    discountType: v.union(v.literal("percentage"), v.literal("fixed")),
    discountValue: v.number(),
    minOrderPaise: v.number(),
    maxDiscountPaise: v.optional(v.number()),
    usageLimit: v.number(),
    perUserLimit: v.number(),
    scope: v.union(v.literal("platform"), v.literal("boutique")),
    boutiqueId: v.optional(v.id("boutiques")),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();
    const code = await claimCouponCode(ctx, args.code);

    if (args.scope === "boutique" && !args.boutiqueId) {
      throw new ConvexError("Boutique ID is required for boutique-scoped coupons.");
    }
    if (args.discountValue <= 0) {
      throw new ConvexError("Discount value must be greater than 0.");
    }
    if (args.usageLimit <= 0) {
      throw new ConvexError("Usage limit must be at least 1.");
    }

    const couponId = await ctx.db.insert("promoCoupons", {
      code,
      description: args.description.trim(),
      discountType: args.discountType,
      discountValue: args.discountValue,
      minOrderPaise: args.minOrderPaise,
      maxDiscountPaise: args.maxDiscountPaise,
      usageLimit: args.usageLimit,
      perUserLimit: args.perUserLimit || 1,
      usedCount: 0,
      scope: args.scope,
      boutiqueId: args.scope === "boutique" ? args.boutiqueId : undefined,
      // Admin-created coupons are Hive's marketing spend; the seller is paid in full.
      fundedBy: "platform",
      status: "active",
      startsAt: args.startsAt,
      expiresAt: args.expiresAt,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, couponId, code };
  },
});

// ─── Admin: Update ──────────────────────────────────────────────────────────

export const updatePromoCoupon = mutation({
  args: {
    couponId: v.id("promoCoupons"),
    description: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    discountValue: v.optional(v.number()),
    minOrderPaise: v.optional(v.number()),
    maxDiscountPaise: v.optional(v.number()),
    usageLimit: v.optional(v.number()),
    perUserLimit: v.optional(v.number()),
    scope: v.optional(v.union(v.literal("platform"), v.literal("boutique"))),
    boutiqueId: v.optional(v.id("boutiques")),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("expired"))),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) throw new ConvexError("Coupon not found.");
    if (
      coupon.fundedBy === "seller" &&
      ((args.scope !== undefined && args.scope !== "boutique") ||
        (args.boutiqueId !== undefined && args.boutiqueId !== coupon.boutiqueId))
    ) {
      throw new ConvexError("A seller-funded coupon can only apply to the seller's own store.");
    }

    const patch: any = { updatedAt: Date.now() };
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.discountType !== undefined) patch.discountType = args.discountType;
    if (args.discountValue !== undefined) patch.discountValue = args.discountValue;
    if (args.minOrderPaise !== undefined) patch.minOrderPaise = args.minOrderPaise;
    if (args.maxDiscountPaise !== undefined) patch.maxDiscountPaise = args.maxDiscountPaise;
    if (args.usageLimit !== undefined) patch.usageLimit = args.usageLimit;
    if (args.perUserLimit !== undefined) patch.perUserLimit = args.perUserLimit;
    if (args.scope !== undefined) patch.scope = args.scope;
    if (args.boutiqueId !== undefined) patch.boutiqueId = args.boutiqueId;
    if (args.startsAt !== undefined) patch.startsAt = args.startsAt;
    if (args.expiresAt !== undefined) patch.expiresAt = args.expiresAt;
    if (args.status !== undefined) patch.status = args.status;

    await ctx.db.patch(args.couponId, patch);
    return { success: true };
  },
});

// ─── Admin: Toggle Status ───────────────────────────────────────────────────

export const togglePromoCouponStatus = mutation({
  args: { couponId: v.id("promoCoupons") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) throw new ConvexError("Coupon not found.");

    const newStatus = coupon.status === "active" ? "paused" : "active";
    await ctx.db.patch(args.couponId, { status: newStatus, updatedAt: Date.now() });
    return { success: true, newStatus };
  },
});

// ─── Admin: List All Promo Coupons ──────────────────────────────────────────

export const listPromoCouponsAdmin = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("expired"))),
    searchCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    let coupons = await ctx.db.query("promoCoupons").collect();

    if (args.status) {
      coupons = coupons.filter((c) => c.status === args.status);
    }
    if (args.searchCode) {
      const needle = args.searchCode.trim().toUpperCase();
      coupons = coupons.filter((c) => c.code.includes(needle));
    }

    coupons.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      coupons.slice(0, 200).map(async (c) => {
        const boutique = c.boutiqueId ? await ctx.db.get(c.boutiqueId) : null;
        return {
          _id: c._id,
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderPaise: c.minOrderPaise,
          maxDiscountPaise: c.maxDiscountPaise,
          usageLimit: c.usageLimit,
          perUserLimit: c.perUserLimit,
          usedCount: c.usedCount,
          scope: c.scope,
          boutiqueId: c.boutiqueId,
          boutiqueName: boutique?.boutiqueName || boutique?.name || null,
          fundedBy: c.fundedBy ?? "platform",
          status: c.status,
          startsAt: c.startsAt,
          expiresAt: c.expiresAt,
          createdAt: c.createdAt,
        };
      })
    );
  },
});

// ─── Admin: Coupon Detail + Usage Log ───────────────────────────────────────

export const getPromoCouponDetailAdmin = query({
  args: { couponId: v.id("promoCoupons") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) throw new ConvexError("Coupon not found.");

    const boutique = coupon.boutiqueId ? await ctx.db.get(coupon.boutiqueId) : null;

    const usages = await ctx.db
      .query("promoCouponUsages")
      .withIndex("by_promoCouponId", (q) => q.eq("promoCouponId", args.couponId))
      .collect();

    const usageDetails = await Promise.all(
      usages
        .sort((a, b) => b.usedAt - a.usedAt)
        .slice(0, 200)
        .map(async (u) => {
          const user = await ctx.db.get(u.userId);
          return {
            _id: u._id,
            userId: u.userId,
            userName: (user as any)?.displayName || user?.email || user?.phone || "Customer",
            userEmail: user?.email || null,
            orderId: u.orderId,
            orderNumber: u.orderNumber,
            discountAppliedPaise: u.discountAppliedPaise,
            usedAt: u.usedAt,
          };
        })
    );

    return {
      ...coupon,
      boutiqueName: boutique?.boutiqueName || boutique?.name || null,
      usages: usageDetails,
      totalDiscountGivenPaise: usages.reduce((sum, u) => sum + u.discountAppliedPaise, 0),
    };
  },
});

// ─── Admin: Stats Summary ───────────────────────────────────────────────────

export const getPromoCouponStatsAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const coupons = await ctx.db.query("promoCoupons").collect();
    const usages = await ctx.db.query("promoCouponUsages").collect();

    const active = coupons.filter((c) => c.status === "active");

    return {
      activeCoupons: active.length,
      totalRedemptions: usages.length,
      totalDiscountGivenPaise: usages.reduce((sum, u) => sum + u.discountAppliedPaise, 0),
      expiringWithin7Days: active.filter(
        (c) => c.expiresAt && c.expiresAt > now && c.expiresAt - now < sevenDays
      ).length,
    };
  },
});

// ─── Seller: own coupons (seller-funded) ────────────────────────────────────
//
// A coupon a boutique creates is paid for by that boutique: the discount comes
// out of its payout, and Hive's commission is charged on the discounted price.
// It only ever applies to the boutique's own items.

const SELLER_MAX_PERCENT = 50;
const SELLER_MIN_FIXED_PAISE = 1000; // ₹10
const SELLER_MAX_FIXED_PAISE = 500000; // ₹5,000
const SELLER_MAX_USAGE_LIMIT = 10000;

export const listMyPromoCoupons = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, args.token, true);
    const coupons = await ctx.db
      .query("promoCoupons")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .collect();

    const rows = await Promise.all(
      coupons.map(async (c) => {
        const usages = await ctx.db
          .query("promoCouponUsages")
          .withIndex("by_promoCouponId", (q) => q.eq("promoCouponId", c._id))
          .collect();
        return {
          _id: c._id,
          code: c.code,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderPaise: c.minOrderPaise,
          maxDiscountPaise: c.maxDiscountPaise,
          usageLimit: c.usageLimit,
          perUserLimit: c.perUserLimit,
          usedCount: c.usedCount,
          status: c.status,
          startsAt: c.startsAt,
          expiresAt: c.expiresAt,
          createdAt: c.createdAt,
          fundedBy: c.fundedBy ?? "platform",
          totalDiscountGivenPaise: usages.reduce((sum, u) => sum + u.discountAppliedPaise, 0),
        };
      })
    );
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});

export const createMyPromoCoupon = mutation({
  args: {
    code: v.string(),
    discountType: v.union(v.literal("percentage"), v.literal("fixed")),
    discountValue: v.number(),
    minOrderPaise: v.number(),
    maxDiscountPaise: v.optional(v.number()),
    usageLimit: v.number(),
    perUserLimit: v.number(),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const boutique = await getMyBoutique(ctx, args.token);
    const now = Date.now();

    if (args.discountType === "percentage") {
      if (!Number.isInteger(args.discountValue) || args.discountValue < 1 || args.discountValue > SELLER_MAX_PERCENT) {
        throw new ConvexError(`Percentage off must be a whole number from 1 to ${SELLER_MAX_PERCENT}.`);
      }
    } else if (
      !Number.isInteger(args.discountValue) ||
      args.discountValue < SELLER_MIN_FIXED_PAISE ||
      args.discountValue > SELLER_MAX_FIXED_PAISE
    ) {
      throw new ConvexError("Flat discount must be between ₹10 and ₹5,000.");
    }
    if (args.maxDiscountPaise !== undefined && args.maxDiscountPaise < 100) {
      throw new ConvexError("Maximum discount must be at least ₹1.");
    }
    if (!Number.isInteger(args.minOrderPaise) || args.minOrderPaise < 0) {
      throw new ConvexError("Minimum order can't be negative.");
    }
    if (!Number.isInteger(args.usageLimit) || args.usageLimit < 1 || args.usageLimit > SELLER_MAX_USAGE_LIMIT) {
      throw new ConvexError(`Total uses must be between 1 and ${SELLER_MAX_USAGE_LIMIT.toLocaleString("en-IN")}.`);
    }
    if (!Number.isInteger(args.perUserLimit) || args.perUserLimit < 1) {
      throw new ConvexError("Uses per customer must be at least 1.");
    }
    if (args.expiresAt !== undefined && args.expiresAt <= (args.startsAt ?? now)) {
      throw new ConvexError("End date must be after the start date.");
    }

    const code = await claimCouponCode(ctx, args.code);
    const couponId = await ctx.db.insert("promoCoupons", {
      code,
      description: `Created by ${boutique.boutiqueName || boutique.name || "seller"}`,
      discountType: args.discountType,
      discountValue: args.discountValue,
      minOrderPaise: args.minOrderPaise,
      maxDiscountPaise: args.discountType === "percentage" ? args.maxDiscountPaise : undefined,
      usageLimit: args.usageLimit,
      perUserLimit: args.perUserLimit,
      usedCount: 0,
      scope: "boutique",
      boutiqueId: boutique._id,
      fundedBy: "seller",
      status: "active",
      startsAt: args.startsAt,
      expiresAt: args.expiresAt,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, couponId, code };
  },
});

export const toggleMyPromoCouponStatus = mutation({
  args: { couponId: v.id("promoCoupons"), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, args.token);
    const coupon = await ctx.db.get(args.couponId);
    // Sellers manage only coupons they pay for; Hive-funded ones stay with admin.
    if (!coupon || coupon.boutiqueId !== boutique._id || coupon.fundedBy !== "seller") {
      throw new ConvexError("Coupon not found.");
    }
    if (coupon.status === "expired") {
      throw new ConvexError("This coupon has expired. Create a new one instead.");
    }
    const newStatus = coupon.status === "active" ? "paused" : "active";
    await ctx.db.patch(args.couponId, { status: newStatus, updatedAt: Date.now() });
    return { success: true, newStatus };
  },
});

// ─── Customer: Validate Promo Code ──────────────────────────────────────────

export const validatePromoCode = query({
  args: {
    code: v.string(),
    boutiqueIds: v.array(v.id("boutiques")),
    cartTotalPaise: v.number(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const now = Date.now();

    const code = args.code.trim().toUpperCase();
    const coupon = await ctx.db
      .query("promoCoupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!coupon) {
      return { valid: false as const, reason: "not_found", message: "That coupon code isn't valid." };
    }

    // Status check
    if (coupon.status === "paused") {
      return { valid: false as const, reason: "paused", message: "This coupon is currently not available." };
    }
    if (coupon.status === "expired") {
      return { valid: false as const, reason: "expired", message: "This coupon has expired." };
    }

    // Time window checks
    if (coupon.startsAt && coupon.startsAt > now) {
      return { valid: false as const, reason: "not_started", message: "This coupon isn't active yet." };
    }
    if (coupon.expiresAt && coupon.expiresAt <= now) {
      return { valid: false as const, reason: "expired", message: "This coupon has expired." };
    }

    // Global usage limit
    if (coupon.usedCount >= coupon.usageLimit) {
      return { valid: false as const, reason: "limit_reached", message: "This coupon has reached its usage limit." };
    }

    // Per-user limit
    const userUsages = await ctx.db
      .query("promoCouponUsages")
      .withIndex("by_promoCouponId_userId", (q) =>
        q.eq("promoCouponId", coupon._id).eq("userId", user._id)
      )
      .collect();
    if (userUsages.length >= coupon.perUserLimit) {
      return { valid: false as const, reason: "user_limit", message: "You've already used this coupon." };
    }

    // Boutique scope check
    if (coupon.scope === "boutique" && coupon.boutiqueId) {
      const uniqueBoutiques = Array.from(new Set(args.boutiqueIds));
      if (uniqueBoutiques.some((id) => id !== coupon.boutiqueId)) {
        const boutique = await ctx.db.get(coupon.boutiqueId);
        const name = boutique?.boutiqueName || boutique?.name || "the associated boutique";
        return {
          valid: false as const,
          reason: "wrong_boutique",
          message: `This coupon only works on items from ${name}.`,
        };
      }
    }

    // Min order value check
    if (args.cartTotalPaise < coupon.minOrderPaise) {
      const minRupees = (coupon.minOrderPaise / 100).toLocaleString("en-IN");
      return {
        valid: false as const,
        reason: "min_order",
        message: `Add ₹${minRupees} more to use this coupon.`,
      };
    }

    // Calculate discount
    const discountPaise = computePromoDiscountPaise(coupon, args.cartTotalPaise);
    let discountLabel: string;

    if (coupon.discountType === "percentage") {
      discountLabel = `${coupon.discountValue}% off`;
      if (coupon.maxDiscountPaise) {
        discountLabel += ` (up to ₹${(coupon.maxDiscountPaise / 100).toLocaleString("en-IN")})`;
      }
    } else {
      discountLabel = `₹${(coupon.discountValue / 100).toLocaleString("en-IN")} off`;
    }

    return {
      valid: true as const,
      promoCouponId: coupon._id,
      code: coupon.code,
      discountPaise,
      discountLabel,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      fundedBy: coupon.fundedBy ?? "platform",
      message: `${code} applied! You save ₹${(discountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`,
    };
  },
});

/**
 * Helper to atomically increment usedCount and record usage in the same transaction.
 * Idempotent on orderId — won't double-count if retried.
 */
export async function recordPromoCouponUsageHelper(
  ctx: MutationCtx,
  args: {
    promoCouponId: Id<"promoCoupons">;
    userId: Id<"users">;
    orderId: Id<"orders">;
    orderNumber: string;
    discountAppliedPaise: number;
  }
) {
  const now = Date.now();

  // Idempotency check
  const existing = await ctx.db
    .query("promoCouponUsages")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", args.orderId))
    .first();
  if (existing) {
    return { success: true, reason: "already_recorded" };
  }

  const coupon = await ctx.db.get(args.promoCouponId);
  if (!coupon) return { success: false, reason: "coupon_not_found" };

  // Increment the global counter
  await ctx.db.patch(args.promoCouponId, {
    usedCount: coupon.usedCount + 1,
    updatedAt: now,
  });

  // Record the usage
  await ctx.db.insert("promoCouponUsages", {
    promoCouponId: args.promoCouponId,
    userId: args.userId,
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    discountAppliedPaise: args.discountAppliedPaise,
    usedAt: now,
  });

  return { success: true };
}

/**
 * Internal mutation wrapper for recordPromoCouponUsageHelper.
 */
export const recordPromoCouponUsage = internalMutation({
  args: {
    promoCouponId: v.id("promoCoupons"),
    userId: v.id("users"),
    orderId: v.id("orders"),
    orderNumber: v.string(),
    discountAppliedPaise: v.number(),
  },
  handler: async (ctx, args) => {
    return await recordPromoCouponUsageHelper(ctx, args);
  },
});
