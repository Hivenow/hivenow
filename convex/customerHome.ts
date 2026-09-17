import { query } from "./_generated/server";
import { v } from "convex/values";
import { ContentService } from "./services/content/ContentService";
import { CollectionService } from "./services/merchandising/CollectionService";
import { ExperienceService } from "./services/content/ExperienceService";
import { CatalogService } from "./services/catalog/CatalogService";
import { OperationsService } from "./services/operations/OperationsService";
import { MerchandisingService } from "./services/merchandising/MerchandisingService";
import { blockDemand } from "./services/content/BlockService";
import { getCurrentUserOrNull } from "./lib/auth";
import { resolveDiscoveryContext } from "./lib/discoveryContext";

/** Upper bound on the shopper's history read by the personalisation overlay. */
const HISTORY_LIMIT = 20;

export const resolveExperiencePayload = query({
  args: {
    slug: v.string(),
    city: v.optional(v.string()),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
    // DEPRECATED AND DELIBERATELY UNREAD. This was passed straight through as the identity used
    // to personalise the page, so any caller could request another shopper's recently-viewed
    // history by supplying their id. Personalisation now lives in getPersonalizedBlocks below,
    // which derives identity from ctx.auth and accepts no identity argument at all.
    //
    // The argument is retained only so already-deployed clients that still send it keep working;
    // it has no effect. Remove it once no such client remains. See the deployment sequence in the
    // Phase 1 spec: server stops reading it, then the client stops sending it, then it goes.
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Discovery identity: which Hive service area, if any, this coordinate belongs to. Resolved
    // from active pincode centroids — never from the caller's `city` string, which is why
    // args.city is not passed to the resolver.
    const discovery = await resolveDiscoveryContext(ctx, { lat: args.userLat, lng: args.userLng });

    // Logistics coordinates are deliberately the ORIGINAL request coordinates, not
    // discovery.coords. Discovery eligibility ("does this shopper belong to a service area?") and
    // logistics ("how far is this boutique from this point?") are different questions. An
    // out-of-area shopper still gets honest distance and ETA figures; they simply are not treated
    // as belonging to a service area. Collapsing the two would silently change what out-of-area
    // shoppers see today, which this wiring is not meant to do.
    const experience = await ContentService.getExperience(ctx, args.slug, {
      lat: args.userLat,
      lng: args.userLng,
      city: args.city,
    });

    if (!experience) return experience;

    // Additive. Nothing consumes serviceArea yet — the candidate/vertical layers that will are
    // later phases. Surfacing it now gives those phases a stable identity to build on, and makes
    // discovery eligibility independently observable from logistics enrichment.
    return { ...experience, discovery };
  },
});

/**
 * Per-shopper overlay for the blocks that genuinely need identity.
 *
 * Returns only the personalised blocks, keyed by block id, for the client to merge over the
 * shared composition from resolveExperiencePayload. Returns null for anonymous callers, who keep
 * the composition's existing guest fallback.
 *
 * Deliberately does NOT call ContentService.getExperience: no page pool, no category pools, no
 * collection requirements, and no two-pass allocation. It reads the block metadata (one indexed
 * experience lookup plus one indexed block read), then resolves at most a couple of dozen
 * products for this shopper. Recreating the full Home pipeline per user is exactly what this
 * split exists to avoid.
 */
export const getPersonalizedBlocks = query({
  args: {
    slug: v.string(),
    city: v.optional(v.string()),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;

    const rawData = await ExperienceService.getRawExperienceAndBlocks(ctx, args.slug);
    if (!rawData) return null;

    const personalizedBlocks = rawData.blocksRaw.filter(
      (b: any) => b.blockType === "recentlyViewed" || b.blockType === "recommended"
    );
    if (personalizedBlocks.length === 0) return null;

    // The shopper's own history is the only user-specific read here, and it is bounded.
    const history = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_viewed", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(HISTORY_LIMIT);
    if (history.length === 0) return null;

    const historyProductIds = history.map((h: any) => h.productId.toString());

    // Resolve and enrich only these products. Coordinates are passed so the overlay's delivery
    // labels and distances match the composition's rather than disagreeing with them.
    let products = await CatalogService.fetchProductsByIds(ctx, historyProductIds);
    products = await OperationsService.enrichWithDeliveryLogistics(ctx, products, {
      lat: args.userLat,
      lng: args.userLng,
      city: args.city,
    });
    products = MerchandisingService.enrichWithMerchandising(products);

    const byId = new Map(products.map((p) => [p.id, p]));
    // History order is most-recent-first and is the ordering shoppers expect back.
    const historyOrdered = historyProductIds
      .map((id) => byId.get(id))
      .filter(Boolean) as typeof products;

    if (historyOrdered.length === 0) return null;

    const viewedCategoryIds = new Set(
      historyOrdered.map((p) => p.categoryId).filter(Boolean) as string[]
    );

    const result: Record<string, { products: typeof products; isPersonalized: boolean }> = {};

    for (const block of personalizedBlocks) {
      const demand = blockDemand(block);
      let ordered: typeof products;

      if (block.blockType === "recentlyViewed") {
        ordered = historyOrdered;
      } else {
        // "recommended": same affinity heuristic the composition uses, applied to the shopper's
        // own history rather than to the page pool.
        ordered = [...historyOrdered].sort(
          (a, b) =>
            Number(viewedCategoryIds.has(b.categoryId as string)) -
              Number(viewedCategoryIds.has(a.categoryId as string)) ||
            (b.hiveScore ?? 0) - (a.hiveScore ?? 0)
        );
      }

      // Dedupe WITHIN the block. Overlap with other Home rails is accepted by design — a product
      // the shopper actually viewed may legitimately also appear in New Arrivals — but a block
      // must never repeat a product against itself.
      const seen = new Set<string>();
      const picked: typeof products = [];
      for (const p of ordered) {
        if (picked.length >= demand) break;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        picked.push(p);
      }

      if (picked.length > 0) {
        result[block._id.toString()] = { products: picked, isPersonalized: true };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  },
});

export const getCollection = query({
  args: {
    slug: v.string(),
    city: v.optional(v.string()),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch collection by slug
    const collection = await ctx.db
      .query("collections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!collection || collection.status !== "published") return null;

    // 2. Hydrate
    const hydrated = await CollectionService.hydrateCollection(ctx, collection._id, new Map());
    if (!hydrated) return null;

    // 3. Batch-fetch and enrich the same way the homepage rails do (CatalogService is what
    // ContentService.getExperience and getPersonalizedBlocks both use below). Raw ctx.db.get()
    // documents carry no boutiqueName, so every product on this page showed "Unknown Boutique" —
    // and carried none of fetchProductsByIds' filtering, so a collection could show a product
    // that was out of stock, unapproved, or from a suspended boutique, none of which the same
    // product would survive on a homepage rail.
    const products = await CatalogService.fetchProductsByIds(ctx, hydrated.productIds);

    return {
      collection: hydrated,
      products,
    };
  }
});

export const getAllCollections = query({
  args: {},
  handler: async (ctx) => {
    const rawCollections = await ctx.db
      .query("collections")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    return await Promise.all(
      rawCollections.map(async (col) => {
        const mappings = await ctx.db
          .query("collectionProducts")
          .withIndex("by_collection_sort", (q: any) => q.eq("collectionId", col._id))
          .collect();
        return {
          ...col,
          productCount: mappings.length,
        };
      })
    );
  }
});

