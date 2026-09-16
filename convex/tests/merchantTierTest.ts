// convex/tests/merchantTierTest.ts
//
// Tests for the stored merchant tier rule used by getApprovedBoutiques.
//
// getApprovedBoutiques used to compute a tier per boutique, reading every order
// and claim for any boutique without a stored value. In production 11 of 15
// approved boutiques had no stored tier, so a query mounted in the customer
// root provider read ~113 documents per execution. It now reads the stored
// field with the same Bronze default that product approval and the admin tier
// displays already apply.
//
// The property that matters: a stored tier is returned unchanged, and a missing
// one reads as Bronze -- the value those other consumers already see.
//
// Run with: npx tsx convex/tests/merchantTierTest.ts

import { storedMerchantTier } from "../boutiques";

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

// ─── Stored values are returned unchanged ────────────────────────────────────

check("stored Bronze returns Bronze", storedMerchantTier({ merchantTier: "Bronze" }), "Bronze");
check("stored Silver is preserved", storedMerchantTier({ merchantTier: "Silver" }), "Silver");
check("stored Gold is preserved", storedMerchantTier({ merchantTier: "Gold" }), "Gold");
check("stored Elite is preserved", storedMerchantTier({ merchantTier: "Elite" }), "Elite");

// ─── A missing tier defaults to Bronze ───────────────────────────────────────
//
// This is the case that matters in production: 11 of 15 approved boutiques.
// Bronze is what product approval (products.ts:createProduct) and the admin
// displays already resolve for these same boutiques, so reading the stored
// field here removes a disagreement rather than creating one.

check("missing merchantTier reads as Bronze", storedMerchantTier({}), "Bronze");
check(
  "explicitly undefined merchantTier reads as Bronze",
  storedMerchantTier({ merchantTier: undefined }),
  "Bronze"
);

// The result must always be a storable value. "New Boutique", which the old
// dynamic resolver could return, is not in the schema's union
// (convex/schema.ts: Bronze | Silver | Gold | Elite).
const STORABLE = ["Bronze", "Silver", "Gold", "Elite"];
check(
  "every result is a value the schema allows",
  [
    { merchantTier: "Bronze" as const },
    { merchantTier: "Silver" as const },
    { merchantTier: "Gold" as const },
    { merchantTier: "Elite" as const },
    {},
  ].every((b) => STORABLE.includes(storedMerchantTier(b))),
  true
);

console.log(`\nMerchant tier: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
