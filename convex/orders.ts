// convex/orders.ts
// Order placement, list, and detail queries for the HIVE customer app.
// All operations are auth-gated with ownership checks.

import { mutation, query, internalMutation, internalAction, action, internalQuery } from "./_generated/server";
import { triggerNotification } from "./lib/notifications";
import { v, ConvexError } from "convex/values";
import { getAuthenticatedUser, getMyBoutique, getCurrentUserOrNull, requireRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import { incrementBoutiqueOrderCount, decrementBoutiqueOrderCount } from "./lib/boutiqueCounters";
import { validateProductSizeAndStock, MOCK_INVENTORY } from "./lib/mockInventory";
import { internal, api } from "./_generated/api";
import { checkRateLimit } from "./lib/rateLimit";
import { assertExists } from "./lib/utils";
import { calculateDeliveryQuoteAction } from "./routing";
import { calculateItemFinancials, calculateStoreSettlement, calculateOrderTotals } from "./pricingService";
import { parseMoney, formatMoney } from "./lib/money";
import { checkKillSwitch } from "./lib/killSwitches";
import { validateBoutiqueOperationalLimits } from "./lib/gating";
import { resolveOrderReturnsAccepted, resolveOrderExchangesAccepted } from "./lib/returnPolicy";
import { getBoutiqueStatus } from "./shared/boutiqueStatus";
import { recordOrderActivity } from "./lib/orderActivity";
import { checkServiceability } from "./lib/serviceability";
import { refundCancelledOrder } from "./lib/refunds";
import { recordRoutePayoutInLedger } from "./lib/routeLedger";
import {
  buildCustomerPorterAddress,
  buildBoutiquePorterAddress,
  assertPorterAddressUsable,
} from "./lib/porterAddress";
// ─── Cart item input shape for order placement ────────────────────────────
const cartItemArg = v.object({
  productId:   v.string(),
  name:        v.string(),
  price:       v.number(),
  imageUrl:    v.string(),
  boutiqueName:v.string(),
  size:        v.string(),
  quantity:    v.number(),
  isPreorder:  v.optional(v.boolean()),
  scheduledProcessingDate: v.optional(v.string()),
});

// ─── Address snapshot shape (immutable at order time) ─────────────────────
const addressSnapshotArg = v.object({
  label:   v.string(),
  line1:   v.string(),
  line2:   v.optional(v.string()),
  city:    v.string(),
  state:   v.string(),
  pincode: v.string(),
  lat:     v.number(),
  lng:     v.number(),
});

/**
 * Place a new order.
 * Validates that user, address, and items exist.
 * Creates order + orderItems rows, then clears the cart.
 * Returns the new orderNumber string.
 */
export const placeOrder = mutation({
  args: {
    addressId:       v.id("addresses"),
    addressSnapshot: v.optional(v.any()), // Kept optional for legacy compatibility
    promoCode:       v.optional(v.string()), // Passed from checkout to enforce server validation
    deliveryDate:    v.string(),
    deliverySlot:    v.string(),
    paymentMethod:   v.string(),
    items:           v.array(cartItemArg),
    subtotal:        v.number(),
    deliveryFee:     v.number(),
    discount:        v.number(),
    total:           v.number(),
    token:           v.optional(v.string()),
    reservationId:   v.string(), // Enforce required identifier for COD checkouts
  },
  handler: async (ctx, args) => {
    throw new Error("Cash on Delivery (COD) is not supported.");
    
    // 1. Verify kill switches
    const isMaintenanceMode = await checkKillSwitch(ctx.db, "maintenanceMode");
    if (isMaintenanceMode) {
      throw new Error("Platform is currently undergoing scheduled maintenance.");
    }
    const isOrdersEnabled = await checkKillSwitch(ctx.db, "ordersEnabled");
    if (!isOrdersEnabled) {
      throw new Error("Order placement is temporarily disabled for maintenance.");
    }

    const user = await getAuthenticatedUser(ctx, args.token);

    if (args.paymentMethod !== "cod") {
      throw new Error("Online payment methods must use the Checkout Session pipeline.");
    }

    // COD Idempotency Check using the reservationId index
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_reservationId", (q) => q.eq("reservationId", args.reservationId))
      .first();
    if (existingOrder) {
      return { orderId: existingOrder!._id, orderNumber: existingOrder!.orderNumber };
    }

    // Rate limit checkout attempts: max 5 per user per 15 minutes
    await checkRateLimit(ctx, `checkout:${user._id}`, 5, 15 * 60 * 1000);

    // Verify address ownership
    const addr = assertExists(await ctx.db.get(args.addressId), "Delivery address record missing or deleted.");
    if (addr.userId !== user._id) {
      throw new Error("Invalid address");
    }

    if (addr.addressStatus !== "verified") {
      throw new Error("Address verification is pending or rejected. Please update your address to verify serviceability.");
    }

    if (args.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Coordinates Validation (P0 - Null Island block)
    if (
      addr.lat === undefined ||
      addr.lat === null ||
      Number.isNaN(addr.lat) ||
      !Number.isFinite(addr.lat) ||
      addr.lat === 0 ||
      addr.lng === undefined ||
      addr.lng === null ||
      Number.isNaN(addr.lng) ||
      !Number.isFinite(addr.lng) ||
      addr.lng === 0
    ) {
      throw new Error(
        "Address has invalid coordinates. Please select your location on the map."
      );
    }

    // Required Address Completeness Validation (P1)
    if (!addr.houseNumber || !addr.houseNumber!.trim()) {
      throw new Error("House/Flat Number is required for delivery.");
    }
    const finalPhone = addr.phone || user.phone;
    if (!finalPhone?.trim()) {
      throw new Error("Contact phone number is required for delivery hand-off.");
    }

    // Server-Side Promo Validation (P0)
    let expectedDiscount = 0;
    const cleanPromoCode = args.promoCode ? args.promoCode!.trim().toUpperCase() : "";
    if (cleanPromoCode) {
      if (cleanPromoCode === "WELCOME10") {
        expectedDiscount = Math.round(args.subtotal * 0.1);
      } else if (cleanPromoCode === "HIVEFIRST") {
        expectedDiscount = Math.min(500, args.subtotal);
      } else if (cleanPromoCode === "FREESHIP") {
        expectedDiscount = 0;
      } else {
        throw new Error("Invalid promotional coupon code.");
      }
    }
    if (args.discount !== expectedDiscount) {
      throw new Error(
        `Promotional discount validation failed. Expected: ₹${expectedDiscount}, Got: ₹${args.discount}`
      );
    }

    // Compile deliveryAddress snapshot on Server (P0)
    const compiledAddressSnapshot = {
      label:            addr.label,
      line1:            addr.line1,
      line2:            addr.line2,
      formattedAddress: addr.formattedAddress,
      houseNumber:      addr.houseNumber,
      landmark:         addr.landmark,
      city:             addr.city,
      state:            addr.state,
      pincode:          addr.pincode,
      lat:              addr.lat,
      lng:              addr.lng,
      phone:            finalPhone,
      locality:         addr.locality,
      receiverName:         addr.receiverName,
      deliveryInstructions: addr.deliveryInstructions,
    };

    // Use real coordinates from the DB address record (the snapshot lat/lng can be 0).
    const deliveryLat = addr.lat;
    const deliveryLng = addr.lng;

    const now = Date.now();
    // Resolve all products in parallel — eliminates N sequential roundtrips
    const resolvedProducts = await Promise.all(
      args.items.map(async (item) => {
        const bySlug = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", item.productId))
          .unique();
        let productRow = bySlug;
        if (!productRow) {
          try {
            productRow = await ctx.db.get(item.productId as Id<"products">);
          } catch {
            // Ignore invalid ID checks
          }
        }
        return { item, productRow };
      })
    );

    // Dedupe boutique IDs and batch-fetch all boutiques at once
    const uniqueBoutiqueIds = new Set<string>();
    for (const { productRow } of resolvedProducts) {
      if (productRow) uniqueBoutiqueIds.add(productRow!.boutiqueId.toString());
    }
    const boutiqueArray: any[] = await Promise.all(
      [...uniqueBoutiqueIds].map((id) => ctx.db.get(id as Id<"boutiques">))
    );
    const boutiqueMap = new Map<string, any>(
      boutiqueArray.filter(Boolean).map((b: any) => [b._id.toString(), b])
    );

    // Fallback approved boutique (for mock products only)
    let fallbackBoutique: any = null;

    let expectedSubtotalPaise = 0;
    const resolvedItems: any[] = [];

    // 1. Validate each item using pre-fetched data
    for (const { item, productRow } of resolvedProducts) {
      const isMock = MOCK_INVENTORY[item.productId] !== undefined;

      // Product Existence Check (deleted items block)
      if (!productRow && !isMock) {
        throw new Error(`The item "${item.name}" is no longer available. Please refresh your cart.`);
      }

      // Active Flag Check (deactivated products block)
      if (productRow && !productRow!.active) {
        throw new Error(`The item "${item.name}" is currently deactivated. Please remove it from your cart.`);
      }

      // Resolve Boutique from the pre-fetched map
      let boutique: any = null;
      if (productRow) {
        boutique = boutiqueMap.get(productRow!.boutiqueId.toString()) ?? null;
      } else {
        // Fallback for mock products: resolve first approved boutique (cached)
        if (!fallbackBoutique) {
          fallbackBoutique = await ctx.db
            .query("boutiques")
            .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
            .first();
        }
        boutique = fallbackBoutique;
      }

      if (!boutique) {
        throw new Error(`Boutique for item "${item.name}" is unavailable.`);
      }

      // Boutique Status Verification (suspended, pending, rejected block)
      if (boutique.status !== "APPROVED") {
        throw new Error(`The boutique "${boutique.boutiqueName || boutique.name}" is temporarily unavailable. Please remove their products from your cart.`);
      }

      // Boutique Availability Check (paused store block)
      if (boutique.isAcceptingOrders === false) {
        throw new Error(`The boutique "${boutique.boutiqueName || boutique.name}" is currently paused and not accepting new orders. Please remove their products from your cart.`);
      }

      // Perform operational limits checks (hours, operating days, capacity, soft launch)
      await validateBoutiqueOperationalLimits(ctx.db, boutique._id);

      if (boutique.minimumOrderValue !== undefined) {
        const subtotalPaise = Math.round(args.subtotal * 100);
        if (subtotalPaise < boutique.minimumOrderValue) {
          throw new Error(
            `Minimum order value for ${boutique.boutiqueName || boutique.name} is ₹${(boutique.minimumOrderValue / 100).toFixed(2)}. Please add more items.`
          );
        }
      }

      // Targeted Serviceability Check
      const serviceability = checkServiceability(deliveryLat, deliveryLng, boutique);
      console.log(JSON.stringify({
        event: "serviceability_check",
        timestamp: Date.now(),
        boutiqueId: boutique._id,
        distanceKm: serviceability.distanceKm,
        radiusKm: serviceability.radiusKm,
        serviceable: serviceability.serviceable,
        reason: serviceability.reason,
        checkoutType: "cod"
      }));

      if (!serviceability.serviceable) {
        throw new Error(serviceability.reason || "One or more items cannot be delivered to your address.");
      }

      // Validate size and stock using the inventory helper
      await validateProductSizeAndStock(ctx.db, item.productId, item.size, item.quantity);

      // Recalculate price in integer Paise to prevent price manipulation
      let activePricePaise = 0;
      let financialSnapshot: any = {};
      
      if (productRow) {
        // dynamically fetch global settings and recalculate
        financialSnapshot = await calculateItemFinancials(ctx, productRow, Math.round(item.price * 100), item.quantity);
        activePricePaise = financialSnapshot.priceAtPurchase;
      } else {
        activePricePaise = Math.round(item.price * 100);
      }
      
      expectedSubtotalPaise += activePricePaise * item.quantity;

      resolvedItems.push({
        item,
        productRow,
        boutiqueId: boutique._id,
        financialSnapshot,
      });
    }

    // Verify subtotal in integer Paise
    const clientSubtotalPaise = Math.round(args.subtotal * 100);
    if (clientSubtotalPaise !== expectedSubtotalPaise) {
      // calculateItemFinancials handles STALE_CART_PRICE, so this is just tampering fallback
      throw new Error(`Security Exception: Cart subtotal mismatch. Price tampering detected.`);
    }

    const orderNumber = `HIVE-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const primaryBoutiqueId = resolvedItems[0]?.boutiqueId;

    if (!primaryBoutiqueId) {
      throw new Error("No valid boutique found for this order.");
    }

    // Enforce "1 Cart = 1 Boutique" invariant at server-side checkout
    for (const resolved of resolvedItems) {
      if (resolved.boutiqueId !== primaryBoutiqueId) {
        throw new Error("All items in the checkout must belong to the same boutique.");
      }
    }

    // Verify delivery fee using the routing and pricing engine
    const quote = await calculateDeliveryQuoteAction(ctx.db, {
      userLat: deliveryLat,
      userLng: deliveryLng,
      boutiqueId: primaryBoutiqueId,
      subtotal: args.subtotal * 100, // convert subtotal to paise
    });

    if (!quote.serviceable) {
      throw new Error(quote.reason || "Address is outside the serviceable radius for this boutique.");
    }

    let expectedDeliveryFee = (quote as any).customerPaidFee / 100; // convert back to rupees
    if (cleanPromoCode === "FREESHIP") {
      expectedDeliveryFee = 0;
    }

    if (args.deliveryFee !== expectedDeliveryFee) {
      throw new Error(
        `Delivery fee validation failed. Expected: ₹${expectedDeliveryFee}, Got: ₹${args.deliveryFee}`
      );
    }

    // Verify total calculation
    const expectedTotal = Math.max(0, args.subtotal - expectedDiscount + expectedDeliveryFee);
    if (args.total !== expectedTotal) {
      throw new Error(
        `Order total mismatch. Expected: ₹${expectedTotal}, Got: ₹${args.total}`
      );
    }

    // Resolve boutique
    const boutique: any = await ctx.db.get(primaryBoutiqueId);
    const boutiqueName = boutique ? (boutique.boutiqueName || boutique.name || "Unknown Boutique") : "Unknown Boutique";

    const bStatus = boutique ? getBoutiqueStatus(boutique, now) : { type: "OPEN" as const };
    const placedDuringClosedHours = bStatus.type !== "OPEN";
    const scheduledProcessingDate = (bStatus.type === "CLOSED_TODAY" || bStatus.type === "CLOSED_EXTENDED") ? (bStatus as any).nextOperatingDay : undefined;

    const subtotalPaise = parseMoney(args.subtotal);
    const deliveryFeePaise = parseMoney(args.deliveryFee);
    const discountPaise = parseMoney(args.discount);
    const totalPaise = parseMoney(args.total);

    // Build a map of client product ID (which could be a slug) to actual product database ID
    const resolvedProductMap = new Map<string, Id<"products">>();
    for (const { item, productRow } of resolvedProducts) {
      if (productRow) {
        resolvedProductMap.set(item.productId, productRow!._id);
      }
    }

    // Setup snapshot metrics for COD order
    const commissionRate = boutique ? (boutique.commissionRate || 18) : 18;
    const platformCommissionAmount = Math.floor(totalPaise * (commissionRate / 100));
    const gstOnCommission = Math.floor(platformCommissionAmount * 0.18);

    const orderSnapshot = {
      boutiqueName,
      boutiqueId: primaryBoutiqueId,
      items: args.items.map(item => {
        const resolvedId = resolvedProductMap.get(item.productId) ?? (item.productId as Id<"products">);
        return {
          productId: resolvedId,
          productName: item.name,
          size: item.size,
          sku: `SKU-${orderNumber}-${resolvedId}-${item.size}`,
          priceAtPurchase: parseMoney(item.price),
          quantity: item.quantity,
        };
      }),
      deliveryFee: deliveryFeePaise,
      commissionRate,
      addressSnapshot: compiledAddressSnapshot,
      orderValue: totalPaise,
      platformCommissionAmount,
      platformCommissionRate: commissionRate,
      courierQuote: {
        estimatedPorterCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 9000,
        estimatedCourierCost: quote.estimatedCourierCost ?? 9000,
        distanceKm: quote.distanceKm ?? 5.5,
        etaMinutes: quote.etaMinutes ?? 45,
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
      merchantPayable: totalPaise - platformCommissionAmount,
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
    const returnPolicyItems = orderSnapshot.items.map((i: any) => ({
      productId: i.productId,
      boutiqueId: primaryBoutiqueId,
    }));
    const returnsAccepted = await resolveOrderReturnsAccepted(
      ctx.db,
      primaryBoutiqueId,
      returnPolicyItems
    );
    const exchangesAccepted = await resolveOrderExchangesAccepted(
      ctx.db,
      primaryBoutiqueId,
      returnPolicyItems
    );

    // Create the order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId:      user._id,
      boutiqueId:      primaryBoutiqueId,
      boutiqueName,
      status:          "pending_confirmation",
      returnsAccepted,
      exchangesAccepted,
      acceptanceTimeoutAt: undefined,
      deliveryAddress: compiledAddressSnapshot,
      pickupAddress,
      addressId:       args.addressId,
      subtotal:        subtotalPaise,
      deliveryFee:     deliveryFeePaise,
      discount:        discountPaise,
      total:           totalPaise,
      commissionAmount: platformCommissionAmount,
      paymentStatus:   "pending",
      reservationId:   args.reservationId, // Required identifier
      notes:           `Payment: ${args.paymentMethod} | Slot: ${args.deliveryDate} ${args.deliverySlot}`,
      orderSnapshot,
      placedDuringClosedHours,
      scheduledProcessingDate,
      createdAt:       now,
      updatedAt:       now,
    });

    // Write default records to deliverySubsidyLedger and deliveryPerformanceLedger
    await ctx.db.insert("deliverySubsidyLedger", {
      orderId,
      cartSubtotal: subtotalPaise,
      customerPaidFee: deliveryFeePaise,
      estimatedPorterCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 0, // paise
      estimatedCourierCost: quote.estimatedCourierCost ?? 0,
      actualPorterCost: 0,
      actualCourierCost: 0,
      subsidyAmount: 0,
      subsidyPercent: 0,
      gatewayFee: Math.round(totalPaise * 0.02), // paise (2% of transaction total)
      refundAmount: 0,
      createdAt: now,
    });

    await ctx.db.insert("deliveryPerformanceLedger", {
      orderId,
      estimatedDistance: quote.distanceKm ?? 0,
      actualDistance: 0,
      estimatedEta: quote.etaMinutes ?? 0,
      actualEta: 0,
      estimatedCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 0, // paise
      actualCost: 0,
      deliveredOnTime: false,
      delayResponsibility: "none",
      createdAt: now,
    });

    // Create order items and update inventory
    const anyCategory = await ctx.db.query("categories").first();

    for (const { item, productRow, boutiqueId, financialSnapshot } of resolvedItems) {
      const snap = financialSnapshot || {};
      if (productRow) {
        // Real product found — check stock first
        const currentStock = productRow.stockBySize[item.size] ?? 0;
        if (item.quantity > currentStock) {
          throw new Error(`Overselling prevented: Requested quantity (${item.quantity}) exceeds available stock (${currentStock}) for size "${item.size}" of product "${item.name}".`);
        }

        // Subtract stock (clamping removed)
        const newStock = currentStock - item.quantity;
        const stockBySize = { ...productRow.stockBySize };
        stockBySize[item.size] = newStock;

        const totalStock = (Object.values(stockBySize) as number[]).reduce((sum, val) => sum + val, 0);
        const active = totalStock > 0;

        await ctx.db.patch(productRow._id, { stockBySize, active, updatedAt: now });

        if (totalStock <= 0) {
          const adminUser = await ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", "admin"))
            .first();
          if (adminUser) {
            const adminId = (adminUser as any)._id as Id<"users">;
            const boutiqueDoc = await ctx.db.get(boutiqueId);
            await triggerNotification(
              ctx,
              adminId,
              "slack",
              "out_of_stock_alert",
              "product",
              productRow._id,
              JSON.stringify({
                productName: productRow.name,
                boutiqueName: (boutiqueDoc as any)?.boutiqueName || (boutiqueDoc as any)?.name || "Boutique",
              })
            );
          }
        }

        await ctx.db.insert("inventoryMovements", {
          productId: productRow._id,
          boutiqueId: productRow.boutiqueId,
          size: item.size,
          beforeQty: currentStock,
          afterQty: newStock,
          adjustmentQty: -item.quantity,
          reason: "online_order",
          source: "checkout",
          createdBy: user._id,
          orderId,
          createdAt: now,
        });

        await ctx.db.insert("orderItems", {
          orderId,
          productId:       productRow._id,
          variantId:       productRow._id,
          boutiqueId:      productRow.boutiqueId,
          productName:     item.name,
          variantSize:     item.size,
          imageUrl:        item.imageUrl,
          sku:             `SKU-${orderNumber}-${productRow.slug}-${item.size}`,
          priceAtPurchase: snap.priceAtPurchase ?? parseMoney(item.price),
          basePriceAtPurchase: snap.basePriceAtPurchase,
          platformMarkupRateAtPurchase: snap.platformMarkupRateAtPurchase,
          platformFeeRateAtPurchase: snap.platformFeeRateAtPurchase,
          platformMarkupAmount: snap.platformMarkupAmount,
          platformFeeAmount: snap.platformFeeAmount,
          fixedPlatformFeeAtPurchase: snap.fixedPlatformFeeAtPurchase ?? 700,
          quantity:        item.quantity,
          subtotal:        (snap.priceAtPurchase ?? parseMoney(item.price)) * item.quantity,
        });
        continue;
      }

      // Fallback for valid mock products (insert placeholder in DB)
      const placeholderProductId = await ctx.db.insert("products", {
        boutiqueId,
        name:             item.name,
        slug:             `${item.productId}-${Math.floor(1000 + Math.random() * 9000)}`,
        description:      "System Generated Mock Product",
        categoryId:       anyCategory?._id || (args.addressId as any),
        price:            parseMoney(item.price),
        images:           [item.imageUrl],
        sizes:            [item.size],
        stockBySize:      { [item.size]: 0 },
        sameDayEligible:  false,
        featured:         false,
        active:           true,
        createdAt:        now,
        updatedAt:        now,
      });

      await ctx.db.insert("orderItems", {
        orderId,
        productId:       placeholderProductId,
        variantId:       placeholderProductId,
        boutiqueId,
        productName:     item.name,
        variantSize:     item.size,
        imageUrl:        item.imageUrl,
        sku:             `SKU-${orderNumber}-${item.productId}`,
        priceAtPurchase: parseMoney(item.price),
        quantity:        item.quantity,
        subtotal:        parseMoney(item.price) * item.quantity,
      });

      await ctx.db.insert("inventoryMovements", {
        productId: placeholderProductId,
        boutiqueId,
        size: item.size,
        beforeQty: 0,
        afterQty: 0,
        adjustmentQty: -item.quantity,
        reason: "online_order",
        source: "checkout",
        createdBy: user._id,
        orderId,
        createdAt: now,
      });
    }

    // Generate unique invoice number: INV-YYYYMMDD-XXXX
    let invoiceNumber = "";
    let isUnique = false;
    const dateObj = new Date(now);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;
    while (!isUnique) {
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      invoiceNumber = `INV-${dateStr}-${randomSeq}`;
      const existing = await ctx.db
        .query("invoices")
        .withIndex("by_invoice_number", (q) => q.eq("invoiceNumber", invoiceNumber))
        .unique();
      if (!existing) {
        isUnique = true;
      }
    }

    // Generate transaction ID
    const transactionId = `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Get customer profile display name
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const customerName = profile?.displayName || user.email || "Hive Customer";

    // Snapshot items for the invoice
    const invoiceItems = args.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      productImage: item.imageUrl,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.price * item.quantity,
    }));

    // Create the invoice record
    await ctx.db.insert("invoices", {
      invoiceNumber,
      orderId,
      orderNumber,
      userId: user._id,
      transactionId,
      customerName,
      customerEmail: user.email || "",
      customerPhone: finalPhone!,
      billingAddress: {
        line1: compiledAddressSnapshot.houseNumber
          ? `${compiledAddressSnapshot.houseNumber}, ${compiledAddressSnapshot.line1 || compiledAddressSnapshot.formattedAddress || ""}`
          : (compiledAddressSnapshot.line1 || compiledAddressSnapshot.formattedAddress || ""),
        line2: compiledAddressSnapshot.line2 || compiledAddressSnapshot.landmark,
        city: compiledAddressSnapshot.city,
        state: compiledAddressSnapshot.state,
        pincode: compiledAddressSnapshot.pincode,
      },
      shippingAddress: {
        line1: compiledAddressSnapshot.houseNumber
          ? `${compiledAddressSnapshot.houseNumber}, ${compiledAddressSnapshot.line1 || compiledAddressSnapshot.formattedAddress || ""}`
          : (compiledAddressSnapshot.line1 || compiledAddressSnapshot.formattedAddress || ""),
        line2: compiledAddressSnapshot.line2 || compiledAddressSnapshot.landmark,
        city: compiledAddressSnapshot.city,
        state: compiledAddressSnapshot.state,
        pincode: compiledAddressSnapshot.pincode,
      },
      items: invoiceItems,
      subtotal: args.subtotal,
      deliveryFee: args.deliveryFee,
      discount: args.discount,
      tax: 0,
      totalAmount: args.total,
      paymentMethod: args.paymentMethod,
      paymentStatus: args.paymentMethod === "cod" ? "pending" : "paid",
      generatedAt: now,
    });

    // Clear the user's cart
    const cartItemsToDelete = await ctx.db
      .query("cartItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);
    for (const ci of cartItemsToDelete) {
      await ctx.db.delete(ci._id);
    }

    // Increment boutique's daily active order count O(1)
    await incrementBoutiqueOrderCount(ctx, primaryBoutiqueId, now);

    // Schedule background email notification to boutique
    await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
      orderId,
      event: "new_order",
    });

    // Schedule background Web Push notification to boutique sellers / staff
    await ctx.scheduler.runAfter(0, internal.pushActions.sendOrderPushToBoutique, {
      boutiqueId: primaryBoutiqueId,
      title: `New Order: ₹${args.total.toFixed(2)}! 🎉`,
      body: `New order ${orderNumber} placed for ${args.items.length} item(s).`,
      url: "/boutique/orders",
    });

    await triggerNotification(
      ctx,
      user._id,
      "slack",
      "new_order_ops",
      "order",
      orderId,
      JSON.stringify({
        orderNumber,
        boutiqueName,
        total: args.total,
        itemsCount: args.items.length,
      })
    );

    // ── SLA Timers ────────────────────────────────────────────────────────────
    // 10-min: Slack warning if seller hasn't accepted yet
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.orders.checkOrderAcceptanceSLA,
      { orderId, alertType: "warning" }
    );
    // 45-min: Auto-cancel + customer refund notification + Slack escalation
    await ctx.scheduler.runAfter(
      45 * 60 * 1000,
      internal.orders.checkOrderAcceptanceSLA,
      { orderId, alertType: "auto_cancel" }
    );

    return { orderId, orderNumber };
  },
});

/**
 * List all orders for the current user, newest first.
 * Returns order + its items in a single shape the UI expects.
 */
async function formatOrderForCustomer(ctx: any, order: any, items: any[]) {
  if (!order) return null;
  let driverDetails: any = null;
  if (order.shipmentId) {
    const shipment = await ctx.db.get(order.shipmentId);
    if (shipment && (shipment.driverName || shipment.driverPhone || shipment.vehiclePlate || shipment.liveTrackingUrl)) {
      driverDetails = {
        name: shipment.driverName || null,
        phone: shipment.driverPhone || null,
        vehiclePlate: shipment.vehiclePlate || null,
        liveTrackingUrl: shipment.liveTrackingUrl || null,
        provider: shipment.provider || null,
      };
    }
  }

  const boutique = await ctx.db.get(order.boutiqueId);
  const boutiqueReturnsDefault = boutique?.returnsAcceptedDefault !== false;

  const itemsWithReviewStatus = await Promise.all(
    items.map(async (item) => {
      const product = await ctx.db.get(item.productId);
      const itemBoutique = item.boutiqueId ? await ctx.db.get(item.boutiqueId) : boutique;
      const returnsAccepted = product?.returnsAccepted !== undefined
        ? product.returnsAccepted
        : (itemBoutique?.returnsAcceptedDefault !== false);

      const existingReview = await ctx.db
        .query("reviews")
        .withIndex("by_orderItemId", (q: any) => q.eq("orderItemId", item._id))
        .first();
      return {
        ...item,
        priceAtPurchase: item.priceAtPurchase,
        subtotal: item.subtotal,
        hasReview: !!existingReview,
        returnsAccepted,
      };
    })
  );

  // Prefer the snapshot taken at order creation. Only fall back to live
  // resolution for legacy orders placed before the snapshot existed — for
  // those, the seller's current policy is the best available answer.
  const returnsAccepted = order.returnsAccepted !== undefined
    ? order.returnsAccepted
    : itemsWithReviewStatus.length > 0
      ? itemsWithReviewStatus.every((i) => i.returnsAccepted !== false) && boutiqueReturnsDefault
      : boutiqueReturnsDefault;

  return {
    ...order,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    driverDetails,
    items: itemsWithReviewStatus,
    returnsAccepted,
    // Falls back to the return policy for orders placed before exchanges were
    // a separate seller opt-in.
    exchangesAccepted: order.exchangesAccepted ?? returnsAccepted,
  };
}

/**
 * List all orders for the current user.
 */
export const listMyOrders = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx, args.token);
    if (!user) return [];

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customerId", (q) => q.eq("customerId", user._id))
      .order("desc")
      .take(50);

    // Batch load order items
    const itemsList = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("orderItems")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .take(20)
      )
    );

    const formattedOrders: any[] = [];
    for (let i = 0; i < orders.length; i++) {
      const formatted = await formatOrderForCustomer(ctx, orders[i], itemsList[i] ?? []);
      if (formatted) {
        formattedOrders.push(formatted);
      }
    }
    return formattedOrders;
  },
});

/**
 * Get a single order by its Convex _id.
 * Ownership-checked: only the order owner can read it.
 */
export const getOrderById = query({
  args: { orderId: v.id("orders"), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx, args.token);
    if (!user) return null;

    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== user._id) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(20);

    return await formatOrderForCustomer(ctx, order, items);
  },
});

/**
 * Get an order by its human-readable orderNumber (e.g. "HIVE-57403").
 * Ownership-checked.
 */
export const getOrderByNumber = query({
  args: { orderNumber: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx, args.token);
    if (!user) return null;

    const order = await ctx.db
      .query("orders")
      .withIndex("by_orderNumber", (q) => q.eq("orderNumber", args.orderNumber))
      .unique();
    if (!order || order.customerId !== user._id) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(20);

    const formatted = await formatOrderForCustomer(ctx, order, items);
    if (!formatted) return null;

    const boutique = await ctx.db.get(order.boutiqueId);
    const boutiqueName = order.boutiqueName || boutique?.name || "Hive Marketplace";

    formatted.items = formatted.items.map((item: any) => ({
      ...item,
      boutiqueName,
    }));

    return formatted;
  },
});

/**
 * Fetch all orders for the logged-in boutique.
 */
export const getBoutiqueOrders = query({
  args: {},
  handler: async (ctx) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    // Bounded limit of 300 orders to avoid unbounded database collections
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .order("desc")
      .take(300);

    if (orders.length === 0) return [];

    // Batch load order items, invoices, shipments, customerProfiles, and users
    const [
      itemsList,
      invoicesList,
      shipmentsList,
      profilesList,
      usersList,
      activityList,
      returnShipmentsList,
    ] = await Promise.all([
      Promise.all(orders.map((o) => ctx.db.query("orderItems").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).collect())),
      Promise.all(orders.map((o) => ctx.db.query("invoices").withIndex("by_order_id", (q) => q.eq("orderId", o._id)).unique())),
      Promise.all(orders.map((o) => o.shipmentId ? ctx.db.get(o.shipmentId) : null)),
      Promise.all(orders.map((o) => ctx.db.query("customerProfiles").withIndex("by_userId", (q) => q.eq("userId", o.customerId)).unique())),
      Promise.all(orders.map((o) => ctx.db.get(o.customerId))),
      Promise.all(orders.map((o) => ctx.db.query("orderActivity").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).first())),
      // The return leg. A seller had no way to see that an item was coming
      // back to them, let alone who was bringing it or when.
      Promise.all(orders.map((o) => o.returnShipmentId ? ctx.db.get(o.returnShipmentId) : null)),
    ]);

    return orders.map((order, i) => {
      const items = itemsList[i] || [];
      const invoice = invoicesList[i];
      const shipment = shipmentsList[i];
      const profile = profilesList[i];
      const user = usersList[i];

      // Calculate boutique pricing metrics (in paise)
      let totalBasePrice = 0;
      let totalPayout = 0;

      items.forEach((it) => {
        const qty = it.quantity || 1;
        const base = (it.basePriceAtPurchase != null && it.basePriceAtPurchase > 0)
          ? it.basePriceAtPurchase
          : (it.priceAtPurchase || 0);
        let fee = 0;

        if (it.platformFeeAmount != null && it.platformFeeAmount >= 0) {
          fee = it.platformFeeAmount;
        } else if (it.basePriceAtPurchase != null && it.basePriceAtPurchase > 0) {
          fee = Math.round(it.basePriceAtPurchase * 0.02); // 2% Platform Fee fallback
        } else if (it.priceAtPurchase != null && it.priceAtPurchase > 0) {
          fee = Math.round(it.priceAtPurchase * 0.18); // 18% commission fallback for legacy
        }

        totalBasePrice += base * qty;
        totalPayout += (base - fee) * qty;
      });

      const activity = activityList[i];
      const returnShipment = returnShipmentsList[i];
      return {
        ...order,
        items,
        customerName: profile?.displayName || user?.email?.split('@')[0] || "Customer",
        invoiceNumber: invoice?.invoiceNumber || null,
        invoicePdfUrl: invoice?.pdfUrl || null,
        shipmentStatus: shipment?.status || null,
        // Courier timestamps, so the boutique can see when their item actually
        // moved rather than only its current status.
        pickedUpAt: shipment?.pickedUpAt ?? order.pickedUpAt ?? null,
        deliveredAt: shipment?.deliveredAt ?? order.deliveredAt ?? null,
        shipment: shipment ? {
          _id: shipment._id,
          provider: shipment.provider,
          providerBookingId: shipment.providerBookingId || shipment.awbNumber || null,
          awbNumber: shipment.awbNumber || null,
          status: shipment.status,
          trackingUrl: shipment.trackingUrl || null,
          driverName: shipment.driverName || null,
          driverPhone: shipment.driverPhone || null,
          vehiclePlate: shipment.vehiclePlate || null,
          etaMinutes: shipment.etaMinutes ?? null,
          liveTrackingUrl: shipment.liveTrackingUrl || null,
        } : null,
        // The return journey, when the customer has sent the item back. The
        // seller needs the same rider detail here as on the way out, because
        // this is the leg that ends with them holding the goods again.
        returnShipment: returnShipment ? {
          _id: returnShipment._id,
          awbNumber: returnShipment.awbNumber || null,
          status: returnShipment.status,
          trackingUrl: returnShipment.trackingUrl || null,
          liveTrackingUrl: returnShipment.liveTrackingUrl || null,
          driverName: returnShipment.driverName || null,
          driverPhone: returnShipment.driverPhone || null,
          vehiclePlate: returnShipment.vehiclePlate || null,
          etaMinutes: returnShipment.etaMinutes ?? null,
          pickedUpAt: returnShipment.pickedUpAt ?? null,
          deliveredAt: returnShipment.deliveredAt ?? null,
        } : null,
        totalBasePrice,
        // The frozen snapshot is what the seller is actually transferred; it
        // already has any seller-funded coupon discount taken out.
        totalPayout: order.pricingSnapshot?.sellerPayoutPaise ?? totalPayout,
        sellerFundedDiscountPaise: order.pricingSnapshot?.sellerFundedDiscountPaise ?? 0,
        acceptanceActivity: activity ? {
          actorName: activity.actorName,
          actorEmail: activity.actorEmail,
          actorRole: activity.actorRole,
          createdAt: activity.createdAt,
        } : null,
      };
    });
  },
});

export const getOrderByIdInternal = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const profile = await ctx.db.query("customerProfiles").withIndex("by_userId", (q) => q.eq("userId", order.customerId)).unique();
    const boutique = order.boutiqueId ? await ctx.db.get(order.boutiqueId) : null;
    return {
      ...order,
      customerName: profile?.displayName || "Customer",
      boutiquePhone: boutique?.notificationPhone || boutique?.phone,
      boutiqueOwnerName: boutique?.ownerName || "Boutique Owner",
      boutiqueStaffPhone1: boutique?.staffPhone1,
      boutiqueStaffPhone2: boutique?.staffPhone2,
    };
  }
});

export const retryBoutiqueOrderDispatch = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    const order = await ctx.runQuery(internal.orders.getOrderByIdInternal, { orderId: args.orderId });
    if (!order || !order.shipmentId) {
      throw new Error("Order or shipment not found.");
    }
    const boutique = await ctx.runQuery(api.boutiques.getMyBoutiqueDetails);
    if (!boutique || boutique._id !== order.boutiqueId) {
      throw new Error("Unauthorized");
    }
    
    const pickupAddress = buildBoutiquePorterAddress(boutique);
    const dropAddress = buildCustomerPorterAddress(
      order.deliveryAddress,
      order.customerName || "Customer"
    );
    assertPorterAddressUsable(pickupAddress, "pickup");
    assertPorterAddressUsable(dropAddress, "drop");

    // Call the Porter createOrder action
    const result = await ctx.runAction(internal.lib.porter.createOrder, {
      orderId: args.orderId,
      shipmentId: order.shipmentId,
      pickupAddress,
      dropAddress,
      orderNumber: order.orderNumber,
      deliveryInstructions: order.deliveryAddress.deliveryInstructions,
    });

    return result;
  }
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["pending_confirmation", "cancelled"],
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["confirmed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "cancelled"],
  pickup_scheduled: ["picked_up", "in_transit", "out_for_delivery", "cancelled"],
  picked_up: ["in_transit", "out_for_delivery", "delivered", "cancelled"],
  in_transit: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  booking_failed: ["packed", "pickup_scheduled", "cancelled"],
  delivered: ["claim_submitted", "refund_requested", "refunded"],
  cancelled: [],
  claim_submitted: ["refund_requested", "replacement_requested"],
  replacement_requested: ["replacement_approved", "cancelled"],
  replacement_approved: ["replacement_dispatched", "cancelled"],
  replacement_dispatched: ["replacement_delivered", "cancelled"],
  replacement_delivered: [],
  refund_requested: ["refunded", "cancelled"],
  refunded: [],
};

function isValidTransition(current: string, target: string, isAdminOverride: boolean = false): boolean {
  if (current === target) return true;
  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(target);
}

export function assertHyperlocalTransitionPrerequisites(order: any, boutique: any) {
  if (!order.orderAcceptedAt) {
    throw new Error("Cannot request pickup: Order has not been accepted.");
  }
  if (!order.readyForPickupAt) {
    throw new Error("Cannot request pickup: Order has not been marked as packed.");
  }
  
  const customerAddr = order.deliveryAddress;
  if (
    !customerAddr ||
    customerAddr.lat === undefined ||
    customerAddr.lat === null ||
    customerAddr.lat === 0 ||
    customerAddr.lng === undefined ||
    customerAddr.lng === null ||
    customerAddr.lng === 0
  ) {
    throw new Error("Cannot request pickup: Customer delivery coordinates are invalid or missing.");
  }

  const orderPickup = order.pickupAddress;
  const boutiqueLat = orderPickup?.latitude ?? boutique?.latitude ?? boutique?.addressDetails?.lat;
  const boutiqueLng = orderPickup?.longitude ?? boutique?.longitude ?? boutique?.addressDetails?.lng;
  const boutiquePhone = orderPickup?.phone ?? boutique?.phone ?? boutique?.phoneNumber;

  if (
    !boutiqueLat ||
    !boutiqueLng ||
    !boutiquePhone ||
    boutiqueLat === 0 ||
    boutiqueLng === 0
  ) {
    throw new Error("Cannot request pickup: Boutique pickup coordinates or phone number are incomplete.");
  }
}

async function handleOrderStatusChangeLedgerUpdates(
  ctx: any,
  order: any,
  newStatus: string,
  now: number
) {
  if (newStatus === "confirmed") {
    const subsidyRecord = await ctx.db
      .query("deliverySubsidyLedger")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
      .first();

    if (subsidyRecord) {
      // Until Porter reports the real fare, the best number Hive has is the
      // courier's own quote. This used to add a random ₹0–15 "surge" and store
      // the result as the ACTUAL cost, so margin reports were part real and
      // part noise. Porter's real trip fare replaces this when the trip ends.
      const estimatedCost = subsidyRecord.estimatedCourierCost ?? subsidyRecord.estimatedPorterCost ?? 0;
      const actualCourierCost =
        (subsidyRecord.actualCourierCost ?? 0) > 0 ? subsidyRecord.actualCourierCost : estimatedCost;
      const customerPaidFee = subsidyRecord.customerPaidFee ?? 0;
      const subsidyAmount = actualCourierCost - customerPaidFee;
      const subsidyPercent = subsidyRecord.cartSubtotal > 0 ? (subsidyAmount / subsidyRecord.cartSubtotal) : 0;

      await ctx.db.patch(subsidyRecord._id, {
        actualPorterCost: actualCourierCost, // Deprecated fallback
        actualCourierCost,
        subsidyAmount,
        subsidyPercent,
      });
    }
  } else if (newStatus === "delivered") {
    const perfRecord = await ctx.db
      .query("deliveryPerformanceLedger")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
      .first();

    if (perfRecord) {
      const subsidyRecord = await ctx.db
        .query("deliverySubsidyLedger")
        .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
        .first();

      const boutique = await ctx.db.get(order.boutiqueId);
      const actualDistance = Math.max(0.1, Math.round((perfRecord.estimatedDistance + (Math.random() * 0.4 - 0.2)) * 100) / 100);
      const acceptedTime = order.orderAcceptedAt ?? order.confirmedAt ?? order.createdAt;
      const actualEta = Math.max(1, Math.round((now - acceptedTime) / 60000));
      const actualCost = subsidyRecord?.actualCourierCost ?? subsidyRecord?.actualPorterCost ?? perfRecord.estimatedCost;
      const deliveredOnTime = actualEta <= perfRecord.estimatedEta;

      let delayResponsibility: "boutique" | "courier" | "customer" | "system" | "none" = "none";
      if (!deliveredOnTime && boutique) {
        const readyTime = order.readyForPickupAt ?? order.packedAt ?? now;
        const boutiquePrepTime = Math.round((readyTime - acceptedTime) / 60000);
        const avgPrepTime = boutique.averagePrepTime ?? 30;

        if (boutiquePrepTime > avgPrepTime) {
          delayResponsibility = "boutique";
        } else {
          const rand = Math.random();
          if (rand < 0.6) {
            delayResponsibility = "courier";
          } else if (rand < 0.8) {
            delayResponsibility = "customer";
          } else {
            delayResponsibility = "system";
          }
        }
      }

      await ctx.db.patch(perfRecord._id, {
        actualDistance,
        actualEta,
        actualCost,
        deliveredOnTime,
        delayResponsibility,
      });
    }
  } else if (newStatus === "refunded") {
    const subsidyRecord = await ctx.db
      .query("deliverySubsidyLedger")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
      .first();
    if (subsidyRecord) {
      await ctx.db.patch(subsidyRecord._id, {
        refundAmount: order.total * 100, // full refund amount in paise
      });
    }
  }
}

export const updateBoutiqueOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending_payment"),
      v.literal("pending_confirmation"),
      v.literal("confirmed"),
      v.literal("packed"),
      v.literal("pickup_scheduled"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("claim_submitted"),
      v.literal("replacement_requested"),
      v.literal("replacement_approved"),
      v.literal("replacement_dispatched"),
      v.literal("replacement_delivered"),
      v.literal("refund_requested"),
      v.literal("refunded"),
      v.literal("booking_failed")
    ),
    token: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, args.token);
    const order = await ctx.db.get(args.orderId);
    if (!order || order.boutiqueId !== boutique._id) {
      throw new Error("Unauthorized: Order does not belong to your boutique.");
    }

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(args.status)) {
      throw new ConvexError(`Invalid transition: ${order.status} → ${args.status}`);
    }

    if (order.status === args.status) {
      return args.orderId;
    }

    if (args.status === "pickup_scheduled") {
      assertHyperlocalTransitionPrerequisites(order, boutique);
    }
    
    const now = Date.now();

    // Check if transitioning to cancelled/refunded
    const wasCancelledOrRefunded = order.status === "cancelled" || order.status === "refunded";
    const isNowCancelledOrRefunded = args.status === "cancelled" || args.status === "refunded";
    const isReversible = ["pending_payment", "pending_confirmation", "confirmed", "packed", "pickup_scheduled"].includes(order.status);

    if (!wasCancelledOrRefunded && isNowCancelledOrRefunded && isReversible) {
      await decrementBoutiqueOrderCount(ctx, order.boutiqueId, order);
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .collect();

      const operator = await getCurrentUserOrNull(ctx);
      const operatorId = operator?._id ?? order.customerId;

      for (const item of orderItems) {
        const product = await ctx.db.get(item.productId);
        if (product) {
          const currentStock = product.stockBySize[item.variantSize] ?? 0;
          const newStock = currentStock + item.quantity;

          const stockBySize = { ...product.stockBySize };
          stockBySize[item.variantSize] = newStock;

          const beforeTotalStock = (product.sizes || []).reduce((sum: number, sz: string) => sum + (product.stockBySize[sz] ?? 0), 0);
          const totalStock = (product.sizes || []).reduce((sum: number, sz: string) => sum + (stockBySize[sz] ?? 0), 0);
          let active = product.active;
          let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

          const isApproved = !product.approvalStatus || product.approvalStatus === "approved";

          if (totalStock === 0) {
            active = false;
            autoDeactivatedBecauseOutOfStock = true;
          } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
            if (isApproved) {
              active = true;
            }
            autoDeactivatedBecauseOutOfStock = false;
          } else if (totalStock > 0) {
            autoDeactivatedBecauseOutOfStock = false;
          }

          await ctx.db.patch(product._id, {
            stockBySize,
            active,
            autoDeactivatedBecauseOutOfStock,
            updatedAt: now,
          });

          await ctx.db.insert("inventoryMovements", {
            productId: product._id,
            boutiqueId: product.boutiqueId,
            size: item.variantSize,
            beforeQty: currentStock,
            afterQty: newStock,
            adjustmentQty: item.quantity,
            reason: "online_order_reversal",
            source: "return",
            createdBy: operatorId,
            orderId: order._id,
            createdAt: now,
          });
        }
      }
    }

    const patch: Record<string, any> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.status === "confirmed" && !order.confirmedAt) {
      patch.confirmedAt = now;
      patch.orderAcceptedAt = now;
      patch.acceptanceTimeoutAt = undefined;
      patch.slaAlertFiredAt = undefined; // Clear SLA alert marker on acceptance
    }
    if (args.status === "packed" && !order.packedAt) {
      patch.packedAt = now;
      patch.readyForPickupAt = now;
      const acceptedTime = order.orderAcceptedAt ?? order.confirmedAt ?? order.createdAt;
      patch.prepTimeDurationMinutes = Math.round((now - acceptedTime) / 60000);
    }
    if (args.status === "pickup_scheduled" && !order.readyForPickupAt) {
      patch.readyForPickupAt = now;
    }
    if (args.status === "pickup_scheduled" && !order.pickupScheduledAt) patch.pickupScheduledAt = now;
    if (args.status === "picked_up" && !order.pickedUpAt) patch.pickedUpAt = now;
    if (args.status === "in_transit" && !order.inTransitAt) patch.inTransitAt = now;
    if (args.status === "out_for_delivery" && !order.outForDeliveryAt) patch.outForDeliveryAt = now;
    if (args.status === "delivered" && !order.deliveredAt) {
      patch.deliveredAt = now;
      patch.claimWindowExpiresAt = now + 24 * 3600 * 1000;
    }
    if (args.status === "cancelled") {
      if (!order.cancelledAt) patch.cancelledAt = now;
      // Store raw seller reason INTERNALLY — never expose to customers
      if (args.cancelReason) patch.internalCancelReason = args.cancelReason;
      patch.cancelReason = "Boutique declined order"; // generic public reason
    }

    await ctx.db.patch(args.orderId, patch);

    // The customer never gets the goods, so they get their money back. This
    // used to set refundStatus and stop, which moved nothing.
    if (args.status === "cancelled") {
      await refundCancelledOrder(ctx, {
        orderId: args.orderId,
        reason: `Boutique declined order ${order.orderNumber}`,
        idempotencySuffix: "boutique_declined",
      });
    }

    // Record order activity for actor attribution (confirmed only for now)
    if (args.status === "confirmed") {
      await recordOrderActivity(ctx, {
        orderId: args.orderId,
        boutiqueId: order.boutiqueId,
        action: "confirmed",
        createdAt: now,
      });
    }

    const updatedOrder = await ctx.db.get(args.orderId);
    if (updatedOrder) {
      await handleOrderStatusChangeLedgerUpdates(ctx, updatedOrder, args.status, now);
    }

    // Porter booking is now deferred to readyForPickupAction.
    // Shipment + createOrder are triggered only when the seller clicks "Ready for Pickup".

    const targetStatuses = ["confirmed", "packed", "out_for_delivery", "delivered"];
    if (targetStatuses.includes(args.status)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
        orderId: args.orderId,
        event: args.status as "confirmed" | "packed" | "out_for_delivery" | "delivered",
      });

      // Map Order States to Push & WhatsApp Templates
      const pushMap: Record<string, { title: string, body: string, waTemplate: string }> = {
        confirmed: {
          title: "Order Confirmed! 🛍️",
          body: `Your order #${order.orderNumber} has been received and is being processed.`,
          waTemplate: "hive_order_accepted",
        },
        packed: {
          title: "Order Packed 📦",
          body: `Your order #${order.orderNumber} is packed and ready for dispatch.`,
          waTemplate: "hive_general_update",
        },
        out_for_delivery: {
          title: "Out for Delivery 🚚",
          body: `Your order #${order.orderNumber} is on its way to you!`,
          waTemplate: "hive_out_for_delivery",
        },
        delivered: {
          title: "Order Delivered 📦",
          body: `Your order #${order.orderNumber} was delivered successfully. Enjoy!`,
          waTemplate: "hive_order_delivered",
        },
      };

      const config = pushMap[args.status];
      if (config) {
        // 1. Dispatch Web Push Action
        await ctx.scheduler.runAfter(0, api.customerPushActions.sendTransactionalPush, {
          userId: order.customerId,
          title: config.title,
          body: config.body,
          targetUrl: `https://hivenow.in/orders/${order._id}`,
        });

        // 2. Dispatch WhatsApp Cloud API Action (Fallback / Multi-Channel)
        if (order.deliveryAddress?.phone) {
          let waParams = [order.orderNumber];
          if (args.status === "out_for_delivery") {
            const driverName = (order as any).shipment?.driverName || "Hive Courier Partner";
            const driverPhone = (order as any).shipment?.driverPhone || "+91 73066 13428";
            waParams = [order.orderNumber, driverName, driverPhone];
          }

          if (config.waTemplate === "hive_order_delivered" || config.waTemplate === "hive_out_for_delivery") {
            await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
              recipient: order.deliveryAddress.phone,
              templateName: config.waTemplate,
              parameters: waParams,
              languageCode: "en",
            });
          }
        }
      }

      // Ops Slack alert: Order Accepted by Boutique
      if (args.status === "confirmed") {
        const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
        if (superadmin) {
          const customerUser = await ctx.db.get(order.customerId);
          await triggerNotification(
            ctx,
            superadmin._id,
            "slack",
            "order_accepted",
            "order",
            args.orderId,
            JSON.stringify({
              orderNumber: order.orderNumber,
              boutiqueName: boutique.boutiqueName || boutique.name || "Boutique",
              totalPaise: order.total,
              customerName: (customerUser as any)?.name || order.deliveryAddress?.phone || "Customer",
            })
          );
        }
      }

      // Ops Slack alert: Order Shipped / Out for Delivery
      if (args.status === "out_for_delivery") {
        const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
        if (superadmin) {
          const customerUser = await ctx.db.get(order.customerId);
          await triggerNotification(
            ctx,
            superadmin._id,
            "slack",
            "order_shipped",
            "order",
            args.orderId,
            JSON.stringify({
              orderNumber: order.orderNumber,
              boutiqueName: boutique.boutiqueName || boutique.name || "Boutique",
              customerName: (customerUser as any)?.name || order.deliveryAddress?.phone || "Customer",
              deliveryCity: order.deliveryAddress?.city || "Kochi",
            })
          );
        }
      }
    }

    if (args.status === "cancelled") {
      if (order.shipmentId) {
        const shipment = await ctx.db.get(order.shipmentId);
        if (shipment && shipment.provider === "porter" && shipment.awbNumber) {
          await ctx.scheduler.runAfter(0, internal.lib.porter.cancelOrder, {
            crn: shipment.awbNumber,
          });
        }
      }

      // Internal reason (for ops/admin use only)
      const internalReason = args.cancelReason || "No reason provided";

      // Branded customer-safe message — never reveals seller's raw reason
      const brandedCustomerMessage =
        `Due to high demand for this product, we're unable to fulfil your order right now. ` +
        `A full refund of ₹${((order.total ?? 0) / 100).toFixed(2)} will be credited back to your original payment method within approximately 1 hour.`;

      // 1. Customer WhatsApp — branded decline template (hive_order_declined)
      const customerUser = await ctx.db.get(order.customerId);
      const customerPhone = order.deliveryAddress?.phone || customerUser?.phone;
      if (customerPhone) {
        const refundAmount = ((order.total ?? 0) / 100).toFixed(2);
        await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
          recipient: customerPhone,
          templateName: "hive_order_declined",
          parameters: [
            order.orderNumber,
            refundAmount,
          ],
          languageCode: "en",
        });
      }

      // 2. Customer Email — branded decline template
      const invoice = await ctx.db
        .query("invoices")
        .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
        .unique();
      const customerEmail = invoice?.customerEmail || customerUser?.email;
      if (customerEmail) {
        await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
          orderId: args.orderId,
          event: "cancelled",
        });
      }

      // 3. Slack alert — includes internal reason for ops
      const slackWebhook = process.env.SLACK_WEBHOOK_ORDERS_URL || process.env.SLACK_WEBHOOK_URL;
      if (slackWebhook) {
        await ctx.scheduler.runAfter(0, internal.whatsapp.sendSlackAlert, {
          webhook: slackWebhook,
          text: `🚨 *Order Declined by Boutique*\n` +
            `*Order:* #${order.orderNumber}\n` +
            `*Boutique:* ${boutique.boutiqueName || boutique.name || "Unknown"}\n` +
            `*Internal Reason:* ${internalReason}\n` +
            `*Customer:* ${customerPhone || customerEmail || "Unknown"}\n` +
            `*Refund Status:* Pending (manual processing required)`,
        });
      }
    }

    return args.orderId;
  },
});

/**
 * Bulk update order statuses for a boutique owner.
 * Validates ownership for each order.
 */
export const bulkUpdateBoutiqueOrderStatus = mutation({
  args: {
    orderIds: v.array(v.id("orders")),
    status: v.union(
      v.literal("pending_payment"),
      v.literal("pending_confirmation"),
      v.literal("confirmed"),
      v.literal("packed"),
      v.literal("pickup_scheduled"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("claim_submitted"),
      v.literal("replacement_requested"),
      v.literal("replacement_approved"),
      v.literal("replacement_dispatched"),
      v.literal("replacement_delivered"),
      v.literal("refund_requested"),
      v.literal("refunded"),
      v.literal("booking_failed")
    ),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    const now = Date.now();
    const results: any[] = [];

    for (const orderId of args.orderIds) {
      const order = await ctx.db.get(orderId);
      if (!order || order.boutiqueId !== boutique._id) {
        throw new Error("Unauthorized: Order does not belong to your boutique.");
      }

      if (order.status === args.status) {
        results.push({ orderId, status: "unchanged" });
        continue;
      }

      if (!isValidTransition(order.status, args.status)) {
        results.push({ orderId, status: "error", message: `Cannot transition from ${order.status} to ${args.status}` });
        continue;
      }

      if (args.status === "pickup_scheduled") {
        try {
          assertHyperlocalTransitionPrerequisites(order, boutique);
        } catch (err: any) {
          results.push({ orderId, status: "error", message: err.message });
          continue;
        }
      }

      // Check if transitioning to cancelled/refunded
      const wasCancelledOrRefunded = order.status === "cancelled" || order.status === "refunded";
      const isNowCancelledOrRefunded = args.status === "cancelled" || args.status === "refunded";
      const isReversible = ["pending_payment", "pending_confirmation", "confirmed", "packed", "pickup_scheduled"].includes(order.status);

      if (!wasCancelledOrRefunded && isNowCancelledOrRefunded && isReversible) {
        await decrementBoutiqueOrderCount(ctx, order.boutiqueId, order);
        const orderItems = await ctx.db
          .query("orderItems")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect();

        const operator = await getCurrentUserOrNull(ctx);
        const operatorId = operator?._id ?? order.customerId;

        for (const item of orderItems) {
          const product = await ctx.db.get(item.productId);
          if (product) {
            const currentStock = product.stockBySize[item.variantSize] ?? 0;
            const newStock = currentStock + item.quantity;

            const stockBySize = { ...product.stockBySize };
            stockBySize[item.variantSize] = newStock;

            const beforeTotalStock = Object.values(product.stockBySize || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
            const totalStock = Object.values(stockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
            let active = product.active;
            let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;

            if (totalStock === 0) {
              active = false;
              autoDeactivatedBecauseOutOfStock = true;
            } else if (product.autoDeactivatedBecauseOutOfStock && beforeTotalStock === 0 && totalStock > 0) {
              active = true;
              autoDeactivatedBecauseOutOfStock = false;
            } else if (totalStock > 0) {
              autoDeactivatedBecauseOutOfStock = false;
            }

            await ctx.db.patch(product._id, {
              stockBySize,
              active,
              autoDeactivatedBecauseOutOfStock,
              updatedAt: now,
            });

            await ctx.db.insert("inventoryMovements", {
              productId: product._id,
              boutiqueId: product.boutiqueId,
              size: item.variantSize,
              beforeQty: currentStock,
              afterQty: newStock,
              adjustmentQty: item.quantity,
              reason: "online_order_reversal",
              source: "return",
              createdBy: operatorId,
              orderId: order._id,
              createdAt: now,
            });
          }
        }
      }

      const patch: Record<string, any> = {
        status: args.status,
        updatedAt: now,
      };
      if (args.status === "confirmed" && !order.confirmedAt) {
        patch.confirmedAt = now;
        patch.orderAcceptedAt = now;
        patch.acceptanceTimeoutAt = undefined;
      }
      if (args.status === "packed" && !order.packedAt) {
        patch.packedAt = now;
        patch.readyForPickupAt = now;
        const acceptedTime = order.orderAcceptedAt ?? order.confirmedAt ?? order.createdAt;
        patch.prepTimeDurationMinutes = Math.round((now - acceptedTime) / 60000);
      }
      if (args.status === "pickup_scheduled" && !order.readyForPickupAt) {
        patch.readyForPickupAt = now;
      }
      if (args.status === "pickup_scheduled" && !order.pickupScheduledAt) patch.pickupScheduledAt = now;
      if (args.status === "picked_up" && !order.pickedUpAt) patch.pickedUpAt = now;
      if (args.status === "in_transit" && !order.inTransitAt) patch.inTransitAt = now;
      if (args.status === "out_for_delivery" && !order.outForDeliveryAt) patch.outForDeliveryAt = now;
      if (args.status === "delivered" && !order.deliveredAt) {
        patch.deliveredAt = now;
        patch.claimWindowExpiresAt = now + 24 * 3600 * 1000;
      }
      if (args.status === "cancelled" && !order.cancelledAt) patch.cancelledAt = now;

      await ctx.db.patch(orderId, patch);

      // Record order activity for actor attribution (confirmed only for now)
      if (args.status === "confirmed") {
        await recordOrderActivity(ctx, {
          orderId: orderId,
          boutiqueId: order.boutiqueId,
          action: "confirmed",
          createdAt: now,
        });
      }

      const updatedOrder = await ctx.db.get(orderId);
      if (updatedOrder) {
        await handleOrderStatusChangeLedgerUpdates(ctx, updatedOrder, args.status, now);
      }

      // The background Porter task will be triggered by status change, but if this was a manual retry via `dispatchOrder`:
      // Actually, we don't have manual retry for porter yet. We will just leave this empty or throw.
      if (args.status === "packed") {
        // Intentionally empty: automatic courier dispatch is triggered in downstream provider action.
      }

      const targetStatuses = ["confirmed", "packed", "out_for_delivery", "delivered"];
      if (targetStatuses.includes(args.status)) {
        await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
          orderId,
          event: args.status as "confirmed" | "packed" | "out_for_delivery" | "delivered",
        });
      }

      if (args.status === "cancelled") {
        // TODO: wire logistics cancellation here

        const isWhatsAppEnabled = boutique?.whatsAppNotificationsEnabled ?? true;
        const recipientPhone = boutique?.notificationPhone || boutique?.phone;
        const cancelReason = order.cancelReason || "Cancelled by boutique owner";

        if (boutique?.email || boutique?.ownerEmail) {
          await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
            to: boutique.email || boutique.ownerEmail,
            subject: `Order Cancelled - ${order.orderNumber}`,
            html: `<p>Dear ${boutique.ownerName || "Merchant"},</p><p>Order ${order.orderNumber} has been cancelled. Reason: ${cancelReason}</p>`,
            templateName: "order_cancelled",
          });
        }

        const customerUser = await ctx.db.get(order.customerId);
        const customerPhone = order.deliveryAddress?.phone || customerUser?.phone;
        if (customerPhone) {
          const refundAmount = ((order.total ?? 0) / 100).toFixed(2);
          await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
            recipient: customerPhone,
            templateName: "hive_order_declined",
            parameters: [
              order.orderNumber,
              refundAmount,
            ],
            languageCode: "en",
          });
        }

        const invoice = await ctx.db
          .query("invoices")
          .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
          .unique();
        const customerEmail = invoice?.customerEmail || customerUser?.email;
        if (customerEmail) {
          await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
            to: customerEmail,
            subject: `Your Hive Order ${order.orderNumber} has been Cancelled`,
            html: `<p>Dear Customer,</p><p>Your order ${order.orderNumber} has been cancelled. Reason: ${cancelReason}. A refund will be initiated if applicable.</p>`,
            templateName: "order_cancelled_customer",
          });
        }
      }

      results.push({ orderId, status: "success" });
    }

    return results;
  },
});

/**
 * Fetch a single order for the boutique workspace.
 * Validates boutique ownership.
 */
export const getBoutiqueOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    const order = await ctx.db.get(args.orderId);
    if (!order || order.boutiqueId !== boutique._id) {
      return null;
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
      .unique();

    const customerProfile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", order.customerId))
      .unique();

    const customerUser = await ctx.db.get(order.customerId);

    const shipment = order.shipmentId ? await ctx.db.get(order.shipmentId) : null;

    return {
      ...order,
      items,
      invoiceNumber: invoice?.invoiceNumber || null,
      customerPhone: customerUser?.phone || invoice?.customerPhone || null,
      customerName: customerProfile?.displayName || "Customer",
      boutiqueName: boutique.boutiqueName || boutique.name || "Boutique",
      shipment: shipment ? {
        _id: shipment._id,
        provider: shipment.provider,
        providerBookingId: shipment.providerBookingId || shipment.awbNumber || null,
        awbNumber: shipment.awbNumber || null,
        status: shipment.status,
        trackingUrl: shipment.trackingUrl || null,
        driverName: shipment.driverName || null,
        driverPhone: shipment.driverPhone || null,
        vehiclePlate: shipment.vehiclePlate || null,
        etaMinutes: shipment.etaMinutes ?? null,
        liveTrackingUrl: shipment.liveTrackingUrl || null,
      } : null,
    };
  },
});

/**
 * Validate a promotional coupon code and return its status and discount.
 * Public customer query.
 */
export const validatePromoCode = query({
  args: {
    code: v.string(),
    subtotal: v.number(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    let discount = 0;
    let success = false;
    let message = "";

    if (code === "WELCOME10") {
      discount = Math.round(args.subtotal * 0.1);
      success = true;
      message = "WELCOME10 applied: 10% discount.";
    } else if (code === "HIVEFIRST") {
      discount = Math.min(500, args.subtotal);
      success = true;
      message = "HIVEFIRST applied: Flat ₹500 discount.";
    } else if (code === "FREESHIP") {
      discount = 0;
      success = true;
      message = "FREESHIP applied: Free shipping activated.";
    } else {
      message = "Invalid coupon code.";
    }

    return { success, discount, message };
  },
});

export const checkMerchantSLATimeouts = internalMutation({
  args: {},
  handler: async (ctx) => {
    // SLA Timeout check deactivated per user requirement: 45-Minute Acceptance SLA removed
    console.log("[MerchantSLATimeouts] SLA timeouts sweep bypassed/disabled.");
    return { warnedCount: 0, cancelledCount: 0 };
  },
});

export const reconcileBoutiquePayouts = mutation({
  args: {
    boutiqueId: v.string(),
    orderIds: v.array(v.id("orders")),
    utrNumber: v.string(),
    netSettledAmount: v.number(),
    settledAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    if (args.utrNumber.length < 10) {
      throw new Error("Invalid UTR number length.");
    }

    let calculatedTotalNet = 0;

    for (const orderId of args.orderIds) {
      const order = await ctx.db.get(orderId);
      
      if (!order) {
        throw new Error(`Order ${orderId} not found in database.`);
      }
      
      // Defensive Check: Prevent double-settlement of funds
      if (order.payoutStatus === "settled") {
        throw new Error(`Order ${orderId} has already been settled via UTR: ${order.payoutDetails?.utrNumber}`);
      }

      // Re-calculate the 18% fee + 1% TCS logic dynamically to ensure data integrity
      const gross = order.total || 0;
      const base = order.subtotal || 0;
      const hiveFee = Math.round(base * 0.18);
      // Logistics drag for manual settlement
      const logisticsDrag = order.deliveryFee || 0;
      const gstTcs = Math.round(base * 0.01);
      const netDisbursement = gross - hiveFee - logisticsDrag - gstTcs;

      calculatedTotalNet += netDisbursement;

      await ctx.db.patch(orderId, {
        payoutStatus: "settled",
        payoutDetails: {
          settledAt: args.settledAt,
          utrNumber: args.utrNumber,
          netSettlement: netDisbursement,
        }
      });
    }

    // Optional verification that the front-end calculation matched the server math
    // But we write it anyway as source of truth.
    if (Math.abs(calculatedTotalNet - args.netSettledAmount) > 10) {
      console.warn(`[reconcileBoutiquePayouts] Mismatch in netSettledAmount. Expected ${calculatedTotalNet}, got ${args.netSettledAmount}`);
    }

    return { success: true, processedOrdersCount: args.orderIds.length };
  },
});

export const debugOrder = query({
  args: { orderNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    let ordersList: any[] = [];
    if (args.orderNumber) {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_orderNumber", (q) => q.eq("orderNumber", args.orderNumber!))
        .unique();
      if (order) ordersList = [order];
    }
    if (ordersList.length === 0) {
      ordersList = await ctx.db.query("orders").order("desc").take(500);
    }
    const results = await Promise.all(
      ordersList.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect();
        return {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          boutiqueId: order.boutiqueId,
          totalAmount: order.totalAmount,
          orderSnapshot: order.orderSnapshot,
          itemsCount: items.length,
          items: items.map(it => ({
            _id: it._id,
            productName: it.productName,
            quantity: it.quantity,
            basePriceAtPurchase: it.basePriceAtPurchase,
            priceAtPurchase: it.priceAtPurchase,
            platformFeeAmount: it.platformFeeAmount
          }))
        };
      })
    );
    return results;
  }
});

// ─── SHIPMENT CREATION (internal, called from readyForPickupAction) ──────────
export const createShipmentForOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    boutiqueName: v.string(),
    boutiqueAddress: v.string(),
    boutiqueCity: v.string(),
    boutiqueState: v.string(),
    boutiquePincode: v.string(),
    boutiquePhone: v.string(),
    customerName: v.string(),
    customerLine1: v.string(),
    customerLine2: v.string(),
    customerCity: v.string(),
    customerState: v.string(),
    customerPincode: v.string(),
    customerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const shipmentId = await ctx.db.insert("shipments", {
      orderId: args.orderId,
      provider: "porter",
      status: "created",
      awbNumber: "",
      trackingUrl: "",
      rawWebhookEvents: [],
      pickupAddress: {
        name: args.boutiqueName,
        line1: args.boutiqueAddress,
        city: args.boutiqueCity,
        state: args.boutiqueState,
        pincode: args.boutiquePincode,
        phone: args.boutiquePhone,
      },
      deliveryAddress: {
        name: args.customerName,
        line1: args.customerLine1,
        line2: args.customerLine2,
        city: args.customerCity,
        state: args.customerState,
        pincode: args.customerPincode,
        phone: args.customerPhone,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.orderId, { shipmentId });
    return shipmentId;
  },
});

// ─── READY FOR PICKUP (seller action → Porter booking) ─────────────────────
export const readyForPickupAction = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    // 1. Fetch order
    const order = await ctx.runQuery(internal.orders.getOrderByIdInternal, { orderId: args.orderId });
    if (!order) throw new Error("Order not found.");

    // 2. Validate boutique ownership
    const boutique = await ctx.runQuery(api.boutiques.getMyBoutiqueDetails);
    if (!boutique || boutique._id !== order.boutiqueId) {
      throw new Error("Unauthorized: Order does not belong to your boutique.");
    }

    // 3. Assert valid status — auto-pack confirmed orders (Mark as Packed step removed for UX)
    if (order.status === "confirmed") {
      await ctx.runMutation(api.orders.updateBoutiqueOrderStatus, {
        orderId: args.orderId,
        status: "packed",
      });
    } else if (order.status !== "packed" && order.status !== "booking_failed") {
      throw new Error(`Cannot dispatch: order is in '${order.status}' status. Must be 'confirmed', 'packed' or 'booking_failed'.`);
    }

    // 4. Create shipment if one doesn't exist
    let shipmentId = order.shipmentId;
    if (!shipmentId) {
      const customer = await ctx.runQuery(internal.orders.getOrderByIdInternal, { orderId: args.orderId });
      shipmentId = await ctx.runMutation(internal.orders.createShipmentForOrder, {
        orderId: args.orderId,
        boutiqueName: boutique.boutiqueName || "Boutique",
        boutiqueAddress: boutique.address || "",
        boutiqueCity: boutique.addressDetails?.city || boutique.city || "",
        boutiqueState: boutique.addressDetails?.state || boutique.state || "",
        boutiquePincode: boutique.addressDetails?.pincode || boutique.pincode || "",
        boutiquePhone: boutique.phone || "",
        customerName: order.customerName || "Customer",
        customerLine1: order.deliveryAddress?.line1 || order.deliveryAddress?.formattedAddress || "",
        customerLine2: order.deliveryAddress?.line2 || order.deliveryAddress?.houseNumber || "",
        customerCity: order.deliveryAddress?.city || "",
        customerState: order.deliveryAddress?.state || "",
        customerPincode: order.deliveryAddress?.pincode || "",
        customerPhone: order.deliveryAddress?.phone || "",
      });
    }

    // 5. Call Porter createOrder
    try {
      console.log(`[PORTER] Booking rider for order ${order.orderNumber}...`);

      const pickupAddress = buildBoutiquePorterAddress(boutique);
      const dropAddress = buildCustomerPorterAddress(
        order.deliveryAddress,
        order.customerName || "Customer"
      );
      assertPorterAddressUsable(pickupAddress, "pickup");
      assertPorterAddressUsable(dropAddress, "drop");

      const result = await ctx.runAction(internal.lib.porter.createOrder, {
        orderId: args.orderId,
        shipmentId: shipmentId,
        pickupAddress,
        dropAddress,
        orderNumber: order.orderNumber,
        deliveryInstructions: order.deliveryAddress.deliveryInstructions,
      });

      console.log(`[PORTER] Booking success for ${order.orderNumber} — CRN: ${result.crn}`);

      // 6. On success → pickup_scheduled
      await ctx.runMutation(api.orders.updateBoutiqueOrderStatus, {
        orderId: args.orderId,
        status: "pickup_scheduled",
      });

      return { success: true, crn: result.crn, trackingUrl: result.trackingUrl };

    } catch (err: any) {
      console.error(`[PORTER] Booking failed for ${order.orderNumber}:`, err);

      // 7. On failure → booking_failed, save error
      await ctx.runMutation(api.orders.updateBoutiqueOrderStatus, {
        orderId: args.orderId,
        status: "booking_failed",
      });

      // Record failure details on shipment
      await ctx.runMutation(internal.adminLogistics.updateShipmentDetails, {
        shipmentId: shipmentId,
        awbNumber: "",
        trackingUrl: "",
        status: "booking_failed",
      });

      throw new Error(`Porter booking failed: ${err.message}`);
    }
  },
});

export const getById = internalQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateTransferStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    transferStatus: v.union(
      v.literal("pending"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("reversed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      transferStatus: args.transferStatus,
      payoutStatus: args.transferStatus === "processed" ? "settled" : undefined,
    });
  },
});

/**
 * Admin gate for the manual payout retry path.
 *
 * Runs inside the retry action so the Clerk identity is still available. Only
 * "failed" or stuck "processing" payouts can be retried; an already-paid order
 * is rejected here so the caller never reaches the Razorpay transfer call.
 */
export const requirePayoutRetryPermission = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    if (order.razorpayTransferId || order.payoutStatus === "paid" || order.payoutStatus === "settled") {
      throw new ConvexError("Payout already transferred for this order.");
    }
    if (order.status !== "delivered") {
      throw new ConvexError("Order is not delivered yet.");
    }

    const STUCK_PROCESSING_MS = 10 * 60 * 1000;
    const isStuckProcessing =
      order.payoutStatus === "processing" &&
      Date.now() - (order.updatedAt ?? 0) > STUCK_PROCESSING_MS;

    if (order.payoutStatus !== "failed" && order.payoutStatus !== "eligible" && !isStuckProcessing) {
      throw new ConvexError(
        `Payout status '${order.payoutStatus}' cannot be retried yet.`
      );
    }

    return { success: true };
  },
});

// v2: Payout status lifecycle mutation
export const patchOrderPayoutStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    payoutStatus: v.union(
      v.literal("pending"),
      v.literal("not_eligible"),
      v.literal("eligible"),
      v.literal("processing"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("settled"),
      v.literal("withheld")
    ),
    payoutEligibleAt: v.optional(v.number()),
    payoutProcessedAt: v.optional(v.number()),
    payoutFailureReason: v.optional(v.string()),
    razorpayTransferId: v.optional(v.string()),
    // Pass null to clear an indefinite hold marker; omit to leave unchanged.
    payoutHoldUntil: v.optional(v.union(v.number(), v.null())),
    payoutHoldReason: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      payoutStatus: args.payoutStatus,
      updatedAt: Date.now(),
    };
    if (args.payoutEligibleAt !== undefined) patch.payoutEligibleAt = args.payoutEligibleAt;
    if (args.payoutProcessedAt !== undefined) patch.payoutProcessedAt = args.payoutProcessedAt;
    if (args.payoutFailureReason !== undefined) patch.payoutFailureReason = args.payoutFailureReason;
    if (args.payoutHoldUntil !== undefined) {
      patch.payoutHoldUntil = args.payoutHoldUntil ?? undefined;
    }
    if (args.payoutHoldReason !== undefined) {
      patch.payoutHoldReason = args.payoutHoldReason ?? undefined;
    }
    if (args.razorpayTransferId !== undefined) {
      patch.razorpayTransferId = args.razorpayTransferId;
      patch.transferStatus = "processed";
    }
    await ctx.db.patch(args.orderId, patch);
    // Route has paid the seller. Close their ledger accrual against it, so the
    // same money cannot also show as owed and be paid a second time.
    if (args.payoutStatus === "paid") {
      await recordRoutePayoutInLedger(ctx, args.orderId, args.payoutProcessedAt ?? Date.now());
    }
  },
});

// ─── SLA: Order Acceptance Timeout ───────────────────────────────────────────
// Scheduled by placeOrder: fires at 15 min (warning) and 45 min (auto-cancel)
export const checkOrderAcceptanceSLA = internalAction({
  args: {
    orderId:   v.id("orders"),
    alertType: v.union(v.literal("warning"), v.literal("auto_cancel")),
  },
  handler: async (ctx, args) => {
    const order: any = await ctx.runQuery(internal.orders.getOrderByIdInternal, {
      orderId: args.orderId,
    });

    if (!order) return; // Order deleted or missing

    // If already accepted/cancelled, do nothing
    if (order.status !== "pending_confirmation") return;

    const slackWebhook = process.env.SLACK_WEBHOOK_ORDERS_URL || process.env.SLACK_WEBHOOK_URL;
    const boutique = order.boutiqueName || "Unknown Boutique";
    const customerPhone = order.deliveryAddress?.phone || "Unknown";
    const minutesElapsed = Math.round((Date.now() - order.createdAt) / 60000);
    const sellerPhone = order.boutiquePhone || "Not configured";
    const staffContacts = [
      order.boutiqueStaffPhone1 ? `Staff 1: ${order.boutiqueStaffPhone1}` : null,
      order.boutiqueStaffPhone2 ? `Staff 2: ${order.boutiqueStaffPhone2}` : null,
    ].filter(Boolean).join(" | ");

    if (args.alertType === "warning") {
      // ── 10-min: Slack warning only ─────────────────────────────────────────
      await ctx.runMutation(internal.orders.markSlaAlertFired, { orderId: args.orderId });
      if (slackWebhook) {
        await ctx.runAction(internal.whatsapp.sendSlackAlert, {
          webhook: slackWebhook,
          text:
            `⚠️ *ORDER NOT ACCEPTED — SLA WARNING (10 MIN)*\n` +
            `*Order:* #${order.orderNumber}\n` +
            `*Store:* *${boutique}* (${order.boutiqueOwnerName || "Owner"})\n` +
            `*📞 Seller Phone:* \`${sellerPhone}\`${staffContacts ? `\n*Staff Contacts:* ${staffContacts}` : ""}\n` +
            `*Customer:* ${order.customerName || "Customer"} (\`${customerPhone}\`)\n` +
            `*Order Value:* ₹${((order.total ?? 0) / 100).toFixed(2)} (${(order.items || []).length} item(s))\n` +
            `*Time Elapsed:* ${minutesElapsed} min\n` +
            `*🚨 Ops Action Required:* Call seller immediately at \`${sellerPhone}\` to accept order before auto-cancel fires at 45 min.`,
        });
      }
      return;
    }

    // ── 45-min: Auto-cancel ────────────────────────────────────────────────
    // Mark as cancelled with SLA reason
    await ctx.runMutation(internal.orders.autoSlaCancel, {
      orderId: args.orderId,
      reason: "Seller did not accept within 45 minutes",
    });

    const total = ((order.total ?? 0) / 100).toFixed(2);
    const brandedMsg =
      `We're sorry! Due to high demand, the boutique was unable to confirm your order on time. ` +
      `A full refund of \u20b9${total} has been initiated and will be credited within approximately 1 hour.`;

    // Notify customer on WhatsApp
    if (customerPhone && customerPhone !== "Unknown") {
      await ctx.runAction(internal.whatsapp.sendTemplateMessage, {
        recipient: customerPhone,
        templateName: "hive_order_declined",
        parameters: [order.orderNumber, total],
        languageCode: "en",
      });
    }

    // Notify customer via email
    await ctx.runAction(internal.emails.sendOrderEmail, {
      orderId: args.orderId,
      event: "cancelled",
    });

    // Slack escalation
    if (slackWebhook) {
      await ctx.runAction(internal.whatsapp.sendSlackAlert, {
        webhook: slackWebhook,
        text:
          `🚨 *AUTO-CANCELLED: SELLER SLA TIMEOUT (45 MIN)*\n` +
          `*Order:* #${order.orderNumber}\n` +
          `*Store:* *${boutique}* (${order.boutiqueOwnerName || "Owner"})\n` +
          `*📞 Seller Phone:* \`${sellerPhone}\`${staffContacts ? `\n*Staff Contacts:* ${staffContacts}` : ""}\n` +
          `*Customer:* ${order.customerName || "Customer"} (\`${customerPhone}\`)\n` +
          `*Time Elapsed:* ${minutesElapsed} min\n` +
          `*Refund:* \u20b9${total} — Pending manual processing\n` +
          `*Action:* Refund customer in Razorpay dashboard`,
      });
    }
  },
});

// Mark SLA 15-min alert as fired (so admin panel can show the warning badge)
export const markSlaAlertFired = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, { slaAlertFiredAt: Date.now() });
  },
});

// Auto-cancel an order due to SLA timeout
export const autoSlaCancel = internalMutation({
  args: {
    orderId: v.id("orders"),
    reason:  v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "pending_confirmation") return;
    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status:              "cancelled",
      cancelledAt:         now,
      internalCancelReason: args.reason,
      cancelReason:        "Order auto-cancelled: seller did not respond in time",
      refundStatus:        "pending",
      slaAutoCancelledAt:  now,
      updatedAt:           now,
    });
  },
});

// Periodic safety cron: Sweep any unaccepted orders > 45 minutes
export const sweepUnacceptedOrdersSLA = internalMutation({
  args: {},
  handler: async (ctx) => {
    const fortyFiveMinutesAgo = Date.now() - 45 * 60 * 1000;
    const allPending = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "pending_confirmation"))
      .collect();

    const overdueOrders = allPending.filter((o) => {
      const created = o.createdAt || o._creationTime;
      return created < fortyFiveMinutesAgo;
    });

    const now = Date.now();
    let count = 0;
    for (const order of overdueOrders) {
      await ctx.db.patch(order._id, {
        status: "cancelled",
        cancelledAt: now,
        internalCancelReason: "Seller did not accept within 45 minutes (Safety Cron Sweep)",
        cancelReason: "Order auto-cancelled: seller did not respond in time",
        slaAutoCancelledAt: now,
        updatedAt: now,
      });
      await refundCancelledOrder(ctx, {
        orderId: order._id,
        reason: `Auto-cancelled, seller did not accept order ${order.orderNumber}`,
        idempotencySuffix: "sla_sweep",
      });
      count++;
    }

    return { cancelledCount: count };
  },
});

// Admin manual 1-tap trigger to purge all unaccepted orders > 45 minutes
export const triggerSlaOrderSweepAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const fortyFiveMinutesAgo = Date.now() - 45 * 60 * 1000;
    const allPending = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "pending_confirmation"))
      .collect();

    const overdueOrders = allPending.filter((o) => {
      const created = o.createdAt || o._creationTime;
      return created < fortyFiveMinutesAgo;
    });

    const now = Date.now();
    let count = 0;
    for (const order of overdueOrders) {
      await ctx.db.patch(order._id, {
        status: "cancelled",
        cancelledAt: now,
        internalCancelReason: "Seller did not accept within 45 minutes (Admin SLA Sweep)",
        cancelReason: "Order auto-cancelled: seller did not respond in time",
        slaAutoCancelledAt: now,
        updatedAt: now,
      });
      await refundCancelledOrder(ctx, {
        orderId: order._id,
        reason: `Auto-cancelled, seller did not accept order ${order.orderNumber}`,
        idempotencySuffix: "sla_sweep",
      });
      count++;
    }

    return { cancelledCount: count };
  },
});

