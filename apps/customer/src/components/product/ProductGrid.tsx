"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ProductCardData } from "@/lib/mockProducts";
import { ProductCard } from "./ProductCard";
import { ProductGridSkeleton } from "./ProductGridSkeleton";
import { Button } from "@hive/ui";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useLocation } from "@/context/LocationContext";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { QuickViewModal } from "./QuickViewModal";

const NEARBY_LIVE_LOCATIONS = [
  { name: "Edappally", latitude: 10.0261, longitude: 76.3088, postcode: "682024", locality: "Edappally", city: "Ernakulam", state: "Kerala", country: "India" },
  { name: "Kakkanad", latitude: 10.0159, longitude: 76.3419, postcode: "682030", locality: "Kakkanad", city: "Ernakulam", state: "Kerala", country: "India" },
  { name: "Kaloor", latitude: 9.9986, longitude: 76.2999, postcode: "682017", locality: "Kaloor", city: "Ernakulam", state: "Kerala", country: "India" },
  { name: "Vytilla", latitude: 9.9704, longitude: 76.3197, postcode: "682019", locality: "Vytilla", city: "Ernakulam", state: "Kerala", country: "India" }
];

export interface ProductGridProps {
  products: ProductCardData[];
  selectedOccasion: string;
  onResetFilter?: () => void;
  isLoading?: boolean;
  /** When provided, renders a "View All" link in the grid header */
  viewAllHref?: string;
}

const occasionLabels: Record<string, string> = {
  all: "All Collections",
  wedding: "Wedding Guest Edit",
  festival: "Festive Edit",
  workwear: "Workwear Edit",
  party: "Party Night Edit",
  casual: "Casual Day Edit",
  date: "Date Night Edit",
  ethnic: "Ethnic Edit",
  coords: "Co-ords Edit",
};

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  selectedOccasion,
  onResetFilter,
  isLoading = false,
  viewAllHref,
}) => {
  const { isServiceable, locality, city, stateName, latitude, longitude, updateLocationDetails } = useLocation();
  const requestService = useMutation(api.serviceability.requestService);
  const [requestState, setRequestState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [quickViewModal, setQuickViewModal] = useState<{ open: boolean, productId: string | null }>({ open: false, productId: null });

  const handleRequestHive = async () => {
    setRequestState("loading");
    try {
      const activeLocality = locality || city || "your area";
      const activeState = stateName || "Kerala";
      const res = await requestService({
        city: activeLocality,
        state: activeState,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
      });
      if (res.success || res.reason === "Already requested") {
        setRequestState("success");
      } else {
        setRequestState("error");
      }
    } catch (err) {
      console.error("Failed to request Hive:", err);
      setRequestState("error");
    }
  };
  const [priceFilter, setPriceFilter] = useState<"all" | "under1000" | "under2500" | "above2500" | "above5000">("all");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "today">("all");
  const [sortOption, setSortOption] = useState<"featured" | "priceAsc" | "priceDesc" | "ratingDesc">("featured");

  // Memoized product filtering and sorting
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedOccasion !== "all") {
      result = result.filter((p) => p.occasion === selectedOccasion);
    }

    if (priceFilter === "under1000") {
      result = result.filter((p) => p.price <= 100000);
    } else if (priceFilter === "under2500") {
      result = result.filter((p) => p.price <= 250000);
    } else if (priceFilter === "above2500") {
      result = result.filter((p) => p.price > 250000);
    }

    if (deliveryFilter === "today") {
      result = result.filter((p) => p.sameDayDelivery);
    }

    result = [...result];
    if (sortOption === "priceAsc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortOption === "priceDesc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortOption === "ratingDesc") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return result;
  }, [products, selectedOccasion, priceFilter, deliveryFilter, sortOption]);

  const collectionTitle = occasionLabels[selectedOccasion] || "Boutique Collection";

  if (isLoading) {
    return (
      <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-8 py-8 flex flex-col gap-6">
        <div className="flex justify-between items-baseline border-b border-hive-border/40 pb-4">
          <div className="h-6 w-48 bg-slate-200 animate-pulse rounded-full" />
          <div className="h-4 w-24 bg-slate-150 animate-pulse rounded-full" />
        </div>
        <ProductGridSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-8 py-8 flex flex-col gap-6">
      
      {/* Dynamic Keyframe Animation Style Tag */}
      <style>{`
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-card-entrance {
          animation: cardEntrance 0.5s cubic-bezier(0.215, 0.610, 0.355, 1) forwards;
          opacity: 0; /* Pre-animation hidden state */
        }
      `}</style>

      {/* Grid Header */}
      <div className="flex justify-between items-baseline border-b border-hive-border/40 pb-4">
        <h2 className="text-xl md:text-2xl font-extrabold font-sans text-hive-dark transition-all duration-300">
          {collectionTitle}
        </h2>
        <div className="flex items-center gap-4">
          {filteredProducts.length > 0 ? (
            <span className="text-xs md:text-sm font-semibold text-hive-text-muted">
              {filteredProducts.length} {filteredProducts.length === 1 ? "Product" : "Products"}
            </span>
          ) : (
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50/50 border border-amber-200/30 px-2.5 py-1 rounded-lg">
              {isServiceable ? "Coming to Your Area" : "Launching Soon"}
            </span>
          )}
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-hive-amber hover:text-hive-gold transition-colors group"
            >
              View All
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>



      {/* Product Grid / Empty State Handler */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {filteredProducts.map((product, index) => (
            <div
              key={`${selectedOccasion}-${product.id}`}
              className="animate-card-entrance"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <ProductCard 
                product={product} 
                onQuickView={(id) => setQuickViewModal({ open: true, productId: id })} 
              />
            </div>
          ))}
        </div>
      ) : (
        /* Elegant Empty State */
        !isServiceable ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 sm:px-12 border border-stone-200 rounded-3xl bg-white text-center max-w-2xl mx-auto w-full animate-card-entrance shadow-2xs">
            <span className="text-2xl mb-3 select-none">📍</span>
            <h3 className="text-xl md:text-2xl font-serif font-bold text-stone-900">
              Launching Soon in {locality || city || "your area"}
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-2 max-w-md leading-relaxed font-normal">
              We&apos;re currently onboarding boutiques, brands and fashion partners for your area.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3 w-full max-w-sm">
              <button
                onClick={handleRequestHive}
                disabled={requestState === "loading" || requestState === "success"}
                className={`w-full py-3.5 px-6 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-300 shadow-sm border ${
                  requestState === "success"
                    ? "bg-green-50 text-green-800 border-green-200 cursor-default"
                    : requestState === "loading"
                    ? "bg-amber-100 text-amber-800 border-amber-200 cursor-wait"
                    : "bg-stone-950 text-white border-stone-950 hover:bg-stone-900 active:scale-[0.98] cursor-pointer"
                }`}
              >
                {requestState === "success"
                  ? `✓ Requested for ${locality || city || "your area"}`
                  : requestState === "loading"
                  ? "Submitting request..."
                  : requestState === "error"
                  ? "Retry Request Hive in My Area"
                  : "Request Hive in My Area"}
              </button>
              <button
                onClick={() => {
                  const target = document.getElementById("nearby-live-regions");
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="text-xs text-hive-amber hover:text-hive-gold font-extrabold uppercase tracking-wider transition-colors pt-1 cursor-pointer"
              >
                Discover Nearby Style Boards
              </button>
            </div>

            {/* Coverage Map Status Block */}
            <div id="nearby-live-regions" className="mt-10 pt-8 border-t border-hive-border/60 w-full select-none">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#111827] mb-4">
                Hive Coverage Status
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left max-w-md mx-auto mb-6 bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                <div>
                  <span className="text-[10px] font-extrabold text-green-600 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Currently Serving
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-600 font-semibold">
                    <li className="flex items-center gap-1.5">✓ Edappally</li>
                    <li className="flex items-center gap-1.5">✓ Kakkanad</li>
                    <li className="flex items-center gap-1.5">✓ Kaloor</li>
                    <li className="flex items-center gap-1.5">✓ Vytilla</li>
                  </ul>
                </div>
                <div className="border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                  <span className="text-[10px] font-extrabold text-amber-700/80 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Launching Soon
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-500 font-medium">
                    <li className="flex items-center gap-1.5">• Puthenvelikkara</li>
                    <li className="flex items-center gap-1.5">• Angamaly</li>
                    <li className="flex items-center gap-1.5">• Perumbavoor</li>
                  </ul>
                </div>
              </div>

              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-3">
                Switch to a Live Region
              </span>
              <div className="flex flex-wrap gap-2 justify-center">
                {NEARBY_LIVE_LOCATIONS.map((loc) => (
                  <button
                    key={loc.name}
                    onClick={() => updateLocationDetails({
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                      locality: loc.locality,
                      city: loc.city,
                      state: loc.state,
                      country: loc.country,
                      postcode: loc.postcode
                    })}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:border-hive-gold hover:bg-hive-comb/10 text-xs font-bold text-hive-dark transition-all duration-200 shadow-sm cursor-pointer active:scale-95"
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 border border-stone-200 rounded-3xl bg-white text-center max-w-2xl mx-auto w-full animate-card-entrance shadow-2xs select-none">
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 mb-3.5">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold font-serif text-stone-900">
              Pieces Arriving Soon
            </h3>
            <p className="text-xs text-stone-500 mt-1.5 max-w-md leading-relaxed font-normal">
              New styles are arriving soon from local brands and stores in {locality || city || "Kochi"}.
            </p>
            {onResetFilter ? (
              <button
                onClick={onResetFilter}
                className="mt-6 h-11 px-6 rounded-xl bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Clear Filters & Explore</span>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
              </button>
            ) : (
              <Link href="/products" className="mt-6">
                <button className="h-11 px-6 rounded-xl bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer">
                  <span>Explore All Styles</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                </button>
              </Link>
            )}
          </div>
        )
      )}
      
      {quickViewModal.open && quickViewModal.productId && (
        <QuickViewModal
          isOpen={quickViewModal.open}
          onClose={() => setQuickViewModal({ open: false, productId: null })}
          productSlug={quickViewModal.productId}
          initialProduct={products.find(p => p.slug === quickViewModal.productId)}
        />
      )}
    </div>
  );
};
