import React from "react";
import Link from "next/link";
import { Collection } from "@/lib/collections";
import { ArrowRight, Sparkles } from "lucide-react";

export interface CollectionCardProps {
  collection: Collection & {
    tagline?: string;
    curator?: string;
    badge?: string;
    storeCount?: number;
    locality?: string;
  };
  variant?: "default" | "featured";
  className?: string;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  variant = "default",
  className = "",
}) => {
  if (variant === "featured") {
    return (
      <Link
        href={`/collections/${collection.slug}`}
        className={`group relative block w-full overflow-hidden rounded-3xl bg-stone-900 shadow-sm hover:shadow-xl transition-all duration-500 border border-stone-200/80 hover:border-amber-400/60 ${className}`}
        aria-label={`Browse ${collection.title} collection`}
      >
        <div className="relative aspect-[16/10] sm:aspect-[21/9] w-full overflow-hidden bg-stone-100">
          <img
            src={collection.imageUrl}
            alt={collection.title}
            className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-700 ease-out pointer-events-none"
            loading="lazy"
          />
          {/* Subtle natural gradient - keeps photography clear */}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/75 via-stone-950/20 to-transparent" />

          {/* Single clean top badge */}
          <div className="absolute top-3.5 left-3.5 sm:top-5 sm:left-5">
            <span className="px-2.5 py-1 rounded-full bg-amber-400 text-stone-950 text-[9px] font-extrabold uppercase tracking-[0.18em] shadow-xs inline-flex items-center gap-1.5">
              <Sparkles className="w-2.5 h-2.5 text-stone-950" />
              Editor&apos;s Spotlight
            </span>
          </div>

          {/* Bottom Content */}
          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-left">
            <div className="flex flex-col gap-1 max-w-lg">
              <h2 className="text-xl sm:text-3xl font-serif font-bold text-white leading-tight group-hover:text-amber-200 transition-colors">
                {collection.title}
              </h2>
              <p className="text-xs sm:text-sm text-stone-200 line-clamp-1 leading-normal font-normal">
                {collection.description || "Hand-picked styles from stores near you"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <span className="px-3.5 py-2 rounded-full bg-white/20 hover:bg-white backdrop-blur-md border border-white/30 text-white hover:text-stone-950 text-xs font-bold transition-all inline-flex items-center gap-1.5">
                <span>Explore Edit</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  const styleCount = typeof collection.productCount === "number" && collection.productCount > 0 
    ? `${collection.productCount} styles` 
    : "Styles available";

  const storeLocality = collection.locality || "Kochi Stores";

  return (
    <Link
      href={`/collections/${collection.slug}`}
      className={`group relative block w-full overflow-hidden rounded-2xl bg-stone-900 shadow-2xs hover:shadow-lg transition-all duration-400 hover:-translate-y-0.5 border border-stone-200/80 hover:border-amber-400/50 ${className}`}
      aria-label={`Browse ${collection.title} collection`}
    >
      {/* Cover Image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone-100">
        <img
          src={collection.imageUrl}
          alt={collection.title}
          className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-600 ease-out pointer-events-none"
          loading="lazy"
        />
        {/* Soft bottom vignette — keeps fashion photo clear */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/20 to-transparent" />

        {/* Optional single badge (only if explicitly set) */}
        {collection.badge && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 text-[8px] font-extrabold uppercase tracking-widest select-none shadow-xs">
            {collection.badge}
          </div>
        )}
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex flex-col gap-1 text-left">
        <div className="flex items-end justify-between gap-1.5">
          <h3 className="text-sm sm:text-base font-serif font-bold text-white leading-tight group-hover:text-amber-300 transition-colors duration-250 line-clamp-2">
            {collection.title}
          </h3>
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/15 backdrop-blur-xs border border-white/25 flex items-center justify-center group-hover:bg-amber-400 group-hover:border-amber-400 transition-all duration-250">
            <ArrowRight
              className="w-3 h-3 text-white group-hover:text-stone-950 transition-colors duration-250 group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </div>
        </div>

        {/* Commerce Meta Strip: style count + store location */}
        <div className="flex items-center gap-1.5 text-[10px] text-stone-300 font-medium pt-1">
          <span className="font-bold text-amber-300">
            {styleCount}
          </span>
          <span className="text-stone-400/60 select-none">•</span>
          <span className="text-stone-300 truncate">
            {storeLocality}
          </span>
        </div>
      </div>
    </Link>
  );
};
