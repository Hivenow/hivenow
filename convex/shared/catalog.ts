// convex/shared/catalog.ts
//
// Catalog card shaping, occasion derivation, and sort ordering.
//
// These three things previously lived only in the customer bundle
// (lib/pricing.ts, lib/catalogSort.ts, and a getProductOccasion copy in both
// ProductsClient.tsx and search/page.tsx). They had to move somewhere both
// sides can import, because the product listing now sorts and filters on the
// server: if the server ordered results by different rules than the client
// used to, page 2 would not continue page 1.
//
// This module is dependency-free so the customer app can import it directly,
// exactly as it already imports convex/shared/boutiqueStatus.

/** The only product fields the product grid actually renders. */
export interface CatalogCard {
  id: string;
  slug: string;
  name: string;
  boutiqueName: string;
  boutiqueId?: string;
  boutiqueSlug?: string;
  imageUrl: string;
  price: number;
  compareAtPrice?: number;
  discountPercent: number;
  rating?: number;
  reviewCount?: number;
  occasion: string;
  isVerifiedBoutique: boolean;
  isNewArrival: boolean;
  isTrending: boolean;
  isBestSeller: boolean;
  sameDayDelivery?: boolean;
  videoAvailable: boolean;
  sizes: string[];
  stockBySize: Record<string, number>;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  estimatedEtaMinutes?: number;
  hiveScore?: number;
  deliveryLabel?: string | null;
  /** Minimal boutique subset ProductCard reads for its delivery badge. */
  boutique?: {
    slug?: string;
    latitude?: number;
    longitude?: number;
    deliveryRadiusKm?: number;
    city?: string;
    verified?: boolean;
    boutiqueName?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing — mirrors apps/customer/src/lib/pricing.ts calculateDisplayPricing.
// Kept equivalent in behaviour so a server-ordered "Price: Low to High" matches
// the price printed on the card.
//
// Input is a product as stored: price fields are PAISE, always. The unit is never
// inferred from a value's size (the old "above 10000 means paise" rule showed any
// product at or below ₹100 at 100× its price). Output is rupees.
// ─────────────────────────────────────────────────────────────────────────────

function paiseToRupees(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  return value / 100;
}

export function displayPricing(p: any): {
  price: number;
  compareAtPrice?: number;
  discountPercent: number;
} {
  if (!p) return { price: 0, discountPercent: 0 };

  const rawPrice = paiseToRupees(p.price || 0) ?? 0;
  const rawDiscountPrice = paiseToRupees(p.discountPrice);
  const rawCompareAtPrice = paiseToRupees(p.compareAtPrice ?? p.mrp);

  const hasExplicitSellerDiscount =
    rawDiscountPrice !== undefined &&
    rawDiscountPrice !== null &&
    rawDiscountPrice > 0 &&
    rawDiscountPrice < rawPrice;

  const sellingPrice = hasExplicitSellerDiscount
    ? Math.round(rawDiscountPrice as number)
    : Math.round(rawPrice);

  let mrp: number | undefined;
  if (hasExplicitSellerDiscount) {
    mrp = Math.round(rawPrice);
  } else if (rawCompareAtPrice && rawCompareAtPrice > sellingPrice) {
    mrp = Math.round(rawCompareAtPrice);
  }

  const hasDiscount = !!mrp && mrp > sellingPrice;
  return {
    price: sellingPrice,
    compareAtPrice: hasDiscount ? mrp : undefined,
    discountPercent: hasDiscount ? Math.round(((mrp! - sellingPrice) / mrp!) * 100) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Occasion — string heuristic over name / description / category name.
// Ported unchanged from ProductsClient.tsx getProductOccasion.
// ─────────────────────────────────────────────────────────────────────────────

export function deriveOccasion(product: any): string {
  if (!product) return "casual";
  const catName = (product.categoryName || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();

  if (name.includes("wedding") || desc.includes("wedding") || name.includes("lehenga") || catName.includes("lehengas")) return "wedding";
  if (name.includes("festival") || desc.includes("festival") || name.includes("saree") || catName.includes("sarees")) return "festival";
  if (name.includes("co-ord") || name.includes("coord") || catName.includes("coords") || catName.includes("co-ord")) return "coords";
  if (name.includes("kurta") || name.includes("kurti") || catName.includes("kurtis")) return "ethnic";
  if (name.includes("party") || desc.includes("party")) return "party";
  if (name.includes("date") || desc.includes("date") || name.includes("dress") || catName.includes("dresses")) return "date";
  if (name.includes("work") || name.includes("office")) return "workwear";
  return "casual";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort — ported from apps/customer/src/lib/catalogSort.ts applySort.
// ─────────────────────────────────────────────────────────────────────────────

export type ProductSortOption = "priceAsc" | "priceDesc" | "trending" | "nearby";

export const DEFAULT_SORT: ProductSortOption = "trending";

const NEW_ARRIVAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewArrival(createdAt: number | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - createdAt < NEW_ARRIVAL_WINDOW_MS;
}

/**
 * Orders catalog cards. Pure, and identical to the ordering the client applied
 * before sorting moved server-side — including the `< 50` branch in "trending",
 * which weights curation differently on a small result set.
 */
export function applyCatalogSort<T extends CatalogCard>(
  products: T[],
  sortOption: ProductSortOption
): T[] {
  const sorted = [...products];

  switch (sortOption) {
    case "priceAsc":
      return sorted.sort((a, b) => a.price - b.price);

    case "priceDesc":
      return sorted.sort((a, b) => b.price - a.price);

    case "nearby":
      return sorted.sort((a, b) => {
        const aDist = a.estimatedDistanceKm ?? 9999;
        const bDist = b.estimatedDistanceKm ?? 9999;
        if (aDist !== bDist) return aDist - bDist;
        return (b.hiveScore ?? 0) - (a.hiveScore ?? 0);
      });

    case "trending":
    default:
      if (products.length < 50) {
        return sorted.sort((a, b) => {
          const aNew = a.isNewArrival ? 1 : 0;
          const bNew = b.isNewArrival ? 1 : 0;
          if (aNew !== bNew) return bNew - aNew;

          const aCurated = (a.isTrending ? 1 : 0) + (a.isBestSeller ? 1 : 0);
          const bCurated = (b.isTrending ? 1 : 0) + (b.isBestSeller ? 1 : 0);
          if (aCurated !== bCurated) return bCurated - aCurated;

          return (a.hiveScore ?? 0) === (b.hiveScore ?? 0)
            ? 0
            : (b.hiveScore ?? 0) - (a.hiveScore ?? 0);
        });
      }
      return sorted.sort((a, b) => {
        const aScore = (a.isTrending ? 3 : 0) + (a.isBestSeller ? 2 : 0) + (a.reviewCount ?? 0) / 100;
        const bScore = (b.isTrending ? 3 : 0) + (b.isBestSeller ? 2 : 0) + (b.reviewCount ?? 0) / 100;
        return bScore - aScore;
      });
  }
}

/**
 * The two filters the PLP used to apply on the client after fetching. They stay
 * post-fetch filters because neither is indexable: `occasion` is derived from
 * free text above, and `isNewArrival` is relative to now.
 */
export function applyCatalogFilters<T extends CatalogCard>(
  products: T[],
  opts: { newArrivals?: boolean; occasions?: string[]; sizes?: string[] }
): T[] {
  let result = products;
  if (opts.newArrivals) {
    result = result.filter((p) => p.isNewArrival);
  }
  if (opts.occasions && opts.occasions.length > 0) {
    result = result.filter((p) => opts.occasions!.includes(p.occasion));
  }
  if (opts.sizes && opts.sizes.length > 0) {
    result = result.filter((p) =>
      p.sizes && p.sizes.some((s) => opts.sizes!.includes(s))
    );
  }
  return result;
}

/**
 * Projects an enriched product row down to the fields the grid renders.
 *
 * Everything omitted here was previously shipped to every shopper for every
 * product in the catalogue: `description`, the full `images` array, admin and
 * moderation flags, timestamps, cost prices, and the entire boutique document.
 */
export function toCatalogCard(p: any): CatalogCard {
  const pricing = displayPricing(p);
  const boutique = p.boutique;

  return {
    id: p._id,
    slug: p.slug,
    name: p.name,
    boutiqueName: p.boutiqueName || boutique?.boutiqueName || "Unknown Boutique",
    boutiqueId: p.boutiqueId,
    boutiqueSlug: boutique?.slug,
    imageUrl: p.imageUrl || p.imageUrls?.[0] || "",
    price: pricing.price,
    compareAtPrice: pricing.compareAtPrice,
    discountPercent: pricing.discountPercent,
    rating: p.rating ?? p.averageRating ?? undefined,
    reviewCount: p.reviewCount ?? undefined,
    occasion: deriveOccasion(p),
    isVerifiedBoutique: boutique?.verified === true,
    isNewArrival: isNewArrival(p.createdAt ?? p._creationTime),
    isTrending: p.featured === true,
    isBestSeller: p.featured === true,
    sameDayDelivery: p.sameDayEligible,
    videoAvailable: Array.isArray(p.images) && p.images.length > 1,
    sizes: p.sizes || ["Free"],
    stockBySize: p.stockBySize || {},
    estimatedDistanceKm: p.estimatedDistanceKm,
    estimatedDurationMin: p.estimatedDurationMin,
    estimatedEtaMinutes: p.estimatedEtaMinutes,
    hiveScore: p.hiveScore,
    deliveryLabel: p.deliveryLabel ?? null,
    boutique: boutique
      ? {
          slug: boutique.slug,
          latitude: boutique.latitude,
          longitude: boutique.longitude,
          deliveryRadiusKm: boutique.deliveryRadiusKm,
          city: boutique.city,
          verified: boutique.verified,
          boutiqueName: boutique.boutiqueName,
        }
      : undefined,
  };
}
