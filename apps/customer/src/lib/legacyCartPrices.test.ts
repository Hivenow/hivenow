import { normalizeLegacyPrice, migrateLegacyItemPrices } from "./legacyCartPrices";

/**
 * Regression tests for the one-time migration of persisted cart prices.
 *
 * The production fault: the cart store divided any price above 10000 by 100 on every read and
 * write, so a real ₹12,500 item was shown and totalled as ₹125. The store now keeps prices as
 * given; these tests pin down the single legacy conversion applied to old snapshots.
 */
export function runLegacyCartPricesTests() {
  let passed = 0;
  let failed = 0;

  function check(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual) ?? "undefined";
    const e = JSON.stringify(expected) ?? "undefined";
    if (a === e) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.log(`[FAIL] ${name}\n  expected: ${e}\n  actual:   ${a}`);
    }
  }

  check("rupee price below threshold is unchanged", normalizeLegacyPrice(1379), 1379);
  check("threshold itself is unchanged", normalizeLegacyPrice(10000), 10000);
  check("legacy paise price is converted", normalizeLegacyPrice(137900), 1379);
  check("paise rounding follows the old rule", normalizeLegacyPrice(41788), 418);
  check("non-number is left alone", normalizeLegacyPrice("1379"), "1379");
  check("NaN is left alone", Number.isNaN(normalizeLegacyPrice(NaN) as number), true);

  check(
    "items are migrated without dropping other fields",
    migrateLegacyItemPrices([
      { productId: "kurti", size: "M", quantity: 2, price: 137900 },
      { productId: "saree", size: "Free", quantity: 1, price: 2499 },
    ]),
    [
      { productId: "kurti", size: "M", quantity: 2, price: 1379 },
      { productId: "saree", size: "Free", quantity: 1, price: 2499 },
    ]
  );
  check("missing items array becomes empty", migrateLegacyItemPrices(undefined), []);
  check("non-array items become empty", migrateLegacyItemPrices({ price: 1 }), []);

  console.log(`\nLegacy cart prices: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("legacyCartPrices.test")) {
  const { failed } = runLegacyCartPricesTests();
  if (failed > 0) process.exit(1);
}
