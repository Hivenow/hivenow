import {
  calculateCheckoutPricing,
  calculateSellerItemPricing,
  DEFAULT_TIERS_CONFIG,
  type PlatformConfig,
} from "../pricingService";
import { computePromoDiscountPaise } from "../promoCoupons";

/**
 * Regression tests for who pays a promo coupon's discount.
 *
 * The rules that carry money:
 *   - the discount is taken off the all-inclusive item total, to the paisa
 *   - Hive-funded (admin) coupons leave the seller's payout untouched
 *   - seller-funded coupons come out of the payout, with commission charged
 *     on the discounted price
 *   - seller + platform funded always adds up to the discount
 */
export function runPromoFundingTests() {
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

  // Charges from the prod WEL10 checkout: ₹7 handling + ₹9 platform + ₹2.88 GST.
  const config: PlatformConfig = {
    tiers: DEFAULT_TIERS_CONFIG.map((t) =>
      t.key === "bronze" ? { ...t, handlingChargePaise: 700, platformFeePaise: 900 } : t
    ),
  };
  const tenPercent = { discountType: "percentage" as const, discountValue: 10, maxDiscountPaise: undefined };

  // ── Discount base ─────────────────────────────────────────────────────────
  check("10% of the all-inclusive ₹1,347.88 is ₹134.79", computePromoDiscountPaise(tenPercent, 134788), 13479);
  check(
    "percentage discount respects its cap",
    computePromoDiscountPaise({ ...tenPercent, maxDiscountPaise: 10000 }, 134788),
    10000
  );
  check(
    "flat discount never exceeds the item total",
    computePromoDiscountPaise({ discountType: "fixed", discountValue: 50000, maxDiscountPaise: undefined }, 30000),
    30000
  );

  // ── Hive-funded ──────────────────────────────────────────────────────────
  const noCoupon = calculateCheckoutPricing([{ sellerBasePricePaise: 132900, quantity: 1 }], 12320, 0, "bronze", config);
  const hiveFunded = calculateCheckoutPricing([{ sellerBasePricePaise: 132900, quantity: 1 }], 12320, 13479, "bronze", config);
  check("item total matches the review page", hiveFunded.productSubtotalPaise, 134788);
  check("customer pays ₹1,336.29", hiveFunded.totalPayablePaise, 133629);
  check("Hive-funded: seller payout unchanged", hiveFunded.sellerPayoutPaise, noCoupon.sellerPayoutPaise);
  check("Hive-funded: split", [hiveFunded.sellerFundedDiscountPaise, hiveFunded.platformFundedDiscountPaise], [0, 13479]);

  // ── Seller-funded ────────────────────────────────────────────────────────
  const sellerFunded = calculateCheckoutPricing(
    [{ sellerBasePricePaise: 132900, quantity: 1 }], 12320, 13479, "bronze", config, 13479
  );
  const discountedItem = calculateSellerItemPricing(132900 - 13479, "bronze", config);
  check("seller-funded: customer total is the same as Hive-funded", sellerFunded.totalPayablePaise, 133629);
  check("seller-funded: commission on the discounted price", sellerFunded.sellerCommissionPaise, discountedItem.sellerCommissionPaise);
  check("seller-funded: payout is the discounted item's payout", sellerFunded.sellerPayoutPaise, discountedItem.sellerPayoutPaise);
  check("seller-funded: split", [sellerFunded.sellerFundedDiscountPaise, sellerFunded.platformFundedDiscountPaise], [13479, 0]);

  // Several lines and quantities: shares are floored, Hive covers the few paise left.
  const multi = calculateCheckoutPricing(
    [
      { sellerBasePricePaise: 99900, quantity: 3 },
      { sellerBasePricePaise: 45000, quantity: 1 },
    ],
    0, 10001, "bronze", config, 10001
  );
  check(
    "multi-line: seller + platform funded equals the discount",
    multi.sellerFundedDiscountPaise + multi.platformFundedDiscountPaise,
    10001
  );
  check("multi-line: seller never pays more than the discount", multi.sellerFundedDiscountPaise <= 10001, true);
  check("multi-line: rounding left to Hive is under ₹1", multi.platformFundedDiscountPaise < 100, true);

  // A flat discount bigger than the seller's base price: the seller pays at most the base.
  const oversized = calculateCheckoutPricing([{ sellerBasePricePaise: 5000, quantity: 1 }], 0, 6000, "bronze", config, 6000);
  check("oversized: seller absorbs only up to the base price", oversized.sellerFundedDiscountPaise, 5000);
  check("oversized: seller payout floors at zero", oversized.sellerPayoutPaise, 0);
  check("oversized: Hive covers the rest", oversized.platformFundedDiscountPaise, 1000);

  console.log(`\nPromo funding tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runPromoFundingTests();
