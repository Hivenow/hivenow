// convex/lib/notifications.ts
// Notification Engine — supports deduplication & launch-critical notification templates.

import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getWhatsAppTemplate } from "./whatsappTemplates";

const formatCurrency = (paise: number) => {
  return `₹${(paise / 100).toFixed(2)}`;
};

function emailLayout(title: string, bodyContent: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f9f9f9;
      color: #333333;
      margin: 0;
      padding: 0;
    }
    .wrapper {
      width: 100%;
      background-color: #f9f9f9;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      background-color: #ffffff;
      margin: 0 auto;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      border: 1px solid #eef2f5;
    }
    .header {
      background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .logo {
      color: #f3f4f6;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0;
    }
    .logo span {
      color: #fbbf24;
    }
    .content {
      padding: 40px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #4b5563;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px 40px;
      text-align: center;
      border-top: 1px solid #eef2f5;
    }
    .footer-text {
      font-size: 13px;
      color: #9ca3af;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">HIVE<span>.</span></div>
      </div>
      <div class="content">
        ${bodyContent}
      </div>
      <div class="footer">
        <p class="footer-text">© 2026 Hive Marketplace. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

function generateEmailContent(template: string, payload: any): { subject: string; html: string } {
  let subject = "";
  let bodyContent = "";

  switch (template) {
    case "payment_received":
      subject = `Payment Received - Order ${payload.orderNumber || ""}`;
      bodyContent = `
        <h1>Payment Received!</h1>
        <p>Hello,</p>
        <p>We have successfully received your payment of <strong>${formatCurrency(payload.amount)}</strong> for Order <strong>${payload.orderNumber}</strong>.</p>
        <p>Thank you for shopping with Hive!</p>
      `;
      break;

    case "payment_refund_pending":
      subject = `Refund Pending - Order ${payload.orderNumber || ""}`;
      bodyContent = `
        <h1>Refund Pending</h1>
        <p>Hello,</p>
        <p>Your payment of <strong>${formatCurrency(payload.amount)}</strong> for Order <strong>${payload.orderNumber || ""}</strong> is pending refund.</p>
        <p><strong>Reason:</strong> ${payload.reason || "Stock depleted during checkout processing"}</p>
        <p>Our operations team has been alerted and will process the refund to your original payment method shortly.</p>
      `;
      break;

    case "payment_refunded":
      subject = `Payment Refunded - Order ${payload.orderNumber || ""}`;
      bodyContent = `
        <h1>Payment Refunded</h1>
        <p>Hello,</p>
        <p>We have successfully refunded <strong>${formatCurrency(payload.amount)}</strong> for Order <strong>${payload.orderNumber || ""}</strong>.</p>
        ${payload.refundId ? `<p><strong>Refund ID:</strong> ${payload.refundId}</p>` : ""}
        <p>The amount should reflect in your account within 5-7 business days depending on your bank.</p>
      `;
      break;

    case "claim_submitted":
      subject = `Claim Submitted - Claim ${payload.claimNumber}`;
      bodyContent = `
        <h1>Claim Submitted Successfully</h1>
        <p>Hello,</p>
        <p>Your claim <strong>${payload.claimNumber}</strong> for Order <strong>${payload.orderNumber}</strong> has been successfully submitted and is under review.</p>
        <p>Our team will inspect the evidence provided and update you on the progress within 24-48 hours.</p>
      `;
      break;

    case "claim_rejected":
      subject = `Claim Update: Rejected - Claim ${payload.claimNumber}`;
      bodyContent = `
        <h1>Claim Rejected</h1>
        <p>Hello,</p>
        <p>Your claim <strong>${payload.claimNumber}</strong> for Order <strong>${payload.orderNumber}</strong> has been reviewed and rejected.</p>
        <p><strong>Reason:</strong> ${payload.reason || "Insufficient evidence provided."}</p>
        <p>If you have any questions, please contact our support team.</p>
      `;
      break;

    case "merchant_application_approved":
      subject = "Welcome to Hive! Boutique Application Approved";
      bodyContent = `
        <h1>Boutique Application Approved!</h1>
        <p>Hello ${payload.ownerName || ""},</p>
        <p>Congratulations! Your boutique <strong>${payload.boutiqueName}</strong> has been approved to join the Hive marketplace.</p>
        <p>You can now log in to the Boutique Dashboard to set up your store and list your products.</p>
      `;
      break;

    case "merchant_application_rejected":
      subject = "Boutique Application Status Update";
      bodyContent = `
        <h1>Boutique Application Status</h1>
        <p>Hello ${payload.ownerName || ""},</p>
        <p>Thank you for applying to join the Hive marketplace.</p>
        <p>Unfortunately, your boutique application for <strong>${payload.boutiqueName}</strong> was not approved at this time.</p>
        <p><strong>Reason:</strong> ${payload.reason || "Criteria mismatch."}</p>
      `;
      break;

    case "order_accepted":
      subject = `Order Confirmed - ${payload.orderNumber}`;
      bodyContent = `
        <h1>Your Order is Confirmed!</h1>
        <p>Hello,</p>
        <p>Great news! Your order <strong>${payload.orderNumber}</strong> has been accepted by the boutique and is now confirmed.</p>
      `;
      break;

    case "order_packed":
      subject = `Your Order is Packed - ${payload.orderNumber}`;
      bodyContent = `
        <h1>Order Packed</h1>
        <p>Hello,</p>
        <p>Your order <strong>${payload.orderNumber}</strong> has been packed and is ready for pickup by our delivery partner.</p>
      `;
      break;

    case "driver_assigned":
      subject = `Delivery Partner Assigned - ${payload.orderNumber}`;
      bodyContent = `
        <h1>Delivery Partner Assigned</h1>
        <p>Hello,</p>
        <p>A delivery partner has been assigned to your order <strong>${payload.orderNumber}</strong>.</p>
        ${payload.driverName ? `<p><strong>Driver Name:</strong> ${payload.driverName}</p>` : ""}
        ${payload.driverPhone ? `<p><strong>Driver Phone:</strong> ${payload.driverPhone}</p>` : ""}
      `;
      break;

    case "out_for_delivery":
      subject = `Out for Delivery - ${payload.orderNumber}`;
      bodyContent = `
        <h1>Out for Delivery</h1>
        <p>Hello,</p>
        <p>Your order <strong>${payload.orderNumber}</strong> is out for delivery! Please ensure someone is available to receive it.</p>
      `;
      break;

    case "delivered":
      subject = `Delivered - ${payload.orderNumber}`;
      bodyContent = `
        <h1>Order Delivered</h1>
        <p>Hello,</p>
        <p>Your order <strong>${payload.orderNumber}</strong> has been successfully delivered. Thank you for shopping with Hive!</p>
      `;
      break;

    case "claim_approved":
      subject = `Claim Approved - Claim ${payload.claimNumber}`;
      bodyContent = `
        <h1>Claim Approved</h1>
        <p>Hello,</p>
        <p>Your claim <strong>${payload.claimNumber}</strong> for Order <strong>${payload.orderNumber}</strong> has been approved.</p>
        <p><strong>Resolution:</strong> ${payload.resolution}</p>
      `;
      break;

    case "refund_processed":
      subject = `Refund Processed - Order ${payload.orderNumber}`;
      bodyContent = `
        <h1>Refund Processed</h1>
        <p>Hello,</p>
        <p>A refund of <strong>${formatCurrency(payload.amount)}</strong> has been processed for Order <strong>${payload.orderNumber}</strong>.</p>
      `;
      break;

    case "payout_released":
      subject = `Payout Released - ${payload.payoutNumber}`;
      bodyContent = `
        <h1>Payout Released</h1>
        <p>Hello,</p>
        <p>A payout of <strong>${formatCurrency(payload.amount)}</strong> has been released to your registered bank account.</p>
        <p><strong>Payout Number:</strong> ${payload.payoutNumber}</p>
      `;
      break;

    default:
      subject = `Notification from Hive`;
      bodyContent = `
        <h1>Notification</h1>
        <p>You have a new update on Hive.</p>
      `;
      break;
  }

  return {
    subject,
    html: emailLayout(subject, bodyContent),
  };
}

export async function triggerNotification(
  ctx: MutationCtx,
  userId: Id<"users">,
  channel: "email" | "sms" | "whatsapp" | "push" | "in_app" | "slack",
  template: string,
  entityType: string,
  entityId: string,
  payloadStr?: string
) {
  const now = Date.now();

  // Deduplication check using unique composite properties (channel-aware)
  const existing = await ctx.db
    .query("notificationEvents")
    .withIndex("by_entity_template_channel", (q) =>
      q
        .eq("entityType", entityType)
        .eq("entityId", entityId)
        .eq("template", template)
        .eq("channel", channel)
    )
    .first();

  if (existing && existing.status !== "failed") {
    console.log(
      `[triggerNotification] Silently ignoring duplicate notification for ${entityType} ${entityId} template ${template} channel ${channel}`
    );
    return existing._id;
  }

  // Insert notification log as queued
  const eventId = await ctx.db.insert("notificationEvents", {
    userId,
    channel,
    template,
    status: "queued",
    entityType,
    entityId,
    payload: payloadStr,
    createdAt: now,
  });

  try {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const payload = payloadStr ? JSON.parse(payloadStr) : {};

    if (channel === "email") {
      const email = user.email || payload.email;
      if (!email) {
        throw new Error(`No email address found for user ${userId}`);
      }

      // Generate Subject and HTML body
      const { subject, html } = generateEmailContent(template, payload);

      // Schedule email sending
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        to: email,
        subject,
        html,
      });

      // Mark as sent
      await ctx.db.patch(eventId, {
        status: "sent",
        sentAt: Date.now(),
      });
    } else if (channel === "slack") {
      const { text, blocks, channelCategory } = formatSlackNotification(template, payload);

      // Slack uses fetch(), so dispatch it from an action after this mutation commits.
      await ctx.scheduler.runAfter(0, internal.slack.sendNotification, {
        eventId,
        text,
        blocks,
        channel: channelCategory,
      });
    } else if (channel === "whatsapp") {
      let phone = payload.phone || user.phone;
      if (!phone) {
        // Fallback: Saved Addresses
        const savedAddr = await ctx.db
          .query("addresses")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .first();
        if (savedAddr?.phone) phone = savedAddr.phone;
      }

      if (!phone) {
        throw new Error(`No phone number found for user ${userId}`);
      }

      const { templateName, parameters } = getWhatsAppTemplate(template, payload);

      await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
        recipient: phone,
        templateName,
        parameters,
      });

      await ctx.db.patch(eventId, {
        status: "sent",
        sentAt: Date.now(),
      });
    } else {
      // Mock SMS/Push/in_app immediately
      console.log(`[triggerNotification] Sending mock ${channel} for template ${template} to user ${userId}`);
      await ctx.db.patch(eventId, {
        status: "sent",
        sentAt: Date.now(),
      });
    }
  } catch (err: any) {
    console.error(`[triggerNotification] Failed to dispatch notification:`, err);
    await ctx.db.patch(eventId, {
      status: "failed",
    });
  }

  return eventId;
}

export function formatSlackNotification(template: string, rawPayload: any): { text: string; blocks?: any[]; channelCategory?: "orders" | "catalog" } {
  let payload: any = rawPayload;
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload);
    } catch (e) {
      payload = { raw: rawPayload };
    }
  }
  payload = payload || {};

  const adminBaseUrl = process.env.ADMIN_URL || "https://beelynadmin.hivenow.in";

  switch (template) {
    case "product_pending_approval":
    case "product_edited_pending_approval": {
      const isEdit = template === "product_edited_pending_approval" || Boolean(payload.isEdit);
      const title = isEdit ? `📝 Edited Product Pending Re-Review` : `🛍️ New Product Pending Review`;
      const fallback = `${title}: ${payload.productName || "Product"} from ${payload.boutiqueName || "Boutique"}`;
      const fields = [
        { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
        { type: "mrkdwn", text: `*Product:*\n${payload.productName || "Unnamed Product"}` },
        { type: "mrkdwn", text: `*Status:*\n${isEdit ? "Re-submitted after Edit" : "New Listing"}` },
      ];
      if (payload.price) {
        fields.push({ type: "mrkdwn", text: `*Price:*\n₹${payload.price}` });
      }
      if (payload.category) {
        fields.push({ type: "mrkdwn", text: `*Category:*\n${payload.category}` });
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/products|Inspect Product on Admin Dashboard>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "admin_product_approved": {
      const title = `✅ Product Approved & Live`;
      const fallback = `${title}: ${payload.productName || "Product"} by ${payload.boutiqueName || "Boutique"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${payload.productName || "Unnamed"}` },
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "admin_product_rejected": {
      const title = `❌ Product Rejected`;
      const fallback = `${title}: ${payload.productName || "Product"} by ${payload.boutiqueName || "Boutique"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${payload.productName || "Unnamed"}` },
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
            { type: "mrkdwn", text: `*Reason:*\n${payload.reason || "Not specified"}` },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "boutique_application_submitted": {
      const title = `🏬 New Boutique Partner Application`;
      const fallback = `${title}: ${payload.boutiqueName || "New Boutique"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Boutique Name:*\n${payload.boutiqueName || "N/A"}` },
            { type: "mrkdwn", text: `*Owner Name:*\n${payload.ownerName || "N/A"}` },
            { type: "mrkdwn", text: `*City:*\n${payload.city || "N/A"}` },
            { type: "mrkdwn", text: `*Phone:*\n${payload.phone || "N/A"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/boutiques|Review Application on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "boutique_kyc_submitted":
    case "boutique_document_uploaded": {
      const title = `📜 Boutique KYC Documents Submitted`;
      const fallback = `${title}: ${payload.boutiqueName || "Boutique"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
            { type: "mrkdwn", text: `*Document Type:*\n${payload.documentType || "GST / Bank Verification"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/boutiques|Verify Documents on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "new_order_ops": {
      const title = `🛍️ New Order Arrived!`;
      const amountPaise = payload.totalPaise ?? payload.total ?? 0;
      const amountFormatted = amountPaise > 0 ? (amountPaise / 100).toFixed(2) : "0.00";
      const fallback = `${title}: Order #${payload.orderNumber || ""} from ${payload.boutiqueName || "Boutique"} - ₹${amountFormatted}`;
      const fields = [
        { type: "mrkdwn", text: `*Order Number:*\n#${payload.orderNumber || "N/A"}` },
        { type: "mrkdwn", text: `*Store / Boutique:*\n${payload.boutiqueName || "Unknown"}` },
        { type: "mrkdwn", text: `*Order Value:*\n*₹${amountFormatted}*` },
        { type: "mrkdwn", text: `*Items:*\n${payload.itemsCount ?? payload.itemCount ?? 1} item(s)` },
      ];
      if (payload.customerPhone) {
        fields.push({ type: "mrkdwn", text: `*Customer:*\n${payload.customerPhone}` });
      }
      if (payload.deliveryCity) {
        fields.push({ type: "mrkdwn", text: `*City:*\n${payload.deliveryCity}` });
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|Manage Order on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "order_accepted": {
      const title = `✅ Order Accepted by Boutique`;
      const amountPaise = payload.totalPaise ?? payload.total ?? 0;
      const amountFormatted = amountPaise > 0 ? ` - ₹${(amountPaise / 100).toFixed(2)}` : "";
      const fallback = `${title}: Order #${payload.orderNumber || ""}${amountFormatted} (${payload.boutiqueName || "Boutique"})`;
      const fields = [
        { type: "mrkdwn", text: `*Order Number:*\n#${payload.orderNumber || "N/A"}` },
        { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
      ];
      if (payload.customerName) {
        fields.push({ type: "mrkdwn", text: `*Customer:*\n${payload.customerName}` });
      }
      if (amountPaise > 0) {
        fields.push({ type: "mrkdwn", text: `*Total:*\n₹${(amountPaise / 100).toFixed(2)}` });
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|View on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "order_shipped": {
      const title = `🚚 Order Out for Delivery / Shipped`;
      const fallback = `${title}: Order #${payload.orderNumber || ""} (${payload.boutiqueName || "Boutique"})`;
      const fields = [
        { type: "mrkdwn", text: `*Order Number:*\n#${payload.orderNumber || "N/A"}` },
        { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
      ];
      if (payload.customerName) {
        fields.push({ type: "mrkdwn", text: `*Customer:*\n${payload.customerName}` });
      }
      if (payload.deliveryCity) {
        fields.push({ type: "mrkdwn", text: `*Destination:*\n${payload.deliveryCity}` });
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|Track on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "order_confirmed": {
      const title = `💳 New Order Confirmed`;
      const fallback = `${title}: Order #${payload.orderId || ""} - ₹${payload.amount || ""}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Order ID:*\n${payload.orderId || "N/A"}` },
            { type: "mrkdwn", text: `*Amount:*\n₹${payload.amount || "0"}` },
            { type: "mrkdwn", text: `*Customer:*\n${payload.customerName || "N/A"}` },
            { type: "mrkdwn", text: `*Items:*\n${payload.itemCount || 1} Item(s)` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|Manage Order on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "high_value_order": {
      const title = `🚨 High-Value Order Placed (> ₹10,000)`;
      const fallback = `${title}: Order #${payload.orderId || ""} - ₹${payload.amount || ""}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Order ID:*\n${payload.orderId || "N/A"}` },
            { type: "mrkdwn", text: `*Total Amount:*\n*₹${payload.amount || "0"}*` },
            { type: "mrkdwn", text: `*Customer:*\n${payload.customerName || "N/A"}` },
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "N/A"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|View High-Value Order on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "return_claim_requested":
    case "claim_filed": {
      const title = `📦 Return / Refund Claim Initiated`;
      const fallback = `${title}: Claim for Order #${payload.orderId || ""}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Order ID:*\n${payload.orderId || "N/A"}` },
            { type: "mrkdwn", text: `*Reason:*\n${payload.reason || "Return requested"}` },
            { type: "mrkdwn", text: `*Claimant:*\n${payload.claimantName || "Customer"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/claims|Review Claim on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "claim_submitted_ops": {
      const title = `⚠️ Return/Exchange Claim Submitted`;
      const fallback = `${title}: Claim #${payload.claimNumber || ""} for Order #${payload.orderNumber || ""}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Claim #:*\n#${payload.claimNumber || "N/A"}` },
            { type: "mrkdwn", text: `*Order #:*\n#${payload.orderNumber || "N/A"}` },
            { type: "mrkdwn", text: `*Type:*\n${payload.type || "return"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/claims|Review Claim on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "shipment_failed": {
      const title = `❌ Shipment Dispatch Failed`;
      const fallback = `${title}: AWB ${payload.awbNumber || "N/A"} - ${payload.remarks || payload.exceptionType || "Dispatch failed"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*AWB:*\n${payload.awbNumber || "N/A"}` },
            { type: "mrkdwn", text: `*Exception:*\n${payload.exceptionType || "N/A"}` },
            { type: "mrkdwn", text: `*Remarks:*\n${payload.remarks || "No details provided"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/logistics|Inspect Shipment on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "shipment_rto_initiated": {
      const title = `↩️ Shipment RTO Initiated`;
      const fallback = `${title}: AWB ${payload.awbNumber || "N/A"} returning to origin`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*AWB:*\n${payload.awbNumber || "N/A"}` },
            { type: "mrkdwn", text: `*Reason:*\n${payload.exceptionType || "Customer unreachable / refused"}` },
            { type: "mrkdwn", text: `*Remarks:*\n${payload.remarks || "Return initiated"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/logistics|Inspect RTO on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "payout_requested": {
      const title = `💰 Boutique Payout Requested`;
      const fallback = `${title}: ${payload.boutiqueName || "Boutique"} - ₹${payload.amount || ""}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "N/A"}` },
            { type: "mrkdwn", text: `*Amount:*\n₹${payload.amount || "0"}` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/finance|Approve Payout on Admin Portal>`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "out_of_stock_alert": {
      const title = `⚠️ Product Sold Out (Out of Stock)`;
      const fallback = `${title}: ${payload.productName || "Product"} in ${payload.boutiqueName || "Boutique"}`;
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${payload.productName || "N/A"}` },
            { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "N/A"}` },
            { type: "mrkdwn", text: `*Status:*\nAuto-deactivated (0 stock)` },
          ],
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/products|Inspect Product on Admin Portal> • Request restock from boutique`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "catalog" };
    }

    case "payment_failed_ops": {
      const title = `🚨 Customer Checkout Payment Failed`;
      const amountPaise = payload.amountPaise ?? (payload.amount != null ? Number(payload.amount) : 0);
      const amountFormatted = amountPaise > 0 ? (amountPaise / 100).toFixed(2) : "0.00";
      const fallback = `${title}: ₹${amountFormatted} by ${payload.customerName || "Customer"} (${payload.customerPhone || "N/A"}) - ${payload.errorReason || "Failed"}`;
      const fields = [
        { type: "mrkdwn", text: `*Customer:*\n${payload.customerName || "Customer"} (\`${payload.customerPhone || "N/A"}\`)` },
        { type: "mrkdwn", text: `*Amount Attempted:*\n*₹${amountFormatted}*` },
        { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "N/A"}` },
        { type: "mrkdwn", text: `*Failure Reason:*\n${payload.errorReason || "Bank / Gateway error"}` },
      ];
      if (payload.customerEmail && payload.customerEmail !== "N/A") {
        fields.push({ type: "mrkdwn", text: `*Email:*\n${payload.customerEmail}` });
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 <${adminBaseUrl}/admin/orders|View Admin Portal> • *Action:* Reach out on WhatsApp to recover sale with alternate UPI QR`,
            },
          ],
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    case "rider_assigned_ops": {
      const title = `🛵 Hyperlocal Courier / Rider Assigned`;
      const fallback = `${title}: Order #${payload.orderNumber || ""} - ${payload.driverName || "Driver"} (${payload.vehiclePlate || "Bike"})`;
      const fields = [
        { type: "mrkdwn", text: `*Order:*\n#${payload.orderNumber || "N/A"}` },
        { type: "mrkdwn", text: `*Boutique:*\n${payload.boutiqueName || "Unknown"}` },
        { type: "mrkdwn", text: `*Rider Name:*\n${payload.driverName || "Assigned Driver"}` },
        { type: "mrkdwn", text: `*Rider Phone:*\n\`${payload.driverPhone || "N/A"}\`` },
      ];
      if (payload.vehiclePlate && payload.vehiclePlate !== "N/A") {
        fields.push({ type: "mrkdwn", text: `*Vehicle Plate:*\n\`${payload.vehiclePlate}\`` });
      }

      const contextElements: any[] = [];
      if (payload.liveTrackingUrl) {
        contextElements.push({
          type: "mrkdwn",
          text: `📍 <${payload.liveTrackingUrl}|Live Rider Map Tracking>`,
        });
      }
      contextElements.push({
        type: "mrkdwn",
        text: `🔗 <${adminBaseUrl}/admin/orders|View Order on Admin Portal>`,
      });

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          fields,
        },
        { type: "divider" },
        {
          type: "context",
          elements: contextElements,
        },
      ];
      return { text: fallback, blocks, channelCategory: "orders" };
    }

    default: {
      const title = `🔔 Notification: ${template}`;
      let text = `*${title}*\n`;
      if (payload) {
        text += "```\n" + JSON.stringify(payload, null, 2) + "\n```";
      }
      return { text };
    }
  }
}
