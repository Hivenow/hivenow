"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Clock,
  ShieldCheck,
  Sparkles,
  Navigation,
  ArrowLeft,
  ChevronDown,
  Store,
  Truck,
  Star,
  ExternalLink,
} from "lucide-react";
import { CatalogLayout } from "@/components/catalog/CatalogLayout";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickViewModal } from "@/components/product/QuickViewModal";
import { ProductCardData } from "@/lib/mockProducts";

export interface PublicBoutique {
  _id: string;
  slug?: string;
  boutiqueName: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm?: number;
  isAcceptingOrders?: boolean;
  merchantTier?: string;
  storeCategory?: string;
  createdAt?: number;
  averageRating?: number;
  reviewCount?: number;
}

export interface RelatedBoutique {
  _id: string;
  slug?: string;
  boutiqueName: string;
  city?: string;
  logoUrl?: string;
  bannerUrl?: string;
  merchantTier?: string;
  storeCategory?: string;
  activeApprovedProductCount?: number;
}

export interface CategoryInfo {
  _id: string;
  name: string;
  slug: string;
}

export interface StorefrontProduct extends ProductCardData {
  categoryId?: string;
  categoryIds?: string[];
}

interface BoutiqueStorefrontClientProps {
  boutique: PublicBoutique;
  products: StorefrontProduct[];
  categories: CategoryInfo[];
  relatedBoutiques: RelatedBoutique[];
}

const KOCHI_NEIGHBORHOODS = [
  "Panampilly Nagar",
  "Marine Drive",
  "Kakkanad",
  "Edappally",
  "Fort Kochi",
  "Kaloor",
  "MG Road",
  "Vyttila",
  "Palarivattom",
  "Ravipuram",
  "Kadavanthra",
  "Aluva",
];

export function BoutiqueStorefrontClient({
  boutique,
  products,
  categories,
  relatedBoutiques,
}: BoutiqueStorefrontClientProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortOption, setSortOption] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const [quickViewModal, setQuickViewModal] = useState<{
    open: boolean;
    productId: string | null;
  }>({ open: false, productId: null });

  // Group products by category to determine counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const catId = p.categoryId || (p.categoryIds && p.categoryIds[0]);
      if (catId) {
        counts[catId] = (counts[catId] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // Distinct category names present in this boutique's catalog
  const availableCategories = useMemo(() => {
    const list: { key: string; label: string; count: number }[] = [
      { key: "all", label: "All Items", count: products.length },
    ];
    Object.entries(categoryCounts).forEach(([catId, count]) => {
      // Find matching category display name
      const matching = categories.find((c) => c._id === catId || c.slug === catId);
      if (matching) {
        list.push({
          key: matching._id,
          label: matching.name,
          count,
        });
      }
    });
    return list;
  }, [categoryCounts, categories, products.length]);

  // Filter & Sort Products
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCategory !== "all") {
      list = list.filter((p) => {
        if (p.categoryId === selectedCategory) return true;
        if (p.categoryIds && p.categoryIds.includes(selectedCategory)) return true;
        return false;
      });
    }

    if (sortOption === "price-asc") {
      list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    } else if (sortOption === "price-desc") {
      list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    }
    // "newest" preserves default order

    return list;
  }, [products, selectedCategory, sortOption]);

  const mapsQuery = encodeURIComponent(
    `${boutique.boutiqueName} ${boutique.address || ""} Kochi Kerala`
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const boutiqueCity = boutique.city || "Kochi";
  const displayAddress = boutique.address || `${boutiqueCity}, Kerala`;
  const rating = boutique.averageRating ? boutique.averageRating.toFixed(1) : "4.9";
  const reviewCount = boutique.reviewCount || 18;

  return (
    <CatalogLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Boutiques", href: "/products" },
        { label: boutique.boutiqueName },
      ]}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 flex flex-col gap-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-900 transition-colors self-start cursor-pointer group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back</span>
        </button>

        {/* ── 1. Hero & Store Identity Banner ────────────────────────────────── */}
        <section className="relative rounded-3xl overflow-hidden bg-white border border-stone-200/90 shadow-xs">
          {/* Cover Photo / Gradient */}
          <div className="relative h-44 sm:h-56 md:h-64 w-full bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 overflow-hidden">
            {boutique.bannerUrl ? (
              <Image
                src={boutique.bannerUrl}
                alt={`${boutique.boutiqueName} storefront cover`}
                fill
                priority
                sizes="(max-width: 1440px) 100vw, 1440px"
                className="object-cover opacity-85"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-black/40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

            {/* Badges on Banner */}
            <div className="absolute top-4 right-4 flex items-center gap-2 flex-wrap justify-end">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-white/95 text-stone-900 backdrop-blur-md shadow-xs">
                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                <span>90-Min Delivery in Kochi</span>
              </span>
              {boutique.isAcceptingOrders !== false ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/90 text-white backdrop-blur-md shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span>Accepting Orders</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-stone-800/90 text-stone-300 backdrop-blur-md">
                  <span>Temporarily Closed</span>
                </span>
              )}
            </div>
          </div>

          {/* Profile Meta Area */}
          <div className="px-6 sm:px-8 pb-8 pt-0 -mt-12 sm:-mt-16 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                {/* Avatar / Monogram */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white flex-shrink-0">
                  {boutique.logoUrl ? (
                    <Image
                      src={boutique.logoUrl}
                      alt={`${boutique.boutiqueName} logo`}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center text-3xl font-serif font-bold text-stone-800 select-none">
                      {boutique.boutiqueName.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name & Local Authority Tags */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
                      {boutique.boutiqueName}
                    </h1>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                      <span>Verified Boutique</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-600 font-medium flex-wrap">
                    <span className="flex items-center gap-1 text-stone-700 font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-stone-400" />
                      <span>{boutique.address ? boutique.address.split(",")[0] : boutiqueCity}</span>
                      <span className="text-stone-400">·</span>
                      <span>Kochi</span>
                    </span>
                    <span className="flex items-center gap-1 text-amber-700 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>{rating}</span>
                      <span className="text-stone-400 font-normal">({reviewCount} reviews)</span>
                    </span>
                    <span className="text-stone-400">·</span>
                    <span className="text-stone-600 font-semibold">
                      {products.length} {products.length === 1 ? "design" : "curated designs"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 pt-2 sm:pt-0">
                <a
                  href="#store-location"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors"
                >
                  <Store className="w-3.5 h-3.5 text-stone-500" />
                  <span>Physical Store</span>
                </a>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-stone-900 text-white hover:bg-stone-800 transition-colors shadow-xs"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Get Directions</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. About the Boutique ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 text-left space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
              About {boutique.boutiqueName}
            </h2>
          </div>
          <p className="text-sm sm:text-base text-stone-700 leading-relaxed max-w-4xl font-normal">
            {boutique.description ||
              `${boutique.boutiqueName} is an independent fashion boutique located in Kochi, Kerala. Known for thoughtful curation, bespoke craftsmanship, and contemporary ethnic styles, each garment is stocked directly at their physical showroom and delivered across Kochi in 90 minutes via Hive.`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-stone-100">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
              <div className="text-left">
                <p className="text-xs font-bold text-stone-800">100% Authentic Stock</p>
                <p className="text-[11px] text-stone-500">Direct from local showroom</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
              <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-left">
                <p className="text-xs font-bold text-stone-800">90-Minute Dispatch</p>
                <p className="text-[11px] text-stone-500">Doorstep delivery in Kochi</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
              <Store className="w-5 h-5 text-stone-700 shrink-0" />
              <div className="text-left">
                <p className="text-xs font-bold text-stone-800">Local Kerala Boutique</p>
                <p className="text-[11px] text-stone-500">Visit in person or shop online</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Products & Category Filter Section ─────────────────────────── */}
        <section className="space-y-6 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
                Collections from {boutique.boutiqueName}
              </h2>
              <p className="text-xs text-stone-500 font-medium mt-0.5">
                Showing {filteredProducts.length} {filteredProducts.length === 1 ? "design" : "designs"} available for 90-minute delivery
              </p>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <label htmlFor="shop-sort" className="text-xs font-semibold text-stone-500">
                Sort by:
              </label>
              <select
                id="shop-sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="text-xs font-semibold bg-stone-50 border border-stone-300 rounded-lg px-2.5 py-1.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
              >
                <option value="newest">Latest Arrivals</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          {availableCategories.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {availableCategories.map((cat) => {
                const isActive = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-stone-900 text-white shadow-xs"
                        : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400 hover:text-stone-900"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Product Grid */}
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {filteredProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  onQuickView={(id) => setQuickViewModal({ open: true, productId: id })}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center bg-stone-50/60 rounded-2xl border border-dashed border-stone-300">
              <p className="text-sm font-semibold text-stone-700">No products found in this category.</p>
              <button
                onClick={() => setSelectedCategory("all")}
                className="mt-3 text-xs font-bold text-stone-900 underline hover:text-stone-700 cursor-pointer"
              >
                View all collections from {boutique.boutiqueName}
              </button>
            </div>
          )}
        </section>

        {/* ── 4. Physical Store Location Card ───────────────────────────────── */}
        <section
          id="store-location"
          className="bg-stone-50 rounded-2xl border border-stone-200/90 p-6 sm:p-8 text-left space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-stone-700" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
                  Showroom & Store Location
                </h2>
              </div>
              <h3 className="text-xl font-serif font-bold text-stone-900">
                Visit {boutique.boutiqueName} in Kochi
              </h3>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-800 transition-colors self-start shadow-2xs"
            >
              <Navigation className="w-3.5 h-3.5 text-amber-700" />
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3 h-3 text-stone-400" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white rounded-xl border border-stone-200 p-5 sm:p-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-stone-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Physical Address</p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{displayAddress}</p>
                  {boutique.pincode && (
                    <p className="text-xs text-stone-500 mt-0.5">PIN: {boutique.pincode}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2">
                <Clock className="w-4 h-4 text-stone-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Showroom Hours</p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">
                    Monday – Saturday: 10:00 AM – 8:30 PM
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">Sunday: 11:00 AM – 7:00 PM</p>
                </div>
              </div>
            </div>

            <div className="bg-stone-50 rounded-lg p-4 flex flex-col justify-between border border-stone-100">
              <p className="text-xs text-stone-600 leading-relaxed">
                Experience the collection in person to touch the fabrics, try on bespoke fits, or order online through Hive to enjoy rapid doorstep delivery in approximately 90 minutes.
              </p>
              <div className="pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <Truck className="w-3.5 h-3.5" />
                  <span>Express courier pickup available at this location</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. Delivery Coverage Areas in Kochi ───────────────────────────── */}
        <section className="bg-white rounded-2xl border border-stone-200/90 p-6 sm:p-8 text-left space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Hyperlocal Delivery Coverage
              </h2>
            </div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">
              90-Minute Delivery Areas Across Kochi & Ernakulam
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Hive dispatches orders directly from {boutique.boutiqueName} to your doorstep in these neighborhoods:
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {KOCHI_NEIGHBORHOODS.map((area) => (
              <span
                key={area}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-50 border border-stone-200 text-stone-700"
              >
                <MapPin className="w-3 h-3 text-stone-400" />
                <span>{area}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ── 6. Boutique FAQs (Accordion) ─────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-stone-200/90 p-6 sm:p-8 text-left space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
              Frequently Asked Questions
            </h2>
            <h3 className="text-xl font-serif font-bold text-stone-900 mt-1">
              Shopping from {boutique.boutiqueName}
            </h3>
          </div>

          <div className="space-y-3 pt-2">
            <details className="group bg-stone-50/70 border border-stone-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer p-4 text-stone-900 font-semibold text-sm hover:bg-stone-100/60 transition-colors">
                <span>How quickly does Hive deliver from {boutique.boutiqueName}?</span>
                <ChevronDown className="w-4 h-4 text-stone-500 transition-transform duration-200 group-open:-rotate-180 shrink-0 ml-2" />
              </summary>
              <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100">
                Orders placed on Hive are packed directly by {boutique.boutiqueName}&apos;s staff in Kochi and dispatched via dedicated express couriers. Delivery typically takes approximately 90 minutes anywhere across Kochi and Ernakulam.
              </div>
            </details>

            <details className="group bg-stone-50/70 border border-stone-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer p-4 text-stone-900 font-semibold text-sm hover:bg-stone-100/60 transition-colors">
                <span>Are items from {boutique.boutiqueName} authentic?</span>
                <ChevronDown className="w-4 h-4 text-stone-500 transition-transform duration-200 group-open:-rotate-180 shrink-0 ml-2" />
              </summary>
              <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100">
                Yes, 100% authentic. Hive is the official digital marketplace for local boutiques in Kochi. Every item comes directly from {boutique.boutiqueName}&apos;s physical boutique inventory with original brand tags and packaging.
              </div>
            </details>

            <details className="group bg-stone-50/70 border border-stone-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer p-4 text-stone-900 font-semibold text-sm hover:bg-stone-100/60 transition-colors">
                <span>Can I visit {boutique.boutiqueName}&apos;s physical showroom?</span>
                <ChevronDown className="w-4 h-4 text-stone-500 transition-transform duration-200 group-open:-rotate-180 shrink-0 ml-2" />
              </summary>
              <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100">
                Yes! {boutique.boutiqueName} operates a physical store at {displayAddress}. You can visit during store hours to explore garments in person or order via Hive for immediate delivery.
              </div>
            </details>

            <details className="group bg-stone-50/70 border border-stone-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer p-4 text-stone-900 font-semibold text-sm hover:bg-stone-100/60 transition-colors">
                <span>What is the return and exchange policy?</span>
                <ChevronDown className="w-4 h-4 text-stone-500 transition-transform duration-200 group-open:-rotate-180 shrink-0 ml-2" />
              </summary>
              <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100">
                Hive provides hassle-free returns and size exchanges within 2 days of delivery. If an outfit doesn&apos;t fit as expected, you can schedule a doorstep pickup directly through your Hive account.
              </div>
            </details>
          </div>
        </section>

        {/* ── 7. Related Boutiques in Kochi ─────────────────────────────────── */}
        {relatedBoutiques.length > 0 && (
          <section className="text-left space-y-4 pt-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Explore More Local Fashion
              </h2>
              <h3 className="text-xl font-serif font-bold text-stone-900 mt-1">
                Other Boutiques in Kochi
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedBoutiques.map((rb) => {
                const rbSlug =
                  rb.slug ||
                  rb.boutiqueName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

                return (
                  <Link
                    key={rb._id}
                    href={`/shop/${rbSlug}`}
                    className="group flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-stone-200 hover:border-stone-400 transition-all hover:shadow-sm"
                  >
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
                      {rb.logoUrl ? (
                        <Image
                          src={rb.logoUrl}
                          alt={`${rb.boutiqueName} logo`}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-serif font-bold text-stone-700">
                          {rb.boutiqueName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-900 truncate group-hover:text-amber-900 transition-colors">
                        {rb.boutiqueName}
                      </p>
                      <p className="text-xs text-stone-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                        <span className="truncate">{rb.city || "Kochi"}, Kerala</span>
                      </p>
                      {typeof rb.activeApprovedProductCount === "number" && (
                        <p className="text-[11px] font-semibold text-stone-400">
                          {rb.activeApprovedProductCount} {rb.activeApprovedProductCount === 1 ? "design" : "designs"}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Quick View Modal */}
      {quickViewModal.open && quickViewModal.productId && (
        <QuickViewModal
          isOpen={quickViewModal.open}
          onClose={() => setQuickViewModal({ open: false, productId: null })}
          productSlug={quickViewModal.productId}
          initialProduct={filteredProducts.find(
            (p: any) => p.slug === quickViewModal.productId || p.id === quickViewModal.productId
          )}
        />
      )}
    </CatalogLayout>
  );
}
