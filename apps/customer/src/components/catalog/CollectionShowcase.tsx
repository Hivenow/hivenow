import React from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { CollectionDetails } from "@/lib/collections";

interface CollectionShowcaseProps {
  details: CollectionDetails;
}

export const CollectionShowcase: React.FC<CollectionShowcaseProps> = ({
  details,
}) => {
  const hasFeaturedProducts = details.featuredProducts.length > 0;
  const hasFeaturedBoutiques = details.featuredBoutiques.length > 0;

  if (!hasFeaturedProducts && !hasFeaturedBoutiques) return null;

  return (
    <div className="w-full border-b border-hive-border/40 bg-white">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 w-full py-10 flex flex-col gap-10">

        {/* ── Featured Products ── */}
        {hasFeaturedProducts && (
          <div className="flex flex-col gap-5">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span
                  className="text-[10px] font-extrabold uppercase tracking-[0.22em]"
                  style={{ color: details.accentColor }}
                >
                  Editor&apos;s Pick
                </span>
                <h2 className="text-xl font-serif font-extrabold text-hive-dark">
                  From This Collection
                </h2>
              </div>
              <a
                href="#collection-grid"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors group"
                style={{ color: details.accentColor }}
              >
                See All
                <ArrowRight
                  className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                />
              </a>
            </div>

            {/* Product mosaic */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {details.featuredProducts.map((product, idx) => (
                <div
                  key={product.id}
                  className="group relative overflow-hidden rounded-2xl bg-hive-cream/20 border border-hive-border/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {/* Image */}
                  <div className="aspect-[3/4] overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <span className="text-white text-xs font-bold leading-tight line-clamp-2">
                      {product.name}
                    </span>
                    <span className="text-white/70 text-[10px] font-medium mt-1">
                      {product.boutiqueName}
                    </span>
                    <span
                      className="text-xs font-extrabold mt-2"
                      style={{ color: details.accentColor }}
                    >
                      ₹{product.price.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* "Editor's Pick" badge on first item */}
                  {idx === 0 && (
                    <div
                      className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider text-white"
                      style={{ background: details.accentColor }}
                    >
                      Editor&apos;s Pick
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Featured Boutiques ── */}
        {hasFeaturedBoutiques && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span
                className="text-[10px] font-extrabold uppercase tracking-[0.22em]"
                style={{ color: details.accentColor }}
              >
                Curated By
              </span>
              <h2 className="text-xl font-serif font-extrabold text-hive-dark">
                Featured Stores
              </h2>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {details.featuredBoutiques.map((boutique) => (
                <div
                  key={boutique.id}
                  className="flex-shrink-0 w-[180px] md:w-[200px] group cursor-pointer"
                >
                  {/* Boutique image */}
                  <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-hive-border/40">
                    <img
                      src={boutique.imageUrl}
                      alt={boutique.name}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Verified badge */}
                    {boutique.verified && (
                      <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5 text-hive-amber" />
                      </div>
                    )}

                    {/* Name overlay */}
                    <div className="absolute bottom-0 inset-x-0 p-3">
                      <span className="text-xs font-extrabold text-white drop-shadow-sm truncate block">
                        {boutique.name}
                      </span>
                    </div>
                  </div>

                  {/* Hover lift indicator */}
                  <div
                    className="mt-2 h-0.5 w-0 group-hover:w-full rounded-full transition-all duration-300"
                    style={{ background: details.accentColor }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
