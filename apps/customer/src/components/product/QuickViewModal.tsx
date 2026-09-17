"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Modal } from "@hive/ui";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";
import { useCart } from "@/context/CartContext";
import { useLocation } from "@/context/LocationContext";
import { useSessionStore } from "@/context/SessionContext";
import { checkServiceability } from "../../../../../convex/lib/serviceability";
import { inrToPaise, toast } from "@hive/utils";
import { mapDbProduct } from "@/lib/mapDbProduct";
import { calculateCardPricing } from "@/lib/pricing";
import { getBoutiqueStatus } from "../../../../../convex/shared/boutiqueStatus";
import {
  ShieldCheck,
  ShoppingBag,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Heart,
  X
} from "lucide-react";
import { cn } from "@hive/ui";
import { cleanProductTitle } from "./ProductCard";
import { DeliveryCountdownPill } from "./DeliveryCountdownPill";

function formatNextDayLabel(dateStr: string): string {
  try {
    const parts = dateStr.split("-").map(Number);
    const year = parts[0] || 2026;
    const month = parts[1] || 1;
    const day = parts[2] || 1;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

interface QuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  productSlug: string;
  initialProduct?: {
    name: string;
    imageUrl: string;
    price: number;
    compareAtPrice?: number;
    boutiqueName?: string;
    sizes?: string[];
    stockBySize?: Record<string, number>;
    images?: string[];
    [key: string]: any;
  };
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  isOpen,
  onClose,
  productSlug,
  initialProduct
}) => {
  const router = useRouter();
  const rawProduct = useQuery(api.products.getProduct, { slug: productSlug });
  const { latitude, longitude, city, locality } = useLocation();
  const addItem = useCartStore((state) => state.addItem);
  const { setSidebarOpen } = useCart();

  const [selectedSize, setSelectedSize] = useState<string>("");
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [crossBoutiqueModalOpen, setCrossBoutiqueModalOpen] = useState(false);
  
  // Touch event state for mobile swipe down
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50;

  const clearCartMutation = useMutation(api.cart.clearCart).withOptimisticUpdate((localStore, args) => {
    const tokenQueryArg = { token: token || undefined };
    const cart = localStore.getQuery(api.cart.getCart, tokenQueryArg);
    if (cart) {
      localStore.setQuery(
        api.cart.getCart,
        tokenQueryArg,
        {
          items: [],
          hasIssues: false,
          blockingReason: undefined,
        }
      );
    }
  });
  
  const { token, isAuthenticated } = useSessionStore();
  const logFunnelEvent = useMutation(api.analytics.logFunnelEvent);

  const product = useMemo(() => {
    if (!rawProduct) return rawProduct;
    return mapDbProduct(rawProduct);
  }, [rawProduct]);

  // Track when cross-boutique modal is shown
  useEffect(() => {
    if (crossBoutiqueModalOpen && product) {
      logFunnelEvent({
        eventType: "cross_boutique_modal_shown",
        productId: product.slug as any,
        boutiqueId: product.boutiqueId as any,
      }).catch(err => console.error("Failed to log analytics:", err));
    }
  }, [crossBoutiqueModalOpen, product, logFunnelEvent]);

  // Reset local state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedSize("");
      setActiveImageIdx(0);
      setAdding(false);
      setCrossBoutiqueModalOpen(false);
    }
  }, [isOpen, productSlug]);

  // Handle keyboard Escape close and Focus Trapping
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Disable body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const [mounted, setMounted] = useState(typeof window !== "undefined");
  useEffect(() => {
    if (!mounted) setMounted(true);
  }, [mounted]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndY.current = null;
    touchStartY.current = e.targetTouches[0]?.clientY ?? 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.targetTouches[0]?.clientY ?? 0;
  };

  const onTouchEnd = () => {
    if (!touchStartY.current || !touchEndY.current) return;
    const distance = touchEndY.current - touchStartY.current;
    if (distance > SWIPE_THRESHOLD) {
      onClose();
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const modalRoot = document.getElementById("modal-root") || document.body;
  if (!modalRoot) return null;

  if (product === undefined && !initialProduct) {
    return createPortal(
      <div 
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
        <div className="bg-white shadow-2xl flex flex-col w-full border border-stone-100 z-10 h-full max-h-[40vh] md:h-auto md:max-w-md md:rounded-[24px] rounded-t-[24px] overflow-hidden justify-center items-center p-10 relative">
          <Loader2 className="w-8 h-8 animate-spin text-stone-850" />
          <span className="text-xs text-stone-500 font-medium tracking-wide mt-3">
            Retrieving product...
          </span>
        </div>
      </div>,
      modalRoot
    );
  }

  if (product === null || (rawProduct as any)?.isUnavailable) {
    return createPortal(
      <div 
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
        <div className="bg-white shadow-2xl flex flex-col w-full border border-stone-100 z-10 h-full max-h-[40vh] md:h-auto md:max-w-md md:rounded-[24px] rounded-t-[24px] overflow-hidden items-center justify-center p-10 text-center gap-3 relative">
          <span className="text-lg font-serif font-semibold text-stone-900">Unavailable</span>
          <p className="text-xs text-stone-500 max-w-xs">
            This item is no longer available in our collection.
          </p>
          <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-stone-950 text-white hover:bg-stone-900 rounded-full text-xs font-medium uppercase tracking-wider transition-all">
            Close
          </button>
        </div>
      </div>,
      modalRoot
    );
  }
  // Use enriched product from Convex if available, otherwise fall back to initialProduct from card
  const displayProduct = product || (initialProduct ? {
    ...initialProduct,
    id: initialProduct.id || "",
    slug: productSlug,
    name: initialProduct.name || "",
    imageUrl: initialProduct.imageUrl || "",
    price: initialProduct.price || 0,
    compareAtPrice: initialProduct.compareAtPrice,
    boutiqueName: initialProduct.boutiqueName || "",
    boutiqueId: initialProduct.boutiqueId || "",
    sizes: initialProduct.sizes || [],
    stockBySize: initialProduct.stockBySize || {},
    images: initialProduct.images || (initialProduct.imageUrl ? [initialProduct.imageUrl] : []),
    discountPercent: initialProduct.compareAtPrice 
      ? Math.round(((initialProduct.compareAtPrice - initialProduct.price) / initialProduct.compareAtPrice) * 100) 
      : 0,
    boutique: initialProduct.boutique || null,
  } : null) as any;

  if (!displayProduct) {
    return createPortal(
      <div 
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
        <div className="bg-white shadow-2xl flex flex-col w-full border border-stone-100 z-10 h-full max-h-[40vh] md:h-auto md:max-w-md md:rounded-[24px] rounded-t-[24px] overflow-hidden justify-center items-center p-10 relative">
          <Loader2 className="w-8 h-8 animate-spin text-stone-850" />
          <span className="text-xs text-stone-500 font-medium tracking-wide mt-3">
            Retrieving product...
          </span>
        </div>
      </div>,
      modalRoot
    );
  }

  const isStillLoading = product === undefined;

  const stockMap: Record<string, number> = displayProduct.stockBySize ?? {};
  const currentStock = selectedSize ? (stockMap[selectedSize] ?? 0) : 0;
  const isOutOfStock = selectedSize ? currentStock === 0 : false;

  const isLocationServiceable = (() => {
    if (latitude === null || longitude === null) return true;
    return checkServiceability(latitude, longitude, displayProduct.boutique as any).serviceable;
  })();

  const boutiqueStatus = displayProduct.boutique
    ? getBoutiqueStatus(displayProduct.boutique, Date.now())
    : { type: "OPEN" as const };
  const isStoreOffline = boutiqueStatus.type === "PAUSED";
  const isPreorderMode = boutiqueStatus.type === "CLOSED_TODAY" || boutiqueStatus.type === "CLOSED_EXTENDED";

  const handleClearAndContinue = async () => {
    setCrossBoutiqueModalOpen(false);
    
    // Log replacement event
    logFunnelEvent({
      eventType: "cross_boutique_replace_selected",
      productId: displayProduct.slug as any,
      boutiqueId: displayProduct.boutiqueId as any,
    }).catch(err => console.error("Failed to log analytics:", err));
    
    // Auto-save existing items to Wishlist so nothing is lost
    const items = useCartStore.getState().items;
    const toggleItem = useWishlistStore.getState().toggleItem;
    const hasItem = useWishlistStore.getState().hasItem;
    for (const item of items) {
      if (item.productId && !hasItem(item.productId)) {
        toggleItem({
          id: item.productId,
          slug: item.productId,
          name: item.name,
          price: item.price,
          imageUrl: item.imageUrl || "",
          boutiqueName: item.boutiqueName || "",
        });
      }
    }

    const clearCartZustand = useCartStore.getState().clearCart;
    clearCartZustand();
    
    if (isAuthenticated && token) {
      try {
        await clearCartMutation({ token });
      } catch (err) {
        console.error("Failed to clear Convex cart:", err);
      }
    }
    
    addItem({
      productId: displayProduct.slug,
      size: selectedSize,
      price: displayProduct.price,
      name: displayProduct.name,
      imageUrl: displayProduct.imageUrl,
      boutiqueName: displayProduct.boutiqueName,
      boutiqueId: displayProduct.boutiqueId,
      availableStock: currentStock,
      isPreorder: isPreorderMode,
      scheduledProcessingDate: isPreorderMode ? (boutiqueStatus as any).nextOperatingDay : undefined,
    });
    setSidebarOpen(true);
    onClose();
  };

  const handleSaveToWishlist = () => {
    logFunnelEvent({
      eventType: "cross_boutique_wishlist_selected",
      productId: displayProduct.slug as any,
      boutiqueId: displayProduct.boutiqueId as any,
    }).catch(err => console.error("Failed to log analytics:", err));

    const toggleItem = useWishlistStore.getState().toggleItem;
    const hasItem = useWishlistStore.getState().hasItem;
    
    if (displayProduct.slug) {
      if (!hasItem(displayProduct.slug)) {
        toggleItem({
          id: displayProduct.id,
          slug: displayProduct.slug,
          name: displayProduct.name,
          price: displayProduct.price,
          imageUrl: displayProduct.imageUrl,
          boutiqueName: displayProduct.boutiqueName,
        });
      }
      setCrossBoutiqueModalOpen(false);
      setSidebarOpen(true);
      onClose();
    }
  };

  const handleAddToCart = () => {
    if (isStoreOffline) {
      toast.error("This store is currently closed or not accepting orders.");
      return;
    }
    if (!selectedSize) {
      toast.error("Please select a size first");
      return;
    }
    if (!isLocationServiceable) {
      toast.error("Currently unavailable at your location");
      return;
    }

    const currentCartItems = useCartStore.getState().items;
    const firstItem = currentCartItems[0];
    if (firstItem && firstItem.boutiqueName !== displayProduct.boutiqueName) {
      setCrossBoutiqueModalOpen(true);
      return;
    }

    setAdding(true);
    setTimeout(() => {
      addItem({
        productId: displayProduct.slug,
        size: selectedSize,
        price: displayProduct.price,
        name: displayProduct.name,
        imageUrl: displayProduct.imageUrl,
        boutiqueName: displayProduct.boutiqueName,
        boutiqueId: displayProduct.boutiqueId,
        availableStock: currentStock,
        isPreorder: isPreorderMode,
        scheduledProcessingDate: isPreorderMode ? (boutiqueStatus as any).nextOperatingDay : undefined,
      });
      setAdding(false);
      setSidebarOpen(true);
      onClose();
    }, 600);
  };

  const images = rawProduct?.images?.length ? rawProduct.images : (displayProduct.images?.length ? displayProduct.images : (displayProduct.imageUrl ? [displayProduct.imageUrl] : []));
  const discountPercent = displayProduct.discountPercent || 0;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      ref={modalRef}
    >
      {/* Backdrop overlay */}
      <div
        className={cn("absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300", crossBoutiqueModalOpen ? "opacity-0 pointer-events-none" : "opacity-100")}
        onClick={onClose}
      />

      {/* Drawer / Modal Container */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          "bg-white shadow-2xl flex flex-col transition-all duration-300 w-full z-10 relative overflow-hidden",
          // Mobile: bottom aligned, takes full width, stable sheet height
          "h-[75dvh] rounded-t-[24px]",
          // Desktop: centered lightbox 50/50 split
          "md:flex-row md:max-w-4xl md:h-auto md:max-h-[80vh] md:rounded-3xl md:aspect-[2/1]",
          // Hide completely when cross boutique modal is open to fix dual-open bug
          crossBoutiqueModalOpen ? "hidden" : "flex"
        )}
      >
        {/* Mobile Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-stone-200 md:hidden z-20" />
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 md:top-4 md:right-4 z-20 p-2 rounded-full bg-white/70 backdrop-blur-sm border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-white transition-colors"
          aria-label="Close Quick View"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── LEFT SIDE (Desktop) / TOP (Mobile): IMAGE CAROUSEL ── */}
        <div className="w-full md:w-1/2 h-[35dvh] md:h-full relative bg-stone-50 flex-shrink-0 group">
          <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none" style={{ scrollBehavior: 'smooth' }}>
            {images.length > 0 ? (
              images.map((img: string, idx: number) => (
                <div key={idx} className="w-full h-full flex-shrink-0 snap-center relative">
                  <Image
                    src={img}
                    alt={`${displayProduct.name} - View ${idx + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    priority={idx === 0}
                  />
                </div>
              ))
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400">
                No Image Available
              </div>
            )}
          </div>
          
          {/* Carousel Controls (Desktop Only) */}
          {images.length > 1 && (
            <div className="hidden md:flex absolute inset-0 items-center justify-between px-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                  const container = e.currentTarget.parentElement?.previousElementSibling;
                  if (container) {
                    const newScrollLeft = (activeImageIdx > 0 ? activeImageIdx - 1 : images.length - 1) * container.clientWidth;
                    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
                  }
                }}
                className="pointer-events-auto p-2 rounded-full bg-white/80 backdrop-blur shadow-sm hover:bg-white text-stone-700"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                  const container = e.currentTarget.parentElement?.previousElementSibling;
                  if (container) {
                    const newScrollLeft = (activeImageIdx < images.length - 1 ? activeImageIdx + 1 : 0) * container.clientWidth;
                    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
                  }
                }}
                className="pointer-events-auto p-2 rounded-full bg-white/80 backdrop-blur shadow-sm hover:bg-white text-stone-700"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Dots Indicator */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10">
              {images.map((_: any, idx: number) => (
                <div 
                  key={idx} 
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    activeImageIdx === idx ? "bg-white w-3" : "bg-white/50"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT SIDE (Desktop) / BOTTOM (Mobile): DETAILS ── */}
        <div className="w-full md:w-1/2 flex flex-col flex-1 min-h-0 md:max-h-full">
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 scrollbar-none flex flex-col">
            <div className="space-y-1 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                {displayProduct.boutiqueName}
              </span>
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-stone-900 leading-tight line-clamp-2">
                {cleanProductTitle(displayProduct.name)}
              </h2>
            </div>

            {(() => {
              // displayProduct is mapped card data in rupees; don't convert it again.
              const pricing = calculateCardPricing(displayProduct);
              return (
                <div className="flex flex-wrap items-baseline gap-2.5 mb-6 leading-none select-none">
                  <span className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
                    {pricing.formattedPrice}
                  </span>
                  {pricing.compareAtPrice !== undefined && pricing.compareAtPrice > pricing.price && (
                    <>
                      <span className="text-xs sm:text-sm text-stone-400 line-through font-normal">
                        MRP {pricing.formattedMrp}
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold text-hive-amber tracking-wide">
                        ({pricing.discountPercent}% OFF)
                      </span>
                    </>
                  )}
                </div>
              );
            })()}

            <div className="mb-5">
              <DeliveryCountdownPill countdown={(rawProduct as any)?.deliveryCountdown} locality={locality} />
            </div>

            <div className="hidden md:block mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">Select Size</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {displayProduct.sizes && displayProduct.sizes.length > 0 ? (
                  displayProduct.sizes.map((size: string) => {
                    const stock = stockMap[size] ?? 0;
                    const isAvail = stock > 0;
                    const isSel = selectedSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => isAvail && setSelectedSize(size)}
                        disabled={!isAvail}
                        className={cn(
                          "min-w-[3rem] h-10 px-3 flex items-center justify-center border rounded-md text-sm font-medium transition-all duration-200 select-none",
                          isSel
                            ? "border-stone-900 bg-stone-900 text-white shadow-md"
                            : isAvail
                            ? "border-stone-200 bg-white text-stone-700 hover:border-stone-400 active:bg-stone-50"
                            : "border-stone-100 bg-stone-50 text-stone-300 cursor-not-allowed opacity-50 relative overflow-hidden"
                        )}
                      >
                        {size}
                        {!isAvail && (
                          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                            <div className="w-[140%] h-px bg-stone-300 transform -rotate-45" />
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-sm text-stone-500">Free Size (One Size Fits All)</span>
                )}
              </div>
            </div>

            {/* Optional Description Snippet with Hydration Skeleton */}
            {isStillLoading ? (
              <div className="mt-auto pt-6 pb-2 space-y-2 animate-pulse">
                <div className="h-3 bg-stone-100 rounded w-full" />
                <div className="h-3 bg-stone-100 rounded w-[90%]" />
                <div className="h-3 bg-stone-100 rounded w-[75%]" />
              </div>
            ) : (
              (rawProduct as any)?.description && (
                <div className="mt-auto pt-6 pb-2 text-sm text-stone-600 leading-relaxed">
                  {(rawProduct as any).description}
                </div>
              )
            )}
          </div>

          {/* Sticky Footer CTA */}
          <div className="p-4 md:p-6 bg-white border-t border-stone-100 flex-shrink-0">
            {/* Desktop Add to Bag (Hidden on Mobile) */}
            <button
              onClick={handleAddToCart}
              disabled={isStoreOffline || adding || isOutOfStock || (!isLocationServiceable && latitude !== null)}
              className={cn(
                "hidden md:flex w-full h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold tracking-wider uppercase transition-all shadow-sm",
                adding
                  ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                  : isStoreOffline || isOutOfStock || (!isLocationServiceable && latitude !== null)
                  ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                  : "bg-[#111111] hover:bg-black text-white hover:shadow-md active:scale-[0.98]"
              )}
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>
                    {isStoreOffline
                      ? "Store Closed"
                      : (!isLocationServiceable && latitude !== null)
                      ? "Unavailable in your area"
                      : isOutOfStock
                      ? "Sold Out"
                      : isPreorderMode
                      ? (boutiqueStatus.type === "CLOSED_TODAY"
                        ? "Book for Tomorrow"
                        : `Book for ${formatNextDayLabel((boutiqueStatus as any).nextOperatingDay)}`)
                      : "Add to Bag"}
                  </span>
                </>
              )}
            </button>
            {isPreorderMode && (
              <p className="hidden md:block mt-2 text-[10px] text-stone-500 text-center font-medium leading-normal max-w-[280px] mx-auto">
                ⓘ Store is currently closed. Order will be processed when they open at{" "}
                {(boutiqueStatus as any).openingTime} on{" "}
                {boutiqueStatus.type === "CLOSED_TODAY"
                  ? "tomorrow"
                  : formatNextDayLabel((boutiqueStatus as any).nextOperatingDay)}
                .
              </p>
            )}
            
            {/* View Full Details Button */}
            <button
              onClick={() => {
                onClose();
                router.push(`/products/${displayProduct.slug}`);
              }}
              className="w-full md:mt-3 h-12 md:h-auto text-sm md:text-xs bg-stone-900 text-white md:bg-transparent md:text-stone-500 hover:text-stone-900 rounded-xl md:rounded-none font-medium tracking-wide flex items-center justify-center transition-all shadow-sm md:shadow-none"
            >
              View Full Details →
            </button>
          </div>
        </div>
      </div>

      {/* Boutique Mismatch Warning Modal */}
      <Modal
        isOpen={crossBoutiqueModalOpen}
        onClose={() => {
          logFunnelEvent({
            eventType: "cross_boutique_dismissed",
            productId: displayProduct.slug as any,
            boutiqueId: displayProduct.boutiqueId as any,
          }).catch(err => console.error("Failed to log analytics:", err));
          setCrossBoutiqueModalOpen(false);
        }}
        title={
          <div className="flex flex-col text-left">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-amber-600 block mb-0.5">
              EXPRESS DELIVERY
            </span>
            <h2 className="text-base sm:text-lg font-serif font-bold text-stone-900">
              Want this one too?
            </h2>
          </div>
        }
        className="max-w-md"
      >
        <div className="flex flex-col py-1 px-1 text-left select-none">
          <p className="text-xs text-stone-600 leading-relaxed font-normal mb-4">
            Your current bag is already ready to go. Save this one and place it as your next order.
          </p>

          <hr className="border-stone-100 mb-4" />

          {/* Action buttons */}
          <div className="flex flex-col w-full">
            {/* Option 1: Primary Action */}
            <button
              onClick={handleSaveToWishlist}
              className="h-12 w-full bg-[#F5C22B] hover:bg-[#E0B120] text-stone-950 font-bold active:scale-[0.98] transition-all rounded-2xl text-xs sm:text-sm shadow-[0_4px_16px_rgba(245,194,43,0.25)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 fill-stone-950 stroke-stone-950" />
              <span>Save &amp; order next</span>
              <span>→</span>
            </button>
            <span className="text-[10.5px] text-stone-500 font-medium mt-1.5 text-center block">
              We&apos;ll keep this piece ready while you finish your current order.
            </span>

            {/* Option 2: Switch Bag */}
            <button
              onClick={handleClearAndContinue}
              className="h-11 w-full bg-stone-100/90 text-stone-800 hover:bg-stone-200 active:scale-[0.98] transition-all rounded-2xl text-xs font-semibold mt-3.5 flex items-center justify-center cursor-pointer"
            >
              Switch to this item
            </button>
            <span className="text-[9.5px] text-stone-400 font-normal mt-1 text-center block">
              Your previous item will be safely saved to your Wishlist.
            </span>

            <button
              onClick={() => {
                logFunnelEvent({
                  eventType: "cross_boutique_dismissed",
                  productId: displayProduct.slug as any,
                  boutiqueId: displayProduct.boutiqueId as any,
                }).catch(err => console.error("Failed to log analytics:", err));
                setCrossBoutiqueModalOpen(false);
              }}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-900 font-medium py-2 transition-colors focus:outline-none mt-2 cursor-pointer"
            >
              Keep browsing
            </button>
          </div>
        </div>
      </Modal>
    </div>,
    modalRoot
  );
};
