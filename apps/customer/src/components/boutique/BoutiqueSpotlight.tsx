import React from "react";
import { BoutiqueCard } from "./BoutiqueCard";
import { Boutique } from "@/lib/mockBoutiques";
import { ArrowRight } from "lucide-react";

export interface BoutiqueSpotlightProps {
  boutiques?: Boutique[];
  isLoading?: boolean;
}

export const BoutiqueSpotlight: React.FC<BoutiqueSpotlightProps> = ({
  boutiques,
  isLoading = false,
}) => {
  const displayBoutiques = boutiques || [];

  if (isLoading) {
    return (
      <section className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-10 sm:py-16 flex flex-col gap-5 sm:gap-8">
        {/* Header skeleton */}
        <div className="flex justify-between items-end border-b border-hive-border/40 pb-5">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-slate-200 animate-pulse rounded" />
            <div className="h-7 w-56 bg-slate-200 animate-pulse rounded" />
          </div>
        </div>
        {/* Grid skeleton — 2 columns, matching live grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-full aspect-[4/5] bg-slate-100 animate-pulse rounded-2xl sm:rounded-[28px]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (displayBoutiques.length === 0) return null;

  return (
    <section className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-10 sm:py-16 flex flex-col gap-5 sm:gap-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-hive-border/40 pb-5">
        <div className="flex flex-col text-left items-start gap-1">
          <span className="text-[10px] font-bold text-hive-amber tracking-widest uppercase">
            BRAND &amp; STORE SPOTLIGHT
          </span>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold font-serif text-hive-dark">
            Featured Brands &amp; Stores
          </h2>
          <p className="text-sm text-hive-text-muted mt-0.5 max-w-xl hidden sm:block">
            Discover independent designers and fashion stores near you.
          </p>
        </div>

        <button className="text-xs font-bold uppercase tracking-widest text-hive-amber hover:text-hive-gold flex items-center gap-1.5 transition-colors self-start sm:self-auto group/header flex-shrink-0">
          View All
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/header:translate-x-1" />
        </button>
      </div>

      {/* Grid — identical columns + gap to ProductGrid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8">
        {displayBoutiques.map((boutique) => (
          <BoutiqueCard key={boutique.id} boutique={boutique} />
        ))}
      </div>
    </section>
  );
};
