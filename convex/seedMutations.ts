// convex/seedMutations.ts
// Mutations for seeding mock database with rich QA test data.

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { resolveVerticalTypeForCategory } from "./lib/verticals";
import { calculateAllInclusivePricePaise, getPlatformConfig } from "./pricingService";

/**
 * Whether mock-data seeding may run in this environment.
 *
 * `insertMockData` deletes every product, boutique, category, collection and
 * experience before reseeding, and it was reachable as an unauthenticated public
 * mutation — one anonymous call against the production deployment would have
 * destroyed the live catalogue. The seed workflow in convex/seed.ts already gates
 * on ENABLE_DEBUG_TOOLS, but that gate sat on the *action*, so calling the
 * mutation directly bypassed it entirely.
 *
 * Same double gate as the debug admin promoters in convex/users.ts: production is
 * refused outright, and every other environment must opt in explicitly. Exported
 * as a pure predicate so it can be tested without the Convex runtime.
 */
export function isSeedingAllowed(
  nodeEnv: string | undefined,
  enableDebugTools: string | undefined
): boolean {
  if (nodeEnv === "production") return false;
  return enableDebugTools === "true";
}

export const insertMockData = mutation({
  args: { categoryImageIds: v.optional(v.record(v.string(), v.string())) },
  handler: async (ctx, args) => {
    // STRICT ENVIRONMENT GATE — must precede any destructive work.
    if (!isSeedingAllowed(process.env.NODE_ENV, process.env.ENABLE_DEBUG_TOOLS)) {
      throw new Error("Unauthorized: Mock data seeding is strictly disabled in this environment.");
    }

    const now = Date.now();

    // 1. Clean up existing data
    const tablesToClean = [
      "products", "boutiques", "categories", "deliveryZones", "serviceablePincodes",
      "homepageConfig", "banners", "collections", "collectionProducts",
      "experiences", "experienceBlocks"
    ] as const;

    for (const table of tablesToClean) {
      const records = await ctx.db.query(table).collect();
      for (const r of records) {
        await ctx.db.delete(r._id);
      }
    }

    // 2. Seed deliveryZones & serviceablePincodes
    const zonesData = [
      { code: "KOCHI_CORE", name: "Kochi Core Area", deliveryFeePaise: 4900, freeDeliveryThresholdPaise: 300000, sameDayEligible: true, active: true },
      { code: "KOCHI_EXTENDED", name: "Kochi Extended Area", deliveryFeePaise: 9900, freeDeliveryThresholdPaise: 350000, sameDayEligible: true, active: true },
    ];
    for (const z of zonesData) {
      await ctx.db.insert("deliveryZones", z);
    }
    
    // Minimal pincodes for QA
    const pincodesData = [
      { pincode: "682030", city: "Kochi", state: "Kerala", lat: 10.0159, lng: 76.3419, active: true, zoneCode: "KOCHI_EXTENDED" },
      { pincode: "682001", city: "Ernakulam", state: "Kerala", lat: 9.9658, lng: 76.2421, active: true, zoneCode: "KOCHI_CORE" },
    ];
    for (const p of pincodesData) {
      await ctx.db.insert("serviceablePincodes", p);
    }

    // 3. Seed categories
    const parentId = await ctx.db.insert("categories", {
      name: "Women's Fashion", slug: "womens-fashion", active: true, sortOrder: 1, createdAt: now,
    });

    const subcats = [
      { name: "Sarees", slug: "sarees", icon: "Sarees" },
      { name: "Lehengas", slug: "lehengas", icon: "Lehengas" },
      { name: "Dresses", slug: "dresses", icon: "Dresses" },
      { name: "Co-ords", slug: "coords", icon: "Co-ords" },
      { name: "Office Wear", slug: "office-wear", icon: "Office" },
      { name: "Party Wear", slug: "party-wear", icon: "Party" },
    ];

    const categoryIds: Record<string, Id<"categories">> = {};
    for (const [idx, sub] of subcats.entries()) {
      const id = await ctx.db.insert("categories", {
        name: sub.name, slug: sub.slug, active: true, sortOrder: idx + 1,
        showOnHomepage: true, homepageOrder: idx + 1, icon: sub.icon,
        parentId, createdAt: now,
      });
      categoryIds[sub.slug] = id;
    }

    await ctx.db.insert("homepageConfig", {
      activeHeroBannerIds: [], featuredCategoryIds: Object.values(categoryIds),
      featuredBoutiqueIds: [], enableOccasionSection: true, enableMostLovedSection: true, updatedAt: now,
    });

    // 4. Seed Hyperlocal Boutiques (15 distinct Koch-based boutiques)
    const boutiquesData = [
      { boutiqueName: "Linen House", address: "Kakkanad, Kochi", latitude: 10.0159, longitude: 76.3419, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Linen & Office Wear", productCount: 24 },
      { boutiqueName: "Velvet Edit", address: "Edappally, Kochi", latitude: 10.0261, longitude: 76.3088, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Party Wear", productCount: 18 },
      { boutiqueName: "Saree Studio", address: "Kaloor, Kochi", latitude: 9.9932, longitude: 76.2952, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Sarees", productCount: 22 },
      { boutiqueName: "Co-ord Lab", address: "Palarivattom, Kochi", latitude: 10.0056, longitude: 76.3075, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Co-ords", productCount: 12 },
      { boutiqueName: "Studio Basics", address: "Fort Kochi", latitude: 9.9658, longitude: 76.2421, deliveryRadiusKm: 5, deliveryFee: 99, specialty: "Everyday Wear", productCount: 15 },
      { boutiqueName: "Luxe Wardrobe", address: "Panampilly Nagar, Kochi", latitude: 9.9592, longitude: 76.2928, deliveryRadiusKm: 15, deliveryFee: 99, specialty: "Premium Designer", productCount: 8 },
      { boutiqueName: "Monsoon Edit", address: "MG Road, Kochi", latitude: 9.9723, longitude: 76.2778, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Casual & Cotton", productCount: 11 },
      { boutiqueName: "Vyttila Weaves", address: "Vyttila, Kochi", latitude: 9.9704, longitude: 76.3197, deliveryRadiusKm: 10, deliveryFee: 49, specialty: "Handlooms", productCount: 9 },
      { boutiqueName: "Thrippunithura Heritage", address: "Thrippunithura, Kochi", latitude: 9.9489, longitude: 76.3431, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Ethnic", productCount: 10 },
      { boutiqueName: "Aluva Cottons", address: "Aluva, Kochi", latitude: 10.1076, longitude: 76.3457, deliveryRadiusKm: 20, deliveryFee: 99, specialty: "Office Wear", productCount: 13 },
      { boutiqueName: "Marine Drive Boutique", address: "Marine Drive, Kochi", latitude: 9.9796, longitude: 76.2758, deliveryRadiusKm: 10, deliveryFee: 49, specialty: "Party Wear", productCount: 7 },
      { boutiqueName: "Thevara Trends", address: "Thevara, Kochi", latitude: 9.9431, longitude: 76.2974, deliveryRadiusKm: 10, deliveryFee: 49, specialty: "Co-ords", productCount: 6 },
      { boutiqueName: "Kadavanthra Silks", address: "Kadavanthra, Kochi", latitude: 9.9669, longitude: 76.2995, deliveryRadiusKm: 15, deliveryFee: 49, specialty: "Sarees", productCount: 10 },
      { boutiqueName: "Angamaly Wardrobe", address: "Angamaly, Kochi", latitude: 10.1966, longitude: 76.3863, deliveryRadiusKm: 25, deliveryFee: 149, specialty: "Casual", productCount: 5 },
      { boutiqueName: "Mattancherry Vintage", address: "Mattancherry, Kochi", latitude: 9.9575, longitude: 76.2587, deliveryRadiusKm: 5, deliveryFee: 49, specialty: "Premium Designer", productCount: 7 },
    ];

    const boutiqueIds: Record<string, Id<"boutiques">> = {};
    for (const b of boutiquesData) {
      const id = await ctx.db.insert("boutiques", {
        boutiqueName: b.boutiqueName,
        ownerName: "Owner of " + b.boutiqueName,
        email: b.boutiqueName.replace(/\s+/g, "").toLowerCase() + "@test.com",
        ownerEmail: b.boutiqueName.replace(/\s+/g, "").toLowerCase() + "@test.com",
        phone: "+919000000000",
        address: b.address,
        latitude: b.latitude,
        longitude: b.longitude,
        deliveryRadiusKm: b.deliveryRadiusKm,
        deliveryFee: b.deliveryFee,
        freeDeliveryThreshold: 3000,
        description: `Specializing in ${b.specialty}.`,
        status: "APPROVED",
        createdAt: now,
        seedSource: "demo",
      });
      boutiqueIds[b.boutiqueName] = id;
    }

    // 5. Generate Products based on Boutique Personality
    const productIds: Id<"products">[] = [];
    const productMap: { [key: string]: Id<"products">[] } = {
      premium: [], under1499: [], office: [], party: [], coords: [], dresses: [], sarees: [], fresh: []
    };

    let globalIndex = 0;
    // Product price fields are paise, written the same way createProduct writes them: the seller's
    // base price in `basePrice`, the all-inclusive storefront price in `price`. The rupee figures
    // below are only used to pick realistic amounts and to sort products into collections.
    const platformConfig = await getPlatformConfig(ctx);
    for (const b of boutiquesData) {
      const bId = boutiqueIds[b.boutiqueName]!;
      for (let i = 0; i < b.productCount; i++) {
        globalIndex++;
        
        let catSlug = "dresses";
        let name = "Dress";
        let price = 1500;
        
        // Derive category and price based on specialty
        if (b.specialty.includes("Saree")) { catSlug = "sarees"; name = "Saree"; price = 2500 + (globalIndex % 3000); }
        else if (b.specialty.includes("Party")) { catSlug = "party-wear"; name = "Party Dress"; price = 2000 + (globalIndex % 2000); }
        else if (b.specialty.includes("Co-ord")) { catSlug = "coords"; name = "Co-ord Set"; price = 1200 + (globalIndex % 1000); }
        else if (b.specialty.includes("Office")) { catSlug = "office-wear"; name = "Formal Top"; price = 800 + (globalIndex % 800); }
        else if (b.specialty.includes("Premium")) { catSlug = "lehengas"; name = "Designer Lehenga"; price = 5000 + (globalIndex % 10000); }
        else {
          price = 699 + (globalIndex * 13) % 2500;
        }

        const basePricePaise = price * 100;
        const baseDiscountPricePaise = globalIndex % 3 === 0 ? Math.round(price * 0.9) * 100 : undefined;

        const outOfStock = (globalIndex % 5 === 0); // 20% out of stock
        const isFresh = globalIndex % 4 === 0;

        const seedCategoryId = categoryIds[catSlug] || categoryIds["dresses"]!;
        const seedVerticalType = await resolveVerticalTypeForCategory(ctx.db, seedCategoryId);

        const pId = await ctx.db.insert("products", {
          boutiqueId: bId,
          name: `${b.boutiqueName} ${name} #${i + 1}`,
          slug: `${b.boutiqueName.replace(/\s+/g, "-").toLowerCase()}-${name.replace(/\s+/g, "-").toLowerCase()}-${globalIndex}`,
          description: `A beautiful ${name.toLowerCase()} from ${b.boutiqueName}.`,
          categoryId: seedCategoryId,
          verticalType: seedVerticalType,
          basePrice: basePricePaise,
          price: calculateAllInclusivePricePaise(basePricePaise, "bronze", platformConfig),
          baseDiscountPrice: baseDiscountPricePaise,
          discountPrice: baseDiscountPricePaise
            ? calculateAllInclusivePricePaise(baseDiscountPricePaise, "bronze", platformConfig)
            : undefined,
          images: ["https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=800&q=80"],
          sizes: ["S", "M", "L"],
          stockBySize: { "S": outOfStock ? 0 : 5, "M": outOfStock ? 0 : 5, "L": outOfStock ? 0 : 5 },
          sameDayEligible: true,
          active: true,
          featured: false,
          createdAt: now,
          updatedAt: now,
          seedSource: "demo",
        });

        productIds.push(pId);

        // Classify into collections for overlap
        if (price > 4000) productMap.premium!.push(pId);
        if (price < 1500) productMap.under1499!.push(pId);
        if (catSlug === "office-wear" || b.specialty.includes("Office")) productMap.office!.push(pId);
        if (catSlug === "party-wear" || b.specialty.includes("Party")) productMap.party!.push(pId);
        if (catSlug === "coords") productMap.coords!.push(pId);
        if (catSlug === "dresses") productMap.dresses!.push(pId);
        if (catSlug === "sarees") productMap.sarees!.push(pId);
        if (isFresh) productMap.fresh!.push(pId);
      }
    }

    // 6. Seed Commerce Collections
    const collectionData = [
      { name: "Fresh on Hive", slug: "fresh-on-hive", keys: productMap.fresh! },
      { name: "Premium Picks", slug: "premium-picks", keys: productMap.premium! },
      { name: "Under ₹1499", slug: "under-1499", keys: productMap.under1499! },
      { name: "Office Wear", slug: "office-wear", keys: productMap.office! },
      { name: "Party Wear", slug: "party-wear", keys: productMap.party! },
      { name: "Co-ord Sets", slug: "coord-sets", keys: productMap.coords! },
      { name: "Dresses", slug: "dresses", keys: productMap.dresses! },
      { name: "Sarees", slug: "sarees", keys: productMap.sarees! },
    ];

    const collIds: Record<string, Id<"collections">> = {};
    for (const c of collectionData) {
      const id = await ctx.db.insert("collections", {
        name: c.name, slug: c.slug, sourceMode: "MANUAL", status: "published", createdAt: now, updatedAt: now, seedSource: "demo",
      });
      collIds[c.slug] = id;
      
      // Link products
      for (const [idx, pId] of c.keys.entries()) {
        await ctx.db.insert("collectionProducts", { collectionId: id, productId: pId, sortOrder: idx, addedAt: now });
      }
    }

    // 7. Seed Banners
    const banners = [
      { title: "Wedding Season", slug: "wedding", img: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80" },
      { title: "Monsoon Edit", slug: "monsoon", img: "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=800&q=80" },
      { title: "Fresh Arrivals", slug: "fresh", img: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80" },
      { title: "Weekend Looks", slug: "weekend", img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80" }
    ];

    const bannerIds: Record<string, Id<"banners">> = {};
    for (const [idx, b] of banners.entries()) {
      const id = await ctx.db.insert("banners", {
        title: b.title,
        subtitle: "",
        desktopImageUrl: b.img,
        mobileImageUrl: b.img,
        ctaText: "Shop Now",
        ctaLink: `/experiences/${b.slug}`,
        active: true,
        sortOrder: idx,
        createdAt: now,
      });
      bannerIds[b.title] = id;
    }

    // 8. Seed Editorial Experiences
    const experiencesData = [
      { name: "Homepage", slug: "homepage" },
      { name: "Weekend Edit", slug: "weekend-edit" },
      { name: "Wedding Season", slug: "wedding-season" },
      { name: "Office Dressing", slug: "office-dressing" }
    ];

    const expIds: Record<string, Id<"experiences">> = {};
    for (const exp of experiencesData) {
      const id = await ctx.db.insert("experiences", {
        name: exp.name, slug: exp.slug, status: "published", createdAt: now, updatedAt: now,
      });
      expIds[exp.slug] = id;
    }

    // 9. Wire Homepage Experience Blocks
    // Hero Banner → Categories → Fresh on Hive → Editorial Banner → Premium Picks → Editorial Banner → Office Wear → Trust Strip
    const hpId = expIds["homepage"]!;
    
    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "hero_1", blockType: "hero", renderer: "largeCards",
      config: { bannerId: bannerIds["Wedding Season"] }, sortOrder: 1, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "cat_1", title: "Shop by Category", blockType: "category", renderer: "occasionGrid",
      config: {}, sortOrder: 2, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "coll_1", title: "Fresh on Hive", blockType: "collection", renderer: "productCarousel",
      config: { collectionId: collIds["fresh-on-hive"], maxProducts: 12 }, sortOrder: 3, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "banner_1", blockType: "banner", renderer: "largeCards",
      config: { bannerId: bannerIds["Fresh Arrivals"] }, sortOrder: 4, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "coll_2", title: "Premium Picks", blockType: "collection", renderer: "productCarousel",
      config: { collectionId: collIds["premium-picks"], maxProducts: 12 }, sortOrder: 5, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "banner_2", blockType: "banner", renderer: "largeCards",
      config: { bannerId: bannerIds["Weekend Looks"] }, sortOrder: 6, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "coll_3", title: "Office Wear", blockType: "collection", renderer: "productCarousel",
      config: { collectionId: collIds["office-wear"], maxProducts: 12 }, sortOrder: 7, status: "published",
    });

    await ctx.db.insert("experienceBlocks", {
      experienceId: hpId, blockKey: "trust_1", blockType: "trust", renderer: "largeCards",
      config: {}, sortOrder: 8, status: "published",
    });

    return {
      success: true,
      seededBoutiques: boutiquesData.length,
      seededProducts: globalIndex,
      seededCollections: collectionData.length,
      seededExperiences: experiencesData.length,
    };
  },
});

export const migrateProductPrices = mutation({
  args: {},
  handler: async (ctx) => {
    return "Not implemented";
  }
});
