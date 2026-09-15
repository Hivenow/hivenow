import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const markNotificationStatus = internalMutation({
    args: {
        eventId: v.id("notificationEvents"),
        status: v.union(v.literal("sent"), v.literal("failed")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.eventId, {
            status: args.status,
            sentAt: args.status === "sent" ? Date.now() : undefined,
        });
    },
});

/**
 * Network requests must run in an action, never in a Convex mutation.
 * Notification-producing mutations schedule this action after committing.
 */
export const sendNotification = internalAction({
    args: {
        eventId: v.id("notificationEvents"),
        text: v.string(),
        blocks: v.optional(v.any()),
        channel: v.optional(v.union(v.literal("orders"), v.literal("catalog"))),
    },
    handler: async (ctx, args) => {
        try {
            let webhookUrl = process.env.SLACK_WEBHOOK_URL;
            if (args.channel === "orders") {
                webhookUrl = process.env.SLACK_WEBHOOK_ORDERS_URL || process.env.SLACK_WEBHOOK_URL;
            } else if (args.channel === "catalog") {
                webhookUrl = process.env.SLACK_WEBHOOK_CATALOG_URL || process.env.SLACK_WEBHOOK_URL;
            }

            if (!webhookUrl) {
                console.warn(`[sendSlackNotification] Slack webhook URL not configured for channel ${args.channel || "default"}`);
            } else {
                const bodyPayload: any = { text: args.text };
                if (args.blocks && Array.isArray(args.blocks) && args.blocks.length > 0) {
                    bodyPayload.blocks = args.blocks;
                }

                const response = await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bodyPayload),
                });

                if (!response.ok) {
                    throw new Error(`Slack webhook failed: ${await response.text()}`);
                }
            }

            await ctx.runMutation(internal.slack.markNotificationStatus, {
                eventId: args.eventId,
                status: "sent",
            });
        } catch (error) {
            console.error("[sendSlackNotification] Failed to send notification", error);
            await ctx.runMutation(internal.slack.markNotificationStatus, {
                eventId: args.eventId,
                status: "failed",
            });
        }
    },
});