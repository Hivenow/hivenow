import { ResolvedBlock, ResolvedProduct } from "./types";
import { displayPricing } from "../../shared/catalog";
import { CollectionService } from "../merchandising/CollectionService";
import { getPublicUrl } from "../../media/api";

/**
 * Resolves a banner image field that may be a string URL or an ImageAsset object.
 */
async function resolveBannerImage(ctx: any, imageField: any): Promise<string> {
  if (!imageField) return "";
  if (typeof imageField === "object" && imageField.objectKey) {
    // Banners render full-bleed at sizes="100vw", so they get format negotiation
    // but no width cap. This previously asked for the "pdp" variant, which would
    // have capped the hero at PDP width on large displays.
    return getPublicUrl(imageField, "original") || "";
  }
  if (typeof imageField === "string" && imageField.startsWith("http")) {
    // Some banner rows store a fully-formed cdn.hivenow.in URL from before
    // ImageAsset existed. Those are already canonical and are returned as-is —
    // the rewrite that used to redirect them to the r2.dev development endpoint
    // existed only while cdn.hivenow.in did not resolve.
    return imageField;
  }
  if (typeof imageField === "string") {
    try {
      const url = await ctx.storage.getUrl(imageField);
      return url || imageField;
    } catch {
      return imageField;
    }
  }
  return "";
}

/**
 * Resolves category image fields to public CDN URLs.
 */
async function resolveCategoryImage(ctx: any, cat: any) {
  let imageUrl = cat.imageUrl || null;
  if (cat.imageStorageId) {
    if (typeof cat.imageStorageId === "object" && cat.imageStorageId.objectKey) {
      imageUrl = getPublicUrl(cat.imageStorageId as any);
    } else if (typeof cat.imageStorageId === "string" && cat.imageStorageId.startsWith("http")) {
      imageUrl = cat.imageStorageId;
    } else if (typeof cat.imageStorageId === "string") {
      try {
        imageUrl = await ctx.storage.getUrl(cat.imageStorageId as any);
      } catch {
        imageUrl = cat.imageStorageId;
      }
    }
  }
  let homepageImageUrl = cat.homepageImage || null;
  if (cat.homepageImage && !cat.homepageImage.startsWith("http")) {
    try {
      homepageImageUrl = await ctx.storage.getUrl(cat.homepageImage as any);
    } catch {
      homepageImageUrl = cat.homepageImage;
    }
  }
  return {
    ...cat,
    imageUrl: imageUrl || homepageImageUrl || "",
    homepageImageUrl: homepageImageUrl || imageUrl || "",
  };
}

// Auto-sourced blocks (recommended, smartRail/newArrivals, and the Recently Viewed fallback) all
// draw from the same "top active products" pool. We over-fetch relative to what's actually
// displayed so that OperationsService's delivery-radius filter (which runs after this) still has
// enough candidates left to fill the block, instead of every such block collapsing to whatever
// tiny handful of products happen to survive a `take(20)`/`take(40)` head-slice.
//
// The pool is now sized ONCE for the whole page rather than per block. Curated collections claim
// their products first (see hydrateBlocks' two passes) and those claims come out of this same
// pool, so the headroom has to budget for curated demand too — sizing each auto block in
// isolation is what previously let a page full of curated blocks starve the rails below them.
const POOL_SURVIVAL_MULTIPLIER = 5;
const POOL_MIN = 60;
const POOL_MAX = 300;

const DEFAULT_MAX_CURATED = 12;
const DEFAULT_MAX_RECENTLY_VIEWED = 12;
const DEFAULT_MAX_RECOMMENDED = 12;
const DEFAULT_MAX_SMART_RAIL = 8;

/** Products a single block intends to display. */
export function blockDemand(block: any): number {
  const configured = block.config?.maxProducts;
  if (configured) return configured;
  switch (block.blockType) {
    case "collection":
    case "premiumCuration":
      return DEFAULT_MAX_CURATED;
    case "recentlyViewed":
      return DEFAULT_MAX_RECENTLY_VIEWED;
    case "recommended":
      return DEFAULT_MAX_RECOMMENDED;
    case "smartRail":
    case "newArrivals":
      return DEFAULT_MAX_SMART_RAIL;
    default:
      return 0;
  }
}

/**
 * One page-wide pool size covering every product-backed block, curated and auto alike.
 */
function pagePoolSize(blocksRaw: any[]): number {
  const totalDemand = blocksRaw.reduce((sum, b) => sum + blockDemand(b), 0);
  // A priceCeiling rail filters the pool by price *after* it's fetched — there's no price index
  // to narrow the query with — so a restrictive ceiling can discard most of the pool. Take the
  // full ceiling when one is present rather than risk a rail that can't fill.
  const hasPriceFiltered = blocksRaw.some(
    (b) => b.blockType === "smartRail" && b.config?.ruleType === "priceCeiling"
  );
  if (hasPriceFiltered) return POOL_MAX;
  return Math.min(POOL_MAX, Math.max(POOL_MIN, totalDemand * POOL_SURVIVAL_MULTIPLIER));
}

// How many of a single block's displayed products may come from the same boutique. Only applied
// to auto-sourced pools (recommended / smartRail / recently-viewed fallback) — a merchandiser
// curating a manual collection may legitimately want it dominated by one boutique, so that path
// is left uncapped. When the capped pass can't fill the block (thin category, few boutiques in a
// newly-launched city), takeUnused runs an uncapped top-up rather than rendering a half-empty rail.
const MAX_PER_BOUTIQUE_IN_AUTO_BLOCK = 2;

/** Blocks whose products are hand-picked by a merchandiser — these claim first. */
const CURATED_BLOCK_TYPES = new Set(["collection", "premiumCuration"]);

const DEFAULT_PRICE_CEILING_RUPEES = 999;

// A "Under ₹X" rail has to match what the shopper actually sees on the card. Product price
// fields are stored in paise, so this reuses the same shared conversion the catalog grid and the
// storefront card use (convex/shared/catalog.ts displayPricing) rather than keeping its own copy.

/** The price the storefront will actually print on this product's card, in rupees. */
function displaySellingPrice(product: any): number {
  return displayPricing(product).price;
}

export class BlockService {
  /**
   * Scans a list of raw blocks and returns all Product IDs required across all blocks, plus a
   * cache of the "top active products" pools fetched along the way (keyed by pool size) so
   * hydrateBlocks doesn't have to re-run the same query a second time.
   */
  static async getBlockRequirements(
    ctx: any,
    blocksRaw: any[],
    userContext?: { userId?: string }
  ): Promise<{ productIds: string[]; activePool: any[]; categoryPools: Map<string, any[]> }> {
    const requiredProductIds: string[] = [];
    const categoryPools = new Map<string, any[]>();

    const isApproved = (p: any) => !p.approvalStatus || p.approvalStatus === "approved";

    // One pool for the whole page, sized against curated + auto demand combined.
    const poolSize = pagePoolSize(blocksRaw);
    const needsActivePool = blocksRaw.some((b) =>
      ["recentlyViewed", "recommended", "newArrivals", "smartRail"].includes(b.blockType)
    );
    const activePool = needsActivePool
      ? (await ctx.db
          .query("products")
          .withIndex("by_active", (q: any) => q.eq("active", true))
          .order("desc")
          .take(poolSize)).filter(isApproved)
      : [];
    if (activePool.length > 0) {
      requiredProductIds.push(...activePool.map((p: any) => p._id.toString()));
    }

    for (const block of blocksRaw) {
      if (CURATED_BLOCK_TYPES.has(block.blockType) && block.config?.collectionId) {
        // Pull every product mapped to the collection (not just the display cap) so that if some
        // get filtered out later (out of delivery range, out of stock), others further down the
        // merchandiser's ordering can still fill the block instead of leaving it empty.
        const pIds = await CollectionService.getCollectionRequirements(ctx, block.config.collectionId);
        requiredProductIds.push(...pIds);
      } else if (block.blockType === "recentlyViewed" && userContext?.userId) {
        const history = await ctx.db
          .query("recentlyViewed")
          .withIndex("by_user_viewed", (q: any) => q.eq("userId", userContext.userId))
          .order("desc")
          .take(12);
        requiredProductIds.push(...history.map((h: any) => h.productId.toString()));
      } else if (block.blockType === "smartRail" && block.config?.ruleType === "categoryAuto" && block.config?.categoryId) {
        // Category rails source from their own indexed slice rather than the page pool — the top-N
        // active products may contain few or none of a given category.
        const categoryId = block.config.categoryId;
        if (!categoryPools.has(categoryId)) {
          const catPool = (await ctx.db
            .query("products")
            .withIndex("by_categoryId", (q: any) => q.eq("categoryId", categoryId))
            .order("desc")
            .take(blockDemand(block) * POOL_SURVIVAL_MULTIPLIER))
            .filter((p: any) => p.active !== false && isApproved(p));
          categoryPools.set(categoryId, catPool);
          requiredProductIds.push(...catPool.map((p: any) => p._id.toString()));
        }
      }
      // NOTE: premiumCuration (and collection+premiumGrid) with no collectionId deliberately has
      // no fallback here. Premium Curation is meant to be hand-curated — auto-filling it from
      // "whatever's newest" undermines the point of the section, so an unbound Premium Curation
      // block now simply renders nothing (ExperienceBlockRenderer already collapses cleanly on an
      // empty product list) until a merchandiser binds a real collection to it.
    }

    return { productIds: Array.from(new Set(requiredProductIds)), activePool, categoryPools };
  }

  /**
   * Hydrates raw blocks into ResolvedBlock DTOs. Applies a shared "already used" set across
   * blocks so the same product can't be independently selected into multiple sections on the
   * same page load.
   *
   * Runs in TWO passes. Pass 1 hydrates merchandiser-curated blocks (collection,
   * premiumCuration) so their hand-picked products are claimed before anything else; pass 2
   * hydrates the auto-sourced rails, which fill from whatever the curated blocks didn't take.
   * Previously both ran in a single sortOrder-ordered loop, which meant a curated block only won
   * a contested product if it happened to sit higher on the page — priority was coupled to
   * layout position. It no longer is.
   *
   * Hydration order is NOT render order: results are keyed by block id and re-emitted in the
   * caller's original (sortOrder-sorted) sequence at the end.
   */
  static async hydrateBlocks(
    ctx: any,
    blocksRaw: any[],
    resolvedProductsMap: Map<string, ResolvedProduct>,
    activePool: any[],
    categoryPools: Map<string, any[]>,
    userContext?: { userId?: string }
  ): Promise<ResolvedBlock[]> {
    const resolvedById = new Map<string, ResolvedBlock>();
    const usedProductIds = new Set<string>();

    // `diversify`, when true, caps how many picks may share a boutique — only meaningful for
    // auto-sourced pools, never for a merchandiser's manual collection. If the capped pass can't
    // fill the block (thin category, or a city with few boutiques), a second uncapped pass tops
    // it up rather than shipping a visibly short rail.
    const takeUnused = (products: ResolvedProduct[], max: number, diversify = false): ResolvedProduct[] => {
      const picked: ResolvedProduct[] = [];
      const pickedIds = new Set<string>();
      const boutiqueCounts = new Map<string, number>();

      for (const p of products) {
        if (picked.length >= max) break;
        if (usedProductIds.has(p.id) || pickedIds.has(p.id)) continue;
        if (diversify) {
          const count = boutiqueCounts.get(p.boutiqueId) || 0;
          if (count >= MAX_PER_BOUTIQUE_IN_AUTO_BLOCK) continue;
          boutiqueCounts.set(p.boutiqueId, count + 1);
        }
        picked.push(p);
        pickedIds.add(p.id);
      }

      if (diversify && picked.length < max) {
        for (const p of products) {
          if (picked.length >= max) break;
          if (usedProductIds.has(p.id) || pickedIds.has(p.id)) continue;
          picked.push(p);
          pickedIds.add(p.id);
        }
      }

      // Backfill from already-claimed products when the unclaimed ones can't fill the block.
      // Cross-block uniqueness is a preference, not a guarantee: the passes above always try
      // unclaimed candidates first, so on a catalog large enough to go round nothing repeats.
      // On a small one it cannot go round — a 10-product catalogue cannot fill several rails
      // that between them ask for twenty-odd slots — and the failure mode without this is a rail
      // rendering one lonely item, or vanishing entirely, which reads to the shopper as broken
      // where a product appearing in two sections does not. Mirrors the same call made for
      // curated collections, which show their full hand-picked list regardless of what's claimed.
      if (picked.length < max) {
        for (const p of products) {
          if (picked.length >= max) break;
          if (pickedIds.has(p.id)) continue;
          picked.push(p);
          pickedIds.add(p.id);
        }
      }

      for (const p of picked) usedProductIds.add(p.id);
      return picked;
    };

    const poolToResolved = (pool: any[]): ResolvedProduct[] =>
      pool
        .map((p: any) => resolvedProductsMap.get(p._id.toString()))
        .filter(Boolean) as ResolvedProduct[];

    const hydrateBlock = async (block: any): Promise<ResolvedBlock> => {
      const data: any = {};

      if (CURATED_BLOCK_TYPES.has(block.blockType) && block.config?.collectionId) {
        const hydratedCol = await CollectionService.hydrateCollection(ctx, block.config.collectionId, resolvedProductsMap);
        if (hydratedCol) {
          const survivors = hydratedCol.productIds
            .map((id) => resolvedProductsMap.get(id))
            .filter(Boolean) as ResolvedProduct[];
          // Curated / editorial collections are hand-picked by the merchandiser.
          // They always show their full list of in-stock survivors without being suppressed by usedProductIds.
          const max = block.config.maxProducts || 12;
          const matchedProducts = survivors.slice(0, max);

          data.collection = {
            id: hydratedCol.id,
            name: hydratedCol.name,
            slug: hydratedCol.slug,
            description: hydratedCol.description,
          };
          data.products = matchedProducts;
        }
        if (block.config?.bgImage || block.config?.desktopImage) {
          data.bgImage = await resolveBannerImage(ctx, block.config.bgImage || block.config.desktopImage);
        }
      } else if (block.blockType === "recentlyViewed") {
        let matchedProducts: ResolvedProduct[] = [];
        let isPersonalized = false;

        if (userContext?.userId) {
          const history = await ctx.db
            .query("recentlyViewed")
            .withIndex("by_user_viewed", (q: any) => q.eq("userId", userContext.userId))
            .order("desc")
            .take(12);

          matchedProducts = history
            .map((h: any) => resolvedProductsMap.get(h.productId.toString()))
            .filter(Boolean) as ResolvedProduct[];
          isPersonalized = matchedProducts.length > 0;
        }

        if (!isPersonalized) {
          // Guest, or a signed-in shopper who hasn't viewed anything yet — show something instead
          // of leaving the slot empty.
          matchedProducts = poolToResolved(activePool)
            .sort((a, b) => (b.hiveScore ?? 0) - (a.hiveScore ?? 0));
        }

        data.products = takeUnused(matchedProducts, blockDemand(block), !isPersonalized);
        data.isPersonalized = isPersonalized;
      } else if (block.blockType === "recommended") {
        let candidates = poolToResolved(activePool);

        // Real (if lightweight) personalization: boost candidates that share a category with
        // something the shopper has actually looked at, instead of just re-showing the same
        // recency-ranked pool every other auto-sourced block uses.
        let isPersonalized = false;
        if (userContext?.userId) {
          const history = await ctx.db
            .query("recentlyViewed")
            .withIndex("by_user_viewed", (q: any) => q.eq("userId", userContext.userId))
            .order("desc")
            .take(20);

          if (history.length > 0) {
            const viewedProducts = await Promise.all(history.map((h: any) => ctx.db.get(h.productId)));
            const viewedCategoryIds = new Set(
              viewedProducts.filter(Boolean).map((p: any) => p.categoryId?.toString()).filter(Boolean)
            );
            if (viewedCategoryIds.size > 0) {
              isPersonalized = true;
              candidates = candidates
                .map((c) => ({ product: c, affinity: viewedCategoryIds.has(c.categoryId) ? 1 : 0 }))
                .sort((a, b) => b.affinity - a.affinity || (b.product.hiveScore ?? 0) - (a.product.hiveScore ?? 0))
                .map((x) => x.product);
            }
          }
        }
        if (!isPersonalized) {
          candidates.sort((a, b) => (b.hiveScore ?? 0) - (a.hiveScore ?? 0));
        }

        data.products = takeUnused(candidates, blockDemand(block), true);
        data.isPersonalized = isPersonalized;
      } else if (block.blockType === "smartRail" || block.blockType === "newArrivals") {
        // "newArrivals" is the legacy blockType for what is now a smartRail with the default
        // rule; both land here so existing rows keep working without a migration.
        const ruleType = block.config?.ruleType || "newArrivals";
        let candidates: ResolvedProduct[];

        if (ruleType === "categoryAuto" && block.config?.categoryId) {
          candidates = poolToResolved(categoryPools.get(block.config.categoryId) || []);
        } else if (ruleType === "priceCeiling") {
          // Filtered on the RAW pool docs, not the resolved DTOs: ResolvedProduct carries `price`
          // but not `discountPrice`, and the effective selling price depends on both.
          const ceiling = block.config?.priceCeiling ?? DEFAULT_PRICE_CEILING_RUPEES;
          candidates = poolToResolved(
            activePool.filter((p: any) => displaySellingPrice(p) <= ceiling)
          );
        } else {
          candidates = poolToResolved(activePool);
        }

        // Every shipped rule is recency-ordered — the pools are already fetched `.order("desc")`,
        // so no re-sort here. Deliberately NOT sorting by hiveScore: that score is
        // 0.35*eta + 0.25*distance + 0.40*constant, i.e. a proximity measure, so using it here
        // would silently turn a "newest first" rail into a "nearest boutique first" rail.
        data.products = takeUnused(candidates, blockDemand(block), true);
      } else if (block.blockType === "hero") {
        // Hero block always pulls the global carousel banners from the banners table
        const activeBanners = await ctx.db
          .query("banners")
          .withIndex("by_active_and_sortOrder", (q: any) => q.eq("active", true))
          .collect();

        // Sort by sortOrder
        const validBanners = activeBanners.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

        data.banners = await Promise.all(
          validBanners.map(async (banner: any) => {
            return {
              _id: banner._id.toString(),
              title: banner.title || "",
              desktopImage: await resolveBannerImage(ctx, banner.desktopImageUrl) || "",
              mobileImage: await resolveBannerImage(ctx, banner.mobileImageUrl || banner.desktopImageUrl) || "",
              targetUrl: banner.ctaLink || "/products",
            };
          })
        );
      } else if (block.blockType === "banner") {
        // A. Direct image configured on the block itself (from Experience Studio)
        if (block.config?.desktopImage || block.config?.mobileImage || block.config?.bannerImage || block.config?.imageUrl) {
          const desktopImage = await resolveBannerImage(ctx, block.config.desktopImage || block.config.mobileImage || block.config.bannerImage || block.config.imageUrl);
          const mobileImage = await resolveBannerImage(ctx, block.config.mobileImage || block.config.desktopImage || block.config.bannerImage || block.config.imageUrl);
          data.banners = [{
            _id: block._id.toString(),
            desktopImage,
            mobileImage,
            targetUrl: block.config.targetUrl || "/collections",
            title: block.title || "",
          }];
        } else if (block.config?.bannerId) {
          const banner = await ctx.db.get(block.config.bannerId);
          if (banner) {
            data.banners = [{
              ...banner,
              desktopImage: await resolveBannerImage(ctx, (banner as any).desktopImageUrl || (banner as any).desktopImage) || "",
              mobileImage: await resolveBannerImage(ctx, (banner as any).mobileImageUrl || (banner as any).mobileImage) || "",
              targetUrl: (banner as any).ctaLink || (banner as any).targetUrl || "/collections",
            }];
          }
        }
      } else if (block.blockType === "category") {
        const rawCategories = await ctx.db
          .query("categories")
          .withIndex("by_active_and_sortOrder", (q: any) => q.eq("active", true))
          .collect();
        const activeCategories = rawCategories.filter((c: any) => c.showOnHomepage);
        data.categories = await Promise.all(activeCategories.map((c: any) => resolveCategoryImage(ctx, c)));
      }

      return {
        id: block._id.toString(),
        blockKey: block.blockKey,
        blockType: block.blockType,
        title: block.title,
        subtitle: block.subtitle,
        renderer: block.renderer,
        config: block.config,
        data,
      };
    };

    // PASS 1 — merchandiser-curated blocks claim their hand-picked products first.
    for (const block of blocksRaw) {
      if (CURATED_BLOCK_TYPES.has(block.blockType)) {
        resolvedById.set(block._id.toString(), await hydrateBlock(block));
      }
    }

    // PASS 2 — everything else (auto rails, plus the non-product blocks, which never touch
    // usedProductIds and so are order-independent).
    for (const block of blocksRaw) {
      const id = block._id.toString();
      if (!resolvedById.has(id)) {
        resolvedById.set(id, await hydrateBlock(block));
      }
    }

    // Hydration order above is priority order, NOT render order. Re-emit in the caller's original
    // sequence (ExperienceService already sorted blocksRaw by sortOrder) so the page lays out
    // exactly as the merchandiser arranged it. Mapping over blocksRaw rather than re-sorting
    // avoids reintroducing tie/duplicate hazards on equal sortOrder values.
    return blocksRaw
      .map((b) => resolvedById.get(b._id.toString()))
      .filter(Boolean) as ResolvedBlock[];
  }
}
