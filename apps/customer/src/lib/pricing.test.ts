import { calculateDisplayPricing, calculateCardPricing } from "./pricing";

/**
 * Unit-contract tests for storefront pricing.
 *
 * The production fault: display code guessed the unit from the number's size — anything above
 * 10000 was paise, anything below was rupees. A product at or below ₹100 (stored as 10000 paise
 * or less) was shown 100× too high, and a card already converted to rupees above ₹10,000 was
 * divided a second time. Products are stored in paise; cards and the bag carry rupees.
 */
export function runPricingTests() {
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

  // Boundary prices, end to end: stored paise -> product card -> card re-render -> bag -> checkout.
  // Checkout (payments.initCheckoutSessionInternal) accepts a bag price within ₹1 (100 paise) of
  // the stored all-inclusive price.
  const CHECKOUT_TOLERANCE_PAISE = 100;
  const boundaries: Array<[string, number, number, string]> = [
    ["₹99", 9900, 99, "₹99"],
    ["₹100", 10000, 100, "₹100"],
    ["₹999", 99900, 999, "₹999"],
    ["₹10,000", 1000000, 10000, "₹10,000"],
    ["₹12,500", 1250000, 12500, "₹12,500"],
  ];
  for (const [label, storedPaise, rupees, formatted] of boundaries) {
    const product = calculateDisplayPricing({ price: storedPaise });
    check(`${label}: stored paise displays as rupees`, product.price, rupees);
    check(`${label}: formatted`, product.formattedPrice, formatted);

    // ProductCard / QuickView receive the already-converted card and must not divide again.
    const card = calculateCardPricing({ price: product.price, compareAtPrice: product.compareAtPrice });
    check(`${label}: card re-render keeps rupees`, card.price, rupees);

    // Add to Bag stores the card price; checkout compares it against the stored paise.
    const bagPricePaise = Math.round(card.price * 100);
    check(
      `${label}: bag price passes checkout validation`,
      Math.abs(bagPricePaise - storedPaise) <= CHECKOUT_TOLERANCE_PAISE,
      true
    );
  }

  // Real catalogue value with paise: ₹417.88 displays rounded; the bag value stays within tolerance.
  const realistic = calculateDisplayPricing({ price: 41788 });
  check("₹417.88 displays as ₹418", realistic.price, 418);
  check(
    "₹417.88 rounded bag price passes checkout validation",
    Math.abs(Math.round(realistic.price * 100) - 41788) <= CHECKOUT_TOLERANCE_PAISE,
    true
  );

  // Discounts and MRP (paise input)
  const discounted = calculateDisplayPricing({ price: 700000, discountPrice: 450000 });
  check("seller discount sets selling price", discounted.price, 4500);
  check("seller discount uses base as MRP", discounted.compareAtPrice, 7000);
  check("seller discount percent", discounted.discountPercent, 36);

  const lowMrp = calculateDisplayPricing({ price: 9900, mrp: 12900 });
  check("sub-₹100 product with MRP: price", lowMrp.price, 99);
  check("sub-₹100 product with MRP: MRP", lowMrp.compareAtPrice, 129);

  const fakeMrp = calculateDisplayPricing({ price: 99900, compareAtPrice: 99900 });
  check("MRP equal to price is not shown", fakeMrp.compareAtPrice, undefined);
  check("MRP equal to price has no discount", fakeMrp.hasDiscount, false);

  // Card pricing (rupee input) keeps MRP and discount
  const card = calculateCardPricing({ price: 12500, compareAtPrice: 15000 });
  check("card: ₹12,500 with ₹15,000 MRP keeps price", card.price, 12500);
  check("card: MRP kept", card.compareAtPrice, 15000);
  check("card: discount percent", card.discountPercent, 17);

  // Empty inputs
  check("missing product is ₹0", calculateDisplayPricing(null).price, 0);
  check("missing card is ₹0", calculateCardPricing(undefined).price, 0);

  console.log(`\nPricing: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("pricing.test")) {
  const { failed } = runPricingTests();
  if (failed > 0) process.exit(1);
}
