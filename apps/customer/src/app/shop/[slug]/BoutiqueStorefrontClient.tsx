"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  MapPin,
  ShieldCheck,
  ArrowLeft,
  Star,
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
}

export function BoutiqueStorefrontClient({
  boutique,
  products,
  categories,
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

  // Distinct category names present in this store's catalog
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

  const boutiqueCity = boutique.city || "Kochi";
  const rating = boutique.averageRating ? boutique.averageRating.toFixed(1) : "4.9";
  const reviewCount = boutique.reviewCount || 18;

  return (
    <CatalogLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Stores", href: "/products" },
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

        {/* ── Store Identity Strip ──────────────────────────────────────── */}
        <section className="flex items-center gap-4 sm:gap-6 bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-6 shadow-xs">
          {/* Logo / Monogram */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-stone-200 bg-white flex-shrink-0">
            {boutique.logoUrl ? (
              <Image
                src={boutique.logoUrl}
                alt={`${boutique.boutiqueName} logo`}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center text-2xl font-serif font-bold text-stone-800 select-none">
                {boutique.boutiqueName.charAt(0)}
              </div>
            )}
          </div>

          {/* Name & Meta */}
          <div className="flex-1 min-w-0 space-y-1 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 tracking-tight truncate">
                {boutique.boutiqueName}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                <ShieldCheck className="w-3 h-3 text-amber-700" />
                <span>Verified</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-stone-500 font-medium flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-stone-400" />
                <span>{boutique.address ? boutique.address.split(",")[0] : boutiqueCity}</span>
              </span>
              <span className="text-stone-300">·</span>
              <span className="flex items-center gap-1 text-amber-700 font-bold">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>{rating}</span>
                <span className="text-stone-400 font-normal">({reviewCount})</span>
              </span>
              <span className="text-stone-300">·</span>
              <span>{products.length} {products.length === 1 ? "design" : "designs"}</span>
            </div>
          </div>
        </section>

        {/* ── 2. Products & Category Filter Section ─────────────────────────── */}
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
