// convex/adminLogistics.ts
import { query, mutation, internalMutation, internalQuery, internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { shouldPollShipment, resolvePorterProgression } from "./lib/porterSync";
import { requireRole } from "./lib/auth";
import { logSystemAlert } from "./lib/alerts";
import { assertHyperlocalTransitionPrerequisites } from "./orders";
import { markOrderFinanciallyDelivered, markOrderPayoutEligible } from "./adminFinance";
import { triggerNotification } from "./lib/notifications";
import {
  buildCustomerPorterAddress,
  buildBoutiquePorterAddress,
  assertPorterAddressUsable,
} from "./lib/porterAddress";

// Provider configuration registry
export const LOGISTICS_PROVIDERS = {
  porter: {
    name: "Porter Hyperlocal",
    trackingUrl: (awb: string) => `https://tracking.porter.in/${awb}`,
  },
  manual: {
    name: "Manual Delivery (Boutique Self)",
    trackingUrl: (awb: string) => `https://tracking.hive.com/${awb}`,
  },
};

/**
 * Calculates the SLA status for a shipment.
 * Courier Pickup SLA:
 * - Start: readyForPickupAt (or order.readyForPickupAt / when shipment is created)
 * - End: pickedUpAt / order.pickedUpAt
 * - At Risk: > 45 minutes
 * - Breached: > 90 minutes
 *
 * Courier Delivery SLA:
 * - Start: pickedUpAt (or order.pickedUpAt / when shipment picked up)
 * - End: deliveredAt / order.deliveredAt
 * - At Risk: > 4 hours
 * - Breached: > 8 hours
 */
export function calculateShipmentSlaStatus(
  shipment: any,
  order: any
): "on_track" | "at_risk" | "breached" {
  const readyTime = order?.readyForPickupAt || shipment.createdAt;
  const pickedTime = order?.pickedUpAt || shipment.pickedUpAt;
  const deliveredTime = order?.deliveredAt || shipment.deliveredAt;

  // 1. If delivered, measure total delivery duration since pickedTime
  if (deliveredTime && pickedTime) {
    const deliveryDuration = deliveredTime - pickedTime;
    if (deliveryDuration > 8 * 3600 * 1000) return "breached";
    if (deliveryDuration > 4 * 3600 * 1000) return "at_risk";
  }

  // 2. If active delivery (picked up but not delivered)
  if (pickedTime && !deliveredTime) {
    const elapsedSincePickup = Date.now() - pickedTime;
    if (elapsedSincePickup > 8 * 3600 * 1000) return "breached";
    if (elapsedSincePickup > 4 * 3600 * 1000) return "at_risk";
  }

  // 3. If ready but not picked up (active pickup queue)
  if (readyTime && !pickedTime) {
    const elapsedSinceReady = Date.now() - readyTime;
    if (elapsedSinceReady > 90 * 60 * 1000) return "breached";
    if (elapsedSinceReady > 45 * 60 * 1000) return "at_risk";
  }

  // 4. If picked up, check if the pickup process itself breached
  if (pickedTime && readyTime) {
    const pickupDuration = pickedTime - readyTime;
    if (pickupDuration > 90 * 60 * 1000) return "breached";
    if (pickupDuration > 45 * 60 * 1000) return "at_risk";
  }

  return "on_track";
}

/**
 * Auto-attribute delay responsibility based on exceptions
 */
export function resolveDelayResponsibility(
  exceptionType?: string
): "boutique" | "courier" | "customer" | "system" | undefined {
  if (!exceptionType) return undefined;
  if (["customer_unreachable", "address_issue", "door_locked", "payment_issue"].includes(exceptionType)) {
    return "customer";
  }
  if (["courier_damage", "lost_package"].includes(exceptionType)) {
    return "courier";
  }
  return "system";
}

// Strict shipment state transition machine
const VALID_SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  created: ["pickup_scheduled", "booking_requested", "driver_assigned"],
  booking_requested: ["driver_assigned", "pickup_scheduled", "booking_failed", "cancelled"],
  booking_failed: ["booking_requested", "cancelled"],
  driver_assigned: ["driver_arrived", "picked_up", "in_transit", "cancelled", "pickup_scheduled", "created"],
  driver_arrived: ["picked_up", "in_transit", "cancelled", "created"],
  pickup_scheduled: ["driver_assigned", "driver_arrived", "picked_up", "in_transit", "cancelled", "created"],
  picked_up: ["in_transit", "failed", "delivered"],
  in_transit: ["out_for_delivery", "delivered", "failed", "rto_initiated"],
  out_for_delivery: ["delivered", "failed"],
  failed: ["out_for_delivery", "rto_initiated", "in_transit"],
  rto_initiated: ["rto_in_transit"],
  rto_in_transit: ["rto_delivered"],
  rto_delivered: ["returned"],
  delivered: [],
  returned: [],
  cancelled: [],
  lost: [], // Terminal administrative state
};

/**
 * Get all shipments in the database along with details and dashboard metrics.
 */
export const getLogisticsQueueAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const now = Date.now();

    const shipments = await ctx.db.query("shipments").collect();
    const results: any[] = [];

    // KPI Metrics counters
    let readyToShip = 0;
    let inTransit = 0;
    let exceptions = 0;
    let rtoQueue = 0;
    let lostShipments = 0;

    // Same-Day Success Rate counters
    let totalDeliveredCount = 0;
    let deliveredWithin8hCount = 0;

    for (const s of shipments) {
      const order = await ctx.db.get(s.orderId);
      const boutique = order ? await ctx.db.get(order.boutiqueId) : null;
      const customer = order ? await ctx.db.get(order.customerId) : null;

      // Calculate dynamic SLA status
      const computedSla = order ? calculateShipmentSlaStatus(s, order) : (s.slaStatus || "on_track");

      // Count delivered success rates
      if (s.status === "delivered") {
        totalDeliveredCount++;
        if (order && order.orderAcceptedAt && order.deliveredAt) {
          const duration = order.deliveredAt - order.orderAcceptedAt;
          if (duration <= 8 * 3600 * 1000) {
            deliveredWithin8hCount++;
          }
        }
      }

      // Aggregate metrics based on status
      if (s.status === "created" || s.status === "pickup_scheduled") {
        readyToShip++;
      } else if (
        s.status === "picked_up" ||
        s.status === "in_transit" ||
        s.status === "out_for_delivery"
      ) {
        inTransit++;
      } else if (s.status === "failed") {
        exceptions++;
      } else if (
        s.status === "rto_initiated" ||
        s.status === "rto_in_transit" ||
        s.status === "rto_delivered"
      ) {
        rtoQueue++;
      } else if (s.status === "lost") {
        lostShipments++;
      }

      results.push({
        ...s,
        slaStatus: computedSla,
        orderNumber: order?.orderNumber,
        orderTotal: order?.total,
        boutiqueName: boutique?.boutiqueName,
        customerName: customer?.email || "Unknown Customer",
        isVirtual: false,
      });
    }

    // Now pull all orders that do NOT have shipments yet but require merchant/admin action
    const [pending, confirmed, packed] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "pending_confirmation")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "confirmed")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "packed")).collect(),
    ]);
    const activeOrdersWithoutShipments = [...pending, ...confirmed, ...packed];

    for (const o of activeOrdersWithoutShipments) {
      if (o.shipmentId) continue; // safety check
      const boutique = await ctx.db.get(o.boutiqueId);
      const customer = await ctx.db.get(o.customerId);

      // AWAITING ACCEPTANCE or READY FOR PICKUP virtual SLA
      let virtualSla: "on_track" | "at_risk" | "breached" = "on_track";
      if (o.status === "pending_confirmation") {
        const elapsed = now - o.createdAt;
        if (elapsed > 30 * 60 * 1000) virtualSla = "breached";
        else if (elapsed > 15 * 60 * 1000) virtualSla = "at_risk";
      } else if (o.status === "confirmed" || o.status === "packed") {
        const readyTime = o.orderAcceptedAt || o.confirmedAt || o.createdAt;
        const elapsed = now - readyTime;
        if (elapsed > 90 * 60 * 1000) virtualSla = "breached";
        else if (elapsed > 45 * 60 * 1000) virtualSla = "at_risk";
      }

      // Add virtual card count to metrics if appropriate
      if (o.status === "confirmed" || o.status === "packed") {
        readyToShip++;
      }

      results.push({
        _id: `virtual_${o._id}`,
        orderId: o._id,
        provider: "manual",
        awbNumber: "PENDING",
        status: o.status,
        pickupAddress: { name: "", line1: "", city: "", state: "", pincode: "", phone: "" },
        deliveryAddress: { name: "", line1: "", city: "", state: "", pincode: "", phone: "" },
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        slaStatus: virtualSla,
        orderNumber: o.orderNumber,
        orderTotal: o.total,
        boutiqueName: boutique?.boutiqueName,
        customerName: customer?.email || "Unknown Customer",
        isVirtual: true,
      });
    }

    // Sort by creation time descending
    results.sort((a, b) => b.createdAt - a.createdAt);

    // Compute Same-Day Success Rate KPI
    const sameDaySuccessRate =
      totalDeliveredCount > 0 ? (deliveredWithin8hCount / totalDeliveredCount) * 100 : 100;

    let sameDaySuccessRating: "excellent" | "healthy" | "needs_attention" = "excellent";
    if (sameDaySuccessRate < 90) {
      sameDaySuccessRating = "needs_attention";
    } else if (sameDaySuccessRate < 95) {
      sameDaySuccessRating = "healthy";
    }

    return {
      shipments: results,
      metrics: {
        readyToShip,
        inTransit,
        exceptions,
        rtoQueue,
        lostShipments,
        sameDaySuccessRate: Math.round(sameDaySuccessRate * 10) / 10,
        sameDaySuccessRating,
        totalDelivered: totalDeliveredCount,
        deliveredWithin8h: deliveredWithin8hCount,
      },
    };
  },
});

/**
 * Get shipment details by its ID, with order, items, and customer information.
 */
export const getShipmentByIdAdmin = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");

    const order = await ctx.db.get(shipment.orderId);
    if (!order) throw new Error("Order not found");

    const boutique = await ctx.db.get(order.boutiqueId);
    const customer = await ctx.db.get(order.customerId);

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    return {
      shipment,
      order,
      boutique,
      customer,
      items,
    };
  },
});

/**
 * Create a new shipment booking for an order.
 */
export const createShipmentAdmin = mutation({
  args: {
    orderId: v.id("orders"),
    provider: v.string(), // "shiprocket" | "manual"
    awbNumber: v.string(),
    estimatedDeliveryDays: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    if (order.shipmentId) {
      throw new Error("Order already has an associated shipment");
    }

    // Validate provider
    if (!["shiprocket", "manual"].includes(args.provider)) {
      throw new Error(`Invalid provider: ${args.provider}. Supported: shiprocket, manual`);
    }

    const providerConfig = LOGISTICS_PROVIDERS[args.provider as keyof typeof LOGISTICS_PROVIDERS];
    const trackingUrl = providerConfig.trackingUrl(args.awbNumber);

    // Resolve Boutique pickup details
    const orderPickup = order.pickupAddress;
    const boutique = orderPickup ? null : await ctx.db.get(order.boutiqueId);
    const pickupAddress = {
      name: orderPickup?.boutiqueName || boutique?.boutiqueName || "Boutique Pickup Center",
      line1: orderPickup?.address || boutique?.address || "Address snapshot pending",
      city: orderPickup?.city || boutique?.addressDetails?.city || "Unknown City",
      state: orderPickup?.state || boutique?.addressDetails?.state || "Unknown State",
      pincode: orderPickup?.pincode || boutique?.addressDetails?.pincode || "000000",
      phone: orderPickup?.phone || boutique?.phone || "7356019103",
    };

    // Resolve Customer delivery details
    const customer = await ctx.db.get(order.customerId);
    const deliveryAddress = {
      name: order.deliveryAddress.label || "Customer Delivery",
      line1: order.deliveryAddress.line1 || order.deliveryAddress.formattedAddress || "No Address Line 1",
      line2: order.deliveryAddress.line2,
      city: order.deliveryAddress.city,
      state: order.deliveryAddress.state,
      pincode: order.deliveryAddress.pincode,
      phone: customer?.phone || "9999999999",
    };

    const shipmentId = await ctx.db.insert("shipments", {
      orderId: args.orderId,
      provider: args.provider,
      awbNumber: args.awbNumber,
      status: "pickup_scheduled",
      idempotencyKey: `ship_init_${args.orderId}`,
      trackingUrl,
      pickupAddress,
      deliveryAddress,
      estimatedDelivery: now + args.estimatedDeliveryDays * 24 * 3600 * 1000,
      slaStatus: "on_track",
      rawWebhookEvents: [
        {
          timestamp: now,
          status: "pickup_scheduled",
          location: "System",
          remarks: `Fulfillment booked via ${providerConfig.name} and pickup scheduled.`,
          rawPayload: JSON.stringify({ event: "created", provider: args.provider }),
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    // Link shipment back to order & record readyForPickupAt
    const orderPatch: Record<string, any> = {
      shipmentId,
      status: "pickup_scheduled",
      pickupScheduledAt: now,
      updatedAt: now,
    };
    if (!order.readyForPickupAt) {
      orderPatch.readyForPickupAt = now;
    }
    await ctx.db.patch(args.orderId, orderPatch);

    // Write audit log
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.create",
      entityType: "shipments",
      entityId: shipmentId,
      metadata: JSON.stringify({ orderId: args.orderId, awbNumber: args.awbNumber, provider: args.provider }),
      createdAt: now,
    });

    return shipmentId;
  },
});

/**
 * Simulate receiving a webhook ping from the logistics provider.
 * Enforces strict transitions matching VALID_SHIPMENT_TRANSITIONS.
 */
export const simulateLogisticsWebhookAdmin = mutation({
  args: {
    awbNumber: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("pickup_scheduled"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("returned"),
      v.literal("rto_initiated"),
      v.literal("rto_in_transit"),
      v.literal("rto_delivered"),
      v.literal("cancelled")
    ),
    exceptionType: v.optional(
      v.union(
        v.literal("customer_unreachable"),
        v.literal("address_issue"),
        v.literal("door_locked"),
        v.literal("payment_issue"),
        v.literal("courier_damage"),
        v.literal("lost_package"),
        v.literal("other")
      )
    ),
    remarks: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEBUG_TOOLS !== "true") {
      throw new Error("Simulator disabled");
    }
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber))
      .first();

    if (!shipment) throw new Error(`Shipment with AWB ${args.awbNumber} not found.`);

    // State machine check
    const fromStatus = shipment.status;
    const validTransitions = VALID_SHIPMENT_TRANSITIONS[fromStatus];
    if (!validTransitions || !validTransitions.includes(args.status)) {
      await logSystemAlert(ctx, "shipment.transition_failed", `State machine violation: Cannot transition shipment status from '${fromStatus}' to '${args.status}' on AWB ${args.awbNumber}`, "critical", { shipmentId: shipment._id, status: args.status });
      throw new Error(
        `State machine violation: Cannot transition shipment status from '${fromStatus}' to '${args.status}'.`
      );
    }

    const patchData: any = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "delivered") {
      patchData.deliveredAt = now;
    }
    if (args.status === "picked_up") {
      patchData.pickedUpAt = now;
    }

    // Record exception type if failure is recorded
    if (args.status === "failed") {
      const excType = args.exceptionType || "other";
      patchData.exceptionType = excType;
      patchData.delayResponsibility = resolveDelayResponsibility(excType) || "courier";
    } else {
      patchData.exceptionType = undefined;
    }

    // Sync status to the parent order
    const order = await ctx.db.get(shipment.orderId);
    const orderPatch: any = { updatedAt: now };

    if (order) {
      if (args.status === "pickup_scheduled") {
        orderPatch.status = "pickup_scheduled";
        orderPatch.pickupScheduledAt = now;
        if (!order.readyForPickupAt) {
          orderPatch.readyForPickupAt = now;
        }
      } else if (args.status === "picked_up") {
        orderPatch.status = "picked_up";
        orderPatch.pickedUpAt = now;
      } else if (args.status === "in_transit") {
        orderPatch.status = "in_transit";
        orderPatch.inTransitAt = now;
        // The parcel is in the rider's hands, so it was collected.
        if (!order.pickedUpAt) orderPatch.pickedUpAt = now;
      } else if (args.status === "out_for_delivery") {
        orderPatch.status = "out_for_delivery";
        orderPatch.outForDeliveryAt = now;
      } else if (args.status === "delivered") {
        orderPatch.status = "delivered";
        orderPatch.deliveredAt = now;
        orderPatch.claimWindowExpiresAt = now + 24 * 3600 * 1000; // 24-hour claim window
      } else if (args.status === "returned" || args.status === "cancelled") {
        orderPatch.status = "cancelled";
        orderPatch.cancelledAt = now;
      }

      if (args.status === "delivered") {
        // The finance helpers re-read the shipment from the DB, so the shipment
        // must already be `delivered` before accrual / payout eligibility runs.
        await ctx.db.patch(shipment._id, { status: "delivered", deliveredAt: now, updatedAt: now });
      }

      await ctx.db.patch(order._id, orderPatch);

      if (args.status === "delivered") {
        await markOrderFinanciallyDelivered(ctx, order._id, now);
        // Delivery confirmed -> release seller payment (idempotent).
        await markOrderPayoutEligible(ctx, order._id, now);
      }
    }

    // Calculate and patch SLA status
    const mergedOrderForSla = order ? { ...order, ...orderPatch } : null;
    const mergedShipmentForSla = { ...shipment, ...patchData };
    patchData.slaStatus = mergedOrderForSla ? calculateShipmentSlaStatus(mergedShipmentForSla, mergedOrderForSla) : "on_track";

    const rawWebhookEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
    rawWebhookEvents.push({
      timestamp: now,
      status: args.status,
      location: args.location || "Hub Terminal",
      remarks: args.remarks || `Courier webhook signal: status set to ${args.status}`,
      rawPayload: JSON.stringify(args),
    });
    patchData.rawWebhookEvents = rawWebhookEvents;

    await ctx.db.patch(shipment._id, patchData);

    // Write audit log
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.webhook_simulation",
      entityType: "shipments",
      entityId: shipment._id,
      metadata: JSON.stringify({
        awbNumber: args.awbNumber,
        fromStatus,
        toStatus: args.status,
        exceptionType: args.exceptionType,
      }),
      createdAt: now,
    });

    return { success: true, fromStatus, toStatus: args.status };
  },
});

/**
 * Internal mutation to process a status update from a webhook.
 * Does not check admin authentication since it is triggered by an internal action/httpAction.
 */
export const processLogisticsStatusUpdateInternal = internalMutation({
  args: {
    awbNumber: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("booking_requested"),
      v.literal("booking_confirmed"),
      v.literal("driver_assigned"),
      v.literal("driver_arrived"),
      v.literal("booking_failed"),
      v.literal("pickup_scheduled"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("returned"),
      v.literal("rto_initiated"),
      v.literal("rto_in_transit"),
      v.literal("rto_delivered"),
      v.literal("cancelled")
    ),
    exceptionType: v.optional(
      v.union(
        v.literal("customer_unreachable"),
        v.literal("address_issue"),
        v.literal("door_locked"),
        v.literal("payment_issue"),
        v.literal("courier_damage"),
        v.literal("lost_package"),
        v.literal("other")
      )
    ),
    remarks: v.optional(v.string()),
    location: v.optional(v.string()),
    driverDetails: v.optional(
      v.object({
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        vehiclePlate: v.optional(v.string()),
        liveTrackingUrl: v.optional(v.string()),
        trackingUrl: v.optional(v.string()),
        etaMinutes: v.optional(v.number()),
      })
    ),
    porterRawOrder: v.optional(v.any()),
    scans: v.optional(v.array(v.any())),
    // Trusted courier event timestamp (epoch ms). Porter sends `order_details.event_ts`.
    eventTs: v.optional(v.number()),
    actualTripFare: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Prefer the courier's own event timestamp for milestone stamps, but only when
    // it is plausible — a malformed/clock-skewed value must never corrupt SLA or
    // payout timing.
    const MAX_EVENT_TS_SKEW_MS = 24 * 3600 * 1000;
    const eventTs =
      args.eventTs !== undefined &&
      Number.isFinite(args.eventTs) &&
      args.eventTs > 0 &&
      Math.abs(now - args.eventTs) <= MAX_EVENT_TS_SKEW_MS
        ? args.eventTs
        : now;

    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber))
      .first();

    if (!shipment) throw new Error(`Shipment with AWB ${args.awbNumber} not found.`);

    // State machine check
    const fromStatus = shipment.status;
    
    // Idempotency: skip if already in this status.
    // A repeated `order_end_job` must leave the order delivered and must never
    // create a second payout — markOrderPayoutEligible is idempotent and only
    // self-heals an order that was delivered but never queued for settlement.
    if (fromStatus === args.status) {
      if (args.status === "delivered" && !shipment.isReturn) {
        await markOrderPayoutEligible(ctx, shipment.orderId, shipment.deliveredAt ?? eventTs);
      }
      return { success: true, message: "Idempotent request ignored" };
    }

    const validTransitions = VALID_SHIPMENT_TRANSITIONS[fromStatus];
    if (!validTransitions || !validTransitions.includes(args.status)) {
      await logSystemAlert(ctx, "shipment.transition_failed", `State machine violation: Cannot transition shipment status from '${fromStatus}' to '${args.status}' on AWB ${args.awbNumber}`, "critical", { shipmentId: shipment._id, status: args.status });
      throw new Error(
        `State machine violation: Cannot transition shipment status from '${fromStatus}' to '${args.status}'.`
      );
    }

    // ── RETURN SHIPMENT BRANCH ────────────────────────────────────────────
    // If this shipment is a return (isReturn === true), process it independently.
    // Updates return shipment status + order.returnStatus.
    // Does NOT touch order.status, markOrderFinanciallyDelivered, or markOrderPayoutEligible.
    if (shipment.isReturn) {
      const returnPatchData: any = {
        status: args.status,
        updatedAt: now,
      };

      if (args.status === "delivered") {
        returnPatchData.deliveredAt = eventTs;
      }
      if (args.status === "picked_up") {
        returnPatchData.pickedUpAt = eventTs;
      }
      // Porter has no separate "picked up" event: `order_start_trip` means the
      // rider has the parcel and is driving to the drop, which IS the pickup.
      // Without this the collection time was never recorded on a real delivery
      // and the timeline's pickup row stayed permanently empty.
      if (args.status === "in_transit" && !shipment.pickedUpAt) {
        returnPatchData.pickedUpAt = eventTs;
      }

      // Driver details
      if (args.driverDetails) {
        if (args.driverDetails.name) returnPatchData.driverName = args.driverDetails.name;
        if (args.driverDetails.phone) returnPatchData.driverPhone = args.driverDetails.phone;
        if (args.driverDetails.vehiclePlate) returnPatchData.vehiclePlate = args.driverDetails.vehiclePlate;
        if (args.driverDetails.liveTrackingUrl) returnPatchData.liveTrackingUrl = args.driverDetails.liveTrackingUrl;
        if (args.driverDetails.trackingUrl) returnPatchData.trackingUrl = args.driverDetails.trackingUrl;
        if (args.driverDetails.etaMinutes !== undefined) returnPatchData.etaMinutes = args.driverDetails.etaMinutes;
        returnPatchData.bookingStatus = "booked";
      }

      if (args.porterRawOrder !== undefined) {
        returnPatchData.porterRawOrder = args.porterRawOrder;
        returnPatchData.porterLastSyncAt = now;
      }

      // Webhook event log
      const returnRawEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
      returnRawEvents.push({
        timestamp: now,
        status: args.status,
        location: args.location || "Hub Terminal",
        remarks: args.remarks || `Return courier webhook: status set to ${args.status}`,
        rawPayload: JSON.stringify(args),
      });
      returnPatchData.rawWebhookEvents = returnRawEvents;
      returnPatchData.lastWebhookAt = now;

      await ctx.db.patch(shipment._id, returnPatchData);

      // Sync return status to the parent order (returnStatus only — NEVER order.status)
      const returnOrder = await ctx.db.get(shipment.orderId);
      if (returnOrder) {
        let returnStatus = returnOrder.returnStatus;
        if (args.status === "picked_up") {
          returnStatus = "picked_up";
        } else if (args.status === "in_transit") {
          returnStatus = "in_transit";
        } else if (args.status === "delivered") {
          returnStatus = "delivered";
        } else if (args.status === "failed" || args.status === "cancelled") {
          returnStatus = "failed";
        }
        if (returnStatus !== returnOrder.returnStatus) {
          await ctx.db.patch(returnOrder._id, { returnStatus, updatedAt: now });
        }

        // The item is physically back with the seller. It no longer settles
        // itself: the refund or exchange credit waits for the seller or admin to
        // check the item and accept it (see returnInspection.ts).
      }

      // Audit log for return webhook
      await ctx.db.insert("auditLogs", {
        actorRole: "system",
        action: "shipments.return_webhook_update",
        entityType: "shipments",
        entityId: shipment._id,
        metadata: JSON.stringify({
          awbNumber: args.awbNumber,
          fromStatus,
          toStatus: args.status,
          isReturn: true,
        }),
        createdAt: now,
      });

      // CRITICAL: Return early. Do NOT fall through to forward-delivery logic.
      // This prevents markOrderFinanciallyDelivered, markOrderPayoutEligible,
      // and any order.status mutation from executing for return shipments.
      return { success: true, fromStatus, toStatus: args.status, isReturn: true };
    }
    // ── END RETURN SHIPMENT BRANCH ─────────────────────────────────────────

    const patchData: any = {
      status: args.status,
      updatedAt: now,
    };

    if (args.scans && args.scans.length > 0) {
      const existingScans = shipment.scans || [];
      const newScans = [...existingScans];
      
      for (const scan of args.scans) {
        // Deduplicate by timestamp and status
        const isDuplicate = existingScans.some(
          (s: any) => s.date === scan.date && s.status === scan.status
        );
        if (!isDuplicate) {
          newScans.push(scan);
        }
      }
      patchData.scans = newScans;
    }

    if (args.status === "delivered") {
      patchData.deliveredAt = eventTs;
    }
    if (args.status === "picked_up") {
      patchData.pickedUpAt = eventTs;
    }
    // Porter has no separate "picked up" event: `order_start_trip` means the
    // rider has the parcel and is driving to the drop, which IS the pickup.
    // Without this the collection time was never recorded on a real delivery
    // and the timeline's pickup row stayed permanently empty.
    if (args.status === "in_transit" && !shipment.pickedUpAt) {
      patchData.pickedUpAt = eventTs;
    }
    // Porter reports the real trip fare on completion — record it before the
    // settlement snapshot is frozen so Hive unit economics use the actual cost.
    // Only the outbound trip is the order's delivery cost; a return leg must
    // not overwrite it with its own fare.
    if (args.actualTripFare !== undefined && args.actualTripFare > 0 && !shipment.isReturn) {
      const subsidyRow = await ctx.db
        .query("deliverySubsidyLedger")
        .withIndex("by_orderId", (q) => q.eq("orderId", shipment.orderId))
        .first();
      if (subsidyRow) {
        // The subsidy was computed from the quote; recompute it from what
        // Porter actually charged, so the margin reflects the real fare.
        const subsidyAmount = args.actualTripFare - (subsidyRow.customerPaidFee ?? 0);
        await ctx.db.patch(subsidyRow._id, {
          actualCourierCost: args.actualTripFare,
          actualPorterCost: args.actualTripFare,
          subsidyAmount,
          subsidyPercent: subsidyRow.cartSubtotal > 0 ? subsidyAmount / subsidyRow.cartSubtotal : 0,
        });
      }
    }

    if (args.driverDetails) {
      if (args.driverDetails.name) patchData.driverName = args.driverDetails.name;
      if (args.driverDetails.phone) patchData.driverPhone = args.driverDetails.phone;
      if (args.driverDetails.vehiclePlate) patchData.vehiclePlate = args.driverDetails.vehiclePlate;
      if (args.driverDetails.liveTrackingUrl) patchData.liveTrackingUrl = args.driverDetails.liveTrackingUrl;
      if (args.driverDetails.trackingUrl) patchData.trackingUrl = args.driverDetails.trackingUrl;
      if (args.driverDetails.etaMinutes !== undefined) patchData.etaMinutes = args.driverDetails.etaMinutes;
      patchData.bookingStatus = "booked";
    }

    if (args.porterRawOrder !== undefined) {
      patchData.porterRawOrder = args.porterRawOrder;
      patchData.porterLastSyncAt = now;
    }

    // Record exception type if failure is recorded
    if (args.status === "failed") {
      const excType = args.exceptionType || "other";
      patchData.exceptionType = excType;
      patchData.delayResponsibility = resolveDelayResponsibility(excType) || "courier";
    } else {
      patchData.exceptionType = undefined;
    }

    // Sync status to the parent order
    const order = await ctx.db.get(shipment.orderId);
    const orderPatch: any = { updatedAt: now };

    if (order) {
      if (args.status === "created") {
        orderPatch.status = "confirmed";
        // Porter tells us WHEN each transition happened. The shipment already
        // recorded `eventTs`; the order recorded the moment Hive found out, so
        // a retried webhook — or the poll, which can run minutes later — put a
        // discovery time on the order and the real time on its shipment. The
        // two disagreed by nearly seven minutes on the first live delivery.
      } else if (args.status === "pickup_scheduled") {
        orderPatch.status = "pickup_scheduled";
        orderPatch.pickupScheduledAt = eventTs;
        if (!order.readyForPickupAt) {
          orderPatch.readyForPickupAt = eventTs;
        }
      } else if (args.status === "driver_assigned") {
        orderPatch.status = "pickup_scheduled";
        orderPatch.pickupScheduledAt = eventTs;
      } else if (args.status === "driver_arrived") {
        orderPatch.status = "pickup_scheduled";
      } else if (args.status === "picked_up") {
        orderPatch.status = "picked_up";
        orderPatch.pickedUpAt = eventTs;
      } else if (args.status === "in_transit") {
        orderPatch.status = "in_transit";
        orderPatch.inTransitAt = eventTs;
        // The parcel is in the rider's hands, so it was collected.
        if (!order.pickedUpAt) orderPatch.pickedUpAt = eventTs;
      } else if (args.status === "out_for_delivery") {
        orderPatch.status = "out_for_delivery";
        orderPatch.outForDeliveryAt = eventTs;
      } else if (args.status === "delivered") {
        orderPatch.status = "delivered";
        orderPatch.deliveredAt = eventTs;
        orderPatch.claimWindowExpiresAt = eventTs + 24 * 3600 * 1000;
      } else if (args.status === "returned" || args.status === "cancelled") {
        orderPatch.status = "cancelled";
        orderPatch.cancelledAt = now;
      }

      if (args.status === "delivered") {
        // The finance helpers re-read the shipment from the DB, so the shipment
        // must already be `delivered` before accrual / payout eligibility runs.
        // The remaining shipment fields are patched further down.
        await ctx.db.patch(shipment._id, { status: "delivered", deliveredAt: eventTs, updatedAt: now });
      }

      await ctx.db.patch(order._id, orderPatch);

      if (args.status === "delivered") {
        await markOrderFinanciallyDelivered(ctx, order._id, eventTs);
        // Delivery confirmed -> release seller payment (idempotent).
        await markOrderPayoutEligible(ctx, order._id, eventTs);
      }
    }

    // Calculate and patch SLA status
    const mergedOrderForSla = order ? { ...order, ...orderPatch } : null;
    const mergedShipmentForSla = { ...shipment, ...patchData };
    patchData.slaStatus = mergedOrderForSla ? calculateShipmentSlaStatus(mergedShipmentForSla, mergedOrderForSla) : "on_track";

    const rawWebhookEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
    rawWebhookEvents.push({
      timestamp: now,
      status: args.status,
      location: args.location || "Hub Terminal",
      remarks: args.remarks || `Courier webhook signal: status set to ${args.status}`,
      rawPayload: JSON.stringify(args),
    });
    patchData.rawWebhookEvents = rawWebhookEvents;
    patchData.lastWebhookAt = now;

    await ctx.db.patch(shipment._id, patchData);

    // Trigger ops Slack alert: Rider Assigned
    if (args.status === "driver_assigned" && args.driverDetails) {
      const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
      if (superadmin && order) {
        const adminId = superadmin._id;
        const boutiqueDoc = order.boutiqueId ? await ctx.db.get(order.boutiqueId) : null;
        await triggerNotification(ctx, adminId, "slack", "rider_assigned_ops", "order", order._id, JSON.stringify({
          orderNumber: order.orderNumber,
          boutiqueName: (boutiqueDoc as any)?.boutiqueName || (boutiqueDoc as any)?.name || order.boutiqueName || "Boutique",
          driverName: args.driverDetails.name || "Assigned Courier Partner",
          driverPhone: args.driverDetails.phone || "N/A",
          vehiclePlate: args.driverDetails.vehiclePlate || "N/A",
          liveTrackingUrl: args.driverDetails.liveTrackingUrl || args.driverDetails.trackingUrl || "",
        }));
      }
    }

    // Trigger ops Slack alerts for exceptions
    if (args.status === "failed" || args.status === "rto_initiated") {
      const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
      if (superadmin && order) {
        await triggerNotification(ctx, superadmin._id, "slack", `shipment_${args.status}`, "order", order._id, JSON.stringify({
          awbNumber: args.awbNumber,
          exceptionType: args.exceptionType || "N/A",
          remarks: args.remarks || "No remarks provided"
        }));
      }
    }

    // Write audit log
    await ctx.db.insert("auditLogs", {
      actorRole: "system",
      action: "shipments.webhook_update",
      entityType: "shipments",
      entityId: shipment._id,
      metadata: JSON.stringify({
        awbNumber: args.awbNumber,
        fromStatus,
        toStatus: args.status,
        exceptionType: args.exceptionType,
        driverUpdated: !!args.driverDetails,
      }),
      createdAt: now,
    });

    return { success: true, fromStatus, toStatus: args.status };
  },
});

/**
 * Resolve a courier exception manually from the dashboard.
 */
export const resolveLogisticsExceptionAdmin = mutation({
  args: {
    shipmentId: v.id("shipments"),
    action: v.union(v.literal("reattempt"), v.literal("update_address"), v.literal("force_rto")),
    notes: v.string(),
    delayResponsibility: v.optional(v.union(v.literal("boutique"), v.literal("courier"), v.literal("customer"), v.literal("system"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");

    let newStatus = shipment.status;
    if (args.action === "force_rto") {
      newStatus = "rto_initiated";
    } else if (args.action === "reattempt" || args.action === "update_address") {
      newStatus = "in_transit";
    }

    // Verify FSM transition
    const validTransitions = VALID_SHIPMENT_TRANSITIONS[shipment.status];
    if (!validTransitions || !validTransitions.includes(newStatus)) {
      throw new Error(
        `State machine violation: Cannot resolve exception from '${shipment.status}' to '${newStatus}'.`
      );
    }

    const rawWebhookEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
    rawWebhookEvents.push({
      timestamp: now,
      status: newStatus,
      location: "Admin Desk",
      remarks: `Exception resolved manually via ${args.action}. Notes: ${args.notes}`,
      rawPayload: JSON.stringify({ action: args.action, notes: args.notes, delayResponsibility: args.delayResponsibility }),
    });

    const patchData: any = {
      status: newStatus,
      exceptionType: undefined, // Clear exception flag
      rawWebhookEvents,
      updatedAt: now,
    };
    if (args.delayResponsibility) {
      patchData.delayResponsibility = args.delayResponsibility;
    }

    await ctx.db.patch(shipment._id, patchData);

    // Update parent order
    const order = await ctx.db.get(shipment.orderId);
    if (order) {
      await ctx.db.patch(order._id, {
        status: "in_transit",
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.resolve_exception",
      entityType: "shipments",
      entityId: shipment._id,
      metadata: JSON.stringify({ action: args.action, notes: args.notes }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Reconcile returned packages. Increments boutique stock counts idempotently.
 */
export const confirmRtoReceiptAdmin = mutation({
  args: {
    shipmentId: v.id("shipments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");

    // 1. RTO Idempotency Guard
    if (shipment.inventoryRestored) {
      await logSystemAlert(ctx, "inventory.restore_blocked", `Idempotency Guard: Attempted double stock restoral on Shipment AWB ${shipment.awbNumber}`, "critical", { shipmentId: shipment._id });
      throw new Error("Idempotency Guard: Inventory has already been restored for this RTO package.");
    }

    const order = await ctx.db.get(shipment.orderId);
    if (!order) throw new Error("Order not found.");

    // 2. Increment stock counts
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    for (const item of items) {
      const product = await ctx.db.get(item.productId);
      if (!product) continue;

      const currentStock = { ...product.stockBySize };
      const beforeQty = currentStock[item.variantSize] ?? 0;
      const afterQty = beforeQty + item.quantity;
      currentStock[item.variantSize] = afterQty;

      let active = product.active;
      let autoDeactivatedBecauseOutOfStock = product.autoDeactivatedBecauseOutOfStock ?? false;
      if (product.autoDeactivatedBecauseOutOfStock && beforeQty === 0 && afterQty > 0) {
        active = true;
        autoDeactivatedBecauseOutOfStock = false;
      }

      await ctx.db.patch(product._id, {
        stockBySize: currentStock,
        active,
        autoDeactivatedBecauseOutOfStock,
        updatedAt: now,
      });

      await ctx.db.insert("inventoryMovements", {
        productId: product._id,
        boutiqueId: item.boutiqueId,
        size: item.variantSize,
        beforeQty,
        afterQty,
        adjustmentQty: item.quantity,
        reason: "returned_item",
        source: "admin",
        createdBy: admin._id,
        notes: args.notes || `RTO package received at boutique. Stock restored for order ${order.orderNumber}.`,
        createdAt: now,
      });
    }

    // 3. Mark shipment returned and stock restored
    const rawWebhookEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
    rawWebhookEvents.push({
      timestamp: now,
      status: "returned",
      location: "Boutique Warehouse",
      remarks: `RTO confirmation received at boutique. Stock restored. Notes: ${args.notes || "None"}`,
      rawPayload: JSON.stringify({ notes: args.notes }),
    });

    await ctx.db.patch(shipment._id, {
      status: "returned",
      inventoryRestored: true,
      inventoryRestoredAt: now,
      rawWebhookEvents,
      updatedAt: now,
    });

    // 4. Close the order out.
    //
    // An RTO means the customer was unreachable or refused the parcel. The
    // seller made the item and shipped it, so under Hive's policy they keep
    // the payment and get the goods back — there is no customer refund here.
    //
    // This used to write `paymentStatus: "refunded"`, which was simply untrue:
    // no refund was ever queued or sent, so the order claimed the customer had
    // their money back while the money had not moved at all. The payment stays
    // "paid" because that is what actually happened.
    await ctx.db.patch(order._id, {
      status: "cancelled",
      cancelledAt: order.cancelledAt ?? now,
      cancelReason: "Delivery failed — parcel returned to the boutique",
      internalCancelReason: `RTO confirmed at boutique. Notes: ${args.notes || "None"}`,
      updatedAt: now,
    });

    // The seller is owed their payout: the item came back to them, but they
    // fulfilled their side. Release the held Route transfer.
    if (order.razorpayTransferId) {
      await ctx.scheduler.runAfter(0, internal.razorpayRoute.updateTransferHold, {
        orderId: order._id,
        onHold: false,
        reason: "rto_seller_keeps_payment",
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.confirm_rto",
      entityType: "shipments",
      entityId: shipment._id,
      metadata: JSON.stringify({ orderId: order._id, notes: args.notes }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Mark a shipment as officially lost. Triggers customer refund, boutique ledger deduction,
 * and cancels order without restoring stock.
 */
export const markShipmentLostAdmin = mutation({
  args: {
    shipmentId: v.id("shipments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");

    if (shipment.status === "lost") {
      throw new Error("Shipment is already marked as lost.");
    }

    const order = await ctx.db.get(shipment.orderId);
    if (!order) throw new Error("Order not found.");

    // 1. Process customer refund
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .first();

    const refundAmount = payment ? payment.amount : order.total;

    if (payment) {
      await ctx.db.patch(payment._id, {
        status: "refunded",
        refundAmount: refundAmount,
        refundedAt: now,
        updatedAt: now,
      });
    }

    const refundNumber = `REF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    await ctx.db.insert("refundLedger", {
      refundNumber,
      orderId: order._id,
      amount: refundAmount,
      status: "processed",
      refundType: "full_refund",
      razorpayRefundId: "re_lost_" + Math.random().toString(36).slice(2, 11),
      notes: args.notes || `Refund for lost shipment. AWB: ${shipment.awbNumber}`,
      createdAt: now,
    });

    // 2. Process compensating boutique deduction
    const originalAccrual = await ctx.db
      .query("settlementLedger")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", order.boutiqueId))
      .filter((q) => q.and(q.eq(q.field("orderId"), order._id), q.eq(q.field("type"), "accrual")))
      .first();

    const deductionAmount = originalAccrual ? -originalAccrual.amount : -Math.floor(refundAmount * 0.9);

    await ctx.db.insert("settlementLedger", {
      boutiqueId: order.boutiqueId,
      orderId: order._id,
      type: "refund_deduction",
      source: "system",
      amount: deductionAmount,
      status: "available",
      createdAt: now,
      accruedAt: now,
      settledAt: now,
    });

    // 3. Mark shipment status as lost (NO stock restoral)
    const rawWebhookEvents = shipment.rawWebhookEvents ? [...shipment.rawWebhookEvents] : [];
    rawWebhookEvents.push({
      timestamp: now,
      status: "lost",
      location: "Courier Hub Network",
      remarks: `Shipment officially marked LOST. Notes: ${args.notes || "None"}`,
      rawPayload: JSON.stringify({ notes: args.notes }),
    });

    await ctx.db.patch(shipment._id, {
      status: "lost",
      rawWebhookEvents,
      updatedAt: now,
    });

    // 4. Update order to cancelled/refunded and audit flag
    await ctx.db.patch(order._id, {
      status: "cancelled",
      paymentStatus: "refunded",
      refunded_lost_shipment: true,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.marked_lost",
      entityType: "shipments",
      entityId: shipment._id,
      metadata: JSON.stringify({
        orderId: order._id,
        refundNumber,
        deductionAmount,
        notes: args.notes,
      }),
      createdAt: now,
    });

    return { success: true, refundNumber, deductionAmount };
  },
});

/**
 * Seed helper to backfill interesting shipment states for paid orders.
 */
export const seedLogisticsMockDataAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ENABLE_DEBUG_TOOLS !== "true") {
      throw new Error("Debug and simulation tools are disabled in this environment.");
    }
    await requireRole(ctx, "admin");
    const now = Date.now();

    const orders = await ctx.db.query("orders").collect();
    const paidOrders = orders.filter((o) => o.paymentStatus === "paid");
    if (paidOrders.length === 0) {
      throw new Error("No paid orders found to seed logistics mock data. Please run Seed Finance Data first.");
    }

    let count = 0;
    const providers = ["delhivery", "shiprocket"];
    const statuses: ("pickup_scheduled" | "in_transit" | "failed" | "rto_initiated" | "delivered")[] = [
      "pickup_scheduled",
      "in_transit",
      "failed",
      "rto_initiated",
      "delivered",
    ];

    for (let i = 0; i < Math.min(paidOrders.length, 5); i++) {
      const order = paidOrders[i];
      if (!order) continue;

      if (order.shipmentId) {
        const existingShipment = await ctx.db.get(order.shipmentId);
        if (existingShipment) continue;
      }

      const provider = providers[i % providers.length] || "delhivery";
      const status = statuses[i % statuses.length] || "pickup_scheduled";
      const awbNumber = `AWB${1000000000 + Math.floor(Math.random() * 9000000000)}`;

      const orderPickup = order.pickupAddress;
      const boutique = orderPickup ? null : await ctx.db.get(order.boutiqueId);
      const customer = await ctx.db.get(order.customerId);

      const pickupAddress = {
        name: orderPickup?.boutiqueName || boutique?.boutiqueName || "Boutique Pickup Center",
        line1: orderPickup?.address || boutique?.address || "Street Address snapshot",
        city: orderPickup?.city || boutique?.addressDetails?.city || "Unknown City",
        state: orderPickup?.state || boutique?.addressDetails?.state || "Unknown State",
        pincode: orderPickup?.pincode || boutique?.addressDetails?.pincode || "000000",
        phone: orderPickup?.phone || boutique?.phone || "7356019103",
      };

      const deliveryAddress = {
        name: order.deliveryAddress.label || "Customer Home",
        line1: order.deliveryAddress.line1 || order.deliveryAddress.formattedAddress || "No Address Line 1",
        line2: order.deliveryAddress.line2,
        city: order.deliveryAddress.city,
        state: order.deliveryAddress.state,
        pincode: order.deliveryAddress.pincode,
        phone: customer?.phone || "9999999999",
      };

      const events = [];
      const t1 = now - 3 * 24 * 3600 * 1000;
      const t2 = now - 2 * 24 * 3600 * 1000;
      const t3 = now - 1 * 24 * 3600 * 1000;

      events.push({
        timestamp: t1,
        status: "pickup_scheduled",
        location: "Boutique Warehouse",
        remarks: "Fulfillment booked. Carrier AWB generated.",
      });

      if (status !== "pickup_scheduled") {
        events.push({
          timestamp: t2,
          status: "picked_up",
          location: "Boutique Warehouse",
          remarks: "Package handed over to courier agent.",
        });
        events.push({
          timestamp: t3,
          status: "in_transit",
          location: "National Transit Hub",
          remarks: "Shipment sorting complete and in transit.",
        });
      }

      let exceptionType: any = undefined;
      if (status === "failed") {
        exceptionType = "address_issue";
        events.push({
          timestamp: now,
          status: "failed",
          location: "Local Delivery Office",
          remarks: "Delivery attempt failed: Address incorrect or incomplete.",
        });
      } else if (status === "rto_initiated") {
        events.push({
          timestamp: now - 8 * 3600 * 1000,
          status: "failed",
          location: "Local Hub",
          remarks: "Delivery attempt failed: Customer unreachable.",
        });
        events.push({
          timestamp: now,
          status: "rto_initiated",
          location: "Transit Center",
          remarks: "RTO initiated back to merchant boutique.",
        });
      } else if (status === "delivered") {
        events.push({
          timestamp: now - 4 * 3600 * 1000,
          status: "out_for_delivery",
          location: "Local Delivery Center",
          remarks: "Package out for delivery with agent.",
        });
        events.push({
          timestamp: now,
          status: "delivered",
          location: "Customer Doorstep",
          remarks: "Shipment delivered. OTP verified.",
        });
      }

      const shipmentId = await ctx.db.insert("shipments", {
        orderId: order._id,
        provider,
        awbNumber,
        status,
        idempotencyKey: `ship_mock_${order._id}`,
        trackingUrl: `https://tracking.hive.com/${awbNumber}`,
        pickupAddress,
        deliveryAddress,
        estimatedDelivery: now + 3 * 24 * 3600 * 1000,
        deliveredAt: status === "delivered" ? now : undefined,
        exceptionType,
        rawWebhookEvents: events,
        createdAt: t1,
        updatedAt: now,
      });

      const orderPatch: any = {
        shipmentId,
        updatedAt: now,
      };

      if (status === "delivered") {
        orderPatch.status = "delivered";
        orderPatch.deliveredAt = now;
        orderPatch.claimWindowExpiresAt = now + 24 * 3600 * 1000;
      } else if (status === "pickup_scheduled") {
        orderPatch.status = "pickup_scheduled";
        orderPatch.pickupScheduledAt = now;
      } else {
        orderPatch.status = "in_transit";
      }

      await ctx.db.patch(order._id, orderPatch);
      count++;
    }

    return { count };
  },
});

/**
 * Get dynamic, source-of-truth performance statistics for a boutique.
 * Recalculates all scores on-the-fly to prevent stale values.
 */
export const getBoutiquePerformanceAdmin = query({
  args: { boutiqueId: v.id("boutiques") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", args.boutiqueId))
      .collect();

    // Filter out orders that were never paid or confirmed
    const validOrders = orders.filter((o) => o.status !== "pending_payment");
    const totalOrdersCount = validOrders.length;

    if (totalOrdersCount === 0) {
      return {
        fulfillmentScore: 100.0,
        sameDayPercent: 100.0,
        cancellationRate: 0.0,
        rtoRate: 0.0,
        claimRate: 0.0,
        totalOrders: 0,
      };
    }

    // 1. Cancellation Rate
    const cancelledOrders = validOrders.filter((o) => o.status === "cancelled");
    const cancellationRate = (cancelledOrders.length / totalOrdersCount) * 100;

    // 2. RTO Rate
    let rtoCount = 0;
    for (const o of validOrders) {
      if (o.shipmentId) {
        const shipment = await ctx.db.get(o.shipmentId);
        if (
          shipment &&
          ["rto_initiated", "rto_in_transit", "rto_delivered", "returned"].includes(shipment.status)
        ) {
          rtoCount++;
        }
      }
    }
    const rtoRate = (rtoCount / totalOrdersCount) * 100;

    // 3. Claim Rate
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", args.boutiqueId))
      .collect();
    const claimRate = (claims.length / totalOrdersCount) * 100;

    // 4. Same Day Percent (Delivered within 8 hours of orderAcceptedAt / confirmedAt / createdAt)
    const deliveredOrders = validOrders.filter((o) => o.status === "delivered");
    let sameDayCount = 0;
    for (const o of deliveredOrders) {
      const startTime = o.orderAcceptedAt || o.confirmedAt || o.createdAt;
      const endTime = o.deliveredAt;
      if (endTime && startTime) {
        const duration = endTime - startTime;
        if (duration <= 8 * 3600 * 1000) {
          sameDayCount++;
        }
      }
    }
    const sameDayPercent =
      deliveredOrders.length > 0 ? (sameDayCount / deliveredOrders.length) * 100 : 100;

    // 5. Composite Fulfillment Score Calculation
    // Base 100, deduct weights:
    // Cancellation Rate: 2.0x weight (max 30 deduction)
    // RTO Rate: 1.5x weight (max 25 deduction)
    // Claim Rate: 3.0x weight (max 30 deduction)
    // non-Same-Day Rate: 1.0x weight (max 15 deduction)
    const cancelDeduction = Math.min(30, cancellationRate * 2.0);
    const rtoDeduction = Math.min(25, rtoRate * 1.5);
    const claimDeduction = Math.min(30, claimRate * 3.0);
    const sameDayDeduction = Math.min(15, (100 - sameDayPercent) * 1.0);

    const rawScore = 100 - (cancelDeduction + rtoDeduction + claimDeduction + sameDayDeduction);
    const fulfillmentScore = Math.max(0, Math.min(100, rawScore));

    return {
      fulfillmentScore: Math.round(fulfillmentScore * 10) / 10,
      sameDayPercent: Math.round(sameDayPercent * 10) / 10,
      cancellationRate: Math.round(cancellationRate * 10) / 10,
      rtoRate: Math.round(rtoRate * 10) / 10,
      claimRate: Math.round(claimRate * 10) / 10,
      totalOrders: totalOrdersCount,
    };
  },
});

export const bookShipmentAdmin = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const now = Date.now();

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");

    if (order.status !== "packed") {
      throw new Error("Order status must be packed to book courier.");
    }
    if (order.shipmentId) {
      throw new Error("Order already has a shipment associated.");
    }

    const orderPickup = order.pickupAddress;
    const boutique = await ctx.db.get(order.boutiqueId);
    if (!orderPickup && !boutique) throw new Error("Boutique not found.");

    // Enforce hyperlocal transition prerequisites (safety checks)
    assertHyperlocalTransitionPrerequisites(order, boutique);

    // Resolve Pickup and Delivery Addresses
    const pickupAddress = {
      name: orderPickup?.boutiqueName || boutique?.boutiqueName || "Boutique Pickup Center",
      line1: orderPickup?.address || boutique?.address || "Address snapshot pending",
      city: orderPickup?.city || boutique?.addressDetails?.city || "Unknown City",
      state: orderPickup?.state || boutique?.addressDetails?.state || "Unknown State",
      pincode: orderPickup?.pincode || boutique?.addressDetails?.pincode || "000000",
      phone: orderPickup?.phone || boutique?.phone || "7356019103",
    };

    const customer = await ctx.db.get(order.customerId);
    const deliveryAddress = {
      name: order.deliveryAddress.label || "Customer Delivery",
      line1: order.deliveryAddress.line1 || order.deliveryAddress.formattedAddress || "No Address Line 1",
      line2: order.deliveryAddress.line2,
      city: order.deliveryAddress.city,
      state: order.deliveryAddress.state,
      pincode: order.deliveryAddress.pincode,
      phone: customer?.phone || "9999999999",
    };

    const awb = "MNL-" + Math.floor(100000 + Math.random() * 900000);
    const trackingUrl = LOGISTICS_PROVIDERS.manual.trackingUrl(awb);

    const shipmentId = await ctx.db.insert("shipments", {
      orderId: order._id,
      provider: "manual",
      awbNumber: awb,
      status: "pickup_scheduled",
      idempotencyKey: `ship_quick_${order._id}`,
      trackingUrl,
      pickupAddress,
      deliveryAddress,
      estimatedDelivery: now + 1 * 24 * 3600 * 1000,
      slaStatus: "on_track",
      rawWebhookEvents: [
        {
          timestamp: now,
          status: "pickup_scheduled",
          location: "System Desk",
          remarks: "Fulfillment quick-booked via Operations Console.",
          rawPayload: JSON.stringify({ event: "created", provider: "manual" }),
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    // Link shipment back to order
    await ctx.db.patch(order._id, {
      shipmentId,
      status: "pickup_scheduled",
      pickupScheduledAt: now,
      readyForPickupAt: now,
      updatedAt: now,
    });

    // Write audit log
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "shipments.create_quick",
      entityType: "shipments",
      entityId: shipmentId,
      metadata: JSON.stringify({ orderId: order._id, awbNumber: awb, provider: "manual" }),
      createdAt: now,
    });

    // TODO: wire Shiprocket booking here

    return { success: true, shipmentId };
  },
});

export const dispatchShiprocketOrderAdmin = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    // 1. We assume admin authentication is done via standard mechanism
    const isAdmin = await ctx.runQuery(internal.adminOrders.checkIsAdminInternal);
    if (!isAdmin) throw new Error("Unauthorized: Admin only");

    // 2. Prepare the shipment row and retrieve all necessary details
    const prep = await ctx.runMutation(internal.adminLogistics.prepareShiprocketShipmentInternal, { orderId: args.orderId });

    // 3. Chain Porter call
    const pickupAddress = buildBoutiquePorterAddress(prep.boutique);
    const dropAddress = buildCustomerPorterAddress(
      prep.order.deliveryAddress,
      prep.order.customerName || prep.order.deliveryAddress.label || "Customer"
    );
    assertPorterAddressUsable(pickupAddress, "pickup");
    assertPorterAddressUsable(dropAddress, "drop");

    const result = await ctx.runAction(internal.lib.porter.createOrder, {
      orderId: args.orderId,
      shipmentId: prep.shipmentId,
      pickupAddress,
      dropAddress,
      orderNumber: prep.order.orderNumber,
      deliveryInstructions: prep.order.deliveryAddress.deliveryInstructions,
    });

    return { success: true, shipmentId: prep.shipmentId, ...result };
  }
});

export const prepareShiprocketShipmentInternal = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.shipmentId) throw new Error("Order already has a shipment");

    const boutique = await ctx.db.get(order.boutiqueId);
    if (!boutique) throw new Error("Boutique not found");

    // Porter shows this name to the rider at the door, so prefer the person's
    // own name over the address label ("Home").
    const customer = await ctx.db.get(order.customerId);
    const customerName =
      (customer as any)?.name || order.deliveryAddress.label || "Customer";

    const now = Date.now();
    const shipmentId = await ctx.db.insert("shipments", {
      orderId: order._id,
      provider: "porter",
      awbNumber: "PENDING", // Will be patched by the action
      status: "booking_requested",
      createdAt: now,
      updatedAt: now,
      pickupAddress: { 
        name: order.pickupAddress?.boutiqueName || boutique.boutiqueName || "Pending", 
        line1: order.pickupAddress?.address || boutique.address || "Pending", 
        city: order.pickupAddress?.city || boutique.addressDetails?.city || boutique.city || "Pending", 
        state: order.pickupAddress?.state || boutique.addressDetails?.state || boutique.state || "Pending", 
        pincode: order.pickupAddress?.pincode || boutique.addressDetails?.pincode || boutique.pincode || "Pending", 
        phone: order.pickupAddress?.phone || boutique.phone || "Pending" 
      },
      deliveryAddress: {
        // Map-picked addresses leave line1 empty and carry the street in
        // formattedAddress, so falling back keeps the shipment record readable.
        name: customerName,
        line1: order.deliveryAddress.line1 || order.deliveryAddress.formattedAddress || "Pending",
        city: order.deliveryAddress.city,
        state: order.deliveryAddress.state,
        pincode: order.deliveryAddress.pincode,
        phone: order.deliveryAddress.phone || "Pending"
      },
      rawWebhookEvents: [{
        timestamp: now,
        status: "booking_requested",
        remarks: "Initiated automated dispatch",
      }]
    });

    await ctx.db.patch(order._id, {
      shipmentId,
      status: "pickup_scheduled", // Optimistic order status update
      updatedAt: now,
    });

    return {
      shipmentId,
      boutique: {
        boutiqueName: boutique.boutiqueName,
        address: boutique.address,
        phone: boutique.phone,
        latitude: boutique.latitude,
        longitude: boutique.longitude,
        city: boutique.addressDetails?.city || boutique.city || "",
        state: boutique.addressDetails?.state || boutique.state || "",
        pincode: boutique.addressDetails?.pincode || boutique.pincode || "",
      },
      order: {
        orderNumber: order.orderNumber,
        customerName,
        deliveryAddress: order.deliveryAddress,
      }
    };
  }
});

/**
 * Updates shipment details with the response from the logistics provider.
 */
/**
 * The booking state of one shipment, for the Porter action to check before it
 * creates anything. Actions cannot read the database directly.
 */
export const getShipmentBookingStateInternal = internalQuery({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;
    return {
      awbNumber: shipment.awbNumber ?? "",
      status: shipment.status,
      trackingUrl: shipment.trackingUrl ?? null,
    };
  },
});

export const updateShipmentDetails = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    awbNumber: v.string(),
    providerBookingId: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");

    const patch: Record<string, any> = {
      awbNumber: args.awbNumber,
      trackingUrl: args.trackingUrl,
      status: args.status as any,
      updatedAt: Date.now(),
    };
    if (args.providerBookingId !== undefined) {
      patch.providerBookingId = args.providerBookingId;
    }

    await ctx.db.patch(args.shipmentId, patch);
  },
});

/**
 * Shipments still in flight, for the Porter poll.
 *
 * Deliberately a small, cheap query: the poll runs on a timer, so it must not
 * walk the whole shipments table on every tick.
 */
const POLL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Porter rate-limits the account, so each tick asks about very few trips. */
const POLL_BATCH = 4;
/**
 * Porter rate-limits per ORDER, separately from the account, and the limit is
 * not a short rolling window: a CRN read too many times answered "maximum
 * number of request exceeded for this order" and was still refusing forty
 * minutes later. Treat reads of a single trip as a scarce, near-exhaustible
 * budget rather than something to spend every couple of minutes.
 *
 * Ten minutes gives roughly four or five reads across a typical hyperlocal
 * delivery, which is enough to notice each transition without burning the
 * allowance before the one read that matters — the completion.
 *
 * This is a floor under the webhooks, not a replacement for them. Polling
 * cannot be made frequent enough to be the primary mechanism.
 */
const POLL_MIN_SPACING_MS = 10 * 60 * 1000;

export const listPollableShipmentsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - POLL_MAX_AGE_MS;
    const recent = await ctx.db.query("shipments").order("desc").take(40);
    return recent
      .filter((s) => shouldPollShipment(s))
      // A trip older than half a day is not still in progress — it was
      // abandoned or cancelled outside Hive. Polling those burns the whole
      // rate limit and starves the one shipment that is actually moving.
      .filter((s) => (s.createdAt ?? s._creationTime) >= cutoff)
      .filter((s) => !s.porterLastSyncAt || s.porterLastSyncAt <= Date.now() - POLL_MIN_SPACING_MS)
      .slice(0, POLL_BATCH)
      .map((s) => ({
        shipmentId: s._id,
        crn: s.awbNumber,
        status: s.status,
        isReturn: !!s.isReturn,
      }));
  },
});

/**
 * Ask Porter what has happened to every shipment still in flight.
 *
 * Hive's courier state used to depend entirely on Porter's webhooks reaching
 * us. When they did not — a stale URL, a rejected header, a 404 at the edge —
 * nothing else ever asked, and orders sat at "booking requested" while a real
 * rider collected and delivered the parcel. Twenty-four shipments went out that
 * way without Hive recording a single event.
 *
 * This closes that hole: the same transitions the webhook applies, driven from
 * Porter's own Track Order API on a timer. Webhooks stay the fast path; this is
 * the floor under them. Both funnel through
 * `processLogisticsStatusUpdateInternal`, which is idempotent, so an event
 * arriving twice — once by webhook, once by poll — settles to the same state.
 */
export const pollActivePorterShipments = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; advanced: number; failed: number }> => {
    if (!process.env.PORTER_API_URL || !process.env.PORTER_API_KEY) {
      return { checked: 0, advanced: 0, failed: 0 };
    }

    const pending: Array<{
      shipmentId: Id<"shipments">;
      crn: string;
      status: string;
      isReturn: boolean;
    }> = await ctx.runQuery(internal.adminLogistics.listPollableShipmentsInternal, {});

    let advanced = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        const sync: any = await ctx.runAction(internal.lib.porter.syncOrderDetails, {
          crn: row.crn,
        });
        const view = sync.view;
        if (!view) continue;

        // Porter may have moved several steps since we last heard, and the
        // shipment state machine refuses a jump. Walk the transitions its own
        // timings prove happened.
        const steps = resolvePorterProgression(row.status, view);
        if (steps.length === 0) continue;

        for (const step of steps) {
          await ctx.runMutation(internal.adminLogistics.processLogisticsStatusUpdateInternal, {
            awbNumber: row.crn,
            status: step.status,
            remarks: "Synced from Porter (no webhook received)",
            eventTs: step.at ?? undefined,
            actualTripFare: view.actualFarePaise ?? undefined,
            porterRawOrder: sync.rawOrder,
            driverDetails: view.partner
              ? {
                  name: view.partner.name,
                  phone: view.partner.phone,
                  vehiclePlate: view.partner.vehiclePlate,
                  trackingUrl: sync.trackingUrl,
                  liveTrackingUrl: sync.liveTrackingUrl,
                  etaMinutes: sync.etaMinutes,
                }
              : undefined,
          });
          advanced++;
        }
      } catch (err: any) {
        failed++;
        const message = err?.message ?? String(err);
        console.error(`[PorterPoll] ${row.crn} could not be synced: ${message}`);
        // Porter answers 429 per account, so continuing the loop only deepens
        // the hole and starves the next tick too.
        if (message.includes("429")) break;
      }
    }

    if (advanced > 0 || failed > 0) {
      console.log(
        `[PorterPoll] checked ${pending.length}, advanced ${advanced}, failed ${failed}.`
      );
    }
    return { checked: pending.length, advanced, failed };
  },
});
