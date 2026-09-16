/**
 * Time windows for the admin dashboard metrics queries.
 *
 * Both dashboard queries used to call `Date.now()` in their handlers. Convex
 * documents the consequence plainly: "When using Date.now() in a query, the
 * query cache will be invalidated frequently in order to avoid showing results
 * that are too old." Production logs confirmed it -- the catalog metrics query
 * re-ran every ~51 seconds for 36 minutes with no write in the 10 seconds
 * before any run, purely because an admin tab was open. Each of those runs
 * re-read most of the orders and products tables.
 *
 * The fix is the alternative Convex recommends: the caller passes the time in,
 * rounded down, so every request inside the same bucket shares one cached
 * execution. The query itself becomes a pure function of its arguments again.
 *
 * The bucket is deliberately coarser than a minute. These metrics answer
 * questions like "how many orders have waited more than 10 minutes" -- a five
 * minute granularity keeps the answer operationally honest while cutting
 * re-executions by roughly an order of magnitude.
 */

/** How far the caller-supplied clock is rounded down. */
export const ADMIN_METRICS_BUCKET_MS = 5 * 60 * 1000;

/** Rounds a timestamp down to the start of its bucket. */
export function toMetricsBucket(now: number, bucketMs: number = ADMIN_METRICS_BUCKET_MS): number {
  if (!Number.isFinite(now)) return 0;
  const size = bucketMs > 0 ? bucketMs : ADMIN_METRICS_BUCKET_MS;
  return Math.floor(now / size) * size;
}

/**
 * The clock a metrics query should use.
 *
 * `nowBucket` is optional so that a client deployed before this argument
 * existed keeps working: it falls back to server time, which is exactly the old
 * behaviour, including the frequent cache invalidation. Once every admin client
 * sends the argument the fallback stops being reached.
 */
export function resolveMetricsNow(nowBucket?: number): number {
  return typeof nowBucket === "number" && Number.isFinite(nowBucket) && nowBucket > 0
    ? nowBucket
    : Date.now();
}

export interface AdminMetricsWindows {
  /** Midnight UTC at the start of the day containing `now`. */
  startOfToday: number;
  thirtyDaysAgo: number;
  twentyFourHoursAgo: number;
  twelveHoursAgo: number;
  thirtyMinutesAgo: number;
  tenMinutesAgo: number;
}

/**
 * Every window the dashboards derive from the current time, in one place.
 *
 * Previously each was computed inline from its own `Date.now()` call, so two
 * windows inside one execution could straddle a millisecond boundary. Deriving
 * them all from a single value removes that, and makes the query's output a
 * function of (data, now) that a test can pin.
 */
export function adminMetricsWindows(now: number): AdminMetricsWindows {
  const day = new Date(now);
  return {
    startOfToday: Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    thirtyDaysAgo: now - 30 * 24 * 60 * 60 * 1000,
    twentyFourHoursAgo: now - 24 * 60 * 60 * 1000,
    twelveHoursAgo: now - 12 * 60 * 60 * 1000,
    thirtyMinutesAgo: now - 30 * 60 * 1000,
    tenMinutesAgo: now - 10 * 60 * 1000,
  };
}
