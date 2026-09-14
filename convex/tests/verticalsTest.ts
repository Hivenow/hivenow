import { PRODUCT_SPEC_KEYS } from "../../packages/types/src/product";
import {
  GLOBAL_QUALITY_BUDGET,
  VERTICAL_CONFIGS,
  VERTICAL_QUALITY_BUDGET,
  VERTICAL_TYPES,
  effectiveVerticalType,
  getVerticalConfig,
  isVerticalType,
  resolveCategorySizing,
  isFreeSizeLiteral,
  SIZING_PRESETS,
  type QualityRule,
  type VerticalType,
} from "../../packages/types/src/verticals";
import { getAllowedSpecKeys, validateAndCleanProductDetails } from "../lib/verticals";

/**
 * Contract tests for the vertical registry.
 *
 * The properties that matter here are all regression guards, not feature tests:
 *
 *   - the apparel vertical can never narrow the live specification key set,
 *     because narrowing it would silently delete specs off existing products
 *     the next time a seller edits one;
 *   - scoring is unchanged for every product in the database today, so no
 *     product's catalogue quality score or featurability moves;
 *   - a record written before verticals existed still behaves as apparel,
 *     which is what makes a backfill unnecessary.
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

function checkTrue(name: string, actual: boolean) {
  check(name, actual, true);
}

const QUALITY_COLUMN_FIELDS = [
  "material",
  "care",
  "origin",
  "fitRecommendation",
  "story",
];

// ─── 1. Apparel is a superset of the live production spec keys ──────────────
// Guards the single most destructive regression available here: shipping an
// apparel config that omits a live key would drop that key's value from every
// product edited afterwards.

const liveSpecKeys = Object.keys(PRODUCT_SPEC_KEYS).sort();
const apparelSpecKeys = [...VERTICAL_CONFIGS.apparel.specKeys].sort();

check("apparel specKeys equal the live PRODUCT_SPEC_KEYS set", apparelSpecKeys, liveSpecKeys);
check(
  "apparel specKeys count matches PRODUCT_SPEC_KEYS",
  apparelSpecKeys.length,
  liveSpecKeys.length
);

for (const key of liveSpecKeys) {
  checkTrue(
    `apparel retains live spec key "${key}"`,
    (VERTICAL_CONFIGS.apparel.specKeys as readonly string[]).includes(key)
  );
  checkTrue(
    `apparel labels live spec key "${key}"`,
    typeof VERTICAL_CONFIGS.apparel.specLabels[key] === "string"
  );
}

// The five keys the first draft of the registry would have dropped. Named
// explicitly so a future edit that removes one fails with an obvious message.
for (const key of ["ethnicity", "ornamentation", "colorDetails", "fabricType", "slitDetail"]) {
  checkTrue(
    `apparel retains previously at-risk key "${key}"`,
    (VERTICAL_CONFIGS.apparel.specKeys as readonly string[]).includes(key)
  );
}

// ─── 2. Every vertical spends exactly the vertical quality budget ───────────
// Global rules cover 50 points; if a vertical does not distribute the other 50,
// a perfect listing could not reach 100 and the >= 70 featuring gate would
// quietly change meaning.

for (const id of VERTICAL_TYPES) {
  const total = VERTICAL_CONFIGS[id].quality.scoredFields.reduce(
    (sum: number, rule: QualityRule) => sum + rule.points,
    0
  );
  check(`${id} scoredFields sum to the vertical budget`, total, VERTICAL_QUALITY_BUDGET);
}

check("global + vertical budgets total 100", GLOBAL_QUALITY_BUDGET + VERTICAL_QUALITY_BUDGET, 100);

// ─── 3. Quality rules reference real fields, in the right namespace ─────────

for (const id of VERTICAL_TYPES) {
  const config = VERTICAL_CONFIGS[id];
  const seen = new Set<string>();

  for (const rule of config.quality.scoredFields) {
    checkTrue(`${id} quality rule "${rule.field}" is not duplicated`, !seen.has(rule.field));
    seen.add(rule.field);

    checkTrue(`${id} quality rule "${rule.field}" awards positive points`, rule.points > 0);
    checkTrue(`${id} quality rule "${rule.field}" has a gain label`, rule.label.length > 0);
    checkTrue(
      `${id} quality rule "${rule.field}" has a checklist label`,
      rule.missingLabel.length > 0
    );

    if (rule.source === "detail") {
      checkTrue(
        `${id} detail rule "${rule.field}" is one of the vertical's spec keys`,
        (config.specKeys as readonly string[]).includes(rule.field)
      );
    } else {
      checkTrue(
        `${id} column rule "${rule.field}" is a known product column`,
        QUALITY_COLUMN_FIELDS.includes(rule.field)
      );
    }
  }
}

// `material` is a product column everywhere; it must never be a details key,
// or the same value would be readable from two places.
for (const id of VERTICAL_TYPES) {
  checkTrue(
    `${id} does not treat "material" as a details key`,
    !(VERTICAL_CONFIGS[id].specKeys as readonly string[]).includes("material")
  );
}

// ─── 4. Legacy records resolve defensively to apparel ───────────────────────

check("undefined resolves to apparel", effectiveVerticalType(undefined), "apparel");
check("null resolves to apparel", effectiveVerticalType(null), "apparel");
check("empty string resolves to apparel", effectiveVerticalType(""), "apparel");
check("unknown value resolves to apparel", effectiveVerticalType("banana"), "apparel");
check("wrong case resolves to apparel", effectiveVerticalType("APPAREL"), "apparel");
check("config for undefined is the apparel config", getVerticalConfig(undefined).id, "apparel");
check("config for unknown is the apparel config", getVerticalConfig("banana").id, "apparel");

check("isVerticalType rejects unknown values", isVerticalType("banana"), false);
check("isVerticalType rejects undefined", isVerticalType(undefined), false);
check("isVerticalType accepts a known vertical", isVerticalType("fragrance"), true);

for (const id of VERTICAL_TYPES) {
  check(`${id} round-trips through getVerticalConfig`, getVerticalConfig(id).id, id);
}

// ─── 5. The registry and its type list cannot drift apart ───────────────────

check(
  "VERTICAL_TYPES matches the registry keys",
  [...VERTICAL_TYPES].sort(),
  Object.keys(VERTICAL_CONFIGS).sort()
);

for (const id of VERTICAL_TYPES) {
  check(`${id} config id matches its registry key`, VERTICAL_CONFIGS[id].id, id);
}

// A legacy product with no verticalType must be allowed exactly the keys it
// could store before verticals existed.
check(
  "allowed keys for a legacy product equal the live spec key set",
  [...getAllowedSpecKeys(undefined)].sort(),
  liveSpecKeys
);
check(
  "allowed keys for an unknown vertical fall back to apparel",
  [...getAllowedSpecKeys("banana")].sort(),
  liveSpecKeys
);
checkTrue(
  "a fragrance product may not store apparel-only keys",
  !getAllowedSpecKeys("fragrance").has("neckType")
);
checkTrue(
  "a fragrance product may store fragrance keys",
  getAllowedSpecKeys("fragrance").has("topNotes")
);

// `craft` is submitted by the live partner form but is not a recognised spec
// key. It must keep being dropped, under every vertical, until that writer is
// migrated — adding it here would make dead data permanent.
for (const id of VERTICAL_TYPES) {
  checkTrue(`${id} does not accept the unmigrated "craft" key`, !getAllowedSpecKeys(id).has("craft"));
}

// ─── 5b. Strict Specification Key Validation (Phase 5B) ──────────────────────
// Verifies that validateAndCleanProductDetails accepts valid keys for each vertical,
// strips empty/whitespace values, and strictly throws on unknown/cross-vertical keys.

function checkThrows(name: string, fn: () => void, expectedErrorSubstring?: string) {
  try {
    fn();
    failed++;
    console.error(`[FAIL] ${name}: Expected exception but none was thrown.`);
  } catch (err: any) {
    if (!expectedErrorSubstring || String(err?.message || err).includes(expectedErrorSubstring)) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.error(
        `[FAIL] ${name}: Threw unexpected error.\n         expected substring: ${expectedErrorSubstring}\n         got: ${err?.message || err}`
      );
    }
  }
}

// Undefined input preserves undefined
check("validateAndCleanProductDetails(undefined) returns undefined", validateAndCleanProductDetails(undefined, "apparel"), undefined);

// Empty input returns empty object
check("validateAndCleanProductDetails({}) returns {}", validateAndCleanProductDetails({}, "apparel"), {});

// Strips whitespace and empty string values
check(
  "validateAndCleanProductDetails strips empty and whitespace-only values",
  validateAndCleanProductDetails({ color: "  Red  ", neckType: "", sleeve: "   " }, "apparel"),
  { color: "Red" }
);

// Accepts all valid keys dynamically derived from registry
for (const vType of VERTICAL_TYPES) {
  const allowed = [...getAllowedSpecKeys(vType)];
  const samplePayload: Record<string, string> = {};
  for (const k of allowed) {
    samplePayload[k] = `Sample ${k}`;
  }
  const result = validateAndCleanProductDetails(samplePayload, vType);
  check(`all ${allowed.length} registry keys for ${vType} are accepted`, Object.keys(result || {}).length, allowed.length);
}

// Apparel rejects non-apparel and invalid keys
checkThrows(
  "apparel strictly rejects unmigrated 'craft' key",
  () => validateAndCleanProductDetails({ craft: "Chikankari" }, "apparel"),
  "Invalid product specification key \"craft\""
);
checkThrows(
  "apparel strictly rejects fragrance key 'topNotes'",
  () => validateAndCleanProductDetails({ topNotes: "Bergamot" }, "apparel"),
  "Invalid product specification key \"topNotes\""
);
checkThrows(
  "apparel strictly rejects handbag key 'bagType'",
  () => validateAndCleanProductDetails({ bagType: "Tote" }, "apparel"),
  "Invalid product specification key \"bagType\""
);

// Fragrance rejects apparel and invalid keys
checkThrows(
  "fragrance strictly rejects apparel key 'neckType'",
  () => validateAndCleanProductDetails({ neckType: "V-Neck" }, "fragrance"),
  "Invalid product specification key \"neckType\""
);
checkThrows(
  "fragrance strictly rejects unmigrated 'craft' key",
  () => validateAndCleanProductDetails({ craft: "Oud" }, "fragrance"),
  "Invalid product specification key \"craft\""
);

// Handbag rejects apparel and fragrance keys
checkThrows(
  "handbag strictly rejects apparel key 'sleeve'",
  () => validateAndCleanProductDetails({ sleeve: "Full" }, "handbag"),
  "Invalid product specification key \"sleeve\""
);
checkThrows(
  "handbag strictly rejects fragrance key 'fragranceFamily'",
  () => validateAndCleanProductDetails({ fragranceFamily: "Woody" }, "handbag"),
  "Invalid product specification key \"fragranceFamily\""
);
checkThrows(
  "handbag strictly rejects unmigrated 'craft' key",
  () => validateAndCleanProductDetails({ craft: "Leather Craft" }, "handbag"),
  "Invalid product specification key \"craft\""
);

// ─── 6. Scoring parity with the pre-vertical implementation ─────────────────
// A frozen copy of the scoring rules as they were before this change. If the
// apparel config ever stops reproducing these exactly — same fields, points,
// order and wording — an existing product's score would move.

type LegacyResult = {
  score: number;
  canBeFeatured: boolean;
  missing: string[];
  gains: Array<{ field: string; points: number; label: string }>;
};

function legacyQuality(product: any): LegacyResult {
  const missing: string[] = [];
  const gains: Array<{ field: string; points: number; label: string }> = [];
  let score = 0;

  if (product.images && product.images.length >= 1) {
    score += 15;
  } else {
    missing.push("Add a cover image");
    gains.push({ field: "coverImage", points: 15, label: "Add a cover image (+15)" });
  }

  if (product.images && product.images.length >= 3) {
    score += 20;
  } else {
    missing.push("Add at least 3 photos");
    gains.push({ field: "images3", points: 20, label: "Add at least 3 photos (+20)" });
  }

  if (product.description && product.description.trim().length >= 20) {
    score += 15;
  } else {
    missing.push("Add a descriptive description");
    gains.push({ field: "description", points: 15, label: "Add a descriptive description (+15)" });
  }

  if (product.material && product.material.trim() !== "") {
    score += 10;
  } else {
    missing.push("Add material details");
    gains.push({ field: "material", points: 10, label: "Add material details (+10)" });
  }

  if (product.care && product.care.trim() !== "") {
    score += 10;
  } else {
    missing.push("Add care instructions");
    gains.push({ field: "care", points: 10, label: "Add care instructions (+10)" });
  }

  if (product.origin && product.origin.trim() !== "") {
    score += 10;
  } else {
    missing.push("Add origin info");
    gains.push({ field: "origin", points: 10, label: "Add origin info (+10)" });
  }

  if (product.fitRecommendation) {
    score += 15;
  } else {
    missing.push("Add fit recommendation (Runs Small / True to Size / Runs Large)");
    gains.push({ field: "fitRecommendation", points: 15, label: "Add fit recommendation (+15)" });
  }

  if (product.story && product.story.trim() !== "") {
    score += 5;
  } else {
    missing.push("Add a design story / product narrative");
    gains.push({ field: "story", points: 5, label: "Add a design story / product narrative (+5)" });
  }

  return { score, canBeFeatured: score >= 70, missing, gains };
}

/**
 * Mirrors the config-driven scorer in convex/products.ts. Reimplemented here
 * rather than imported because that module pulls in the Convex server runtime,
 * which a plain `tsx` run cannot load.
 */
function configQuality(product: any, verticalTypeOverride?: string | null): LegacyResult {
  const config = getVerticalConfig(verticalTypeOverride ?? product?.verticalType);
  const missing: string[] = [];
  const gains: Array<{ field: string; points: number; label: string }> = [];
  let score = 0;

  if (product.images && product.images.length >= 1) {
    score += 15;
  } else {
    missing.push("Add a cover image");
    gains.push({ field: "coverImage", points: 15, label: "Add a cover image (+15)" });
  }

  if (product.images && product.images.length >= 3) {
    score += 20;
  } else {
    missing.push("Add at least 3 photos");
    gains.push({ field: "images3", points: 20, label: "Add at least 3 photos (+20)" });
  }

  if (product.description && product.description.trim().length >= 20) {
    score += 15;
  } else {
    missing.push("Add a descriptive description");
    gains.push({ field: "description", points: 15, label: "Add a descriptive description (+15)" });
  }

  for (const rule of config.quality.scoredFields) {
    const raw = rule.source === "column" ? product?.[rule.field] : product?.details?.[rule.field];
    const present = typeof raw === "string" ? raw.trim() !== "" : Boolean(raw);
    if (present) {
      score += rule.points;
    } else {
      missing.push(rule.missingLabel);
      gains.push({ field: rule.field, points: rule.points, label: rule.label });
    }
  }

  return { score, canBeFeatured: score >= 70, missing, gains };
}

const emptyProduct = {};

const partialProduct = {
  images: ["a", "b"],
  description: "A hand-loomed cotton kurta with a mandarin collar.",
  material: "Cotton",
  care: "  ",
  origin: "",
  story: "Woven in Chendamangalam.",
};

const completeProduct = {
  images: ["a", "b", "c"],
  description: "A hand-loomed cotton kurta with a mandarin collar and side slits.",
  material: "Cotton",
  care: "Hand wash cold",
  origin: "Kerala, India",
  fitRecommendation: "true_to_size",
  story: "Woven in Chendamangalam.",
  details: { neckType: "Mandarin", color: "Ivory" },
};

const legacyFixtures: Array<[string, any]> = [
  ["an empty product", emptyProduct],
  ["a partially filled product", partialProduct],
  ["a complete product", completeProduct],
  ["a product explicitly stamped apparel", { ...completeProduct, verticalType: "apparel" }],
  ["a product with an unrecognised vertical", { ...completeProduct, verticalType: "banana" }],
];

for (const [name, fixture] of legacyFixtures) {
  check(`scoring is unchanged for ${name}`, configQuality(fixture), legacyQuality(fixture));
}

check("a complete apparel product still scores 100", configQuality(completeProduct).score, 100);
check("an empty product still scores 0", configQuality(emptyProduct).score, 0);
checkTrue("a complete apparel product is still featurable", configQuality(completeProduct).canBeFeatured);

// A perfect listing must be able to reach 100 in every vertical, generic ones
// included — otherwise the featuring gate becomes unreachable for them.
const perfectByVertical: Record<VerticalType, any> = {
  apparel: completeProduct,
  fragrance: {
    images: ["a", "b", "c"],
    description: "An amber oud eau de parfum with a long dry-down.",
    origin: "Kannauj, India",
    verticalType: "fragrance",
    details: {
      concentration: "Eau de Parfum",
      topNotes: "Bergamot",
      heartNotes: "Rose",
      baseNotes: "Oud",
    },
  },
  handbag: {
    images: ["a", "b", "c"],
    description: "A structured leather tote with a detachable strap.",
    material: "Full-grain leather",
    verticalType: "handbag",
    details: {
      bagType: "Tote",
      dimensions: "30 x 12 x 28 cm",
      compartments: "One zip pocket, two slip pockets",
    },
  },
  footwear: {
    images: ["a", "b", "c"],
    description: "A hand-stitched leather sandal with a cushioned footbed.",
    material: "Leather",
    care: "Wipe clean",
    origin: "Kerala, India",
    verticalType: "footwear",
  },
  jewellery: {
    images: ["a", "b", "c"],
    description: "A hand-finished brass choker with a matte antique finish.",
    material: "Brass",
    care: "Keep away from moisture",
    origin: "Kerala, India",
    verticalType: "jewellery",
  },
  lifestyle: {
    images: ["a", "b", "c"],
    description: "A block-printed cotton table runner finished with a hand hem.",
    material: "Cotton",
    care: "Machine wash cold",
    origin: "Kerala, India",
    verticalType: "lifestyle",
  },
};

for (const id of VERTICAL_TYPES) {
  check(`a complete ${id} listing scores 100`, configQuality(perfectByVertical[id]).score, 100);
  checkTrue(`a complete ${id} listing is featurable`, configQuality(perfectByVertical[id]).canBeFeatured);
}

// ─── 8. Phase 1: Unified Category Sizing Resolver Tests ─────────────────────

// Compatibility helper: isFreeSizeLiteral
checkTrue('isFreeSizeLiteral("Free") is true', isFreeSizeLiteral("Free"));
checkTrue('isFreeSizeLiteral("FREE") is true', isFreeSizeLiteral("FREE"));
checkTrue('isFreeSizeLiteral("FS") is true', isFreeSizeLiteral("FS"));
checkTrue('isFreeSizeLiteral("Free Size") is true', isFreeSizeLiteral("Free Size"));
check('isFreeSizeLiteral("M") is false', isFreeSizeLiteral("M"), false);
check('isFreeSizeLiteral("32") is false', isFreeSizeLiteral("32"), false);
check('isFreeSizeLiteral(undefined) is false', isFreeSizeLiteral(undefined), false);

// 1. Men's Jeans -> waist_numeric + bottoms + bottom silhouettes
const mensJeans = resolveCategorySizing(
  { slug: "mens-jeans", name: "Jeans", verticalType: "apparel" },
  { slug: "mens-fashion", name: "Men's Fashion" }
);
check("Men's Jeans sizeSystem is waist_numeric", mensJeans.sizeSystem, "waist_numeric");
check("Men's Jeans variant label is Waist Size (Inches)", mensJeans.variant.label, "Waist Size (Inches)");
check("Men's Jeans defaultOptions are 28..42", mensJeans.variant.defaultOptions, SIZING_PRESETS.waist_numeric);
checkTrue("Men's Jeans allows custom sizes", mensJeans.variant.allowCustom);
checkTrue("Men's Jeans shows garment fit widget", mensJeans.fitOptions.showGarmentFitWidget);
check("Men's Jeans first silhouette is straight_fit", mensJeans.fitOptions.silhouettes[0]?.value, "straight_fit");
check("Men's Jeans has 7 bottomwear silhouettes", mensJeans.fitOptions.silhouettes.length, 7);
check("Men's Jeans measurement profile is bottoms", mensJeans.measurementProfile.type, "bottoms");
check("Men's Jeans measurements include waist, inseam, length, hip", mensJeans.measurementProfile.columns.map(c => c.key), ["waist", "inseam", "length", "hip"]);
checkTrue("Men's Jeans requiresMeasurements", mensJeans.variant.requiresMeasurements);

// 2. Men's T-Shirts -> alpha + tops + top silhouettes
const mensTshirts = resolveCategorySizing(
  { slug: "t-shirts", name: "T-Shirts", verticalType: "apparel" },
  { slug: "mens-fashion", name: "Men's Fashion" }
);
check("Men's T-Shirts sizeSystem is alpha", mensTshirts.sizeSystem, "alpha");
check("Men's T-Shirts variant label is Size", mensTshirts.variant.label, "Size");
check("Men's T-Shirts defaultOptions are XS..4XL, Free", mensTshirts.variant.defaultOptions, SIZING_PRESETS.alpha);
checkTrue("Men's T-Shirts allows custom sizes", mensTshirts.variant.allowCustom);
checkTrue("Men's T-Shirts shows garment fit widget", mensTshirts.fitOptions.showGarmentFitWidget);
check("Men's T-Shirts first silhouette is regular_fit", mensTshirts.fitOptions.silhouettes[0]?.value, "regular_fit");
check("Men's T-Shirts has 4 topwear silhouettes", mensTshirts.fitOptions.silhouettes.length, 4);
check("Men's T-Shirts measurement profile is tops", mensTshirts.measurementProfile.type, "tops");
check("Men's T-Shirts measurements include chest, waist, shoulder, length", mensTshirts.measurementProfile.columns.map(c => c.key), ["chest", "waist", "shoulder", "length"]);

// 3. Women's Sarees -> free_size + no garment fit
const womensSarees = resolveCategorySizing(
  { slug: "sarees", name: "Sarees", isFreeSize: true, verticalType: "apparel" },
  { slug: "womens-fashion", name: "Women's Fashion" }
);
check("Women's Sarees sizeSystem is free_size", womensSarees.sizeSystem, "free_size");
check("Women's Sarees defaultOptions is ['Free Size']", womensSarees.variant.defaultOptions, ["Free Size"]);
check("Women's Sarees does not show garment fit widget", womensSarees.fitOptions.showGarmentFitWidget, false);
check("Women's Sarees has 0 silhouettes", womensSarees.fitOptions.silhouettes.length, 0);
check("Women's Sarees measurement profile is free_size", womensSarees.measurementProfile.type, "free_size");

// 4. Accessories Belts -> belt_numeric + no garment fit + no tape measurements
const belts = resolveCategorySizing(
  { slug: "belts", name: "Belts", verticalType: "lifestyle" },
  { slug: "accessories", name: "Accessories" }
);
check("Accessories Belts sizeSystem is belt_numeric", belts.sizeSystem, "belt_numeric");
check("Accessories Belts variant label is Belt Size (Inches)", belts.variant.label, "Belt Size (Inches)");
check("Accessories Belts defaultOptions are 28..42 + Free Size", belts.variant.defaultOptions, SIZING_PRESETS.belt_numeric);
checkTrue("Accessories Belts allows custom sizes", belts.variant.allowCustom);
check("Accessories Belts does not show garment fit widget", belts.fitOptions.showGarmentFitWidget, false);
check("Accessories Belts measurement profile is none", belts.measurementProfile.type, "none");
check("Accessories Belts requiresMeasurements is false", belts.variant.requiresMeasurements, false);

// 4b. Accessories Bedsheet -> bed_linen + Bed Size label + Single..Super King
const bedsheet = resolveCategorySizing(
  { slug: "bedsheet", name: "Bedsheet", verticalType: "lifestyle" },
  { slug: "accessories", name: "Accessories" }
);
check("Accessories Bedsheet sizeSystem is bed_linen", bedsheet.sizeSystem, "bed_linen");
check("Accessories Bedsheet variant label is Bed Size", bedsheet.variant.label, "Bed Size");
check("Accessories Bedsheet defaultOptions is Single..Super King", bedsheet.variant.defaultOptions, SIZING_PRESETS.bed_linen);
check("Accessories Bedsheet does not show garment fit widget", bedsheet.fitOptions.showGarmentFitWidget, false);

// 5. Explicit category.sizeSystem override (Tier 1 precedence)
const overridden = resolveCategorySizing(
  { slug: "mens-jeans", name: "Jeans", sizeSystem: "custom", verticalType: "apparel" }
);
check("Explicit sizeSystem override beats category fallback", overridden.sizeSystem, "custom");

// 6. Immutability: Verify resolveCategorySizing does NOT mutate input objects
const frozenCat = Object.freeze({ slug: "mens-trousers", name: "Trousers", verticalType: "apparel" });
const frozenParent = Object.freeze({ slug: "mens-fashion", name: "Men's Fashion" });
const resolvedFrozen = resolveCategorySizing(frozenCat, frozenParent);
check("Immutable input resolves properly", resolvedFrozen.sizeSystem, "waist_numeric");
check("Category object was not mutated", frozenCat.slug, "mens-trousers");

console.log(`\nVerticals: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
