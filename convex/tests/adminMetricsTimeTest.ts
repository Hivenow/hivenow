// convex/tests/adminMetricsTimeTest.ts
//
// Tests for the admin dashboard metrics clock.
//
// The property that matters: taking the time as an argument must not change
// what the dashboards compute. Every window these queries used to derive from
// their own Date.now() call has to come out identical when the same instant is
// passed in instead. The rest covers the bucketing that makes the cached
// result shareable, and the fallback that keeps an older admin client working.
//
// Run with: npx tsx convex/tests/adminMetricsTimeTest.ts

import {
  ADMIN_METRICS_BUCKET_MS,
  adminMetricsWindows,
  resolveMetricsNow,
  toMetricsBucket,
} from "../lib/adminMetricsTime";

let passed = 0;
let failed = 0;

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

// A fixed instant: 2026-09-16T14:37:41.123Z.
const T = Date.UTC(2026, 8, 16, 14, 37, 41, 123);

// ─── 1. Behaviour is unchanged for a given instant ───────────────────────────
//
// These expectations are written the way the handlers used to compute them
// inline, so a drift in adminMetricsWindows fails here.

const w = adminMetricsWindows(T);

check(
  "startOfToday matches the old Date.UTC(y, m, d) computation",
  w.startOfToday,
  Date.UTC(new Date(T).getUTCFullYear(), new Date(T).getUTCMonth(), new Date(T).getUTCDate())
);
check("startOfToday is midnight UTC", new Date(w.startOfToday).toISOString(), "2026-09-16T00:00:00.000Z");
check("thirtyDaysAgo matches now - 30d", w.thirtyDaysAgo, T - 30 * 24 * 60 * 60 * 1000);
check("twentyFourHoursAgo matches now - 24h", w.twentyFourHoursAgo, T - 24 * 60 * 60 * 1000);
check("twelveHoursAgo matches now - 12h", w.twelveHoursAgo, T - 12 * 60 * 60 * 1000);
check("thirtyMinutesAgo matches now - 30m", w.thirtyMinutesAgo, T - 30 * 60 * 1000);
check("tenMinutesAgo matches now - 10m", w.tenMinutesAgo, T - 10 * 60 * 1000);

check(
  "all windows derive from one clock, so they cannot straddle a millisecond",
  [w.twelveHoursAgo - w.twentyFourHoursAgo, w.thirtyMinutesAgo - w.tenMinutesAgo],
  [12 * 60 * 60 * 1000, -20 * 60 * 1000]
);

// A day boundary is the case most likely to break "today's orders".
const midnight = Date.UTC(2026, 8, 16, 0, 0, 0, 0);
check(
  "an instant exactly at midnight UTC belongs to that day",
  adminMetricsWindows(midnight).startOfToday,
  midnight
);
check(
  "one millisecond before midnight belongs to the previous day",
  new Date(adminMetricsWindows(midnight - 1).startOfToday).toISOString(),
  "2026-09-15T00:00:00.000Z"
);

// ─── 2. Bucketing ────────────────────────────────────────────────────────────

check("bucket size is five minutes", ADMIN_METRICS_BUCKET_MS, 5 * 60 * 1000);
check("a timestamp rounds down to its bucket", toMetricsBucket(T), Date.UTC(2026, 8, 16, 14, 35, 0, 0));
check("a timestamp already on a boundary is unchanged", toMetricsBucket(Date.UTC(2026, 8, 16, 14, 35)), Date.UTC(2026, 8, 16, 14, 35));

check(
  "two instants in the same bucket produce identical arguments",
  toMetricsBucket(T) === toMetricsBucket(T + 60_000),
  true
);
check(
  "instants either side of a boundary produce different arguments",
  toMetricsBucket(Date.UTC(2026, 8, 16, 14, 34, 59, 999)) === toMetricsBucket(Date.UTC(2026, 8, 16, 14, 35, 0, 0)),
  false
);
check("a custom bucket size is honoured", toMetricsBucket(T, 60 * 60 * 1000), Date.UTC(2026, 8, 16, 14, 0, 0, 0));
check("a non-finite clock does not produce NaN arguments", toMetricsBucket(Number.NaN), 0);

// ─── 3. Fallback for clients that do not send the argument ───────────────────

const before = Date.now();
const fallback = resolveMetricsNow(undefined);
const after = Date.now();
check("an absent argument falls back to server time", fallback >= before && fallback <= after, true);
check("a supplied bucket is used as given", resolveMetricsNow(T), T);
// Compared against a clearly past instant, not the fixture above: the fixture
// is a time of day this suite may run before.
check(
  "a zero bucket falls back rather than pinning to 1970",
  resolveMetricsNow(0) > Date.UTC(2020, 0, 1),
  true
);
check("a NaN bucket falls back", Number.isFinite(resolveMetricsNow(Number.NaN)), true);

console.log(`\nAdmin metrics clock: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
