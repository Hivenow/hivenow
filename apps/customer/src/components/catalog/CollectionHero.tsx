import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { CollectionDetails } from "@/lib/collections";

interface CollectionHeroProps {
  details: CollectionDetails;
}

export const CollectionHero: React.FC<CollectionHeroProps> = ({ details }) => {
  return (
    <div className="relative w-full overflow-hidden">
      {/* ── Full-bleed cover image ── */}
      <div className="relative h-[420px] md:h-[540px] lg:h-[620px] w-full">
        <img
          src={details.coverImageUrl}
          alt={details.title}
          className="object-cover w-full h-full [transition:transform_8s_ease-out] hover:scale-105"
          style={{ objectPosition: "center 30%" }}
          loading="eager"
        />

        {/* Layered gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

        {/* Subtle accent colour pulse at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 opacity-20 blur-2xl"
          style={{
            background: `linear-gradient(to top, ${details.accentColor}, transparent)`,
          }}
        />

        {/* ── Content overlay ── */}
        <div className="absolute inset-0 flex flex-col justify-between px-6 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
          {/* Top bar: back link + eyebrow */}
          <div className="flex items-center justify-between">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors group"
            >
              <ArrowLeft
                className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5"
                strokeWidth={2.5}
              />
              All Products
            </Link>

            {/* Collection eyebrow badge */}
            <span
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm text-[10px] font-extrabold text-white/80 uppercase tracking-[0.2em]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: details.accentColor }}
              />
              Curated Collection
            </span>
          </div>

          {/* Bottom content block */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="flex flex-col gap-4 max-w-2xl">
              {/* Icon + title */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-4xl select-none drop-shadow-lg">{details.icon}</span>
                  <span
                    className="text-xs font-extrabold uppercase tracking-[0.25em]"
                    style={{ color: details.accentColor }}
                  >
                    {details.subtitle}
                  </span>
                </div>

                <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-extrabold text-white tracking-tight leading-[0.95] drop-shadow-sm">
                  {details.title}
                </h1>
              </div>

              {/* Editorial copy */}
              <p className="text-sm md:text-base text-white/75 leading-relaxed max-w-xl font-light">
                {details.editorialCopy}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {details.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm text-[10px] font-bold text-white/80 uppercase tracking-wider"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <div className="flex items-center gap-4 mt-2">
                <a
                  href="#collection-grid"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-extrabold uppercase tracking-widest text-hive-dark transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg group"
                  style={{
                    background: details.accentColor,
                    boxShadow: `0 4px 24px ${details.accentColor}40`,
                  }}
                >
                  Browse Collection
                  <ArrowRight
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    strokeWidth={2.5}
                  />
                </a>
              </div>
            </div>

            {/* Right: featured boutique previews */}
            {details.featuredBoutiques.length > 0 && (
              <div className="hidden lg:flex flex-col gap-3 min-w-[220px]">
                <span className="text-[10px] font-extrabold text-white/50 uppercase tracking-widest">
                  Featured Stores
                </span>
                <div className="flex flex-col gap-2">
                  {details.featuredBoutiques.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/20 flex-shrink-0">
                        <img
                          src={b.imageUrl}
                          alt={b.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs font-bold text-white/90 flex-1 truncate">
                        {b.name}
                      </span>
                      {b.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-hive-gold flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
