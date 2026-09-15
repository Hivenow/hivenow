import {
  getAllowedSpecKeysForCategory,
  validateProductDetailsForCategory,
} from "../lib/verticals";

/**
 * Contract tests for database-driven category attributes.
 *
 * The property that matters most here is the one that protects every product
 * already in the catalogue: a category with no attributeSets row must validate
 * exactly as it did before this table existed. Apparel has no rows, so if that
 * fallback ever broke, every clothing listing would start failing on its next
 * edit.
 *
 * The rest cover the new path — unknown keys rejected, required answers
 * enforced, numbers and choices checked against the schema an admin defined.
 */

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

async function checkRejects(
  name: string,
  fn: () => Promise<unknown>,
  expectedSubstring: string
) {
  try {
    await fn();
    failed++;
    console.error(`[FAIL] ${name}: expected a rejection, none was thrown.`);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (message.includes(expectedSubstring)) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.error(
        `[FAIL] ${name}\n         expected message containing "${expectedSubstring}"\n         got      "${message}"`
      );
    }
  }
}

/**
 * The narrowest stand-in for ctx.db that the code under test actually uses:
 * db.query("attributeSets").withIndex(...).first().
 */
function fakeDb(rowsByCategoryId: Record<string, { fields: unknown[] } | undefined>) {
  return {
    query(table: string) {
      if (table !== "attributeSets") {
        throw new Error(`unexpected table read: ${table}`);
      }
      return {
        withIndex(_index: string, builder: (q: any) => { __categoryId: string }) {
          const { __categoryId } = builder({
            eq: (_field: string, value: string) => ({ __categoryId: value }),
          });
          return {
            first: async () => rowsByCategoryId[__categoryId] ?? null,
          };
        },
      };
    },
  } as any;
}

const PERFUME_CATEGORY = "cat_perfume";
const SAREE_CATEGORY = "cat_saree";
const NOTEBOOK_CATEGORY = "cat_notebook";

const perfumeSchema = {
  fields: [
    { key: "volumeMl", label: "Volume", type: "number", required: true, unit: "ml" },
    {
      key: "concentration",
      label: "Concentration",
      type: "select",
      required: true,
      options: ["Eau de Parfum", "Eau de Toilette"],
    },
    {
      key: "notes",
      label: "Notes",
      type: "multi-select",
      required: false,
      options: ["Rose", "Oud", "Vanilla"],
    },
    { key: "batchCode", label: "Batch Code", type: "text", required: false },
  ],
};

// A schema that lists colour among its own fields, as a notebook set might.
const notebookSchema = {
  fields: [
    { key: "pagesPerNotebook", label: "Pages per notebook", type: "number", required: true, unit: "pages" },
    { key: "color", label: "Colour", type: "text", required: false },
  ],
};

// A saree category has no row: it keeps running on the apparel vertical.
const db = fakeDb({
  [PERFUME_CATEGORY]: perfumeSchema,
  [NOTEBOOK_CATEGORY]: notebookSchema,
  [SAREE_CATEGORY]: undefined,
});

async function run() {
  // ─── 1. No attribute set: the vertical path is unchanged ──────────────────

  check(
    "a category with no schema still accepts its vertical's keys",
    await validateProductDetailsForCategory(
      db,
      SAREE_CATEGORY as any,
      { neckType: "Round Neck", color: "Maroon" },
      "apparel"
    ),
    { neckType: "Round Neck", color: "Maroon" }
  );

  await checkRejects(
    "a category with no schema still rejects a key outside its vertical",
    () =>
      validateProductDetailsForCategory(
        db,
        SAREE_CATEGORY as any,
        { volumeMl: "100" },
        "apparel"
      ),
    "Invalid product specification key"
  );

  check(
    "undefined details stay undefined on the vertical path",
    await validateProductDetailsForCategory(db, SAREE_CATEGORY as any, undefined, "apparel"),
    undefined
  );

  check(
    "allowed keys fall back to the vertical when no schema exists",
    (await getAllowedSpecKeysForCategory(db, SAREE_CATEGORY as any, "apparel")).has("neckType"),
    true
  );

  // ─── 2. Attribute set present: it governs, the vertical does not ──────────

  check(
    "a schema-driven category accepts its own keys",
    await validateProductDetailsForCategory(
      db,
      PERFUME_CATEGORY as any,
      { volumeMl: "100", concentration: "Eau de Parfum", notes: "Rose, Oud" },
      "fragrance"
    ),
    { volumeMl: "100", concentration: "Eau de Parfum", notes: "Rose, Oud" }
  );

  await checkRejects(
    "a key outside the schema is rejected even when the vertical allows it",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "100", concentration: "Eau de Parfum", longevity: "8-12 Hours" },
        "fragrance"
      ),
    "not one of this category's attributes"
  );

  await checkRejects(
    "a missing required answer is rejected",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "100" },
        "fragrance"
      ),
    "Missing required"
  );

  await checkRejects(
    "a non-numeric answer to a number field is rejected",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "one hundred", concentration: "Eau de Parfum" },
        "fragrance"
      ),
    "must be a number"
  );

  await checkRejects(
    "a choice outside the option list is rejected",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "100", concentration: "Body Mist" },
        "fragrance"
      ),
    "is not a valid choice"
  );

  await checkRejects(
    "one bad entry invalidates a multi-select",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "100", concentration: "Eau de Parfum", notes: "Rose, Petrol" },
        "fragrance"
      ),
    '"Petrol" is not a valid choice'
  );

  await checkRejects(
    "several bad entries are named together",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "100", concentration: "Eau de Parfum", notes: "Petrol, Tar" },
        "fragrance"
      ),
    "are not valid choices"
  );

  check(
    "blank optional answers are dropped, not stored",
    await validateProductDetailsForCategory(
      db,
      PERFUME_CATEGORY as any,
      { volumeMl: "50", concentration: "Eau de Toilette", batchCode: "   " },
      "fragrance"
    ),
    { volumeMl: "50", concentration: "Eau de Toilette" }
  );

  check(
    "allowed keys come from the schema, not the vertical",
    [...(await getAllowedSpecKeysForCategory(db, PERFUME_CATEGORY as any, "fragrance"))].sort(),
    ["batchCode", "concentration", "notes", "volumeMl"]
  );

  // ─── 3. Colour is not exempt from the schema ──────────────────────────────
  //
  // The seller form used to send details.color for every product. On a schema
  // category that does not list colour, that alone made every publish fail.
  // The form now sends colour only through the schema's own fields; these pin
  // the server rule the form relies on.

  await checkRejects(
    "a schema category without a colour field rejects details.color",
    () =>
      validateProductDetailsForCategory(
        db,
        PERFUME_CATEGORY as any,
        { volumeMl: "50", concentration: "Eau de Toilette", color: "Amber" },
        "fragrance"
      ),
    `"color" is not one of this category's attributes`
  );

  check(
    "a schema category that lists colour accepts details.color",
    await validateProductDetailsForCategory(
      db,
      NOTEBOOK_CATEGORY as any,
      { pagesPerNotebook: "48", color: "Multicolour" },
      "lifestyle"
    ),
    { pagesPerNotebook: "48", color: "Multicolour" }
  );

  check(
    "a schema category's optional colour may be omitted",
    await validateProductDetailsForCategory(
      db,
      NOTEBOOK_CATEGORY as any,
      { pagesPerNotebook: "48" },
      "lifestyle"
    ),
    { pagesPerNotebook: "48" }
  );

  console.log(`\nCategory attributes: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run();
