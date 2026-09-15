// convex/banners.ts
// Queries and mutations to manage homepage promotional banners.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { validateUploadedFile } from "./lib/uploads";
import { ImageAsset } from "./schema";
import { getPublicUrl } from "./media/api";
import { internal } from "./_generated/api";

/**
 * Helper to resolve R2 ImageAsset URLs into fully-qualified public HTTP strings.
 */
async function resolveBannerUrls(ctx: any, banner: any) {
  let desktopImageUrl = "";
  if (banner.desktopImageUrl) {
    if (typeof banner.desktopImageUrl === "object") {
      desktopImageUrl = getPublicUrl(banner.desktopImageUrl as any) || "";
    } else if (typeof banner.desktopImageUrl === "string" && banner.desktopImageUrl.startsWith("http")) {
      desktopImageUrl = banner.desktopImageUrl;
    } else if (typeof banner.desktopImageUrl === "string") {
      desktopImageUrl = (await ctx.storage.getUrl(banner.desktopImageUrl as any)) || banner.desktopImageUrl;
    }
  }
  let mobileImageUrl = "";
  if (banner.mobileImageUrl) {
    if (typeof banner.mobileImageUrl === "object") {
      mobileImageUrl = getPublicUrl(banner.mobileImageUrl as any) || "";
    } else if (typeof banner.mobileImageUrl === "string" && banner.mobileImageUrl.startsWith("http")) {
      mobileImageUrl = banner.mobileImageUrl;
    } else if (typeof banner.mobileImageUrl === "string") {
      mobileImageUrl = (await ctx.storage.getUrl(banner.mobileImageUrl as any)) || banner.mobileImageUrl;
    }
  }
  return {
    ...banner,
    desktopImageUrl,
    mobileImageUrl,
  };
}

/**
 * Fetch all active banners sorted by sortOrder.
 * Publicly accessible query used by the customer homepage.
 */
export const getActiveBanners = query({
  args: {},
  handler: async (ctx) => {
    const banners = await ctx.db
      .query("banners")
      .withIndex("by_active_and_sortOrder", (q) => q.eq("active", true))
      .collect();
    return await Promise.all(banners.map((b) => resolveBannerUrls(ctx, b)));
  },
});

/**
 * Fetch all banners.
 * Admin-only query.
 */
export const getBanners = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const banners = await ctx.db.query("banners").collect();
    return await Promise.all(banners.map((b) => resolveBannerUrls(ctx, b)));
  },
});

/**
 * Create a new banner.
 * Admin-only mutation.
 */
export const createBanner = mutation({
  args: {
    title: v.string(),
    subtitle: v.string(),
    desktopImageStorageId: v.optional(v.union(v.id("_storage"), v.string(), ImageAsset)),
    mobileImageStorageId: v.optional(v.union(v.id("_storage"), v.string(), ImageAsset)),
    desktopImageUrl: v.optional(v.string()),
    mobileImageUrl: v.optional(v.string()),
    ctaText: v.string(),
    ctaLink: v.string(),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxImageBytes = 5 * 1024 * 1024; // 5MB

    if (args.desktopImageStorageId) {
      await validateUploadedFile(ctx, args.desktopImageStorageId, undefined, allowedImageMimes, maxImageBytes);
    }
    if (args.mobileImageStorageId) {
      await validateUploadedFile(ctx, args.mobileImageStorageId, undefined, allowedImageMimes, maxImageBytes);
    }

    let desktopUrl: any = args.desktopImageUrl || "";
    if (args.desktopImageStorageId) {
      if (typeof args.desktopImageStorageId === "object") {
        desktopUrl = args.desktopImageStorageId;
      } else if (typeof args.desktopImageStorageId === "string" && args.desktopImageStorageId.startsWith("http")) {
        desktopUrl = args.desktopImageStorageId;
      } else {
        const resolved = await ctx.storage.getUrl(args.desktopImageStorageId as any);
        if (resolved) desktopUrl = resolved;
      }
    }

    let mobileUrl: any = args.mobileImageUrl || "";
    if (args.mobileImageStorageId) {
      if (typeof args.mobileImageStorageId === "object") {
        mobileUrl = args.mobileImageStorageId;
      } else if (typeof args.mobileImageStorageId === "string" && args.mobileImageStorageId.startsWith("http")) {
        mobileUrl = args.mobileImageStorageId;
      } else {
        const resolved = await ctx.storage.getUrl(args.mobileImageStorageId as any);
        if (resolved) mobileUrl = resolved;
      }
    }

    if (!desktopUrl || !mobileUrl) {
      throw new Error("Both desktop and mobile images are required.");
    }

    const bannerId = await ctx.db.insert("banners", {
      title: args.title,
      subtitle: args.subtitle,
      desktopImageUrl: desktopUrl,
      mobileImageUrl: mobileUrl,
      ctaText: args.ctaText,
      ctaLink: args.ctaLink,
      active: args.active,
      sortOrder: args.sortOrder,
      createdAt: Date.now(),
    });
    return bannerId;
  },
});

/**
 * Update an existing banner.
 * Admin-only mutation.
 */
export const updateBanner = mutation({
  args: {
    id: v.id("banners"),
    title: v.string(),
    subtitle: v.string(),
    desktopImageStorageId: v.optional(v.union(v.id("_storage"), v.string(), ImageAsset)),
    mobileImageStorageId: v.optional(v.union(v.id("_storage"), v.string(), ImageAsset)),
    desktopImageUrl: v.optional(v.string()),
    mobileImageUrl: v.optional(v.string()),
    ctaText: v.string(),
    ctaLink: v.string(),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxImageBytes = 5 * 1024 * 1024; // 5MB

    if (args.desktopImageStorageId) {
      await validateUploadedFile(ctx, args.desktopImageStorageId, undefined, allowedImageMimes, maxImageBytes);
    }
    if (args.mobileImageStorageId) {
      await validateUploadedFile(ctx, args.mobileImageStorageId, undefined, allowedImageMimes, maxImageBytes);
    }

    // Fetch existing first to fallback on images
    const existing = await ctx.db.get("banners", args.id);
    if (!existing) {
      throw new Error("Banner not found");
    }

    let desktopUrl: any = args.desktopImageUrl || existing.desktopImageUrl;
    if (args.desktopImageStorageId) {
      if (typeof args.desktopImageStorageId === "object") {
        desktopUrl = args.desktopImageStorageId;
      } else if (typeof args.desktopImageStorageId === "string" && args.desktopImageStorageId.startsWith("http")) {
        desktopUrl = args.desktopImageStorageId;
      } else {
        const resolved = await ctx.storage.getUrl(args.desktopImageStorageId as any);
        if (resolved) desktopUrl = resolved;
      }
    }

    let mobileUrl: any = args.mobileImageUrl || existing.mobileImageUrl;
    if (args.mobileImageStorageId) {
      if (typeof args.mobileImageStorageId === "object") {
        mobileUrl = args.mobileImageStorageId;
      } else if (typeof args.mobileImageStorageId === "string" && args.mobileImageStorageId.startsWith("http")) {
        mobileUrl = args.mobileImageStorageId;
      } else {
        const resolved = await ctx.storage.getUrl(args.mobileImageStorageId as any);
        if (resolved) mobileUrl = resolved;
      }
    }

    await ctx.db.patch(args.id, {
      title: args.title,
      subtitle: args.subtitle,
      desktopImageUrl: desktopUrl,
      mobileImageUrl: mobileUrl,
      ctaText: args.ctaText,
      ctaLink: args.ctaLink,
      active: args.active,
      sortOrder: args.sortOrder,
    });
    return args.id;
  },
});

/**
 * Toggle active status of a banner.
 * Admin-only mutation.
 */
export const toggleBanner = mutation({
  args: {
    id: v.id("banners"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.patch(args.id, {
      active: args.active,
    });
    return args.id;
  },
});

/**
 * Delete a banner.
 * Admin-only mutation.
 */
export const deleteBanner = mutation({
  args: {
    id: v.id("banners"),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const banner = await ctx.db.get(args.id);
    if (!banner) {
      throw new Error("Banner not found.");
    }

    const objectKeys: string[] = [];

    // Helper to check image target
    const processImage = async (field: any) => {
      if (!field) return;
      if (typeof field === "object" && field.objectKey) {
        objectKeys.push(field.objectKey);
      } else if (typeof field === "string" && !field.startsWith("http")) {
        try {
          await ctx.storage.delete(field as any);
        } catch (e) {
          console.error("[deleteBanner] Legacy storage delete failed:", field, e);
        }
      }
    };

    await processImage(banner.desktopImageUrl);
    await processImage(banner.mobileImageUrl);

    if (objectKeys.length > 0) {
      await ctx.scheduler.runAfter(0, internal.media.api.deleteR2Objects, {
        objectKeys,
        actorId: admin._id,
      });
    }

    await ctx.db.delete(args.id);
    return { id: args.id, objectKeys };
  },
});
