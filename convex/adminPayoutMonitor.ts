import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireRole } from "./lib/auth";
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

          customerPaidPaise,
          sellerPayoutPaise: payout.sellerPayoutPaise,
          hiveKeepsPaise: Math.max(0, customerPaidPaise - payout.sellerPayoutPaise),
          payoutSource: payout.source,
          gatewayFeePaise: payment?.gatewayFeePaise ?? null,
          refundAmountPaise: payment?.refundAmount ?? null,
          razorpayPaymentId: payment?.razorpayPaymentId ?? null,

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
