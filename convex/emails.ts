// convex/emails.ts
// Asynchronous email notification triggers using Resend.

import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { calculateLegacyFallbackPayout } from "./razorpayRoute";
import {
  getNewOrderBoutiqueTemplate,
  getOrderConfirmedCustomerTemplate,
  getOrderPackedCustomerTemplate,
  getOrderOutForDeliveryCustomerTemplate,
  getOrderDeliveredCustomerTemplate,
  getOrderDeliveredBoutiqueTemplate,
  getOrderDeclinedCustomerTemplate,
} from "./lib/emailTemplates";

/**
 * Aggregates all data needed for emails in a single database query call.
 */
export const getEmailData = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const boutique = await ctx.db.get(order.boutiqueId);
    const user = await ctx.db.get(order.customerId);
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
      .unique();

    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();

    return {
      order,
      boutique,
      user,
      invoice,
      orderItems,
    };
  },
});

/**
 * Asynchronously sends email notification through Resend REST API.
 */
export const sendOrderEmail = internalAction({
  args: {
    orderId: v.id("orders"),
    event: v.union(
      v.literal("new_order"),
      v.literal("confirmed"),
      v.literal("packed"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("declined")
    ),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.emails.getEmailData, {
      orderId: args.orderId,
    });

    if (!data || !data.order) {
      console.error(`[sendOrderEmail] No data found for order ID: ${args.orderId}`);
      return;
    }

    const { order, boutique, user, invoice, orderItems } = data;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[sendOrderEmail] RESEND_API_KEY is not defined in environment variables. Email dispatch skipped.");
      
      const recipient = args.event === "new_order"
        ? (boutique?.email || boutique?.ownerEmail || "no-recipient")
        : (invoice?.customerEmail || user?.email || "no-recipient");

      const logId = await ctx.runMutation(internal.whatsapp.createLog, {
        channel: "email",
        template: args.event,
        recipient,
        status: "failed",
      });
      await ctx.runMutation(internal.whatsapp.updateLog, {
        id: logId,
        status: "failed",
        response: "RESEND_API_KEY is not defined in environment variables.",
      });
      return;
    }

    // Production: set RESEND_FROM_EMAIL=Hive Partners <onboarding@hivenow.in> on the Convex dashboard
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Hive Partners <onboarding@hivenow.in>";

    // Fallbacks
    const customerName = invoice?.customerName || user?.email || "Hive Customer";
    const boutiqueName = boutique?.boutiqueName || "Boutique Partner";

    // Formatted Address Snapshot
    const deliveryAddressStr = order.deliveryAddress
      ? `${order.deliveryAddress.line1}, ${order.deliveryAddress.line2 ? order.deliveryAddress.line2 + ", " : ""}${order.deliveryAddress.city}, ${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}`
      : "Not provided";

    const items = orderItems.map((item: any) => ({
      productName: item.productName,
      size: item.variantSize,
      quantity: item.quantity,
      priceAtPurchase: item.priceAtPurchase,
      imageUrl: item.imageUrl,
    }));

    const templateData = {
      orderNumber: order.orderNumber,
      customerName,
      boutiqueName,
      deliveryAddress: deliveryAddressStr,
      items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      notes: order.notes,
      pdfUrl: invoice?.pdfUrl || undefined,
      // What the seller is actually paid: the frozen price split, then the
      // settlement snapshot, then the legacy fallback Route uses for old orders.
      merchantPayable:
        (order as any).pricingSnapshot?.sellerPayoutPaise ??
        (order as any).orderSnapshot?.merchantPayable ??
        calculateLegacyFallbackPayout(order as any),
    };

    let subject = "";
    let html = "";
    let toEmails: string[] = [];

    switch (args.event) {
      case "new_order":
        subject = `New Order Received - ${order.orderNumber}`;
        html = getNewOrderBoutiqueTemplate(templateData);

        const bEmail = boutique?.email || boutique?.ownerEmail;
        if (bEmail) toEmails.push(bEmail);

        // Send order notification email to Owner, and optionally at most Staff 1 (never secondary staff)
        const selection = (boutique as any)?.staffNotificationSelection;
        const shouldEmailStaff1 = (selection === "staff1" || selection === "both" || selection === "all") && boutique?.staffEmail1;

        if (shouldEmailStaff1 && boutique?.staffEmail1) {
          toEmails.push(boutique.staffEmail1);
        }
        break;

      case "confirmed":
        subject = `Your Order ${order.orderNumber} is Confirmed!`;
        html = getOrderConfirmedCustomerTemplate(templateData);

        const cEmailConf = invoice?.customerEmail || user?.email;
        if (cEmailConf) toEmails.push(cEmailConf);
        break;

      case "packed":
        subject = `Your Hive Order ${order.orderNumber} is Packed!`;
        html = getOrderPackedCustomerTemplate(templateData);

        const cEmailPack = invoice?.customerEmail || user?.email;
        if (cEmailPack) toEmails.push(cEmailPack);
        break;

      case "out_for_delivery":
        subject = `Your Hive Order ${order.orderNumber} is Out for Delivery!`;
        html = getOrderOutForDeliveryCustomerTemplate(templateData);

        const cEmailTransit = invoice?.customerEmail || user?.email;
        if (cEmailTransit) toEmails.push(cEmailTransit);
        break;

      case "cancelled":
      case "declined":
        subject = `Your Hive Order ${order.orderNumber} - Order Update & Refund Initiated`;
        html = getOrderDeclinedCustomerTemplate(templateData);

        const cEmailDeclined = invoice?.customerEmail || user?.email;
        if (cEmailDeclined) toEmails.push(cEmailDeclined);
        break;

      case "delivered":
        // Delivered event triggers two separate notifications (Customer & Boutique)
        const custEmail = invoice?.customerEmail || user?.email;
        if (custEmail) {
          const customerSubject = `Your Hive Order ${order.orderNumber} has been Delivered!`;
          const customerHtml = getOrderDeliveredCustomerTemplate(templateData);
          await sendViaResend(ctx, apiKey, fromEmail, custEmail, customerSubject, customerHtml, "delivered_customer");
        }

        const boutEmail = boutique?.email || boutique?.ownerEmail;
        if (boutEmail) {
          const boutiqueSubject = `Hive Order ${order.orderNumber} Delivered`;
          const boutiqueHtml = getOrderDeliveredBoutiqueTemplate(templateData);
          await sendViaResend(ctx, apiKey, fromEmail, boutEmail, boutiqueSubject, boutiqueHtml, "delivered_boutique");
        }

        return; // Handled directly
    }

    if (toEmails.length === 0) {
      console.error(`[sendOrderEmail] No recipient email resolved for event ${args.event}`);
      return;
    }

    for (const email of toEmails) {
      await sendViaResend(ctx, apiKey, fromEmail, email, subject, html, args.event);
    }
  },
});

export const sendNotificationEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    templateName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const templateName = args.templateName ?? "generic_notification";
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[sendNotificationEmail] RESEND_API_KEY is not defined. Email dispatch skipped.");
      const logId = await ctx.runMutation(internal.whatsapp.createLog, {
        channel: "email",
        template: templateName,
        recipient: args.to,
        status: "failed",
      });
      await ctx.runMutation(internal.whatsapp.updateLog, {
        id: logId,
        status: "failed",
        response: "RESEND_API_KEY is not defined in environment variables.",
      });
      return;
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Hive Partners <onboarding@hivenow.in>";
    await sendViaResend(ctx, apiKey, fromEmail, args.to, args.subject, args.html, templateName);
  },
});

async function sendViaResend(
  ctx: any,
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  templateName: string,
  retryCount: number = 0
) {
  // Create pending log entry
  const logId = await ctx.runMutation(internal.whatsapp.createLog, {
    channel: "email",
    template: templateName,
    recipient: to,
    status: "pending",
  });

  console.log(`[sendOrderEmail] Sending email to: ${to} (Subject: ${subject})`);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sendOrderEmail] Resend API error for ${to}: ${res.status} - ${errText}`);

      // Retry on transient 5xx errors (up to 3 times with exponential backoff)
      if (res.status >= 500 && retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 60_000; // 1min, 2min, 4min
        console.log(`[sendOrderEmail] Scheduling retry #${retryCount + 1} for ${to} in ${delayMs / 1000}s`);
        await ctx.scheduler.runAfter(delayMs, internal.emails.retrySendEmail, {
          to, subject, html, templateName, retryCount: retryCount + 1,
        });
      }

      await ctx.runMutation(internal.whatsapp.updateLog, {
        id: logId,
        status: retryCount < 3 && res.status >= 500 ? "retrying" : "failed",
        response: `Resend Status ${res.status}: ${errText}`.substring(0, 500),
      });
    } else {
      const responseData = await res.json();
      console.log(`[sendOrderEmail] Email sent successfully to ${to}. Resend ID: ${responseData.id}`);
      await ctx.runMutation(internal.whatsapp.updateLog, {
        id: logId,
        status: "sent",
        response: JSON.stringify(responseData),
      });
    }
  } catch (err: any) {
    const sanitizedError = (err.message || String(err)).substring(0, 500);
    console.error(`[sendOrderEmail] Network error when sending email to ${to}:`, sanitizedError);
    await ctx.runMutation(internal.whatsapp.updateLog, {
      id: logId,
      status: "failed",
      response: sanitizedError,
    });
  }
}

/**
 * Retry action scheduled by sendViaResend on transient 5xx errors.
 * Uses exponential backoff (1min, 2min, 4min) and caps at 3 retries.
 */
export const retrySendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    templateName: v.string(),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[retrySendEmail] RESEND_API_KEY missing, cannot retry.");
      return;
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Hive Partners <onboarding@hivenow.in>";
    console.log(`[retrySendEmail] Retry #${args.retryCount} for ${args.to} (${args.templateName})`);
    await sendViaResend(ctx, apiKey, fromEmail, args.to, args.subject, args.html, args.templateName, args.retryCount);
  },
});
