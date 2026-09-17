// convex/crons.ts
// Scheduler file for automated background tasks.
// Excludes reconciliation_scan per logistics provider optimization.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run settlement cron hourly
crons.hourly(
  "settlement_cron_hourly",
  { minuteUTC: 0 }, // Runs at the start of every hour (0 minutes past the hour)
  internal.adminObservability.triggerCronJobInternal,
  { cronName: "settlement_cron" }
);

// Run performance recalc cron every 6 hours
crons.interval(
  "performance_recalc_every_6_hours",
  { hours: 6 }, // Runs every 6 hours
  internal.adminObservability.triggerCronJobInternal,
  { cronName: "performance_recalc" }
);

// Sweep expired checkout sessions every 15 minutes (was 5 — reduced to cut I/O)
crons.interval(
  "clean_expired_checkout_sessions_every_5_minutes",
  { minutes: 15 },
  internal.payments.cleanExpiredCheckoutSessions
);


// Razorpay auto-releases a transfer when its on_hold_until passes and sends no
// webhook, so sweep hourly to mark those payouts paid.
crons.interval(
  "reconcile_released_holds_hourly",
  { hours: 1 },
  internal.adminFinance.reconcileReleasedHolds
);

// Expire exchange coupons past their 30-day window and refund the customer.
// Expiry is not forfeiture — the customer returned goods, so the money goes
// back to their original payment method.
crons.interval(
  "expire_coupons_hourly",
  { hours: 1 },
  internal.coupons.expireCoupons
);

// Lapse exchange requests the seller never answered inside 24h, releasing the
// payout hold the request had placed.
crons.interval(
  "expire_pending_exchanges_every_30_minutes",
  { minutes: 30 },
  internal.exchanges.expirePendingExchanges
);

// Process refund queue every 15 minutes (was 5 — reduced to cut I/O)
// Porter's webhooks are the fast path; this is the floor under them. When they
// stop arriving, nothing else asked Porter what had happened, and orders sat at
// "booking requested" while a real rider delivered the parcel.
//
// Porter caps how often a single order may be read, so the poll itself spaces
// each trip ten minutes apart. This interval only decides how promptly a trip
// that is due becomes eligible.
crons.interval(
  "poll_active_porter_shipments_every_3_minutes",
  { minutes: 3 },
  internal.adminLogistics.pollActivePorterShipments
);

crons.interval(
  "process_refund_queue_every_15_minutes",
  { minutes: 15 },
  internal.payments.processRefundQueue
);

// Clean up orphaned and failed media uploads hourly
crons.hourly(
  "media_orphan_cleanup",
  { minuteUTC: 15 }, // Offset by 15 mins to spread load
  internal.media.cleanup.cleanupOrphans
);

// Delete expired road-distance rows. The table has carried expiresAt and a by_expiresAt index
// since it was created and writes set a 7-day TTL, but nothing ever swept it.
crons.interval(
  "cleanup_expired_road_distances_daily",
  { hours: 24 },
  internal.locationActions.cleanupExpiredRoadDistances,
  {}
);

// Delete dead rate-limit rows. Nothing previously cleaned this table, so every distinct key —
// including the caller-supplied anonymous search keys — became a permanent row.
crons.interval(
  "cleanup_expired_rate_limits_hourly",
  { hours: 1 },
  internal.rateLimitMaintenance.cleanupExpiredRateLimits,
  {}
);

// Daily price check: every product's storefront price must equal its seller base
// price plus its tier's fees. Fixes and logs any that drifted (a stale price makes
// checkout refuse the item). 03:30 IST, when the shop is quiet.
crons.daily(
  "sync_storefront_prices_daily",
  { hourUTC: 22, minuteUTC: 0 },
  internal.adminSettings.recalculateAllProductPricesInternal,
  { reason: "daily_check" }
);

// Safety cron: Sweep unaccepted orders > 45 minutes every 5 minutes
crons.interval(
  "sweep_unaccepted_orders_sla_every_5_minutes",
  { minutes: 5 },
  internal.orders.sweepUnacceptedOrdersSLA
);

// Daily 9:00 PM IST (15:30 UTC) Operations Digest posted to #orders
crons.daily(
  "daily_ops_digest_9pm_ist",
  { hourUTC: 15, minuteUTC: 30 },
  internal.opsDigest.sendDailyOpsDigest,
  {}
);

export default crons;
