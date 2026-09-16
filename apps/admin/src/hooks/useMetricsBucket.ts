"use client";

import { useEffect, useState } from "react";
import { ADMIN_METRICS_BUCKET_MS, toMetricsBucket } from "../../../../convex/lib/adminMetricsTime";

/**
 * The clock the admin dashboard metrics queries are called with.
 *
 * These queries used to read `Date.now()` server-side, which Convex treats as a
 * reason to invalidate the query cache frequently -- production logs showed the
 * catalog metrics query re-running every ~51 seconds with no data change, each
 * run re-reading most of the orders and products tables.
 *
 * Passing a rounded timestamp instead makes the query a pure function of its
 * arguments: it re-runs when the data it read changes, or when the bucket rolls
 * over, and not otherwise. Every admin tab in the same five-minute bucket sends
 * identical arguments, so they share one cached execution rather than each
 * paying for their own.
 *
 * The interval below only moves a number; it is not polling. It fires at most
 * once per bucket and triggers no fetch of its own.
 */
export function useMetricsBucket(bucketMs: number = ADMIN_METRICS_BUCKET_MS): number {
  const [bucket, setBucket] = useState(() => toMetricsBucket(Date.now(), bucketMs));

  useEffect(() => {
    // Tick a little more often than the bucket so the value is never stale by a
    // whole bucket, while still changing only when the bucket actually rolls.
    const id = setInterval(() => {
      setBucket((current) => {
        const next = toMetricsBucket(Date.now(), bucketMs);
        return next === current ? current : next;
      });
    }, Math.max(15_000, Math.floor(bucketMs / 4)));

    return () => clearInterval(id);
  }, [bucketMs]);

  return bucket;
}
