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
import { recordPromoCouponUsageHelper } from "../promoCoupons";
import { markOrderPayoutEligible } from "../adminFinance";

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

  // No age limit on events. Razorpay retries a failed delivery for up to 24h
  // with the original created_at, and this was where a paid order went missing:
  // a 5-minute window rejected every retry. Replays are already harmless — the
  // body is HMAC-signed with our secret, and recordWebhookEvent below ignores
  // an event id it has already processed.

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
    const disputeData = event.payload?.dispute?.entity;
    if (typeof eventType === "string" && eventType.startsWith("payment.dispute.") && disputeData) {
      await ctx.runMutation(internal.webhooks.razorpay.processPaymentDispute, {
        eventType,
        disputeId: String(disputeData.id),
        razorpayPaymentId: String(disputeData.payment_id),
        amountPaise: Number(disputeData.amount) || 0,
      });
    }

    // Route linked-account (seller KYC) events.
    const accountData = event.payload?.account?.entity;
    if (typeof eventType === "string" && eventType.startsWith("account.") && accountData?.id) {
      await ctx.runMutation(internal.webhooks.razorpay.processLinkedAccountEvent, {
        eventType,
        razorpayAccountId: String(accountData.id),
      });
    }

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
          capturedAmountPaise: paymentData.amount,
        });
        // Razorpay's fee on this payment, for finance reports.
        await ctx.runMutation(internal.payments.recordGatewayFee, {
          razorpayOrderId,
          feePaise: typeof paymentData.fee === "number" ? paymentData.fee : undefined,
          taxPaise: typeof paymentData.tax === "number" ? paymentData.tax : undefined,
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
    /** What Razorpay actually captured, from the signed webhook payload. */
    capturedAmountPaise: v.number(),
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

    // SECURITY: the amount Razorpay actually captured must be exactly what this
    // checkout charges the customer. `customerPayablePaise` is the total minus
    // any exchange-coupon credit; comparing against `total` refused every
    // part-coupon order. On a mismatch no order is placed: the stock is
    // released, the full captured amount is refunded, and the event is logged
    // for admin. Returning (not throwing) stops Razorpay retrying forever.
    const expectedAmountPaise = session.customerPayablePaise ?? session.total;
    if (args.capturedAmountPaise !== expectedAmountPaise) {
      console.error(
        `[PaymentCaptured][ALERT] Amount mismatch for session ${session._id}: ` +
          `captured=${args.capturedAmountPaise}, expected=${expectedAmountPaise}. Order not placed, refund queued.`
      );
      await ctx.db.patch(payment._id, {
        status: "captured",
        razorpayPaymentId: args.razorpayPaymentId,
        method: args.method,
        updatedAt: now,
      });
      await ctx.db.insert("paymentEvents", {
        source: "razorpay",
        paymentId: payment._id,
        eventType: "failed",
        payload: JSON.stringify({
          reason: "amount_mismatch_refund",
          razorpayPaymentId: args.razorpayPaymentId,
          capturedAmountPaise: args.capturedAmountPaise,
          expectedAmountPaise,
        }),
        createdAt: now,
      });
      if (session.status !== "completed" && session.status !== "expired" && session.status !== "failed") {
        await restoreCheckoutSessionStock(ctx, session);
        await ctx.db.patch(session._id, { status: "failed" });
      }
      const idempotencyKey = `amount_mismatch_${session._id}_${args.razorpayPaymentId}`;
      const existingRefund = await ctx.db
        .query("refundQueue")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (!existingRefund) {
        await ctx.db.insert("refundQueue", {
          paymentId: payment._id,
          reason: `Captured ₹${(args.capturedAmountPaise / 100).toFixed(2)} but checkout expected ₹${(expectedAmountPaise / 100).toFixed(2)}. Order not placed; automatic refund.`,
          amountPaise: args.capturedAmountPaise,
          status: "pending",
          idempotencyKey,
          createdAt: now,
        });
      }
      return { success: false, message: "Amount mismatch. Order not placed; refund queued." };
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
        // Session item prices are paise.
        sellerBasePricePaise: item.sellerBasePricePaise ?? item.price,
        quantity: item.quantity,
      })),
      session.deliveryFee ?? 0,
      session.discount ?? 0,
      sellerTierKey,
      platformConfig,
      session.promoSellerFundedDiscountPaise ?? 0
    );

    const pricingSnapshot = {
      productSubtotalPaise: checkoutPricing.productSubtotalPaise,
      handlingChargePaise: checkoutPricing.handlingChargePaise,
      platformFeePaise: checkoutPricing.platformFeePaise,
      platformChargesGstPaise: checkoutPricing.platformChargesGstPaise,
      deliveryFeePaise: checkoutPricing.deliveryFeePaise,
      discountPaise: checkoutPricing.discountPaise,
      sellerFundedDiscountPaise: checkoutPricing.sellerFundedDiscountPaise,
      platformFundedDiscountPaise: checkoutPricing.platformFundedDiscountPaise,
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
        subtotalPaise: session.subtotal, // session totals are paise
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

    // Count the promo redemption here too; this path places the order when the
    // client never came back to verify, and the usage limit must still hold.
    if (session.promoCouponId) {
      await recordPromoCouponUsageHelper(ctx, {
        promoCouponId: session.promoCouponId,
        userId: session.userId,
        orderId,
        orderNumber,
        discountAppliedPaise: session.promoCouponDiscountPaise ?? (session.discount || 0),
      });
    }

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

    // Ops Slack alert: Payment Failed (Drop-off Recovery)
    const superadmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();

    if (superadmin) {
      const adminId = superadmin._id;
      const targetUserId = session?.userId ?? payment.customerId;
      const customer = targetUserId ? await ctx.db.get(targetUserId) : null;
      const customerDoc = customer as any;
      const customerName = customerDoc?.name || customerDoc?.displayName || customerDoc?.email || customerDoc?.phone || (session?.addressSnapshot as any)?.fullName || "Customer";
      const customerPhone = customerDoc?.phone || (session?.addressSnapshot as any)?.phone || "N/A";
      const customerEmail = customerDoc?.email || "N/A";
      const boutiqueName = session?.items?.[0]?.boutiqueName || "Boutique";

      await triggerNotification(
        ctx,
        adminId,
        "slack",
        "payment_failed_ops",
        "payment",
        payment._id,
        JSON.stringify({
          amount: payment.amount,
          amountPaise: payment.amount,
          customerName,
          customerPhone,
          customerEmail,
          errorReason: args.errorReason,
          boutiqueName,
          itemsCount: session?.items?.length || 1,
        })
      );
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: processPaymentDispute (chargebacks)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A customer's bank has disputed a payment (chargeback).
 *
 *   created / under_review / action_required -> "open": freeze the seller's
 *       held transfer indefinitely. If it was already released, nothing can be
 *       frozen; a loss is recovered from the seller below.
 *   won / closed -> the freeze lifts and the normal delivery decision runs
 *       again (release, or hold to the end of the return window).
 *   lost -> the bank took the money from Hive, so the seller's share is taken
 *       back: the transfer is reversed, or, if the seller has already been paid
 *       out, the amount goes on the ledger recovery list as owed to Hive.
 *
 * A final outcome (won/lost/closed) is never moved back to "open" by a late or
 * out-of-order event, and "lost" is never undone.
 */
export const processPaymentDispute = internalMutation({
  args: {
    eventType: v.string(),
    disputeId: v.string(),
    razorpayPaymentId: v.string(),
    amountPaise: v.number(),
  },
  handler: async (ctx, args) => {
    const status: "open" | "won" | "lost" | "closed" =
      args.eventType === "payment.dispute.won" ? "won"
        : args.eventType === "payment.dispute.lost" ? "lost"
        : args.eventType === "payment.dispute.closed" ? "closed"
        : "open";

    const payment = await ctx.db
      .query("payments")
      .withIndex("by_razorpayPaymentId", (q) => q.eq("razorpayPaymentId", args.razorpayPaymentId))
      .first();
    const session = payment?.razorpayOrderId
      ? await ctx.db
          .query("checkoutSessions")
          .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", payment.razorpayOrderId!))
          .first()
      : null;
    const order = session
      ? await ctx.db
          .query("orders")
          .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", session._id))
          .first()
      : null;

    if (!payment || !order) {
      console.error(
        `[Chargeback][ALERT] ${args.eventType} for payment ${args.razorpayPaymentId} (dispute ${args.disputeId}): no matching order. Check Razorpay by hand.`
      );
      return { success: false, reason: "order_not_found" };
    }

    const previous = order.disputeStatus;
    if (previous === "lost" || (previous && previous !== "open" && status === "open")) {
      console.warn(`[Chargeback] Ignoring ${args.eventType} for ${order.orderNumber}: dispute already ${previous}.`);
      return { success: true, reason: `already_${previous}` };
    }

    const now = Date.now();
    await ctx.db.patch(order._id, {
      disputeStatus: status,
      disputeId: args.disputeId,
      disputeAmountPaise: args.amountPaise,
      disputeUpdatedAt: now,
      updatedAt: now,
    });
    console.error(
      `[Chargeback][ALERT] ${order.orderNumber}: dispute ${args.disputeId} is ${status} ` +
        `(₹${(args.amountPaise / 100).toFixed(2)}, payout ${order.payoutStatus ?? "none"}).`
    );

    const payoutReleased =
      order.payoutStatus === "paid" || order.payoutStatus === "settled";

    if (status === "open") {
      if (order.razorpayTransferId && !payoutReleased && order.transferStatus !== "reversed") {
        await ctx.scheduler.runAfter(0, internal.razorpayRoute.updateTransferHold, {
          orderId: order._id,
          onHold: true,
          reason: "dispute_open",
        });
      }
      return { success: true, reason: payoutReleased ? "open_payout_already_released" : "open_frozen" };
    }

    if (status === "won" || status === "closed") {
      if (order.payoutHoldReason === "dispute_open") {
        await ctx.db.patch(order._id, { payoutHoldReason: "awaiting_delivery" });
      }
      if (order.status === "delivered") {
        await markOrderPayoutEligible(ctx, order._id, order.deliveredAt ?? now, now);
      }
      return { success: true, reason: `resolved_${status}` };
    }

    // status === "lost": take the seller's share of the disputed amount back.
    const sellerPayoutPaise = order.pricingSnapshot?.sellerPayoutPaise ?? 0;
    const sellerSharePaise =
      payment.amount > 0
        ? Math.min(sellerPayoutPaise, Math.round((sellerPayoutPaise * args.amountPaise) / payment.amount))
        : sellerPayoutPaise;

    if (order.razorpayTransferId && order.transferStatus !== "reversed") {
      // Reverses the transfer; if the seller has already withdrawn it, this
      // queues a ledger recovery item for the amount owed.
      await ctx.scheduler.runAfter(0, internal.razorpayRoute.reverseSellerTransfer, {
        orderId: order._id,
        reason: "chargeback_lost",
        amountPaise: sellerSharePaise,
      });
    } else if (!order.razorpayTransferId) {
      // Nothing was ever sent to the seller; make sure nothing will be.
      await ctx.db.patch(order._id, {
        payoutStatus: "not_eligible",
        payoutHoldReason: "chargeback_lost",
      });
    }
    return { success: true, reason: "lost_recovering_seller_share", sellerSharePaise };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: processLinkedAccountEvent (seller KYC on Razorpay Route)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Mirror a seller's Route linked-account status from Razorpay's account.*
 * events, so the partner finance page and payout code see real KYC state.
 * Events for an account no boutique owns are logged and acknowledged.
 */
export const processLinkedAccountEvent = internalMutation({
  args: {
    eventType: v.string(),
    razorpayAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    type Kyc = "created" | "under_review" | "activated" | "needs_clarification";
    type AccountStatus = "created" | "active" | "suspended" | "needs_attention";
    const MAP: Record<string, { kycStatus?: Kyc; razorpayAccountStatus?: AccountStatus }> = {
      "account.activated": { kycStatus: "activated", razorpayAccountStatus: "active" },
      "account.instantly_activated": { kycStatus: "activated", razorpayAccountStatus: "active" },
      // Can receive transfers with limits while KYC finishes.
      "account.activated_kyc_pending": { kycStatus: "under_review", razorpayAccountStatus: "active" },
      "account.under_review": { kycStatus: "under_review", razorpayAccountStatus: "created" },
      "account.needs_clarification": { kycStatus: "needs_clarification", razorpayAccountStatus: "needs_attention" },
      "account.rejected": { kycStatus: "needs_clarification", razorpayAccountStatus: "needs_attention" },
      "account.suspended": { razorpayAccountStatus: "suspended" },
    };
    const update = MAP[args.eventType];
    if (!update) {
      console.log(`[RazorpayAccount] ${args.eventType} for ${args.razorpayAccountId}: no status change.`);
      return { success: true, reason: "ignored_event" };
    }

    const boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_razorpayAccountId", (q) => q.eq("razorpayAccountId", args.razorpayAccountId))
      .first();
    if (!boutique) {
      console.error(`[RazorpayAccount][ALERT] ${args.eventType} for ${args.razorpayAccountId}: no boutique has this account.`);
      return { success: false, reason: "boutique_not_found" };
    }

    await ctx.db.patch(boutique._id, { ...update, updatedAt: Date.now() } as any);
    console.log(
      `[RazorpayAccount] ${boutique.boutiqueName ?? boutique._id}: ${args.eventType} -> kyc=${update.kycStatus ?? boutique.kycStatus}, account=${update.razorpayAccountStatus}`
    );
    return { success: true, reason: "updated" };
  },
});
