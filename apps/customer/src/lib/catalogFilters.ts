// ─────────────────────────────────────────────────────────────────────────────
// CatalogFilterState — single source of truth for all catalog filters.
// Filtering happens server-side via Convex getActiveProducts query.
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogFilterState {
  /** Array of category DB IDs (from Convex categories table) */
  categories: string[];
  /** Array of size strings (e.g. "XS", "S", "M", "L", "XL", "Free Size") */
  sizes: string[];
  /** Array of occasion IDs (wedding, festival, workwear, casual, party) */
  occasions: string[];
  minPrice: number;
  maxPrice: number;
  newArrivals: boolean;
}

export const DEFAULT_FILTER_STATE: CatalogFilterState = {
  categories: [],
  sizes: [],
  occasions: [],
  minPrice: 0,
  maxPrice: 10000,
  newArrivals: false,
};

export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "Free Size"] as const;

export const PRICE_MIN = 0;
export const PRICE_MAX = 10000;

export interface PricePreset {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
}

export const PRICE_PRESETS: readonly PricePreset[] = [
  { label: "All Prices", shortLabel: "All", min: PRICE_MIN, max: PRICE_MAX },
  { label: "Under ₹1,500", shortLabel: "Under ₹1.5k", min: PRICE_MIN, max: 1500 },
  { label: "₹1,500 – ₹3,000", shortLabel: "₹1.5k–₹3k", min: 1500, max: 3000 },
  { label: "₹3,000 – ₹6,000", shortLabel: "₹3k–₹6k", min: 3000, max: 6000 },
  { label: "Above ₹6,000", shortLabel: "Above ₹6k", min: 6000, max: PRICE_MAX },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — count active filters (for the mobile badge)
// ─────────────────────────────────────────────────────────────────────────────

export function countActiveFilters(filters: CatalogFilterState): number {
  let count = 0;
  count += filters.categories.length;
  count += (filters.sizes || []).length;
  count += filters.occasions.length;
  if (filters.newArrivals) count += 1;
  if (filters.minPrice > PRICE_MIN || filters.maxPrice < PRICE_MAX) count += 1;
  return count;
}
