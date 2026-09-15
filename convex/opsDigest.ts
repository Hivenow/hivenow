// convex/opsDigest.ts
// Automated Daily 9:00 PM IST Operations Digest for Hive marketplace.
// Aggregates orders, GMV, delivery performance, and top boutiques.

import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Compiles metrics for all orders placed today (in Indian Standard Time).
 */
export const compileDailyMetrics = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // IST is UTC+5:30 (19,800,000 ms)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now + IST_OFFSET_MS);

    // Compute start of today 00:00:00 IST in epoch ms
    const startOfTodayIST = new Date(Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
      0, 0, 0, 0
    )).getTime() - IST_OFFSET_MS;

    const todayOrders = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", startOfTodayIST))
      .collect();

    const totalOrders = todayOrders.length;
    const nonCancelled = todayOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "booking_failed"
    );

    const totalGmvPaise = nonCancelled.reduce((sum, o) => sum + (o.total ?? 0), 0);
    const totalGmvRupees = totalGmvPaise / 100;

    // Status breakdowns
    const deliveredCount = todayOrders.filter((o) => o.status === "delivered").length;
    const inTransitCount = todayOrders.filter((o) =>
      ["in_transit", "out_for_delivery"].includes(o.status)
    ).length;
    const prepCount = todayOrders.filter((o) =>
      ["confirmed", "packed", "pickup_scheduled"].includes(o.status)
    ).length;
    const pendingCount = todayOrders.filter(
      (o) => o.status === "pending_confirmation"
    ).length;
    const cancelledCount = todayOrders.filter((o) =>
      ["cancelled", "booking_failed"].includes(o.status)
    ).length;

    // Average Seller Acceptance Time (in minutes)
    const acceptedOrders = todayOrders.filter(
      (o) => (o.orderAcceptedAt || o.confirmedAt) && o.createdAt
    );
    const avgAcceptanceMins =
      acceptedOrders.length > 0
        ? Math.round(
            acceptedOrders.reduce(
              (sum, o) =>
                sum + ((o.orderAcceptedAt || o.confirmedAt)! - o.createdAt),
              0
            ) /
              acceptedOrders.length /
              60000
          )
        : null;

    // Top boutiques by volume & GMV
    const boutiqueMap: Record<string, { name: string; orders: number; gmvPaise: number }> = {};
    for (const o of nonCancelled) {
      const name = o.boutiqueName || "Boutique";
      if (!boutiqueMap[name]) {
        boutiqueMap[name] = { name, orders: 0, gmvPaise: 0 };
      }
      boutiqueMap[name].orders += 1;
      boutiqueMap[name].gmvPaise += o.total ?? 0;
    }

    const topBoutiques = Object.values(boutiqueMap)
      .sort((a, b) => b.orders - a.orders || b.gmvPaise - a.gmvPaise)
      .slice(0, 3)
      .map((b) => ({
        name: b.name,
        orders: b.orders,
        gmvRupees: Math.round(b.gmvPaise / 100),
      }));

    // Formatted date string in IST
    const dateFormatted = istNow.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return {
      dateFormatted,
      totalOrders,
      totalGmvRupees,
      deliveredCount,
      inTransitCount,
      prepCount,
      pendingCount,
      cancelledCount,
      avgAcceptanceMins,
      topBoutiques,
    };
  },
});

/**
 * Formats and dispatches the Daily Ops Digest to the #orders Slack channel.
 * Triggered automatically by convex/crons.ts at 9:00 PM IST (15:30 UTC).
 */
export const sendDailyOpsDigest = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; date: string; orders: number }> => {
    const metrics: any = await ctx.runQuery(internal.opsDigest.compileDailyMetrics);
    const adminUrl = process.env.ADMIN_URL || "https://admin.hivenow.in";

    const gmvFormatted = Number(metrics.totalGmvRupees).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    });

    const fallback = `📊 Daily Ops Digest (${metrics.dateFormatted}): ${metrics.totalOrders} orders, ₹${gmvFormatted} GMV`;

    const fields = [
      { type: "mrkdwn", text: `*🛍️ Total Orders:*\n${metrics.totalOrders}` },
      { type: "mrkdwn", text: `*💰 Today's GMV:*\n₹${gmvFormatted}` },
      {
        type: "mrkdwn",
        text: `*⚡ Avg Acceptance:*\n${
          metrics.avgAcceptanceMins !== null
            ? `${metrics.avgAcceptanceMins} min(s)`
            : "N/A"
        }`,
      },
      { type: "mrkdwn", text: `*✅ Delivered:*\n${metrics.deliveredCount}` },
      { type: "mrkdwn", text: `*🚚 In-Transit / Out:*\n${metrics.inTransitCount}` },
      { type: "mrkdwn", text: `*📦 In Prep / Packing:*\n${metrics.prepCount}` },
      { type: "mrkdwn", text: `*⏳ Awaiting Acceptance:*\n${metrics.pendingCount}` },
      { type: "mrkdwn", text: `*❌ Cancelled / Declined:*\n${metrics.cancelledCount}` },
    ];

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📊 Daily Operations Digest — ${metrics.dateFormatted}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields,
      },
    ];

    if (metrics.topBoutiques.length > 0) {
      const topStoresList = metrics.topBoutiques
        .map(
          (b: any, idx: number) =>
            `${idx + 1}. *${b.name}* — ${b.orders} order(s) • ₹${Number(b.gmvRupees).toLocaleString("en-IN")}`
        )
        .join("\n");

      blocks.push(
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🏬 Top Performing Boutiques Today:*\n${topStoresList}`,
          },
        }
      );
    }

    blocks.push(
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🔗 <${adminUrl}/admin/orders|View Live Orders on Admin Portal>  •  *Hive Automated 9:00 PM IST Digest*`,
          },
        ],
      }
    );

    await ctx.runAction(internal.slack.sendSlackChannelMessage, {
      channel: "orders",
      text: fallback,
      blocks,
    });

    return { success: true, date: metrics.dateFormatted, orders: metrics.totalOrders };
  },
});
