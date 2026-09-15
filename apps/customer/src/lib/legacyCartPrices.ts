// apps/customer/src/lib/legacyCartPrices.ts
//
// Cart and Buy Now items are stored in rupees. Earlier versions of the cart store guessed the
// unit on every read and write — any price above 10000 was assumed to be paise and divided by
// 100 — which silently turns a genuine ₹12,500 item into ₹125. The stores no longer guess.
//
// Bags persisted before that change may still hold a paise value that was never normalised, so
// the stores run this once, when they rehydrate an unversioned (v0) snapshot. Applying the old
// rule exactly once is safe: when this shipped the most expensive live product sold for
// ₹3,118.88, so no legitimate rupee price in an existing bag exceeds 10000.
//
// Deliberately free of store and React imports so it can be unit tested directly.
// Run the tests with: npx tsx apps/customer/src/lib/legacyCartPrices.test.ts

/** The threshold the removed heuristic used. Only meaningful for pre-v1 snapshots. */
export const LEGACY_PAISE_THRESHOLD = 10000;

export function normalizeLegacyPrice(price: unknown): unknown {
  if (typeof price !== "number" || !Number.isFinite(price)) return price;
  return price > LEGACY_PAISE_THRESHOLD ? Math.round(price / 100) : price;
}

/** Returns a copy of `items` with each `price` normalised by the legacy rule. */
export function migrateLegacyItemPrices<T extends { price?: unknown }>(items: unknown): T[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) =>
    item && typeof item === "object"
      ? ({ ...(item as T), price: normalizeLegacyPrice((item as T).price) } as T)
      : (item as T)
  );
}
