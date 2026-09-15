/**
 * Centralized Pricing Utility for Hive E-Commerce
 * Standardizes customer selling price and authentic, tag-verified MRP & discount calculations.
 *
 * STRICT LEGAL & COMPLIANCE RULES:
 * - Legal Metrology Act, 2009: MRP is a statutory metric that must match physical product tags.
 * - CCPA 2023 Dark Patterns Guidelines: Zero algorithmic or synthetic MRP price inflation.
 * - Only displays MRP & discount percentage when an authentic, higher physical MRP is in the DB.
 *
 * UNIT CONTRACT — never infer a unit from a number's size:
 * - `calculateDisplayPricing` takes a product exactly as stored in Convex: `price`,
 *   `discountPrice`, `compareAtPrice` / `mrp` are PAISE. ₹99 is 9900; ₹12,500 is 1250000.
 * - `calculateCardPricing` takes card data that has already been converted: `price` and
 *   `compareAtPrice` are RUPEES (the output of mapDbProduct, getCatalogPage cards, wishlist items).
 * Running a converted card back through the paise function divides it by 100 a second time.
 *
 * Mirrors convex/shared/catalog.ts displayPricing so server-side sorting and filtering match the card.
 * Run the tests with: npx tsx apps/customer/src/lib/pricing.test.ts
 */

export interface DisplayPricing {
  price: number;              // The customer selling price (in Rupees)
  compareAtPrice?: number;    // The authentic physical MRP / anchor price (in Rupees, only if valid & higher)
  discountPercent: number;    // E.g. 25 for 25% OFF, 0 if no discount
  hasDiscount: boolean;       // True only if valid higher MRP exists
  formattedPrice: string;     // E.g. "₹1,379"
  formattedMrp?: string;      // E.g. "₹1,899"
}

function paiseToRupees(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value / 100 : undefined;
}

function buildDisplayPricing(
  rawPrice: number,
  rawDiscountPrice: number | undefined,
  rawCompareAtPrice: number | undefined
): DisplayPricing {
  // Determine actual customer selling price
  const hasExplicitSellerDiscount =
    rawDiscountPrice !== undefined &&
    rawDiscountPrice > 0 &&
    rawDiscountPrice < rawPrice;

  const sellingPrice = hasExplicitSellerDiscount ? Math.round(rawDiscountPrice) : Math.round(rawPrice);

  // Sourced directly from seller / physical tag (never fabricated):
  let mrp: number | undefined;
  if (hasExplicitSellerDiscount) {
    mrp = Math.round(rawPrice);
  } else if (rawCompareAtPrice && rawCompareAtPrice > sellingPrice) {
    mrp = Math.round(rawCompareAtPrice);
  }

  const hasDiscount = !!mrp && mrp > sellingPrice;
  const discountPercent = hasDiscount
    ? Math.round(((mrp! - sellingPrice) / mrp!) * 100)
    : 0;

  return {
    price: sellingPrice,
    compareAtPrice: hasDiscount ? mrp : undefined,
    discountPercent,
    hasDiscount,
    formattedPrice: `₹${sellingPrice.toLocaleString("en-IN")}`,
    formattedMrp: hasDiscount && mrp ? `₹${mrp.toLocaleString("en-IN")}` : undefined,
  };
}

const EMPTY_PRICING: DisplayPricing = {
  price: 0,
  discountPercent: 0,
  hasDiscount: false,
  formattedPrice: "₹0",
};

/** Display pricing for a product as stored in Convex (all price fields in paise). */
export function calculateDisplayPricing(p: any): DisplayPricing {
  if (!p) return { ...EMPTY_PRICING };
  return buildDisplayPricing(
    paiseToRupees(p.price) ?? 0,
    paiseToRupees(p.discountPrice),
    paiseToRupees(p.compareAtPrice ?? p.mrp)
  );
}

/** Display pricing for card data that is already in rupees. Never divides. */
export function calculateCardPricing(card: { price?: number; compareAtPrice?: number } | null | undefined): DisplayPricing {
  if (!card) return { ...EMPTY_PRICING };
  const price = typeof card.price === "number" && Number.isFinite(card.price) ? card.price : 0;
  const compareAtPrice =
    typeof card.compareAtPrice === "number" && Number.isFinite(card.compareAtPrice) ? card.compareAtPrice : undefined;
  return buildDisplayPricing(price, undefined, compareAtPrice);
}
