"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EmptyCartState } from "@/components/cart/EmptyCartState";
import { ArrowRight, Ticket, Check, AlertCircle, Sparkles, Loader2, X, Zap } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { CartItemComponent } from "@/components/cart/CartItem";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSessionStore } from "@/context/SessionContext";
import { formatRupees } from "@hive/utils";
import { useConvexMutation } from "@/hooks/useConvexMutation";
import { useCheckoutStore } from "@/store/checkout-store";
import { Modal } from "@hive/ui";
import { FirebaseAuthCard } from "@/components/auth/FirebaseAuthCard";
import { PromoCouponCelebration } from "@/components/checkout/PromoCouponCelebration";

export default function CartPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const getCartCount = useCartStore((state) => state.getCartCount);
  const getCartTotal = useCartStore((state) => state.getCartTotal);

  const { token, isAuthenticated } = useSessionStore();
  const cartData = useQuery(api.cart.getCart, isAuthenticated && token ? { token } : "skip");
  const hasIssues = cartData?.hasIssues ?? false;
  const blockingReason = cartData?.blockingReason;

  const [cleaning, setCleaning] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const removeInvalidMutation = useConvexMutation(useMutation(api.cart.removeInvalidItems).withOptimisticUpdate((localStore, args) => {
    if (args.token) {
      const cart = localStore.getQuery(api.cart.getCart, { token: args.token });
      if (cart && cart.items) {
        localStore.setQuery(
          api.cart.getCart,
          { token: args.token },
          {
            ...cart,
            items: cart.items.filter((item: any) =>
              item.status !== "deleted" && item.status !== "inactive" && item.status !== "suspended"
            ),
            hasIssues: false,
            blockingReason: undefined,
          }
        );
      }
    }
  }));
  const removeItemFromZustand = useCartStore((state) => state.removeItem);

  const handleRemoveInvalid = async () => {
    setCleaning(true);
    try {
      if (isAuthenticated && token) {
        await removeInvalidMutation({ token });
      }
      
      // Clean up local Zustand items too
      if (cartData && cartData.items) {
        for (const item of cartData.items) {
          if (!item.isValid && (item.status === "deleted" || item.status === "inactive" || item.status === "suspended")) {
            removeItemFromZustand(item.productId, item.size);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCleaning(false);
    }
  };

  const updateAvailableStock = useCartStore((state) => state.updateAvailableStock);
  const [stockSyncedMessage, setStockSyncedMessage] = useState<string | null>(null);

  // Sync cart quantities with live backend stock
  useEffect(() => {
    if (cartData && cartData.items) {
      let changed = false;
      cartData.items.forEach((backendItem) => {
        const localItem = items.find(
          (i) => i.productId === backendItem.productId && i.size === backendItem.size
        );
        if (localItem && backendItem.availableStock !== undefined) {
          if (localItem.quantity > backendItem.availableStock) {
            updateAvailableStock(localItem.productId, localItem.size, backendItem.availableStock);
            changed = true;
          } else if (localItem.availableStock !== backendItem.availableStock) {
            // Update availableStock silently to keep it fresh
            updateAvailableStock(localItem.productId, localItem.size, backendItem.availableStock);
          }
        }
      });
      if (changed) {
        setStockSyncedMessage("Some items in your bag have been updated due to stock changes.");
        // Clear message after 10 seconds
        setTimeout(() => setStockSyncedMessage(null), 10000);
      }
    }
  }, [cartData, items, updateAvailableStock]);

  const [mounted, setMounted] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [showPromoInput, setShowPromoInput] = useState(false);
  const activePromo = useCheckoutStore((state) => state.appliedPromo);
  const setAppliedPromo = useCheckoutStore((state) => state.setAppliedPromo);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccessMsg, setPromoSuccessMsg] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{ code: string; savingsRupees: number } | null>(null);
  const convex = useConvex();

  // Hydration delay protection
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <CartPageSkeleton />;
  }

  const itemsCount = getCartCount();
  const subtotal = getCartTotal();

  // Promo Code calculations — now server-driven via checkout store
  const promoCouponDiscountPaise = useCheckoutStore.getState().promoCouponDiscountPaise;
  let discountAmount = promoCouponDiscountPaise > 0 ? promoCouponDiscountPaise / 100 : 0;
  let deliveryFee = subtotal >= 10000 ? 0 : 99;

  const taxAmount = 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee + taxAmount);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);
    setPromoSuccessMsg(null);
    const code = promoInput.trim().toUpperCase();

    if (!code) return;

    // Server-validate against the promoCoupons table
    setPromoValidating(true);
    try {
      const boutiqueIds = Array.from(
        new Set(items.map((i: any) => i.boutiqueId).filter(Boolean))
      );
      const result: any = await convex.query(api.promoCoupons.validatePromoCode, {
        code,
        boutiqueIds,
        cartTotalPaise: Math.round(subtotal * 100),
        token: token || undefined,
      });

      if (!result?.valid) {
        setPromoError(result?.message || "That coupon code isn't valid.");
        return;
      }

      const discountRupees = result.discountPaise / 100;
      setAppliedPromo(code, discountRupees, result.promoCouponId, result.discountPaise);
      setPromoSuccessMsg(result.message);
      setPromoInput("");
      // Show celebration popup
      setCelebrationData({ code, savingsRupees: discountRupees });
    } catch (err: any) {
      setPromoError(err?.message || "Couldn't validate that code. Try again.");
    } finally {
      setPromoValidating(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null, 0, null, 0);
    setPromoSuccessMsg(null);
    setPromoError(null);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State View
  // ───────────────────────────────────────────────────────────────────────────
  if (itemsCount === 0) {
    return (
      <div className="min-h-[70vh] bg-hive-cream/30 py-16 px-6 flex items-center justify-center">
        <EmptyCartState />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hive-cream/30 py-12 px-4 sm:px-6 lg:px-8 select-none">
      <div className="max-w-6xl mx-auto flex flex-col gap-8 text-left">
        
        {/* Header Title block */}
        <div className="border-b border-hive-border/40 pb-5 space-y-1.5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl text-hive-dark tracking-tight leading-none">
              Hive Bag
            </h1>
            <span className="text-sm text-hive-text-muted font-bold leading-none">
              ({itemsCount} {itemsCount === 1 ? "Item" : "Items"})
            </span>
          </div>
          <p className="text-xs text-hive-text-muted font-medium mt-1 leading-relaxed">
            Review your items and sizing before checkout.
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: Items list */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {items.map((item) => (
              <CartItemComponent key={`${item.productId}-${item.size}`} item={item} />
            ))}

            {/* Back to shopping action */}
            <Link
              href="/products"
              className="self-start text-xs font-extrabold uppercase tracking-widest text-hive-dark hover:text-hive-dark/60 transition-colors duration-200 mt-2 flex items-center gap-1.5 focus:outline-none"
            >
              <span>Continue Shopping</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Right: Summary card */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. Summary details */}
            <div className="bg-white border border-hive-border/50 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
              <h2 className="text-xs font-extrabold text-hive-dark uppercase tracking-wider border-b border-hive-border/40 pb-2">
                Order Summary
              </h2>

              {/* Pricing breakdown */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs font-semibold text-hive-text-muted">
                  <span>Subtotal</span>
                  <span>{formatRupees(subtotal)}</span>
                </div>
                
                {/* Discount display */}
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs font-semibold text-green-700 bg-green-50/50 px-2 py-1 rounded-lg border border-green-200/20">
                    <span className="flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-green-600" />
                      <span>Coupon Discount</span>
                    </span>
                    <span>-{formatRupees(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs font-semibold text-hive-text-muted">
                  <span>Delivery</span>
                  <span>{deliveryFee === 0 ? "FREE" : formatRupees(deliveryFee)}</span>
                </div>
                
                <div className="flex justify-between items-center text-xs font-semibold text-hive-text-muted">
                  <span>Estimated Tax</span>
                  <span>{formatRupees(taxAmount)}</span>
                </div>

                {/* Promo Code section integrated inline */}
                <div className="pt-2">
                  {!activePromo ? (
                    !showPromoInput ? (
                      <button
                        type="button"
                        onClick={() => setShowPromoInput(true)}
                        className="text-xs font-bold text-hive-dark hover:text-hive-dark/60 transition-colors tracking-wide underline decoration-dotted underline-offset-4 focus:outline-none"
                      >
                        Have a promo code?
                      </button>
                    ) : (
                      <form onSubmit={handleApplyPromo} className="flex gap-2 mt-1 animate-[fadeIn_0.2s_ease-out]">
                        <input
                          type="text"
                          placeholder="e.g. WELCOME10"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value)}
                          className="flex-1 h-8 px-2.5 text-xs border border-hive-border rounded-lg focus:outline-none focus:border-hive-dark/40 bg-white font-semibold placeholder:opacity-50 uppercase"
                        />
                        <button
                          type="submit"
                          className="h-8 px-3 rounded-lg bg-white border border-hive-dark text-hive-dark hover:bg-hive-cream/40 active:scale-[0.98] transition-all text-[10px] font-bold uppercase tracking-[0.15em] shadow-sm focus:outline-none"
                        >
                          Apply
                        </button>
                      </form>
                    )
                  ) : (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl mt-1">
                      <div className="flex flex-col text-left">
                        <span className="text-[10px] font-extrabold text-green-800 flex items-center gap-1 uppercase">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        {activePromo}
                      </span>
                      <span className="text-[8px] text-green-700 font-medium">Discount Applied</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        className="text-[9px] font-extrabold uppercase tracking-wide text-red-500 hover:text-red-700 bg-transparent hover:bg-red-50/50 px-1.5 py-0.5 rounded transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Promo Feedback status */}
                  {promoError && (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-red-600 mt-1.5 bg-red-50/50 border border-red-200/50 px-2 py-1 rounded-lg">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>{promoError}</span>
                    </div>
                  )}
                  {promoSuccessMsg && (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-green-700 mt-1.5 bg-green-50/20 border border-green-100/50 px-2 py-1 rounded-lg">
                      <span>{promoSuccessMsg}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center border-t border-hive-border/40 pt-3 mt-1.5">
                  <span className="text-sm font-extrabold text-hive-dark">Order Total</span>
                  <span className="text-base font-extrabold text-hive-dark">
                    {formatRupees(total)}
                  </span>
                </div>
              </div>

              {/* Checkout CTA */}
              <button
                type="button"
                disabled={hasIssues}
                onClick={() => {
                  if (isAuthenticated) {
                    router.push("/checkout/address");
                  } else {
                    setIsAuthModalOpen(true);
                  }
                }}
                className="w-full h-14 bg-hive-dark text-white hover:bg-hive-dark/90 active:scale-[0.98] transition-all rounded-lg mt-3 font-semibold uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-sm focus:outline-none disabled:bg-hive-border/40 disabled:text-hive-text-muted/50 disabled:cursor-not-allowed"
              >
                <span>Secure Checkout →</span>
              </button>

              {hasIssues && blockingReason && (
                <div className="flex flex-col gap-2 mt-4 text-left p-3.5 bg-red-50 border border-red-200/60 rounded-2xl animate-fade">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{blockingReason}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveInvalid}
                    disabled={cleaning}
                    className="w-full h-9 bg-white border border-red-200 hover:bg-red-50/50 text-red-700 font-extrabold uppercase tracking-wider text-[10px] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                  >
                    {cleaning ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-red-700 border-t-transparent animate-spin" />
                    ) : (
                      <span>Remove unavailable items</span>
                    )}
                  </button>
                </div>
              )}
            </div>

            
          </div>
          
        </div>
      </div>

      {/* Inline Checkout Sign In Modal (Option A) */}
      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        hideHeader={true}
        className="w-[calc(100%-2.5rem)] max-w-md h-fit max-h-[90vh] bg-transparent border-none shadow-none outline-none m-auto"
      >
        <div className="relative">
          <FirebaseAuthCard 
            title="Checkout Sign In" 
            subtitle="Please sign in to proceed with your order" 
            showLogo={false}
            onSuccess={() => {
              setIsAuthModalOpen(false);
              router.push("/checkout/address");
            }}
          />
          {/* Frosted dismiss close button overlayed on card */}
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(false)}
            className="absolute top-6 right-6 z-20 w-8 h-8 rounded-full border border-stone-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md flex items-center justify-center text-slate-500 hover:text-stone-950 dark:hover:text-white active:scale-95 transition-all shadow-sm cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </Modal>

      {/* Promo Coupon Celebration Popup */}
      {celebrationData && (
        <PromoCouponCelebration
          code={celebrationData.code}
          savingsRupees={celebrationData.savingsRupees}
          onDismiss={() => setCelebrationData(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading State: CartPageSkeleton
// ─────────────────────────────────────────────────────────────────────────────
function CartPageSkeleton() {
  return (
    <div className="min-h-screen bg-hive-cream/30 py-12 px-4 sm:px-6 lg:px-8 animate-pulse select-none">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        
        {/* Title Skeleton */}
        <div className="border-b border-hive-border/40 pb-5 space-y-2 text-left">
          <div className="h-8 w-48 bg-hive-comb/15 rounded-xl" />
          <div className="h-4 w-96 bg-hive-comb/10 rounded-lg" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Items Skeleton */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="h-[120px] w-full bg-hive-comb/10 border border-hive-border/20 rounded-2xl" />
            <div className="h-[120px] w-full bg-hive-comb/10 border border-hive-border/20 rounded-2xl" />
          </div>

          {/* Right Summary Skeleton */}
          <div className="lg:col-span-4 space-y-6">
            <div className="h-[300px] w-full bg-hive-comb/15 border border-hive-border/20 rounded-3xl" />
            <div className="h-[180px] w-full bg-hive-comb/10 border border-hive-border/20 rounded-3xl" />
          </div>
        </div>

      </div>
    </div>
  );
}
