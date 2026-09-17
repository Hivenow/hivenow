import {
  resolvePayoutHoldDecision,
  RETURN_WINDOW_MS,
  type PayoutHoldOrder,
} from "../lib/payoutHold";

/**
 * Regression tests for the delivery-time payout hold decision.
 *
 * Covers the money-critical rules:
 *   - Final Sale releases at delivery, returns-accepted holds for 24h
 *   - a settled payout is never reopened
 *   - an active return/exchange hold outranks the delivery decision, so a
 *     duplicate Porter webhook cannot restart the settlement clock on frozen money
 *   - orders with no held transfer fall back to post-delivery transfer creation
 */
export function runPayoutHoldTests() {
  let passed = 0;
  let failed = 0;

  const DELIVERED_AT = 1_700_000_000_000;

  function base(overrides: Partial<PayoutHoldOrder> = {}): PayoutHoldOrder {
    return {
      status: "delivered",
      paymentStatus: "paid",
      payoutStatus: "withheld",
      razorpayTransferId: "trf_TEST123",
      payoutHoldReason: "awaiting_delivery",
      returnsAccepted: true,
      ...overrides,
    };
  }

  function check(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.error(`[FAIL] ${name}\n         expected ${e}\n         got      ${a}`);
    }
  }

  // ── Core policy split ─────────────────────────────────────────────────────
  check(
    "Final Sale order releases the hold at delivery",
    resolvePayoutHoldDecision(base({ returnsAccepted: false }), DELIVERED_AT),
    { action: "release", reason: "final_sale_delivered" }
  );

  check(
    "24h-return order holds until delivered + 24h",
    resolvePayoutHoldDecision(base({ returnsAccepted: true }), DELIVERED_AT),
    {
      action: "hold_until",
      onHoldUntil: DELIVERED_AT + RETURN_WINDOW_MS,
      reason: "return_window_open",
    }
  );

  check(
    "Legacy order with no snapshotted policy defaults to the 24h hold, not release",
    resolvePayoutHoldDecision(base({ returnsAccepted: undefined }), DELIVERED_AT),
    {
      action: "hold_until",
      onHoldUntil: DELIVERED_AT + RETURN_WINDOW_MS,
      reason: "return_window_open",
    }
  );

  // ── Preconditions ─────────────────────────────────────────────────────────
  check(
    "Undelivered order is skipped",
    resolvePayoutHoldDecision(base({ status: "out_for_delivery" }), DELIVERED_AT),
    { action: "skip", reason: "order_not_delivered" }
  );

  check(
    "Unpaid order is skipped",
    resolvePayoutHoldDecision(base({ paymentStatus: "pending" }), DELIVERED_AT),
    { action: "skip", reason: "not_paid" }
  );

  // ── Idempotency: settled payouts are never reopened ───────────────────────
  for (const settled of ["processing", "paid", "settled"]) {
    check(
      `Payout already ${settled} is never reopened`,
      resolvePayoutHoldDecision(base({ payoutStatus: settled }), DELIVERED_AT),
      { action: "skip", reason: `already_${settled}` }
    );
  }

  // ── An active return/exchange hold outranks the delivery decision ─────────
  check(
    "Return in progress keeps the money frozen on a duplicate delivery webhook",
    resolvePayoutHoldDecision(
      base({ payoutHoldReason: "return_in_progress" }),
      DELIVERED_AT
    ),
    { action: "skip", reason: "held_for_return_in_progress" }
  );

  check(
    "Unredeemed exchange coupon keeps the money frozen",
    resolvePayoutHoldDecision(
      base({ payoutHoldReason: "exchange_coupon_active" }),
      DELIVERED_AT
    ),
    { action: "skip", reason: "held_for_exchange_coupon_active" }
  );

  check(
    "A second delivery event does not restart the 24h clock once the window is open",
    resolvePayoutHoldDecision(
      base({ payoutHoldReason: "return_window_open" }),
      DELIVERED_AT
    ),
    { action: "skip", reason: "held_for_return_window_open" }
  );

  // ── Fallback path: no held transfer exists ────────────────────────────────
  check(
    "COD / KYC-incomplete order with no transfer falls back to creating one",
    resolvePayoutHoldDecision(
      base({
        razorpayTransferId: undefined,
        payoutStatus: "not_eligible",
        payoutHoldReason: undefined,
      }),
      DELIVERED_AT
    ),
    { action: "create_transfer", reason: "eligible" }
  );

  check(
    "Fallback path is idempotent once already marked eligible",
    resolvePayoutHoldDecision(
      base({
        razorpayTransferId: undefined,
        payoutStatus: "eligible",
        payoutEligibleAt: DELIVERED_AT,
        payoutHoldReason: undefined,
      }),
      DELIVERED_AT
    ),
    { action: "skip", reason: "already_eligible" }
  );

  // ── Chargebacks ──────────────────────────────────────────────────────────
  check(
    "Open chargeback blocks release at delivery",
    resolvePayoutHoldDecision(base({ disputeStatus: "open", returnsAccepted: false }), DELIVERED_AT),
    { action: "skip", reason: "chargeback_open" }
  );
  check(
    "Lost chargeback blocks post-delivery transfer creation",
    resolvePayoutHoldDecision(
      base({ disputeStatus: "lost", razorpayTransferId: undefined, payoutStatus: "pending", payoutHoldReason: undefined }),
      DELIVERED_AT
    ),
    { action: "skip", reason: "chargeback_lost" }
  );
  check(
    "Won chargeback falls through to the normal hold decision",
    resolvePayoutHoldDecision(base({ disputeStatus: "won" }), DELIVERED_AT),
    { action: "hold_until", onHoldUntil: DELIVERED_AT + RETURN_WINDOW_MS, reason: "return_window_open" }
  );
  check(
    "Decision made after the return window closed releases instead of holding into the past",
    resolvePayoutHoldDecision(base({ disputeStatus: "won" }), DELIVERED_AT, DELIVERED_AT + 3 * RETURN_WINDOW_MS),
    { action: "release", reason: "return_window_closed" }
  );
  check(
    "Decision inside the window with now still holds until the window ends",
    resolvePayoutHoldDecision(base(), DELIVERED_AT, DELIVERED_AT + 60 * 60 * 1000),
    { action: "hold_until", onHoldUntil: DELIVERED_AT + RETURN_WINDOW_MS, reason: "return_window_open" }
  );

  console.log(`\nPayout hold: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
// `require`/`module` are not defined in the Convex runtime, so the guard has to
// be argv-based or pushing the deployment fails to analyse this file.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("payoutHoldTest")) {
  const { failed } = runPayoutHoldTests();
  if (failed > 0) process.exit(1);
}
