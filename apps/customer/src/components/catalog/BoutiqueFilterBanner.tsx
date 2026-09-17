"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, X, ArrowUpRight, Store } from "lucide-react";

export interface BoutiqueFilterBannerProps {
  activeBoutique?: {
    boutiqueName?: string;
    logoUrl?: string;
    city?: string;
    slug?: string;
  } | null;
  onClear: () => void;
}

export const BoutiqueFilterBanner: React.FC<BoutiqueFilterBannerProps> = ({
  activeBoutique,
  onClear,
}) => {
  const boutiqueName = activeBoutique?.boutiqueName || "Featured Designer";
  const city = activeBoutique?.city || "Kochi";
  const slug = activeBoutique?.slug;

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 w-full mt-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#FAF8F5] via-white to-[#FAF8F5] border border-stone-200/90 p-3.5 sm:p-4 shadow-xs">
        {/* Subtle decorative background shimmer */}
        <div className="absolute top-0 right-0 w-48 h-full bg-gradient-to-l from-amber-50/40 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Boutique identity & curation details */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo / Monogram */}
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border border-stone-200/80 bg-white shadow-2xs shrink-0 flex items-center justify-center">
              {activeBoutique?.logoUrl ? (
                <Image
                  src={activeBoutique.logoUrl}
                  alt={boutiqueName}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-stone-900 text-amber-300 flex items-center justify-center">
                  <Store className="w-5 h-5 text-amber-200" strokeWidth={1.75} />
                </div>
              )}
            </div>

            {/* Typography stack */}
            <div className="flex flex-col min-w-0 text-left">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-[0.2em] text-stone-500">
                  <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                  <span>Boutique Spotlight</span>
                </span>
                <span className="text-stone-300 hidden sm:inline">·</span>
                <span className="text-[10px] text-stone-500 font-medium hidden sm:inline">
                  {city}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-sm sm:text-base font-bold text-stone-900 tracking-tight truncate">
                  {boutiqueName}
                </h2>
                <span className="text-[11px] text-stone-500 font-normal hidden md:inline">
                  Exclusive In-Store Collection
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {slug && (
              <Link
                href={`/shop/${slug}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-stone-600 hover:text-stone-950 hover:bg-stone-100 transition-colors"
              >
                <span>View Storefront</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}

            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-stone-900 text-stone-700 hover:text-white border border-stone-200 hover:border-stone-900 text-xs font-semibold transition-all duration-200 shadow-2xs cursor-pointer group"
              aria-label="Clear boutique filter"
            >
              <X className="w-3.5 h-3.5 text-stone-400 group-hover:text-white transition-colors" />
              <span>Clear filter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
