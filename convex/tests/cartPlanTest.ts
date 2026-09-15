import {
  MAX_LINES,
  MAX_QTY_PER_LINE,
  lineKey,
  effectiveSellingPricePaise,
  priceChange,
  capLineQuantity,
  decideQuantity,
  wouldExceedLineLimit,
  cartBoutique,
  dedupeLines,
  planGuestMerge,
  type PlanLine,
} from "../lib/cart";

/**
 * Tests for the pure cart v2 helpers (docs/specs/cart-v2.md, revision 2).
 *
 * Each block maps to a frozen decision: 20 product+size lines, 10 units per line then stock,
 * guest merge with max-not-sum on the same boutique, ask-the-shopper on a boutique conflict,
 * deterministic handling of duplicate lines, and price-change flags in paise.
 */

const line = (overrides: Partial<PlanLine> & Pick<PlanLine, "productId">): PlanLine => ({
  boutiqueId: "b_kochi",
  size: "M",
  quantity: 1,
  priceAtAddPaise: 141788,
  addedAt: 1000,
  ...overrides,
});

export function runCartPlanTests() {
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

  // ── Limits (D8, D9) ───────────────────────────────────────────────────────
  check("limits are 20 lines and 10 units", [MAX_LINES, MAX_QTY_PER_LINE], [20, 10]);

  // The spec's example: 4 lines, 12 units is allowed.
  const example = [
    line({ productId: "kurti", size: "M", quantity: 3 }),
    line({ productId: "kurti", size: "L", quantity: 2 }),
    line({ productId: "bag", size: "Free", quantity: 1 }),
    line({ productId: "notebook", size: "Free", quantity: 6 }),
  ];
  check("line limit counts product+size, not units", wouldExceedLineLimit(example, "saree", "Free"), false);

  const twenty = Array.from({ length: 20 }, (_, i) => line({ productId: `p${i}` }));
  check("21st distinct line exceeds the limit", wouldExceedLineLimit(twenty, "p20", "M"), true);
  check("existing line at the limit does not count as new", wouldExceedLineLimit(twenty, "p5", "M"), false);
  check("same product, new size is a new line", wouldExceedLineLimit(twenty, "p5", "L"), true);
  check("FS and Free are the same line", wouldExceedLineLimit([line({ productId: "saree", size: "Free" })], "saree", "FS"), false);

  check("cap: 10 units max", capLineQuantity(14), 10);
  check("cap: stock below 10 caps further", capLineQuantity(8, 3), 3);
  check("cap: zero stock keeps quantity for out-of-stock reporting", capLineQuantity(4, 0), 4);
  check("cap: unknown stock caps at 10 only", capLineQuantity(12, undefined), 10);

  check("write: within limits", decideQuantity(4, 6), { ok: true, quantity: 4 });
  check("write: over 10 is rejected, not clamped", decideQuantity(11, 50), { ok: false, code: "CART_QUANTITY_LIMIT", maxQuantity: 10 });
  check("write: over stock is rejected with available", decideQuantity(5, 2), { ok: false, code: "CART_QUANTITY_EXCEEDS_STOCK", available: 2 });
  check("write: 10 at exactly 10 stock is ok", decideQuantity(10, 10), { ok: true, quantity: 10 });

  // ── Boutique detection ────────────────────────────────────────────────────
  check("boutique: empty", cartBoutique([]), { kind: "none" });
  check("boutique: single", cartBoutique([line({ productId: "a" }), line({ productId: "b" })]), { kind: "single", boutiqueId: "b_kochi" });
  check("boutique: mixed is detected", cartBoutique([line({ productId: "a" }), line({ productId: "b", boutiqueId: "b_other" })]).kind, "mixed");

  // ── Price change (D6) ─────────────────────────────────────────────────────
  check("price: discount lower than price wins", effectiveSellingPricePaise({ price: 700000, discountPrice: 450000 }), 450000);
  check("price: discount not lower is ignored", effectiveSellingPricePaise({ price: 99900, discountPrice: 99900 }), 99900);
  check("price: no discount", effectiveSellingPricePaise({ price: 141788 }), 141788);
  check("price change: unchanged", priceChange(141788, 141788), { priceChanged: false, priceDeltaPaise: 0 });
  check("price change: increase", priceChange(151788, 141788), { priceChanged: true, priceDeltaPaise: 10000 });
  check("price change: decrease", priceChange(131788, 141788), { priceChanged: true, priceDeltaPaise: -10000 });

  // ── Duplicate lines are deterministic ─────────────────────────────────────
  const dupes = dedupeLines([
    line({ productId: "kurti", size: "M", quantity: 2, addedAt: 3000, priceAtAddPaise: 151788 }),
    line({ productId: "kurti", size: "M", quantity: 5, addedAt: 1000, priceAtAddPaise: 141788 }),
    line({ productId: "saree", size: "FS", quantity: 1, addedAt: 2000 }),
    line({ productId: "saree", size: "Free", quantity: 3, addedAt: 2500 }),
  ]);
  check("dedupe: collapses same product+size (FS = Free)", dupes.length, 2);
  check("dedupe: keeps max quantity", dupes.map((l) => [l.productId, l.quantity]), [["kurti", 5], ["saree", 3]]);
  check("dedupe: keeps earliest addedAt and its price", [dupes[0]!.addedAt, dupes[0]!.priceAtAddPaise], [1000, 141788]);
  const shuffled = dedupeLines([
    line({ productId: "saree", size: "Free", quantity: 3, addedAt: 2500 }),
    line({ productId: "kurti", size: "M", quantity: 5, addedAt: 1000, priceAtAddPaise: 141788 }),
    line({ productId: "saree", size: "FS", quantity: 1, addedAt: 2000 }),
    line({ productId: "kurti", size: "M", quantity: 2, addedAt: 3000, priceAtAddPaise: 151788 }),
  ]);
  check("dedupe: input order does not change the result", shuffled, dupes);

  // ── Guest merge (D2, D3, D4) ──────────────────────────────────────────────
  const account = [line({ productId: "kurti", size: "M", quantity: 2, addedAt: 1000 })];

  check("merge: empty guest bag is no change", planGuestMerge({ accountLines: account, guestLines: [] }).kind, "no_change");

  const intoEmpty = planGuestMerge({ accountLines: [], guestLines: [line({ productId: "saree", size: "Free", quantity: 2 })] });
  check("merge: empty account takes the guest bag", intoEmpty.kind === "merged" ? intoEmpty.lines.map((l) => l.productId) : intoEmpty.kind, ["saree"]);

  const sameBoutique = planGuestMerge({
    accountLines: account,
    guestLines: [
      line({ productId: "kurti", size: "M", quantity: 4, addedAt: 500, priceAtAddPaise: 131788 }),
      line({ productId: "dupatta", size: "Free", quantity: 1, addedAt: 2000 }),
    ],
  });
  if (sameBoutique.kind !== "merged") throw new Error("expected merged");
  check("merge same boutique: union of lines", sameBoutique.lines.map((l) => lineKey(l.productId, l.size)), ["kurti|M", "dupatta|Free"]);
  check("merge same boutique: max(guest, account), not sum", sameBoutique.lines[0]!.quantity, 4);
  check("merge same boutique: earlier guest add keeps its earlier price", sameBoutique.lines[0]!.priceAtAddPaise, 131788);
  check("merge same boutique: nothing displaced", sameBoutique.displacedLines.length, 0);

  const capped = planGuestMerge({
    accountLines: [line({ productId: "kurti", size: "M", quantity: 6 })],
    guestLines: [line({ productId: "kurti", size: "M", quantity: 12 })],
    availableByKey: new Map([[lineKey("kurti", "M"), 7]]),
  });
  check("merge: capped by stock", capped.kind === "merged" ? capped.lines[0]!.quantity : -1, 7);
  const cappedTen = planGuestMerge({
    accountLines: [line({ productId: "kurti", size: "M", quantity: 6 })],
    guestLines: [line({ productId: "kurti", size: "M", quantity: 12 })],
    availableByKey: new Map([[lineKey("kurti", "M"), 40]]),
  });
  check("merge: capped at 10 when stock is higher", cappedTen.kind === "merged" ? cappedTen.lines[0]!.quantity : -1, 10);

  const replay1 = planGuestMerge({ accountLines: account, guestLines: [line({ productId: "kurti", size: "M", quantity: 3 })] });
  const replay2 = planGuestMerge({
    accountLines: replay1.kind === "merged" ? replay1.lines : [],
    guestLines: [line({ productId: "kurti", size: "M", quantity: 3 })],
  });
  check(
    "merge: replaying the same guest bag is idempotent",
    replay2.kind === "merged" ? replay2.lines.map((l) => l.quantity) : replay2.kind,
    [3]
  );

  const fullAccount = Array.from({ length: 19 }, (_, i) => line({ productId: `acct${i}`, addedAt: 5000 + i }));
  const overflow = planGuestMerge({
    accountLines: fullAccount,
    guestLines: [
      line({ productId: "guestLate", addedAt: 9000 }),
      line({ productId: "guestEarly", addedAt: 100 }),
    ],
  });
  if (overflow.kind !== "merged") throw new Error("expected merged");
  check("merge: 20-line limit keeps every account line", overflow.lines.filter((l) => l.productId.startsWith("acct")).length, 19);
  check("merge: remaining slot goes to the earliest guest line", overflow.lines.some((l) => l.productId === "guestEarly"), true);
  check("merge: overflow guest line reported as line_limit", overflow.droppedGuestLines.map((d) => [d.line.productId, d.reason]), [["guestLate", "line_limit"]]);
  check("merge: result never exceeds 20 lines", overflow.lines.length, 20);

  const guestOther = [line({ productId: "lehenga", boutiqueId: "b_fort", size: "S", quantity: 1, addedAt: 3000 })];
  const conflict = planGuestMerge({ accountLines: account, guestLines: guestOther });
  check("conflict: different boutiques without resolution ask the shopper", conflict.kind, "conflict");
  if (conflict.kind === "conflict") {
    check("conflict: reports both boutiques", [conflict.accountBoutiqueId, conflict.guestBoutiqueId], ["b_kochi", "b_fort"]);
    check("conflict: returns both bags for the choice screen", [conflict.accountLines.length, conflict.guestLines.length], [1, 1]);
  }

  const keepGuest = planGuestMerge({ accountLines: account, guestLines: guestOther, resolution: "keep_guest" });
  check(
    "resolve keep_guest: guest bag becomes the cart, account displaced",
    keepGuest.kind === "merged" ? [keepGuest.lines.map((l) => l.productId), keepGuest.displacedLines.map((l) => l.productId)] : keepGuest.kind,
    [["lehenga"], ["kurti"]]
  );
  const keepAccount = planGuestMerge({ accountLines: account, guestLines: guestOther, resolution: "keep_account" });
  check(
    "resolve keep_account: account stays, guest displaced",
    keepAccount.kind === "merged" ? [keepAccount.lines.map((l) => l.productId), keepAccount.displacedLines.map((l) => l.productId)] : keepAccount.kind,
    [["kurti"], ["lehenga"]]
  );
  const sameWithResolution = planGuestMerge({
    accountLines: account,
    guestLines: [line({ productId: "dupatta", size: "Free" })],
    resolution: "keep_account",
  });
  check("resolution is ignored when boutiques match (still merges)", sameWithResolution.kind === "merged" ? sameWithResolution.lines.length : -1, 2);

  // Mixed-boutique guest bag is invalid state: never pick a boutique implicitly.
  const mixedLines = [
    line({ productId: "old", boutiqueId: "b_fort", addedAt: 100 }),
    line({ productId: "new", boutiqueId: "b_kochi", addedAt: 900 }),
  ];
  const mixedIntoEmpty = planGuestMerge({ accountLines: [], guestLines: mixedLines });
  check("mixed guest bag (empty account) is invalid, not merged", mixedIntoEmpty.kind, "invalid_guest_bag");
  if (mixedIntoEmpty.kind === "invalid_guest_bag") {
    check("mixed guest bag reports reason and both boutiques", [mixedIntoEmpty.reason, mixedIntoEmpty.guestBoutiqueIds], ["mixed_boutiques", ["b_fort", "b_kochi"]]);
    check("mixed guest bag returns every guest line, none dropped", [mixedIntoEmpty.guestLines.map((l) => l.productId), mixedIntoEmpty.droppedGuestLines.length], [["old", "new"], 0]);
  }
  check("mixed guest bag (account on one of its boutiques) is still invalid", planGuestMerge({ accountLines: account, guestLines: mixedLines }).kind, "invalid_guest_bag");
  check("mixed guest bag is invalid even with a resolution", planGuestMerge({ accountLines: account, guestLines: mixedLines, resolution: "keep_guest" }).kind, "invalid_guest_bag");

  const badQuantity = planGuestMerge({ accountLines: account, guestLines: [line({ productId: "x", quantity: 0 })] });
  check("guest line with zero quantity is dropped", badQuantity.kind === "no_change" ? badQuantity.droppedGuestLines.map((d) => d.reason) : badQuantity.kind, ["invalid_quantity"]);

  console.log(`\nCart plan: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("cartPlanTest")) {
  const { failed } = runCartPlanTests();
  if (failed > 0) process.exit(1);
}
