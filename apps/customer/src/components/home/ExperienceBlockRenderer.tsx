"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductCard } from "@/components/product/ProductCard";
import { TrustStrip } from "@/components/trust/TrustStrip";
import { Sparkles, ArrowRight, ArrowUpRight } from "lucide-react";
import { MoodBoardGrid } from "@/components/home/MoodBoardGrid";
import { calculateDisplayPricing } from "@/lib/pricing";
// Canonical public image URL builder, shared with the Convex backend so client
// and server agree on domain and transformation parameters.
import { getPublicUrl } from "../../../../../convex/media/urls";

/** Shown only when a merchandiser has left a banner slot without an image. */
const FALLBACK_BANNER = "https://placehold.co/800x400/FF0000/FFFFFF?text=MISSING+BANNER";

/** Tailwind's `sm` breakpoint — keep in sync with the aspect-ratio switch below. */
const HERO_DESKTOP_MEDIA = "(min-width: 640px)";

/**
 * Art-directed banner image.
 *
 * Renders one <picture> with a desktop <source> and a mobile fallback <img>, so
 * the browser downloads exactly one of the two variants. Both candidates keep
 * Next's optimizer output (srcSet/sizes) via getImageProps.
 *
 * Pass `priority` for the LCP banner only — it preloads the single chosen
 * candidate. Everything below the fold should leave it off and lazy-load.
 */
function HeroPicture({
  desktopSrc,
  mobileSrc,
  alt,
  priority = false,
  className = "object-cover object-center",
}: {
  desktopSrc: string;
  mobileSrc: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const common = { alt, fill: true, sizes: "100vw", priority, quality: 80 } as const;

  const { props: desktop } = getImageProps({ ...common, src: desktopSrc });
  const { props: mobile } = getImageProps({ ...common, src: mobileSrc });

  return (
    <picture>
      <source media={HERO_DESKTOP_MEDIA} srcSet={desktop.srcSet} sizes={desktop.sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes through ...mobile */}
      <img
        {...mobile}
        className={`absolute inset-0 w-full h-full pointer-events-none transform transition-transform duration-700 ease-out group-hover:scale-[1.02] ${className}`}
      />
    </picture>
  );
}

// Helper to deduce occasion from product tags/description
function getProductOccasion(product: any): string {
  const catName = (product.categoryName || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();
  
  if (name.includes("wedding") || desc.includes("wedding") || name.includes("lehenga") || catName.includes("lehengas")) {
    return "wedding";
  }
  if (name.includes("festival") || desc.includes("festival") || name.includes("saree") || catName.includes("sarees")) {
    return "festival";
  }
  if (name.includes("co-ord") || name.includes("coord") || catName.includes("coords") || catName.includes("co-ord")) {
    return "coords";
  }
  if (name.includes("kurta") || name.includes("kurti") || catName.includes("kurtis")) {
    return "ethnic";
  }
  if (name.includes("party") || desc.includes("party")) {
    return "party";
  }
  if (name.includes("date") || desc.includes("date") || name.includes("dress") || catName.includes("dresses")) {
    return "date";
  }
  if (name.includes("work") || name.includes("office")) {
    return "workwear";
  }
  return "casual";
}

// Helper to map DB product or ResolvedProduct DTO to ProductCardData interface
export function mapDbProduct(p: any) {
  const { price, compareAtPrice, discountPercent } = calculateDisplayPricing(p);

  return {
    id: p._id || p.id,
    slug: p.slug,
    name: p.name,
    boutiqueName: p.boutiqueName || p.boutique?.boutiqueName || "Unknown Boutique",
    boutiqueId: p.boutiqueId,
    boutique: p.boutique,
    imageUrl: p.imageUrl || (p.imageUrls?.[0]) || p.images?.[0] || "",
    price,
    compareAtPrice,
    discountPercent,
    rating: p.rating || undefined,
    reviewCount: p.reviewCount || undefined,
    occasion: getProductOccasion(p),
    isVerifiedBoutique: p.boutique?.verified || false,
    isNewArrival: (p.createdAt && (Date.now() - p.createdAt < 14 * 24 * 60 * 60 * 1000)) || false,
    isTrending: p.featured || false,
    isBestSeller: p.featured || false,
    sameDayDelivery: p.sameDayEligible ?? true,
    videoAvailable: p.images?.length > 1,
    favorite: false,
    sizes: p.sizes || ["Free"],
    stockBySize: p.stockBySize || { Free: 5 },
    estimatedDistanceKm: p.distanceKm || p.estimatedDistanceKm,
    estimatedDurationMin: p.etaMinutes || p.estimatedDurationMin,
    estimatedEtaMinutes: p.etaMinutes || p.estimatedEtaMinutes,
    hiveScore: p.hiveScore,
    deliveryLabel: p.deliveryLabel,
  };
}

// ── HERO & EDITORIAL BANNER CAROUSEL ──────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function HeroBannerCarousel({ banners }: { banners: any[] }) {
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const scrollToIdx = useCallback((idx: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const items = container.children;
    if (items[idx]) {
      const child = items[idx] as HTMLElement;
      container.scrollTo({
        left: child.offsetLeft,
        behavior: "smooth",
      });
      setActiveIdx(idx);
    }
  }, []);

  // Smooth horizontal auto-slide timer (4s interval)
  useEffect(() => {
    if (banners.length <= 1 || isPaused || prefersReducedMotion) return;

    const interval = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % banners.length;
        if (scrollRef.current) {
          const container = scrollRef.current;
          const items = container.children;
          if (items[next]) {
            const child = items[next] as HTMLElement;
            container.scrollTo({
              left: child.offsetLeft,
              behavior: "smooth",
            });
          }
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [banners.length, isPaused]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.clientWidth;
    if (itemWidth > 0) {
      const newIdx = Math.round(scrollLeft / itemWidth);
      if (newIdx >= 0 && newIdx < banners.length && newIdx !== activeIdx) {
        setActiveIdx(newIdx);
      }
    }
  };

  if (banners.length === 0) return null;

  if (banners.length === 1) {
    return (
      <section className="w-full bg-white pt-1 pb-0.5">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div
            className="banner-card group relative w-full aspect-[2/1] sm:aspect-[2.4/1] rounded-2xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
            onClick={() => {
              if (banners[0].targetUrl) router.push(banners[0].targetUrl);
            }}
          >
            {/*
              Art-directed hero, rendered as a real <picture> rather than two
              CSS-hidden <Image> elements.

              The previous markup showed one variant per breakpoint with
              `hidden sm:block` / `sm:hidden`, and marked BOTH `priority`. A
              CSS-hidden <img> is still downloaded by the browser, so every
              visitor fetched both variants — and `priority` added a preload for
              each on top, so the two competed against each other for bandwidth
              at the exact moment the LCP element needed it.

              <source media> is the only mechanism that actually prevents the
              unused fetch: the browser picks one candidate and never requests
              the other. getImageProps keeps Next's optimizer, srcSet and sizes
              on both candidates; `priority` is declared once, on the shared
              <img>, so there is exactly one preload for the one image shown.
            */}
            <HeroPicture
              desktopSrc={banners[0].desktopImage || banners[0].mobileImage || FALLBACK_BANNER}
              mobileSrc={banners[0].mobileImage || banners[0].desktopImage || FALLBACK_BANNER}
              alt={banners[0].title || "Hive campaign banner"}
              priority
            />
            <div className="sheen-glow" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full bg-white pt-1 pb-1">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Desktop Grid */}
        <div className="hidden md:grid grid-cols-3 gap-6 w-full">
          {banners.slice(0, 3).map((banner: any, idx: number) => (
            <div
              key={banner._id || idx}
              className="banner-card group relative aspect-[16/8] md:h-[180px] lg:h-[200px] rounded-xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
              style={{ animationDelay: `${idx * 150}ms` }}
              onClick={() => {
                if (banner.targetUrl) router.push(banner.targetUrl);
              }}
            >
              <Image
                src={banner.desktopImage || FALLBACK_BANNER}
                alt={banner.title || `Hive campaign banner ${idx + 1}`}
                fill
                // Eager, not `priority`. This grid is `hidden md:grid` and the
                // mobile carousel below is `md:hidden`, so marking the first
                // item of each `priority` emitted two preloads at every
                // viewport — one of them always for an image that breakpoint
                // never shows. Eager keeps the first banner out of the lazy
                // queue without competing against the real LCP element.
                loading={idx === 0 ? "eager" : "lazy"}
                // Only ever rendered at >=768px, where each cell is a third of
                // the container. The old `(max-width: 768px) 100vw` clause was
                // unreachable and only widened the candidate set.
                sizes="33vw"
                className="object-cover pointer-events-none transform group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="sheen-glow" />
            </div>
          ))}
        </div>

        {/* Mobile Horizontal Auto-Slide Carousel */}
        <div 
          className="md:hidden flex flex-col w-full"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-0 -mx-6 px-6 scroll-smooth"
          >
            {banners.map((banner: any, idx: number) => (
              <div
                key={banner._id || idx}
                className="banner-card flex-shrink-0 w-full snap-center group relative aspect-[2/1] rounded-xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
                style={{ animationDelay: `${idx * 150}ms` }}
                onClick={() => {
                  if (banner.targetUrl) router.push(banner.targetUrl);
                }}
              >
                <Image
                  src={banner.mobileImage || banner.desktopImage || FALLBACK_BANNER}
                  alt={banner.title || `Hive campaign banner ${idx + 1}`}
                  fill
                  // See the desktop grid above — eager rather than `priority`,
                  // so the two breakpoint variants stop preloading against each
                  // other. Only the first slide is eager; the rest of the
                  // carousel is off-screen and stays lazy.
                  loading={idx === 0 ? "eager" : "lazy"}
                  // Only ever rendered below 768px, always full width.
                  sizes="100vw"
                  className="object-cover pointer-events-none transform group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="sheen-glow" />
              </div>
            ))}
          </div>

          {/* Dots Indicator */}
          {banners.length > 1 && (
            <div className="flex items-center justify-center pt-1 pb-0.5">
              {banners.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === activeIdx}
                  className="flex items-center justify-center w-6 h-5 p-0"
                >
                  <span
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === activeIdx ? "w-5 bg-hive-amber" : "w-1.5 bg-stone-300 hover:bg-stone-400"
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EditorialBannerBlock({ block }: { block: any }) {
  const router = useRouter();
  const banners = block.data?.banners || [];
  if (banners.length === 0) return null;

  const banner = banners[0];
  const desktopSrc = banner.desktopImage || banner.mobileImage || FALLBACK_BANNER;
  const mobileSrc = banner.mobileImage || banner.desktopImage || FALLBACK_BANNER;
  const targetUrl = banner.targetUrl || block.config?.targetUrl;
  const title = block.title || banner.title;
  const subtitle = block.subtitle;

  const renderer = block.renderer || "largeCards";
  const aspectRatio = block.config?.aspectRatio || (renderer === "squareCard" ? "square" : renderer === "editorialGrid" ? "portrait" : "landscape");
  const isSquare = aspectRatio === "square" || renderer === "squareCard";
  const isPortrait = aspectRatio === "portrait" || renderer === "editorialGrid";

  const handleNavigate = () => {
    if (targetUrl) router.push(targetUrl);
  };

  // 1. SQUARE BANNER / INSTAGRAM POST STYLE (1:1)
  if (isSquare) {
    const hasCopy = Boolean(title?.trim() || subtitle?.trim());

    return (
      <section className="w-full bg-white py-3 sm:py-5">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {/* Mobile View: Full 1:1 Square Card */}
          <div
            className="md:hidden banner-card group relative w-full aspect-square max-w-md mx-auto rounded-2xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
            onClick={handleNavigate}
          >
            <Image
              src={mobileSrc}
              alt={title || "Hive square banner"}
              fill
              sizes="(max-width: 768px) 100vw, 500px"
              className="object-cover pointer-events-none transform group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            {hasCopy && (
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white flex flex-col gap-1 pointer-events-none">
                {title && <h3 className="text-base font-serif font-bold leading-tight drop-shadow-sm">{title}</h3>}
                {subtitle && <p className="text-xs text-zinc-200 line-clamp-2 drop-shadow-sm">{subtitle}</p>}
              </div>
            )}
            <div className="sheen-glow" />
          </div>

          {/* Desktop View: Split Editorial if copy exists, or Centered Spotlight Card */}
          {hasCopy ? (
            <div
              className="hidden md:flex max-w-5xl mx-auto rounded-3xl overflow-hidden border border-hive-border/40 shadow-sm bg-gradient-to-r from-stone-50/90 via-white to-amber-50/30 group cursor-pointer transition-all duration-500 hover:shadow-md"
              onClick={handleNavigate}
            >
              <div className="w-1/2 aspect-square relative overflow-hidden bg-slate-100 flex-shrink-0">
                <Image
                  src={desktopSrc}
                  alt={title || "Hive editorial"}
                  fill
                  sizes="50vw"
                  className="object-cover pointer-events-none transform group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="sheen-glow" />
              </div>
              <div className="w-1/2 p-8 lg:p-12 flex flex-col justify-center items-start gap-3.5 text-left">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Hive Editorial</span>
                {title && (
                  <h2 className="text-3xl lg:text-4xl font-serif font-bold text-hive-dark tracking-tight leading-tight">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-sm text-slate-600 leading-relaxed max-w-md font-sans">
                    {subtitle}
                  </p>
                )}
                <div className="pt-2">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-950 text-white rounded-2xl text-xs font-bold uppercase tracking-wider group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-sm">
                    Explore Drop <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="hidden md:block banner-card group relative max-w-xl mx-auto aspect-square rounded-3xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer hover:shadow-md"
              onClick={handleNavigate}
            >
              <Image
                src={desktopSrc}
                alt={title || "Hive square banner"}
                fill
                sizes="600px"
                className="object-cover pointer-events-none transform group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="sheen-glow" />
            </div>
          )}
        </div>
      </section>
    );
  }

  // 2. PORTRAIT LOOKBOOK (4:5)
  if (isPortrait) {
    return (
      <section className="w-full bg-white py-3 sm:py-5">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div
            className="banner-card group relative w-full max-w-sm sm:max-w-md mx-auto aspect-[4/5] rounded-3xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
            onClick={handleNavigate}
          >
            <HeroPicture
              desktopSrc={desktopSrc}
              mobileSrc={mobileSrc}
              alt={title || "Hive lookbook banner"}
              priority={false}
            />
            {title && (
              <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/85 via-black/30 to-transparent text-white flex flex-col gap-1 pointer-events-none">
                <h3 className="text-lg font-serif font-bold leading-tight drop-shadow-sm">{title}</h3>
                {subtitle && <p className="text-xs text-zinc-200 line-clamp-2 drop-shadow-sm">{subtitle}</p>}
              </div>
            )}
            <div className="sheen-glow" />
          </div>
        </div>
      </section>
    );
  }

  // 3. WIDE LANDSCAPE BANNER (2.4:1 Desktop / 2:1 Mobile - Default)
  return (
    <section className="w-full bg-white pt-1 pb-0.5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className="banner-card group relative w-full aspect-[2/1] sm:aspect-[2.4/1] rounded-2xl overflow-hidden border border-hive-border/40 shadow-sm bg-slate-50 transform transition-all duration-500 cursor-pointer"
          onClick={handleNavigate}
        >
          <HeroPicture
            desktopSrc={desktopSrc}
            mobileSrc={mobileSrc}
            alt={title || "Hive campaign banner"}
            priority={false}
          />
          <div className="sheen-glow" />
        </div>
      </div>
    </section>
  );
}

export function ExperienceBlockRenderer({ block }: { block: any }) {
  const router = useRouter();
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // 1. HERO BANNERS (Global Carousel at Top)
  if (block.blockType === "hero") {
    const banners = block.data.banners || [];
    return <HeroBannerCarousel banners={banners} />;
  }

  // 2. EDITORIAL BANNERS (Between Collection Rows)
  if (block.blockType === "banner") {
    return <EditorialBannerBlock block={block} />;
  }

  // 2. CATEGORY BLOCK (Editorial Fashion Grid by default, or optional bubbles rail)
  if (block.blockType === "category") {
    const categories = block.data.categories || [];
    if (categories.length === 0) return null;

    if (block.renderer === "bubbles") {
      return (
        <section className="w-full bg-white dark:bg-neutral-950 py-4 sm:py-6 border-b border-hive-border/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2 text-left">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl sm:text-2xl font-serif font-semibold text-hive-dark dark:text-white tracking-wide">
                {block.title || "Shop by Category"}
              </h2>
              {block.subtitle && <p className="text-xs text-slate-500">{block.subtitle}</p>}
            </div>
            <div className="relative group/rail w-full">
              <div
                ref={categoryScrollRef}
                className="flex gap-4 sm:gap-6 pb-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] justify-start -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 scroll-pl-4 sm:scroll-pl-6"
              >
                {categories.map((subcat: any) => (
                  <button
                    key={subcat._id}
                    onClick={() => router.push(`/products/${encodeURIComponent(subcat.slug)}`)}
                    className="flex flex-col items-center gap-2.5 w-20 sm:w-24 flex-shrink-0 group cursor-pointer"
                  >
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border border-hive-border/40 bg-slate-50 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-md">
                      <Image
                        src={subcat.homepageImageUrl || subcat.imageUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80"}
                        alt={subcat.name}
                        fill
                        sizes="96px"
                        className="object-cover pointer-events-none"
                      />
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-white text-center leading-tight truncate w-full">
                      {subcat.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    // Default: High-End 2-Column Editorial Grid (Streetwear / Fashion Lookbook Style)
    return (
      <section className="w-full bg-white dark:bg-neutral-950 py-6 sm:py-8 md:py-12 border-b border-hive-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-4 sm:gap-6 text-left">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-neutral-900 dark:text-white tracking-tight uppercase">
              {block.title || "SHOP BY CATEGORY"}
            </h2>
            {block.subtitle && (
              <p className="text-xs sm:text-sm text-neutral-500 font-medium">
                {block.subtitle}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
            {categories.map((subcat: any) => {
              const imageSrc =
                subcat.homepageImageUrl ||
                subcat.imageUrl ||
                "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80";

              return (
                <button
                  key={subcat._id}
                  onClick={() => router.push(`/products/${encodeURIComponent(subcat.slug)}`)}
                  className="group relative aspect-[3/4] w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 shadow-sm hover:shadow-xl transition-all duration-300 active:scale-[0.98] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-hive-gold"
                  aria-label={`Shop ${subcat.name}`}
                >
                  {/* Category Image */}
                  <Image
                    src={imageSrc}
                    alt={subcat.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover object-center pointer-events-none transition-transform duration-700 ease-out group-hover:scale-105"
                  />

                  {/* Gradient Scrim for crisp text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 via-40% to-transparent pointer-events-none" />

                  {/* Overlay Content */}
                  <div className="absolute bottom-0 inset-x-0 p-3 sm:p-4 md:p-5 flex items-center justify-between gap-2 z-10">
                    <span className="text-white font-black text-sm sm:text-base md:text-lg tracking-wider uppercase truncate drop-shadow-sm">
                      {subcat.name}
                    </span>

                    {/* Circular Glassmorphism Action Arrow Button */}
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shrink-0 transition-all duration-300 group-hover:bg-white group-hover:text-black group-hover:scale-110 shadow-sm">
                      <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // 3. COLLECTIONS & PREMIUM CURATION (Product Grids, Carousels, MoodBoards, Premium Zara-Style Grids)
  if (block.blockType === "collection" || block.blockType === "premiumCuration") {
    // Mood Board
    if (block.renderer === "moodGrid" || block.renderer === "editorialGrid") {
      if (block.data.collection && block.data.products) {
        const displayCols = [ { ...block.data.collection, products: block.data.products.map(mapDbProduct) } ];
        return <MoodBoardGrid title={block.title} subtitle={block.subtitle} collections={displayCols} />;
      }
      return null;
    }

    let blockProducts = (block.data.products || [])
      .filter((p: any) => p.active !== false)
      .map(mapDbProduct);

    if (!blockProducts || blockProducts.length === 0) return null;

    const isCarousel = block.renderer === "productCarousel";
    const isTwoGrid = block.renderer === "twoProductGrid";
    const twoGridProducts = blockProducts.slice(0, block.config?.maxProducts || 8);
    // Premium Curation's full-bleed themed layout (background art, watermarks, generous padding)
    // is built to showcase a spread of products. Below a minimum count it reads as broken —
    // mostly empty decorative chrome around one floating card — so we fall back to the plain
    // grid renderer further below instead of forcing the full treatment on too little content.
    const PREMIUM_GRID_MIN_PRODUCTS = 3;
    const isPremiumGrid = block.renderer === "premiumGrid" && blockProducts.length >= PREMIUM_GRID_MIN_PRODUCTS;

    if (isPremiumGrid) {
      const productCount = blockProducts.length;
      const gridColsClass = productCount >= 5 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3";
      const sectionPaddingClass = productCount >= 5 ? "pt-10 pb-8 sm:pt-14 sm:pb-12" : "pt-8 pb-6 sm:pt-10 sm:pb-8";
      const bgImg = block.data?.bgImage || block.config?.bgImage || block.config?.desktopImage;
      const bgImgUrl = bgImg
        ? typeof bgImg === "string"
          ? bgImg
          // Full-bleed section background — "original" so it is not width-capped.
          : bgImg.url || (bgImg.objectKey ? getPublicUrl(bgImg, "original") : null)
        : null;

      const bgOverlayTheme = block.config?.bgOverlayTheme || "temple_heritage";
      const isDarkTheme = ["dark", "midnight_obsidian", "indigo_watercolor", "dark_vignette_blur"].includes(bgOverlayTheme);
      const isLightBg = !isDarkTheme;
      const cardCtaText = block.config?.cardCtaText || "Take a closer look →";

      const badgeTitle = block.config?.badgeTitle?.trim();
      const blockTitle = block.title?.trim();
      const blockSubtitle = block.subtitle?.trim();
      const hasHeader = Boolean(badgeTitle || blockTitle || blockSubtitle);

      // Resolve theme specific background colors & watermark colors
      const themeConfig = (() => {
        switch (bgOverlayTheme) {
          case "temple_heritage":
            return {
              bgClass: "bg-[#F8F3EA]",
              watermarkColor: "text-amber-900/35",
              accentColor: "text-amber-800",
            };
          case "ivory_mandala":
            return {
              bgClass: "bg-[#FAF6EE]",
              watermarkColor: "text-amber-800/30",
              accentColor: "text-amber-800",
            };
          case "mughal_floral":
            return {
              bgClass: "bg-[#FAF7F2]",
              watermarkColor: "text-amber-950/35",
              accentColor: "text-amber-900",
            };
          case "baroque_gold":
            return {
              bgClass: "bg-[#FDFBF7]",
              watermarkColor: "text-amber-700/30",
              accentColor: "text-amber-800",
            };
          case "indigo_watercolor":
            return {
              bgClass: "bg-[#0E1726]",
              watermarkColor: "text-sky-400/25",
              accentColor: "text-sky-300",
            };
          case "organic_linen":
            return {
              bgClass: "bg-[#F5F2EB]",
              watermarkColor: "text-stone-800/25",
              accentColor: "text-stone-700",
            };
          case "rose_blush":
            return {
              bgClass: "bg-[#FAF2F0]",
              watermarkColor: "text-rose-900/25",
              accentColor: "text-rose-800",
            };
          case "midnight_obsidian":
            return {
              bgClass: "bg-[#0B0B0C]",
              watermarkColor: "text-amber-400/20",
              accentColor: "text-amber-400",
            };
          case "soft_veil_light":
            return {
              bgClass: "bg-hive-cream",
              watermarkColor: "text-amber-900/20",
              accentColor: "text-amber-800",
            };
          case "dark_vignette_blur":
            return {
              bgClass: "bg-[#111111]",
              watermarkColor: "text-white/20",
              accentColor: "text-amber-400",
            };
          default:
            return {
              bgClass: isLightBg ? "bg-[#FAF7F2]" : "bg-[#111111]",
              watermarkColor: isLightBg ? "text-amber-900/30" : "text-amber-400/20",
              accentColor: isLightBg ? "text-amber-800" : "text-amber-400",
            };
        }
      })();

      return (
        <section className={`relative w-full overflow-hidden ${sectionPaddingClass} ${themeConfig.bgClass}`}>
          {/* Top Soft Feather Gradient Blend Layer */}
          <div className={`absolute top-0 inset-x-0 h-10 md:h-16 z-[2] pointer-events-none ${
            isLightBg 
              ? "bg-gradient-to-b from-white via-white/50 to-transparent" 
              : "bg-gradient-to-b from-slate-900/80 via-black/40 to-transparent"
          }`} />

          {/* Background Image with Dynamic Blending Veil */}
          {bgImgUrl && (
            <div className="absolute inset-0 w-full h-full z-0">
              <Image
                src={bgImgUrl}
                alt={blockTitle || "Premium Curation Background"}
                fill
                sizes="100vw"
                className="object-cover object-center"
              />
              <div className={`absolute inset-0 ${
                bgOverlayTheme === "dark_vignette_blur" || bgOverlayTheme === "midnight_obsidian"
                  ? "bg-black/65 backdrop-blur-[1.5px]"
                  : isLightBg
                    ? "bg-hive-cream/65 backdrop-blur-[0.5px]"
                    : "bg-black/50 backdrop-blur-[1px]"
              }`} />
            </div>
          )}

          {/* ── PINTEREST & HERITAGE SVG WATERMARK OVERLAYS ── */}
          {/* 1. Temple Heritage (Temple Gopuram + Lotus + Deepam Bell) */}
          {bgOverlayTheme === "temple_heritage" && (
            <>
              {/* Left: Temple Gopuram & Lotus Blossom */}
              <div className={`absolute top-0 left-0 w-36 sm:w-60 h-60 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 140 160" fill="none" stroke="currentColor">
                  {/* Temple Gopuram Spire Architecture */}
                  <path d="M70 10 L66 22 L74 22 Z" fill="currentColor" fillOpacity="0.25" strokeWidth="1" />
                  <path d="M60 22 L80 22 L84 38 L56 38 Z" strokeWidth="1" />
                  <path d="M52 38 L88 38 L94 58 L46 58 Z" strokeWidth="1" />
                  <path d="M42 58 L98 58 L106 82 L34 82 Z" strokeWidth="1.2" />
                  <path d="M30 82 L110 82 L120 115 L20 115 Z" strokeWidth="1.2" />
                  <path d="M20 115 L120 115 L120 150 L20 150 Z" strokeWidth="1.2" />
                  {/* Temple Arch Entrance */}
                  <path d="M50 150 C 50 125, 90 125, 90 150" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
                  {/* Blooming Lotus Watermark Base */}
                  <circle cx="70" cy="148" r="4" fill="currentColor" />
                  <path d="M70 142 C 60 135, 45 142, 48 152 C 55 156, 68 154, 70 148" fill="currentColor" fillOpacity="0.2" strokeWidth="0.8" />
                  <path d="M70 142 C 80 135, 95 142, 92 152 C 85 156, 72 154, 70 148" fill="currentColor" fillOpacity="0.2" strokeWidth="0.8" />
                </svg>
              </div>

              {/* Right: Hanging Temple Lamp & Brass Bell */}
              <div className={`absolute top-0 right-0 w-32 sm:w-52 h-52 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 120 140" fill="none" stroke="currentColor">
                  {/* Hanging Chain */}
                  <line x1="85" y1="0" x2="85" y2="40" strokeWidth="1.2" strokeDasharray="3 3" />
                  {/* Temple Bell */}
                  <path d="M75 40 C 75 35, 95 35, 95 40 L98 62 C 102 65, 102 70, 95 72 L75 72 C 68 70, 68 65, 72 62 Z" fill="currentColor" fillOpacity="0.15" strokeWidth="1.2" />
                  <circle cx="85" cy="74" r="2.5" fill="currentColor" />
                  {/* Hanging Floral Garland Beads */}
                  <circle cx="85" cy="85" r="1.5" fill="currentColor" />
                  <circle cx="85" cy="95" r="1.5" fill="currentColor" />
                  <circle cx="85" cy="105" r="2" fill="currentColor" />
                  {/* Mughal Corner Tendril */}
                  <path d="M110 50 C 95 70, 95 95, 115 110" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>
            </>
          )}

          {/* 2. Royal Gold Mandala Watermark */}
          {bgOverlayTheme === "ivory_mandala" && (
            <>
              <div className={`absolute -top-10 -left-10 w-44 sm:w-72 h-72 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                  <circle cx="100" cy="100" r="85" strokeWidth="1" strokeDasharray="4 4" />
                  <circle cx="100" cy="100" r="70" strokeWidth="1.2" />
                  <circle cx="100" cy="100" r="50" strokeWidth="0.8" />
                  <circle cx="100" cy="100" r="30" fill="currentColor" fillOpacity="0.08" strokeWidth="1.2" />
                  <circle cx="100" cy="100" r="8" fill="currentColor" />
                  {/* 16 Radial Petals */}
                  {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((deg) => (
                    <path
                      key={deg}
                      d="M100 100 L94 40 C 100 30, 100 30, 106 40 Z"
                      transform={`rotate(${deg} 100 100)`}
                      fill="currentColor"
                      fillOpacity="0.12"
                      strokeWidth="0.8"
                    />
                  ))}
                </svg>
              </div>
              <div className={`absolute -bottom-10 -right-10 w-44 sm:w-72 h-72 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                  <circle cx="100" cy="100" r="70" strokeWidth="1.2" />
                  <circle cx="100" cy="100" r="50" strokeWidth="0.8" />
                  <circle cx="100" cy="100" r="30" fill="currentColor" fillOpacity="0.08" strokeWidth="1.2" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <path
                      key={deg}
                      d="M100 100 L94 45 C 100 35, 100 35, 106 45 Z"
                      transform={`rotate(${deg} 100 100)`}
                      fill="currentColor"
                      fillOpacity="0.12"
                      strokeWidth="0.8"
                    />
                  ))}
                </svg>
              </div>
            </>
          )}

          {/* 3. Vintage Baroque Gold Frame */}
          {bgOverlayTheme === "baroque_gold" && (
            <>
              {/* Top-Left Baroque Corner Scroll */}
              <div className={`absolute top-0 left-0 w-32 sm:w-48 h-48 pointer-events-none z-[1] select-none ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                  <path d="M10 90 L10 20 C 10 10, 20 10, 90 10" strokeWidth="2" strokeLinecap="round" />
                  <path d="M18 85 L18 28 C 18 18, 28 18, 85 18" strokeWidth="0.8" strokeDasharray="3 3" />
                  {/* Acanthus Leaf Scroll Core */}
                  <circle cx="20" cy="20" r="6" fill="currentColor" fillOpacity="0.2" strokeWidth="1.2" />
                  <path d="M20 20 C 35 15, 45 25, 55 20 C 45 35, 35 35, 20 20" fill="currentColor" fillOpacity="0.15" />
                  <path d="M20 20 C 15 35, 25 45, 20 55 C 35 45, 35 35, 20 20" fill="currentColor" fillOpacity="0.15" />
                  <circle cx="55" cy="20" r="2" fill="currentColor" />
                  <circle cx="20" cy="55" r="2" fill="currentColor" />
                </svg>
              </div>
              {/* Top-Right Baroque Corner Scroll */}
              <div className={`absolute top-0 right-0 w-32 sm:w-48 h-48 pointer-events-none z-[1] select-none ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full transform scale-x-[-1]" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                  <path d="M10 90 L10 20 C 10 10, 20 10, 90 10" strokeWidth="2" strokeLinecap="round" />
                  <path d="M18 85 L18 28 C 18 18, 28 18, 85 18" strokeWidth="0.8" strokeDasharray="3 3" />
                  <circle cx="20" cy="20" r="6" fill="currentColor" fillOpacity="0.2" strokeWidth="1.2" />
                  <path d="M20 20 C 35 15, 45 25, 55 20 C 45 35, 35 35, 20 20" fill="currentColor" fillOpacity="0.15" />
                  <path d="M20 20 C 15 35, 25 45, 20 55 C 35 45, 35 35, 20 20" fill="currentColor" fillOpacity="0.15" />
                </svg>
              </div>
            </>
          )}

          {/* 4. Mughal / Meenakari Floral Ribbons (Default fallback / mughal_floral) */}
          {(bgOverlayTheme === "mughal_floral" || bgOverlayTheme === "light") && (
            <>
              {/* Left Kalka Paisley Block-Print */}
              <div className={`absolute top-0 left-0 w-32 sm:w-52 h-52 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 120 140" fill="none" stroke="currentColor">
                  <path
                    d="M25 125 C 10 95, 20 50, 60 20 C 85 2, 105 20, 85 45 C 65 70, 35 75, 42 105 C 48 128, 75 120, 65 135 Z"
                    fill="currentColor"
                    fillOpacity="0.06"
                    strokeWidth="1.2"
                  />
                  <circle cx="58" cy="42" r="8" fill="currentColor" fillOpacity="0.12" strokeWidth="1" />
                  <circle cx="58" cy="42" r="3" fill="currentColor" fillOpacity="0.25" />
                  <circle cx="28" cy="100" r="1.5" fill="currentColor" />
                  <circle cx="34" cy="55" r="1.5" fill="currentColor" />
                  <circle cx="62" cy="28" r="1.5" fill="currentColor" />
                  <path d="M42 105 C 30 115, 18 108, 12 95 C 8 85, 15 78, 22 84" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>

              {/* Right Mughal Floral Blossom */}
              <div className={`absolute top-0 right-0 w-32 sm:w-52 h-52 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 120 140" fill="none" stroke="currentColor">
                  <circle cx="65" cy="45" r="14" fill="currentColor" fillOpacity="0.08" strokeWidth="1.2" />
                  <circle cx="65" cy="45" r="6" fill="currentColor" fillOpacity="0.2" strokeWidth="0.8" />
                  <circle cx="65" cy="45" r="2" fill="currentColor" />
                  <path d="M65 27 C 62 33, 62 39, 65 45 C 68 39, 68 33, 65 27 Z" fill="currentColor" fillOpacity="0.18" />
                  <path d="M65 45 C 71 42, 77 42, 83 45 C 77 48, 71 48, 65 45 Z" fill="currentColor" fillOpacity="0.18" />
                  <path d="M65 45 C 62 51, 62 57, 65 63 C 68 57, 68 51, 65 45 Z" fill="currentColor" fillOpacity="0.18" />
                  <path d="M47 45 C 53 42, 59 42, 65 45 C 59 48, 53 48, 47 45 Z" fill="currentColor" fillOpacity="0.18" />
                  <path d="M65 63 C 75 80, 90 95, 105 105" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
            </>
          )}

          {/* 5. Indigo & Cyanotype Watercolor (Moodboard Theme) */}
          {bgOverlayTheme === "indigo_watercolor" && (
            <>
              {/* Greek Blue Eye & Botanical Blossom */}
              <div className={`absolute top-0 right-0 w-36 sm:w-60 h-60 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 140 140" fill="none" stroke="currentColor">
                  {/* Concentric Evil Eye Ripple */}
                  <circle cx="70" cy="70" r="55" strokeWidth="1.5" strokeDasharray="3 3" />
                  <circle cx="70" cy="70" r="42" fill="currentColor" fillOpacity="0.08" strokeWidth="1.2" />
                  <circle cx="70" cy="70" r="28" strokeWidth="1" />
                  <circle cx="70" cy="70" r="14" fill="currentColor" fillOpacity="0.25" />
                  <circle cx="70" cy="70" r="5" fill="#FFFFFF" fillOpacity="0.7" />
                  {/* Soft Botanical Bow Ribbons */}
                  <path d="M40 100 C 55 90, 85 90, 100 100" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M70 95 L65 125 M70 95 L75 125" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>
            </>
          )}

          {/* 6. Organic Linen & Pressed Botanicals */}
          {bgOverlayTheme === "organic_linen" && (
            <>
              {/* Eucalyptus Silhouette */}
              <div className={`absolute top-0 left-0 w-32 sm:w-52 h-52 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 100 120" fill="none" stroke="currentColor">
                  <path d="M10 110 C 30 90, 50 50, 70 10" strokeWidth="1.2" strokeLinecap="round" />
                  <ellipse cx="40" cy="75" rx="14" ry="8" transform="rotate(-30 40 75)" fill="currentColor" fillOpacity="0.12" strokeWidth="0.8" />
                  <ellipse cx="60" cy="45" rx="12" ry="7" transform="rotate(-40 60 45)" fill="currentColor" fillOpacity="0.12" strokeWidth="0.8" />
                  <ellipse cx="68" cy="20" rx="9" ry="5" transform="rotate(-45 68 20)" fill="currentColor" fillOpacity="0.15" strokeWidth="0.8" />
                </svg>
              </div>
            </>
          )}

          {/* 7. Blush Rose & Vermilion Silk */}
          {bgOverlayTheme === "rose_blush" && (
            <>
              {/* Rose Petal & Zari Filigree */}
              <div className={`absolute top-0 right-0 w-32 sm:w-52 h-52 pointer-events-none z-[1] select-none overflow-hidden ${themeConfig.watermarkColor}`}>
                <svg className="w-full h-full" viewBox="0 0 120 120" fill="none" stroke="currentColor">
                  <circle cx="60" cy="60" r="45" strokeWidth="1" strokeDasharray="2 2" />
                  <path d="M60 25 C 40 40, 40 80, 60 95 C 80 80, 80 40, 60 25 Z" fill="currentColor" fillOpacity="0.15" strokeWidth="0.8" />
                  <path d="M25 60 C 40 40, 80 40, 95 60 C 80 80, 40 80, 25 60 Z" fill="currentColor" fillOpacity="0.15" strokeWidth="0.8" />
                  <circle cx="60" cy="60" r="8" fill="currentColor" fillOpacity="0.2" />
                </svg>
              </div>
            </>
          )}

          {/* 8. Midnight Obsidian & Gold Dust */}
          {bgOverlayTheme === "midnight_obsidian" && (
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse opacity-60" />
              <div className="absolute top-1/3 right-1/3 w-1 h-1 rounded-full bg-amber-200 animate-pulse opacity-50" />
              <div className="absolute bottom-1/4 right-1/4 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse opacity-70" />
              <div className="absolute bottom-1/3 left-1/3 w-1 h-1 rounded-full bg-amber-100 animate-pulse opacity-40" />
            </div>
          )}

          <div className={`relative z-10 max-w-[1440px] mx-auto px-6 lg:px-12 flex flex-col items-center gap-8 ${isLightBg ? "text-stone-900" : "text-white"}`}>
            {/* Luxury Header - Only rendered if at least one header field is provided */}
            {hasHeader && (
              <div className="flex flex-col items-center text-center max-w-2xl gap-1.5 pt-2">
                {badgeTitle && (
                  <span className={`text-[10px] tracking-[0.3em] font-bold uppercase ${themeConfig.accentColor}`}>
                    {badgeTitle}
                  </span>
                )}
                
                {blockTitle && (
                  <h2 className={`text-3xl md:text-5xl lg:text-6xl font-cormorant font-normal tracking-tight ${isLightBg ? "text-stone-900" : "text-white"} leading-[1.15] drop-shadow-xs`}>
                    {blockTitle}
                  </h2>
                )}
                
                {blockSubtitle && (
                  <p className={`text-sm md:text-base lg:text-lg font-cormorant italic mt-1 ${isLightBg ? "text-stone-600" : "text-stone-300"} font-normal leading-relaxed`}>
                    {blockSubtitle}
                  </p>
                )}
              </div>
            )}

            {/* Floating Borderless Standalone Cards */}
            <div className={`grid ${gridColsClass} gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 w-full mt-2`}>
              {blockProducts.slice(0, block.config?.maxProducts || 6).map((product: any) => (
                <div key={product.id} className="premium-card-wrapper scale-100 transition-transform duration-500 hover:-translate-y-1 bg-transparent p-0 border-none shadow-none">
                  <ProductCard 
                    product={product} 
                    hidePrice={true} 
                    hideQuickView={true} 
                    darkTheme={!isLightBg}
                    customCtaText={cardCtaText}
                    premiumMode={true}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className={`w-full bg-white pt-5 pb-1 sm:pt-8 sm:pb-2 border-b border-hive-border/20 ${block.config?.theme === "dark" ? "bg-slate-900 text-white" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2 sm:gap-2.5 text-left">
          <div className="flex flex-col gap-1 cursor-pointer group" onClick={() => {
            if(block.data.collection?.slug) {
              router.push(`/collections/${block.data.collection.slug}`);
            }
          }}>
            <h2 className={`text-2xl font-serif font-semibold tracking-wide group-hover:underline ${block.config?.theme === "dark" ? "text-white" : "text-hive-dark"}`}>
              {block.title || block.data.collection?.name}
            </h2>
            {block.subtitle && <p className={`text-sm ${block.config?.theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>{block.subtitle}</p>}
          </div>

          {isCarousel ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x scroll-smooth scroll-pl-4 sm:scroll-pl-6 lg:scroll-pl-8">
              {blockProducts.map((product: any) => (
                <div key={product.id} className="w-[140px] sm:w-[190px] flex-shrink-0 snap-start">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : isTwoGrid ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6 w-full">
              {twoGridProducts.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 w-full">
              {blockProducts.slice(0, block.config?.maxProducts || 12).map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // 4. SMART PRODUCT RAIL / RECENTLY VIEWED / RECOMMENDED / NEW ARRIVALS
  if (block.blockType === "smartRail" || block.blockType === "recentlyViewed" || block.blockType === "recommended" || block.blockType === "newArrivals") {
    const isSmartRail = block.blockType === "smartRail";
    const isRecommended = block.blockType === "recommended";
    const isNewArrivals = block.blockType === "newArrivals" || (isSmartRail && (block.config?.ruleType === "newArrivals" || !block.config?.ruleType));
    const isPriceCeiling = isSmartRail && block.config?.ruleType === "priceCeiling";
    const isCategoryAuto = isSmartRail && block.config?.ruleType === "categoryAuto";
    const isTwoGrid = block.renderer === "twoProductGrid";
    const isGrid = block.renderer === "productGrid" || block.renderer === "grid";
    const isCarousel = !isTwoGrid && !isGrid;
    const maxItems = block.config?.maxProducts || 8;
    // Set by BlockService when this section is actually ranked from the shopper's own view
    // history — as opposed to the generic recency-ranked fallback everyone else sees.
    const isPersonalized = block.data?.isPersonalized === true;

    const allProducts = (block.data?.products || [])
      .filter((p: any) => p.active !== false)
      .map(mapDbProduct);

    if (allProducts.length === 0) return null;

    const displayProducts = allProducts.slice(0, maxItems);
    const bgClass = (isNewArrivals || isSmartRail || isRecommended) ? "bg-white" : "bg-hive-cream";
    const isRecentlyViewedFallback = block.blockType === "recentlyViewed" && !isPersonalized;
    const tagText = isPriceCeiling
      ? "BUDGET FINDS"
      : isCategoryAuto
        ? "EXPLORE COLLECTION"
        : isNewArrivals
          ? "FRESH ARRIVALS"
          : isRecommended
            ? (isPersonalized ? "BASED ON WHAT YOU'VE VIEWED" : "TRENDING NOW")
            : (isPersonalized ? "PICK UP WHERE YOU LEFT OFF" : "ON THE MOODBOARD");

    const titleText = isRecentlyViewedFallback
      ? "What Everyone's Eyeing"
      : (block.title || (isPriceCeiling ? "Budget Finds" : (isNewArrivals ? "New on Hive" : (isRecommended ? "Recommended" : "Most Loved"))));
    
    const targetUrl = isPriceCeiling
      ? `/products?maxPrice=${block.config?.priceCeiling || 1500}`
      : isNewArrivals
        ? "/products?sort=newest"
        : "/products";
    
    return (
      <section className={`w-full ${bgClass} pt-2 pb-5 sm:pt-3 sm:pb-7 border-b border-hive-border/20`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2.5 text-left">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-hive-amber tracking-widest uppercase">
                {tagText}
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-semibold text-hive-dark uppercase tracking-wide">
                {titleText}
              </h2>
            </div>
            <Link
              href={targetUrl}
              className="text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors flex items-center gap-1 group pb-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {isCarousel ? (
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x scroll-smooth scroll-pl-4 sm:scroll-pl-6 lg:scroll-pl-8">
              {displayProducts.map((product: any) => (
                <div key={product.id} className="w-[140px] sm:w-[190px] flex-shrink-0 snap-start">
                  <ProductCard product={product} />
                </div>
              ))}

              {/* Trailing Minimalist End-Cap Card */}
              <div className="w-[140px] sm:w-[190px] flex-shrink-0 snap-start flex flex-col justify-start group select-none">
                <Link
                  href={targetUrl}
                  className="w-full aspect-[4/5] rounded-xl sm:rounded-2xl bg-hive-cream border border-stone-200/80 shadow-2xs relative overflow-hidden flex flex-col items-center justify-center p-4 text-center transition-all duration-300 group-hover:shadow-md group-hover:border-stone-400 group-hover:-translate-y-0.5 cursor-pointer"
                >
                  {/* Tactile Circular Button */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-stone-900 shadow-2xs border border-stone-200 flex items-center justify-center group-hover:bg-stone-900 group-hover:text-white group-hover:scale-105 transition-all duration-300 mb-3">
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </div>

                  {/* Single Clean Text */}
                  <span className="text-xs sm:text-sm font-serif font-bold text-stone-900 group-hover:underline transition-colors block">
                    {isNewArrivals ? "See All Drops" : "See All Items"}
                  </span>
                </Link>
              </div>
            </div>
          ) : isTwoGrid ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6 w-full">
              {displayProducts.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 w-full">
              {displayProducts.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // 5. TRUST STRIP
  if (block.blockType === "trust") {
    return <TrustStrip />;
  }

  // 6. PINTEREST VIBE GRID (PURE TRANSPARENT CUTOUT ARCHITECTURE - NO BACKGROUND BOX)
  if (block.blockType === "vibeGrid") {
    const items = block.config?.items || [];
    if (items.length === 0) return null;

    return (
      <section className="w-full bg-white pt-1 pb-0 sm:pt-1.5 sm:pb-0.5 border-b border-hive-border/20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {block.title && (
            <h2 className="text-lg sm:text-xl font-serif font-medium text-slate-800 tracking-normal mb-0.5">
              {block.title}
            </h2>
          )}
          {block.subtitle && (
            <p className="text-xs text-slate-500 mb-1">{block.subtitle}</p>
          )}

          {/* Pure Cutout Layout: Mobile Edge-to-Edge Swipe Rail / Desktop Flex Row */}
          <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible gap-4 sm:gap-6 mt-1 mb-0 pb-1 -mx-6 px-6 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x scroll-pl-6">
            {items.map((item: any, idx: number) => {
              const imgUrl = item.imageUrl
                ? typeof item.imageUrl === "string"
                  ? item.imageUrl
                  : item.imageUrl?.url || getPublicUrl(item.imageUrl, "card")
                : null;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (item.targetUrl) router.push(item.targetUrl);
                  }}
                  className="relative group cursor-pointer flex flex-col items-center justify-start select-none w-28 sm:w-32 md:w-36 flex-shrink-0 snap-start transition-transform duration-300 transform group-hover:-translate-y-1"
                >
                  {/* Standalone Model Cutout Image (Dynamic Height, Zero White Space Gap) */}
                  {imgUrl && (
                    <div className="relative w-full h-auto flex items-start justify-center overflow-visible">
                      <img
                        src={imgUrl}
                        alt={item.brandName || "Vibe Cutout"}
                        className="w-full h-auto max-h-56 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}

                  {/* Clean Typography Underlay */}
                  <div className="text-center mt-1.5 flex flex-col items-center justify-center w-full">
                    {item.brandName && (
                      <h3 className="text-slate-900 font-serif font-bold text-xs sm:text-sm tracking-wider uppercase leading-tight truncate w-full">
                        {item.brandName}
                      </h3>
                    )}
                    {item.offerText && (
                      <span className="text-amber-600 font-sans font-extrabold text-[9px] sm:text-[10px] tracking-widest uppercase mt-0.5">
                        {item.offerText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (process.env.NODE_ENV !== "production") {
    // Surfaces CMS misconfiguration (a blockType/renderer combo this component doesn't handle)
    // instead of silently dropping the block with no signal to whoever is editing the homepage.
    console.warn(
      `[ExperienceBlockRenderer] No renderer matched block "${block.blockKey || block.id}" (blockType="${block.blockType}", renderer="${block.renderer}"). It will not be shown.`
    );
  }
  return null;
}
