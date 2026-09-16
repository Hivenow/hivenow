"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useLocation } from "@/context/LocationContext";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGridSkeleton } from "@/components/product/ProductGridSkeleton";
import { Button } from "@hive/ui";
import { Search, AlertCircle, ShoppingBag, MapPin, ArrowRight, X } from "lucide-react";
import { ProductCardData } from "@/lib/mockProducts";
import { calculateDisplayPricing } from "@/lib/pricing";
import { toQueryCoords } from "@/lib/distance";
import { getAnonSessionId } from "@/lib/anonSession";

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
    boutiqueName: p.boutiqueName || "Unknown Boutique",
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

export default function SearchPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 bg-white">
          <Search className="w-8 h-8 animate-pulse text-amber-500" />
          <p className="text-sm text-stone-500 font-bold">Initializing search...</p>
        </div>
      }
    >
      <SearchContent />
    </React.Suspense>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";

  const { latitude, longitude, city, pincode } = useLocation();

  // Local state for debounced search typing
  const [searchTerm, setSearchTerm] = useState(q);
  // Option to browse anyway (skips location filtering)
  const [browseAnyway, setBrowseAnyway] = useState(false);

  // Sync state with URL parameter (e.g. search triggered from Navbar)
  useEffect(() => {
    setSearchTerm(q);
  }, [q]);

  // Debounce the url parameter update
  useEffect(() => {
    if (searchTerm === q) return;

    const handler = setTimeout(() => {
      if (searchTerm.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
      } else {
        router.push("/search");
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(handler);
  }, [searchTerm, q, router]);

  const searchProductsAction = useAction(api.products.searchProducts);
  const [searchResult, setSearchResult] = useState<{ products: any[]; totalMatchedCount: number; relatedOnly?: boolean } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const popularProductsData = useQuery(api.products.getMostLovedProducts, {
    ...(browseAnyway ? {} : toQueryCoords(latitude, longitude)),
    limit: 12,
  });

  useEffect(() => {
    if (!q) {
      setSearchResult(null);
      return;
    }

    setIsSearching(true);
    searchProductsAction({
      searchTerm: q,
      // Buckets the anonymous rate limit per browser — see lib/anonSession.ts.
      sessionId: getAnonSessionId(),
      ...(browseAnyway ? {} : toQueryCoords(latitude, longitude)),
    })
      .then((res) => {
        setSearchResult(res);
      })
      .catch((err) => {
        console.error("Search failed:", err);
        setSearchResult({ products: [], totalMatchedCount: 0 });
      })
      .finally(() => {
        setIsSearching(false);
      });
  }, [q, browseAnyway, latitude, longitude, searchProductsAction]);

  const isFallback = searchResult !== null && searchResult.products.length === 0;

  const isLoading = isSearching || (q && !searchResult) || (isFallback && !popularProductsData);

  const products = useMemo(() => {
    if (!searchResult) return [];
    if (searchResult.products.length === 0) {
      return (popularProductsData || []).map(mapDbProduct);
    }
    return searchResult.products.map(mapDbProduct);
  }, [searchResult, popularProductsData]);

  const hiddenCount = useMemo(() => {
    if (!searchResult) return 0;
    return searchResult.totalMatchedCount - searchResult.products.length;
  }, [searchResult]);

  const handleClear = () => {
    setSearchTerm("");
    router.push("/search");
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-stone-950 pb-20">
      
      {/* 1. Ultra-Compact 1-Line Header */}
      {q && (
        <div className="w-full border-b border-stone-200/80 dark:border-stone-800 bg-white/90 dark:bg-stone-950/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white capitalize truncate">
                {q}
              </h1>
              {!isLoading && products.length > 0 && (
                <span className="text-xs text-stone-400 font-normal">
                  ({products.length} {products.length === 1 ? "item" : "items"})
                </span>
              )}
            </div>

            <button
              onClick={handleClear}
              className="text-xs font-semibold text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Search Results section — zero excess whitespace */}
      <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-2.5 pb-8 flex-grow flex flex-col gap-3">
        
        {/* If no query, guide user to browse */}
        {!q ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-sm mx-auto w-full my-auto">
            <div className="p-3 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 mb-2.5">
              <Search className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-white">
              Search Collections & Styles
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
              Explore sarees, kurtis, bedsheets, men&apos;s wear, kids wear, and designer labels.
            </p>
            <Button
              variant="primary"
              onClick={() => router.push("/")}
              className="mt-4 text-xs py-2 px-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl"
            >
              Explore Home
            </Button>
          </div>
        ) : isLoading ? (
          // Loading Skeletons
          <div className="flex flex-col gap-3 pt-1">
            <ProductGridSkeleton />
          </div>
        ) : products.length > 0 ? (
          <>
            {/* Some but not all of the shopper's words matched — say so rather than imply exact results. */}
            {!isFallback && searchResult?.relatedOnly && (
              <div className="py-2.5 px-3.5 bg-stone-100 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 font-medium">
                No exact match for &ldquo;<strong>{q}</strong>&rdquo;. Showing related products:
              </div>
            )}

            {/* Subtle Fallback Notice if no exact matches */}
            {isFallback && (
              <div className="py-2.5 px-3.5 bg-stone-100 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 font-medium flex items-center justify-between">
                <span>No exact matches for &ldquo;<strong>{q}</strong>&rdquo;. Showing curated styles you may like:</span>
                <button
                  onClick={handleClear}
                  className="text-xs font-semibold text-stone-900 dark:text-white hover:underline ml-3 cursor-pointer shrink-0"
                >
                  Clear search
                </button>
              </div>
            )}

            {/* Location filter notice if deliverable radius excludes some */}
            {hiddenCount > 0 && !browseAnyway && (
              <div className="py-2 px-3.5 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 rounded-xl text-xs flex items-center justify-between gap-3">
                <span>{hiddenCount} items are outside your immediate delivery zone.</span>
                <button
                  onClick={() => setBrowseAnyway(true)}
                  className="text-xs font-bold text-stone-900 dark:text-white underline cursor-pointer shrink-0"
                >
                  Show all
                </button>
              </div>
            )}

            {/* Product Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4.5 pt-1">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} isRecommendation={isFallback} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto w-full">
            {/*
              When every match sits outside the delivery zone the search itself succeeded, so
              saying nothing matched names the wrong cause and hides the one action that helps.
              The notice above only renders alongside results; this branch needs its own.
            */}
            {hiddenCount > 0 && !browseAnyway ? (
              <>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {hiddenCount === 1
                    ? `The only match for this search is outside your delivery zone.`
                    : `All ${hiddenCount} matches for this search are outside your delivery zone.`}
                </p>
                <button
                  onClick={() => setBrowseAnyway(true)}
                  className="mt-4 text-xs font-bold text-stone-900 dark:text-white underline cursor-pointer"
                >
                  Show all
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-500">No products available for this search.</p>
                <button
                  onClick={handleClear}
                  className="mt-4 text-xs font-bold text-stone-900 underline cursor-pointer"
                >
                  Clear filter
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Embedded entrance styles */}
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
}
