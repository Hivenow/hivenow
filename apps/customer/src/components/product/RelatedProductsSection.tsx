"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { ProductCardData } from "@/lib/mockProducts";
import { calculateDisplayPricing } from "@/lib/pricing";
import { toQueryCoords } from "@/lib/distance";
import { ProductDetail } from "@/lib/mockProductDetails";
import { getRelatedProducts } from "@/data/related-products";
import { useLocation } from "@/context/LocationContext";

// Helper to deduce occasion from product tags/description
function getProductOccasion(product: any): string {
  const catName = (product.categoryName || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();
  
  if (name.includes("wedding") || desc.includes("wedding") || name.includes("lehenga") || catName.includes("lehengas")) {
    return "wedding";
  }
  if (name.includes("festival") || desc.includes("festival") || name.includes("saree") || catName.includes("sarees")) {
    return "festival";
  }
  if (name.includes("co-ord") || name.includes("coord") || catName.includes("coords") || catName.includes("co-ord")) {
    return "coords";
  }
  if (name.includes("kurta") || name.includes("kurti") || catName.includes("kurtis")) {
    return "ethnic";
  }
  if (name.includes("party") || desc.includes("party")) {
    return "party";
  }
  if (name.includes("date") || desc.includes("date") || name.includes("dress") || catName.includes("dresses")) {
    return "date";
  }
  if (name.includes("work") || name.includes("office")) {
    return "workwear";
  }
  return "casual";
}

// Helper to map DB product to ProductCardData interface
function mapDbProduct(p: any): ProductCardData & { sizes: string[]; stockBySize: Record<string, number>; boutiqueId?: string; boutique?: any } {
  const { price, compareAtPrice, discountPercent } = calculateDisplayPricing(p);

  return {
    id: p._id,
    slug: p.slug,
    name: p.name,
    boutiqueName: p.boutiqueName || "Unknown Store",
    boutiqueId: p.boutiqueId,
    boutique: p.boutique,
    imageUrl: p.imageUrl || (p.imageUrls?.[0]) || "",
    price,
    compareAtPrice,
    discountPercent,
    rating: p.rating || p.averageRating || undefined,
    reviewCount: p.reviewCount || undefined,
    occasion: getProductOccasion(p),
    isVerifiedBoutique: p.boutique?.verified || false,
    isNewArrival: Date.now() - p.createdAt < 7 * 24 * 60 * 60 * 1000,
    isTrending: p.featured,
    isBestSeller: p.featured,
    sameDayDelivery: p.sameDayEligible,
    videoAvailable: p.images?.length > 1,
    favorite: false,
    sizes: p.sizes || ["Free"],
    stockBySize: p.stockBySize || { Free: 5 },
    estimatedDistanceKm: p.estimatedDistanceKm,
    estimatedDurationMin: p.estimatedDurationMin,
    estimatedEtaMinutes: p.estimatedEtaMinutes,
    hiveScore: p.hiveScore,
    deliveryLabel: p.deliveryLabel,
  };
}

interface RelatedProductsSectionProps {
  product: ProductDetail;
}

/**
 * How far ahead of the viewport the catalog query starts. Enough that the data
 * is normally in hand by the time the shopper scrolls here, without turning
 * this into a prefetch-everything scheme.
 */
const PRELOAD_ROOT_MARGIN = "600px";

export const RelatedProductsSection: React.FC<RelatedProductsSectionProps> = ({ product }) => {
  const { latitude, longitude } = useLocation();

  // This section sits below the whole product detail block, so it is normally
  // off-screen at first paint — yet its query (the full active catalog, ~175
  // enriched products) used to fire the moment the PDP hydrated, competing with
  // everything above it. Gate it on the section approaching the viewport.
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = React.useState(false);

  React.useEffect(() => {
    if (isNearViewport) return;

    const el = sentinelRef.current;
    if (!el) return;

    // Without IntersectionObserver, fall back to the previous behaviour of
    // loading straight away rather than never showing the section.
    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_ROOT_MARGIN }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isNearViewport]);

  const dbProducts = useQuery(
    api.products.getActiveProducts,
    isNearViewport ? toQueryCoords(latitude, longitude) : "skip"
  );

  // Retrieve scored recommendations from our heuristic logic
  const products = React.useMemo(() => {
    return (dbProducts || []).map(mapDbProduct);
  }, [dbProducts]);

  const recommendations = React.useMemo(() => {
    const btqName = (product as any).boutiqueName || product.boutique?.name;
    return products
      .filter((p: any) => p.boutiqueName === btqName && p.slug !== product.slug)
      .slice(0, 4);
  }, [product, products]);

  // Before the query has run — and in the pre-existing "nothing to recommend"
  // case, which used to return null — render a zero-height sentinel instead of
  // nothing at all. The observer above needs an element in the document to
  // watch, and an empty div occupies no space, so this is visually identical to
  // the previous `return null`.
  if (dbProducts === undefined || recommendations.length === 0) {
    return <div ref={sentinelRef} aria-hidden="true" />;
  }

  return (
    <section 
      aria-labelledby="related-products-title" 
      className="w-full border-t border-stone-200/70 pt-12 mt-12 text-left"
    >
      {/* Header */}
      <div className="flex flex-col gap-1 mb-6">
        <h2 
          id="related-products-title" 
          className="text-xl md:text-2xl font-serif font-bold text-stone-900"
        >
          Similar Styles
        </h2>
        <p className="text-xs text-stone-500 font-normal">
          More options in this category from local brands and stores
        </p>
      </div>

      {/* Grid: 4 columns desktop, 2 columns tablet, 1 column mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
        {recommendations.map((item: any) => (
          <div 
            key={item.id} 
            className="relative z-0 group outline-none rounded-2xl"
          >
            <ProductCard product={item} />
          </div>
        ))}
      </div>
    </section>
  );
};
