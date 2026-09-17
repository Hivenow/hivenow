"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Bell, AlertTriangle, Info, Clock, Heart, Calendar } from "lucide-react";
import { cn } from "@hive/ui";
import { ProductDetail } from "@/lib/mockProductDetails";
import { useCartStore } from "@/store/cart-store";
import { useCart } from "@/context/CartContext";
import { useCheckoutStore } from "@/store/checkout-store";
import { useWishlistStore } from "@/store/wishlist-store";
import { cleanProductTitle } from "./ProductCard";
import { useLocation } from "@/context/LocationContext";
import { checkServiceability } from "../../../../../convex/lib/serviceability";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Modal } from "@hive/ui";
import { useSessionStore } from "@/context/SessionContext";
import { inrToPaise, toast } from "@hive/utils";
import { ReservationInfoBlock } from "./ReservationInfoBlock";

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
import { getBoutiqueStatus } from "../../../../../convex/shared/boutiqueStatus";

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: AddToCartButton
// ─────────────────────────────────────────────────────────────────────────────
interface AddToCartButtonProps {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  className?: string;
  isServiceable?: boolean;
  variant?: "default" | "unified";
  isPreorder?: boolean;
  preorderType?: "CLOSED_TODAY" | "CLOSED_EXTENDED";
  nextDayLabel?: string;
}

export const AddToCartButton: React.FC<AddToCartButtonProps> = ({
  disabled,
  loading,
  onClick,
  className = "",
  isServiceable = true,
  variant = "default",
  isPreorder = false,
  preorderType,
  nextDayLabel = "",
}) => {
  const isUnified = variant === "unified";
  const isDisabled = disabled || !isServiceable;

  return (
    <button
      type="button"
      disabled={isDisabled || loading}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs transition-all duration-200 relative outline-none select-none group cursor-pointer",
        isUnified ? (
          cn(
            "h-full w-[45%] rounded-l-2xl",
            isDisabled
              ? "text-stone-400 cursor-not-allowed"
              : "hover:bg-stone-50 text-hive-dark active:scale-[0.98]"
          )
        ) : (
          cn(
            "h-12 w-full rounded-2xl border-[3px] border-hive-dark",
            isDisabled
              ? "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed"
              : "bg-white hover:bg-hive-dark hover:text-hive-gold text-hive-dark active:scale-[0.98]"
          )
        ),
        className
      )}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-hive-dark border-t-transparent animate-spin" />
      ) : !isServiceable ? (
        <span>Unavailable</span>
      ) : (
        <>
          <ShoppingBag className={cn(
            "w-3.5 h-3.5 text-hive-gold transition-all duration-200",
            !isDisabled && "group-hover:scale-110"
          )} />
          <span className="text-[11px] font-bold">
            {isPreorder
              ? (preorderType === "CLOSED_TODAY" ? "Book" : "Pre-Order")
              : "Add to Bag"}
          </span>
        </>
      )}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: BuyNowButton
// ─────────────────────────────────────────────────────────────────────────────
interface BuyNowButtonProps {
  disabled: boolean;
  onClick: () => void;
  className?: string;
  isServiceable?: boolean;
  variant?: "default" | "unified";
  isPreorder?: boolean;
  preorderType?: "CLOSED_TODAY" | "CLOSED_EXTENDED";
  nextDayLabel?: string;
}

export const BuyNowButton: React.FC<BuyNowButtonProps> = ({
  disabled,
  onClick,
  className = "",
  isServiceable = true,
  variant = "default",
  isPreorder = false,
  preorderType,
  nextDayLabel = "",
}) => {
  const isUnified = variant === "unified";
  const isDisabled = disabled || !isServiceable;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        "font-bold uppercase tracking-wider text-xs transition-all duration-200 flex items-center justify-center gap-1.5 outline-none select-none group cursor-pointer",
        isUnified ? (
          cn(
            "h-full w-[55%] rounded-r-2xl rounded-l-none",
            isDisabled
              ? "bg-stone-200 text-stone-400 cursor-not-allowed"
              : "bg-hive-gold hover:bg-hive-amber text-hive-dark active:scale-[0.98] shadow-sm"
          )
        ) : (
          cn(
            "h-12 w-full rounded-2xl",
            isDisabled
              ? "text-stone-300 cursor-not-allowed bg-stone-100"
              : "bg-hive-gold hover:bg-hive-amber text-hive-dark shadow-sm active:scale-[0.98]"
          )
        ),
        className
      )}
    >
      <span className="text-[11.5px] font-bold tracking-wider">
        {!isServiceable
          ? "Unavailable"
          : isPreorder
          ? "Pre-Order"
          : "Buy Now"}
      </span>
      <ArrowRight className="w-3.5 h-3.5 text-hive-dark group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
};



// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: StickyMobilePurchaseBar
// ─────────────────────────────────────────────────────────────────────────────
interface StickyMobilePurchaseBarProps {
  productName: string;
  price: number;
  selectedSize: string;
  inventoryCount: number;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onSelectSizePrompt: () => void;
  loading: boolean;
  className?: string;
  isServiceable?: boolean;
  resolvedStatus?: string;
  isPreorder?: boolean;
  preorderType?: "CLOSED_TODAY" | "CLOSED_EXTENDED";
  nextDayLabel?: string;
  isFavorite?: boolean;
  onToggleWishlist?: () => void;
  isReservationMode?: boolean;
  onReserve?: () => void;
  reservationComplete?: any;
  isStockHeld?: boolean;
  onOpenHoldModal?: () => void;
}

export const StickyMobilePurchaseBar: React.FC<StickyMobilePurchaseBarProps> = ({
  productName,
  price,
  selectedSize,
  inventoryCount,
  onAddToCart,
  onBuyNow,
  onSelectSizePrompt,
  loading,
  className = "",
  isServiceable = true,
  resolvedStatus = "open",
  isPreorder = false,
  preorderType,
  nextDayLabel = "",
  isFavorite = false,
  onToggleWishlist,
  isReservationMode = false,
  onReserve,
  isStockHeld = false,
  onOpenHoldModal,
}) => {
  const isOutOfStock = selectedSize ? inventoryCount === 0 : false;
  const isOffline = resolvedStatus === "closed" || resolvedStatus === "temporarily_unavailable";

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-stone-200/80 px-5 pt-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shadow-2xl lg:hidden animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]",
        className
      )}
    >
      {/* Price — compact, secondary to CTAs */}
      <div className="flex flex-col text-left justify-center select-none flex-shrink-0 whitespace-nowrap">
        <span className="text-sm sm:text-base font-bold text-stone-900 leading-none">
          ₹{price.toLocaleString("en-IN")}
        </span>
        <span className={cn(
          "text-[10px] tracking-wide mt-0.5 block leading-none",
          selectedSize ? "text-stone-400 font-medium" : "text-amber-800 font-bold uppercase"
        )}>
          {selectedSize ? `Size ${selectedSize}` : "Size Required"}
        </span>
      </div>

      {/* Button CTA */}
      <div className="flex-1 min-w-[180px]">
        {isOffline ? (
          <button
            type="button"
            onClick={onToggleWishlist}
            className={cn(
              "h-14 w-full rounded-2xl font-bold uppercase tracking-wider text-[11px] leading-tight px-1 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all border cursor-pointer",
              isFavorite
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-hive-dark text-white border-transparent"
            )}
          >
            <Heart className={cn("w-4 h-4", isFavorite && "fill-amber-600 stroke-amber-600")} />
            <span>{isFavorite ? "Saved in Wishlist" : "Save to Wishlist"}</span>
          </button>
        ) : !selectedSize ? (
          <button
            type="button"
            onClick={onSelectSizePrompt}
            className="h-14 w-full rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300/80 font-bold uppercase tracking-wider text-xs shadow-2xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Select Size</span>
            <span className="text-stone-400">→</span>
          </button>
        ) : isOutOfStock ? (
          <button
            type="button"
            disabled
            className="h-14 w-full rounded-2xl bg-stone-100 text-stone-400 font-bold uppercase tracking-wider text-xs cursor-not-allowed"
          >
            Sold Out
          </button>
        ) : isStockHeld ? (
          <button
            type="button"
            onClick={onOpenHoldModal}
            className="h-14 w-full rounded-2xl bg-amber-50/90 text-amber-900 border border-amber-200/80 font-bold uppercase tracking-wider text-[11px] leading-tight px-1 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>On Hold (1 reserved)</span>
          </button>
        ) : isReservationMode ? (
          <button
            type="button"
            onClick={onReserve}
            disabled={loading}
            className="h-14 w-full rounded-2xl bg-hive-gold text-hive-dark font-black uppercase tracking-widest text-[11px] leading-tight px-1 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-sm hover:bg-hive-gold disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 rounded-full border-2 border-hive-dark border-t-transparent animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-hive-dark/80" />
                RESERVE FOR TOMORROW
              </span>
            )}
          </button>
        ) : !isServiceable ? (
          <button
            type="button"
            disabled
            className="h-14 w-full rounded-2xl bg-stone-100 text-stone-400 font-bold uppercase tracking-wider text-[10px] cursor-not-allowed leading-tight px-0.5"
          >
            Unavailable
          </button>
        ) : !selectedSize ? (
          <button
            type="button"
            onClick={onSelectSizePrompt}
            className="h-14 w-full rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300/80 font-bold uppercase tracking-wider text-xs shadow-2xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Select Size</span>
            <span className="text-stone-400">→</span>
          </button>
        ) : isOutOfStock ? (
          <button
            type="button"
            disabled
            className="h-14 w-full rounded-2xl bg-stone-100 text-stone-400 font-bold uppercase tracking-wider text-xs cursor-not-allowed"
          >
            Sold Out
          </button>
        ) : (
          <div className="flex w-full h-14 transition-all duration-300 items-stretch">
            <AddToCartButton
              variant="unified"
              disabled={isOffline}
              loading={loading}
              onClick={onAddToCart}
              isServiceable={isServiceable}
              className="h-full text-[11px] tracking-wider"
              isPreorder={isPreorder}
              preorderType={preorderType}
              nextDayLabel={nextDayLabel}
            />
            <BuyNowButton
              variant="unified"
              disabled={isOffline}
              onClick={onBuyNow}
              isServiceable={isServiceable}
              className="h-full text-[11px] tracking-wider"
              isPreorder={isPreorder}
              preorderType={preorderType}
              nextDayLabel={nextDayLabel}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Wrapper: PurchaseActions
// ─────────────────────────────────────────────────────────────────────────────
export interface PurchaseActionsProps {
  product: ProductDetail;
  selectedSize: string;
  onOpenSizeGuide: () => void;
  className?: string;
}

export const PurchaseActions: React.FC<PurchaseActionsProps> = ({
  product,
  selectedSize,
  onOpenSizeGuide,
  className = "",
}) => {
  const [loading, setLoading] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySuccess, setNotifySuccess] = useState(false);
  const [crossBoutiqueModalOpen, setCrossBoutiqueModalOpen] = useState(false);
  const [duplicateReservationModalOpen, setDuplicateReservationModalOpen] = useState(false);
  const [itemOnHoldModalOpen, setItemOnHoldModalOpen] = useState(false);

  const reservationHold = useQuery(
    (api as any).reservations.getProductReservationHold,
    selectedSize ? { productId: ((product as any)._id ?? product.id) as any, size: selectedSize } : "skip"
  );
  const isStockHeld = Boolean(reservationHold?.isHeld);

  const createReservationMutation = useMutation((api as any).reservations.createReservation);

  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const isFavorite = useWishlistStore((state) => product.slug ? state.hasItem(product.slug) : false);

  const handleSelectSizePrompt = () => {
    const el = document.getElementById("size-selector-section");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const setCheckoutItems = useCheckoutStore((state) => state.setCheckoutItems);
  const { setSidebarOpen } = useCart();
  const { latitude, longitude, setGateOpen } = useLocation();

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

  // Track when cross-boutique modal is shown
  React.useEffect(() => {
    if (crossBoutiqueModalOpen) {
      logFunnelEvent({
        eventType: "cross_boutique_modal_shown",
        productId: (product.slug ?? (product as any)._id ?? product.id) as any,
        boutiqueId: (product.boutique?.id ?? (product as any).boutiqueId) as any,
      }).catch(err => console.error("Failed to log analytics:", err));
    }
  }, [crossBoutiqueModalOpen, product, logFunnelEvent]);

  // ── Single source of truth for stock ──────────────────────────────────────
  // Convex DB products use `stockBySize`; mock products use `inventory`.
  const stockMap: Record<string, number> =
    (product as any).stockBySize ?? product.inventory ?? {};

  const inventoryCount = selectedSize ? (stockMap[selectedSize] ?? 0) : 0;
  const isOutOfStock = selectedSize ? inventoryCount === 0 : false;
  const isLowStock = selectedSize ? inventoryCount > 0 && inventoryCount <= 3 : false;

  const isLocationServiceable = React.useMemo(() => {
    if (latitude === null || longitude === null) return true;
    const serviceability = checkServiceability(latitude, longitude, product.boutique as any);
    return serviceability.serviceable;
  }, [latitude, longitude, product.boutique]);

  const boutiqueStatus = product.boutique
    ? getBoutiqueStatus(product.boutique as any, Date.now())
    : { type: "OPEN" as const };
  
  const isStoreOffline = boutiqueStatus.type === "PAUSED";
  const isReservationMode = boutiqueStatus.type === "CLOSED_TODAY" || boutiqueStatus.type === "CLOSED_EXTENDED";
  const isPreorderMode = false;

  // A boutique that has hit its daily order cap is PAUSED with
  // reason "capacity_limit" (see convex/shared/boutiqueStatus.ts). That is a
  // different message to the shopper than "we are shut" — "try again tomorrow"
  // rather than opening hours — and the UI below already has a branch for it.
  // Collapsing every PAUSED reason to "closed" made that branch unreachable, so
  // a capacity-limited boutique showed opening hours it was not actually
  // going to honour.
  const resolvedStatus =
    boutiqueStatus.type === "PAUSED" && boutiqueStatus.reason === "capacity_limit"
      ? ("temporarily_unavailable" as const)
      : isStoreOffline
      ? ("closed" as const)
      : isReservationMode
      ? ("reservation" as const)
      : (product.boutique as any).storeStatus === "busy"
      ? ("busy" as const)
      : ("open" as const);


  const handleClearAndContinue = async () => {
    setCrossBoutiqueModalOpen(false);
    
    // Log replacement event
    logFunnelEvent({
      eventType: "cross_boutique_replace_selected",
      productId: (product.slug ?? (product as any)._id ?? product.id) as any,
      boutiqueId: (product.boutique?.id ?? (product as any).boutiqueId) as any,
    }).catch(err => console.error("Failed to log analytics:", err));
    
    // Auto-save existing items to Wishlist so nothing is lost
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

    // 1. Clear Zustand cart
    const clearCartZustand = useCartStore.getState().clearCart;
    clearCartZustand();
    
    // 2. Clear backend cart if logged in
    if (isAuthenticated && token) {
      try {
        await clearCartMutation({ token });
      } catch (err) {
        console.error("Failed to clear Convex cart:", err);
      }
    }
    
    // 3. Add new item or trigger reservation if in reservation mode
    if (isReservationMode) {
      handleReserve();
      return;
    }

    addItem({
      productId: product.slug ?? (product as any)._id ?? product.id,
      size: selectedSize,
      price: product.price,
      name: product.name,
      imageUrl: product.images[0] || "",
      boutiqueName: product.boutique.name,
      boutiqueId: product.boutique.id,
      isPreorder: isPreorderMode,
      scheduledProcessingDate: isPreorderMode ? (boutiqueStatus as any).nextOperatingDay : undefined,
    });
    setSidebarOpen(true);
  };

  const handleSaveToWishlist = () => {
    // Log wishlist save event
    logFunnelEvent({
      eventType: "cross_boutique_wishlist_selected",
      productId: (product.slug ?? (product as any)._id ?? product.id) as any,
      boutiqueId: (product.boutique?.id ?? (product as any).boutiqueId) as any,
    }).catch(err => console.error("Failed to log analytics:", err));

    const toggleItem = useWishlistStore.getState().toggleItem;
    const hasItem = useWishlistStore.getState().hasItem;
    
    if (product.slug) {
      if (!hasItem(product.slug)) {
        toggleItem({
          id: product.id ?? (product as any)._id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          imageUrl: product.images[0] || "",
          boutiqueName: product.boutique.name,
        });
      }
      setCrossBoutiqueModalOpen(false);
      setSidebarOpen(true);
    }
  };

  /**
   * Adds or removes this product from the wishlist.
   *
   * This is the plain toggle, with none of handleSaveToWishlist's
   * cross-boutique side effects (that one also closes the cross-boutique modal,
   * opens the cart drawer and logs `cross_boutique_wishlist_selected`, which
   * would be wrong anywhere else). The body is the same logic that was written
   * inline on the store-offline button below; both now call this.
   */
  const handleWishlistToggle = () => {
    if (!product.slug) return;
    toggleItem({
      id: product.id ?? (product as any)._id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      imageUrl: product.images[0] || "",
      boutiqueName: product.boutique.name,
    });
    if (isFavorite) {
      toast.info("Removed from wishlist");
    } else {
      toast.success(`Saved ${cleanProductTitle(product.name)} to wishlist`);
    }
  };

  const handleReserve = async () => {
    if (!isAuthenticated) {
      toast.info("Please log in to reserve an item.");
      router.push(`/sign-in?redirect_url=/products/${product.slug}`);
      return;
    }
    if (latitude === null || longitude === null) {
      toast.info("Please select your delivery location to purchase.");
      setGateOpen(true);
      return;
    }
    if (!selectedSize) {
      handleSelectSizePrompt();
      toast.info("Please select a size first");
      return;
    }
    if (!isLocationServiceable) {
      toast.info("Currently unavailable at your location");
      return;
    }

    // Check cross-boutique mismatch
    const currentCartItems = useCartStore.getState().items;
    const firstItem = currentCartItems[0];
    if (firstItem && firstItem.boutiqueName && product.boutique?.name && firstItem.boutiqueName !== product.boutique.name) {
      setCrossBoutiqueModalOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await createReservationMutation({
        productId: ((product as any)._id ?? product.id) as any,
        size: selectedSize,
        quantity: 1,
      });
      toast.success("Reservation placed successfully!");

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
        productId: ((product as any)._id ?? product.id) as any,
        size: selectedSize,
        price: product.price,
        name: product.name,
        imageUrl: product.images[0] || "",
        boutiqueName: product.boutique.name,
        boutiqueId: product.boutique.id,
        isReservation: true,
        reservationStatus: "reservation_active",
        reservationExpiresAt: res.reservationExpiresAt,
        reservationId: res.reservationId,
      });
      // Removed router.push("/cart") so user sees the toast
    } catch (e: any) {
      const rawMsg = typeof e?.data === "string" ? e.data : (e?.message || "");
      if (rawMsg.includes("already have an active reservation")) {
        setDuplicateReservationModalOpen(true);
      } else if (rawMsg.includes("currently reserved") || rawMsg.includes("out of stock") || rawMsg.includes("reserved")) {
        setItemOnHoldModalOpen(true);
      } else {
        const clean = rawMsg.split("ConvexError: ")[1] || rawMsg.split("Error: ")[1] || rawMsg;
        toast.info(clean);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (latitude === null || longitude === null) {
      toast.info("Please select your delivery location to purchase.");
      setGateOpen(true);
      return;
    }

    if (!selectedSize) {
      handleSelectSizePrompt();
      toast.info("Please select a size first");
      return;
    }

    if (isStoreOffline) {
      toast.info("This boutique is currently closed or not accepting orders.");
      return;
    }

    if (!isLocationServiceable) {
      toast.info("Currently unavailable at your location");
      return;
    }

    // Check cross-boutique mismatch
    const currentCartItems = useCartStore.getState().items;
    const firstItem = currentCartItems[0];
    if (firstItem && firstItem.boutiqueName !== product.boutique.name) {
      setCrossBoutiqueModalOpen(true);
      return;
    }

    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      setLoading(false);

      addItem({
        productId: product.slug ?? (product as any)._id ?? product.id,
        size: selectedSize,
        price: product.price,
        name: product.name,
        imageUrl: product.images[0] || "",
        boutiqueName: product.boutique.name,
        boutiqueId: product.boutique.id,
        availableStock: inventoryCount,
        isPreorder: isPreorderMode,
        scheduledProcessingDate: isPreorderMode ? (boutiqueStatus as any).nextOperatingDay : undefined,
      });

      setSidebarOpen(true);
    }, 850);
  };

  const handleBuyNow = () => {
    if (latitude === null || longitude === null) {
      toast.info("Please select your delivery location to purchase.");
      setGateOpen(true);
      return;
    }

    if (!selectedSize) {
      handleSelectSizePrompt();
      toast.info("Please select a size first");
      return;
    }

    if (isStoreOffline) {
      toast.info("This boutique is currently closed or not accepting orders.");
      return;
    }

    if (!isLocationServiceable) {
      toast.info("Currently unavailable at your location");
      return;
    }

    setCheckoutItems([
      {
        productId: product.slug ?? (product as any)._id ?? product.id,
        size: selectedSize,
        quantity: 1,
        price: product.price,
        name: product.name,
        imageUrl: product.images[0] || "",
        boutiqueName: product.boutique.name,
        boutiqueId: product.boutique.id ?? (product as any).boutiqueId,
        isPreorder: isPreorderMode,
        scheduledProcessingDate: isPreorderMode ? (boutiqueStatus as any).nextOperatingDay : undefined,
      },
    ]);

    router.push("/checkout/address");
  };

  const handleNotifyMe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail) return;
    setNotifySuccess(true);
    toast.success(`We will notify you at ${notifyEmail} once this size restocks.`);
    setTimeout(() => {
      setNotifyEmail("");
      setNotifySuccess(false);
    }, 4000);
  };

  const showAlert = 
    resolvedStatus === "closed" ||
    resolvedStatus === "reservation" ||
    resolvedStatus === "temporarily_unavailable" ||
    resolvedStatus === "busy" ||
    isPreorderMode ||
    (!isStoreOffline && !isReservationMode && (!isLocationServiceable || !selectedSize || isOutOfStock || isLowStock));

  return (
    <div id="purchase-actions-section" className={cn("w-full flex flex-col gap-4 text-left", className)}>

      {/* 1. Validation Alerts & Feedback */}
      {showAlert && (
        <div className="flex flex-col gap-2 w-full">
          {isPreorderMode ? (
            <div className="flex flex-col gap-1.5 text-xs font-bold text-amber-700 bg-amber-50/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-amber-200/85 w-full shadow-2xs">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 flex-shrink-0 text-amber-500" />
                <span>Pre-Order Active: {product.boutique.name || "This boutique"} is currently offline.</span>
              </div>
              <p className="text-[10px] text-amber-600 font-medium pl-6 leading-normal">
                You can book now to secure your items. Your order will be prepared when they open at {(boutiqueStatus as any).openingTime} on{" "}
                {boutiqueStatus.type === "CLOSED_TODAY"
                  ? "tomorrow"
                  : formatNextDayLabel((boutiqueStatus as any).nextOperatingDay)}
                .
              </p>
            </div>
          ) : resolvedStatus === "reservation" ? (
            <div className="flex flex-col gap-1.5 text-xs font-bold text-stone-100 bg-gradient-to-br from-stone-900 to-stone-950 backdrop-blur-md px-4 py-3.5 rounded-2xl border border-stone-800/80 w-full shadow-[0_4px_20px_rgba(245,194,43,0.12)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-hive-gold/5 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
              <div className="flex items-center gap-2 relative z-10">
                <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hive-gold opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-hive-gold"></span>
                </div>
                <span className="tracking-widest text-[10px] uppercase text-hive-gold">
                  {boutiqueStatus.type === "CLOSED_TODAY" 
                    ? "Get it tomorrow" 
                    : `Get it on ${formatNextDayLabel((boutiqueStatus as any).nextOperatingDay)}`}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 font-medium pl-4 leading-normal relative z-10">
                Availability confirmed {boutiqueStatus.type === "CLOSED_TODAY" ? "tomorrow" : "when the store opens next"}.
              </p>
            </div>
          ) : resolvedStatus === "closed" ? (
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center gap-2 select-none shadow-2xs">
              <Clock className="w-8 h-8 text-amber-500 animate-pulse" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">Boutique Currently Closed</span>
              <p className="text-[11px] text-slate-500 font-medium leading-normal max-w-xs">
                {product.boutique.name || "This boutique"} is closed right now. We are open from {product.boutique.openingTime || "09:00"} to {product.boutique.closingTime || "20:00"}. Please visit us when we open!
              </p>
              {(product.boutique as any).storeMessage && (
                <p className="text-[10px] text-amber-700 font-bold mt-1 bg-amber-50 px-3 py-1 rounded-lg">
                  Notice: {(product.boutique as any).storeMessage}
                </p>
              )}
            </div>
          ) : resolvedStatus === "temporarily_unavailable" ? (
            <div className="flex items-center gap-2 text-xs font-bold text-red-700 bg-red-50/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-red-200/85 w-full shadow-2xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>Not Accepting Orders: Store capacity reached for today. Please try again tomorrow.</span>
            </div>
          ) : resolvedStatus === "busy" ? (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-amber-200/85 w-full shadow-2xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                <span>High Demand: Orders may take longer to prepare today.</span>
              </div>
              {(product.boutique as any).prepTimeMinutes && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-bold pl-3">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Est. Preparation Time: {(product.boutique as any).prepTimeMinutes} mins</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Standard stock alerts only if store is NOT closed/unavailable */}
          {!isStoreOffline && (
            <>
              {!isLocationServiceable ? (
                <div className="flex items-center gap-2 text-xs font-bold text-red-700 bg-red-50 px-3.5 py-1.5 rounded-xl border border-red-200 w-full">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
                  <span>Currently unavailable at your location</span>
                </div>
              ) : !selectedSize ? (
                null
              ) : isOutOfStock ? (
                <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 px-3.5 py-1.5 rounded-xl border border-red-200 w-full">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Out of Stock: The requested size is currently unavailable.</span>
                </div>
              ) : isLowStock ? (
                <div className="flex items-center gap-2 text-xs font-medium text-hive-text pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-hive-amber shrink-0" />
                  <span>Only {inventoryCount} remaining in this size</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* 2. CTAs (Add to Cart / Buy Now / Out Of Stock form) */}
      {isStoreOffline ? (
        <button
          type="button"
          onClick={handleWishlistToggle}
          className={cn(
            "hidden lg:flex h-12 w-full rounded-2xl font-bold uppercase tracking-widest text-xs transition-all active:scale-[0.98] items-center justify-center gap-2 cursor-pointer shadow-sm border",
            isFavorite
              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/50"
              : "bg-hive-dark text-white border-transparent hover:bg-stone-900"
          )}
        >
          <Heart className={cn("w-4 h-4", isFavorite && "fill-amber-600 stroke-amber-600")} />
          <span>{isFavorite ? "Saved in Wishlist" : "Save to Wishlist"}</span>
        </button>
      ) : !selectedSize ? (
        <button
          type="button"
          onClick={handleSelectSizePrompt}
          className="hidden lg:flex h-12 w-full rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300/80 font-bold uppercase tracking-wider text-xs transition-all active:scale-[0.98] shadow-2xs cursor-pointer items-center justify-center gap-1.5"
        >
          <span>Select Size</span>
          <span className="text-stone-400">→</span>
        </button>
      ) : isOutOfStock ? (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4.5 space-y-3.5 shadow-2xs">
          <div className="text-xs">
            <span className="font-extrabold uppercase tracking-wider text-hive-dark block">
              Restock Notification
            </span>
            <p className="text-hive-text-muted mt-1 leading-relaxed font-medium">
              We handcraft our pieces in limited runs. Enter your email to be the first to know when size {selectedSize} is back.
            </p>
          </div>

          <form onSubmit={handleNotifyMe} className="flex gap-2">
            <input
              type="email"
              required
              disabled={notifySuccess}
              placeholder="Enter your email address"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              className="flex-1 h-11 px-4 text-xs border border-hive-border/50 rounded-xl focus:outline-none focus:border-hive-amber bg-white font-medium disabled:opacity-60 transition-colors"
            />
            <button
              type="submit"
              disabled={notifySuccess}
              className="h-11 px-5 rounded-xl bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:bg-stone-200 disabled:text-stone-400 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>Notify Me</span>
            </button>
          </form>
        </div>
      ) : isStockHeld ? (
        <div className="hidden lg:flex flex-col gap-2 w-full select-none">
          <button
            type="button"
            onClick={() => setItemOnHoldModalOpen(true)}
            className="h-12 w-full rounded-2xl bg-amber-50/90 text-amber-900 border border-amber-200/80 font-bold uppercase tracking-wider text-xs transition-all active:scale-[0.98] shadow-xs hover:bg-amber-100/70 cursor-pointer flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Item on Hold (1 unit reserved)</span>
          </button>
          <p className="text-[11px] text-stone-500 text-center font-medium">
            Currently reserved by another shopper. Will release if not purchased in 30 mins.
          </p>
        </div>
      ) : isReservationMode ? (
        <div className="hidden lg:flex flex-col gap-3 w-full">
          <button
            type="button"
            onClick={handleReserve}
            disabled={loading}
            className="h-12 w-full rounded-2xl bg-hive-gold text-hive-dark font-black uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-sm hover:bg-hive-gold cursor-pointer flex items-center justify-center disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 rounded-full border-2 border-hive-dark border-t-transparent animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-hive-dark/80" />
                RESERVE FOR TOMORROW
              </span>
            )}
          </button>
          <ReservationInfoBlock />
        </div>
      ) : (
        <div className="hidden lg:flex w-full h-12 transition-all duration-300 items-stretch">
          <AddToCartButton
            variant="unified"
            disabled={!selectedSize}
            loading={loading}
            onClick={handleAddToCart}
            isServiceable={isLocationServiceable}
            isPreorder={isPreorderMode}
            // No preorderType/nextDayLabel here: this is the `else` of
            // `isReservationMode`, so the boutique is necessarily OPEN and both
            // would always be undefined/"". A closed-today or closed-extended
            // boutique renders the "Reserve for tomorrow" branch above instead.
          />
          <BuyNowButton 
            variant="unified"
            disabled={!selectedSize} 
            onClick={handleBuyNow}
            isServiceable={isLocationServiceable}
            isPreorder={isPreorderMode}
            // Same as AddToCartButton above — always OPEN in this branch.
          />
        </div>
      )}

      {/* Sentinel for Scroll Observer */}
      <div className="w-full h-px pointer-events-none" />


      {/* 5. Sticky Mobile purchase bar */}
      <StickyMobilePurchaseBar
        productName={product.name}
        price={product.price}
        selectedSize={selectedSize}
        inventoryCount={inventoryCount}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onSelectSizePrompt={handleSelectSizePrompt}
        loading={loading}
        isServiceable={isLocationServiceable && !isStoreOffline}
        resolvedStatus={resolvedStatus}
        isPreorder={isPreorderMode}
        preorderType={boutiqueStatus.type as any}
        nextDayLabel={formatNextDayLabel((boutiqueStatus as any).nextOperatingDay)}
        isFavorite={isFavorite}
        onToggleWishlist={handleSaveToWishlist}
        isReservationMode={isReservationMode}
        onReserve={handleReserve}
        isStockHeld={isStockHeld}
        onOpenHoldModal={() => setItemOnHoldModalOpen(true)}
      />

      <style>{`
        @keyframes toastInCenter {
          from { opacity: 0; transform: translate(-50%, -15px) scale(0.97); }
          to { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>

      {/* 6. Boutique Mismatch Warning Modal */}
      <Modal
        isOpen={crossBoutiqueModalOpen}
        onClose={() => {
          logFunnelEvent({
            eventType: "cross_boutique_dismissed",
            productId: (product.slug ?? (product as any)._id ?? product.id) as any,
            boutiqueId: (product.boutique?.id ?? (product as any).boutiqueId) as any,
          }).catch(err => console.error("Failed to log analytics:", err));
          setCrossBoutiqueModalOpen(false);
        }}
        title={
          <div className="flex flex-col text-left">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-amber-600 block mb-0.5">
              EXPRESS LOCAL DELIVERY
            </span>
            <h2 className="text-base sm:text-lg font-serif font-bold text-stone-900">
              These pieces come from 2 different shops
            </h2>
          </div>
        }
        className="max-w-md"
      >
        <div className="flex flex-col py-1 px-1 text-left select-none">
          <p className="text-xs text-stone-600 leading-relaxed font-normal mb-1">
            Our express riders pick up directly from each local shop to deliver straight to your door in 90 minutes.
          </p>
          <p className="text-[11px] text-stone-400 font-medium mb-4">
            To get both outfits, simply place 2 quick separate orders.
          </p>

          <hr className="border-stone-100 mb-4" />

          {/* Visual Comparison: Current Bag vs New Selection */}
          <div className="space-y-3 mb-4">
            {/* Current Bag */}
            <div className="bg-stone-50/80 border border-stone-200/60 p-3 rounded-xl flex items-center gap-3">
              <div className="relative w-10 h-12 rounded-lg overflow-hidden bg-stone-100 border border-stone-200/50 flex-shrink-0">
                {items[0]?.imageUrl ? (
                  <img
                     src={items[0].imageUrl}
                     alt={items[0].name}
                     className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] text-stone-400">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 block mb-0.5">
                  Currently in Bag
                </span>
                <span className="text-xs font-semibold text-stone-900 block truncate">
                  {items[0]?.boutiqueName}
                </span>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-[10px] text-stone-500 font-normal">
                    {items.reduce((acc, curr) => acc + (curr.quantity || 1), 0)} {items.reduce((acc, curr) => acc + (curr.quantity || 1), 0) === 1 ? "item" : "items"}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-stone-900">
                    ₹{items.reduce((acc, curr) => acc + curr.price * (curr.quantity || 1), 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Arrow/Indicator */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="w-5 h-5 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400 text-[10px]">
                ↓
              </div>
            </div>

            {/* Selected Item */}
            <div className="bg-amber-50/40 border border-amber-200/60 p-3 rounded-xl flex items-center gap-3">
              <div className="relative w-10 h-12 rounded-lg overflow-hidden bg-stone-100 border border-stone-200/50 flex-shrink-0">
                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] text-stone-400">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-0.5">
                  New Piece You Clicked
                </span>
                <span className="text-xs font-semibold text-stone-900 block truncate">
                  {cleanProductTitle(product.name)}
                </span>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-[10px] text-stone-500 font-normal block truncate">
                    {product.boutique?.name}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-stone-900">
                    ₹{product.price.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-stone-100 mb-4" />

          {/* Action buttons */}
          <div className="flex flex-col w-full">
            {/* Option 1: Primary Action */}
            <button
              onClick={handleSaveToWishlist}
              className="h-12 w-full bg-[#F5C22B] hover:bg-[#E0B120] text-stone-950 font-bold active:scale-[0.98] transition-all rounded-2xl text-xs sm:text-sm shadow-[0_4px_16px_rgba(245,194,43,0.25)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 fill-stone-950 stroke-stone-950" />
              <span>Save to Wishlist & Finish Current Bag</span>
              <span>→</span>
            </button>
            <span className="text-[10.5px] text-stone-500 font-medium mt-1.5 text-center block">
              We&apos;ll bookmark this piece so you can easily order it right after!
            </span>
            
            {/* Option 2: Switch Bag */}
            <button
              onClick={handleClearAndContinue}
              className="h-11 w-full bg-stone-100/90 text-stone-800 hover:bg-stone-200 active:scale-[0.98] transition-all rounded-2xl text-xs font-semibold mt-3.5 flex items-center justify-center cursor-pointer"
            >
              Switch Bag to This Item
            </button>
            <span className="text-[9.5px] text-stone-400 font-normal mt-1 text-center block">
              Your previous item will be safely saved to your Wishlist.
            </span>
            
            <button
              onClick={() => {
                logFunnelEvent({
                  eventType: "cross_boutique_dismissed",
                  productId: (product.slug ?? (product as any)._id ?? product.id) as any,
                  boutiqueId: (product.boutique?.id ?? (product as any).boutiqueId) as any,
                }).catch(err => console.error("Failed to log analytics:", err));
                setCrossBoutiqueModalOpen(false);
              }}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-900 font-medium py-2 transition-colors focus:outline-none mt-2 cursor-pointer"
            >
              Keep Browsing
            </button>
          </div>
        </div>
      </Modal>

      {/* Item on Hold Modal */}
      <Modal
        isOpen={itemOnHoldModalOpen}
        onClose={() => setItemOnHoldModalOpen(false)}
        title=""
      >
        <div className="flex flex-col items-center justify-center p-2 sm:p-4 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-5 relative border border-amber-200/50">
            <Clock className="w-7 h-7 text-amber-600 relative z-10" />
          </div>
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-2">
            Piece Currently on Hold
          </h3>
          <p className="text-xs text-stone-500 font-medium mb-6 leading-relaxed max-w-[300px]">
            Another customer has temporarily reserved the last unit of size <span className="font-bold text-stone-800">{selectedSize || "selected"}</span>. 
            <br/><br/>
            Reservations are held for 30 minutes. If the customer does not complete payment or the boutique declines, this piece will immediately be released back to stock.
          </p>

          <div className="flex flex-col w-full gap-2.5">
            <button
              onClick={() => {
                setItemOnHoldModalOpen(false);
                handleWishlistToggle();
              }}
              className="h-12 w-full rounded-2xl bg-stone-950 text-white font-bold uppercase tracking-widest text-xs transition-all active:scale-[0.98] hover:bg-stone-900 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 fill-[#F5C22B] stroke-[#F5C22B]" />
              <span>Save to Wishlist for Updates</span>
            </button>
            <button
              onClick={() => setItemOnHoldModalOpen(false)}
              className="h-12 w-full rounded-2xl bg-stone-100 text-stone-600 font-bold uppercase tracking-widest text-xs transition-all hover:bg-stone-200 active:scale-[0.98] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Duplicate Reservation Modal */}
      <Modal
        isOpen={duplicateReservationModalOpen}
        onClose={() => setDuplicateReservationModalOpen(false)}
        title=""
      >
        <div className="flex flex-col items-center justify-center p-2 sm:p-4 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-5 relative">
            <div className="absolute inset-0 bg-amber-100 rounded-full animate-ping opacity-20" />
            <ShoppingBag className="w-7 h-7 text-amber-600 relative z-10" />
          </div>
          <h3 className="text-xl font-black text-stone-900 mb-2 uppercase tracking-wide">
            Item Already Reserved
          </h3>
          <p className="text-sm text-stone-500 font-medium mb-6 leading-relaxed max-w-[280px]">
            You already have a secured reservation for this exact item and size in your cart! 
            <br/><br/>
            <span className="text-[11px] uppercase tracking-wider font-bold text-amber-700/80">
              Limit 1 reservation per customer
            </span>
          </p>

          <div className="flex flex-col w-full gap-2.5">
            <button
              onClick={() => {
                setDuplicateReservationModalOpen(false);
                router.push("/cart");
              }}
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-hive-dark via-[#2a2620] to-hive-dark text-hive-gold font-bold uppercase tracking-widest text-xs transition-all active:scale-[0.98] border border-hive-gold/60 shadow-[0_4px_15px_rgba(245,194,43,0.1)] hover:shadow-[0_0_20px_rgba(245,194,43,0.25)] hover:border-hive-gold"
            >
              Go to Cart to Checkout
            </button>
            <button
              onClick={() => setDuplicateReservationModalOpen(false)}
              className="h-12 w-full rounded-2xl bg-stone-100 text-stone-600 font-bold uppercase tracking-widest text-xs transition-all hover:bg-stone-200 active:scale-[0.98]"
            >
              Keep Browsing
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading State: PurchaseActionsSkeleton
// ─────────────────────────────────────────────────────────────────────────────
export const PurchaseActionsSkeleton: React.FC = () => {
  return (
    <div className="w-full flex flex-col gap-4 text-left animate-pulse">
      {/* Alert Banner Skeleton */}
      <div className="h-9 w-full bg-hive-comb/10 border border-hive-border/20 rounded-xl" />

      {/* Button Stack Skeleton */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="h-12 w-full bg-hive-comb/15 rounded-xl" />
        <div className="h-12 w-full bg-hive-comb/10 border border-hive-border/20 rounded-xl" />
      </div>


    </div>
  );
};
