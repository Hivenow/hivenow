"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { ArrowRight, Loader2, Store, ShieldCheck, Timer, Compass, MapPin } from "lucide-react";
import { CollectionCard } from "@/components/catalog/CollectionCard";
import { useLocation } from "@/context/LocationContext";

const CURATED_LOOKBOOKS_PRESETS = [
  {
    id: "preset-kasavu",
    slug: "kasavu-heritage",
    title: "Kasavu & Festive Heritage",
    description: "Handloom kasavu sarees and golden border drapes.",
    imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
    productCount: 18,
    category: "festive",
    locality: "Panampilly Nagar",
    isFeatured: true,
  },
  {
    id: "preset-wedding",
    slug: "wedding-guest-luxe",
    title: "Wedding Guest & Bridal Luxe",
    description: "Opulent lehengas, embroidered anarkalis, and occasionwear.",
    imageUrl: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=800&q=80",
    productCount: 24,
    category: "wedding",
    locality: "Edappally",
  },
  {
    id: "preset-linen",
    slug: "monsoon-linen-drapes",
    title: "Monsoon Linen & Cottons",
    description: "Breathable pure linen kurtis and relaxed co-ord sets.",
    imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80",
    productCount: 15,
    category: "casual",
    locality: "Kakkanad",
  },
  {
    id: "preset-evening",
    slug: "evening-glam-cocktails",
    title: "Evening Glam & Party Fits",
    description: "Contemporary silhouettes, satin slip dresses, and festive tops.",
    imageUrl: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80",
    productCount: 14,
    category: "evening",
    locality: "MG Road, Kochi",
  },
  {
    id: "preset-chikankari",
    slug: "handcrafted-chikankari",
    title: "Chikankari & Pastel Kurtis",
    description: "Delicate needlework, soft pastel hues, and airy fabrics.",
    imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80",
    productCount: 20,
    category: "casual",
    locality: "Fort Kochi",
  },
  {
    id: "preset-silk",
    slug: "pure-silk-handlooms",
    title: "Handloom Silks & Brocades",
    description: "Rich Kanchipuram and pure silk treasures.",
    imageUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80",
    productCount: 16,
    category: "wedding",
    locality: "Panampilly Nagar",
  },
];

const FALLBACK_IMAGES: Record<string, string> = {
  "todays-edit": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80",
  "fresh-on-hive": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80",
  "trending-in-kochi": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
  "going-out-today": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80",
  "wedding-season": "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=800&q=80",
  "quiet-luxury": "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80",
  "linen-love": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80",
};

const CATEGORY_TABS = [
  { id: "all", label: "All Edits" },
  { id: "festive", label: "Festive & Kasavu" },
  { id: "wedding", label: "Wedding Guest" },
  { id: "evening", label: "Party & Evening" },
  { id: "casual", label: "Everyday Linen" },
];

export function CollectionsIndexClient() {
  const rawCollections = useQuery(api.customerHome.getAllCollections);
  const { locality, city } = useLocation();
  const [activeCategory, setActiveCategory] = useState("all");

  const currentArea = locality || city || "Kochi";

  const allLookbooks = useMemo(() => {
    if (!rawCollections) return [];

    const dbMapped = rawCollections.map((c: any) => ({
      id: c._id,
      slug: c.slug,
      title: c.name,
      description: c.description || `Hand-picked styles from stores near ${currentArea}`,
      imageUrl: c.coverImage || FALLBACK_IMAGES[c.slug] || CURATED_LOOKBOOKS_PRESETS[0]?.imageUrl,
      productCount: typeof c.productCount === "number" && c.productCount > 0 ? c.productCount : 12,
      category: c.slug.includes("wedding") ? "wedding" : c.slug.includes("trending") || c.slug.includes("todays") ? "festive" : "all",
      locality: `${currentArea} Stores`,
      isFeatured: c.slug === "todays-edit" || c.slug === "trending-in-kochi",
    }));

    const existingSlugs = new Set(dbMapped.map((c: any) => c.slug));
    const supplemental = CURATED_LOOKBOOKS_PRESETS.filter((p) => !existingSlugs.has(p.slug));

    return [...dbMapped, ...supplemental];
  }, [rawCollections, currentArea]);

  const filteredLookbooks = useMemo(() => {
    if (activeCategory === "all") return allLookbooks;
    return allLookbooks.filter((c: any) => c.category === activeCategory || c.category === "all");
  }, [allLookbooks, activeCategory]);

  const featuredSpotlight = useMemo(() => {
    return allLookbooks.find((c: any) => c.isFeatured) || allLookbooks[0];
  }, [allLookbooks]);

  const remainingLookbooks = useMemo(() => {
    if (!featuredSpotlight) return filteredLookbooks;
    if (activeCategory === "all") {
      return filteredLookbooks.filter((c: any) => c.id !== featuredSpotlight.id);
    }
    return filteredLookbooks;
  }, [filteredLookbooks, featuredSpotlight, activeCategory]);

  if (rawCollections === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-stone-900">
        <Loader2 className="w-6 h-6 text-amber-600/80 dark:text-amber-400 animate-spin" strokeWidth={1.75} />
        <p className="font-serif italic text-sm text-stone-500 animate-pulse">
          Loading collections near you...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full bg-hive-cream min-h-screen pb-12">
      {/* ── Compact Hyperlocal Header ───────────────────────────────── */}
      <div className="w-full bg-white border-b border-stone-200/70 pt-5 pb-4 px-4 sm:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-3 text-left">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 uppercase tracking-widest mb-0.5">
                <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Delivering in {currentArea}</span>
                <span className="text-stone-300 select-none">•</span>
                <span className="text-stone-500 font-medium">90 Mins</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-950 tracking-tight">
                Featured Collections
              </h1>
            </div>

            <Link
              href="/products"
              className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-stone-950 transition-colors"
            >
              <span>Explore All Products</span>
              <ArrowRight className="w-3 h-3 text-stone-500" />
            </Link>
          </div>

          {/* Quick Value Props Strip */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-2 border-t border-stone-100 text-[10.5px] font-semibold text-stone-500">
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3 text-amber-600" />
              <span>90-Min Delivery</span>
            </div>
            <div className="flex items-center gap-1">
              <Store className="w-3 h-3 text-amber-600" />
              <span>Nearby Stores</span>
            </div>
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              <span>Verified Quality</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Lookbooks Content ──────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 w-full pt-5 space-y-6">
        
        {/* ── Lead Featured Lookbook Banner (Spotlight) ───────────────── */}
        {featuredSpotlight && activeCategory === "all" && (
          <div className="animate-in fade-in duration-500">
            <CollectionCard
              collection={featuredSpotlight}
              variant="featured"
            />
          </div>
        )}

        {/* ── Category Mood Filter Rail ───────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 scrollbar-none border-b border-stone-200/60">
          <div className="flex items-center gap-1.5 py-1">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeCategory === tab.id
                    ? "bg-stone-950 text-white shadow-xs"
                    : "bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[10.5px] font-bold text-stone-400 shrink-0 hidden sm:block">
            {filteredLookbooks.length} Lookbooks
          </span>
        </div>

        {/* ── Curated Lookbooks Grid ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {remainingLookbooks.map((lookbook: any, idx: number) => (
            <div
              key={lookbook.id}
              className="animate-in fade-in fill-mode-both"
              style={{ animationDelay: `${Math.min(idx * 50, 400)}ms` }}
            >
              <CollectionCard collection={lookbook} />
            </div>
          ))}
        </div>

        {/* ── Empty State Fallback ──────────────────────────────────── */}
        {remainingLookbooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2 bg-white rounded-2xl border border-stone-200/80 p-6 shadow-2xs">
            <Compass className="w-7 h-7 text-stone-400" />
            <h3 className="font-serif text-base font-bold text-stone-900">
              No lookbooks found in this category
            </h3>
            <p className="text-xs text-stone-500 max-w-xs">
              Select &quot;All Edits&quot; to view all fashion lookbooks near you.
            </p>
            <button
              onClick={() => setActiveCategory("all")}
              className="mt-1 px-4 py-1.5 rounded-full bg-stone-950 text-white text-xs font-bold hover:bg-stone-800 transition-colors"
            >
              View All Edits
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
