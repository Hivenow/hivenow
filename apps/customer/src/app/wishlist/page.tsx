"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useWishlistStore } from "@/store/wishlist-store";
import { ProductCard } from "@/components/product/ProductCard";

export default function WishlistPage() {
  const { items, clearPendingOrder } = useWishlistStore();
  const [hydrated, setHydrated] = useState(false);
  const pendingOrderItems = items.filter((i) => i.pendingOrderBoutiqueId);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-white">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent border-stone-900 animate-spin" />
        <span className="text-xs text-stone-500 font-semibold tracking-wide">Loading your favorites...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-stone-900 antialiased selection:bg-stone-200 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 text-left">
        
        {/* Header section */}
        <div
          className={`flex flex-col sm:flex-row justify-between items-start sm:items-baseline gap-3 mb-6 ${
            items.length > 0 ? "pb-4 border-b border-stone-200/80" : "pb-1"
          }`}
        >
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-hive-text-muted">
              Your Collection
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              My Wishlist
            </h1>
          </div>
          {items.length > 0 && (
            <span className="text-[10px] bg-white border border-stone-200 text-stone-600 font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {items.length} {items.length === 1 ? "Item" : "Items"} saved
            </span>
          )}
        </div>

        {/* Main content */}
        {items.length === 0 ? (
          /* Editorial Fashion Empty State */
          <div className="animate-[fadeIn_0.3s_ease-out]">
            {/* Editorial Hero Visual & Copy */}
            <div className="py-1 sm:py-3 text-center max-w-lg mx-auto flex flex-col items-center select-none">
              {/* Editorial Artwork */}
              <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[410px] aspect-[1024/682] mx-auto mb-3 sm:mb-4">
                <Image
                  src="/brand/wishlist-editorial-v2.png"
                  alt="Hive Wishlist - Good Style Takes Time"
                  fill
                  priority
                  unoptimized
                  className="object-contain mix-blend-multiply pointer-events-none"
                />
              </div>

              {/* Headline & Body Copy */}
              <div className="space-y-1.5 text-center max-w-[340px] sm:max-w-[380px] mx-auto px-2">
                <h2 className="font-serif text-2xl sm:text-3xl font-medium text-stone-900 tracking-tight leading-tight">
                  Save what you love
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 leading-relaxed font-normal">
                  Your wishlist is empty. Explore curated styles from Kochi&apos;s finest boutiques and save the pieces you love.
                </p>
              </div>

              {/* Primary Action Button */}
              <Link href="/products" className="mt-3.5 sm:mt-4">
                <button
                  type="button"
                  className="h-10 sm:h-11 px-6 sm:px-7 bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all rounded-full text-xs font-bold uppercase tracking-widest shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Explore Styles</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-300" />
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <>
          {pendingOrderItems.length > 0 && (
            <div className="mb-6 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 block">
                Ready For Your Next Order
              </span>
              {pendingOrderItems.map((item) => (
                <div
                  key={item.slug}
                  className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3.5 flex items-center gap-3"
                >
                  <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/70 shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-stone-500 truncate">{item.boutiqueName}</p>
                  </div>
                  <Link
                    href={`/products/${item.slug}`}
                    className="h-8 px-3 bg-stone-950 hover:bg-stone-900 text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center shrink-0 transition-colors"
                  >
                    Order now
                  </Link>
                  <button
                    type="button"
                    onClick={() => clearPendingOrder(item.slug)}
                    aria-label="Dismiss reminder"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 shrink-0 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Wishlist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {items.map((item) => {
              // Adapt WishlistProduct to ProductCardData schema expectations
              const cardProduct = {
                id: item.id || item.slug,
                slug: item.slug,
                name: item.name,
                price: item.price,
                compareAtPrice: item.compareAtPrice,
                imageUrl: item.imageUrl,
                boutiqueName: item.boutiqueName,
                rating: item.rating || undefined,
                reviewCount: item.reviewCount || undefined,
                sizes: item.sizes || ["Free"],
                stockBySize: item.stockBySize || { Free: 5 },
                favorite: true,
              };

              return (
                <ProductCard key={item.slug} product={cardProduct} />
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

