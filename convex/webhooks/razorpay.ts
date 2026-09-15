// convex/webhooks/razorpay.ts
// Razorpay webhook receiver and status updater mutation processors.

import { httpAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { validateProductSizeAndStock, MOCK_INVENTORY } from "../lib/mockInventory";
import { triggerNotification } from "../lib/notifications";
import { calculateDeliveryQuoteAction } from "../routing";
import { incrementBoutiqueOrderCount } from "../lib/boutiqueCounters";
import { restoreCheckoutSessionStock } from "../lib/inventory";
import { resolveOrderReturnsAccepted, resolveOrderExchangesAccepted } from "../lib/returnPolicy";
import { applyCouponToOrder } from "../coupons";

// ─── HMAC-SHA256 Signature Verification ──────────────────────────────────────
async function verifyRazorpayWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payload);
    const secretBytes = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadBytes);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const localHexSignature = signatureArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return localHexSignature === signature;
  } catch (err) {
    console.error("[RazorpayWebhookVerify] Cryptographic signature check error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Endpoint Action
// ─────────────────────────────────────────────────────────────────────────────
export const handleRazorpayWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // HARD GATE: Reject all webhook calls if the secret is not configured on the server
  if (!webhookSecret) {
    console.error("[RazorpayWebhook] RAZORPAY_WEBHOOK_SECRET is not configured. Rejecting request.");
    return new Response("Webhook secret not configured", { status: 401 });
  }

  const razorpaySignature = request.headers.get("x-razorpay-signature");
  if (!razorpaySignature) {
    console.error("[RazorpayWebhook] Missing x-razorpay-signature header.");
    return new Response("Missing signature header", { status: 400 });
  }

  const payload = await request.text();

  const isVerified = await verifyRazorpayWebhookSignature(payload, razorpaySignature, webhookSecret);
  if (!isVerified) {
    console.error("[RazorpayWebhook] Webhook signature verification failed.");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const eventId = event.id || `evt_${Math.random().toString(36).substring(2, 12)}`;
  const eventType = event.event;

  console.log(`[RazorpayWebhook] Received event: ${eventType} (ID: ${eventId})`);

  // SECURITY: Validate webhook timestamp to prevent replay attacks
  const eventTimestamp = event.created_at; // Razorpay includes Unix timestamp
  if (eventTimestamp) {
    const now = Math.floor(Date.now() / 1000);
    const age = Math.abs(now - eventTimestamp);
    const MAX_WEBHOOK_AGE_SECONDS = 300; // 5 minutes

    if (age > MAX_WEBHOOK_AGE_SECONDS) {
      console.warn(`[RazorpayWebhook] Rejected stale webhook: ${age}s old, eventId=${eventId}`);
      return new Response('Webhook timestamp outside valid window', { status: 400 });
    }
  }

  // Record webhook log atomically to prevent concurrent processing races
  const recordResult = await ctx.runMutation(internal.webhooks.razorpay.recordWebhookEvent, {
    eventId,
    eventType,
    payload,
  });

  if (recordResult.isDuplicate) {
    return new Response(recordResult.responseText, { status: recordResult.status });
  }

  const logId = recordResult.logId!;

  try {
    const paymentData = event.payload?.payment?.entity;
    if (paymentData) {
      const razorpayOrderId = paymentData.order_id;
      const razorpayPaymentId = paymentData.id;
      const method = paymentData.method;

      if (eventType === "payment.captured") {
        await ctx.runMutation(internal.webhooks.razorpay.processPaymentCaptured, {
          razorpayOrderId,
          razorpayPaymentId,
          method,
        });
      } else if (eventType === "payment.failed") {
        await ctx.runMutation(internal.webhooks.razorpay.processPaymentFailed, {
          razorpayOrderId,
          razorpayPaymentId,
          errorReason: paymentData.error_description || "Unknown payment failure reason",
        });
      }
    }

    // Mark processed
    await ctx.runMutation(internal.webhooks.razorpay.updateWebhookEventStatus, {
      id: logId,
      status: "processed",
    });
  } catch (err: any) {
    console.error(`[RazorpayWebhook] Error processing event ${eventType}:`, err);
    await ctx.runMutation(internal.webhooks.razorpay.updateWebhookEventStatus, {
      id: logId,
      status: "failed",
      error: err.message || String(err),
    });
    return new Response("Error processing event", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries & Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const getWebhookEvent = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_eventId", (q) => q.eq("source", "razorpay").eq("eventId", args.eventId))
      .first();
  },
});

export const recordWebhookEvent = internalMutation({
  args: {
    eventId:   v.string(),
    eventType: v.string(),
    payload:   v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_eventId", (q) => q.eq("source", "razorpay").eq("eventId", args.eventId))
      .first();

    if (existing) {
      if (existing.status === "processed") {
        return { isDuplicate: true, responseText: "Event already processed", status: 200 };
      }
      if (existing.status === "received") {
        // Currently being processed by another handler — don't allow concurrent processing
        return { isDuplicate: true, responseText: "Event is currently being processed", status: 200 };
      }
      // status === "failed" — allow Razorpay retry: reset to "received" and re-process
      await ctx.db.patch(existing._id, { status: "received", error: undefined, processedAt: undefined });
      return { isDuplicate: false, logId: existing._id };
    }

    const id = await ctx.db.insert("webhookEvents", {
      source: "razorpay",
      eventId: args.eventId,
      eventType: args.eventType,
      payload: args.payload,
      status: "received",
      idempotencyKey: args.eventId,
      createdAt: Date.now(),
    });
    return { isDuplicate: false, logId: id };
  },
});

export const updateWebhookEventStatus = internalMutation({
  args: {
    id:     v.id("webhookEvents"),
    status: v.union(v.literal("received"), v.literal("processed"), v.literal("failed"), v.literal("duplicate")),
    error:  v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      error: args.error,
      processedAt: Date.now(),
    });
  },
});

// Mutation: processPaymentCaptured (Invoked by Webhook)
export const processPaymentCaptured = internalMutation({
  args: {
    razorpayOrderId:   v.string(),
    razorpayPaymentId: v.string(),
    method:            v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .first();

    if (!payment) {
      throw new Error(`Payment record not found for Razorpay Order ID: ${args.razorpayOrderId}`);
    }

    if (payment.status === "captured") {
      return { success: true, message: "Payment already captured." };
    }

    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .first();

    if (!session) {
      throw new Error(`CheckoutSession not found for Razorpay Order ID: ${args.razorpayOrderId}`);
    }

    // Order Creation Idempotency Check
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", session._id))
      .first();

    if (existingOrder) {
      return { success: true, orderId: existingOrder._id, orderNumber: existingOrder.orderNumber };
    }

    const now = Date.now();

    // SECURITY: Validate payment amount matches expected session total
    const capturedAmountPaise = payment.amount;
    const expectedAmountPaise = session.total;
    const tolerancePaise = 100; // ₹1 tolerance for rounding

    if (Math.abs(capturedAmountPaise - expectedAmountPaise) > tolerancePaise) {
      console.error(`[PaymentCaptured] Amount mismatch: captured=${capturedAmountPaise}, expected=${expectedAmountPaise}`);
      throw new Error(`Payment amount mismatch: captured ${capturedAmountPaise} paise, expected ${expectedAmountPaise} paise`);
    }

    // Check if session is already completed or expired
    if (session.status === "completed") {
      return { success: true, message: "Session already completed." };
    }

    if (session.status === "processing") {
      throw new Error("Checkout session is currently being processed by another transaction. Concurrency lock active.");
    }

    if (session.status === "expired" || session.expiresAt < now) {
      await ctx.db.patch(session._id, { status: "expired" });

      // C4 FIX: Payment was captured but session expired — enqueue automatic refund
      // instead of throwing (which would leave customer charged with no order/refund).
      await ctx.db.patch(payment._id, {
        status: "captured",
        razorpayPaymentId: args.razorpayPaymentId,
        updatedAt: now,
      });

      await ctx.db.insert("paymentEvents", {
        source: "razorpay",
        paymentId: payment._id,
        eventType: "failed",
        payload: JSON.stringify({ reason: "expired_capture_refund", detail: "Payment captured after checkout session expired. Auto-refund queued." }),
        createdAt: now,
      });

      // Deterministic idempotency key ensures this refund is never duplicated
      const idempotencyKey = `expired_capture_${session._id}_${args.razorpayPaymentId}`;
      const existingRefund = await ctx.db
        .query("refundQueue")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first();

      if (!existingRefund) {
        await ctx.db.insert("refundQueue", {
          paymentId: payment._id,
          reason: "Payment captured after checkout session expired. Automatic refund.",
          amountPaise: payment.amount,
          status: "pending",
          idempotencyKey,
          createdAt: now,
        });
      }

      console.warn(`[RazorpayWebhook] Session ${session._id} expired but payment ${args.razorpayPaymentId} captured. Auto-refund queued.`);
      // Return success to Razorpay to prevent further retries
      return { success: true, message: "Session expired. Payment captured — automatic refund queued." };
    }

    if (session.status === "failed") {
      throw new Error("Checkout session failed.");
    }

    // Set lock immediately
    await ctx.db.patch(session._id, { status: "processing" });

    // Capture payment record
    await ctx.db.patch(payment._id, {
      status: "captured",
      razorpayPaymentId: args.razorpayPaymentId,
      method: args.method,
      updatedAt: now,
    });
    
    await ctx.db.insert("paymentEvents", {
      source: "razorpay",
      paymentId: payment._id,
      eventType: "captured",
      payload: JSON.stringify({ razorpayPaymentId: args.razorpayPaymentId }),
      createdAt: now,
    });

    // Resolve boutiqueId from session items
    let boutiqueId: Id<"boutiques"> | undefined = undefined;
    for (const item of session.items) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", item.productId))
        .unique();
      let productRow = product;
      if (!productRow) {
        try {
          productRow = await ctx.db.get(item.productId as Id<"products">);
        } catch {}
      }
      if (productRow) {
        boutiqueId = productRow.boutiqueId;
        break;
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
      throw new Error("No boutique found to fulfill this order.");
    }

    const boutique = await ctx.db.get(boutiqueId);
    if (!boutique) {
      throw new Error("Boutique not found.");
    }
    const boutiqueName = boutique.boutiqueName || boutique.name || "Unknown Boutique";

    // v2: Build pricing snapshot from checkout session items (authoritative, not recalculated)
    // Commission fields come from the checkout session items which were calculated by the pricing engine
    let sellerCommissionPaise = 0;
    let sellerCommissionGstPaise = 0;
    let sellerPayoutPaise = 0;
    let sellerCommissionPercent = 0;
    let sellerTierKey = (boutique as any).pricingTier || "bronze";
    let sellerTierName = "Bronze";

    for (const item of session.items) {
      const itemAny = item as any;
      sellerCommissionPaise += (itemAny.sellerCommissionPaise || 0) * item.quantity;
      sellerCommissionGstPaise += (itemAny.sellerCommissionGstPaise || 0) * item.quantity;
      sellerPayoutPaise += (itemAny.sellerPayoutPaise || 0) * item.quantity;
      if (itemAny.sellerCommissionPercent) {
        sellerCommissionPercent = itemAny.sellerCommissionPercent;
      }
    }

    // Compute pricing and snapshot using centralized engine
    const { getPlatformConfig: getPlatformConfigFn, calculateCheckoutPricing: calculateCheckoutPricingFn } = await import("../pricingService");
    const platformConfig = await getPlatformConfigFn(ctx);
    const checkoutPricing = calculateCheckoutPricingFn(
      session.items.map((item: any) => ({
        // Session item prices are rupees; see payments.ts placeOrderFromSession.
        sellerBasePricePaise: item.sellerBasePricePaise ?? Math.round(item.price * 100),
        quantity: item.quantity,
      })),
      session.deliveryFee ?? 0,
      session.discount ?? 0,
      sellerTierKey,
      platformConfig
    );

    const pricingSnapshot = {
      productSubtotalPaise: checkoutPricing.productSubtotalPaise,
      handlingChargePaise: checkoutPricing.handlingChargePaise,
      platformFeePaise: checkoutPricing.platformFeePaise,
      platformChargesGstPaise: checkoutPricing.platformChargesGstPaise,
      deliveryFeePaise: checkoutPricing.deliveryFeePaise,
      discountPaise: checkoutPricing.discountPaise,
      totalPayablePaise: checkoutPricing.totalPayablePaise,
      sellerTierKey: checkoutPricing.sellerTierKey,
      sellerTierName: checkoutPricing.sellerTierName,
      slabMinPrice: checkoutPricing.slabMinPrice,
      slabMaxPrice: checkoutPricing.slabMaxPrice,
      sellerCommissionPercent: checkoutPricing.sellerCommissionPercent,
      sellerCommissionPaise: checkoutPricing.sellerCommissionPaise,
      sellerCommissionGstPaise: checkoutPricing.sellerCommissionGstPaise,
      sellerPayoutPaise: checkoutPricing.sellerPayoutPaise,
      gstRatePercent: checkoutPricing.gstRatePercent,
      handlingChargeConfigPaise: checkoutPricing.handlingChargeConfigPaise,
      platformFeeConfigPaise: checkoutPricing.platformFeeConfigPaise,
      gstRateConfigPercent: checkoutPricing.gstRateConfigPercent,
      sellerCommissionConfigPercent: checkoutPricing.sellerCommissionConfigPercent,
    };


    // P0-4 FIX: Collision-resistant order number using timestamp (base36) + random suffix
    const orderNumber = `HIVE-${Math.floor(now / 1000).toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Calculate delivery quote beforehand to populate snapshot with actual estimations
    let quote = { serviceable: false, estimatedCourierCost: 9000, estimatedPorterCost: 9000, distanceKm: 5.5, etaMinutes: 45, customerPaidFee: session.deliveryFee };
    try {
      const resolvedQuote = await calculateDeliveryQuoteAction(ctx.db, {
        userLat: session.addressSnapshot.lat,
        userLng: session.addressSnapshot.lng,
        boutiqueId,
        subtotal: session.subtotal,
      });
      if (resolvedQuote.serviceable) {
        quote = {
          serviceable: true,
          estimatedCourierCost: resolvedQuote.estimatedCourierCost ?? 9000,
          estimatedPorterCost: resolvedQuote.estimatedPorterCost ?? 9000,
          distanceKm: resolvedQuote.distanceKm ?? 5.5,
          etaMinutes: resolvedQuote.etaMinutes ?? 45,
          customerPaidFee: resolvedQuote.customerPaidFee ?? session.deliveryFee,
        };
      }
    } catch (e) {
      console.error("[RazorpayWebhookPlaceOrder] Quote calculation failed, using defaults:", e);
    }

    const orderSnapshot = {
      boutiqueName,
      boutiqueId,
      items: session.items.map(item => ({
        productId: item.productId as Id<"products">,
        productName: item.name,
        size: item.size,
        sku: `SKU-${orderNumber}-${item.productId}-${item.size}`,
        priceAtPurchase: item.price,
        quantity: item.quantity,
      })),
      deliveryFee: session.deliveryFee,
      commissionRate: sellerCommissionPercent,
      addressSnapshot: session.addressSnapshot,
      orderValue: session.total,
      platformCommissionAmount: sellerCommissionPaise,
      platformCommissionRate: sellerCommissionPercent,
      courierQuote: {
        estimatedPorterCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 9000,
        estimatedCourierCost: quote.estimatedCourierCost ?? 9000,
        distanceKm: quote.distanceKm,
        etaMinutes: quote.etaMinutes,
      },
      merchantOperatingModel: boutique.sellerModel || "boutique",
      payoutHoldDays: 2,
      taxBreakdown: {
        gstOnCommission: sellerCommissionGstPaise,
      },
      courierCost: quote.estimatedCourierCost ?? quote.estimatedPorterCost ?? 9000,
      actualCourierCost: 0,
      commissionAmount: sellerCommissionPaise,
      gstAmount: sellerCommissionGstPaise,
      merchantPayable: sellerPayoutPaise,
    };

    const pickupAddress = boutique ? {
      boutiqueName: boutique.boutiqueName || boutique.name || "Boutique Pickup Center",
      ownerName: boutique.ownerName || "Boutique Owner",
      email: boutique.email || boutique.ownerEmail || "",
      phone: boutique.phone || "9876543210",
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
    const returnPolicyItems = orderSnapshot.items.map((i: any) => ({ productId: i.productId, boutiqueId }));
    const returnsAccepted = await resolveOrderReturnsAccepted(
      ctx.db,
      boutiqueId,
      returnPolicyItems
    );
    const exchangesAccepted = await resolveOrderExchangesAccepted(ctx.db, boutiqueId, returnPolicyItems);

    // Create Order with v2 pricingSnapshot and payoutStatus
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId:      session.userId,
      boutiqueId,
      boutiqueName,
      status:          "pending_confirmation",
      returnsAccepted,
      exchangesAccepted,
      deliveryAddress: session.addressSnapshot,
      pickupAddress,
      addressId:       session.addressId,
      subtotal:        session.subtotal,
      deliveryFee:     session.deliveryFee,
      discount:        session.discount,
      total:           session.total,
      commissionAmount: sellerCommissionPaise,
      paymentStatus:   "paid",
      placedDuringClosedHours: session.placedDuringClosedHours,
      scheduledProcessingDate: session.scheduledProcessingDate,
      paymentId:       payment._id,
      checkoutSessionId: session._id,
      notes:           `CheckoutSession: ${session._id}`,
      orderSnapshot,
      pricingSnapshot,
      payoutStatus:    "not_eligible",
      createdAt:       now,
      updatedAt:       now,
    });

    // Write default records to deliverySubsidyLedger and deliveryPerformanceLedger for online webhook checkout
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
      console.error("Failed to insert delivery details inside webhook payment processor:", err);
    }

    // Link payment & update events
    await ctx.db.patch(payment._id, { orderId });
    const capturedEvent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
      .filter((q) => q.eq("eventType", "captured"))
      .first();
    if (capturedEvent) {
      await ctx.db.patch(capturedEvent._id, { orderId });
    }

    // Create order items with v2 commission fields
    for (const item of session.items) {
      const itemAny = item as any;
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
        // v2 commission fields
        sellerBasePricePaise: itemAny.sellerBasePricePaise ?? item.price,
        sellerCommissionPercent: itemAny.sellerCommissionPercent ?? sellerCommissionPercent,
        sellerCommissionPaise: itemAny.sellerCommissionPaise ?? 0,
        sellerCommissionGstPaise: itemAny.sellerCommissionGstPaise ?? 0,
        sellerPayoutPaise: itemAny.sellerPayoutPaise ?? item.price,
        // Legacy fields (for backward compat)
        basePriceAtPurchase: itemAny.basePriceAtPurchase ?? item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
      });
    }

    // Mark session completed
    await ctx.db.patch(session._id, { status: "completed" });

    // P0-5 FIX: Increment boutique daily order counter (was missing in webhook path)
    await incrementBoutiqueOrderCount(ctx, boutiqueId, now);

    // Trigger payment_received notification
    await triggerNotification(ctx, session.userId, "email", "payment_received", "order", orderId, JSON.stringify({
      orderNumber,
      amount: payment.amount,
    }));

    // Trigger ops Slack alert for new order
    const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
    if (superadmin) {
      const customer = await ctx.db.get(session.userId);
      const boutiqueDoc = await ctx.db.get(boutiqueId);
      const customerName = customer ? ((customer as any).name || customer.email || customer.phone || "Customer") : "Customer";
      const boutiqueName2 = boutiqueDoc?.name || "Boutique";

      await triggerNotification(ctx, superadmin._id, "slack", "order_confirmed", "order", orderId, JSON.stringify({
        orderId: orderNumber || orderId,
        amount: payment.amount,
        customerName,
        boutiqueName: boutiqueName2,
      }));

      if (payment.amount >= 10000) {
        await triggerNotification(ctx, superadmin._id, "slack", "high_value_order", "order", orderId, JSON.stringify({
          orderId: orderNumber || orderId,
          amount: payment.amount,
          customerName,
          boutiqueName: boutiqueName2,
        }));
      }
    }

    // Clear user's cart
    const cartItemsToDelete = await ctx.db
      .query("cartItems")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .take(200);
    for (const ci of cartItemsToDelete) {
      await ctx.db.delete(ci._id);
    }

    // Consume any exchange coupon that funded this order, and refund the
    // remainder if the new order came in under the credit's value.
    await applyCouponToOrder(ctx, session, orderId, payment.amount ?? 0, now);

    // v3: create the seller's Route transfer now, held indefinitely
    // (on_hold=true, no on_hold_until). The money is frozen in the seller's
    // linked account and cannot be withdrawn, which is what makes a later
    // return reversal reliable. Delivery then releases it (Final Sale) or sets
    // a 24h on_hold_until (returns-accepted sellers).
    await ctx.scheduler.runAfter(0, internal.razorpayRoute.createHeldSellerTransfer, {
      orderId,
    });

    return { success: true, orderId, orderNumber };
  },
});


// Mutation: processPaymentFailed (Invoked by Webhook)
export const processPaymentFailed = internalMutation({
  args: {
    razorpayOrderId:   v.string(),
    razorpayPaymentId: v.string(),
    errorReason:       v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .first();

    if (!payment) {
      throw new Error(`Payment record not found for Razorpay Order ID: ${args.razorpayOrderId}`);
    }

    const now = Date.now();

    await ctx.db.patch(payment._id, {
      status: "failed",
      razorpayPaymentId: args.razorpayPaymentId,
      updatedAt: now,
    });

    await ctx.db.insert("paymentEvents", {
      source: "razorpay",
      paymentId: payment._id,
      eventType: "failed",
      payload: JSON.stringify({ razorpayPaymentId: args.razorpayPaymentId, errorReason: args.errorReason }),
      createdAt: now,
    });

    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .first();

    if (session) {
      await restoreCheckoutSessionStock(ctx, session);
      await ctx.db.patch(session._id, { status: "expired" });
    }

    return { success: true };
  },
});
