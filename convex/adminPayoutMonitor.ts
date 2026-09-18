import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireRole } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { refundCancelledOrder } from "./lib/refunds";
import { resolveManualPayoutPaise } from "./adminFinance";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Seller payout monitor.
 *
 * The reconciliation page only lists orders whose payoutStatus is "pending", so
 * a failed or stuck Route transfer appeared nowhere and a seller could go unpaid
 * without anyone noticing. This module returns every order's money alongside the
 * state of its payout, filterable by seller, payout state, date and order number.
 */

const STUCK_PROCESSING_MS = 10 * 60 * 1000;
const STUCK_ELIGIBLE_MS = 60 * 60 * 1000;

/**
 * Why an order needs a human. Empty array means the payout is on a healthy path.
 */
function attentionReasons(
  order: Doc<"orders">,
  boutique: Doc<"boutiques"> | null,
  now: number
): string[] {
  // Test-mode orders are frozen history; nothing about them needs a human.
  if (order.isTestData) return [];

  const reasons: string[] = [];
  const payoutStatus = order.payoutStatus;
  const isFinished = payoutStatus === "paid" || payoutStatus === "settled";

  if (payoutStatus === "failed") {
    reasons.push(order.payoutFailureReason || "Payout failed");
  }
  if (order.transferStatus === "failed") {
    reasons.push("Razorpay transfer failed");
  }
  if (
    payoutStatus === "processing" &&
    now - (order.updatedAt ?? 0) > STUCK_PROCESSING_MS
  ) {
    reasons.push("Stuck in processing");
  }
  if (
    payoutStatus === "eligible" &&
    !order.razorpayTransferId &&
    now - (order.payoutEligibleAt ?? order.updatedAt ?? now) > STUCK_ELIGIBLE_MS
  ) {
    reasons.push("Eligible for over an hour, no transfer");
  }
  if (order.disputeStatus === "open" || order.disputeStatus === "lost") {
    reasons.push(`Chargeback ${order.disputeStatus}`);
  }
  if (
    !isFinished &&
    order.status === "delivered" &&
    !boutique?.razorpayAccountId
  ) {
    reasons.push("Seller has no Razorpay account — cannot be paid by Route");
  }
  if (!isFinished && boutique?.payoutsFrozen) {
    reasons.push(
      `Seller payouts frozen${boutique.payoutsFrozenReason ? `: ${boutique.payoutsFrozenReason}` : ""}`
    );
  }
  return reasons;
}

/**
 * Retryable mirrors convex/orders.ts requirePayoutRetryPermission, so the UI only
 * offers Retry where the gate would actually let it through.
 */
function isRetryable(order: Doc<"orders">, now: number): boolean {
  if (order.isTestData) return false;
  if (order.razorpayTransferId) return false;
  if (order.payoutStatus === "paid" || order.payoutStatus === "settled") return false;
  if (order.status !== "delivered") return false;
  if (order.payoutStatus === "failed" || order.payoutStatus === "eligible") return true;
  return (
    order.payoutStatus === "processing" &&
    now - (order.updatedAt ?? 0) > STUCK_PROCESSING_MS
  );
}

export const getPayoutMonitorAdmin = query({
  args: {
    payoutStatus: v.optional(v.string()),   // one of PAYOUT_STATES, "none", or "attention"
    boutiqueId: v.optional(v.id("boutiques")),
    search: v.optional(v.string()),         // order number, transfer id or payment id
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    includeTestData: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const now = Date.now();
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);

    // Only paid orders carry a seller payout; unpaid ones would be noise.
    const allOrders = args.boutiqueId
      ? await ctx.db
          .query("orders")
          .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", args.boutiqueId!))
          .collect()
      : await ctx.db.query("orders").withIndex("by_createdAt").order("desc").collect();

    const moneyOrders = allOrders.filter(
      (o) => o.paymentStatus === "paid" || !!o.razorpayTransferId || !!o.payoutStatus
    );
    const testDataCount = moneyOrders.filter((o) => o.isTestData).length;
    const relevant = args.includeTestData
      ? moneyOrders
      : moneyOrders.filter((o) => !o.isTestData);

    const boutiqueCache = new Map<string, Doc<"boutiques"> | null>();
    const getBoutique = async (id: Id<"boutiques">) => {
      const key = id as unknown as string;
      if (!boutiqueCache.has(key)) boutiqueCache.set(key, await ctx.db.get(id));
      return boutiqueCache.get(key) ?? null;
    };

    // Summary counts every relevant order, so the buckets stay stable while the
    // table below is filtered.
    const summary: Record<string, { count: number; payoutPaise: number }> = {};
    const bump = (key: string, payoutPaise: number) => {
      const cell = summary[key] ?? { count: 0, payoutPaise: 0 };
      cell.count += 1;
      cell.payoutPaise += payoutPaise;
      summary[key] = cell;
    };

    const rows: any[] = [];
    let attentionCount = 0;
    let attentionPayoutPaise = 0;
    let totalCustomerPaidPaise = 0;
    let totalSellerPayoutPaise = 0;

    const search = (args.search ?? "").trim().toLowerCase();

    for (const order of relevant) {
      const boutique = await getBoutique(order.boutiqueId);
      const payout = resolveManualPayoutPaise(order);
      const reasons = attentionReasons(order, boutique, now);
      const stateKey = order.payoutStatus ?? "none";

      bump(stateKey, payout.sellerPayoutPaise);
      if (reasons.length > 0) {
        attentionCount += 1;
        attentionPayoutPaise += payout.sellerPayoutPaise;
      }

      if (args.fromMs !== undefined && order.createdAt < args.fromMs) continue;
      if (args.toMs !== undefined && order.createdAt > args.toMs) continue;
      if (args.payoutStatus === "attention" && reasons.length === 0) continue;
      if (
        args.payoutStatus &&
        args.payoutStatus !== "attention" &&
        stateKey !== args.payoutStatus
      ) {
        continue;
      }

      const payment = await ctx.db
        .query("payments")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .first();

      if (search) {
        const haystack = [
          order.orderNumber,
          order.razorpayTransferId,
          payment?.razorpayPaymentId,
          payment?.razorpayOrderId,
          boutique?.boutiqueName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      const customerPaidPaise =
        payment?.status === "captured" || payment?.status === "partially_refunded"
          ? payment.amount
          : (order.total ?? 0);

      totalCustomerPaidPaise += customerPaidPaise;
      totalSellerPayoutPaise += payout.sellerPayoutPaise;

      if (rows.length < limit) {
        rows.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          deliveredAt: order.deliveredAt ?? null,
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          isTestData: order.isTestData === true,

          boutiqueId: order.boutiqueId,
          boutiqueName: boutique?.boutiqueName || (boutique as any)?.name || "Unknown boutique",
          razorpayAccountId: boutique?.razorpayAccountId ?? null,
          kycStatus: boutique?.kycStatus ?? null,
          sellerPayoutsFrozen: boutique?.payoutsFrozen === true,
          sellerPayoutsFrozenReason: boutique?.payoutsFrozenReason ?? null,

          customerPaidPaise,
          sellerPayoutPaise: payout.sellerPayoutPaise,
          hiveKeepsPaise: Math.max(0, customerPaidPaise - payout.sellerPayoutPaise),
          payoutSource: payout.source,
          gatewayFeePaise: payment?.gatewayFeePaise ?? null,
          refundAmountPaise: payment?.refundAmount ?? null,
          razorpayPaymentId: payment?.razorpayPaymentId ?? null,
          paymentRowStatus: payment?.status ?? null,
          // Money reserved at Razorpay but never taken: the manual capture case.
          capturable:
            !!payment?.razorpayPaymentId &&
            !payment.razorpayPaymentId.startsWith("coupon_") &&
            payment.status !== "captured" &&
            payment.status !== "refunded" &&
            payment.status !== "partially_refunded",

          payoutStatus: order.payoutStatus ?? null,
          payoutEligibleAt: order.payoutEligibleAt ?? null,
          payoutHoldUntil: order.payoutHoldUntil ?? null,
          payoutHoldReason: order.payoutHoldReason ?? null,
          payoutProcessedAt: order.payoutProcessedAt ?? null,
          payoutFailureReason: order.payoutFailureReason ?? null,
          transferStatus: order.transferStatus ?? null,
          razorpayTransferId: order.razorpayTransferId ?? null,
          disputeStatus: order.disputeStatus ?? null,
          settledUtr: order.payoutDetails?.utrNumber ?? null,
          settledAt: order.payoutDetails?.settledAt ?? null,

          attentionReasons: reasons,
          retryable: isRetryable(order, now),
        });
      }
    }

    // Seller filter list: every boutique that has at least one relevant order.
    const sellers = Array.from(boutiqueCache.entries())
      .filter(([, b]) => b !== null)
      .map(([id, b]) => ({
        boutiqueId: id,
        boutiqueName: b!.boutiqueName || (b as any).name || "Unknown boutique",
        razorpayAccountId: b!.razorpayAccountId ?? null,
        payoutsFrozen: b!.payoutsFrozen === true,
        payoutsFrozenReason: b!.payoutsFrozenReason ?? null,
      }))
      .sort((a, b) => a.boutiqueName.localeCompare(b.boutiqueName));

    return {
      rows,
      truncated: rows.length >= limit,
      summary,
      attention: { count: attentionCount, payoutPaise: attentionPayoutPaise },
      testDataCount,
      totals: {
        matchedOrders: rows.length,
        customerPaidPaise: totalCustomerPaidPaise,
        sellerPayoutPaise: totalSellerPayoutPaise,
        hiveKeepsPaise: Math.max(0, totalCustomerPaidPaise - totalSellerPayoutPaise),
      },
      sellers,
      generatedAt: now,
    };
  },
});

/**
 * Gate used by the inspect action below; actions have no ctx.db of their own.
 */
export const requireAdminInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return true;
  },
});

/**
 * Read-only: what Razorpay itself says about one order's payment and transfer.
 * Nothing is created or changed, so this is safe to call from the monitor.
 */
export const inspectOrderMoneyAdmin = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    await ctx.runQuery(internal.adminPayoutMonitor.requireAdminInternal, {});
    return await ctx.runAction(internal.razorpayRoute.inspectOrderMoneyAtRazorpay, {
      orderId: args.orderId,
    });
  },
});

// ─── Manual controls ─────────────────────────────────────────────────────────
//
// Every control below moves real money or changes when money moves, so each one
// is admin-gated, written to the audit log, and reuses the same guarded path the
// automatic pipeline uses. None of them bypasses an idempotency check.

/**
 * Audit + permission gate shared by the control actions. Returns the order so
 * the action does not need a second round trip.
 */
export const startPayoutControlInternal = internalMutation({
  args: {
    orderId: v.id("orders"),
    action: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    await writeAuditLog({
      ctx,
      actorId: admin._id,
      actorRole: "admin",
      action: args.action,
      entityType: "orders",
      entityId: args.orderId,
      before: {
        payoutStatus: order.payoutStatus,
        payoutHoldUntil: order.payoutHoldUntil,
        razorpayTransferId: order.razorpayTransferId,
      },
      metadata: args.metadata,
    });

    return { orderNumber: order.orderNumber, boutiqueId: order.boutiqueId };
  },
});

/**
 * Control 1 — pay the seller out of Hive's Razorpay balance.
 *
 * For orders where splitting the customer's payment cannot work: store-credit
 * orders (the customer paid nothing), or any order whose payment can no longer
 * carry the transfer. The money leaves Hive's Razorpay balance, so the balance
 * has to cover it.
 */
export const payFromHiveBalanceAdmin = action({
  args: {
    orderId: v.id("orders"),
    hold: v.optional(v.boolean()),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    await ctx.runMutation(internal.adminPayoutMonitor.startPayoutControlInternal, {
      orderId: args.orderId,
      action: "payout.pay_from_balance",
      metadata: { reason: args.reason, hold: args.hold === true },
    });
    return await ctx.runAction(internal.razorpayRoute.payFromHiveBalance, {
      orderId: args.orderId,
      hold: args.hold,
      reason: args.reason,
    });
  },
});

/**
 * Control 4 — set, move or lift the hold on a seller's transfer by hand.
 *
 * "release" pays the seller now (Razorpay settles on their usual cycle).
 * "hold_until" keeps the money frozen until a chosen moment, after which
 * Razorpay releases it automatically. "hold_indefinite" freezes it with no end
 * date, which is what a return or an open investigation needs.
 */
export const setPayoutHoldAdmin = action({
  args: {
    orderId: v.id("orders"),
    mode: v.union(v.literal("release"), v.literal("hold_until"), v.literal("hold_indefinite")),
    untilMs: v.optional(v.number()),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    if (args.mode === "hold_until") {
      if (!args.untilMs) throw new ConvexError("A hold-until date is required.");
      if (args.untilMs <= Date.now() + 60_000) {
        throw new ConvexError("Razorpay only accepts a hold date in the future.");
      }
    }

    await ctx.runMutation(internal.adminPayoutMonitor.startPayoutControlInternal, {
      orderId: args.orderId,
      action: "payout.hold_changed",
      metadata: { mode: args.mode, untilMs: args.untilMs, reason: args.reason },
    });

    return await ctx.runAction(internal.razorpayRoute.updateTransferHold, {
      orderId: args.orderId,
      onHold: args.mode !== "release",
      onHoldUntil: args.mode === "hold_until" ? args.untilMs : undefined,
      reason: args.reason,
    });
  },
});

/**
 * Control 5 — capture a payment that Razorpay only authorised.
 *
 * The money is reserved on the customer's card but not taken. Capturing it lets
 * the normal webhook flow place the order and create the seller's transfer.
 */
export const capturePaymentAdmin = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    await ctx.runMutation(internal.adminPayoutMonitor.startPayoutControlInternal, {
      orderId: args.orderId,
      action: "payment.manual_capture",
    });
    return await ctx.runAction(internal.razorpayRoute.captureAuthorizedPayment, {
      orderId: args.orderId,
    });
  },
});

/**
 * Control 2 — cancel an order and refund the customer.
 *
 * Queues the refund through the same path an admin cancellation uses, so the
 * refund is deduplicated, the seller's transfer is reversed with the refund
 * (reverse_all), and the payout is marked not eligible. The refund is sent by
 * the queue cron within a few minutes; the bank takes 5-7 working days to show
 * it to the customer.
 */
export const cancelAndRefundOrderAdmin = mutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    if (order.status === "cancelled") {
      throw new ConvexError("Order is already cancelled.");
    }
    if (order.status === "delivered") {
      throw new ConvexError(
        "This order was delivered. Use Returns & Exchanges so the goods come back before the money does."
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: now,
      cancelReason: args.reason,
      cancelledBy: admin._id,
      updatedAt: now,
    });

    const refund = await refundCancelledOrder(ctx, {
      orderId: args.orderId,
      reason: `Order ${order.orderNumber} cancelled from Payout Monitor: ${args.reason}`,
      idempotencySuffix: "payout_monitor_cancel",
    });

    await writeAuditLog({
      ctx,
      actorId: admin._id,
      actorRole: "admin",
      action: "order.cancelled_with_refund",
      entityType: "orders",
      entityId: args.orderId,
      before: { status: order.status, paymentStatus: order.paymentStatus },
      after: { status: "cancelled" },
      metadata: { reason: args.reason, refund },
    });

    return {
      cancelled: true,
      refundQueued: refund.enqueued,
      refundReason: refund.enqueued ? undefined : (refund as any).reason,
      amountPaise: (refund as any).amountPaise ?? null,
    };
  },
});

/**
 * Control 3 — freeze or unfreeze every payout for one seller.
 *
 * A freeze does not touch money that has already settled. New orders still
 * create their held transfer, so the customer's payment is still split and the
 * seller's share is reserved — it simply never gets released while the freeze
 * is on, including by the automatic release at delivery. Lifting the freeze
 * lets the normal flow resume; orders that came due in the meantime show up in
 * Needs attention.
 */
export const setSellerPayoutFreezeAdmin = mutation({
  args: {
    boutiqueId: v.id("boutiques"),
    frozen: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const boutique = await ctx.db.get(args.boutiqueId);
    if (!boutique) throw new ConvexError("Boutique not found");

    if (args.frozen && !args.reason?.trim()) {
      throw new ConvexError("A reason is required to freeze a seller's payouts.");
    }

    await ctx.db.patch(args.boutiqueId, {
      payoutsFrozen: args.frozen,
      payoutsFrozenReason: args.frozen ? args.reason!.trim() : undefined,
      payoutsFrozenAt: args.frozen ? Date.now() : undefined,
      payoutsFrozenBy: args.frozen ? admin._id : undefined,
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      ctx,
      actorId: admin._id,
      actorRole: "admin",
      action: args.frozen ? "seller.payouts_frozen" : "seller.payouts_unfrozen",
      entityType: "boutiques",
      entityId: args.boutiqueId,
      before: { payoutsFrozen: boutique.payoutsFrozen === true },
      after: { payoutsFrozen: args.frozen },
      metadata: { reason: args.reason },
    });

    return { frozen: args.frozen };
  },
});
