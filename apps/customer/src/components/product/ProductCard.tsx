"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductCardData } from "@/lib/mockProducts";
import { Heart, Eye, Star } from "lucide-react";
import { cn } from "@hive/ui";
import { useWishlistStore } from "@/store/wishlist-store";
import { useLocation } from "@/context/LocationContext";
import { QuickViewModal } from "./QuickViewModal";
import { calculateDistanceKm } from "@/lib/distance";
import { useSessionStore } from "@/context/SessionContext";
import { useRouter } from "next/navigation";
import { navigateToSignIn } from "@/lib/auth-redirect";

import { calculateCardPricing } from "@/lib/pricing";
import { getBoutiqueStatus } from "../../../../../convex/shared/boutiqueStatus";

export interface ProductCardProps {
  product: ProductCardData;
  onQuickView?: (slug: string) => void;
  isRecommendation?: boolean;
  hidePrice?: boolean;
  hideQuickView?: boolean;
  darkTheme?: boolean;
  customCtaText?: string;
  premiumMode?: boolean;
  priority?: boolean;
}

// Clean database/AI suffixes from product titles
export function cleanProductTitle(name: string): string {
  if (!name) return "";
  return name
    .replace(/\s*-\s*[A-Za-z0-9\s]+#\d+$/, "") // removes " - Kochi #6", " - Palarivattom #72", etc.
    .replace(/\s*#\d+$/, "") // removes " #18", etc.
    .replace(/\s*\(Out of Stock\)$/i, "") // removes "(Out of Stock)"
    .trim();
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onQuickView, isRecommendation, hidePrice, hideQuickView, darkTheme, customCtaText, premiumMode, priority }) => {
  const { toggleItem, hasItem } = useWishlistStore();
  const [hydrated, setHydrated] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [localQuickViewOpen, setLocalQuickViewOpen] = useState(false);
  const { isAuthenticated } = useSessionStore();
  const router = useRouter();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const { latitude: userLat, longitude: userLng, city } = useLocation();
  const boutique = (product as any).boutique;

  const isFavorite = hydrated ? hasItem(product.slug) : false;

  // Guard clause to protect empty state and avoid placeholder images in production
  const isInvalid = !product.imageUrl || 
                    product.imageUrl.trim() === "" || 
                    product.imageUrl.includes("placeholder") ||
                    (product as any).active === false || 
                    ((product as any).approvalStatus && (product as any).approvalStatus !== "approved");

  const deliveryBadge = React.useMemo(() => {
    if (userLat === null || userLng === null) return null;
    const bLat = boutique?.latitude ?? boutique?.addressDetails?.lat;
    const bLng = boutique?.longitude ?? boutique?.addressDetails?.lng;
    const bRad = boutique?.deliveryRadiusKm ?? 15;

    if (bLat === undefined || bLng === undefined) {
      const deliversToCity = boutique?.city ? city && boutique.city.toLowerCase() === city.toLowerCase() : true;
      return {
        label: deliversToCity ? `✓ Delivers to ${city}` : "✗ Outside your area",
        isServiceable: deliversToCity
      };
    }

    const dist = calculateDistanceKm(userLat, userLng, bLat, bLng);
    const isServiceable = dist <= bRad;
    return {
      label: isServiceable ? `✓ ${dist.toFixed(1)} km away` : "✗ Outside your area",
      isServiceable
    };
  }, [userLat, userLng, boutique, city]);

  // Clean logistics metadata single line (plain text, no badges, no icons, fashion-oriented).
  // The promise is resolved server-side wherever possible (convex/lib/deliveryEta.ts), which is
  // the only place that knows the boutique's real hours, prep time and distance to the shopper.
  // The fallback below only runs when no server label reached us — a guest with no location on a
  // path that skips OperationsService — and is pinned to IST rather than the device clock, since
  // Hive delivers in one city and a traveller's local time says nothing about a Kochi rider.
  const logisticsText = React.useMemo(() => {
    if (isInvalid) return null;

    const serverLabel = (product as any).deliveryLabel;
    if (serverLabel) return serverLabel;

    const isSameDay = product.sameDayDelivery || product.sameDayDelivery === undefined;
    if (!isSameDay) return "Express Delivery";

    const istHour = new Date(Date.now() + 330 * 60_000).getUTCHours();
    return (istHour >= 9 && istHour < 20) ? "90-Min Delivery" : "Delivers Tomorrow";
  }, [product, isInvalid]);

  if (isInvalid) {
    return null;
  }

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    toggleItem({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      imageUrl: product.imageUrl,
      boutiqueName: product.boutiqueName,
      rating: product.rating,
      reviewCount: product.reviewCount,
      sizes: product.sizes,
      stockBySize: product.stockBySize,
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 300);
  };

  const handleQuickViewOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onQuickView) {
      onQuickView(product.slug);
    } else {
      setLocalQuickViewOpen(true);
    }
  };

  // Card data is already in rupees (mapDbProduct / getCatalogPage / wishlist). Converting it as a
  // stored product would divide it by 100 a second time.
  const pricing = calculateCardPricing(product);
  const displayPrice = pricing.price;
  const compareAtPrice = pricing.compareAtPrice;
  const discountPercent = pricing.discountPercent;

  // Derive collection/category label (standardized merchandising)
  const collectionLabel = getCollectionLabel(product.occasion);

  const isSoldOut = hydrated && product.stockBySize && Object.values(product.stockBySize).reduce((sum, val) => sum + (val || 0), 0) <= 0;

  return (
    <div className="relative w-full h-full flex flex-col group select-none transition-all duration-300 bg-transparent border-none">
      
      {/* ── Image area (4:5 Aspect Ratio, rounded-xl sm:rounded-2xl) ── */}
      <div className={cn(
        "relative w-full overflow-hidden bg-stone-50 transform translate-z-0 transition-all",
        premiumMode ? "aspect-square rounded-[24px]" : "aspect-[4/5] rounded-xl sm:rounded-2xl"
      )} style={{ aspectRatio: premiumMode ? "1/1" : "4/5" }}>
        
        {/* Product image link */}
        <Link href={`/products/${product.slug}`} prefetch={false} className="absolute inset-0 block w-full h-full z-10">
          {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                priority={priority}
                loading={priority ? undefined : "lazy"}
                className={cn(
                  "object-cover w-full h-full pointer-events-none transform group-hover:scale-[1.02] transition-transform duration-200 ease-out"
                )}
                style={{ objectFit: "cover" }}
              />
          ) : (
            <div className="absolute inset-0 bg-stone-100 flex flex-col items-center justify-center text-stone-600 p-4">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400">No Image</span>
            </div>
          )}
        </Link>

        {/* Wishlist heart overlay (Floating direct on photo) */}
        <button
          onClick={toggleFavorite}
          aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
          className={cn(
            "absolute top-2.5 right-2.5 p-1 z-20 transition-all active:scale-75 cursor-pointer outline-none focus:outline-none",
            pulse && "scale-125"
          )}
        >
          <Heart
            className={cn(
              "w-5 h-5 transition-all duration-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]",
              isFavorite
                ? "fill-[#F5C22B] stroke-[#F5C22B] scale-110 drop-shadow-[0_2px_8px_rgba(245,194,43,0.6)]"
                : "stroke-white fill-black/15 hover:scale-110 hover:stroke-[#F5C22B]"
            )}
            strokeWidth={isFavorite ? 2.5 : 2}
          />
        </button>

        {/* Quick View eye icon overlay (Hidden for now as requested) */}
        {false && !hideQuickView && (
          <button
            onClick={handleQuickViewOpen}
            aria-label="Quick look"
            className="absolute top-14 right-2.5 w-8 h-8 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center border border-white/20 text-stone-700 hover:text-hive-dark hover:bg-white shadow-sm z-20 transition-all active:scale-90 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <Eye className="w-4 h-4 text-hive-dark stroke-[2]" />
          </button>
        )}
      </div>

      {/* ── Card content (Clean, compact layout below image) ── */}
      <div className="pt-1.5 pb-0.5 px-0.5 flex flex-col text-left justify-start gap-0.5 sm:gap-1">
        {/* Boutique Name */}
        <Link
          href={`/shop/${boutique?.slug || (product as any).boutiqueId || (product as any).boutique?.id || ""}`}
          prefetch={false}
          className={cn(
            "text-[9.5px] sm:text-[10px] uppercase transition-colors leading-none block truncate tracking-wider",
            premiumMode 
              ? "text-stone-400 font-medium"
              : (darkTheme ? "text-amber-400/80 hover:text-amber-300 font-medium" : "text-stone-400 hover:text-stone-600 font-medium")
          )}
        >
          {product.boutiqueName || boutique?.name || boutique?.boutiqueName || "Hive Boutique"}
        </Link>

        {/* Product Title */}
        <Link href={`/products/${product.slug}`} prefetch={false} className="hover:opacity-80 transition-opacity block leading-tight">
          <h3 className={cn(
            "text-xs sm:text-sm truncate leading-snug",
            premiumMode 
              ? "font-serif text-stone-800 dark:text-stone-100 font-normal" 
              : (darkTheme ? "font-medium text-white" : "font-semibold text-stone-900")
          )}>
            {cleanProductTitle(product.name)}
          </h3>
        </Link>

        {/* Rating — only when the product actually has one, never a fabricated default */}
        {typeof product.rating === "number" && product.rating > 0 && (
          <div className={cn("flex items-center gap-1 text-[10px] leading-none", darkTheme ? "text-white/70" : "text-slate-500")}>
            <Star className="w-3 h-3 fill-hive-dark text-hive-dark" />
            <span className="font-semibold">{product.rating.toFixed(1)}</span>
            {typeof product.reviewCount === "number" && product.reviewCount > 0 && (
              <span className={darkTheme ? "text-white/40" : "text-slate-400"}>({product.reviewCount})</span>
            )}
          </div>
        )}

        {/* Price or Custom CTA Link */}
        {hidePrice ? (
          customCtaText ? (
            <Link
              href={`/products/${product.slug}`}
              prefetch={false}
              className={cn(
                "group/cta inline-flex items-center gap-1 text-xs font-serif italic transition-all duration-300 pt-0.5",
                premiumMode 
                  ? "text-stone-700 font-normal hover:text-stone-950 dark:text-stone-300"
                  : (darkTheme ? "text-amber-300 hover:text-white font-medium" : "text-amber-900 hover:text-amber-700 dark:text-amber-300 font-medium")
              )}
            >
              <span>{customCtaText}</span>
            </Link>
          ) : null
        ) : (
          <div className={cn("text-xs sm:text-sm md:text-base font-bold leading-none flex items-baseline flex-wrap gap-1.5 pt-0.5", darkTheme ? "text-amber-300" : "text-stone-950")}>
            <span>₹{displayPrice.toLocaleString("en-IN")}</span>
            {compareAtPrice !== undefined && compareAtPrice > displayPrice && (
              <>
                <span className={cn("text-[10.5px] sm:text-xs line-through font-normal", darkTheme ? "text-white/50" : "text-stone-400")}>
                  ₹{compareAtPrice.toLocaleString("en-IN")}
                </span>
                <span className={cn("text-[10px] sm:text-[10.5px] font-bold tracking-tight text-emerald-700 dark:text-emerald-400")}>
                  ({discountPercent}% OFF)
                </span>
              </>
            )}
          </div>
        )}

        {logisticsText && !hidePrice && (
          <span className={cn("text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider pt-0.5 leading-none", darkTheme ? "text-amber-400/90" : "text-amber-700")}>
            {logisticsText}
          </span>
        )}
      </div>

      {localQuickViewOpen && (
        <QuickViewModal
          isOpen={localQuickViewOpen}
          onClose={() => setLocalQuickViewOpen(false)}
          productSlug={product.slug}
          initialProduct={product}
        />
      )}

      {/* Auth Gate Bottom Sheet Modal */}
      {showAuthPrompt && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowAuthPrompt(false);
          }}
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-[28px] p-6 pb-8 flex flex-col items-center gap-4 text-center border-t border-hive-border/30 shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div className="w-12 h-1 bg-stone-200 dark:bg-stone-800 rounded-full mb-1" />
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-full text-hive-amber">
              <Heart className="w-6 h-6 fill-current" />
            </div>
            <h3 className="text-lg font-serif font-black text-hive-dark dark:text-white uppercase tracking-wide">Sign in to save to wishlist</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs leading-relaxed font-medium">
              Create an account or sign in to save your favorite designer items and get notified about price drops and inventory updates.
            </p>
            <div className="flex flex-col gap-2.5 w-full pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAuthPrompt(false);
                  navigateToSignIn(router);
                }}
                className="w-full py-3 bg-[#111111] hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md active:scale-[0.98]"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setShowAuthPrompt(false)}
                className="w-full py-3 bg-stone-50 hover:bg-stone-100 dark:bg-neutral-800 border border-stone-200 dark:border-neutral-700 text-stone-600 dark:text-stone-300 font-bold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to map category names cleanly
function getCollectionLabel(occasion?: string) {
  if (!occasion) return "General Wear";
  if (occasion === "coords") return "Co-ords Edit";
  if (occasion === "wedding") return "Wedding Season";
  if (occasion === "festival") return "Festive Collection";
  if (occasion === "ethnic") return "Ethnic Staples";
  if (occasion === "party") return "Evening Party";
  if (occasion === "date") return "Date Night Edit";
  if (occasion === "workwear") return "Office Staples";
  return `${occasion.charAt(0).toUpperCase()}${occasion.slice(1)} Wear`;
}
