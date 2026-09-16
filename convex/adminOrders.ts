// convex/adminOrders.ts
// Admin-only order queries and mutations for the HIVE Admin panel.
// All functions require the "admin" role.

import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, getCurrentUserOrNull } from "./lib/auth";
import { internal } from "./_generated/api";
import { triggerNotification } from "./lib/notifications";
import { markOrderFinanciallyDelivered, markOrderPayoutEligible } from "./adminFinance";
import { recordOrderActivity } from "./lib/orderActivity";
import { adminMetricsWindows, resolveMetricsNow } from "./lib/adminMetricsTime";
import { refundCancelledOrder } from "./lib/refunds";
import {
  buildCustomerPorterAddress,
  buildBoutiquePorterAddress,
  assertPorterAddressUsable,
} from "./lib/porterAddress";

interface StatusTransitionArgs {
  oldStatus?: string;
  newStatus?: string;
  amountDelta?: number;
}

/**
 * Incrementally updates the singleton `dashboardMetrics` document.
 * Call this inside any mutation that creates an order or updates an order status.
 */
export async function updateDashboardMetricsHelper(
  ctx: MutationCtx,
  { oldStatus, newStatus, amountDelta = 0 }: StatusTransitionArgs
) {
  const now = new Date();
  const todayDate = now.toISOString().split("T")[0] || "";
  const timestamp = Date.now();

  let metrics = await ctx.db.query("dashboardMetrics").first();

  if (!metrics) {
    const initialCounts: Record<string, number> = {};
    if (newStatus) initialCounts[newStatus] = 1;

    const initialId = await ctx.db.insert("dashboardMetrics", {
      orderCountByStatus: initialCounts,
      totalRevenue: amountDelta > 0 ? amountDelta : 0,
      todayOrderCount: amountDelta > 0 ? 1 : 0,
      todayGmv: amountDelta > 0 ? amountDelta : 0,
      todayDate,
      updatedAt: timestamp,
    });
    return initialId;
  }

  const counts: Record<string, number> = { ...(metrics.orderCountByStatus ?? {}) };

  if (oldStatus && counts[oldStatus]) {
    counts[oldStatus] = Math.max(0, counts[oldStatus] - 1);
  }

  if (newStatus) {
    counts[newStatus] = (counts[newStatus] || 0) + 1;
  }

  const isNewDay = metrics.todayDate !== todayDate;
  const nextTodayCount = isNewDay ? (amountDelta > 0 ? 1 : 0) : metrics.todayOrderCount + (amountDelta > 0 ? 1 : 0);
  const nextTodayGmv = isNewDay ? (amountDelta > 0 ? amountDelta : 0) : metrics.todayGmv + amountDelta;

  await ctx.db.patch(metrics._id, {
    orderCountByStatus: counts,
    totalRevenue: metrics.totalRevenue + amountDelta,
    todayOrderCount: nextTodayCount,
    todayGmv: nextTodayGmv,
    todayDate,
    updatedAt: timestamp,
  });

  return metrics._id;
}

/**
 * Backfill mutation to initialize/re-sync dashboardMetrics from historic orders.
 */
export const backfillDashboardMetrics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();
    const todayDate = new Date().toISOString().split("T")[0] || "";

    const counts: Record<string, number> = {};
    let totalRevenue = 0;
    let todayOrderCount = 0;
    let todayGmv = 0;

    for (const order of orders) {
      if (order.status) {
        counts[order.status] = (counts[order.status] || 0) + 1;
      }
      
      const orderAmount = order.total ?? 0;
      totalRevenue += orderAmount;

      const orderDate = new Date(order._creationTime).toISOString().split("T")[0];
      if (orderDate === todayDate) {
        todayOrderCount += 1;
        todayGmv += orderAmount;
      }
    }

    const existing = await ctx.db.query("dashboardMetrics").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        orderCountByStatus: counts,
        totalRevenue,
        todayOrderCount,
        todayGmv,
        todayDate,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("dashboardMetrics", {
        orderCountByStatus: counts,
        totalRevenue,
        todayOrderCount,
        todayGmv,
        todayDate,
        updatedAt: Date.now(),
      });
    }
    return { success: true, count: orders.length };
  },
});

/**
 * Admin Dashboard Metrics
 * Returns total orders, pending orders, delivered orders, total revenue,
 * and the 10 most recent orders across ALL boutiques.
 */
export const getAdminDashboardMetrics = query({
  args: {
    /**
     * The caller's clock, rounded down to a bucket (see lib/adminMetricsTime).
     *
     * Reading Date.now() in the handler made Convex invalidate this query's
     * cache frequently, so an open admin tab re-read most of the orders and
     * products tables every minute or so with nothing changed. Taking the time
     * as an argument makes the query a pure function of its arguments again.
     *
     * Optional so an admin client deployed before this argument existed keeps
     * working unchanged; it then falls back to server time, i.e. the old
     * behaviour.
     */
    nowBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const now = resolveMetricsNow(args.nowBucket);
    const {
      startOfToday,
      thirtyDaysAgo,
      twentyFourHoursAgo,
      twelveHoursAgo,
      thirtyMinutesAgo,
      tenMinutesAgo,
    } = adminMetricsWindows(now);

    const [
      pendingConfirmationList,
      pendingPaymentList,
      confirmedList,
      deliveredList,
      packedList,
      pickupScheduledList,
      pickedUpList,
      inTransitList,
      outForDeliveryList,
      cancelledList,
      refundedList,
      bookingFailedList,
      claimSubmittedList,
      replacementRequestedList,
      replacementApprovedList,
      replacementDispatchedList,
      replacementDeliveredList,
      refundRequestedList,
    ] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "pending_confirmation")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "pending_payment")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "confirmed")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "delivered")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "packed")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "pickup_scheduled")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "picked_up")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "in_transit")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "out_for_delivery")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "cancelled")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "refunded")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "booking_failed")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "claim_submitted")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "replacement_requested")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "replacement_approved")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "replacement_dispatched")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "replacement_delivered")).take(100),
      ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "refund_requested")).take(100),
    ]);

    const allOrders = [
      ...pendingConfirmationList,
      ...pendingPaymentList,
      ...confirmedList,
      ...deliveredList,
      ...packedList,
      ...pickupScheduledList,
      ...pickedUpList,
      ...inTransitList,
      ...outForDeliveryList,
      ...cancelledList,
      ...refundedList,
      ...bookingFailedList,
      ...claimSubmittedList,
      ...replacementRequestedList,
      ...replacementApprovedList,
      ...replacementDispatchedList,
      ...replacementDeliveredList,
      ...refundRequestedList,
    ];

    const pendingOrders = pendingConfirmationList.length + pendingPaymentList.length + confirmedList.length;
    const deliveredOrders = deliveredList.length;
    const totalOrders = allOrders.length;

    // Revenue computed from delivered orders
    const totalRevenue = deliveredList.reduce((sum, o) => sum + (o.total || 0), 0);

    // Command Center calculations. startOfToday comes from the caller's bucket
    // above rather than a fresh clock read.
    const todayOrders = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", startOfToday))
      .collect();
    const gmvToday = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const ordersToday = todayOrders.length;

    const confirmedOrDelivered = allOrders.filter(o => o.orderAcceptedAt !== undefined);
    const acceptedOnTime = confirmedOrDelivered.filter(o => {
      const delay = o.orderAcceptedAt! - o.createdAt;
      return delay <= 15 * 60 * 1000;
    }).length;
    const acceptanceSlaRate = confirmedOrDelivered.length > 0
      ? (acceptedOnTime / confirmedOrDelivered.length) * 100
      : 100;

    const deliveredOrdersList = allOrders.filter(o => o.status === "delivered");
    let sameDayCount = 0;
    for (const o of deliveredOrdersList) {
      const startTime = o.orderAcceptedAt || o.confirmedAt || o.createdAt;
      const endTime = o.deliveredAt;
      if (endTime && startTime && (endTime - startTime <= 8 * 3600 * 1000)) {
        sameDayCount++;
      }
    }
    const sameDayRate = deliveredOrdersList.length > 0
      ? (sameDayCount / deliveredOrdersList.length) * 100
      : 100;

    const refundedOrdersCount = allOrders.filter(o => o.status === "refunded" || o.paymentStatus === "refunded").length;
    const refundRate = allOrders.length > 0 ? (refundedOrdersCount / allOrders.length) * 100 : 0;
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", thirtyDaysAgo))
      .collect();
    const claimRate = allOrders.length > 0 ? (claims.length / allOrders.length) * 100 : 0;

    // Calculate TTFA percentiles and SLA breaches
    const acceptanceTimes = confirmedOrDelivered.map(o => (o.orderAcceptedAt! - o.createdAt) / (60 * 1000)); // in minutes
    acceptanceTimes.sort((a, b) => a - b);

    const getPercentileValue = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return Math.round(arr[Math.max(0, index)] ?? 0);
    };

    const ttfaP50 = getPercentileValue(acceptanceTimes, 50);
    const ttfaP90 = getPercentileValue(acceptanceTimes, 90);
    const ttfaP95 = getPercentileValue(acceptanceTimes, 95);

    const ttfaBreach10mCount = acceptanceTimes.filter(t => t > 10).length;
    const ttfaBreach15mCount = acceptanceTimes.filter(t => t > 15).length;

    const commandCenterMetrics = {
      gmvToday,
      ordersToday,
      acceptanceSlaRate: Math.round(acceptanceSlaRate),
      sameDayRate: Math.round(sameDayRate),
      refundRate: Math.round(refundRate * 10) / 10,
      claimRate: Math.round(claimRate * 10) / 10,
      ttfaP50,
      ttfaP90,
      ttfaP95,
      ttfaBreach10mCount,
      ttfaBreach15mCount,
    };

    // 10 most recent orders (very fast take(10) query)
    const recentOrdersRaw = await ctx.db
      .query("orders")
      .order("desc")
      .take(10);

    const customerIds = Array.from(new Set(recentOrdersRaw.map((o) => o.customerId)));
    const boutiqueIds = Array.from(new Set(recentOrdersRaw.map((o) => o.boutiqueId)));

    const [customersList, boutiquesList, profilesList] = await Promise.all([
      Promise.all(customerIds.map((id) => ctx.db.get(id))),
      Promise.all(boutiqueIds.map((id) => ctx.db.get(id))),
      Promise.all(customerIds.map((id) => ctx.db.query("customerProfiles").withIndex("by_userId", (q) => q.eq("userId", id)).unique()))
    ]);

    const customerMap = new Map(customersList.filter(Boolean).map((c) => [c!._id, c]));
    const boutiqueMap = new Map(boutiquesList.filter(Boolean).map((b) => [b!._id, b]));
    const profileMap = new Map(profilesList.filter(Boolean).map((p) => [p!.userId, p]));

    const recentOrders = recentOrdersRaw.map((order) => {
      const customer = customerMap.get(order.customerId);
      const boutique = boutiqueMap.get(order.boutiqueId);
      const profile = profileMap.get(order.customerId);

      const customerName =
        profile?.displayName ||
        customer?.email ||
        "Customer";

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName,
        boutiqueName: boutique?.boutiqueName || "Unknown Boutique",
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      };
    });

    // --- Compute Needs Attention Operational Queues ---
    // now / twelveHoursAgo / twentyFourHoursAgo / tenMinutesAgo all come from
    // the single bucketed clock resolved at the top of this handler.

    // 1. Orders Pending > 12h (in pending_confirmation or confirmed)
    const ordersPendingOver12h = [...pendingConfirmationList, ...confirmedList].filter(
      (o) => o.createdAt < twelveHoursAgo
    ).length;

    // 2. Orders Waiting Acceptance > 10m
    const ordersWaitingAcceptanceOver15m = pendingConfirmationList.filter(
      (o) => o.createdAt < tenMinutesAgo
    ).length;

    const totalDelayMs = pendingConfirmationList.reduce((sum, o) => sum + (now - o.createdAt), 0);
    const averageAcceptanceDelayMins = pendingConfirmationList.length > 0
      ? Math.round(totalDelayMs / (pendingConfirmationList.length * 60 * 1000))
      : 0;

    // 3. Claims Waiting > 24h (in submitted or under_review)
    const submittedClaimsList = await ctx.db
      .query("claims")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .collect();
    const underReviewClaimsList = await ctx.db
      .query("claims")
      .withIndex("by_status", (q) => q.eq("status", "under_review"))
      .collect();
    const claimsWaitingOver24h = [...submittedClaimsList, ...underReviewClaimsList].filter(
      (c) => c.submittedAt < twentyFourHoursAgo
    ).length;

    // 4. Suspended Boutiques count
    const suspendedBoutiquesList = await ctx.db
      .query("boutiques")
      .withIndex("by_status", (q) => q.eq("status", "SUSPENDED"))
      .collect();
    const suspendedBoutiquesCount = suspendedBoutiquesList.length;

    // 5. Products Moderated count
    const moderatedProductsList = await ctx.db
      .query("products")
      .withIndex("by_adminHidden", (q) => q.eq("adminHidden", true))
      .collect();
    const productsModeratedCount = moderatedProductsList.length;

     // 6. Total Products & Out of Stock counts (Optimized index scan)
    const activeProducts = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(500);
    const inactiveProductsSample = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", false))
      .take(500);

    const totalProducts = activeProducts.length + inactiveProductsSample.length;
    const outOfStockProductsCount = activeProducts.filter(p => {
      const stock = p.stockBySize || {};
      return Object.values(stock).reduce((sum: number, val: any) => sum + (val || 0), 0) === 0;
    }).length;

    // 7. Boutique documents awaiting review count
    const pendingDocumentsList = await ctx.db
      .query("boutiqueDocuments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const pendingDocumentsCount = pendingDocumentsList.length;

    // 8. Pending Products count (awaiting approval)
    const pendingProductsList = await ctx.db
      .query("products")
      .withIndex("by_approvalStatus", (q) => q.eq("approvalStatus", "pending"))
      .collect();
    const pendingProductsReviewCount = pendingProductsList.length;

    // 8. Dynamic operational queues
    const waitingOver15m = pendingConfirmationList.filter(
      (o) => o.createdAt < tenMinutesAgo && o.createdAt >= thirtyMinutesAgo
    ).length;
    const waitingOver30m = pendingConfirmationList.filter(
      (o) => o.createdAt < thirtyMinutesAgo
    ).length;
    const readyForPickupCount = allOrders.filter((o) => o.status === "packed").length;

    const [failedShipments, bookingFailedShipments, lostShipments] = await Promise.all([
      ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "failed")).collect(),
      ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "booking_failed")).collect(),
      ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "lost")).collect(),
    ]);
    const courierExceptionsCount = failedShipments.length + bookingFailedShipments.length + lostShipments.length;

    // Optimized: Replace full table filter scan with parallel indexed by_status queries
    const [pendingRefunds, processingRefunds] = await Promise.all([
      ctx.db
        .query("refundQueue")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("refundQueue")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .collect(),
    ]);
    const refundQueuePending = [...pendingRefunds, ...processingRefunds];
    const refundPendingCount = refundQueuePending.length;

    const pipelineCounts = {
      pending: allOrders.filter((o) => o.status === "pending_confirmation" || o.status === "pending_payment").length,
      confirmed: allOrders.filter((o) => o.status === "confirmed").length,
      packed: allOrders.filter((o) => o.status === "packed").length,
      pickup: allOrders.filter((o) => o.status === "pickup_scheduled" || o.status === "picked_up").length,
      delivered: allOrders.filter((o) => o.status === "delivered").length,
    };

    return {
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalRevenue,
      recentOrders,
      // Operational queues
      ordersPendingOver12h,
      ordersWaitingAcceptanceOver15m,
      averageAcceptanceDelayMins,
      claimsWaitingOver24h,
      suspendedBoutiquesCount,
      productsModeratedCount,
      totalProducts,
      outOfStockProductsCount,
      pendingDocumentsCount,
      pendingProductsReviewCount,
      commandCenterMetrics,
      // Added operations metrics
      isSandbox: process.env.ENABLE_DEBUG_TOOLS === "true",
      waitingOver15m,
      waitingOver30m,
      readyForPickupCount,
      courierExceptionsCount,
      refundPendingCount,
      pipelineCounts,
    };
  },
});

/**
 * Get ALL marketplace orders across all boutiques.
 * Returns orders with customer and boutique info, sorted newest first.
 * Bounded to 500 for performance.
 */
export const getAllOrders = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const limit = args.limit ?? 50;

    const orders = await ctx.db
      .query("orders")
      .order("desc")
      .take(limit);

    // Enrich with customer, boutique, and invoice info in batch
    const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
    const boutiqueIds = Array.from(new Set(orders.map((o) => o.boutiqueId)));

    const [customersList, boutiquesList, profilesList, itemsList, invoicesList, shipmentsList, activityList] = await Promise.all([
      Promise.all(customerIds.map((id) => ctx.db.get(id))),
      Promise.all(boutiqueIds.map((id) => ctx.db.get(id))),
      Promise.all(customerIds.map((id) => ctx.db.query("customerProfiles").withIndex("by_userId", (q) => q.eq("userId", id)).unique())),
      Promise.all(orders.map((o) => ctx.db.query("orderItems").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).collect())),
      Promise.all(orders.map((o) => ctx.db.query("invoices").withIndex("by_order_id", (q) => q.eq("orderId", o._id)).unique())),
      Promise.all(orders.map((o) => o.shipmentId ? ctx.db.get(o.shipmentId) : null)),
      Promise.all(orders.map((o) => ctx.db.query("orderActivity").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).first())),
    ]);

    const customerMap = new Map(customersList.filter(Boolean).map((c) => [c!._id, c]));
    const boutiqueMap = new Map(boutiquesList.filter(Boolean).map((b) => [b!._id, b]));
    const profileMap = new Map(profilesList.filter(Boolean).map((p) => [p!.userId, p]));
    const itemsMap = new Map(orders.map((o, i) => [o._id, itemsList[i]]));
    const invoiceMap = new Map(orders.map((o, i) => [o._id, invoicesList[i]]));
    const shipmentMap = new Map(orders.map((o, i) => [o._id, shipmentsList[i]]));
    const activityMap = new Map(orders.map((o, i) => [o._id, activityList[i]]));

    const enriched = orders.map((order) => {
      const customer = customerMap.get(order.customerId);
      const boutique = boutiqueMap.get(order.boutiqueId);
      const profile = profileMap.get(order.customerId);
      const items = itemsMap.get(order._id) || [];
      const invoice = invoiceMap.get(order._id);
      const shipment = shipmentMap.get(order._id);
      const activity = activityMap.get(order._id);

      const customerName = profile?.displayName || customer?.email || "Customer";

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName,
        customerEmail: customer?.email || "",
        boutiqueName: boutique?.boutiqueName || "Unknown Boutique",
        boutiqueId: order.boutiqueId,
        customerId: order.customerId,
        boutiquePhone: boutique?.notificationPhone || boutique?.phone || null,
        boutiqueOwnerName: boutique?.ownerName || null,
        itemsCount: items.length,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        invoiceNumber: invoice?.invoiceNumber || null,
        invoicePdfUrl: invoice?.pdfUrl || null,
        shipmentId: order.shipmentId || null,
        shipmentStatus: shipment?.status || null,
        shipmentExceptionType: shipment?.exceptionType || null,
        acceptanceActivity: activity ? {
          actorName: activity.actorName,
          actorEmail: activity.actorEmail,
          actorRole: activity.actorRole,
          createdAt: activity.createdAt,
        } : null,
      };
    });

    return enriched;
  },
});

/**
 * Get detailed information about a single order by _id.
 * Admin-only. Returns full customer, boutique, items, and address details.
 */
export const getOrderDetails = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const customer = await ctx.db.get(order.customerId);
    const boutique = await ctx.db.get(order.boutiqueId);

    // Customer profile for display name
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", order.customerId))
      .unique();

    const customerName =
      profile?.displayName ||
      customer?.email ||
      "Customer";

    // Order items with product details
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(50);

    const enrichedItems = await Promise.all(
      orderItems.map(async (item) => {
        // Try to get image URL from storage if it looks like a storage ID
        let imageUrl = item.imageUrl;
        if (imageUrl && !imageUrl.startsWith("http")) {
          try {
            const url = await ctx.storage.getUrl(imageUrl as any);
            imageUrl = url || imageUrl;
          } catch {
            // keep original
          }
        }
        return {
          ...item,
          imageUrl,
        };
      })
    );

    // Build timeline from order status fields
    const timeline: Array<{ label: string; timestamp: number | null; done: boolean }> = [
      {
        label: "Order Placed",
        timestamp: order.createdAt,
        done: true,
      },
      {
        label: "Confirmed",
        timestamp: order.confirmedAt ?? null,
        done: !!order.confirmedAt,
      },
      {
        label: "Packed & Picked Up",
        timestamp: null,
        done: ["packed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered"].includes(order.status),
      },
      {
        label: "In Transit",
        timestamp: null,
        done: ["in_transit", "out_for_delivery", "delivered"].includes(order.status),
      },
      {
        label: "Out for Delivery",
        timestamp: null,
        done: ["out_for_delivery", "delivered"].includes(order.status),
      },
      {
        label: "Delivered",
        timestamp: order.deliveredAt ?? null,
        done: order.status === "delivered",
      },
    ];

    // Fetch order activity for actor attribution
    const activities = await ctx.db
      .query("orderActivity")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    // Fetch return shipment if present
    const returnShipmentDoc = order.returnShipmentId
      ? await ctx.db.get(order.returnShipmentId)
      : null;

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      notes: order.notes,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      confirmedAt: order.confirmedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      internalCancelReason: (order as any).internalCancelReason ?? null,
      slaAutoCancelledAt:   (order as any).slaAutoCancelledAt ?? null,
      slaAlertFiredAt:      (order as any).slaAlertFiredAt ?? null,
      refundStatus:         order.refundStatus ?? null,
      deliveryAddress: order.deliveryAddress,
      customer: {
        _id: customer?._id,
        email: customer?.email,
        phone: customer?.phone,
        displayName: customerName,
        role: customer?.role,
      },
      boutique: {
        _id: boutique?._id,
        boutiqueName: boutique?.boutiqueName || boutique?.name,
        ownerName: boutique?.ownerName,
        email: boutique?.email,
        phone: boutique?.notificationPhone || boutique?.phone,
        staffPhone1: boutique?.staffPhone1,
        staffPhone2: boutique?.staffPhone2,
        address: boutique?.address || boutique?.addressDetails?.city,
      },
      items: enrichedItems,
      timeline,
      // Return flow fields
      returnStatus: order.returnStatus ?? null,
      returnInspection: order.returnInspection ?? null,
      returnShipmentId: order.returnShipmentId ?? null,
      returnShipment: returnShipmentDoc ? {
        _id: returnShipmentDoc._id,
        status: returnShipmentDoc.status,
        awbNumber: returnShipmentDoc.awbNumber,
        trackingUrl: returnShipmentDoc.trackingUrl,
        driverName: returnShipmentDoc.driverName,
        driverPhone: returnShipmentDoc.driverPhone,
        deliveredAt: returnShipmentDoc.deliveredAt,
        pickedUpAt: returnShipmentDoc.pickedUpAt,
      } : null,
      activities: activities.map((a) => ({
        action: a.action,
        actorName: a.actorName,
        actorEmail: a.actorEmail,
        actorRole: a.actorRole,
        createdAt: a.createdAt,
      })),
    };
  },
});

/**
 * Admin: Update the status of any order.
 * Also stamps confirmedAt / deliveredAt / cancelledAt timestamps
 * so the customer timeline renders accurate dates.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["pending_confirmation", "cancelled"],
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["packed", "delivered", "cancelled"],
  packed: ["confirmed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled"],
  pickup_scheduled: ["picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled"],
  picked_up: ["in_transit", "out_for_delivery", "delivered", "cancelled"],
  in_transit: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  booking_failed: ["pickup_scheduled", "delivered", "cancelled"],
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

export const updateOrderStatus = mutation({
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
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(args.status)) {
      throw new ConvexError(`Invalid transition: ${order.status} → ${args.status}`);
    }

    if (order.status === args.status) {
      return args.orderId;
    }

    if (["refunded", "refund_requested"].includes(args.status) && order.paymentStatus !== "paid") {
      throw new Error(`Cannot transition order to "${args.status}": order has not been paid.`);
    }

    const now = Date.now();

    // Check if transitioning to cancelled/refunded
    const wasCancelledOrRefunded = order.status === "cancelled" || order.status === "refunded";
    const isNowCancelledOrRefunded = args.status === "cancelled" || args.status === "refunded";
    const isReversible = ["pending_payment", "pending_confirmation", "confirmed", "packed", "pickup_scheduled"].includes(order.status);

    if (!wasCancelledOrRefunded && isNowCancelledOrRefunded && isReversible) {
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
    if (args.status === "delivered") {
      if (order.shipmentId) {
        const shipment = await ctx.db.get(order.shipmentId);
        if (shipment && shipment.status !== "delivered") {
          await ctx.db.patch(order.shipmentId, {
            status: "delivered",
            deliveredAt: now,
            updatedAt: now,
          });
        }
      }
      if (!order.deliveredAt) {
        patch.deliveredAt = now;
        patch.claimWindowExpiresAt = now + 24 * 3600 * 1000;
      }
    }
    if (args.status === "cancelled" && !order.cancelledAt) patch.cancelledAt = now;

    await ctx.db.patch(args.orderId, patch);

    // An admin cancelling a paid order owes the customer their money. This
    // path previously recorded the cancellation and nothing else.
    if (args.status === "cancelled") {
      await refundCancelledOrder(ctx, {
        orderId: args.orderId,
        reason: `Order ${order.orderNumber} cancelled by Hive admin`,
        idempotencySuffix: "admin_cancel",
      });
    }

    // Record order activity for actor attribution (admin confirmation)
    if (args.status === "confirmed") {
      await recordOrderActivity(ctx, {
        orderId: args.orderId,
        boutiqueId: order.boutiqueId,
        action: "confirmed",
        createdAt: now,
      });
    }

    if (args.status === "delivered") {
      await markOrderFinanciallyDelivered(ctx, args.orderId, now);
      // Delivery confirmed -> release seller payment (idempotent).
      await markOrderPayoutEligible(ctx, args.orderId, order.deliveredAt ?? now);
    }

    if (args.status === "confirmed" && !order.shipmentId) {
      // 1. Create a shipment record first
      const boutique = await ctx.db.get(order.boutiqueId);
      const customer = await ctx.db.get(order.customerId);

      const shipmentId = await ctx.db.insert("shipments", {
        orderId: args.orderId,
        provider: "porter",
        status: "created",
        awbNumber: "",
        trackingUrl: "",
        rawWebhookEvents: [],
        pickupAddress: {
          name: boutique?.boutiqueName || "Boutique",
          line1: boutique?.address || "",
          city: boutique?.addressDetails?.city || "",
          state: boutique?.addressDetails?.state || "",
          pincode: boutique?.addressDetails?.pincode || "",
          phone: boutique?.phone || "",
        },
        deliveryAddress: {
          name: (order.deliveryAddress as any)?.name || customer?.email || "Customer",
          line1: order.deliveryAddress?.line1 || (order.deliveryAddress as any)?.formattedAddress || "",
          line2: order.deliveryAddress?.line2 || (order.deliveryAddress as any)?.houseNumber || "",
          city: (order.deliveryAddress as any)?.city || "",
          state: (order.deliveryAddress as any)?.state || "",
          pincode: (order.deliveryAddress as any)?.pincode || "",
          phone: order.deliveryAddress?.phone || customer?.phone || "",
        },
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(args.orderId, { shipmentId });

      const pickupAddress = buildBoutiquePorterAddress(boutique);
      const dropAddress = buildCustomerPorterAddress(
        order.deliveryAddress,
        (customer as any)?.name || customer?.email || "Customer",
        order.deliveryAddress.phone || customer?.phone
      );
      assertPorterAddressUsable(pickupAddress, "pickup");
      assertPorterAddressUsable(dropAddress, "drop");

      await ctx.scheduler.runAfter(0, internal.lib.porter.createOrder, {
        orderId: args.orderId,
        shipmentId: shipmentId,
        pickupAddress,
        dropAddress,
        orderNumber: order.orderNumber,
        deliveryInstructions: order.deliveryAddress.deliveryInstructions,
      });
    }

    const targetStatuses = ["confirmed", "packed", "out_for_delivery", "delivered"];
    if (targetStatuses.includes(args.status)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendOrderEmail, {
        orderId: args.orderId,
        event: args.status as "confirmed" | "packed" | "out_for_delivery" | "delivered",
      });

      let templateName = args.status as string;
      if (args.status === "confirmed") {
        templateName = "order_accepted";
      }

      await triggerNotification(
        ctx,
        order.customerId,
        "email",
        templateName,
        "order",
        order._id,
        JSON.stringify({
          orderNumber: order.orderNumber,
          amount: order.total,
        })
      );
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

      const boutique = await ctx.db.get(order.boutiqueId);
      const isWhatsAppEnabled = boutique?.whatsAppNotificationsEnabled ?? true;
      const recipientPhone = boutique?.notificationPhone || boutique?.phone;
      const cancelReason = order.cancelReason || "Cancelled by administrator";

      if (boutique?.email || boutique?.ownerEmail) {
        await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
          to: boutique.email || boutique.ownerEmail,
          subject: `Order Cancelled - ${order.orderNumber}`,
          html: `<p>Dear ${boutique.ownerName || "Merchant"},</p><p>Order ${order.orderNumber} has been cancelled by admin. Reason: ${cancelReason}</p>`,
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

    return args.orderId;
  },
});

export const notifyMerchant = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    const boutique = await ctx.db.get(order.boutiqueId);
    if (!boutique) throw new Error("Boutique not found");

    const now = Date.now();
    const recipientId = boutique.ownerUserId || order.customerId;

    const fifteenMinutesAgo = now - 15 * 60 * 1000;
    const existingNotification = await ctx.db
      .query("notificationEvents")
      .withIndex("by_entity_template", (q) =>
        q.eq("entityType", "order").eq("entityId", order._id).eq("template", "order_notification")
      )
      .filter((q) => q.and(
        q.eq(q.field("userId"), recipientId),
        q.gte(q.field("createdAt"), fifteenMinutesAgo)
      ))
      .first();

    if (existingNotification) {
      console.log(`[notifyMerchant] Notification "order_notification" was already sent to recipient ${recipientId} for order ${order._id} within the last 15 minutes. Skipping.`);
      return { success: true, message: "deduplicated" };
    }

    await triggerNotification(
      ctx,
      recipientId,
      "email",
      "order_notification",
      "order",
      order._id,
      JSON.stringify({
        email: boutique.email,
        subject: `ACTION REQUIRED: Please accept Order ${order.orderNumber}`,
        orderNumber: order.orderNumber,
        amount: order.total,
      })
    );

    await ctx.db.insert("auditLogs", {
      actorId: (await getCurrentUserOrNull(ctx))?._id,
      actorRole: "admin",
      action: "order.notify_merchant",
      entityType: "orders",
      entityId: order._id,
      metadata: JSON.stringify({ boutiqueId: boutique._id, boutiqueName: boutique.boutiqueName }),
      createdAt: now,
    });

    return { success: true };
  },
});

// ─── RETURN FLOW ──────────────────────────────────────────────────────────────

/**
 * Admin: Approve a customer return request.
 * Sets returnStatus = "approved". Does NOT create a Porter order yet.
 */
export const approveReturnAdmin = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");

    // Guard: only allow approval from null/requested state
    if (order.returnStatus && order.returnStatus !== "requested") {
      throw new Error(`Return is already in state "${order.returnStatus}". Cannot approve again.`);
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      returnStatus: "approved",
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: (await getCurrentUserOrNull(ctx))?._id,
      actorRole: "admin",
      action: "order.approve_return",
      entityType: "orders",
      entityId: order._id,
      metadata: JSON.stringify({ orderNumber: order.orderNumber }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Admin: Initiate a return shipment via Porter.
 * Creates a return shipment (isReturn=true) and books a Porter trip:
 *   CUSTOMER (pickup) → BOUTIQUE (drop)
 *
 * Idempotent: if returnShipmentId already exists, returns existing state.
 */
export const initiateReturnAdmin = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");

    // Idempotency: if return shipment already exists, return existing state
    if (order.returnShipmentId) {
      const existingShipment = await ctx.db.get(order.returnShipmentId);
      return {
        success: true,
        alreadyInitiated: true,
        returnShipmentId: order.returnShipmentId,
        returnStatus: order.returnStatus,
        awbNumber: existingShipment?.awbNumber ?? null,
      };
    }

    // Two flows dispatch the same customer -> boutique Porter leg:
    //   cash return   — admin has approved it (returnStatus "approved")
    //   exchange      — the seller has accepted it
    // Only the ending differs: a return refunds, an exchange issues a coupon.
    const acceptedExchange = await ctx.db
      .query("exchangeRequests")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
    const isAcceptedExchange = acceptedExchange?.status === "accepted";

    if (order.returnStatus !== "approved" && !isAcceptedExchange) {
      throw new Error(
        `Pickup needs an approved return or a seller-accepted exchange. Return state: "${order.returnStatus ?? "none"}", exchange state: "${acceptedExchange?.status ?? "none"}".`
      );
    }

    // Validate addresses exist
    if (!order.deliveryAddress || !order.deliveryAddress.lat || !order.deliveryAddress.lng) {
      throw new Error("Customer delivery address is missing or has no coordinates.");
    }

    const boutique = await ctx.db.get(order.boutiqueId);
    if (!boutique) throw new Error("Boutique not found.");

    const orderPickup = order.pickupAddress; // boutique snapshot from original order
    if (!orderPickup && (!boutique.latitude || !boutique.longitude)) {
      throw new Error("Boutique/seller address is missing or has no coordinates.");
    }

    const customer = await ctx.db.get(order.customerId);
    const now = Date.now();

    // ── Build shipment address snapshots ──────────────────────────────────
    // For the RETURN shipment:
    //   pickupAddress  = CUSTOMER (order.deliveryAddress)
    //   deliveryAddress = BOUTIQUE (order.pickupAddress / boutique record)

    // Who the rider is collecting from. This used to be the address LABEL —
    // "Home" — so the seller and admin panels showed a contact person called
    // Home, and a rider given a name like that has no idea who they are meant
    // to be asking for at the door.
    const returnContactName =
      (order.deliveryAddress as any).receiverName?.trim() ||
      (customer as any)?.name?.trim() ||
      customer?.email ||
      "Customer";

    const returnPickupAddress = {
      name: returnContactName,
      line1: order.deliveryAddress.line1 || order.deliveryAddress.formattedAddress || "No Address",
      city: order.deliveryAddress.city,
      state: order.deliveryAddress.state,
      pincode: order.deliveryAddress.pincode,
      phone: order.deliveryAddress.phone || customer?.phone || "",
    };

    const returnDeliveryAddress = {
      name: orderPickup?.boutiqueName || boutique?.boutiqueName || "Boutique",
      line1: orderPickup?.address || boutique?.address || "Store",
      city: orderPickup?.city || boutique?.addressDetails?.city || "",
      state: orderPickup?.state || boutique?.addressDetails?.state || "",
      pincode: orderPickup?.pincode || boutique?.addressDetails?.pincode || "",
      phone: orderPickup?.phone || boutique?.phone || "",
    };

    // ── Create return shipment record ─────────────────────────────────────
    const returnShipmentId = await ctx.db.insert("shipments", {
      orderId: args.orderId,
      provider: "porter",
      awbNumber: "",                   // will be filled by Porter createOrder callback
      status: "created",
      isReturn: true,
      idempotencyKey: `return_init_${args.orderId}`,
      pickupAddress: returnPickupAddress,
      deliveryAddress: returnDeliveryAddress,
      rawWebhookEvents: [{
        timestamp: now,
        status: "created",
        location: "System",
        remarks: "Return shipment initiated by admin.",
        rawPayload: JSON.stringify({ event: "created", isReturn: true }),
      }],
      createdAt: now,
      updatedAt: now,
    });

    // ── Link to order ────────────────────────────────────────────────────
    // returnStatus tracks the physical leg for both flows, so the Porter
    // webhook can sync picked_up / delivered without knowing which one it is.
    await ctx.db.patch(args.orderId, {
      returnShipmentId,
      returnStatus: "initiated",
      updatedAt: now,
    });

    if (isAcceptedExchange && acceptedExchange) {
      await ctx.db.patch(acceptedExchange._id, {
        returnShipmentId,
        updatedAt: now,
      });
    }

    // ── Schedule Porter createOrder ──────────────────────────────────────
    // CRITICAL: pickup = CUSTOMER, drop = BOUTIQUE
    // Uses the exact same Porter address format as forward booking (lines 938-967)
    // On a return the rider collects from the CUSTOMER and delivers to the
    // BOUTIQUE, so the two ends must carry different numbers. They did not on a
    // real return: the address on the order had been saved weeks earlier with
    // the boutique's number in its phone field, so Porter was handed the same
    // number at both ends and the rider — standing at the customer's door —
    // rang the shop.
    //
    // The address's own phone is still preferred, because a customer may
    // deliberately name someone else to receive the parcel. But when it turns
    // out to be the shop's number, the account's own number is the better
    // guess at who is actually waiting at that door.
    const lastTen = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(-10);

    const boutiquePhone = orderPickup?.phone || boutique?.phone || "";
    const addressPhone = order.deliveryAddress.phone || "";
    const accountPhone = customer?.phone || "";

    let customerPhone = addressPhone || accountPhone;
    let contactCollision = false;

    if (lastTen(customerPhone) && lastTen(customerPhone) === lastTen(boutiquePhone)) {
      if (lastTen(accountPhone) && lastTen(accountPhone) !== lastTen(boutiquePhone)) {
        customerPhone = accountPhone;
      } else {
        contactCollision = true;
      }
    }

    if (!lastTen(customerPhone)) {
      throw new ConvexError(
        "Cannot arrange a return: no contact number for the customer, so the rider would have no way to reach them."
      );
    }

    if (contactCollision) {
      // Not fatal — the return still has to happen — but the rider will see one
      // number at both ends of the trip and cannot tell the customer from the
      // shop, so it is recorded rather than passing silently.
      console.warn(
        `[Return] Order ${order.orderNumber}: customer and boutique share contact number ${lastTen(customerPhone)}. The rider cannot tell them apart.`
      );
      await ctx.db.insert("auditLogs", {
        actorRole: "system",
        action: "return.contact_collision",
        entityType: "orders",
        entityId: order._id,
        metadata: JSON.stringify({
          orderNumber: order.orderNumber,
          sharedNumber: lastTen(customerPhone),
        }),
        createdAt: now,
      });
    }

    // The boutique snapshot taken at order time wins over the live record, so a
    // seller who has since moved still gets the return at the address the parcel
    // actually left from.
    const returnPickup = buildCustomerPorterAddress(
      order.deliveryAddress,
      returnPickupAddress.name,
      customerPhone
    );
    const returnDrop = buildBoutiquePorterAddress(
      orderPickup
        ? {
            boutiqueName: orderPickup.boutiqueName,
            address: orderPickup.address,
            city: orderPickup.city ?? boutique?.city,
            state: orderPickup.state ?? boutique?.state,
            pincode: orderPickup.pincode ?? boutique?.pincode,
            latitude: orderPickup.latitude,
            longitude: orderPickup.longitude,
            phone: orderPickup.phone,
            addressDetails: boutique?.addressDetails,
          }
        : boutique,
      returnDeliveryAddress.name,
      boutiquePhone
    );
    assertPorterAddressUsable(returnPickup, "return pickup");
    assertPorterAddressUsable(returnDrop, "return drop");

    await ctx.scheduler.runAfter(0, internal.lib.porter.createOrder, {
      orderId: args.orderId,
      shipmentId: returnShipmentId,
      pickupAddress: returnPickup,
      dropAddress: returnDrop,
      orderNumber: order.orderNumber + "-RET",
      deliveryInstructions: order.deliveryAddress.deliveryInstructions,
    });

    // ── Audit log ─────────────────────────────────────────────────────────
    await ctx.db.insert("auditLogs", {
      actorId: (await getCurrentUserOrNull(ctx))?._id,
      actorRole: "admin",
      action: "order.initiate_return",
      entityType: "orders",
      entityId: order._id,
      metadata: JSON.stringify({
        orderNumber: order.orderNumber,
        returnShipmentId,
        route: "CUSTOMER → BOUTIQUE",
      }),
      createdAt: now,
    });

    return { success: true, returnShipmentId };
  },
});
