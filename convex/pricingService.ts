// convex/pricingService.ts
// Hive Pricing Engine v3 — Dynamic Tier Commission Slabs & Tier Platform Charges
// Single authoritative pricing calculation. All other code consumes this output.

import { MutationCtx, QueryCtx } from "./_generated/server";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommissionSlab {
  minPrice: number;                    // in Rupees (e.g. 0, 500, 1000)
  maxPrice: number | null;             // in Rupees (e.g. 499, 999, null for open-ended)
  commissionPercent: number;           // in Percent (e.g. 2, 3, 4, 5)
}

export interface TierPricingConfig {
  key: string;                         // "bronze", "silver", "gold"
  name: string;                        // "Bronze", "Silver", "Gold"
  commissionSlabs: CommissionSlab[];
  commissionGstPercent: number;        // e.g. 18 (%)
  handlingChargePaise: number;         // e.g. 2900 = ₹29
  platformFeePaise: number;            // e.g. 2000 = ₹20
  platformGstPercent: number;          // e.g. 18 (%)
}

export interface PlatformConfig {
  tiers: TierPricingConfig[];
  // Legacy / fallback fields
  handlingChargePaise?: number;
  platformFeePaise?: number;
  gstRatePercent?: number;
  commissionTiers?: Array<{ key: string; name: string; sellerCommissionPercent: number }>;
}

export interface SellerItemPricing {
  sellerBasePricePaise: number;
  tierKey: string;
  tierName: string;
  slabMinPrice: number;
  slabMaxPrice: number | null;
  sellerCommissionPercent: number;
  sellerCommissionPaise: number;
  sellerCommissionGstPaise: number;
  sellerPayoutPaise: number;
}

export interface CheckoutPricing {
  // Product-level
  productSubtotalPaise: number;       // sum of seller base prices × quantities
  // Platform charges (charged to customer)
  handlingChargePaise: number;
  platformFeePaise: number;
  platformChargesGstPaise: number;    // GST on (handling + platform fee)
  // Delivery
  deliveryFeePaise: number;
  // Discount
  discountPaise: number;
  /** Part of discountPaise taken out of the seller's payout (seller-created coupon). */
  sellerFundedDiscountPaise: number;
  /** Part of discountPaise Hive pays for. discountPaise = seller + platform funded. */
  platformFundedDiscountPaise: number;
  // Total
  totalPayablePaise: number;
  // Seller settlement
  sellerTierKey: string;
  sellerTierName: string;
  slabMinPrice?: number;
  slabMaxPrice?: number | null;
  sellerCommissionPercent: number;
  sellerCommissionPaise: number;      // commission on product subtotal
  sellerCommissionGstPaise: number;   // GST on commission (deducted from seller)
  sellerPayoutPaise: number;          // product subtotal - commission - commission GST
  // Config snapshot
  gstRatePercent: number;
  handlingChargeConfigPaise: number;
  platformFeeConfigPaise: number;
  gstRateConfigPercent: number;
  sellerCommissionConfigPercent: number;
}

// ─── Legacy types (backward compat for old orders) ───────────────────────────

/** @deprecated Use PlatformConfig instead */
export interface PlatformSettings {
  markupRate: number;
  platformFeeRate: number;
  markupType?: "flat" | "tiered";
  markupTiers?: Array<{ min_price: number; max_price: number | null; rate: number }>;
  tier1?: { name: string; slabs: Array<{ min_price: number; max_price: number | null; rate: number }> };
  tier2?: { name: string; slabs: Array<{ min_price: number; max_price: number | null; rate: number }> };
  tier3?: { name: string; slabs: Array<{ min_price: number; max_price: number | null; rate: number }> };
}

/** @deprecated Use SellerItemPricing instead */
export interface ItemFinancialSnapshot {
  priceAtPurchase: number;
  basePriceAtPurchase: number;
  platformMarkupRateAtPurchase: number;
  platformFeeRateAtPurchase: number;
  fixedPlatformFeeAtPurchase: number;
  platformMarkupAmount: number;
  platformFeeAmount: number;
  gstAmountAtPurchase: number;
  subtotal: number;
}

/** @deprecated */
export interface StoreSettlement {
  merchantPayablePaise: number;
  merchantPayableRupees: number;
  totalBasePricePaise: number;
  totalPlatformFeePaise: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_TIERS_CONFIG: TierPricingConfig[] = [
  {
    key: "bronze",
    name: "Bronze",
    commissionSlabs: [
      { minPrice: 0, maxPrice: 499, commissionPercent: 2 },
      { minPrice: 500, maxPrice: 999, commissionPercent: 3 },
      { minPrice: 1000, maxPrice: 1499, commissionPercent: 4 },
      { minPrice: 1500, maxPrice: null, commissionPercent: 5 },
    ],
    commissionGstPercent: 18,
    handlingChargePaise: 2900,
    platformFeePaise: 2200,
    platformGstPercent: 18,
  },
  {
    key: "silver",
    name: "Silver",
    commissionSlabs: [
      { minPrice: 0, maxPrice: 499, commissionPercent: 2.5 },
      { minPrice: 500, maxPrice: 999, commissionPercent: 3 },
      { minPrice: 1000, maxPrice: null, commissionPercent: 4.5 },
    ],
    commissionGstPercent: 18,
    handlingChargePaise: 2500,
    platformFeePaise: 1300,
    platformGstPercent: 18,
  },
  {
    key: "gold",
    name: "Gold",
    commissionSlabs: [
      { minPrice: 0, maxPrice: 499, commissionPercent: 3 },
      { minPrice: 500, maxPrice: 999, commissionPercent: 6 },
      { minPrice: 1000, maxPrice: null, commissionPercent: 6 },
    ],
    commissionGstPercent: 18,
    handlingChargePaise: 1000,
    platformFeePaise: 600,
    platformGstPercent: 18,
  },
];

export const DEFAULT_COMMISSION_TIERS = [
  { key: "bronze", name: "Bronze", sellerCommissionPercent: 2 },
  { key: "silver", name: "Silver", sellerCommissionPercent: 3 },
  { key: "gold",   name: "Gold",   sellerCommissionPercent: 5 },
];

export const DEFAULT_HANDLING_CHARGE_PAISE = 2900;  // ₹29
export const DEFAULT_PLATFORM_FEE_PAISE = 2000;     // ₹20
export const DEFAULT_GST_RATE_PERCENT = 18;

/** @deprecated Legacy defaults — kept for backward compat */
export const FIXED_PLATFORM_FEE_PAISE = 700;
export const FIXED_PLATFORM_FEE_RUPEES = 7;
export const DEFAULT_TIER_SLABS = [
  { min_price: 0, max_price: 499, rate: 8 },
  { min_price: 500, max_price: 999, rate: 8 },
  { min_price: 1000, max_price: 1499, rate: 8 },
  { min_price: 1500, max_price: 2499, rate: 8 },
  { min_price: 2500, max_price: 4999, rate: 8 },
  { min_price: 5000, max_price: null, rate: 5 },
];

// ─── Slab Validation ─────────────────────────────────────────────────────────

/**
 * Validates that commission slabs are contiguous, non-overlapping, start at 0,
 * and have exactly one open-ended final slab (maxPrice === null).
 */
export function validateTierSlabs(slabs: CommissionSlab[]): { valid: boolean; error?: string } {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return { valid: false, error: "At least one commission slab is required." };
  }

  // Sort slabs by minPrice
  const sorted = [...slabs].sort((a, b) => a.minPrice - b.minPrice);

  if (sorted[0]!.minPrice !== 0) {
    return { valid: false, error: "First slab must start at ₹0." };
  }

  for (let i = 0; i < sorted.length; i++) {
    const slab = sorted[i]!;

    if (slab.commissionPercent < 0 || slab.commissionPercent > 100 || isNaN(slab.commissionPercent)) {
      return { valid: false, error: `Invalid commission percent (${slab.commissionPercent}%) at slab ₹${slab.minPrice}.` };
    }

    const isLast = i === sorted.length - 1;

    if (!isLast) {
      if (slab.maxPrice === null || slab.maxPrice === undefined) {
        return { valid: false, error: `Only the final slab can be open-ended (maxPrice: null). Slab at ₹${slab.minPrice} must have an upper limit.` };
      }
      if (slab.maxPrice < slab.minPrice) {
        return { valid: false, error: `Max price (₹${slab.maxPrice}) cannot be less than min price (₹${slab.minPrice}).` };
      }
      const nextSlab = sorted[i + 1]!;
      if (nextSlab.minPrice !== slab.maxPrice + 1) {
        if (nextSlab.minPrice <= slab.maxPrice) {
          return { valid: false, error: `Overlap detected between slabs: ₹${slab.minPrice}–₹${slab.maxPrice} and ₹${nextSlab.minPrice}.` };
        } else {
          return { valid: false, error: `Gap detected between slabs: ₹${slab.minPrice}–₹${slab.maxPrice} and ₹${nextSlab.minPrice}. Next slab must start at ₹${slab.maxPrice + 1}.` };
        }
      }
    } else {
      if (slab.maxPrice !== null && slab.maxPrice !== undefined) {
        return { valid: false, error: `Final slab (starting at ₹${slab.minPrice}) must be open-ended (max price: +).` };
      }
    }
  }

  return { valid: true };
}

// ─── Config Fetching ─────────────────────────────────────────────────────────

/**
 * Fetch the current platform config from the database.
 * Returns v3 dynamic tier config if available, otherwise constructs safe defaults.
 */
export async function getPlatformConfig(ctx: QueryCtx | MutationCtx): Promise<PlatformConfig> {
  const settings = (await ctx.db.query("platformSettings").first()) as any;
  const tiers: TierPricingConfig[] = settings?.tiers && Array.isArray(settings.tiers) && settings.tiers.length > 0
    ? settings.tiers
    : DEFAULT_TIERS_CONFIG;

  return {
    tiers,
    handlingChargePaise: settings?.handlingChargePaise ?? DEFAULT_HANDLING_CHARGE_PAISE,
    platformFeePaise: settings?.platformFeePaise ?? DEFAULT_PLATFORM_FEE_PAISE,
    gstRatePercent: settings?.gstRatePercent ?? DEFAULT_GST_RATE_PERCENT,
    commissionTiers: settings?.commissionTiers ?? DEFAULT_COMMISSION_TIERS,
  };
}

/**
 * @deprecated Use getPlatformConfig instead. Kept for backward compat during migration.
 */
export async function getPlatformSettings(ctx: QueryCtx | MutationCtx): Promise<PlatformSettings> {
  const settings = (await ctx.db.query("platformSettings").first()) as any;
  if (!settings) {
    return {
      markupRate: 0.15,
      platformFeeRate: 0.02,
      markupType: "tiered",
      markupTiers: DEFAULT_TIER_SLABS,
    };
  }
  return {
    markupRate: settings.markupRate ?? 0.15,
    platformFeeRate: settings.platformFeeRate ?? 0.02,
    markupType: settings.markupType ?? "tiered",
    markupTiers: settings.markupTiers ?? DEFAULT_TIER_SLABS,
    tier1: settings.tier1,
    tier2: settings.tier2,
    tier3: settings.tier3,
  };
}

// ─── Tier & Slab Resolution ──────────────────────────────────────────────────

/**
 * Find the full tier configuration for a given tier key.
 * Supports both new keys (bronze/silver/gold) and legacy keys (tier1/tier2/tier3).
 */
export function resolveTierConfig(
  tierKey: string | undefined,
  config: PlatformConfig
): TierPricingConfig {
  // Map legacy tier keys to new tier keys
  const LEGACY_TIER_MAP: Record<string, string> = {
    tier1: "bronze",
    tier2: "silver",
    tier3: "gold",
  };
  const rawKey = (tierKey || "bronze").toLowerCase();
  const normalizedKey = LEGACY_TIER_MAP[rawKey] || rawKey;
  const tiers = config.tiers && config.tiers.length > 0 ? config.tiers : DEFAULT_TIERS_CONFIG;
  const match = tiers.find(t => t.key.toLowerCase() === normalizedKey);
  if (match) return match;
  return tiers[0] || DEFAULT_TIERS_CONFIG[0]!;
}

/**
 * @deprecated Use resolveTierConfig instead. Kept for backward compat.
 */
export function resolveCommissionTier(
  tierKey: string,
  config: PlatformConfig
): { key: string; name: string; sellerCommissionPercent: number } {
  const tier = resolveTierConfig(tierKey, config);
  const defaultPercent = tier.commissionSlabs?.[0]?.commissionPercent ?? 2;
  return {
    key: tier.key,
    name: tier.name,
    sellerCommissionPercent: defaultPercent,
  };
}

/**
 * Find the applicable commission slab for a product base price in Rupees.
 */
export function findApplicableCommissionSlab(
  basePriceRupees: number,
  tierConfig: TierPricingConfig
): CommissionSlab {
  const roundedRupees = Math.max(0, Math.round(basePriceRupees));
  const slabs = tierConfig.commissionSlabs || [];
  const match = slabs.find(slab => {
    const minMatch = roundedRupees >= slab.minPrice;
    const maxMatch = slab.maxPrice === null || slab.maxPrice === undefined || roundedRupees <= slab.maxPrice;
    return minMatch && maxMatch;
  });

  return match || slabs[slabs.length - 1] || { minPrice: 0, maxPrice: null, commissionPercent: 2 };
}

// ─── Item-Level Seller Pricing ───────────────────────────────────────────────

/**
 * Calculate seller economics for a single product item.
 * Sourced directly from the seller's base price and tier slab.
 * 
 * @param sellerBasePricePaise - The seller's listed base price in paise
 * @param tierKey - The seller's pricing tier key (e.g. "bronze")
 * @param config - Platform config
 */
export function calculateSellerItemPricing(
  sellerBasePricePaise: number,
  tierKey: string | undefined,
  config: PlatformConfig
): SellerItemPricing {
  const tier = resolveTierConfig(tierKey, config);
  const basePriceRupees = sellerBasePricePaise / 100;
  const slab = findApplicableCommissionSlab(basePriceRupees, tier);
  const commissionPercent = slab.commissionPercent;
  const gstRate = tier.commissionGstPercent ?? 18;

  // Commission = basePrice × slab commission %
  const commissionPaise = Math.round((sellerBasePricePaise * commissionPercent) / 100);
  // GST on commission (deducted from seller payout)
  const commissionGstPaise = Math.round((commissionPaise * gstRate) / 100);
  // Seller payout = base - commission - commission GST
  const payoutPaise = Math.max(0, sellerBasePricePaise - commissionPaise - commissionGstPaise);

  return {
    sellerBasePricePaise,
    tierKey: tier.key,
    tierName: tier.name,
    slabMinPrice: slab.minPrice,
    slabMaxPrice: slab.maxPrice,
    sellerCommissionPercent: commissionPercent,
    sellerCommissionPaise: commissionPaise,
    sellerCommissionGstPaise: commissionGstPaise,
    sellerPayoutPaise: payoutPaise,
  };
}

// ─── Tier Platform Charges ───────────────────────────────────────────────────

/**
 * Calculate customer-side platform charges for a specific tier.
 */
export function calculateTierPlatformCharges(
  tierKey: string | undefined,
  config: PlatformConfig
) {
  const tier = resolveTierConfig(tierKey, config);
  const handlingChargePaise = tier.handlingChargePaise ?? DEFAULT_HANDLING_CHARGE_PAISE;
  const platformFeePaise = tier.platformFeePaise ?? DEFAULT_PLATFORM_FEE_PAISE;
  const platformGstPercent = tier.platformGstPercent ?? DEFAULT_GST_RATE_PERCENT;
  const platformChargesGstPaise = Math.round(((handlingChargePaise + platformFeePaise) * platformGstPercent) / 100);
  const totalPlatformFeesPaise = handlingChargePaise + platformFeePaise + platformChargesGstPaise;

  return {
    handlingChargePaise,
    platformFeePaise,
    platformGstPercent,
    platformChargesGstPaise,
    totalPlatformFeesPaise,
  };
}

// ─── Upfront Storefront Pricing ──────────────────────────────────────────────

/**
 * Calculates the all-inclusive customer price in PAISE from the seller's base price in PAISE.
 * Adds tier-specific handling charge, platform fee, and GST.
 */
export function calculateAllInclusivePricePaise(
  basePricePaise: number,
  tierKey: string | undefined,
  config: PlatformConfig
): number {
  if (!basePricePaise || basePricePaise <= 0) return 0;
  const charges = calculateTierPlatformCharges(tierKey, config);
  return basePricePaise + charges.totalPlatformFeesPaise;
}

/**
 * Calculates the all-inclusive customer price in RUPEES from the seller's base price in RUPEES.
 */
export function calculateAllInclusivePrice(
  basePriceRupees: number,
  tierKey: string | undefined,
  config: PlatformConfig
): number {
  if (!basePriceRupees || basePriceRupees <= 0) return 0;
  const paise = Math.round(basePriceRupees * 100);
  return calculateAllInclusivePricePaise(paise, tierKey, config) / 100;
}

// ─── Checkout-Level Pricing ──────────────────────────────────────────────────

/**
 * Calculate the complete checkout pricing for a single-seller order.
 * This is the ONE authoritative pricing calculation.
 * 
 * @param items - Array of { sellerBasePricePaise, quantity }
 * @param deliveryFeePaise - Dynamic Porter delivery fee
 * @param discountPaise - Coupon/promo discount amount
 * @param sellerTierKey - The seller's pricing tier key
 * @param config - Platform config
 * @param sellerFundedDiscountPaise - How much of discountPaise the seller pays
 *   for (a coupon the seller created). It is spread across items by their
 *   all-inclusive line totals and lowers each item's base price before
 *   commission, so Hive's commission is charged on the price after discount.
 *   Whatever the seller does not absorb (rounding, or a discount larger than
 *   the base price) is paid by Hive.
 */
export function calculateCheckoutPricing(
  items: Array<{ sellerBasePricePaise: number; quantity: number }>,
  deliveryFeePaise: number,
  discountPaise: number,
  sellerTierKey: string | undefined,
  config: PlatformConfig,
  sellerFundedDiscountPaise: number = 0
): CheckoutPricing {
  const tier = resolveTierConfig(sellerTierKey, config);
  const charges = calculateTierPlatformCharges(sellerTierKey, config);

  // All-inclusive product subtotal (sum of all-inclusive item prices × quantities)
  const productSubtotalPaise = items.reduce(
    (sum, item) => sum + calculateAllInclusivePricePaise(item.sellerBasePricePaise, sellerTierKey, config) * item.quantity, 0
  );

  // Compute seller commission and payouts using item economics
  let totalSellerCommissionPaise = 0;
  let totalSellerCommissionGstPaise = 0;
  let totalSellerPayoutPaise = 0;
  let primarySlabMinPrice: number | undefined = undefined;
  let primarySlabMaxPrice: number | null | undefined = undefined;
  let primaryCommissionPercent = 0;

  const sellerFundedTarget = Math.max(0, Math.min(Math.round(sellerFundedDiscountPaise), discountPaise));
  const lineTotals = items.map(
    (item) => calculateAllInclusivePricePaise(item.sellerBasePricePaise, sellerTierKey, config) * item.quantity
  );
  let unallocated = sellerFundedTarget;
  let sellerAbsorbedPaise = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    // Share of the seller-funded discount for this line; the last line takes the remainder.
    const lineShare = i === items.length - 1 || productSubtotalPaise === 0
      ? unallocated
      : Math.floor((sellerFundedTarget * lineTotals[i]!) / productSubtotalPaise);
    unallocated -= lineShare;
    // Floor so the seller is never charged more than their share.
    const unitDiscount = item.quantity > 0 ? Math.floor(lineShare / item.quantity) : 0;
    const effectiveBasePaise = Math.max(0, item.sellerBasePricePaise - unitDiscount);
    sellerAbsorbedPaise += (item.sellerBasePricePaise - effectiveBasePaise) * item.quantity;

    const itemPricing = calculateSellerItemPricing(effectiveBasePaise, sellerTierKey, config);
    totalSellerCommissionPaise += itemPricing.sellerCommissionPaise * item.quantity;
    totalSellerCommissionGstPaise += itemPricing.sellerCommissionGstPaise * item.quantity;
    totalSellerPayoutPaise += itemPricing.sellerPayoutPaise * item.quantity;
    if (primarySlabMinPrice === undefined) {
      primarySlabMinPrice = itemPricing.slabMinPrice;
      primarySlabMaxPrice = itemPricing.slabMaxPrice;
      primaryCommissionPercent = itemPricing.sellerCommissionPercent;
    }
  }

  // Customer payable: Product Subtotal (all-inclusive) + Delivery Fee - Discount
  const totalPayablePaise = Math.max(
    0,
    productSubtotalPaise + deliveryFeePaise - discountPaise
  );

  return {
    productSubtotalPaise,
    handlingChargePaise: charges.handlingChargePaise,
    platformFeePaise: charges.platformFeePaise,
    platformChargesGstPaise: charges.platformChargesGstPaise,
    deliveryFeePaise,
    discountPaise,
    sellerFundedDiscountPaise: Math.min(sellerAbsorbedPaise, discountPaise),
    platformFundedDiscountPaise: discountPaise - Math.min(sellerAbsorbedPaise, discountPaise),
    totalPayablePaise,
    sellerTierKey: tier.key,
    sellerTierName: tier.name,
    slabMinPrice: primarySlabMinPrice,
    slabMaxPrice: primarySlabMaxPrice,
    sellerCommissionPercent: primaryCommissionPercent,
    sellerCommissionPaise: totalSellerCommissionPaise,
    sellerCommissionGstPaise: totalSellerCommissionGstPaise,
    sellerPayoutPaise: totalSellerPayoutPaise,
    gstRatePercent: tier.commissionGstPercent,
    handlingChargeConfigPaise: tier.handlingChargePaise,
    platformFeeConfigPaise: tier.platformFeePaise,
    gstRateConfigPercent: tier.platformGstPercent,
    sellerCommissionConfigPercent: primaryCommissionPercent,
  };
}



// ─── Legacy Functions (backward compat) ──────────────────────────────────────

/** @deprecated Use resolveCommissionTier instead */
export function selectMarkupRate(basePriceRupees: number, settings: PlatformSettings, pricingTier?: string): number {
  const markupType = settings.markupType ?? "tiered";
  const tierKey = pricingTier || "tier1";
  const tierConfig = (settings as any)[tierKey] as { name: string; slabs: Array<{ min_price: number; max_price: number | null; rate: number }> } | undefined;
  const hasTierSpecificSlabs = tierConfig && Array.isArray(tierConfig.slabs) && tierConfig.slabs.length > 0;
  let tiers: Array<{ min_price: number; max_price: number | null; rate: number }> | undefined;
  if (hasTierSpecificSlabs) {
    tiers = tierConfig!.slabs;
  } else if (markupType === "tiered") {
    tiers = settings.markupTiers ?? DEFAULT_TIER_SLABS;
  }
  if (tiers && Array.isArray(tiers) && tiers.length > 0) {
    const tier = tiers.find((t) => {
      const minMatch = basePriceRupees >= t.min_price;
      const maxMatch = t.max_price === null || t.max_price === undefined || basePriceRupees <= t.max_price;
      return minMatch && maxMatch;
    });
    if (tier) return tier.rate / 100;
  }
  return settings.markupRate ?? 0.15;
}

export const getPlatformMarkupRate = selectMarkupRate;

/** @deprecated Product price = seller base price in v2. No markup calculation needed. */
export function calculateProductPricing(
  basePriceRupees: number,
  baseDiscountPriceRupees: number | undefined | null,
  settings: PlatformSettings,
  pricingTier?: string
) {
  // v2: Product price = base price (no markup). Return identity.
  const customerPrice = basePriceRupees;
  const customerDiscountPrice = baseDiscountPriceRupees && baseDiscountPriceRupees > 0
    ? baseDiscountPriceRupees
    : undefined;

  const discountPercent = customerDiscountPrice
    ? Math.max(0, Math.round(((customerPrice - customerDiscountPrice) / customerPrice) * 100))
    : 0;

  return {
    basePrice: basePriceRupees,
    customerPrice,
    baseDiscountPrice: baseDiscountPriceRupees ?? undefined,
    customerDiscountPrice,
    markupRate: 0,
    discountMarkupRate: 0,
    discountPercent,
    markupAmount: 0,
    platformFeeAmount: 0,
    sellerProcessingFee: 0,
    gstAmount: 0,
    discountGstAmount: 0,
  };
}

/** @deprecated Use calculateCheckoutPricing instead */
export async function calculateItemFinancials(
  ctx: MutationCtx | QueryCtx,
  productRow: any,
  clientPricePaise: number,
  quantity: number
): Promise<ItemFinancialSnapshot> {
  // In v2, product price = base price. Validate that client price matches DB.
  const canonicalPricePaise = productRow.discountPrice ?? productRow.price;

  if (Math.abs(canonicalPricePaise - clientPricePaise) > 100) {
    const { ConvexError } = await import("convex/values");
    throw new ConvexError({
      code: "STALE_CART_PRICE",
      message: "The prices of some items in your cart have been updated. Please review your new total before checking out.",
    });
  }

  // For v2, base price = price (no markup)
  const basePricePaise = productRow.basePrice ?? canonicalPricePaise;

  return {
    priceAtPurchase: canonicalPricePaise,
    basePriceAtPurchase: basePricePaise,
    platformMarkupRateAtPurchase: 0,
    platformFeeRateAtPurchase: 0,
    fixedPlatformFeeAtPurchase: 0,
    platformMarkupAmount: 0,
    platformFeeAmount: 0,
    gstAmountAtPurchase: 0,
    subtotal: canonicalPricePaise * quantity,
  };
}

/** @deprecated Use calculateCheckoutPricing().sellerPayoutPaise instead */
export function calculateBoutiquePayout(orderItem: {
  // v2 fields
  sellerBasePricePaise?: number;
  sellerCommissionPaise?: number;
  sellerCommissionGstPaise?: number;
  sellerPayoutPaise?: number;
  // v1 fields
  basePriceAtPurchase?: number;
  platformFeeAmount?: number;
  priceAtPurchase?: number;
  price?: number;
}): number {
  // v2: use explicit seller payout
  if (orderItem.sellerPayoutPaise !== undefined) {
    return orderItem.sellerPayoutPaise;
  }
  // v1: legacy calculation
  if (orderItem.basePriceAtPurchase !== undefined && orderItem.platformFeeAmount !== undefined) {
    return orderItem.basePriceAtPurchase - orderItem.platformFeeAmount;
  }
  const price = orderItem.priceAtPurchase ?? orderItem.price ?? 0;
  return Math.floor(price * 0.82);
}

/** @deprecated Use calculateCheckoutPricing() instead */
export function calculateStoreSettlement(
  items: Array<{
    sellerPayoutPaise?: number;
    basePriceAtPurchase?: number;
    platformFeeAmount?: number;
    priceAtPurchase?: number;
    price?: number;
    quantity: number;
  }>
): StoreSettlement {
  let merchantPayablePaise = 0;
  let totalBasePricePaise = 0;
  let totalPlatformFeePaise = 0;

  for (const item of items) {
    const itemPayoutPaise = calculateBoutiquePayout(item);
    merchantPayablePaise += itemPayoutPaise * item.quantity;
    const priceAtPurchase = item.priceAtPurchase ?? item.price ?? 0;

    if (item.basePriceAtPurchase !== undefined && item.platformFeeAmount !== undefined) {
      totalBasePricePaise += item.basePriceAtPurchase * item.quantity;
      totalPlatformFeePaise += item.platformFeeAmount * item.quantity;
    } else {
      totalBasePricePaise += priceAtPurchase * item.quantity;
    }
  }

  const roundedMerchantPayablePaise = Math.round(merchantPayablePaise);

  return {
    merchantPayablePaise: roundedMerchantPayablePaise,
    merchantPayableRupees: roundedMerchantPayablePaise / 100,
    totalBasePricePaise: Math.round(totalBasePricePaise),
    totalPlatformFeePaise: Math.round(totalPlatformFeePaise),
  };
}

/** @deprecated */
export function calculateOrderTotals(
  itemsFinancials: Array<{ priceAtPurchase: number; quantity: number }>,
  deliveryFeePaise: number,
  discountPaise: number
) {
  const subtotalPaise = Math.round(
    itemsFinancials.reduce((sum, item) => sum + item.priceAtPurchase * item.quantity, 0)
  );
  const totalPaise = Math.max(0, subtotalPaise - Math.round(discountPaise) + Math.round(deliveryFeePaise));

  return {
    subtotalPaise,
    subtotalRupees: subtotalPaise / 100,
    deliveryFeePaise: Math.round(deliveryFeePaise),
    deliveryFeeRupees: Math.round(deliveryFeePaise) / 100,
    discountPaise: Math.round(discountPaise),
    discountRupees: Math.round(discountPaise) / 100,
    totalPaise,
    totalRupees: totalPaise / 100,
  };
}

/** @deprecated */
export function calculateInvoiceFinancials(
  items: Array<{
    productId: string;
    productName: string;
    productImage?: string;
    size: string;
    quantity: number;
    priceAtPurchase: number;
  }>,
  deliveryFeePaise: number,
  discountPaise: number
) {
  const invoiceItems = items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage,
    size: item.size,
    quantity: item.quantity,
    unitPricePaise: Math.round(item.priceAtPurchase),
    unitPriceRupees: Math.round(item.priceAtPurchase) / 100,
    totalPricePaise: Math.round(item.priceAtPurchase * item.quantity),
    totalPriceRupees: Math.round(item.priceAtPurchase * item.quantity) / 100,
  }));

  const subtotalPaise = invoiceItems.reduce((sum, item) => sum + item.totalPricePaise, 0);
  const totalAmountPaise = Math.max(0, subtotalPaise - Math.round(discountPaise) + Math.round(deliveryFeePaise));

  return {
    items: invoiceItems,
    subtotalPaise,
    subtotalRupees: subtotalPaise / 100,
    deliveryFeePaise: Math.round(deliveryFeePaise),
    deliveryFeeRupees: Math.round(deliveryFeePaise) / 100,
    discountPaise: Math.round(discountPaise),
    discountRupees: Math.round(discountPaise) / 100,
    taxPaise: 0,
    taxRupees: 0,
    totalAmountPaise,
    totalAmountRupees: totalAmountPaise / 100,
  };
}

/** @deprecated Use pricingSnapshot on order instead */
export function calculateBoutiqueEarnings(
  items: Array<{
    sellerPayoutPaise?: number;
    basePriceAtPurchase?: number;
    platformMarkupAmount?: number;
    platformFeeAmount?: number;
    fixedPlatformFeeAtPurchase?: number;
    priceAtPurchase: number;
    quantity: number;
  }>
) {
  let totalPlatformMarkupPaise = 0;
  let totalPlatformFeePaise = 0;
  let totalFixedPlatformFeePaise = 0;
  let totalBoutiquePayoutPaise = 0;

  for (const item of items) {
    const qty = item.quantity;
    if (item.platformMarkupAmount !== undefined && item.platformFeeAmount !== undefined) {
      totalPlatformMarkupPaise += item.platformMarkupAmount * qty;
      totalPlatformFeePaise += item.platformFeeAmount * qty;
      totalFixedPlatformFeePaise += (item.fixedPlatformFeeAtPurchase ?? FIXED_PLATFORM_FEE_PAISE) * qty;
    }
    totalBoutiquePayoutPaise += calculateBoutiquePayout(item) * qty;
  }

  const totalCommissionPaise = totalPlatformMarkupPaise + totalPlatformFeePaise + totalFixedPlatformFeePaise;
  const gstPaise = Math.floor(totalCommissionPaise * 0.18);
  const netCommissionPaise = totalCommissionPaise - gstPaise;

  return {
    totalPlatformMarkupPaise: Math.round(totalPlatformMarkupPaise),
    totalPlatformFeePaise: Math.round(totalPlatformFeePaise),
    totalFixedPlatformFeePaise: Math.round(totalFixedPlatformFeePaise),
    totalCommissionPaise: Math.round(totalCommissionPaise),
    gstPaise: Math.round(gstPaise),
    netCommissionPaise: Math.round(netCommissionPaise),
    totalBoutiquePayoutPaise: Math.round(totalBoutiquePayoutPaise),
    totalBoutiquePayoutRupees: Math.round(totalBoutiquePayoutPaise) / 100,
  };
}
