import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

import {
  PlatformConfig,
  TierPricingConfig,
  DEFAULT_TIERS_CONFIG,
  DEFAULT_COMMISSION_TIERS,
  DEFAULT_HANDLING_CHARGE_PAISE,
  DEFAULT_PLATFORM_FEE_PAISE,
  DEFAULT_GST_RATE_PERCENT,
  validateTierSlabs,
  calculateAllInclusivePrice,
  calculateAllInclusivePricePaise,
  getPlatformConfig as fetchPlatformConfig,
  // Legacy exports for backward compat
  calculateProductPricing,
  PlatformSettings,
  DEFAULT_TIER_SLABS,
  getPlatformSettings as fetchPlatformSettings,
} from "./pricingService";

// ─── v3: Dynamic Tier Commission Slabs & Platform Config ─────────────────────

export const getPlatformConfig = query({
  args: {},
  handler: async (ctx) => {
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
      // Legacy fields (for admin UI to show current state)
      markupRate: settings?.markupRate,
      platformFeeRate: settings?.platformFeeRate,
      markupType: settings?.markupType,
      markupTiers: settings?.markupTiers,
    };
  },
});

const commissionSlabValidator = v.object({
  minPrice: v.number(),
  maxPrice: v.union(v.number(), v.null()),
  commissionPercent: v.number(),
});

const tierPricingConfigValidator = v.object({
  key: v.string(),
  name: v.string(),
  commissionSlabs: v.array(commissionSlabValidator),
  commissionGstPercent: v.number(),
  handlingChargePaise: v.number(),
  platformFeePaise: v.number(),
  platformGstPercent: v.number(),
});

const commissionTierValidator = v.object({
  key: v.string(),
  name: v.string(),
  sellerCommissionPercent: v.number(),
});

export const updatePlatformConfig = mutation({
  args: {
    tiers: v.optional(v.array(tierPricingConfigValidator)),
    handlingChargePaise: v.optional(v.number()),
    platformFeePaise: v.optional(v.number()),
    gstRatePercent: v.optional(v.number()),
    commissionTiers: v.optional(v.array(commissionTierValidator)),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const tiersToSave = args.tiers || DEFAULT_TIERS_CONFIG;
    if (tiersToSave.length === 0) {
      throw new Error("At least one tier configuration is required.");
    }

    // Validate each tier's commission slabs and charges
    for (const tier of tiersToSave) {
      const slabValidation = validateTierSlabs(tier.commissionSlabs);
      if (!slabValidation.valid) {
        throw new Error(`Invalid slabs in ${tier.name} tier: ${slabValidation.error}`);
      }

      if (tier.commissionGstPercent < 0 || tier.commissionGstPercent > 100) {
        throw new Error(`Commission GST for ${tier.name} must be between 0% and 100%`);
      }
      if (tier.handlingChargePaise < 0) {
        throw new Error(`Handling charge for ${tier.name} cannot be negative`);
      }
      if (tier.platformFeePaise < 0) {
        throw new Error(`Platform fee for ${tier.name} cannot be negative`);
      }
      if (tier.platformGstPercent < 0 || tier.platformGstPercent > 100) {
        throw new Error(`Platform fee GST for ${tier.name} must be between 0% and 100%`);
      }
    }

    const settings = await ctx.db.query("platformSettings").first();
    const patchData: any = {
      tiers: tiersToSave,
      handlingChargePaise: args.handlingChargePaise ?? tiersToSave[0]?.handlingChargePaise ?? DEFAULT_HANDLING_CHARGE_PAISE,
      platformFeePaise: args.platformFeePaise ?? tiersToSave[0]?.platformFeePaise ?? DEFAULT_PLATFORM_FEE_PAISE,
      gstRatePercent: args.gstRatePercent ?? tiersToSave[0]?.platformGstPercent ?? DEFAULT_GST_RATE_PERCENT,
      commissionTiers: args.commissionTiers ?? tiersToSave.map(t => ({
        key: t.key,
        name: t.name,
        sellerCommissionPercent: t.commissionSlabs[0]?.commissionPercent ?? 2,
      })),
      updatedAt: Date.now(),
    };

    if (settings) {
      await ctx.db.patch(settings._id, patchData);
    } else {
      await ctx.db.insert("platformSettings", patchData);
    }

    // Auto-recalculate all product prices after tier config changes
    // to prevent stale storefront prices
    await ctx.scheduler.runAfter(0, internal.adminSettings.recalculateAllProductPricesInternal, {});

    return { success: true };
  },
});


// ─── Legacy v1 API (kept for backward compat) ───────────────────────────────

/** @deprecated Use getPlatformConfig instead */
export const getPlatformSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("platformSettings").first();
    if (!settings) {
      return { 
        markupRate: 0.15, 
        platformFeeRate: 0.02,
        markupType: "tiered" as const,
        markupTiers: DEFAULT_TIER_SLABS,
      };
    }
    return {
      ...settings,
      markupType: (settings as any).markupType ?? "tiered",
      markupTiers: (settings as any).markupTiers ?? DEFAULT_TIER_SLABS,
    };
  },
});

/** @deprecated Use updatePlatformConfig instead */
export const syncOfficialHiveSlabs = mutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("platformSettings").first();
    const data: any = {
      handlingChargePaise: DEFAULT_HANDLING_CHARGE_PAISE,
      platformFeePaise: DEFAULT_PLATFORM_FEE_PAISE,
      gstRatePercent: DEFAULT_GST_RATE_PERCENT,
      commissionTiers: DEFAULT_COMMISSION_TIERS,
      updatedAt: Date.now(),
    };
    if (settings) {
      await ctx.db.patch(settings._id, data);
      return "Updated platformSettings with v2 commission-based defaults.";
    } else {
      await ctx.db.insert("platformSettings", data);
      return "Created platformSettings with v2 commission-based defaults.";
    }
  },
});

const tierSlabValidator = v.object({
  min_price: v.number(),
  max_price: v.union(v.number(), v.null()),
  rate: v.number()
});

const tierConfigValidator = v.optional(v.object({
  name: v.string(),
  slabs: v.array(tierSlabValidator),
}));

/** @deprecated Use updatePlatformConfig instead */
export const updatePlatformSettings = mutation({
  args: {
    markupRate: v.number(),
    platformFeeRate: v.number(),
    markupType: v.union(v.literal("flat"), v.literal("tiered")),
    markupTiers: v.array(tierSlabValidator),
    tier1: tierConfigValidator,
    tier2: tierConfigValidator,
    tier3: tierConfigValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const settings = await ctx.db.query("platformSettings").first();
    
    const patchData: any = {
      markupRate: args.markupRate,
      platformFeeRate: args.platformFeeRate,
      markupType: args.markupType,
      markupTiers: args.markupTiers,
      updatedAt: Date.now(),
    };
    if (args.tier1 !== undefined) patchData.tier1 = args.tier1;
    if (args.tier2 !== undefined) patchData.tier2 = args.tier2;
    if (args.tier3 !== undefined) patchData.tier3 = args.tier3;

    if (settings) {
      await ctx.db.patch(settings._id, patchData);
    } else {
      await ctx.db.insert("platformSettings", patchData);
    }

    return { success: true, updatedProductsCount: 0 };
  },
});

/**
 * Whether a caller-supplied secret may update platform pricing configuration.
 *
 * The previous check was `if (expectedSecret && args.secret && args.secret !== expectedSecret)`,
 * which FAILED OPEN: omitting the secret entirely made the guard's condition falsy, so an
 * unauthenticated caller could rewrite markup rates, platform fee rates and tier slabs.
 *
 * Fails closed on all three cases now, mirroring updateBoutiqueKycStatus in convex/boutiques.ts:
 * no server secret configured, no secret supplied, or a mismatch. Exported as a pure predicate so
 * it can be tested without the Convex runtime.
 */
export function isPlatformApiSecretValid(
  expectedSecret: string | undefined,
  providedSecret: string | undefined
): boolean {
  if (!expectedSecret) return false;
  if (!providedSecret) return false;
  return providedSecret === expectedSecret;
}

/** @deprecated Use updatePlatformConfig instead */
export const updatePlatformSettingsFromApi = mutation({
  args: {
    secret: v.string(),
    markupRate: v.number(),
    platformFeeRate: v.number(),
    markupType: v.union(v.literal("flat"), v.literal("tiered")),
    markupTiers: v.array(tierSlabValidator),
    tier1: tierConfigValidator,
    tier2: tierConfigValidator,
    tier3: tierConfigValidator,
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CLERK_SECRET_KEY;
    if (!isPlatformApiSecretValid(expectedSecret, args.secret)) {
      throw new Error("Unauthorized: Invalid secret key.");
    }
    const settings = await ctx.db.query("platformSettings").first();

    const patchData: any = {
      markupRate: args.markupRate,
      platformFeeRate: args.platformFeeRate,
      markupType: args.markupType,
      markupTiers: args.markupTiers,
      updatedAt: Date.now(),
    };
    if (args.tier1 !== undefined) patchData.tier1 = args.tier1;
    if (args.tier2 !== undefined) patchData.tier2 = args.tier2;
    if (args.tier3 !== undefined) patchData.tier3 = args.tier3;

    if (settings) {
      await ctx.db.patch(settings._id, patchData);
    } else {
      await ctx.db.insert("platformSettings", patchData);
    }

    return { success: true, updatedProductsCount: 0 };
  }
});

/**
 * Bring every product's storefront price in line with its seller base price and
 * its boutique's current tier fees.
 *
 * Only `price` and `discountPrice` are written. The seller's `basePrice` and
 * `baseDiscountPrice` are what they agreed to be paid and are never changed
 * here — this used to round any paise off them and apply a "- 57.82"
 * adjustment on every settings save. A product with no base price is skipped
 * and reported rather than guessed at.
 */
async function syncStorefrontPrices(ctx: any) {
  const config = await fetchPlatformConfig(ctx);
  const products = await ctx.db.query("products").collect();
  const boutiques = await ctx.db.query("boutiques").collect();
  const tierByBoutique = new Map<string, string>();
  for (const b of boutiques) tierByBoutique.set(String(b._id), (b as any).pricingTier || "bronze");

  const now = Date.now();
  const updated: Array<{ id: string; name: string; from: number; to: number }> = [];
  const skippedNoBase: string[] = [];

  for (const product of products) {
    if (!product.basePrice || product.basePrice <= 0) {
      skippedNoBase.push(String(product._id));
      continue;
    }
    const tierKey = tierByBoutique.get(String(product.boutiqueId)) || "bronze";
    const targetPrice = calculateAllInclusivePricePaise(product.basePrice, tierKey, config);
    const targetDiscountPrice = product.baseDiscountPrice
      ? calculateAllInclusivePricePaise(product.baseDiscountPrice, tierKey, config)
      : undefined;

    if (product.price !== targetPrice || product.discountPrice !== targetDiscountPrice) {
      await ctx.db.patch(product._id, { price: targetPrice, discountPrice: targetDiscountPrice, updatedAt: now });
      updated.push({ id: String(product._id), name: product.name, from: product.price, to: targetPrice });
    }
  }

  return {
    success: true,
    updatedCount: updated.length,
    totalProducts: products.length,
    updated: updated.slice(0, 50),
    skippedNoBase,
    message: `Synchronized ${updated.length} of ${products.length} products to all-inclusive upfront pricing.`,
  };
}

/** Admin button: recalculate every storefront price now. */
export const recalculateAllProductPrices = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await syncStorefrontPrices(ctx);
  },
});

/**
 * Runs after tier fees or a store's tier change, and daily as a safety net.
 * Any product it has to correct is logged: outside a settings change, that
 * means something wrote a price without the fees.
 */
export const recalculateAllProductPricesInternal = internalMutation({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await syncStorefrontPrices(ctx);
    if (result.updatedCount > 0 || result.skippedNoBase.length > 0) {
      console.warn(
        `[syncStorefrontPrices][${args.reason ?? "settings_change"}] fixed ${result.updatedCount} price(s)` +
          `, ${result.skippedNoBase.length} product(s) have no base price: ${JSON.stringify({
            updated: result.updated,
            skippedNoBase: result.skippedNoBase,
          })}`
      );
    }
    return result;
  },
});




