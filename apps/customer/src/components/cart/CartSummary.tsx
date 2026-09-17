"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useCheckoutStore } from "@/store/checkout-store";
import { useCartStore } from "@/store/cart-store";
import { formatRupees } from "@hive/utils";

interface CartSummaryProps {
  subtotal: number;
  onClose: () => void;
}

export const CartSummaryComponent: React.FC<CartSummaryProps> = ({ subtotal, onClose }) => {
  const router = useRouter();
  const clearCheckoutItems = useCheckoutStore((state) => state.clearCheckoutItems);
  const items = useCartStore((state) => state.items);

  const deliveryFee = subtotal >= 10000 ? 0 : 99; // in rupees
  const total = subtotal + deliveryFee;

  const now = Date.now();

  const hasAwaitingStore = items.some(
    (i) =>
      i.isReservation &&
      (i.reservationStatus === "reservation_active" ||
        i.reservationStatus === "awaiting_store_confirmation" ||
        !i.reservationStatus)
  );

  const hasExpired = items.some(
    (i) =>
      i.isReservation &&
      (i.reservationStatus === "reservation_expired" ||
        i.reservationStatus === "payment_expired" ||
        (i.reservationExpiresAt ? now > i.reservationExpiresAt : false))
  );

  const hasUnavailable = items.some(
    (i) =>
      i.isReservation &&
      (i.reservationStatus === "unavailable" || i.reservationStatus === "cancelled")
  );

  const acceptedReservationItem = items.find(
    (i) =>
      i.isReservation &&
      (i.reservationStatus === "awaiting_payment" ||
        i.reservationStatus === "seller_accepted" ||
        i.reservationStatus === "ACCEPTED") &&
      (!i.reservationExpiresAt || now <= i.reservationExpiresAt)
  );

  const isCheckoutBlocked = hasAwaitingStore || hasExpired || hasUnavailable;

  const handleCheckout = () => {
    clearCheckoutItems();
    onClose();
    if (acceptedReservationItem?.reservationId) {
      router.push(`/checkout/address?reservationId=${acceptedReservationItem.reservationId}`);
    } else {
      router.push("/checkout/address");
    }
  };

  // Dynamically resolve boutique name and ID for hyperlocal delivery status and continue shopping redirection
  const uniqueBoutiques = Array.from(new Set(items.map((item) => item.boutiqueName).filter(Boolean)));
  const deliveryText =
    uniqueBoutiques.length === 1
      ? `90-Minute Delivery from ${uniqueBoutiques[0]}`
      : "90-Minute Direct Courier Delivery in Kochi";

  const firstItem = items[0];
  const continueShoppingUrl = firstItem?.boutiqueId
    ? `/products?boutiqueId=${firstItem.boutiqueId}`
    : "/products";

  return (
    <div className="border-t border-stone-100 bg-white px-5 pt-4.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shrink-0 z-10 select-none shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      {/* Subtotal */}
      <div className="flex justify-between items-center text-xs text-stone-500 font-normal">
        <span>Subtotal</span>
        <span className="text-stone-900 font-medium">{formatRupees(subtotal)}</span>
      </div>

      {/* Delivery Fee */}
      <div className="flex justify-between items-center text-xs text-stone-500 font-normal mt-2">
        <span>Delivery Partner Fee (Estimated)</span>
        <span className="text-stone-900 font-medium font-semibold">
          {deliveryFee === 0 ? "FREE" : `~${formatRupees(deliveryFee)}`}
        </span>
      </div>

      {/* Divider */}
      <hr className="border-stone-100 my-4" />

      {/* Estimated Total */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-stone-900">Estimated Total</span>
        <span className="text-sm font-bold text-stone-900">
          {formatRupees(total)}
        </span>
      </div>

      {/* Dynamic Delivery Status */}
      <div className="mt-3.5 text-center">
        <span className="text-[11px] text-stone-500 font-normal block leading-normal">
          {deliveryText}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex flex-col gap-2.5">
        {hasExpired ? (
          <button
            type="button"
            disabled
            className="w-full h-11 bg-rose-50 text-rose-600 cursor-not-allowed rounded-full font-medium text-xs tracking-wider flex items-center justify-center gap-1 shadow-sm focus:outline-none border border-rose-200"
          >
            Reservation Expired — Remove to Proceed
          </button>
        ) : hasUnavailable ? (
          <button
            type="button"
            disabled
            className="w-full h-11 bg-stone-100 text-stone-500 cursor-not-allowed rounded-full font-medium text-xs tracking-wider flex items-center justify-center gap-1 shadow-sm focus:outline-none border border-stone-200"
          >
            Item Unavailable — Remove to Proceed
          </button>
        ) : hasAwaitingStore ? (
          <button
            type="button"
            disabled
            className="w-full h-11 bg-amber-50/80 text-amber-800/80 cursor-not-allowed rounded-full font-medium text-xs tracking-wider flex items-center justify-center gap-1 shadow-sm focus:outline-none border border-amber-200/60"
          >
            Awaiting Store Confirmation
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckout}
            className="w-full h-11 bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all rounded-full font-medium text-xs tracking-wider flex items-center justify-center gap-1 shadow-sm focus:outline-none"
          >
            {acceptedReservationItem ? "Complete Payment \u2192" : "Secure Checkout \u2192"}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            router.push(continueShoppingUrl);
          }}
          className="w-full text-center text-xs text-stone-500 hover:text-stone-950 font-normal py-1.5 transition-colors focus:outline-none"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
};
