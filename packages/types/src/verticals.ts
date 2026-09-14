// packages/types/src/verticals.ts
// Central vertical registry.
//
// A category carries a `verticalType`; a product snapshots the vertical of its
// category at creation time. The config below is the single description of what
// a vertical means — its variant vocabulary, its allowed specification keys, its
// catalogue-quality rules, and its presentation flags.
//
// This module is DATA ONLY. It holds no evaluator functions and no Convex
// imports, so it can be consumed from the backend, the partner app, the admin
// portal and the storefront alike. Scoring and validation logic lives with the
// consumer (see convex/lib/verticals.ts and convex/products.ts).
//
// Dependency direction: this module imports from ./product; ./product must NOT
// import from here. The barrel (./index) re-exports both.
//
// Return and exchange policy is deliberately absent. That policy already has a
// resolver (convex/lib/returnPolicy.ts) whose output is snapshotted onto orders
// and drives Razorpay Route payout-hold timing, and exchanges are a separate
// seller opt-in. Modelling it here is deferred until that resolver has been
// audited in full.

import { PRODUCT_SPEC_KEYS } from "./product";

// ─── VERTICAL IDENTITY ──────────────────────────────────────────────────────

export const VERTICAL_TYPES = [
  "apparel",
  "fragrance",
  "handbag",
  "footwear",
  "jewellery",
  "lifestyle",
] as const;

export type VerticalType = (typeof VERTICAL_TYPES)[number];

/** The vertical assumed for any record created before verticals existed. */
export const DEFAULT_VERTICAL_TYPE: VerticalType = "apparel";

// ─── SPECIFICATION KEYS ─────────────────────────────────────────────────────

/**
 * Every specification key already live in production.
 *
 * Derived from PRODUCT_SPEC_KEYS rather than restated, so the apparel vertical
 * is a superset of the live set by construction and cannot silently narrow it.
 * A product edited under the apparel vertical can never lose a spec it already
 * has.
 */
export type LegacySpecKey = keyof typeof PRODUCT_SPEC_KEYS;

const APPAREL_SPEC_KEYS = Object.keys(PRODUCT_SPEC_KEYS) as LegacySpecKey[];

export type FragranceSpecKey =
  | "fragranceFamily"
  | "concentration"
  | "topNotes"
  | "heartNotes"
  | "baseNotes"
  | "longevity"
  | "volumeMl"
  | "gender";

export type HandbagSpecKey =
  | "bagType"
  | "dimensions"
  | "compartments"
  | "strapType"
  | "waterResistant";

/**
 * Any key that may appear in `products.details`, across every vertical.
 *
 * Named VerticalSpecKey rather than ProductSpecKey because ./product already
 * exports a ProductSpecKey covering the apparel-era keys alone; that existing
 * type is left exactly as it is.
 *
 * Note that `material` is deliberately absent: it is a top-level column on the
 * products table, not a details key, for every vertical.
 */
export type VerticalSpecKey = LegacySpecKey | FragranceSpecKey | HandbagSpecKey;

const FRAGRANCE_SPEC_LABELS: Record<FragranceSpecKey, string> = {
  fragranceFamily: "Olfactory Family",
  concentration:   "Concentration",
  topNotes:        "Top Notes",
  heartNotes:      "Heart / Middle Notes",
  baseNotes:       "Base Notes",
  longevity:       "Longevity",
  volumeMl:        "Bottle Volume",
  gender:          "Target Profile",
};

const HANDBAG_SPEC_LABELS: Record<HandbagSpecKey, string> = {
  bagType:         "Bag Silhouette",
  dimensions:      "Dimensions (L x W x H)",
  compartments:    "Compartments & Pockets",
  strapType:       "Strap / Handle",
  waterResistant:  "Water Resistance",
};

// ─── QUALITY RULES ──────────────────────────────────────────────────────────

/**
 * Top-level product columns that carry catalogue-quality points.
 * Distinct from spec keys, which live inside `products.details`.
 */
export type QualityColumnField =
  | "material"
  | "care"
  | "origin"
  | "fitRecommendation"
  | "story";

/**
 * One scored field. `source` says where to read it from — a column on the
 * product row, or a key inside `products.details` — so the two namespaces can
 * never be confused by a consumer.
 *
 * `label` is the "what you would gain" prompt; `missingLabel` is the checklist
 * wording. Both are part of the public contract of getProductQualityDetails and
 * are asserted against the legacy strings in convex/tests/verticalsTest.ts.
 */
export type QualityRule =
  | {
      source: "column";
      field: QualityColumnField;
      points: number;
      label: string;
      missingLabel: string;
    }
  | {
      source: "detail";
      field: VerticalSpecKey;
      points: number;
      label: string;
      missingLabel: string;
    };

/**
 * Points awarded by vertical-independent rules (cover image, three photos,
 * description). Those rules stay hardcoded in the scorer; only the remaining
 * VERTICAL_QUALITY_BUDGET points are described per vertical.
 */
export const GLOBAL_QUALITY_BUDGET = 50;

/** Every vertical must distribute exactly this many points across scoredFields. */
export const VERTICAL_QUALITY_BUDGET = 50;

// ─── CONFIG SHAPE ───────────────────────────────────────────────────────────

export interface VerticalVariantConfig {
  /** Customer- and partner-facing name for the variant axis. */
  label: string;
  unit?: string;
  defaultOptions: readonly string[];
  allowCustom: boolean;
  /** Whether the chest/waist/shoulder measurement matrix applies. */
  requiresMeasurements: boolean;
}

export interface VerticalQualityConfig {
  scoredFields: readonly QualityRule[];
}

export interface VerticalPresentationConfig {
  showGarmentFitWidget: boolean;
  showScentPyramid: boolean;
  showBagDimensions: boolean;
  specIconStyle: "tailoring" | "fragrance" | "accessory" | "generic";
}

export interface VerticalPolicyConfig {
  /**
   * Commercial default for returns when no explicit product policy applies.
   * Apparel and Handbags default to true (eligible for 24h return).
   * Fragrance defaults to false (Final Sale).
   */
  defaultReturnsAccepted: boolean;
  /**
   * Commercial default for size/variant exchanges when no explicit setting applies.
   * Fragrance defaults to false (hygiene/tampering protection in transit).
   */
  defaultExchangesAccepted: boolean;
}

export interface VerticalConfig {
  id: VerticalType;
  label: string;
  variant: VerticalVariantConfig;
  specKeys: readonly VerticalSpecKey[];
  specLabels: Readonly<Record<string, string>>;
  quality: VerticalQualityConfig;
  presentation: VerticalPresentationConfig;
  policy: VerticalPolicyConfig;
}

// ─── SHARED FRAGMENTS ───────────────────────────────────────────────────────

const GENERIC_PRESENTATION: VerticalPresentationConfig = {
  showGarmentFitWidget: false,
  showScentPyramid:     false,
  showBagDimensions:    false,
  specIconStyle:        "generic",
};

const GENERIC_POLICY: VerticalPolicyConfig = {
  defaultReturnsAccepted:  true,
  defaultExchangesAccepted: true,
};

/**
 * Verticals Hive has not designed yet. Deliberately neutral: an unnamed
 * "Option" axis, colour as the only specification, and quality points on the
 * three columns that mean something for any physical good. No sizing systems
 * and no policy assumptions are invented here.
 */
const GENERIC_QUALITY: VerticalQualityConfig = {
  scoredFields: [
    { source: "column", field: "material", points: 20, label: "Add material details (+20)", missingLabel: "Add material details" },
    { source: "column", field: "care",     points: 15, label: "Add care instructions (+15)", missingLabel: "Add care instructions" },
    { source: "column", field: "origin",   points: 15, label: "Add origin info (+15)",       missingLabel: "Add origin info" },
  ],
};

const GENERIC_VARIANT: VerticalVariantConfig = {
  label:                "Option",
  defaultOptions:       ["Standard", "Free Size"],
  allowCustom:          true,
  requiresMeasurements: false,
};

// ─── REGISTRY ───────────────────────────────────────────────────────────────

export const VERTICAL_CONFIGS: Readonly<Record<VerticalType, VerticalConfig>> = {
  apparel: {
    id:    "apparel",
    label: "Apparel & Ethnic Wear",
    variant: {
      label:                "Size",
      defaultOptions:       ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"],
      allowCustom:          false,
      requiresMeasurements: true,
    },
    specKeys:   APPAREL_SPEC_KEYS,
    specLabels: PRODUCT_SPEC_KEYS,
    quality: {
      // Reproduces the pre-vertical scoring rules exactly, in their original
      // order, so no existing product's score can move.
      scoredFields: [
        { source: "column", field: "material",          points: 10, label: "Add material details (+10)",                 missingLabel: "Add material details" },
        { source: "column", field: "care",              points: 10, label: "Add care instructions (+10)",                 missingLabel: "Add care instructions" },
        { source: "column", field: "origin",            points: 10, label: "Add origin info (+10)",                       missingLabel: "Add origin info" },
        { source: "column", field: "fitRecommendation", points: 15, label: "Add fit recommendation (+15)",                missingLabel: "Add fit recommendation (Runs Small / True to Size / Runs Large)" },
        { source: "column", field: "story",             points:  5, label: "Add a design story / product narrative (+5)", missingLabel: "Add a design story / product narrative" },
      ],
    },
    presentation: {
      showGarmentFitWidget: true,
      showScentPyramid:     false,
      showBagDimensions:    false,
      specIconStyle:        "tailoring",
    },
    policy: {
      defaultReturnsAccepted:  true,
      defaultExchangesAccepted: true,
    },
  },

  fragrance: {
    id:    "fragrance",
    label: "Fragrance & Perfumes",
    variant: {
      label:                "Volume",
      unit:                 "ml",
      defaultOptions:       ["30ml", "50ml", "100ml", "150ml", "Roll-on (10ml)", "Standard"],
      allowCustom:          true,
      requiresMeasurements: false,
    },
    specKeys: [
      "fragranceFamily",
      "concentration",
      "topNotes",
      "heartNotes",
      "baseNotes",
      "longevity",
      "volumeMl",
      "gender",
    ],
    specLabels: FRAGRANCE_SPEC_LABELS,
    quality: {
      scoredFields: [
        { source: "detail", field: "concentration", points: 15, label: "Add concentration EDP/EDT (+15)", missingLabel: "Add concentration (EDP / EDT)" },
        { source: "detail", field: "topNotes",      points: 10, label: "Add top notes (+10)",             missingLabel: "Add top notes" },
        { source: "detail", field: "heartNotes",    points: 10, label: "Add heart notes (+10)",           missingLabel: "Add heart notes" },
        { source: "detail", field: "baseNotes",     points: 10, label: "Add base notes (+10)",            missingLabel: "Add base notes" },
        { source: "column", field: "origin",        points:  5, label: "Add country of origin (+5)",      missingLabel: "Add country of origin" },
      ],
    },
    presentation: {
      showGarmentFitWidget: false,
      showScentPyramid:     true,
      showBagDimensions:    false,
      specIconStyle:        "fragrance",
    },
    policy: {
      defaultReturnsAccepted:  false,
      defaultExchangesAccepted: false,
    },
  },

  handbag: {
    id:    "handbag",
    label: "Handbags & Bags",
    variant: {
      label:                "Option",
      defaultOptions:       ["One Size", "Mini", "Small", "Medium", "Large"],
      allowCustom:          true,
      requiresMeasurements: false,
    },
    // `closure` and `color` are reused from the live apparel set; `material` is
    // not listed because it is a product column, not a details key.
    specKeys: [
      "bagType",
      "dimensions",
      "compartments",
      "strapType",
      "waterResistant",
      "closure",
      "color",
    ],
    specLabels: {
      ...HANDBAG_SPEC_LABELS,
      closure: PRODUCT_SPEC_KEYS.closure,
      color:   PRODUCT_SPEC_KEYS.color,
    },
    quality: {
      scoredFields: [
        { source: "detail", field: "bagType",      points: 15, label: "Specify bag silhouette (+15)",     missingLabel: "Specify bag silhouette" },
        { source: "column", field: "material",     points: 10, label: "Add material details (+10)",       missingLabel: "Add material details" },
        { source: "detail", field: "dimensions",   points: 15, label: "Add dimensions (+15)",             missingLabel: "Add dimensions (L x W x H)" },
        { source: "detail", field: "compartments", points: 10, label: "Add compartment details (+10)",    missingLabel: "Add compartment details" },
      ],
    },
    presentation: {
      showGarmentFitWidget: false,
      showScentPyramid:     false,
      showBagDimensions:    true,
      specIconStyle:        "accessory",
    },
    policy: {
      defaultReturnsAccepted:  true,
      defaultExchangesAccepted: true,
    },
  },

  footwear: {
    id:         "footwear",
    label:      "Footwear",
    variant:    GENERIC_VARIANT,
    specKeys:   ["color"],
    specLabels: { color: PRODUCT_SPEC_KEYS.color },
    quality:    GENERIC_QUALITY,
    presentation: GENERIC_PRESENTATION,
    policy:     GENERIC_POLICY,
  },

  jewellery: {
    id:         "jewellery",
    label:      "Jewellery",
    variant:    GENERIC_VARIANT,
    specKeys:   ["color"],
    specLabels: { color: PRODUCT_SPEC_KEYS.color },
    quality:    GENERIC_QUALITY,
    presentation: GENERIC_PRESENTATION,
    policy:     GENERIC_POLICY,
  },

  lifestyle: {
    id:         "lifestyle",
    label:      "Lifestyle & Decor",
    variant:    GENERIC_VARIANT,
    specKeys:   ["color"],
    specLabels: { color: PRODUCT_SPEC_KEYS.color },
    quality:    GENERIC_QUALITY,
    presentation: GENERIC_PRESENTATION,
    policy:     GENERIC_POLICY,
  },
};

// ─── RESOLUTION ─────────────────────────────────────────────────────────────

/** True only for a value that is one of the six known verticals. */
export function isVerticalType(value?: string | null): value is VerticalType {
  return (
    typeof value === "string" &&
    (VERTICAL_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Resolve a stored value to a vertical.
 *
 * Reads are defensive: records created before verticals existed carry no
 * verticalType and must behave exactly as they did before, which means apparel.
 * Writes are not defensive — the Convex validator rejects anything that is not
 * one of the six literals.
 */
export function effectiveVerticalType(value?: string | null): VerticalType {
  return isVerticalType(value) ? value : DEFAULT_VERTICAL_TYPE;
}

export function getVerticalConfig(value?: string | null): VerticalConfig {
  return VERTICAL_CONFIGS[effectiveVerticalType(value)];
}

// ─── CATEGORY-AWARE SIZING RESOLUTION ───────────────────────────────────────
//
// A single shared resolver that establishes:
//   1. variant config (size label, units, default options, custom allowed)
//   2. fit options (whether garment fit widget shows, and which silhouettes apply)
//   3. measurement profile (which measurement columns apply: tops, bottoms, etc.)
//
// The three dimensions are strictly decoupled: belts have numeric waist sizes
// but no garment fit widget and no tape measurements; jeans have waist sizes
// with bottoms silhouettes and bottoms tape measurements; kurtis have alpha sizes
// with tops silhouettes and tops tape measurements.
//
// Precedence:
//   explicit category.sizeSystem
//           ↓
//   category-aware fallback (exact slug identity, then keyword heuristics)
//           ↓
//   fallbackVertical default

export type SizeSystemType =
  | "alpha"
  | "waist_numeric"
  | "waist_numeric_women"
  | "footwear_uk_men"
  | "footwear_uk_women"
  | "free_size"
  | "belt_numeric"
  | "kids_age"
  | "bed_linen"
  | "custom";

export interface FitSilhouetteOption {
  value: string;
  label: string;
  description: string;
}

export interface FitOptions {
  showGarmentFitWidget: boolean;
  silhouettes: FitSilhouetteOption[];
}

export interface MeasurementColumn {
  key: string;
  label: string;
  unit: string;
}

export interface MeasurementProfile {
  type: "tops" | "bottoms" | "footwear" | "free_size" | "none";
  columns: MeasurementColumn[];
}

export interface CategorySizingResolution {
  sizeSystem: SizeSystemType;
  variant: VerticalVariantConfig;
  fitOptions: FitOptions;
  measurementProfile: MeasurementProfile;
}

export interface CategorySizingInput {
  sizeSystem?: SizeSystemType | null;
  slug?: string | null;
  name?: string | null;
  isFreeSize?: boolean | null;
  verticalType?: string | null;
  parentId?: string | null;
}

export interface ParentCategorySizingInput {
  slug?: string | null;
  name?: string | null;
}

// ─── SIZING PRESETS ─────────────────────────────────────────────────────────

export const SIZING_PRESETS: Readonly<Record<SizeSystemType, readonly string[]>> = {
  waist_numeric:        ["28", "30", "32", "34", "36", "38", "40", "42"],
  waist_numeric_women:  ["26", "28", "30", "32", "34", "36", "38", "40"],
  footwear_uk_men:      ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"],
  footwear_uk_women:    ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9"],
  belt_numeric:         ["28", "30", "32", "34", "36", "38", "40", "42", "Free Size"],
  free_size:            ["Free Size"],
  alpha:                ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"],
  kids_age:             ["0-6M", "6-12M", "1-2Y", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "7-8Y", "9-10Y"],
  bed_linen:            ["Single", "Double", "Queen", "King", "Super King"],
  custom:               ["Standard", "Free Size"],
};

// ─── FIT SILHOUETTE PRESETS ─────────────────────────────────────────────────

export const TOPS_SILHOUETTES: readonly FitSilhouetteOption[] = [
  { value: "regular_fit", label: "Regular",   description: "Regular Fit — standard drape, classic silhouette" },
  { value: "slim_fit",    label: "Slim",      description: "Slim Fit — tailored outline, cut close to the body" },
  { value: "relaxed_fit", label: "Relaxed",   description: "Relaxed Fit — extra room, comfortable cut" },
  { value: "oversized",   label: "Oversized", description: "Oversized Cut — intentionally loose and baggy" },
];

export const BOTTOMS_SILHOUETTES: readonly FitSilhouetteOption[] = [
  { value: "straight_fit", label: "Straight", description: "Straight Fit — classic straight leg drape from hip to hem" },
  { value: "slim_fit",     label: "Slim",     description: "Slim Fit — fitted through hip and thigh with a narrow leg opening" },
  { value: "skinny_fit",   label: "Skinny",   description: "Skinny Fit — close cut from hip to hem" },
  { value: "tapered_fit",  label: "Tapered",  description: "Tapered Fit — roomy through thigh, narrowing toward the ankle" },
  { value: "relaxed_fit",  label: "Relaxed",  description: "Relaxed Fit — generous cut through seat and thigh" },
  { value: "wide_leg",     label: "Wide Leg", description: "Wide Leg — spacious, relaxed cut with generous leg room" },
  { value: "bootcut",      label: "Bootcut",  description: "Bootcut — fitted through thigh with a subtle flare at the hem" },
];

// ─── MEASUREMENT COLUMN PRESETS ─────────────────────────────────────────────

export const TOPS_MEASUREMENT_COLUMNS: readonly MeasurementColumn[] = [
  { key: "chest",    label: "Chest",          unit: "in" },
  { key: "waist",    label: "Waist",          unit: "in" },
  { key: "shoulder", label: "Shoulder",       unit: "in" },
  { key: "length",   label: "Garment Length", unit: "in" },
];

export const BOTTOMS_MEASUREMENT_COLUMNS: readonly MeasurementColumn[] = [
  { key: "waist",  label: "Waist",          unit: "in" },
  { key: "inseam", label: "Inseam",         unit: "in" },
  { key: "length", label: "Outseam Length", unit: "in" },
  { key: "hip",    label: "Hip",            unit: "in" },
];

export const FOOTWEAR_MEASUREMENT_COLUMNS: readonly MeasurementColumn[] = [
  { key: "insole",     label: "Insole Length",          unit: "cm" },
  { key: "footLength", label: "Recommended Foot Length", unit: "cm" },
];

export const FREE_SIZE_MEASUREMENT_COLUMNS: readonly MeasurementColumn[] = [
  { key: "length", label: "Length", unit: "m" },
  { key: "width",  label: "Width",  unit: "in" },
];

// ─── BACKWARDS COMPATIBILITY HELPERS ───────────────────────────────────────

/**
 * Checks whether a size string represents a "Free Size" / "Free" / "FS" variant.
 * Preserves backward compatibility with existing products containing "Free" or "FS"
 * without forcing data rewrites.
 */
export function isFreeSizeLiteral(s?: string | null): boolean {
  if (!s || typeof s !== "string") return false;
  const lower = s.trim().toLowerCase();
  return lower === "free" || lower === "free size" || lower === "fs" || lower === "standard";
}

// ─── RESOLVER IMPLEMENTATION ────────────────────────────────────────────────

export function resolveCategorySizing(
  category?: CategorySizingInput | null,
  parentCategory?: ParentCategorySizingInput | null,
  fallbackVertical?: string | null
): CategorySizingResolution {
  const catSlug = (category?.slug ?? "").toLowerCase().trim();
  const catName = (category?.name ?? "").toLowerCase().trim();
  const parentSlug = (parentCategory?.slug ?? "").toLowerCase().trim();
  const parentName = (parentCategory?.name ?? "").toLowerCase().trim();
  const effectiveVertical = effectiveVerticalType(category?.verticalType ?? fallbackVertical);

  // ── Step 1: Resolve sizeSystem (Precedence: explicit -> category fallback -> vertical default)
  let sizeSystem: SizeSystemType;

  if (category?.sizeSystem) {
    sizeSystem = category.sizeSystem;
  } else if (category?.isFreeSize === true) {
    sizeSystem = "free_size";
  } else {
    // Category-aware fallback matching audited 37-category production taxonomy:
    // Men's bottomwear
    if (
      catSlug === "mens-jeans" ||
      catSlug === "mens-trousers" ||
      catSlug === "mens-shorts"
    ) {
      sizeSystem = "waist_numeric";
    }
    // Men's topwear
    else if (
      catSlug === "mens-shirts" ||
      catSlug === "mens-polos" ||
      catSlug === "mens-jackets" ||
      catSlug === "mens-sweatshirts" ||
      catSlug === "mens-ethnic-wear" ||
      catSlug === "t-shirts"
    ) {
      sizeSystem = "alpha";
    }
    // Accessories: Belts
    else if (catSlug === "belts" || catName === "belts" || catName === "belt") {
      sizeSystem = "belt_numeric";
    }
    // Free-size accessories & ethnic drapes
    else if (
      catSlug === "sarees" ||
      catSlug === "dupattas" ||
      catSlug === "handbags" ||
      catSlug === "wallets" ||
      catSlug === "watches" ||
      catSlug === "sunglasses" ||
      catSlug === "jewellery" ||
      catSlug === "hair-accessories" ||
      catSlug === "scarves-stoles" ||
      catSlug === "hats-caps"
    ) {
      sizeSystem = "free_size";
    }
    // Home linen & bedsheets
    else if (
      catSlug === "bedsheet" ||
      catSlug === "bedsheets" ||
      catSlug.includes("bedsheet") ||
      catSlug.includes("bed-linen") ||
      catSlug.includes("bedding") ||
      catName.includes("bedsheet") ||
      catName.includes("bed sheet") ||
      catName.includes("bedding") ||
      catName.includes("bed linen")
    ) {
      sizeSystem = "bed_linen";
    }
    // Keyword heuristics for new/unlisted categories
    else if (
      catSlug.includes("jeans") ||
      catSlug.includes("trouser") ||
      catSlug.includes("pants") ||
      catSlug.includes("chinos") ||
      catSlug.includes("shorts") ||
      catName.includes("jeans") ||
      catName.includes("trouser") ||
      catName.includes("pants") ||
      catName.includes("chinos") ||
      catName.includes("shorts")
    ) {
      const isWomen =
        catSlug.includes("women") ||
        catName.includes("women") ||
        parentSlug.includes("women") ||
        parentName.includes("women");
      sizeSystem = isWomen ? "waist_numeric_women" : "waist_numeric";
    } else if (
      catSlug.includes("shoe") ||
      catSlug.includes("footwear") ||
      catSlug.includes("sandals") ||
      catSlug.includes("sneaker") ||
      catSlug.includes("heels") ||
      catSlug.includes("juttis") ||
      catName.includes("shoe") ||
      catName.includes("footwear")
    ) {
      const isWomen =
        catSlug.includes("women") ||
        catName.includes("women") ||
        parentSlug.includes("women") ||
        parentName.includes("women");
      sizeSystem = isWomen ? "footwear_uk_women" : "footwear_uk_men";
    } else if (
      catSlug.includes("saree") ||
      catSlug.includes("dupatta") ||
      catSlug.includes("stole") ||
      catSlug.includes("scarf") ||
      catSlug.includes("shawl") ||
      catName.includes("saree") ||
      catName.includes("dupatta")
    ) {
      sizeSystem = "free_size";
    } else if (
      catSlug.includes("kid") ||
      catSlug.includes("baby") ||
      catName.includes("kid") ||
      catName.includes("baby")
    ) {
      sizeSystem = "kids_age";
    } else {
      // Tier 3: Vertical default
      switch (effectiveVertical) {
        case "footwear":
          sizeSystem = "footwear_uk_men";
          break;
        case "handbag":
        case "jewellery":
        case "lifestyle":
          sizeSystem = "free_size";
          break;
        case "fragrance":
          sizeSystem = "custom";
          break;
        case "apparel":
        default:
          sizeSystem = "alpha";
          break;
      }
    }
  }

  // ── Step 2: Determine Decoupled Category Features
  const isBottoms =
    sizeSystem === "waist_numeric" ||
    sizeSystem === "waist_numeric_women" ||
    catSlug.includes("jeans") ||
    catSlug.includes("trouser") ||
    catSlug.includes("shorts") ||
    catSlug.includes("chinos") ||
    catName.includes("jeans") ||
    catName.includes("trouser");

  const isBelt = sizeSystem === "belt_numeric" || catSlug === "belts" || catName === "belts";
  const isFootwear =
    sizeSystem === "footwear_uk_men" ||
    sizeSystem === "footwear_uk_women" ||
    effectiveVertical === "footwear" ||
    catSlug.includes("shoe") ||
    catSlug.includes("footwear");
  const isFreeSizeCat = sizeSystem === "free_size" || category?.isFreeSize === true;

  // ── Step 3: Resolve Fit Options (Independent from sizeSystem)
  let fitOptions: FitOptions;
  if (isBottoms && !isBelt) {
    fitOptions = {
      showGarmentFitWidget: true,
      silhouettes: [...BOTTOMS_SILHOUETTES],
    };
  } else if (effectiveVertical === "apparel" && !isFreeSizeCat && !isBelt && !isFootwear) {
    fitOptions = {
      showGarmentFitWidget: true,
      silhouettes: [...TOPS_SILHOUETTES],
    };
  } else {
    // Belts, accessories, footwear, free-size drapes have no garment fit widget
    fitOptions = {
      showGarmentFitWidget: false,
      silhouettes: [],
    };
  }

  // ── Step 4: Resolve Measurement Profile (Independent from sizeSystem)
  let measurementProfile: MeasurementProfile;
  if (isBottoms && !isBelt) {
    measurementProfile = {
      type: "bottoms",
      columns: [...BOTTOMS_MEASUREMENT_COLUMNS],
    };
  } else if (effectiveVertical === "apparel" && !isFreeSizeCat && !isBelt && !isFootwear) {
    measurementProfile = {
      type: "tops",
      columns: [...TOPS_MEASUREMENT_COLUMNS],
    };
  } else if (isFootwear) {
    measurementProfile = {
      type: "footwear",
      columns: [...FOOTWEAR_MEASUREMENT_COLUMNS],
    };
  } else if (isFreeSizeCat && (catSlug.includes("saree") || catSlug.includes("kasavu") || catName.includes("saree"))) {
    measurementProfile = {
      type: "free_size",
      columns: [...FREE_SIZE_MEASUREMENT_COLUMNS],
    };
  } else {
    measurementProfile = {
      type: "none",
      columns: [],
    };
  }

  // ── Step 5: Construct VerticalVariantConfig
  let axisLabel = "Size";
  let axisUnit: string | undefined;
  const allowCustom = true; // Sellers can always enter arbitrary sizes (e.g. 26, 44, 31, 33)

  if (sizeSystem === "waist_numeric" || sizeSystem === "waist_numeric_women") {
    axisLabel = "Waist Size (Inches)";
  } else if (sizeSystem === "belt_numeric") {
    axisLabel = "Belt Size (Inches)";
  } else if (sizeSystem === "footwear_uk_men" || sizeSystem === "footwear_uk_women") {
    axisLabel = "Shoe Size (UK)";
    axisUnit = "UK";
  } else if (sizeSystem === "kids_age") {
    axisLabel = "Age / Size";
  } else if (sizeSystem === "bed_linen") {
    axisLabel = "Bed Size";
  } else if (effectiveVertical === "fragrance") {
    axisLabel = "Volume";
    axisUnit = "ml";
  }

  // Special case: Fragrance vertical preserves its dedicated volume options
  const defaultOptions =
    effectiveVertical === "fragrance" && sizeSystem === "custom"
      ? VERTICAL_CONFIGS.fragrance.variant.defaultOptions
      : SIZING_PRESETS[sizeSystem] ?? SIZING_PRESETS.alpha;

  const variant: VerticalVariantConfig = {
    label: axisLabel,
    unit: axisUnit,
    defaultOptions,
    allowCustom,
    requiresMeasurements: measurementProfile.type !== "none",
  };

  return {
    sizeSystem,
    variant,
    fitOptions,
    measurementProfile,
  };
}

