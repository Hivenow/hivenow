"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { useLocation } from "@/context/LocationContext";
import { toQueryCoords } from "@/lib/distance";
import { ProductCard } from "@/components/product/ProductCard";
import { CollectionHeader } from "@/components/catalog/CollectionHeader";
import { CatalogLoadingState } from "@/components/catalog/CatalogLoadingState";
import { LayoutGrid } from "lucide-react";
import { mapDbProduct } from "@/components/home/ExperienceBlockRenderer";

interface CollectionPageClientProps {
  slug: string;
  initialData?: any;
}

export function CollectionPageClient({ slug, initialData }: CollectionPageClientProps) {
  const { latitude, longitude, city } = useLocation();

  const data = useQuery(api.customerHome.getCollection, {
    slug,
    city: city || undefined,
    ...toQueryCoords(latitude, longitude),
  });

  const effectiveData = data ?? initialData;

  // Quick commerce instant skeleton loading
  if (effectiveData === undefined) {
    return (
      <div className="flex flex-col w-full bg-hive-cream min-h-screen">
        <CollectionHeader title="Collection" />
        <section className="w-full max-w-[1440px] mx-auto px-6 lg:px-8 py-10 lg:py-16">
          <CatalogLoadingState count={8} />
        </section>
      </div>
    );
  }

  if (effectiveData === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-hive-dark">
        <LayoutGrid className="w-12 h-12 text-slate-300" />
        <h2 className="font-serif text-2xl font-bold">Collection Not Found</h2>
        <p className="text-slate-500 max-w-md text-center">
          We couldn&apos;t find the collection you&apos;re looking for. It may have been removed or is temporarily unavailable.
        </p>
      </div>
    );
  }

  const { collection, products } = effectiveData;
  const mappedProducts = products.map(mapDbProduct);

  return (
    <div className="flex flex-col w-full bg-hive-cream">
      {/* ── Dynamic Header ── */}
      <CollectionHeader title={collection.name} />

      {/* ── Product Grid ── */}
      <section className="w-full max-w-[1440px] mx-auto px-6 lg:px-8 py-10 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-6">
          {mappedProducts.map((p: any, idx: number) => (
            <div
              key={p.id}
              className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both"
              style={{ animationDelay: `${Math.min(idx * 50, 800)}ms` }}
            >
              <ProductCard product={p} />
            </div>
          ))}
        </div>
        {mappedProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed border-hive-border rounded-2xl bg-white">
            <LayoutGrid className="w-10 h-10 text-slate-300" />
            <h3 className="font-serif text-xl font-bold text-hive-dark">
              No products found
            </h3>
            <p className="text-slate-500">
              There are currently no items in this collection for your selected location.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
