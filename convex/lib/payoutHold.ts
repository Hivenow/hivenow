// convex/lib/payoutHold.ts
// Pure decision logic for what happens to a seller's held Route transfer when
// an order is confirmed delivered.
//
// Kept free of Convex ctx so it can be unit-tested directly (see
// convex/tests/payoutHoldTest.ts), matching the pattern used by
// isSignatureBypassAllowed / signatureTest.ts.

/** Window a customer has to raise a return/exchange after delivery. */
export const RETURN_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PayoutHoldDecision =
  /** Nothing to do — already settled, not deliverable, or held for a return. */
  | { action: "skip"; reason: string }
  /** Final Sale: lift the hold, Razorpay settles by the next working day. */
  | { action: "release"; reason: string }
  /** Returns accepted: let Razorpay auto-release once the window closes. */
  | { action: "hold_until"; onHoldUntil: number; reason: string }
  /** No held transfer exists (COD, KYC incomplete at capture, legacy order). */
  | { action: "create_transfer"; reason: string };

export type PayoutHoldOrder = {
  status?: string;
  paymentStatus?: string;
  payoutStatus?: string;
  razorpayTransferId?: string;
  /** "reversed" once a return or exchange has taken the money back. */
  transferStatus?: string;
  payoutHoldReason?: string;
  payoutEligibleAt?: number;
  /** Snapshotted at order creation. false === Final Sale. */
  returnsAccepted?: boolean;
  /** Chargeback state; "open" and "lost" block any payout. */
  disputeStatus?: string;
};

/**
 * Decide what to do with the seller's payout at delivery confirmation.
 *
 * Ordering matters: settled payouts short-circuit first so a duplicate Porter
 * webhook can never reopen them, and an active return/exchange hold outranks
 * the delivery decision so re-delivery events cannot restart the 24h clock on
 * money that is deliberately frozen.
 */
export function resolvePayoutHoldDecision(
  order: PayoutHoldOrder,
  deliveredAt: number,
  /**
   * Pass when the decision may run long after delivery (a chargeback resolved
   * days later). A return window that has already closed then releases instead
   * of asking Razorpay for an on_hold_until in the past, which it refuses.
   */
  now?: number
): PayoutHoldDecision {
  if (order.status !== "delivered") {
    return { action: "skip", reason: "order_not_delivered" };
  }
  if (order.paymentStatus !== "paid") {
    return { action: "skip", reason: "not_paid" };
  }

  // Already settled or mid-settlement — never re-enter.
  if (
    order.payoutStatus === "processing" ||
    order.payoutStatus === "paid" ||
    order.payoutStatus === "settled"
  ) {
    return { action: "skip", reason: `already_${order.payoutStatus}` };
  }

  // A reversed transfer has already gone back to Hive. Releasing it again, or
  // creating a fresh one, would pay the seller for goods they have back.
  if (order.transferStatus === "reversed") {
    return { action: "skip", reason: "transfer_reversed" };
  }

  // A chargeback is open, or was lost: the bank has (or may) take this money
  // back from Hive, so the seller is not paid until it resolves in Hive's favour.
  if (order.disputeStatus === "open" || order.disputeStatus === "lost") {
    return { action: "skip", reason: `chargeback_${order.disputeStatus}` };
  }

  if (order.razorpayTransferId) {
    // A return or unredeemed exchange coupon is holding this open. Only the
    // capture-time placeholder reason yields to the delivery decision.
    if (order.payoutHoldReason && order.payoutHoldReason !== "awaiting_delivery") {
      return { action: "skip", reason: `held_for_${order.payoutHoldReason}` };
    }

    if (order.returnsAccepted === false) {
      return { action: "release", reason: "final_sale_delivered" };
    }

    const onHoldUntil = deliveredAt + RETURN_WINDOW_MS;
    if (now !== undefined && onHoldUntil <= now + 60_000) {
      return { action: "release", reason: "return_window_closed" };
    }
    return {
      action: "hold_until",
      onHoldUntil,
      reason: "return_window_open",
    };
  }

  // ── No held transfer: fall back to creating one post-delivery ────────────
  if (order.payoutStatus === "withheld") {
    return { action: "skip", reason: "already_withheld" };
  }
  if (order.payoutStatus === "eligible" && order.payoutEligibleAt) {
    return { action: "skip", reason: "already_eligible" };
  }

  return { action: "create_transfer", reason: "eligible" };
}

/**
 * How long a seller transfer created AFTER delivery must stay held.
 *
 * Only sellers who accept returns hold money back: the transfer waits until
 * delivery + 24h, so a return inside the window never has to claw money back
 * from the seller. Final Sale orders are paid at once — there is nothing to
 * wait for — and so is an order whose window has already closed.
 *
 * Razorpay refuses an `on_hold_until` that is not in the future, so a window
 * closing within the next minute is treated as closed.
 */
export function resolveLateTransferHoldUntil(
  order: { returnsAccepted?: boolean; deliveredAt?: number },
  now: number
): number | null {
  if (order.returnsAccepted === false) return null;
  if (typeof order.deliveredAt !== "number") return null;
  const until = order.deliveredAt + RETURN_WINDOW_MS;
  return until > now + 60_000 ? until : null;
}
