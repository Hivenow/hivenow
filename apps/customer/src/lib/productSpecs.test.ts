// apps/customer/src/lib/productSpecs.test.ts
//
// Tests for the product page's specification rows.
//
// The property that protects the existing catalogue: a product whose category
// has no attribute schema renders exactly the rows it rendered before, from its
// vertical's spec keys. The rest cover the schema path -- order, units, empty
// answers, and that keys outside the schema stay hidden.
//
// Run with: npx tsx apps/customer/src/lib/productSpecs.test.ts

import { resolveSpecRows } from "./productSpecs";

let passed = 0;
let failed = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

const LIFESTYLE_KEYS = ["color"];
const LIFESTYLE_LABELS = { color: "Colour" };

const NOTEBOOK_FIELDS = [
  { key: "packQuantity", label: "Pack of", unit: "notebooks" },
  { key: "dimensions", label: "Size (W × H, closed)" },
  { key: "pagesPerNotebook", label: "Pages per notebook", unit: "pages" },
  { key: "ruling", label: "Ruling" },
  { key: "paperGsm", label: "Paper weight", unit: "GSM" },
  { key: "binding", label: "Binding" },
];

// ─── 1. No schema: the vertical path is unchanged ────────────────────────────

assertEqual(
  "no schema renders the vertical's spec keys",
  resolveSpecRows({ color: "Maroon" }, LIFESTYLE_KEYS, LIFESTYLE_LABELS),
  [{ key: "color", label: "Colour", value: "Maroon" }]
);

assertEqual(
  "no schema ignores keys outside the vertical",
  resolveSpecRows({ color: "Maroon", threadCount: "300" }, LIFESTYLE_KEYS, LIFESTYLE_LABELS),
  [{ key: "color", label: "Colour", value: "Maroon" }]
);

assertEqual(
  "no schema falls back to the key when a label is missing",
  resolveSpecRows({ pattern: "Floral" }, ["pattern"], {}),
  [{ key: "pattern", label: "pattern", value: "Floral" }]
);

assertEqual(
  "no schema trims and skips blank values",
  resolveSpecRows({ color: "   " }, LIFESTYLE_KEYS, LIFESTYLE_LABELS),
  []
);

assertEqual(
  "an empty schema is treated as no schema",
  resolveSpecRows({ color: "Maroon" }, LIFESTYLE_KEYS, LIFESTYLE_LABELS, []),
  [{ key: "color", label: "Colour", value: "Maroon" }]
);

assertEqual(
  "undefined details render nothing",
  resolveSpecRows(undefined, LIFESTYLE_KEYS, LIFESTYLE_LABELS, NOTEBOOK_FIELDS),
  []
);

// ─── 2. Schema present: it governs ───────────────────────────────────────────

const floralCombo = {
  binding: "Centre Stitched",
  pagesPerNotebook: "48",
  packQuantity: "6",
  dimensions: "12 × 18 cm",
  ruling: "Unruled",
  paperGsm: "90",
};

assertEqual(
  "schema rows follow the schema's order, not the details object's",
  resolveSpecRows(floralCombo, LIFESTYLE_KEYS, LIFESTYLE_LABELS, NOTEBOOK_FIELDS).map((r) => r.key),
  ["packQuantity", "dimensions", "pagesPerNotebook", "ruling", "paperGsm", "binding"]
);

assertEqual(
  "schema rows carry the admin's label and append the unit",
  resolveSpecRows(floralCombo, LIFESTYLE_KEYS, LIFESTYLE_LABELS, NOTEBOOK_FIELDS).slice(0, 3),
  [
    { key: "packQuantity", label: "Pack of", value: "6 notebooks" },
    { key: "dimensions", label: "Size (W × H, closed)", value: "12 × 18 cm" },
    { key: "pagesPerNotebook", label: "Pages per notebook", value: "48 pages" },
  ]
);

assertEqual(
  "a unit the seller already typed is not repeated",
  resolveSpecRows({ paperGsm: "90 gsm" }, [], {}, NOTEBOOK_FIELDS),
  [{ key: "paperGsm", label: "Paper weight", value: "90 gsm" }]
);

assertEqual(
  "unanswered optional fields are skipped",
  resolveSpecRows({ packQuantity: "6" }, [], {}, NOTEBOOK_FIELDS),
  [{ key: "packQuantity", label: "Pack of", value: "6 notebooks" }]
);

assertEqual(
  "keys outside the schema stay hidden, colour included",
  resolveSpecRows({ packQuantity: "6", color: "Multicolour" }, LIFESTYLE_KEYS, LIFESTYLE_LABELS, NOTEBOOK_FIELDS),
  [{ key: "packQuantity", label: "Pack of", value: "6 notebooks" }]
);

assertEqual(
  "multi-select answers read as a spaced list",
  resolveSpecRows({ uses: "Journaling,Sketching , Gifting" }, [], {}, [{ key: "uses", label: "Ideal for" }]),
  [{ key: "uses", label: "Ideal for", value: "Journaling, Sketching, Gifting" }]
);

console.log(`\nProduct Specs Tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
