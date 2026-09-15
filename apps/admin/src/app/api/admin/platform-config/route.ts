import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function verifyAdmin() {
  const { userId, getToken } = await auth();
  if (!userId) return null;

  try {
    // Ask Convex who the caller is using their own Clerk token, rather than looking a user up
    // by an id we pass in. A per-request client keeps one admin's token from leaking into
    // another request through the shared module-level client.
    const token = await getToken({ template: "convex" });
    if (!token) return null;
    const authedConvex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    authedConvex.setAuth(token);
    const user = await authedConvex.query(api.auth.getMe, {});
    if (user && user.role === "admin") {
      return user;
    }
  } catch (err) {
    console.error("Error verifying admin role:", err);
  }
  return null;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const settings = await convex.query(api.adminSettings.getPlatformSettings);
    
    // Sort tiers by min_price ascending
    const sortedTiers = settings.markupTiers
      ? [...settings.markupTiers].sort((a, b) => a.min_price - b.min_price)
      : [];

    return NextResponse.json({
      markupRate: (settings.markupRate ?? 0.15) * 100, // convert back to percentage
      platformFeeRate: (settings.platformFeeRate ?? 0.02) * 100, // convert back to percentage
      markupType: settings.markupType || "tiered",
      markupTiers: sortedTiers,
    });
  } catch (err: any) {
    console.error("GET platform-config error:", err);
    return NextResponse.json({ error: err.message || "Failed to retrieve configuration." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { markupRate, platformFeeRate, markupType, markupTiers } = body;

    // 1. Basic Type Validation
    if (typeof markupRate !== "number" || markupRate < 0 || markupRate > 100) {
      return NextResponse.json({ error: "Invalid platform markup rate percentage. Must be between 0 and 100." }, { status: 400 });
    }
    if (typeof platformFeeRate !== "number" || platformFeeRate < 0 || platformFeeRate > 100) {
      return NextResponse.json({ error: "Invalid platform fee rate percentage. Must be between 0 and 100." }, { status: 400 });
    }
    if (markupType !== "flat" && markupType !== "tiered") {
      return NextResponse.json({ error: "Invalid markup type. Must be 'flat' or 'tiered'." }, { status: 400 });
    }

    if (markupType === "tiered") {
      if (!Array.isArray(markupTiers) || markupTiers.length === 0) {
        return NextResponse.json({ error: "At least one price tier slab is required when markup type is tiered." }, { status: 400 });
      }

      // 2. Overlap & Continuity Validation
      const sorted = [...markupTiers].sort((a, b) => a.min_price - b.min_price);

      // Check first tier
      const first = sorted[0];
      if (first.min_price !== 0) {
        return NextResponse.json({ error: "The first price tier slab must start at ₹0." }, { status: 400 });
      }

      for (let i = 0; i < sorted.length; i++) {
        const tier = sorted[i];
        if (tier.min_price < 0 || tier.rate < 0 || tier.rate > 100) {
          return NextResponse.json({ error: `Tier ${i + 1}: Price values cannot be negative, and markup rate must be between 0% and 100%.` }, { status: 400 });
        }

        if (tier.max_price !== null && tier.max_price < tier.min_price) {
          return NextResponse.json({ error: `Tier ${i + 1}: Max Price cannot be less than Min Price.` }, { status: 400 });
        }

        if (i < sorted.length - 1) {
          if (tier.max_price === null) {
            return NextResponse.json({ error: `Tier ${i + 1}: Only the highest price tier can have an infinite Max Price.` }, { status: 400 });
          }
          const nextTier = sorted[i + 1];
          if (nextTier.min_price !== tier.max_price + 1) {
            return NextResponse.json({ error: `Price ranges must be continuous. Tier ${i + 2}'s Min Price must start exactly at ₹${tier.max_price + 1}.` }, { status: 400 });
          }
        } else {
          if (tier.max_price !== null) {
            return NextResponse.json({ error: "The highest price tier must have an infinite Max Price (empty)." }, { status: 400 });
          }
        }
      }
    }

    // Call Convex Mutation
    const clerkSecret = process.env.CLERK_SECRET_KEY || "";

    const result = await convex.mutation(api.adminSettings.updatePlatformSettingsFromApi, {
      secret: clerkSecret,
      markupRate: markupRate / 100,
      platformFeeRate: platformFeeRate / 100,
      markupType,
      markupTiers: markupType === "flat" ? [] : markupTiers.map((t: any) => ({
        min_price: t.min_price,
        max_price: t.max_price,
        rate: t.rate,
      })),
    });

    return NextResponse.json({ success: true, updatedProductsCount: result?.updatedProductsCount ?? 0 });
  } catch (err: any) {
    console.error("PUT platform-config error:", err);
    return NextResponse.json({ error: err.message || "Failed to update configuration." }, { status: 500 });
  }
}
