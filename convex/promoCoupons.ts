// convex/promoCoupons.ts
// Admin promo coupon system: CRUD, validation, usage tracking.
// Completely separate from exchange coupons (convex/coupons.ts).

import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireRole, getAuthenticatedUser } from "./lib/auth";

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

    const code = args.code.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
    if (!code || code.length < 3) {
      throw new ConvexError("Coupon code must be at least 3 characters (A-Z, 0-9, dash, underscore).");
    }
    if (code.startsWith("HIVE-")) {
      throw new ConvexError("Codes starting with HIVE- are reserved for exchange coupons.");
    }

    // Check uniqueness
    const existing = await ctx.db
      .query("promoCoupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) {
      throw new ConvexError(`Coupon code "${code}" already exists.`);
    }

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
    let discountPaise: number;
    let discountLabel: string;

    if (coupon.discountType === "percentage") {
      const raw = Math.round((args.cartTotalPaise * coupon.discountValue) / 100);
      discountPaise = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
      discountLabel = `${coupon.discountValue}% off`;
      if (coupon.maxDiscountPaise) {
        discountLabel += ` (up to ₹${(coupon.maxDiscountPaise / 100).toLocaleString("en-IN")})`;
      }
    } else {
      discountPaise = Math.min(coupon.discountValue, args.cartTotalPaise);
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
      message: `${code} applied! You save ₹${(discountPaise / 100).toLocaleString("en-IN")}.`,
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
