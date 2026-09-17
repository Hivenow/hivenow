// convex/routing.ts
// Hyperlocal routing calculation, OSRM fetching, 3-decimal caching (111m precision), 
// tiered launch delivery pricing, and dynamic cart-value subsidies.

import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { haversineKm } from "./lib/serviceability";

/**
 * Fetch Google Maps Distance Matrix
 */
async function fetchGoogleMapsDistance(
  startLat: number, startLng: number, endLat: number, endLng: number
): Promise<{ distanceKm: number, durationMin: number }> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_SERVER_KEY not configured.");
  }
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?destinations=${endLat},${endLng}&origins=${startLat},${startLng}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Maps API error: ${res.status}`);
  }
  const data = await res.json();
  if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
    const element = data.rows[0].elements[0];
    const distanceKm = element.distance.value / 1000;
    const durationMin = element.duration.value / 60;
    return { distanceKm, durationMin };
  } else {
    throw new Error(`Google Maps Distance Matrix returned error: ${data.error_message || data.status}`);
  }
}

/**
 * Fetch a single cached distance record if it is valid (expiresAt > now).
 */
export const getCachedDistanceRecord = internalQuery({
  args: {
    startLat: v.number(),
    startLng: v.number(),
    endLat:   v.number(),
    endLng:   v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db
      .query("cachedRoadDistances")
      .withIndex("by_start_end", (q) =>
        q.eq("startLat", args.startLat)
         .eq("startLng", args.startLng)
         .eq("endLat",   args.endLat)
         .eq("endLng",   args.endLng)
      )
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .first();
  },
});

/**
 * Write a delivery quote to the checkoutQuotes table.
 */
export const storeQuote = internalMutation({
  args: {
    quoteId: v.string(),
    deliveryFee: v.number(),
    quotedAt: v.number(),
    expiresAt: v.number(),
    boutiqueId: v.string(),
    userLat: v.number(),
    userLng: v.number(),
    subtotal: v.number(),
  },
  handler: async (ctx, args) => {
    // Delete any existing quote for this ID
    const existing = await ctx.db
      .query("checkoutQuotes")
      .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", args.quoteId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("checkoutQuotes", {
      checkoutSessionId: args.quoteId,
      deliveryFee: args.deliveryFee,
      quotedAt: args.quotedAt,
      expiresAt: args.expiresAt,
      boutiqueId: args.boutiqueId,
      userLat: args.userLat,
      userLng: args.userLng,
      subtotal: args.subtotal,
    });
  }
});

/**
 * Write or update a road distance record in the cache table with a 7-day TTL.
 */
export const cacheDistance = internalMutation({
  args: {
    startLat:    v.number(),
    startLng:    v.number(),
    endLat:      v.number(),
    endLng:      v.number(),
    distanceKm:  v.number(),
    durationMin: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 3600 * 1000; // 7 days TTL

    const existing = await ctx.db
      .query("cachedRoadDistances")
      .withIndex("by_start_end", (q) =>
        q.eq("startLat", args.startLat)
         .eq("startLng", args.startLng)
         .eq("endLat",   args.endLat)
         .eq("endLng",   args.endLng)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        distanceKm:  args.distanceKm,
        durationMin: args.durationMin,
        createdAt:   now,
        expiresAt,
      });
    } else {
      await ctx.db.insert("cachedRoadDistances", {
        startLat:    args.startLat,
        startLng:    args.startLng,
        endLat:      args.endLat,
        endLng:      args.endLng,
        distanceKm:  args.distanceKm,
        durationMin: args.durationMin,
        createdAt:   now,
        expiresAt,
      });
    }
  },
});

/**
 * Convex Action to resolve road distance and duration via OSRM for top 20 candidate boutiques.
 * Throttles live OSRM calls to visible range.
 */
export const resolveRoadDistancesAction = action({
  args: {
    userLat: v.number(),
    userLng: v.number(),
  },
  handler: async (ctx, args): Promise<any[]> => {
    // 1. Fetch approved boutiques
    const boutiques = await ctx.runQuery(api.boutiques.getApprovedBoutiques);
    if (!boutiques || boutiques.length === 0) return [];

    // 2. Calculate Haversine distance, filter to serviceable threshold, and sort
    const candidates = boutiques
      .map((b: any) => {
        const bLat = b.latitude ?? b.addressDetails?.lat;
        const bLng = b.longitude ?? b.addressDetails?.lng;
        if (bLat === undefined || bLng === undefined) return null;
        
        const haversineDist = haversineKm(args.userLat, args.userLng, bLat, bLng);
        return { boutique: b, haversineDist, bLat, bLng };
      })
      .filter(Boolean) as Array<{ boutique: any; haversineDist: number; bLat: number; bLng: number }>;

    // Sort by straight-line distance, limit routing calls to top 20 candidates
    candidates.sort((a, b) => a.haversineDist - b.haversineDist);
    const top20 = candidates.slice(0, 20);

    // Round coordinates to 3 decimals (approx. 111m grid precision)
    const startLat = Math.round(args.userLat * 1000) / 1000;
    const startLng = Math.round(args.userLng * 1000) / 1000;

    const results: any[] = [];

    for (const cand of top20) {
      const endLat = cand.bLat;
      const endLng = cand.bLng;

      // Check cache first
      const cached: any = await ctx.runQuery(internal.routing.getCachedDistanceRecord as any, {
        startLat,
        startLng,
        endLat,
        endLng,
      });

      if (cached) {
        results.push({
          boutiqueId:  cand.boutique._id,
          distanceKm:  cached.distanceKm,
          durationMin: cached.durationMin,
          source:      "cache",
        });
      } else {
        // Cache miss: Call Google Maps Distance Matrix
        try {
          const gmaps = await fetchGoogleMapsDistance(startLat, startLng, endLat, endLng);
          
          await ctx.runMutation(internal.routing.cacheDistance as any, {
            startLat,
            startLng,
            endLat,
            endLng,
            distanceKm: gmaps.distanceKm,
            durationMin: gmaps.durationMin,
          });

          results.push({
            boutiqueId:  cand.boutique._id,
            distanceKm: gmaps.distanceKm,
            durationMin: gmaps.durationMin,
            source:      "google_maps",
          });
        } catch (err) {
          console.error(`[Google Maps routing error] for boutique ${cand.boutique.boutiqueName}:`, err);
          // Graceful fallback to Haversine
          const distanceKm = cand.haversineDist;
          const durationMin = (distanceKm / 25) * 60; // 25 km/h driving speed approximation

          results.push({
            boutiqueId:  cand.boutique._id,
            distanceKm,
            durationMin,
            source:      "fallback_haversine",
          });
        }
      }
    }

    return results;
  },
});

export const getBoutiqueRoutingData = internalQuery({
  args: { boutiqueId: v.id("boutiques") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.boutiqueId);
    if (!b) return null;
    return {
      latitude: b.latitude,
      longitude: b.longitude,
      deliveryRadiusKm: b.deliveryRadiusKm,
      freeDeliveryThreshold: b.freeDeliveryThreshold,
      averagePrepTime: b.averagePrepTime,
      addressDetails: b.addressDetails,
    };
  }
});

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Shared logic helper to calculate the delivery quote.
 */
export async function calculateDeliveryQuoteAction(
  ctx: any,
  args: {
    userLat:    number;
    userLng:    number;
    userPincode?: string;
    boutiqueId: any;
    subtotal:   number;
  }
): Promise<any> {
  const boutique: any = await ctx.runQuery(internal.routing.getBoutiqueRoutingData, { boutiqueId: args.boutiqueId });
  if (!boutique) {
    return { serviceable: false, reason: "Boutique not found", quotedAt: Date.now() };
  }

  // 1. Try Live Porter quoting if credentials exist
  const hasPorterKeys = !!(process.env.PORTER_API_URL && process.env.PORTER_API_KEY);
  if (hasPorterKeys) {
    const porterStartMs = Date.now();
    try {
      let customerName = "Customer";
      let customerPhone = "9999999999";
      try {
        const user = await ctx.runQuery(api.users.getMe);
        if (user) {
          if (user.phone) customerPhone = user.phone;
          if (user.email) customerName = user.email.split("@")[0];
        }
      } catch (userErr) {
        console.warn("[PORTER] Could not fetch user details for quote:", userErr);
      }

      console.log("[PORTER] Quote requested →", boutique.boutiqueName || boutique.name);

      // Invoke Porter getQuote with a 3000ms timeout (proxy relays to Porter UAT)
      const porterQuotePromise = ctx.runAction(internal.lib.porter.getQuote, {
        pickup_lat: boutique.latitude,
        pickup_lng: boutique.longitude,
        drop_lat: args.userLat,
        drop_lng: args.userLng,
        customer_name: customerName,
        customer_phone: customerPhone,
      });

      const quoteResult = (await withTimeout(
        porterQuotePromise,
        3000,
        "Porter quote request timed out after 3000ms"
      )) as any;

      const porterElapsedMs = Date.now() - porterStartMs;

      const vehicles = quoteResult?.vehicles || quoteResult?.Vehicles;
      if (vehicles && vehicles.length > 0) {
        // Filter specifically for "2 Wheeler" vehicle type, fallback to first available
        const vehicle = vehicles.find((v: any) => v.type?.toLowerCase().includes("2 wheeler")) || vehicles[0];
        const fareObj = vehicle?.fare;
        const porterFeePaise = fareObj?.minor_amount ?? fareObj?.minorAmount;

        if (typeof porterFeePaise === "number") {
          const thresholdRupees = (boutique.freeDeliveryThreshold && boutique.freeDeliveryThreshold >= 10000)
            ? boutique.freeDeliveryThreshold
            : 10000;
          
          let finalFeePaise = porterFeePaise;
          if (args.subtotal >= thresholdRupees) {
            finalFeePaise = 0;
          }

          const distanceKm = haversineKm(args.userLat, args.userLng, boutique.latitude, boutique.longitude);
          const durationMin = (distanceKm / 25) * 60; // 25 km/h driving speed approximation

          console.log(`[PORTER] Response received in ${porterElapsedMs}ms | Using ${vehicle.type} | Fare ₹${(porterFeePaise / 100).toFixed(2)} | Final ₹${(finalFeePaise / 100).toFixed(2)}`);

          return {
            serviceable: true,
            distanceKm,
            durationMin,
            etaMinutes: Math.round(durationMin + (boutique.averagePrepTime ?? 30)),
            customerPaidFee: finalFeePaise,
            estimatedCourierCost: porterFeePaise,
            courierName: "Porter (Live)",
            quotedAt: Date.now(),
            isCached: false,
          };
        }
      }

      // Porter responded but no usable fare
      console.warn(`[PORTER] Response received in ${porterElapsedMs}ms but no usable 2 Wheeler fare. Vehicles:`, JSON.stringify(vehicles?.map((v: any) => v.type)));
    } catch (porterErr) {
      const porterElapsedMs = Date.now() - porterStartMs;
      console.error(`[PORTER] Failed after ${porterElapsedMs}ms — using fallback pricing.`, porterErr);
    }
  }

  // Bypass all serviceability/pincode checks in development/test deployments to avoid testing friction
  if (process.env.BYPASS_GATING === "true" || process.env.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
    console.warn(`[routing] Bypassing delivery serviceability checks in development for boutique: ${boutique.boutiqueName || boutique.name}`);
    return {
      serviceable: true,
      distanceKm: 5.5,
      durationMin: 30,
      etaMinutes: 45,
      customerPaidFee: 9900, // Flat ₹99 in Paise
      estimatedCourierCost: 9000,
      courierName: "Dev Courier (Bypassed)",
      quotedAt: Date.now(),
    };
  }

  const boutiqueLat = boutique.latitude;
  const boutiqueLng = boutique.longitude;

  const startLat = Math.round(args.userLat * 1000) / 1000;
  const startLng = Math.round(args.userLng * 1000) / 1000;

  // Try fetching cached road distance first
  let cached: any = await ctx.runQuery(internal.routing.getCachedDistanceRecord as any, {
    startLat, startLng, endLat: boutiqueLat, endLng: boutiqueLng,
  });

  let distanceKm = 0;
  let durationMin = 0;

  if (cached) {
    distanceKm = cached.distanceKm;
    durationMin = cached.durationMin;
  } else {
    try {
      const gmaps = await fetchGoogleMapsDistance(startLat, startLng, boutiqueLat, boutiqueLng);
      distanceKm = gmaps.distanceKm;
      durationMin = gmaps.durationMin;
      await ctx.runMutation(internal.routing.cacheDistance as any, {
        startLat, startLng, endLat: boutiqueLat, endLng: boutiqueLng,
        distanceKm, durationMin,
      });
    } catch(err) {
      console.error("[calculateDeliveryQuote] Google Maps failed, falling back to Haversine", err);
      distanceKm = haversineKm(args.userLat, args.userLng, boutiqueLat, boutiqueLng);
      durationMin = (distanceKm / 25) * 60;
    }
  }

  // Enforce STRICT road distance limit as a fast pre-filter. 
  // We use Haversine distance here for the hard cutoff so that it perfectly matches the frontend address validation logic.
  const haversineDist = haversineKm(args.userLat, args.userLng, boutiqueLat, boutiqueLng);
  const effectiveRadius = boutique.deliveryRadiusKm ?? 15;
  if (haversineDist > effectiveRadius) {
    return {
      serviceable: false,
      reason: "Delivery address is outside our coverage area.",
      distanceKm,
      durationMin,
      quotedAt: Date.now(),
    };
  }

  // Strict reliance on internal hyperlocal pricing

  const subtotalRupees = args.subtotal; // args.subtotal is now passed in rupees
  
  let standardFee = 99;
  if (distanceKm <= 3) {
    standardFee = 39;
  } else if (distanceKm <= 6) {
    standardFee = 59;
  } else if (distanceKm <= 10) {
    standardFee = 79;
  }

  const thresholdRupees = (boutique.freeDeliveryThreshold && boutique.freeDeliveryThreshold >= 10000)
    ? boutique.freeDeliveryThreshold
    : 10000;
  let finalFeeRupees = standardFee;
  if (subtotalRupees >= thresholdRupees) {
    finalFeeRupees = 0;
  }

  const customerPaidFeePaise = Math.round(finalFeeRupees * 100);

  return {
    serviceable: true,
    distanceKm,
    durationMin,
    etaMinutes: Math.round(durationMin + (boutique.averagePrepTime ?? 30)),
    customerPaidFee: customerPaidFeePaise,
    estimatedCourierCost: customerPaidFeePaise,
    quotedAt: Date.now(),
    isCached: false,
  };
}

export const getDeliveryQuoteAction = action({
  args: {
    userLat:    v.number(),
    userLng:    v.number(),
    userPincode: v.optional(v.string()),
    boutiqueId: v.id("boutiques"),
    subtotal:   v.number(),
    quoteId:    v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const result = await calculateDeliveryQuoteAction(ctx, args);
    
    if (args.quoteId && result && result.serviceable) {
      await ctx.runMutation(internal.routing.storeQuote, {
        quoteId: args.quoteId,
        deliveryFee: result.customerPaidFee / 100, // Convert paise to rupees
        quotedAt: result.quotedAt,
        expiresAt: result.quotedAt + 15 * 60 * 1000, // 15 mins expiry
        boutiqueId: String(args.boutiqueId),
        userLat: args.userLat,
        userLng: args.userLng,
        subtotal: args.subtotal,
      });
    }
    return result;
  }
});
