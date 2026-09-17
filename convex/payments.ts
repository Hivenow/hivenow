// convex/payments.ts
// Online payment intent creation, validation, signature verification, and post-payment order placement.
// Scope is fully auth-gated to the active customer.

import { mutation, internalMutation, action, internalAction, MutationCtx, internalQuery, query } from "./_generated/server";
import { cancelAccrualForReversal } from "./lib/routeLedger";
import { v, ConvexError } from "convex/values";
import { getAuthenticatedUser, getCurrentUserOrNull, requireRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import { incrementBoutiqueOrderCount } from "./lib/boutiqueCounters";
import { validateProductSizeAndStock, MOCK_INVENTORY } from "./lib/mockInventory";
import { internal } from "./_generated/api";
import { anyApi } from "convex/server";
import { parseMoney } from "./lib/money";
import { calculateDeliveryQuoteAction } from "./routing";
import { getPlatformConfig, calculateCheckoutPricing, calculateSellerItemPricing, calculateAllInclusivePricePaise } from "./pricingService";

import { checkRateLimit } from "./lib/rateLimit";
import { triggerNotification } from "./lib/notifications";
import { checkKillSwitch } from "./lib/killSwitches";
import { validateBoutiqueOperationalLimits, checkBoutiqueClosedStatus } from "./lib/gating";
import { restoreCheckoutSessionStock } from "./lib/inventory";
import { resolveOrderReturnsAccepted, resolveOrderExchangesAccepted } from "./lib/returnPolicy";
import { validateCouponForCart } from "./lib/coupons";
import { applyCouponToOrder } from "./coupons";
import { computePromoDiscountPaise, recordPromoCouponUsageHelper } from "./promoCoupons";
import { getBoutiqueStatus } from "./shared/boutiqueStatus";
import { checkServiceability } from "./lib/serviceability";
// ─── Input Schemas ───────────────────────────────────────────────────────────
const cartItemArg = v.object({
  productId: v.string(),
  name: v.string(),
  price: v.number(),
  imageUrl: v.string(),
  boutiqueName: v.string(),
  size: v.string(),
  quantity: v.number(),
  boutiqueId: v.optional(v.string()),
  isPreorder: v.optional(v.boolean()),
  scheduledProcessingDate: v.optional(v.string()),
  reservationId: v.optional(v.string()),
});

// Constant-time hex string comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Web Crypto HMAC-SHA256 Signature Verification ───────────────────────────
async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const msg = `${orderId}|${paymentId}`;
    const encoder = new TextEncoder();
    const msgBytes = encoder.encode(msg);
    const secretBytes = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const localHexSignature = signatureArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return constantTimeCompare(localHexSignature, signature);
  } catch (err) {
    console.error("[RazorpayVerify] Signature verify error:", err);
    return false;
  }
}

/**
 * Public query to calculate exact backend pricing breakdown for checkout items.
 * Single source of truth for the Review Order page and checkout summary UI.
 */
export const getCheckoutPricing = query({
  args: {
    items: v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
      price: v.number(),
      size: v.string(),
    })),
    deliveryFee: v.optional(v.number()),
    promoCode: v.optional(v.string()),
    promoCouponId: v.optional(v.id("promoCoupons")),
  },
  handler: async (ctx, args) => {
    try {
      if (!args.items || args.items.length === 0) {
        return {
          subtotalRupees: 0, subtotalPaise: 0,
          handlingChargeRupees: 0, handlingChargePaise: 0,
          platformFeeRupees: 0, platformFeePaise: 0,
          gstOnChargesRupees: 0, gstOnChargesPaise: 0,
          gstRupees: 0, gstPaise: 0,
          deliveryFeeRupees: 0, deliveryFeePaise: 0,
          discountRupees: 0, discountPaise: 0,
          totalRupees: 0, totalPaise: 0,
          items: [],
        };
      }

      // Fetch platform config
      const platformConfig = await getPlatformConfig(ctx);

      // Resolve boutique tier from the first product
      let sellerTierKey = "bronze";
      const firstItem = args.items[0];
      if (firstItem) {
        let firstProductRow: any = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", firstItem.productId))
          .unique();
        if (!firstProductRow) {
          const validId = ctx.db.normalizeId("products", firstItem.productId);
          if (validId) firstProductRow = await ctx.db.get(validId);
        }
        if (firstProductRow?.boutiqueId) {
          const boutique = await ctx.db.get(firstProductRow.boutiqueId);
          if (boutique) sellerTierKey = (boutique as any).pricingTier || "bronze";
        }
      }


      // Validate each item price against DB
      let productSubtotalPaise = 0;
      const itemsBreakdown: any[] = [];

      for (const item of args.items) {
        let productRow: any = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", item.productId))
          .unique();

        if (!productRow) {
          const validId = ctx.db.normalizeId("products", item.productId);
          if (validId) productRow = await ctx.db.get(validId);
        }

        let canonicalPricePaise: number;
        if (productRow) {
          // Use basePrice (seller's original price) to avoid double-counting platform charges.
          // The `price` field already has platform fees baked in from product creation.
          canonicalPricePaise = productRow.baseDiscountPrice ?? productRow.basePrice ?? productRow.discountPrice ?? productRow.price;
        } else {
          // Unknown product — use client price (validation happens at checkout)
          canonicalPricePaise = Math.round(item.price * 100);
        }

        productSubtotalPaise += canonicalPricePaise * item.quantity;
        itemsBreakdown.push({
          productId: item.productId,
          productName: productRow?.name ?? "Item",
          quantity: item.quantity,
          size: item.size,
          priceAtPurchaseRupees: canonicalPricePaise / 100,
          allInclusivePriceRupees: calculateAllInclusivePricePaise(canonicalPricePaise, sellerTierKey, platformConfig) / 100,
        });
      }

      // Discount is taken off the all-inclusive item total the customer sees,
      // not the seller base price — same base as validatePromoCode and checkout.
      const allInclusiveSubtotalPaise = args.items.reduce((sum, item, i) =>
        sum + calculateAllInclusivePricePaise(
          Math.round(itemsBreakdown[i].priceAtPurchaseRupees * 100), sellerTierKey, platformConfig
        ) * item.quantity, 0);

      let discountPaise = 0;
      let sellerFundedDiscountPaise = 0;
      if (args.promoCouponId) {
        const promoCoupon = await ctx.db.get(args.promoCouponId);
        if (promoCoupon && promoCoupon.status === "active") {
          discountPaise = computePromoDiscountPaise(promoCoupon, allInclusiveSubtotalPaise);
          if (promoCoupon.fundedBy === "seller") sellerFundedDiscountPaise = discountPaise;
        }
      }

      // Delivery fee (from dynamic Porter quote passed from frontend)
      let deliveryFeePaise = (args.deliveryFee !== undefined)
        ? Math.round(args.deliveryFee * 100)
        : (productSubtotalPaise >= 1000000 ? 0 : 9900); // ₹99 default

      // v2: Use pricing engine for authoritative calculation
      const pricing = calculateCheckoutPricing(
        args.items.map(item => ({
          sellerBasePricePaise: itemsBreakdown.find(b => b.productId === item.productId)
            ? Math.round(itemsBreakdown.find(b => b.productId === item.productId)!.priceAtPurchaseRupees * 100)
            : Math.round(item.price * 100),
          quantity: item.quantity,
        })),
        deliveryFeePaise,
        discountPaise,
        sellerTierKey,
        platformConfig,
        sellerFundedDiscountPaise
      );

      return {
        // v2 fields (authoritative)
        productSubtotalRupees: pricing.productSubtotalPaise / 100,
        productSubtotalPaise: pricing.productSubtotalPaise,
        handlingChargeRupees: pricing.handlingChargePaise / 100,
        handlingChargePaise: pricing.handlingChargePaise,
        platformFeeRupees: pricing.platformFeePaise / 100,
        platformFeePaise: pricing.platformFeePaise,
        gstOnChargesRupees: pricing.platformChargesGstPaise / 100,
        gstOnChargesPaise: pricing.platformChargesGstPaise,
        deliveryFeeRupees: pricing.deliveryFeePaise / 100,
        deliveryFeePaise: pricing.deliveryFeePaise,
        discountRupees: pricing.discountPaise / 100,
        discountPaise: pricing.discountPaise,
        totalRupees: pricing.totalPayablePaise / 100,
        totalPaise: pricing.totalPayablePaise,
        // Backward-compat fields
        subtotalRupees: pricing.productSubtotalPaise / 100,
        subtotalPaise: pricing.productSubtotalPaise,
        gstRupees: pricing.platformChargesGstPaise / 100,
        gstPaise: pricing.platformChargesGstPaise,
        items: itemsBreakdown,
        // Seller info (not shown to customer — for internal use)
        sellerTierKey: pricing.sellerTierKey,
        sellerCommissionPercent: pricing.sellerCommissionPercent,
      };
    } catch (err) {
      // No fallback to the client's prices: those showed the shopper a total
      // checkout would then refuse. null tells the page prices are unavailable,
      // so it shows an error and keeps Pay disabled.
      console.error("[getCheckoutPricing][ALERT] Pricing failed; returning null:", err);
      return null;
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: initCheckoutSessionInternal (Internal Mutation)
// ─────────────────────────────────────────────────────────────────────────────
export const initCheckoutSessionInternal = internalMutation({
  args: {
    addressId: v.id("addresses"),
    deliveryDate: v.string(),
    deliverySlot: v.string(),
    paymentMethod: v.string(),
    items: v.array(cartItemArg),
    subtotal: v.number(),
    deliveryFee: v.number(),
    discount: v.number(),
    total: v.number(),
    promoCode: v.optional(v.string()),
    /** Exchange store credit. Separate from promoCode — see the coupon block below. */
    couponCode: v.optional(v.string()),
    /** Admin promo coupon ID from promoCoupons table, validated client-side then re-validated here. */
    promoCouponId: v.optional(v.id("promoCoupons")),
    promoCouponDiscountPaise: v.optional(v.number()),
    token: v.optional(v.string()),
    quoteId: v.optional(v.string()),
    quotedAt: v.optional(v.number()),
    userSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The delivery fee is never taken from the client. Checkout charges only a
    // quote the server priced itself (getDeliveryQuoteAction), checked below
    // against this order's shop, delivery point and cart once those are known.
    const DELIVERY_PRICE_CHANGED = "Delivery price changed. Please refresh checkout and try again.";
    const storedQuote = args.quoteId
      ? await ctx.db.query("checkoutQuotes")
          .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", args.quoteId as string))
          .first()
      : null;
    if (!storedQuote || Date.now() > storedQuote.expiresAt) {
      throw new ConvexError(DELIVERY_PRICE_CHANGED);
    }
    
    // 1. Verify kill switches
    const isMaintenanceMode = await checkKillSwitch(ctx.db, "maintenanceMode");
    if (isMaintenanceMode) {
      throw new ConvexError("Platform is currently undergoing scheduled maintenance.");
    }
    const isCheckoutEnabled = await checkKillSwitch(ctx.db, "checkoutEnabled");
    if (!isCheckoutEnabled) {
      throw new ConvexError("Checkout is temporarily disabled for maintenance.");
    }
    const isPaymentsEnabled = await checkKillSwitch(ctx.db, "paymentsEnabled");
    if (!isPaymentsEnabled && args.paymentMethod !== "cod") {
      throw new ConvexError("Online payments are temporarily disabled.");
    }

    let user: any = null;
    if (args.userSubject) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userSubject!))
        .unique();
    }
    if (!user) {
      try {
        user = await getAuthenticatedUser(ctx, args.token);
      } catch (err: any) {
        console.warn("[initCheckoutSessionInternal] getAuthenticatedUser failed:", err.message || err);
      }
    }

    if (!user) {
      throw new ConvexError("User authentication failed. Please sign in again.");
    }
    if (!user.isActive) {
      throw new ConvexError("Your account is currently disabled. Please contact support.");
    }


    // Rate limit checkout session creations: max 10 per user per 15 minutes
    await checkRateLimit(ctx, `checkout_session:${user._id}`, 10, 15 * 60 * 1000);

    // Retrieve and verify address
    const addr = await ctx.db.get(args.addressId);
    if (!addr || addr.userId !== user._id) {
      throw new ConvexError("Invalid address selection.");
    }

    if (addr.addressStatus === "rejected") {
      throw new ConvexError("Delivery to this address is currently rejected or not serviceable. Please update your address.");
    }

    // Strict Pincode Blocking Guard: Only block if pincode is explicitly in the table and marked inactive.
    // Unknown pincodes are allowed through — the distance-based serviceability check below will handle them.
    if (addr.pincode) {
      const pincodeRecord = await ctx.db
        .query("serviceablePincodes")
        .withIndex("by_pincode", (q) => q.eq("pincode", addr.pincode))
        .first();

      if (pincodeRecord && pincodeRecord.active === false) {
        throw new ConvexError(`Delivery to pincode ${addr.pincode} is currently blocked or not serviceable.`);
      }
    }

    if (args.items.length === 0) {
      throw new ConvexError("Cart is empty.");
    }

    const deliveryLat = addr.lat;
    const deliveryLng = addr.lng;

    // Coordinate Validation (P0 - Null Island block)
    if (
      deliveryLat === undefined ||
      deliveryLat === null ||
      Number.isNaN(deliveryLat) ||
      !Number.isFinite(deliveryLat) ||
      deliveryLat === 0 ||
      deliveryLng === undefined ||
      deliveryLng === null ||
      Number.isNaN(deliveryLng) ||
      !Number.isFinite(deliveryLng) ||
      deliveryLng === 0
    ) {
      throw new ConvexError("Address has invalid coordinates. Please pin your address on the map.");
    }

    // Resilient Address Completeness (P1)
    const finalHouseNumber = (addr.houseNumber && addr.houseNumber.trim()) || addr.line1 || addr.formattedAddress || "1";
    const finalPhone = (addr.phone && addr.phone.trim()) || (user.phone && user.phone.trim()) || user.email || "";
    if (!finalPhone) {
      throw new ConvexError("Contact phone number is required for delivery hand-off.");
    }


    // Server-Side Promo Validation (P0)
    // If a promoCouponId is provided, re-validate it server-side from the
    // promoCoupons table. Legacy hardcoded codes are removed.
    let validatedPromoCouponId: Id<"promoCoupons"> | undefined = undefined;
    let validatedPromoCouponDiscountPaise = 0;

    // Delivery fee validation is deferred until after items loop where distance is computed.
    // See distance-based validation below the items loop.

    // Verify total calculation will also be deferred to after delivery fee is computed.

    const compiledAddressSnapshot = {
      label: addr.label,
      line1: addr.line1,
      line2: addr.line2,
      formattedAddress: addr.formattedAddress,
      houseNumber: finalHouseNumber,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      lat: addr.lat,
      lng: addr.lng,
      phone: finalPhone,
      locality: addr.locality,
      receiverName: addr.receiverName,
      deliveryInstructions: addr.deliveryInstructions,
    };



    // Verify items and check initial stock levels
    const resolvedItems: any[] = [];
    let expectedSubtotalPaise = 0;
    let placedDuringClosedHours = false;
    let scheduledProcessingDate: string | undefined = undefined;
    for (const item of args.items) {
      const bySlug = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", item.productId))
        .unique();

      let productRow = bySlug;
      if (!productRow) {
        try {
          productRow = await ctx.db.get(item.productId as Id<"products">);
        } catch {
          // ignore
        }
      }

      const isMock = MOCK_INVENTORY[item.productId] !== undefined;
      if (!productRow && !isMock) {
        throw new ConvexError(`The item "${item.name}" is no longer available.`);
      }
      if (productRow && !productRow.active) {
        throw new ConvexError(`The item "${item.name}" is currently deactivated.`);
      }

      let boutique: any = null;
      if (productRow) {
        boutique = await ctx.db.get(productRow.boutiqueId);
      } else {
        boutique = await ctx.db
          .query("boutiques")
          .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
          .first();
      }

      if (!boutique) {
        throw new ConvexError(`Boutique for item "${item.name}" is unavailable.`);
      }
      if (boutique.status !== "APPROVED") {
        throw new ConvexError(`The boutique "${boutique.boutiqueName || boutique.name}" is temporarily unavailable.`);
      }
      if (boutique.isAcceptingOrders === false) {
        throw new ConvexError(`The boutique "${boutique.boutiqueName || boutique.name}" is currently paused.`);
      }

      // Perform operational limits checks (hours, operating days, capacity, soft launch)
      await validateBoutiqueOperationalLimits(ctx.db, boutique._id);
      
      const bStatus = getBoutiqueStatus(boutique, Date.now());
      if (bStatus.type !== "OPEN" || item.isPreorder) {
        placedDuringClosedHours = true;
        if (bStatus.type === "CLOSED_TODAY" || bStatus.type === "CLOSED_EXTENDED") {
          scheduledProcessingDate = bStatus.nextOperatingDay;
        } else if (item.scheduledProcessingDate) {
          scheduledProcessingDate = item.scheduledProcessingDate;
        }
      }

      // Check stock
      await validateProductSizeAndStock(ctx.db, item.productId, item.size, item.quantity, item.reservationId);

      // Enforce Serviceability before payment session
      const serviceability = checkServiceability(deliveryLat, deliveryLng, boutique);
      console.log(JSON.stringify({
        event: "serviceability_check",
        timestamp: Date.now(),
        boutiqueId: boutique._id,
        distanceKm: serviceability.distanceKm,
        radiusKm: serviceability.radiusKm,
        serviceable: serviceability.serviceable,
        reason: serviceability.reason,
        checkoutType: "razorpay"
      }));

      if (!serviceability.serviceable) {
        throw new ConvexError(serviceability.reason || "One or more items cannot be delivered to your address.");
      }

      // v2: Validate item price matches DB (no markup — product price = base price)
      let activePricePaise = 0;
      let basePricePaiseForPricing = 0;
      
      if (productRow && !isMock) {
        // v2: Validate item price matches DB all-inclusive price
        const allInclusivePricePaise = productRow.price ?? productRow.basePrice;
        basePricePaiseForPricing = productRow.baseDiscountPrice ?? productRow.basePrice ?? productRow.discountPrice ?? productRow.price;

        if (Math.abs(allInclusivePricePaise - Math.round(item.price * 100)) > 100) {
          throw new ConvexError({
            code: "STALE_CART_PRICE",
            message: "The prices of some items in your cart have been updated. Please review your new total before checking out.",
          });
        }
        activePricePaise = allInclusivePricePaise;
      } else {
        activePricePaise = Math.round(item.price * 100);
        basePricePaiseForPricing = activePricePaise;
      }
        
      expectedSubtotalPaise += activePricePaise * item.quantity;

      resolvedItems.push({
        item,
        productRow,
        isMock,
        boutiqueId: boutique._id,
        activePricePaise,
        basePricePaiseForPricing,
      });
    }

    // Verify product subtotal in integer Paise
    const clientSubtotalPaise = Math.round(args.subtotal * 100);
    if (Math.abs(clientSubtotalPaise - expectedSubtotalPaise) > 100) {
      console.error(`[TAMPERING_CHECK] Mismatch detected. clientSubtotalPaise: ${clientSubtotalPaise}, expectedSubtotalPaise: ${expectedSubtotalPaise}, client args.subtotal: ${args.subtotal}`);
      throw new ConvexError(`Security Exception: Cart subtotal mismatch. Price tampering detected.`);
    }

    const primaryBoutiqueId = resolvedItems[0]?.boutiqueId;
    if (!primaryBoutiqueId) {
      throw new ConvexError("No valid boutique found for this checkout.");
    }

    // Enforce "1 Cart = 1 Boutique" invariant at server-side checkout session creation
    for (const resolved of resolvedItems) {
      if (resolved.boutiqueId !== primaryBoutiqueId) {
        throw new ConvexError("All items in the checkout must belong to the same boutique.");
      }
    }

    const primaryBoutique = (await ctx.db.get(primaryBoutiqueId)) as any;
    if (primaryBoutique && primaryBoutique.minimumOrderValue !== undefined) {
      const subtotalPaise = Math.round(args.subtotal * 100);
      if (subtotalPaise < primaryBoutique.minimumOrderValue) {
        throw new ConvexError(
          `Minimum order value for ${primaryBoutique.boutiqueName || primaryBoutique.name} is ₹${(primaryBoutique.minimumOrderValue / 100).toFixed(2)}. Please add more items.`
        );
      }
    }

    const cleanPromoCode = args.promoCode ? args.promoCode.trim().toUpperCase() : "";

    const platformConfig = await getPlatformConfig(ctx);
    const sellerTierKey = primaryBoutique?.pricingTier || "bronze";
    // The all-inclusive item total exactly as the pricing engine charges it.
    const chargedSubtotalPaise = resolvedItems.reduce((sum, r) =>
      sum + calculateAllInclusivePricePaise(r.basePricePaiseForPricing, sellerTierKey, platformConfig) * r.item.quantity, 0);

    // Server-Side Promo Validation (P0)
    // Computed in paise on the server's own all-inclusive subtotal. The client's
    // figure is only checked against it; the server figure is what gets charged.
    let expectedDiscountPaise = 0;
    let sellerFundedDiscountPaise = 0;
    if (args.promoCouponId) {
      const promoCoupon = await ctx.db.get(args.promoCouponId);
      if (!promoCoupon || promoCoupon.status !== "active") {
        throw new ConvexError("The promo coupon is no longer active.");
      }
      const now2 = Date.now();
      if (promoCoupon.startsAt && now2 < promoCoupon.startsAt) {
        throw new ConvexError("This promo coupon hasn't started yet.");
      }
      if (promoCoupon.expiresAt && now2 > promoCoupon.expiresAt) {
        throw new ConvexError("This promo coupon has expired.");
      }
      if (promoCoupon.usedCount >= promoCoupon.usageLimit) {
        throw new ConvexError("This promo coupon has reached its usage limit.");
      }
      // Per-user limit check
      const userUsages = await ctx.db
        .query("promoCouponUsages")
        .withIndex("by_promoCouponId_userId", (q) =>
          q.eq("promoCouponId", args.promoCouponId!).eq("userId", user._id)
        )
        .collect();
      if (userUsages.length >= promoCoupon.perUserLimit) {
        throw new ConvexError("You've already used this promo code the maximum number of times.");
      }
      // Boutique scope check
      if (promoCoupon.scope === "boutique" && promoCoupon.boutiqueId) {
        if (String(primaryBoutiqueId) !== String(promoCoupon.boutiqueId)) {
          throw new ConvexError("This coupon is only valid for a specific boutique.");
        }
      }
      if (promoCoupon.minOrderPaise && chargedSubtotalPaise < promoCoupon.minOrderPaise) {
        throw new ConvexError(`Minimum order of ₹${(promoCoupon.minOrderPaise / 100).toFixed(0)} required for this coupon.`);
      }
      expectedDiscountPaise = computePromoDiscountPaise(promoCoupon, chargedSubtotalPaise);
      if (promoCoupon.fundedBy === "seller") {
        // A seller can only fund a discount on its own items.
        if (String(promoCoupon.boutiqueId) !== String(primaryBoutiqueId)) {
          throw new ConvexError("This coupon is only valid for a specific boutique.");
        }
        sellerFundedDiscountPaise = expectedDiscountPaise;
      }
      validatedPromoCouponId = promoCoupon._id;
      validatedPromoCouponDiscountPaise = expectedDiscountPaise;
    }
    // Hardcoded codes (WELCOME10, HIVEFIRST, FREESHIP) are gone: the checkout
    // UI only applies coupons from the promoCoupons table, so they were only
    // reachable by a hand-crafted request.

    // Same ₹1 tolerance as the subtotal check: the client may have rounded.
    if (Math.abs(parseMoney(args.discount) - expectedDiscountPaise) > 100) {
      throw new ConvexError(
        `Discount validation failed. Expected: ₹${(expectedDiscountPaise / 100).toFixed(2)}, Got: ₹${args.discount}`
      );
    }

    // The quote must be for this shop and this delivery point, and for a cart no
    // bigger than this one (a bigger cart can only unlock free delivery). Quotes
    // stored before these fields existed carry none of them and are refused.
    const COORD_TOLERANCE = 0.0005; // ~50 m
    const quoteMatchesOrder =
      storedQuote.boutiqueId === String(primaryBoutiqueId) &&
      typeof storedQuote.userLat === "number" &&
      typeof storedQuote.userLng === "number" &&
      Math.abs(storedQuote.userLat - deliveryLat) <= COORD_TOLERANCE &&
      Math.abs(storedQuote.userLng - deliveryLng) <= COORD_TOLERANCE &&
      typeof storedQuote.subtotal === "number" &&
      chargedSubtotalPaise / 100 + 1 >= storedQuote.subtotal;
    if (!quoteMatchesOrder || Math.abs(args.deliveryFee - storedQuote.deliveryFee) > 1) {
      throw new ConvexError(DELIVERY_PRICE_CHANGED);
    }

    // ─── v2: Authoritative server-side pricing via pricing engine ─────────

    const pricingItems = resolvedItems.map(r => ({
      sellerBasePricePaise: r.basePricePaiseForPricing,
      quantity: r.item.quantity,
    }));

    const deliveryFeePaise = parseMoney(storedQuote.deliveryFee);
    const discountPaise = expectedDiscountPaise;

    const pricing = calculateCheckoutPricing(
      pricingItems,
      deliveryFeePaise,
      discountPaise,
      sellerTierKey,
      platformConfig,
      sellerFundedDiscountPaise
    );

    // Server-calculated total is authoritative. Verify client total is within tolerance.
    const clientTotalPaise = Math.round(args.total * 100);
    if (Math.abs(pricing.totalPayablePaise - clientTotalPaise) > 200) {
      console.error(`[PRICING_DRIFT] Server total: ${pricing.totalPayablePaise}, Client total: ${clientTotalPaise}`);
      throw new ConvexError(`Order total mismatch. Server calculated ₹${(pricing.totalPayablePaise / 100).toFixed(2)}, got ₹${args.total.toFixed(2)}. Please refresh.`);
    }

    const now = Date.now();

    // ─── Exchange coupon ────────────────────────────────────────────────────
    // Applied against the FULL payable total (items + delivery + fees), since
    // the coupon is worth what the customer originally paid, delivery included.
    // Validated entirely server-side — the client's claim about a coupon's
    // value, owner, or scope is never trusted.
    let appliedCoupon: {
      couponId: Id<"coupons">;
      couponAppliedPaise: number;
      customerPayablePaise: number;
    } | null = null;

    const cleanCouponCode = args.couponCode ? args.couponCode.trim().toUpperCase() : "";
    if (cleanCouponCode) {
      const coupon = await ctx.db
        .query("coupons")
        .withIndex("by_code", (q) => q.eq("code", cleanCouponCode))
        .first();
      if (!coupon) throw new ConvexError("That coupon code isn't valid.");

      const verdict = validateCouponForCart(
        {
          status: coupon.status,
          boutiqueId: coupon.boutiqueId,
          customerId: coupon.customerId,
          expiresAt: coupon.expiresAt,
        },
        {
          customerId: user._id,
          boutiqueIds: resolvedItems.map((r) =>
            String((r.productRow as any)?.boutiqueId ?? primaryBoutiqueId)
          ),
        },
        now
      );
      if (!verdict.valid) throw new ConvexError(verdict.message);

      const couponAppliedPaise = Math.min(coupon.amountPaise, pricing.totalPayablePaise);
      appliedCoupon = {
        couponId: coupon._id,
        couponAppliedPaise,
        customerPayablePaise: pricing.totalPayablePaise - couponAppliedPaise,
      };
    }

    const customerPayablePaise =
      appliedCoupon?.customerPayablePaise ?? pricing.totalPayablePaise;

    // Decrement stock for real products and log inventory movements (skip for reservations as they are already deducted)
    // NOTE: We re-read the product document here to ensure Convex OCC detects concurrent
    // modifications. If two mutations decrement the same product simultaneously, the second
    // will conflict on this read-then-write and automatically retry, seeing the updated stock.
    for (const { item, productRow: originalProduct, isMock } of resolvedItems) {
      if (originalProduct && !isMock && !item.reservationId) {
        // Re-read product to get latest stock for OCC conflict detection
        const freshProduct = await ctx.db.get(originalProduct._id as Id<"products">);
        if (!freshProduct) {
          throw new ConvexError(`Product "${item.name}" is no longer available.`);
        }
        const currentStock = (freshProduct as any).stockBySize[item.size] ?? 0;
        if (currentStock < item.quantity) {
          throw new ConvexError(`"${item.name}" in size ${item.size} is now out of stock.`);
        }
        const newStock = currentStock - item.quantity;
        const stockBySize = { ...(freshProduct as any).stockBySize };
        stockBySize[item.size] = newStock;

        const totalStock = Object.values(stockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
        const autoDeactivatedBecauseOutOfStock = totalStock <= 0;

        await ctx.db.patch(originalProduct._id as Id<"products">, { 
          stockBySize, 
          autoDeactivatedBecauseOutOfStock, 
          updatedAt: now 
        });

        await ctx.db.insert("inventoryMovements", {
          productId: originalProduct._id as Id<"products">,
          boutiqueId: (freshProduct as any).boutiqueId,
          size: item.size,
          beforeQty: currentStock,
          afterQty: newStock,
          adjustmentQty: -item.quantity,
          reason: "online_order",
          source: "checkout",
          createdBy: user._id,
          createdAt: now,
        });
      }
    }

    const expiresAt = now + 15 * 60 * 1000; // 15-minute checkout lock window

    // Build items with v2 seller pricing snapshot per-item
    const itemsParsed = resolvedItems.map((resolved) => {
      const sellerItemPricing = calculateSellerItemPricing(
        resolved.basePricePaiseForPricing,
        sellerTierKey,
        platformConfig
      );
      return {
        ...resolved.item,
        productId: resolved.productRow?._id ?? resolved.item.productId,
        price: resolved.activePricePaise,
        // v2 commission fields
        basePriceAtPurchase: resolved.basePricePaiseForPricing,
        sellerBasePricePaise: sellerItemPricing.sellerBasePricePaise,
        sellerCommissionPercent: sellerItemPricing.sellerCommissionPercent,
        sellerCommissionPaise: sellerItemPricing.sellerCommissionPaise,
        sellerCommissionGstPaise: sellerItemPricing.sellerCommissionGstPaise,
        sellerPayoutPaise: sellerItemPricing.sellerPayoutPaise,
      };
    });

    // Save temporary Checkout Session with v2 pricing
    const checkoutSessionId = await ctx.db.insert("checkoutSessions", {
      userId: user._id,
      addressId: args.addressId,
      addressSnapshot: compiledAddressSnapshot,
      deliveryDate: args.deliveryDate,
      deliverySlot: args.deliverySlot,
      paymentMethod: args.paymentMethod,
      items: itemsParsed,
      subtotal: pricing.productSubtotalPaise,
      deliveryFee: pricing.deliveryFeePaise,
      discount: pricing.discountPaise,
      total: pricing.totalPayablePaise,
      promoCode: args.promoCode,
      promoCouponId: validatedPromoCouponId,
      promoCouponDiscountPaise: validatedPromoCouponDiscountPaise || undefined,
      promoSellerFundedDiscountPaise: pricing.sellerFundedDiscountPaise || undefined,
      couponId: appliedCoupon?.couponId,
      couponAppliedPaise: appliedCoupon?.couponAppliedPaise,
      customerPayablePaise,
      razorpayOrderId: "",
      status: "pending",
      placedDuringClosedHours,
      scheduledProcessingDate,
      expiresAt,
      createdAt: now,
    });

    // Save initial Payment record with "initiated" status.
    // Amount is what the CUSTOMER is charged — the coupon-funded portion never
    // passes through Razorpay, it is already sitting in Hive's balance.
    const paymentId = await ctx.db.insert("payments", {
      customerId: user._id,
      paymentProvider: "razorpay",
      razorpayOrderId: undefined,
      amount: customerPayablePaise,
      currency: "INR",
      status: "initiated",
      createdAt: now,
      updatedAt: now,
      webhookEvents: [],
    });

    // Save audit events
    await ctx.db.insert("paymentEvents", {
      source: "razorpay",
      paymentId,
      eventType: "initiated",
      payload: JSON.stringify({ checkoutSessionId, expiresAt, pricingSnapshot: pricing }),
      createdAt: now,
    });

    return {
      checkoutSessionId,
      paymentId,
      total: pricing.totalPayablePaise / 100,
      totalPaise: pricing.totalPayablePaise,
      // What the customer must actually pay after any exchange coupon. Zero
      // means the coupon covers the order outright — the client should skip
      // Razorpay entirely and call placeCouponFundedOrder.
      customerPayablePaise,
      couponAppliedPaise: appliedCoupon?.couponAppliedPaise ?? 0,
      userEmail: user.email || "",
      userPhone: finalPhone,
      customerName: user.email?.split("@")[0] || "Hive Customer",
      pricingSnapshot: pricing,
      // v2: No Route transfers at checkout time. Payment goes to Hive's Razorpay account.
      razorpayAccountId: undefined,
      merchantPayablePaise: 0,
      transfersList: [],
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: verifyPaymentAndPlaceOrder
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyPaymentAndPlaceOrderInternal(
  ctx: MutationCtx,
  args: {
    checkoutSessionId: Id<"checkoutSessions">;
    razorpayPaymentId: string;
    razorpaySignature: string;
    token?: string;
  }
) {
  const user = await getAuthenticatedUser(ctx, args.token);
  const session = await ctx.db.get(args.checkoutSessionId);
  if (!session || session.userId !== user._id) {
    throw new ConvexError("Invalid checkout session details.");
  }

  // Order Creation Idempotency Check: lookup order by session ID key unconditionally
  const resolvedOrder = await ctx.db
    .query("orders")
    .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
    .first();

  if (resolvedOrder) {
    return { success: true, orderId: resolvedOrder._id, orderNumber: resolvedOrder.orderNumber };
  }

  if (session.status === "completed") {
    throw new ConvexError("Checkout session completed but matching order record was not found.");
  }

  if (session.status === "processing") {
    throw new ConvexError("Checkout session is currently being processed. Please wait.");
  }

  // Expiry verification
  if (session.status === "expired") {
    // If we've already marked it expired (e.g., via cron) and released inventory, we must reject.
    throw new ConvexError("Checkout session has expired. Stale inventory release triggered. Please try again.");
  }
  // NOTE: We intentionally do NOT check `session.expiresAt < Date.now()` here.
  // If the customer successfully paid on Razorpay (even if they took slightly > 15 mins),
  // we absorb any shipping rate differences to avoid cancelling a paid order.
  if (session.expiresAt < Date.now()) {
    const varianceMinutes = Math.round((Date.now() - session.expiresAt) / 60000);
    console.warn(`[TTL Variance] Absorbed successful payment ${varianceMinutes} minutes past TTL for session ${args.checkoutSessionId}`);
  }

  if (session.status === "failed") {
    throw new ConvexError("Checkout session has failed.");
  }

  // Compare-and-Swap Session Lock (P0)
  await ctx.db.patch(args.checkoutSessionId, { status: "processing" });

  // A coupon-funded order has no Razorpay payment to verify: the money is
  // already in Hive's balance from the reversed transfer, so nothing was
  // charged. The authorisation for these comes from the coupon itself, which
  // was validated server-side at checkout and is consumed below under a
  // single-use guard.
  const isCouponFunded =
    (session.customerPayablePaise ?? session.total) < 100 && !!session.couponId;

  // Signature Validation
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret && !isCouponFunded) {
    throw new ConvexError("FATAL: RAZORPAY_KEY_SECRET environment variable is not configured. Payment processing is disabled.");
  }

  const isSignatureMock =
    isCouponFunded || isSignatureBypassAllowed(process.env.ENABLE_DEBUG_TOOLS, razorpaySecret);

  if (!isSignatureMock) {
    const isVerified = await verifyRazorpaySignature(
      session.razorpayOrderId,
      args.razorpayPaymentId,
      args.razorpaySignature,
      razorpaySecret!
    );
    if (!isVerified) {
      await restoreCheckoutSessionStock(ctx, session);
      await ctx.db.patch(args.checkoutSessionId, { status: "failed" });
      throw new ConvexError("Payment signature mismatch. Threat warning: possible transaction tampering.");
    }
  }

  const payment = await ctx.db
    .query("payments")
    .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", session.razorpayOrderId))
    .first();

  if (!payment) {
    await restoreCheckoutSessionStock(ctx, session);
    await ctx.db.patch(args.checkoutSessionId, { status: "failed" });
    throw new ConvexError("Payment record not found for this session.");
  }

  const now = Date.now();

  // Verify paymentsEnabled kill switch
  const isPaymentsEnabled = await checkKillSwitch(ctx.db, "paymentsEnabled");
  if (!isPaymentsEnabled) {
    throw new ConvexError("Online payments are temporarily disabled.");
  }

  // Capture payment
  await ctx.db.patch(payment._id, {
    status: "captured",
    razorpayPaymentId: args.razorpayPaymentId,
    method: session.paymentMethod,
    updatedAt: now,
  });
  await ctx.db.insert("paymentEvents", {
    source: "razorpay",
    paymentId: payment._id,
    eventType: "captured",
    payload: JSON.stringify({ razorpayPaymentId: args.razorpayPaymentId }),
    createdAt: now,
  });

  // Place actual order record
  // P0-4 FIX: Collision-resistant order number using timestamp (base36) + random suffix
  const orderNumber = `HIVE-${Math.floor(now / 1000).toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Resolve boutiqueId and build resolvedProductMap from session items
  let boutiqueId: any = undefined;
  const resolvedProductMap = new Map<string, Id<"products">>();
  for (const item of session.items) {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", item.productId))
      .unique();
    let productRow = product;
    if (!productRow) {
      try {
        productRow = await ctx.db.get(item.productId as Id<"products">);
      } catch { }
    }
    if (productRow) {
      resolvedProductMap.set(item.productId, productRow._id);
      if (!boutiqueId) {
        boutiqueId = productRow.boutiqueId;
      }
    }
  }

  if (!boutiqueId) {
    const defaultBoutique = await ctx.db
      .query("boutiques")
      .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
      .first();
    boutiqueId = defaultBoutique?._id;
  }

  if (!boutiqueId) {
    throw new ConvexError("No boutique found to fulfill this order.");
  }

  // Resolve boutique details snapshot
  const boutique = await ctx.db.get(boutiqueId) as any;
  const boutiqueName = boutique ? (boutique.boutiqueName || boutique.name || "Unknown Boutique") : "Unknown Boutique";

  // Setup snapshot metrics using Hive v3 dynamic tier pricing model
  const platformConfig = await getPlatformConfig(ctx);
  const sellerTierKey = boutique?.pricingTier || "bronze";
  const pricing = calculateCheckoutPricing(
    session.items.map(item => ({
      // Session item prices are rupees (createCheckoutSession contract); only sessions created
      // before sellerBasePricePaise existed reach this fallback.
      sellerBasePricePaise: item.sellerBasePricePaise ?? Math.round(item.price * 100),
      quantity: item.quantity,
    })),
    session.deliveryFee ?? 0,
    session.discount ?? 0,
    sellerTierKey,
    platformConfig,
    session.promoSellerFundedDiscountPaise ?? 0
  );

  const platformCommissionAmount = pricing.sellerCommissionPaise;
  const gstOnCommission = pricing.sellerCommissionGstPaise;
  const merchantPayable = pricing.sellerPayoutPaise;
  const commissionRate = pricing.sellerCommissionPercent;

  const pricingSnapshot = {
    productSubtotalPaise: pricing.productSubtotalPaise,
    handlingChargePaise: pricing.handlingChargePaise,
    platformFeePaise: pricing.platformFeePaise,
    platformChargesGstPaise: pricing.platformChargesGstPaise,
    deliveryFeePaise: pricing.deliveryFeePaise,
    discountPaise: pricing.discountPaise,
    sellerFundedDiscountPaise: pricing.sellerFundedDiscountPaise,
    platformFundedDiscountPaise: pricing.platformFundedDiscountPaise,
    totalPayablePaise: pricing.totalPayablePaise,
    sellerTierKey: pricing.sellerTierKey,
    sellerTierName: pricing.sellerTierName,
    slabMinPrice: pricing.slabMinPrice,
    slabMaxPrice: pricing.slabMaxPrice,
    sellerCommissionPercent: pricing.sellerCommissionPercent,
    sellerCommissionPaise: pricing.sellerCommissionPaise,
    sellerCommissionGstPaise: pricing.sellerCommissionGstPaise,
    sellerPayoutPaise: pricing.sellerPayoutPaise,
    gstRatePercent: pricing.gstRatePercent,
    handlingChargeConfigPaise: pricing.handlingChargeConfigPaise,
    platformFeeConfigPaise: pricing.platformFeeConfigPaise,
    gstRateConfigPercent: pricing.gstRateConfigPercent,
    sellerCommissionConfigPercent: pricing.sellerCommissionConfigPercent,
  };

  // We skip calculateDeliveryQuoteAction here because it requires an Action ctx (for fetch and runQuery), and this is a mutation.
  // The frontend already verified the delivery fee, so we just use basic defaults for snapshot metadata.
  // The delivery fee the customer was charged IS the courier's quote: checkout
  // prices delivery from Porter's get_quote and passes it through unchanged.
  // So it is the best available estimate of the trip's cost — this used to be
  // a flat ₹90 whatever the distance. Porter's real fare replaces it later.
  let quote = { serviceable: true, estimatedCourierCost: session.deliveryFee, estimatedPorterCost: session.deliveryFee, distanceKm: 5.5, etaMinutes: 45, customerPaidFee: session.deliveryFee };

  const orderSnapshot = {
    boutiqueName,
    boutiqueId,
    items: session.items.map(item => {
      const resolvedId = resolvedProductMap.get(item.productId) ?? (item.productId as Id<"products">);
      return {
        productId: resolvedId,
        productName: item.name,
        size: item.size,
        sku: `SKU-${orderNumber}-${resolvedId}-${item.size}`,
        priceAtPurchase: item.price,
        quantity: item.quantity,
      };
    }),
    deliveryFee: session.deliveryFee,
    commissionRate,
    addressSnapshot: session.addressSnapshot,
    orderValue: session.total,
    platformCommissionAmount,
    platformCommissionRate: commissionRate,
    courierQuote: {
      estimatedPorterCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 9000,
      estimatedCourierCost: quote.estimatedCourierCost ?? 9000,
      distanceKm: quote.distanceKm,
      etaMinutes: quote.etaMinutes,
    },
    merchantOperatingModel: boutique ? (boutique.sellerModel || "boutique") : "boutique",
    payoutHoldDays: 7,
    taxBreakdown: {
      gstOnCommission,
    },
    courierCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 9000,
    actualCourierCost: 0,
    commissionAmount: platformCommissionAmount,
    gstAmount: gstOnCommission,
    merchantPayable,
  };

  const pickupAddress = boutique ? {
    boutiqueName: boutique.boutiqueName || boutique.name || "Boutique Pickup Center",
    ownerName: boutique.ownerName || "Boutique Owner",
    email: boutique.email || boutique.ownerEmail || "",
    phone: boutique.phone || "7356019103",
    address: boutique.address || "No Address",
    latitude: boutique.latitude || 0,
    longitude: boutique.longitude || 0,
    city: boutique.addressDetails?.city,
    state: boutique.addressDetails?.state,
    pincode: boutique.addressDetails?.pincode,
    area: boutique.area,
  } : undefined;

  // Snapshot return & exchange eligibility now — the payout hold reads this, and it must
  // not change if the seller later switches their store to Final Sale.
  const returnPolicyItems = orderSnapshot.items.map((i) => ({ productId: i.productId, boutiqueId }));
  const returnsAccepted = await resolveOrderReturnsAccepted(
    ctx.db,
    boutiqueId,
    returnPolicyItems
  );
  const exchangesAccepted = await resolveOrderExchangesAccepted(ctx.db, boutiqueId, returnPolicyItems);

  const orderId = await ctx.db.insert("orders", {
    orderNumber,
    customerId: user._id,
    boutiqueId,
    boutiqueName,
    status: "pending_confirmation",
    returnsAccepted,
    exchangesAccepted,
    deliveryAddress: session.addressSnapshot,
    pickupAddress,
    addressId: session.addressId,
    subtotal: session.subtotal,
    deliveryFee: session.deliveryFee,
    discount: session.discount,
    total: session.total,
    commissionAmount: platformCommissionAmount,
    paymentStatus: "paid",
    placedDuringClosedHours: session.placedDuringClosedHours,
    paymentId: payment?._id,
    checkoutSessionId: args.checkoutSessionId, // Required identifier
    notes: `CheckoutSession: ${args.checkoutSessionId}`,
    pricingSnapshot,
    orderSnapshot,
    // v3: no Route transfer at payment time. Seller payout unlocks only after
    // Porter confirms delivery.
    payoutStatus: "not_eligible",
    createdAt: now,
    updatedAt: now,
  });


  // Write default records to deliverySubsidyLedger and deliveryPerformanceLedger for online checkout
  try {
    await ctx.db.insert("deliverySubsidyLedger", {
      orderId,
      cartSubtotal: session.subtotal,
      customerPaidFee: session.deliveryFee,
      estimatedPorterCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 0,
      estimatedCourierCost: quote.estimatedCourierCost ?? 0,
      actualPorterCost: 0,
      actualCourierCost: 0,
      subsidyAmount: 0,
      subsidyPercent: 0,
      gatewayFee: Math.round(session.total * 0.02),
      refundAmount: 0,
      createdAt: now,
    });

    await ctx.db.insert("deliveryPerformanceLedger", {
      orderId,
      estimatedDistance: quote.distanceKm,
      actualDistance: 0,
      estimatedEta: quote.etaMinutes,
      actualEta: 0,
      estimatedCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 0,
      actualCost: 0,
      deliveredOnTime: false,
      delayResponsibility: "none",
      createdAt: now,
    });
  } catch (err) {
    console.error("[OnlineLedgerAccrual] Failed to create delivery subsidy/performance ledgers:", err);
  }

  if (payment) {
    await ctx.db.patch(payment._id, { orderId });
    // Update linked paymentEvents orderId references
    const createdEvent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
      .filter((q) => q.eq("eventType", "created"))
      .first();
    if (createdEvent) {
      await ctx.db.patch(createdEvent._id, { orderId });
    }

    const capturedEvent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
      .filter((q) => q.eq("eventType", "captured"))
      .first();
    if (capturedEvent) {
      await ctx.db.patch(capturedEvent._id, { orderId });
    }
  }

  // Create order items
  for (const item of session.items) {
    await ctx.db.insert("orderItems", {
      orderId,
      productId: item.productId as Id<"products">,
      variantId: item.productId as Id<"products">,
      boutiqueId,
      productName: item.name,
      variantSize: item.size,
      imageUrl: item.imageUrl,
      sku: `SKU-${orderNumber}-${item.productId}-${item.size}`,
      priceAtPurchase: item.price,
      basePriceAtPurchase: (item as any).basePriceAtPurchase,
      platformMarkupRateAtPurchase: (item as any).platformMarkupRateAtPurchase,
      platformFeeRateAtPurchase: (item as any).platformFeeRateAtPurchase,
      platformMarkupAmount: (item as any).platformMarkupAmount,
      platformFeeAmount: (item as any).platformFeeAmount,
      fixedPlatformFeeAtPurchase: (item as any).fixedPlatformFeeAtPurchase ?? 700,
      gstAmountAtPurchase: (item as any).gstAmountAtPurchase,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
    });

    if ((item as any).reservationId) {
      const reservation = await ctx.db.get((item as any).reservationId as Id<"reservations">);
      if (reservation) {
        await ctx.db.patch(reservation._id, {
          status: "order_confirmed",
          orderId,
          paymentCompletedAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // Create Invoice
  const invoiceNumber = `INV-${now}-${Math.floor(1000 + Math.random() * 9000)}`;
  const transactionId = `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const profile = await ctx.db
    .query("customerProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  const customerName = profile?.displayName || user.email || "Hive Customer";

  await ctx.db.insert("invoices", {
    invoiceNumber,
    orderId,
    orderNumber,
    userId: user._id,
    transactionId,
    customerName,
    customerEmail: user.email || "",
    customerPhone: session.addressSnapshot.phone || "",
    billingAddress: {
      line1: session.addressSnapshot.houseNumber
        ? `${session.addressSnapshot.houseNumber}, ${session.addressSnapshot.line1 || session.addressSnapshot.formattedAddress || ""}`
        : (session.addressSnapshot.line1 || session.addressSnapshot.formattedAddress || ""),
      line2: session.addressSnapshot.line2 || session.addressSnapshot.landmark,
      city: session.addressSnapshot.city,
      state: session.addressSnapshot.state,
      pincode: session.addressSnapshot.pincode,
    },
    shippingAddress: {
      line1: session.addressSnapshot.houseNumber
        ? `${session.addressSnapshot.houseNumber}, ${session.addressSnapshot.line1 || session.addressSnapshot.formattedAddress || ""}`
        : (session.addressSnapshot.line1 || session.addressSnapshot.formattedAddress || ""),
      line2: session.addressSnapshot.line2 || session.addressSnapshot.landmark,
      city: session.addressSnapshot.city,
      state: session.addressSnapshot.state,
      pincode: session.addressSnapshot.pincode,
    },
    items: session.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      productImage: item.imageUrl,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.price * item.quantity,
    })),
    subtotal: session.subtotal,
    deliveryFee: session.deliveryFee,
    discount: session.discount,
    tax: 0,
    totalAmount: session.total,
    paymentMethod: session.paymentMethod,
    paymentStatus: "paid",
    generatedAt: now,
  });

  // Complete Checkout Session
  await ctx.db.patch(args.checkoutSessionId, { status: "completed" });

  // Customer gets order confirmed email directly
  await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
    orderId,
    event: "confirmed",
  });

  // Clear cart items
  const cartItemsToDelete = await ctx.db
    .query("cartItems")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .take(200);
  for (const ci of cartItemsToDelete) {
    await ctx.db.delete(ci._id);
  }

  // Increment boutique's daily active order count O(1)
  await incrementBoutiqueOrderCount(ctx, boutiqueId, now);

  // Calculate net payout for merchant
  const netPayoutRupees = (orderSnapshot.merchantPayable / 100);

  // 1. Always trigger Resend email notification to boutique owner & designated staff
  await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
    orderId,
    event: "new_order",
  });

  // 2. Dispatch WhatsApp notification to Owner and Configured Staff (hive_merchant_new_order)
  const isWhatsAppEnabled = boutique?.whatsAppNotificationsEnabled ?? true;
  const recipientPhone = boutique?.notificationPhone || boutique?.phone;

  if (isWhatsAppEnabled) {
    // Send to Store Owner
    if (recipientPhone) {
      await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
        recipient: recipientPhone,
        templateName: "hive_merchant_new_order",
        parameters: [
          boutique.ownerName || "Merchant",
          orderNumber,
        ],
        languageCode: "en",
      });
    }

    // Send to Configured Staff Member(s)
    const staffSelection = (boutique as any)?.staffNotificationSelection;
    const shouldSendStaff1 = (staffSelection === "staff1" || staffSelection === "both" || staffSelection === "all") && (boutique as any)?.staffPhone1;
    const shouldSendStaff2 = (staffSelection === "staff2" || staffSelection === "both" || staffSelection === "all") && (boutique as any)?.staffPhone2;

    if (shouldSendStaff1) {
      await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
        recipient: (boutique as any).staffPhone1,
        templateName: "hive_merchant_new_order",
        parameters: [
          "Store Staff",
          orderNumber,
        ],
        languageCode: "en",
      });
    }

    if (shouldSendStaff2) {
      await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
        recipient: (boutique as any).staffPhone2,
        templateName: "hive_merchant_new_order",
        parameters: [
          "Store Staff",
          orderNumber,
        ],
        languageCode: "en",
      });
    }
  }

  // Dispatch background Web Push notification to boutique sellers / staff
  await ctx.scheduler.runAfter(0, internal.pushActions.sendOrderPushToBoutique, {
    boutiqueId,
    title: `New Order: Net Payout ₹${netPayoutRupees.toFixed(2)}! 🎉`,
    body: `New order ${orderNumber} placed for ${session.items.length} item(s).`,
    netPayout: netPayoutRupees,
    url: "/boutique/orders",
  });

  // Consume any exchange coupon that funded this order, and refund the
  // remainder if the new order came in under the credit's value.
  await applyCouponToOrder(ctx, session, orderId, payment?.amount ?? 0, now);

  // Record promo coupon usage if applied
  if (session.promoCouponId) {
    try {
      // session.discount is already paise (initCheckoutSessionInternal stores pricing.discountPaise).
      const discountPaise = session.promoCouponDiscountPaise ?? (session.discount || 0);
      await recordPromoCouponUsageHelper(ctx, {
        promoCouponId: session.promoCouponId,
        userId: user._id,
        orderId,
        orderNumber,
        discountAppliedPaise: discountPaise,
      });
    } catch (err) {
      console.error("[verifyPaymentAndPlaceOrderInternal] Failed to record promo coupon usage:", err);
    }
  }

  // v3: create the seller's Route transfer now, held indefinitely
  // (on_hold=true, no on_hold_until). The money is frozen in the seller's linked
  // account and cannot be withdrawn, which is what makes a later return reversal
  // reliable. Delivery then releases it (Final Sale) or sets a 24h on_hold_until
  // (returns-accepted sellers). razorpayTransferId is stamped by that action, not
  // here — the hold state is what the settlement path reads.
  await ctx.scheduler.runAfter(0, internal.razorpayRoute.createHeldSellerTransfer, {
    orderId,
  });

  // 10-minute ops warning if the seller still hasn't accepted.
  //
  // This timer used to be scheduled from orders.placeOrder, which now throws on
  // its first line (COD is unsupported) and has no callers — so on the live
  // order path it stopped firing entirely, and nothing told ops that an order
  // was sitting unaccepted.
  //
  // Deliberately only the "warning" alert. The 45-minute auto-cancel is already
  // owned by the sweep_unaccepted_orders_sla cron; scheduling checkOrderAcceptanceSLA's
  // "auto_cancel" here as well would race two mechanisms that cancel the same
  // order with different customer-facing side effects.
  //
  // The handler re-reads the order and returns early unless it is still
  // pending_confirmation, so a seller who accepts inside 10 minutes triggers
  // no alert.
  await ctx.scheduler.runAfter(
    10 * 60 * 1000,
    internal.orders.checkOrderAcceptanceSLA,
    { orderId, alertType: "warning" }
  );

  return { success: true, orderId, orderNumber };
}

/**
 * @deprecated Kept only so a customer's already-loaded (older PWA) checkout page
 * can still place its order. New clients call confirmPaymentAndPlaceOrder, which
 * also confirms the payment with Razorpay. Remove once old bundles have aged out.
 */
export const verifyPaymentAndPlaceOrder = mutation({
  args: {
    checkoutSessionId: v.id("checkoutSessions"),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await verifyPaymentAndPlaceOrderInternal(ctx, args);
  },
});

/** Save Razorpay's fee on a captured payment. Idempotent; ignores missing values. */
export const recordGatewayFee = internalMutation({
  args: {
    razorpayOrderId: v.string(),
    feePaise: v.optional(v.number()),
    taxPaise: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (typeof args.feePaise !== "number") return { success: false, reason: "no_fee" };
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .first();
    if (!payment) return { success: false, reason: "payment_not_found" };
    if (payment.gatewayFeePaise === args.feePaise && payment.gatewayTaxPaise === args.taxPaise) {
      return { success: true, reason: "unchanged" };
    }
    await ctx.db.patch(payment._id, {
      gatewayFeePaise: args.feePaise,
      gatewayTaxPaise: typeof args.taxPaise === "number" ? args.taxPaise : undefined,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const listCapturedPaymentsMissingFee = internalQuery({
  args: {},
  handler: async (ctx) => {
    const captured = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "captured"))
      .collect();
    const refunded = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "refunded"))
      .collect();
    return [...captured, ...refunded]
      .filter((p) => p.gatewayFeePaise === undefined && p.razorpayOrderId && p.razorpayPaymentId?.startsWith("pay_"))
      .slice(0, 200)
      .map((p) => ({ razorpayOrderId: p.razorpayOrderId!, razorpayPaymentId: p.razorpayPaymentId! }));
  },
});

/**
 * Fill in Razorpay's fee for payments captured before fees were recorded.
 * Read-only at Razorpay. Safe to run repeatedly; handles 200 per run.
 */
export const backfillGatewayFees = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return { ok: false, reason: "razorpay_not_configured" };
    const authHeader = "Basic " + btoa(`${keyId}:${keySecret}`);

    const rows: Array<{ razorpayOrderId: string; razorpayPaymentId: string }> =
      await ctx.runQuery(internal.payments.listCapturedPaymentsMissingFee, {});
    let recorded = 0;
    const failed: string[] = [];
    for (const row of rows) {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${row.razorpayPaymentId}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) {
        failed.push(`${row.razorpayPaymentId}: ${res.status}`);
        continue;
      }
      const p = await res.json();
      const result: any = await ctx.runMutation(internal.payments.recordGatewayFee, {
        razorpayOrderId: row.razorpayOrderId,
        feePaise: typeof p.fee === "number" ? p.fee : undefined,
        taxPaise: typeof p.tax === "number" ? p.tax : undefined,
      });
      if (result?.success) recorded++;
    }
    return { ok: true, checked: rows.length, recorded, failed };
  },
});

export const placeVerifiedOrderInternal = internalMutation({
  args: {
    checkoutSessionId: v.id("checkoutSessions"),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await verifyPaymentAndPlaceOrderInternal(ctx, args);
  },
});

export const getSessionPaymentExpectation = internalQuery({
  args: { checkoutSessionId: v.id("checkoutSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.checkoutSessionId);
    if (!session) return null;
    return {
      razorpayOrderId: session.razorpayOrderId,
      expectedAmountPaise: session.customerPayablePaise ?? session.total,
    };
  },
});

/** Shown when Razorpay has the payment but the bank has not finished it yet. */
export const PAYMENT_STILL_CONFIRMING =
  "Your payment is still being confirmed by your bank. Your order will appear in My Orders within a few minutes. Please don't pay again.";

/**
 * Place the order after the customer pays, once Razorpay itself confirms it.
 *
 * The signature (checked again in the mutation) proves the receipt is genuine,
 * but not that the money arrived. This asks Razorpay for the payment and
 * requires: it belongs to this checkout's Razorpay order, it is for exactly
 * what the customer owes, and it is captured. A payment still `authorized`
 * (auto-capture pending) is re-checked briefly; if it is still not captured the
 * customer is told it is confirming, and the payment.captured webhook places the
 * order when it lands. Mock orders (no Razorpay keys, non-prod) skip the check.
 */
export const confirmPaymentAndPlaceOrder = action({
  args: {
    checkoutSessionId: v.id("checkoutSessions"),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const expectation: any = await ctx.runQuery(internal.payments.getSessionPaymentExpectation, {
      checkoutSessionId: args.checkoutSessionId,
    });
    if (!expectation) {
      throw new ConvexError("Invalid checkout session details.");
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const isMockOrder = String(expectation.razorpayOrderId || "").startsWith("order_mock_");
    let paymentFee: { fee?: number; tax?: number } | null = null;

    if (!isMockOrder) {
      if (!keyId || !keySecret) {
        throw new ConvexError("Payments are not configured. Please contact support.");
      }
      const authHeader = "Basic " + btoa(`${keyId}:${keySecret}`);

      let payment: any = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(args.razorpayPaymentId)}`,
          { headers: { Authorization: authHeader } }
        );
        if (!res.ok) {
          console.error(
            `[confirmPaymentAndPlaceOrder] Razorpay payment lookup failed (${res.status}) for ${args.razorpayPaymentId}: ${(await res.text()).slice(0, 300)}`
          );
          if (res.status === 400 || res.status === 404) {
            // Razorpay says this payment id does not exist. (401/403 is our own
            // key problem, not the customer's payment: treat as confirming.)
            throw new ConvexError("We couldn't find this payment. If money was taken from your account, please contact support.");
          }
          // Razorpay unavailable; the payment.captured webhook will place the order.
          throw new ConvexError(PAYMENT_STILL_CONFIRMING);
        }
        payment = await res.json();
        if (payment.status !== "authorized") break;
      }

      if (payment.order_id !== expectation.razorpayOrderId) {
        console.error(
          `[confirmPaymentAndPlaceOrder][ALERT] Payment ${args.razorpayPaymentId} belongs to ${payment.order_id}, not ${expectation.razorpayOrderId}.`
        );
        throw new ConvexError("This payment does not match your order. Please contact support.");
      }
      if (payment.amount !== expectation.expectedAmountPaise) {
        console.error(
          `[confirmPaymentAndPlaceOrder][ALERT] Payment ${args.razorpayPaymentId} is ${payment.amount} paise, checkout expected ${expectation.expectedAmountPaise}.`
        );
        throw new ConvexError("This payment does not match your order total. Please contact support.");
      }
      if (payment.status === "authorized") {
        throw new ConvexError(PAYMENT_STILL_CONFIRMING);
      }
      if (payment.status !== "captured") {
        throw new ConvexError("This payment was not completed. You have not been charged for this order.");
      }
      paymentFee = {
        fee: typeof payment.fee === "number" ? payment.fee : undefined,
        tax: typeof payment.tax === "number" ? payment.tax : undefined,
      };
    }

    const placed = await ctx.runMutation(internal.payments.placeVerifiedOrderInternal, args);
    if (paymentFee) {
      await ctx.runMutation(internal.payments.recordGatewayFee, {
        razorpayOrderId: expectation.razorpayOrderId,
        feePaise: paymentFee.fee,
        taxPaise: paymentFee.tax,
      });
    }
    return placed;
  },
});

/**
 * The payment method (upi/card/netbanking/wallet/emi) from the customer's most recent
 * captured payment, so checkout can show "Pay using UPI" and prefill Razorpay straight to
 * that tab instead of always opening the full method picker.
 */
// Only these are real Razorpay payment methods — the client-side verify path stamps a
// generic "online" placeholder onto `payments.method` before the webhook (which carries the
// true method) lands, so anything outside this set is that placeholder, not a method to show.
const KNOWN_PAYMENT_METHODS = new Set(["upi", "card", "netbanking", "wallet", "emi"]);

export const getLastUsedPaymentMethod = query({
  args: {
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // getCurrentUserOrNull, not getAuthenticatedUser: this query fires unconditionally on
    // checkout load, including the brief window before the client's auth token has attached
    // (or for a guest). Throwing there surfaced as a live production error — an absent
    // remembered method is just "don't show the row," not a failure.
    const user = await getCurrentUserOrNull(ctx, args.token);
    if (!user) return null;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_customerId", (q) => q.eq("customerId", user._id))
      .filter((q) => q.eq(q.field("status"), "captured"))
      .order("desc")
      .take(20);

    const lastWithMethod = payments.find((p) => p.method && KNOWN_PAYMENT_METHODS.has(p.method));
    return lastWithMethod?.method ?? null;
  },
});

/**
 * Place an order that an exchange coupon covers in full.
 *
 * There is no Razorpay payment here — the customer owes nothing, and the money
 * funding the order is already in Hive's balance from the transfer that was
 * reversed when the exchange completed. The coupon is the authorisation, and
 * it is re-validated and consumed under a single-use guard during placement.
 */
export const placeCouponFundedOrder = mutation({
  args: {
    checkoutSessionId: v.id("checkoutSessions"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const session = await ctx.db.get(args.checkoutSessionId);

    if (!session || session.userId !== user._id) {
      throw new ConvexError("Checkout session not found.");
    }
    if (!session.couponId) {
      throw new ConvexError("This checkout has no coupon applied.");
    }
    // Mirrors the checkout action: anything under Razorpay's ₹1 floor is
    // treated as fully covered, because no payment could have been collected.
    if ((session.customerPayablePaise ?? session.total) >= 100) {
      throw new ConvexError(
        "This order still has an amount payable. Complete the payment instead."
      );
    }

    return await verifyPaymentAndPlaceOrderInternal(ctx, {
      checkoutSessionId: args.checkoutSessionId,
      razorpayPaymentId: `coupon_${session.couponId}`,
      razorpaySignature: "",
      token: args.token,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: cleanExpiredCheckoutSessions (Internal background sweep)
// ─────────────────────────────────────────────────────────────────────────────
export const cleanExpiredCheckoutSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pendingSessions = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(100);

    const processingSessions = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "processing"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(100);

    const expiredSessions = [...pendingSessions, ...processingSessions].slice(0, 100);

    let expiredCount = 0;
    for (const session of expiredSessions) {
      await ctx.db.patch(session._id, { status: "expired" });
      expiredCount++;

      // Restore reserved stock levels for this session using the shared helper
      await restoreCheckoutSessionStock(ctx, session);

      const payment = await ctx.db
        .query("payments")
        .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", session.razorpayOrderId))
        .first();

      if (payment && (payment.status === "created" || payment.status === "pending" || payment.status === "initiated")) {
        await ctx.db.patch(payment._id, { status: "failed", updatedAt: now });
        await ctx.db.insert("paymentEvents", {
          source: "razorpay",
          paymentId: payment._id,
          eventType: "failed",
          payload: JSON.stringify({ reason: "Checkout session expired via cron sweep" }),
          createdAt: now,
        });
      }
    }

    console.log(`[SweepCheckoutSessions] Expired ${expiredCount} pending checkout sessions.`);
    return { expiredCount };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: updateCheckoutSessionWithRazorpayOrderId (Internal Mutation)
// ─────────────────────────────────────────────────────────────────────────────
export const updateCheckoutSessionWithRazorpayOrderId = internalMutation({
  args: {
    checkoutSessionId: v.id("checkoutSessions"),
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    razorpayTransferId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("created"), v.literal("failed"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.checkoutSessionId, {
      razorpayOrderId: args.razorpayOrderId,
    });

    const paymentPatch: any = {
      razorpayOrderId: args.razorpayOrderId,
      status: args.status || "created",
      updatedAt: now,
    };
    if (args.razorpayTransferId) {
      paymentPatch.razorpayTransferId = args.razorpayTransferId;
    }
    await ctx.db.patch(args.paymentId, paymentPatch);

    await ctx.db.insert("paymentEvents", {
      source: "razorpay",
      paymentId: args.paymentId,
      eventType: args.status || "created",
      payload: JSON.stringify({ razorpayOrderId: args.razorpayOrderId }),
      createdAt: now,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Action: createCheckoutSession
// ─────────────────────────────────────────────────────────────────────────────
export const createCheckoutSession = action({
  args: {
    addressId: v.id("addresses"),
    deliveryDate: v.string(),
    deliverySlot: v.string(),
    paymentMethod: v.string(),
    items: v.array(cartItemArg),
    subtotal: v.number(),
    deliveryFee: v.number(),
    discount: v.number(),
    total: v.number(),
    promoCode: v.optional(v.string()),
    /** Exchange store credit. Reduces what is charged, not the order's value. */
    couponCode: v.optional(v.string()),
    /** Admin promo coupon from promoCoupons table. */
    promoCouponId: v.optional(v.id("promoCoupons")),
    promoCouponDiscountPaise: v.optional(v.number()),
    token: v.optional(v.string()),
    quotedAt: v.optional(v.number()),
    quoteId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let userSubject: string | undefined = undefined;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      userSubject = identity.subject;
    }

    let initResult: any = null;
    try {
      // 1. Initialize checkout records and validate cart details
      initResult = await ctx.runMutation(internal.payments.initCheckoutSessionInternal as any, {
        ...args,
        userSubject,
      });
    } catch (err: any) {
      console.error("[createCheckoutSession] Init mutation failed:", err.message || err);
      const errMsg = err?.data?.message || err?.message || String(err);
      throw new ConvexError(errMsg);
    }


    // An exchange coupon covering the order outright leaves nothing to charge,
    // and the funding money is already in Hive's balance from the reversed
    // transfer. The client places these through placeCouponFundedOrder.
    //
    // Razorpay refuses any order below ₹1, so a coupon that leaves a few paise
    // outstanding would fail the same way. Hive absorbs that remainder rather
    // than failing the checkout or rounding the customer up.
    const RAZORPAY_MIN_CHARGE_PAISE = 100;
    const payablePaise = initResult.customerPayablePaise ?? initResult.totalPaise;
    if (payablePaise < RAZORPAY_MIN_CHARGE_PAISE) {
      const couponOrderRef = `coupon_${String(initResult.checkoutSessionId)}`;
      await ctx.runMutation(internal.payments.updateCheckoutSessionWithRazorpayOrderId as any, {
        checkoutSessionId: initResult.checkoutSessionId,
        paymentId: initResult.paymentId,
        razorpayOrderId: couponOrderRef,
        status: "created",
      });

      return {
        checkoutSessionId: initResult.checkoutSessionId,
        razorpayOrderId: couponOrderRef,
        paymentId: initResult.paymentId,
        customerPayablePaise: 0,
        couponAppliedPaise: initResult.couponAppliedPaise ?? 0,
      };
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Check if running in mock/demo mode or if credentials are set to mock defaults / missing
    const isMock =
      !keyId ||
      !keySecret ||
      keySecret === "mock_secret" ||
      keySecret === "YOUR_RAZORPAY_SECRET" ||
      keyId === "rzp_test_mock" ||
      keyId === "YOUR_RAZORPAY_KEY_ID";

    if (isMock) {
      console.log("[createCheckoutSession] Running in mock/offline payment mode.");
      // Offline fallback: Generate simulated Razorpay Order ID
      const razorpayOrderId = `order_mock_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      await ctx.runMutation(internal.payments.updateCheckoutSessionWithRazorpayOrderId as any, {
        checkoutSessionId: initResult.checkoutSessionId,
        paymentId: initResult.paymentId,
        razorpayOrderId,
        status: "created",
      });

      return {
        checkoutSessionId: initResult.checkoutSessionId,
        razorpayOrderId,
        paymentId: initResult.paymentId,
        customerPayablePaise: initResult.customerPayablePaise ?? initResult.totalPaise,
        couponAppliedPaise: initResult.couponAppliedPaise ?? 0,
      };
    }

    try {
      const authHeader = "Basic " + btoa(`${keyId}:${keySecret}`);

      // v2: Plain Razorpay order without Route transfers.
      // Seller payout is created AFTER delivery via separate transfer API.
      const safeReceipt = String(initResult.checkoutSessionId).slice(0, 40);
      const orderPayload: Record<string, any> = {
        // Charge only what the customer still owes. The coupon-funded portion
        // is already in Hive's balance and must not be collected again.
        amount:
          initResult.customerPayablePaise ??
          initResult.totalPaise ??
          Math.round(initResult.total * 100),
        currency: "INR",
        receipt: safeReceipt,
        notes: {
          checkoutSessionId: String(initResult.checkoutSessionId),
          customerEmail: String(initResult.userEmail || ""),
          customerPhone: String(initResult.userPhone || ""),
        },
      };

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[createCheckoutSession] Razorpay API error status ${response.status}:`, errBody);
        throw new ConvexError(`Razorpay returned status ${response.status}: ${errBody}`);
      }

      const orderData = await response.json();
      const razorpayOrderId = orderData.id;

      await ctx.runMutation(internal.payments.updateCheckoutSessionWithRazorpayOrderId as any, {
        checkoutSessionId: initResult.checkoutSessionId,
        paymentId: initResult.paymentId,
        razorpayOrderId,
        status: "created",
      });

      return {
        checkoutSessionId: initResult.checkoutSessionId,
        razorpayOrderId,
        paymentId: initResult.paymentId,
        customerPayablePaise: initResult.customerPayablePaise ?? initResult.totalPaise,
        couponAppliedPaise: initResult.couponAppliedPaise ?? 0,
      };
    } catch (err: any) {
      console.error("[RazorpayOrderCreation] API request failed:", err.message || err);

      // Update checkout session and payment records to failed state
      if (initResult) {
        await ctx.runMutation(internal.payments.updateCheckoutSessionWithRazorpayOrderId as any, {
          checkoutSessionId: initResult.checkoutSessionId,
          paymentId: initResult.paymentId,
          razorpayOrderId: "FAILED_CREATION",
          status: "failed",
        });
      }
      const errMsg = err?.data?.message || err?.message || String(err);
      throw new ConvexError(`Payment gateway creation failed: ${errMsg}`);
    }
  },
});


/**
 * Fetches up to 10 pending refund queue items for batch processing.
 */
export const getPendingRefunds = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("refundQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(10);
  },
});

/**
 * Atomically marks a refund queue item as processing to prevent concurrent refund attempts.
 */
export const startProcessingRefund = internalMutation({
  args: { refundQueueId: v.id("refundQueue") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.refundQueueId);
    if (!item) throw new ConvexError("Refund queue item not found");

    if (item.status === "processing" || item.status === "completed") {
      throw new ConvexError("Refund is already being processed or is completed.");
    }

    await ctx.db.patch(args.refundQueueId, {
      status: "processing",
      processedAt: Date.now(),
    });
  }
});

/**
 * Marks a refund queue item as completed or failed with processedAt timestamp.
 * On success, also updates the associated payment record and creates a refundLedger entry.
 */
export const completeRefundQueueItem = internalMutation({
  args: {
    refundQueueId: v.id("refundQueue"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
    razorpayRefundId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.refundQueueId);
    if (!item) throw new ConvexError("Refund queue item not found");

    const now = Date.now();

    await ctx.db.patch(args.refundQueueId, {
      status: args.status,
      processedAt: now,
      ...(args.status === "failed" ? { lastError: args.error } : {}),
    });

    // Update the associated payment record
    const payment = await ctx.db.get(item.paymentId);
    if (payment) {
      if (args.status === "completed") {
        await ctx.db.patch(item.paymentId, {
          status: "refunded",
          refundId: args.razorpayRefundId,
          refundAmount: item.amountPaise,
          refundedAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(item.paymentId, {
          updatedAt: now,
        });
      }
    }

    // Create refundLedger entry on success
    if (args.status === "completed" && item.orderId) {
      const refundNumber = `REF-${new Date(now).toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
      await ctx.db.insert("refundLedger", {
        refundNumber,
        orderId: item.orderId,
        amount: item.amountPaise,
        status: "processed",
        refundType: "full_refund",
        razorpayRefundId: args.razorpayRefundId,
        notes: item.reason,
        createdAt: now,
      });
    }

    // Bring the order's own flags in line with what actually happened.
    //
    // `refundStatus` used to be left at "pending" forever on a refund that had
    // completed, and `transferStatus` still read "processed" even though
    // `reverse_all` had just reversed the seller's transfer. Both are what the
    // admin panel reads, so a fully refunded order displayed as a refund still
    // pending against a transfer still standing.
    if (item.orderId) {
      const order = await ctx.db.get(item.orderId);
      if (order) {
        if (args.status === "completed") {
          await ctx.db.patch(item.orderId, {
            paymentStatus: "refunded",
            refundStatus: "processed",
            // The refund carried `reverse_all` whenever a transfer existed, so
            // Razorpay has unwound the seller's share along with it.
            ...(order.razorpayTransferId
              ? {
                  transferStatus: "reversed" as const,
                  // The seller's share is back with Hive, so nothing is held
                  // for them any more. Leaving "withheld" here read as a payout
                  // still pending on a return that had already finished.
                  payoutStatus: "not_eligible" as const,
                  payoutHoldReason: "reversed_refunded",
                  payoutHoldUntil: undefined,
                }
              : {}),
            updatedAt: now,
          });
          // Cancel the seller's accrual too, or it turns payable a week later
          // for goods they have back.
          if (order.razorpayTransferId) {
            await cancelAccrualForReversal(ctx, item.orderId);
          }
        } else {
          // A failed refund leaves the customer owed money. Say so on the
          // order rather than leaving it reading "pending" indefinitely.
          await ctx.db.patch(item.orderId, {
            refundStatus: "failed",
            updatedAt: now,
          });
        }
      }
    }
  }
});

/**
 * Safely enqueues a refund queue item by checking idempotencyKey first.
 */
export const enqueueRefund = internalMutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.optional(v.id("orders")),
    reason: v.string(),
    amountPaise: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if a refund queue item already exists for this idempotencyKey
    const existing = await ctx.db
      .query("refundQueue")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("refundQueue", {
      paymentId: args.paymentId,
      orderId: args.orderId,
      reason: args.reason,
      amountPaise: args.amountPaise,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(),
    });
  }
});

/**
 * Background action that processes the refund queue by calling Razorpay's Refund API.
 * Runs as a cron every 5 minutes. Includes env-var guard to no-op gracefully
 * if Razorpay credentials are not yet configured.
 */
/**
 * Put a failed refund back in the queue.
 *
 * A refund that fails at Razorpay currently has no route back — it sits at
 * "failed" forever while the order claims to be refunded and the customer is
 * still owed the money. This is the recovery path for that, and it is the only
 * way to re-attempt one after the underlying cause has been fixed.
 *
 * Deliberately admin-gated and audited: re-queuing moves real money.
 */
/**
 * Refunds that failed at Razorpay and are still owed to a customer.
 *
 * These were previously invisible: the order reads "refunded" while the money
 * never left, so nothing in the admin panel showed the discrepancy.
 */
export const listFailedRefundsAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const failed = await ctx.db
      .query("refundQueue")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    return await Promise.all(
      failed.map(async (item) => {
        const order = item.orderId ? await ctx.db.get(item.orderId) : null;
        return {
          _id: item._id,
          amountPaise: item.amountPaise,
          reason: item.reason,
          lastError: item.lastError ?? null,
          createdAt: item.createdAt,
          orderNumber: (order as any)?.orderNumber ?? null,
        };
      })
    );
  },
});

export const retryFailedRefundAdmin = mutation({
  args: { refundQueueId: v.id("refundQueue") },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const item = await ctx.db.get(args.refundQueueId);
    if (!item) throw new ConvexError("Refund queue item not found");
    if (item.status !== "failed") {
      throw new ConvexError(`Only a failed refund can be retried. This one is ${item.status}.`);
    }

    await ctx.db.patch(args.refundQueueId, {
      status: "pending",
      lastError: undefined,
    });

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "refund.retried",
      entityType: "refundQueue",
      entityId: args.refundQueueId,
      metadata: JSON.stringify({
        amountPaise: item.amountPaise,
        previousError: String(item.lastError ?? "").slice(0, 300),
      }),
      createdAt: now,
    });

    return { success: true, amountPaise: item.amountPaise };
  },
});

/**
 * Look for a refund this queue item already created at Razorpay.
 *
 * A refund request can succeed at Razorpay while the response is lost (timeout,
 * dropped connection). The item was then marked failed and a retry refunded the
 * customer a second time. Every refund carries its queue item id in `notes`, so
 * asking Razorpay first makes a retry adopt the earlier refund instead.
 * `idempotencyKey` also matches refunds sent before `refundQueueId` was noted.
 */
export async function findExistingRazorpayRefund(
  authHeader: string,
  razorpayPaymentId: string,
  refundQueueId: string,
  idempotencyKey?: string
): Promise<{ ok: true; refund: any | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refunds?count=100`,
      { headers: { Authorization: authHeader } }
    );
    if (!res.ok) return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
    const data = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const refund = items.find(
      (r) =>
        r?.notes?.refundQueueId === refundQueueId ||
        (!!idempotencyKey && r?.notes?.idempotencyKey === idempotencyKey)
    );
    return { ok: true, refund: refund ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export const processRefundQueue = internalAction({
  args: {},
  handler: async (ctx) => {
    // ENV VAR GUARD: No-op if Razorpay credentials are not configured
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.warn("[RefundProcessor] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured. Skipping refund processing cycle.");
      return { processed: 0, skipped: true };
    }

    // Fetch pending refunds
    const pendingRefunds = await ctx.runMutation(internal.payments.getPendingRefunds);

    if (pendingRefunds.length === 0) {
      return { processed: 0, skipped: false };
    }

    let processedCount = 0;
    let failedCount = 0;

    for (const refundItem of pendingRefunds) {
      try {
        // Mark as processing (atomic lock)
        try {
          await ctx.runMutation(internal.payments.startProcessingRefund, {
            refundQueueId: refundItem._id,
          });
        } catch (lockErr) {
          console.warn(`[RefundProcessor] Skipping ${refundItem._id}, already locked:`, lockErr);
          continue; // don't mark as failed — another run owns this item
        }

        // Resolve the Razorpay payment ID from the payment record
        const payment = await ctx.runQuery(internal.payments.getPaymentById, {
          paymentId: refundItem.paymentId,
        });

        if (!payment?.razorpayPaymentId) {
          throw new ConvexError(`No razorpayPaymentId found for payment ${refundItem.paymentId}`);
        }

        // When the order's payment carries a Route transfer, part of the money
        // sits in the seller's linked account and is NOT refundable from ours.
        // Refunding the full amount without unwinding that first is rejected by
        // Razorpay with a bare "invalid request sent".
        //
        // `reverse_all` makes Razorpay reverse the transfers and refund the
        // customer in a single atomic call. Doing it as two separate steps —
        // reverse, then refund — races: the refund cron can fire before the
        // reversal has settled, which is exactly how a live return failed.
        let reverseAll = false;
        if (refundItem.orderId) {
          const relatedOrder: any = await ctx.runQuery(
            (internal.orders as any).getById,
            { id: refundItem.orderId }
          );
          reverseAll = !!relatedOrder?.razorpayTransferId;
        }

        const authHeader = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

        // Never refund twice: adopt a refund this item already created. If
        // Razorpay can't be asked, don't send — the item fails and retries later.
        const existing = await findExistingRazorpayRefund(
          `Basic ${authHeader}`,
          payment.razorpayPaymentId,
          String(refundItem._id),
          refundItem.idempotencyKey
        );
        if (!existing.ok) {
          throw new ConvexError(`Could not check existing refunds at Razorpay: ${existing.error}`);
        }
        if (existing.refund) {
          await ctx.runMutation(internal.payments.completeRefundQueueItem, {
            refundQueueId: refundItem._id,
            status: "completed",
            razorpayRefundId: existing.refund.id,
          });
          processedCount++;
          console.log(`[RefundProcessor] Refund ${refundItem._id} already exists at Razorpay (${existing.refund.id}); recorded without refunding again.`);
          continue;
        }

        // Call Razorpay Refund API
        const response = await fetch(
          `https://api.razorpay.com/v1/payments/${payment.razorpayPaymentId}/refund`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${authHeader}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: refundItem.amountPaise,
              ...(reverseAll ? { reverse_all: 1 } : {}),
              notes: {
                reason: refundItem.reason,
                orderId: refundItem.orderId ?? "N/A",
                idempotencyKey: refundItem.idempotencyKey ?? "",
                refundQueueId: String(refundItem._id),
              },
            }),
          }
        );

        if (!response.ok) {
          const errBody = await response.text();
          throw new ConvexError(`Razorpay refund API returned ${response.status}: ${errBody}`);
        }

        const refundData = await response.json();

        // Mark as completed with Razorpay refund ID
        await ctx.runMutation(internal.payments.completeRefundQueueItem, {
          refundQueueId: refundItem._id,
          status: "completed",
          razorpayRefundId: refundData.id,
        });

        processedCount++;
        console.log(`[RefundProcessor] Successfully processed refund ${refundItem._id} → Razorpay refund ${refundData.id}`);

      } catch (err: any) {
        console.error(`[RefundProcessor] Failed to process refund ${refundItem._id}:`, err.message);

        await ctx.runMutation(internal.payments.completeRefundQueueItem, {
          refundQueueId: refundItem._id,
          status: "failed",
          error: err.message || String(err),
        });

        failedCount++;
      }
    }

    console.log(`[RefundProcessor] Cycle complete: ${processedCount} processed, ${failedCount} failed out of ${pendingRefunds.length} pending.`);
    return { processed: processedCount, failed: failedCount };
  },
});

/**
 * Internal helper query to fetch a payment record by ID (used by processRefundQueue action).
 */
export const getPaymentById = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentId);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: prepareRetryCheckoutSessionInternal (Internal Mutation)
// ─────────────────────────────────────────────────────────────────────────────
export const prepareRetryCheckoutSessionInternal = internalMutation({
  args: { checkoutSessionId: v.id("checkoutSessions"), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.checkoutSessionId);
    if (!session) throw new ConvexError("Checkout session not found");

    const user = await getAuthenticatedUser(ctx, args.token);
    if (session.userId !== user._id) {
      throw new ConvexError("Unauthorized: Cannot retry this session");
    }

    if (session.status !== "failed" && session.status !== "expired") {
      throw new ConvexError(`Cannot retry session in status: ${session.status}`);
    }

    // Rate limiting: 3 retries per 15 mins
    await checkRateLimit(ctx, `retry_checkout:${user._id}`, 3, 15 * 60 * 1000);

    const now = Date.now();
    
    // Check stock
    for (const item of session.items) {
      const product = await ctx.db.get(item.productId as Id<"products">);
      const isMock = MOCK_INVENTORY[item.productId] !== undefined;
      if (!product && !isMock) {
        throw new ConvexError(`The item "${item.name}" is no longer available.`);
      }
      if (product) {
        const currentStock = product.stockBySize[item.size] ?? 0;
        if (currentStock < item.quantity) {
          throw new ConvexError(`Sorry, some items in your cart sold out while processing. Please review your cart.`);
        }
      }
    }

    // Deduct stock and record movements
    for (const item of session.items) {
      const product = await ctx.db.get(item.productId as Id<"products">);
      if (product) {
        const currentStock = product.stockBySize[item.size] ?? 0;
        const newStock = currentStock - item.quantity;
        const stockBySize = { ...product.stockBySize, [item.size]: newStock };
        
        const totalStock = Object.values(stockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
        await ctx.db.patch(product._id, {
          stockBySize,
          updatedAt: now,
          autoDeactivatedBecauseOutOfStock: totalStock <= 0,
        });

        await ctx.db.insert("inventoryMovements", {
          productId: product._id,
          boutiqueId: product.boutiqueId,
          size: item.size,
          beforeQty: currentStock,
          afterQty: newStock,
          adjustmentQty: -item.quantity,
          reason: "online_order",
          source: "checkout",
          createdBy: user._id,
          createdAt: now,
        });
      }
    }

    const newExpiresAt = now + 15 * 60 * 1000;
    
    await ctx.db.patch(session._id, {
      status: "processing",
      expiresAt: newExpiresAt,
    });
    
    const paymentId = await ctx.db.insert("payments", {
      customerId: user._id,
      paymentProvider: "razorpay",
      razorpayOrderId: undefined,
      amount: session.total,
      currency: "INR",
      status: "initiated",
      createdAt: now,
      updatedAt: now,
      webhookEvents: [],
    });

    await ctx.db.insert("paymentEvents", {
      source: "razorpay",
      paymentId,
      eventType: "initiated",
      payload: "Retry session initiated",
      createdAt: now,
    });

    const userDoc = await ctx.db.get(session.userId);

    return {
      checkoutSessionId: session._id,
      paymentId,
      totalPaise: session.total,
      userEmail: userDoc?.email || "",
      userPhone: session.addressSnapshot.phone || userDoc?.phone || "",
      paymentMethod: session.paymentMethod,
    };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: failRetryCheckoutSessionInternal (Internal Mutation)
// ─────────────────────────────────────────────────────────────────────────────
export const failRetryCheckoutSessionInternal = internalMutation({
  args: { checkoutSessionId: v.id("checkoutSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.checkoutSessionId);
    if (!session || session.status !== "processing") return;
    
    await restoreCheckoutSessionStock(ctx, session);
    await ctx.db.patch(session._id, { status: "failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Action: retryCheckoutSession
// ─────────────────────────────────────────────────────────────────────────────
export const retryCheckoutSession = action({
  args: { checkoutSessionId: v.id("checkoutSessions"), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const paymentsApi = (anyApi as any).payments;
    
    const initResult: any = await ctx.runMutation(paymentsApi.prepareRetryCheckoutSessionInternal, {
      checkoutSessionId: args.checkoutSessionId,
      token: args.token,
    });

    if (initResult.paymentMethod === "cod") {
       throw new ConvexError("COD sessions cannot be retried through this payment pipeline.");
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const isMock = !keySecret || keySecret === "mock_secret";

    if (isMock) {
      const razorpayOrderId = `order_mock_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      await ctx.runMutation(paymentsApi.updateCheckoutSessionWithRazorpayOrderId, {
        checkoutSessionId: args.checkoutSessionId,
        paymentId: initResult.paymentId,
        razorpayOrderId,
        status: "created",
      });

      return {
        checkoutSessionId: args.checkoutSessionId,
        razorpayOrderId,
        paymentId: initResult.paymentId,
      };
    }

    try {
      const authHeader = "Basic " + btoa(`${keyId}:${keySecret}`);

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          amount: Math.round(initResult.totalPaise),
          currency: "INR",
          receipt: initResult.checkoutSessionId,
          notes: {
            checkoutSessionId: initResult.checkoutSessionId,
            customerEmail: initResult.userEmail,
            customerPhone: initResult.userPhone,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new ConvexError(`Razorpay returned status ${response.status}: ${errBody}`);
      }

      const orderData = await response.json();
      const razorpayOrderId = orderData.id;

      await ctx.runMutation(paymentsApi.updateCheckoutSessionWithRazorpayOrderId, {
        checkoutSessionId: args.checkoutSessionId,
        paymentId: initResult.paymentId,
        razorpayOrderId,
        status: "created", // Wait, createCheckoutSession patches status to "created"? Let's check `createCheckoutSession` return. Actually it patches payment to "created".
      });

      return {
        checkoutSessionId: args.checkoutSessionId,
        razorpayOrderId,
        paymentId: initResult.paymentId,
      };
    } catch (err: any) {
      console.error("[RazorpayRetryCreation] API request failed:", err);

      await ctx.runMutation(paymentsApi.failRetryCheckoutSessionInternal, {
        checkoutSessionId: args.checkoutSessionId,
      });
      throw new ConvexError(`Payment gateway creation failed on retry: ${err.message || String(err)}`);
    }
  }
});

export function isSignatureBypassAllowed(enableDebugTools: string | undefined, razorpaySecret: string | undefined): boolean {
  // SECURITY: Never bypass signature verification in production
  const isProdDeployment = process.env.CONVEX_SITE_URL?.includes('standing-mosquito-377');
  if (isProdDeployment) {
    return false; // Production - always verify signatures
  }
  return enableDebugTools === "true" && razorpaySecret === "mock_secret";
}


