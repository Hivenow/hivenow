"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus } from "lucide-react";
import { CartItem, useCartStore } from "@/store/cart-store";
import { cleanProductTitle } from "../product/ProductCard";
import { useCart } from "@/context/CartContext";
import { formatRupees } from "@hive/utils";

interface CartItemProps {
  item: CartItem;
}

export const CartItemComponent: React.FC<CartItemProps> = ({ item }) => {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const { setSidebarOpen } = useCart();

  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (item.isReservation && item.reservationExpiresAt) {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [item.isReservation, item.reservationExpiresAt]);

  const isAccepted =
    item.isReservation &&
    (item.reservationStatus === "awaiting_payment" ||
      item.reservationStatus === "seller_accepted" ||
      item.reservationStatus === "ACCEPTED");

  const isExpired =
    item.isReservation &&
    (item.reservationStatus === "reservation_expired" ||
      item.reservationStatus === "payment_expired" ||
      (item.reservationExpiresAt ? now > item.reservationExpiresAt : false));

  const isUnavailable =
    item.isReservation &&
    (item.reservationStatus === "unavailable" || item.reservationStatus === "cancelled");

  const isAwaitingStore = item.isReservation && !isAccepted && !isExpired && !isUnavailable;

  const minutesLeft =
    item.reservationExpiresAt && item.reservationExpiresAt > now
      ? Math.max(1, Math.ceil((item.reservationExpiresAt - now) / 60000))
      : 0;

  return (
    <div className="flex gap-4 bg-white p-4 rounded-xl border border-stone-100 relative group overflow-hidden">
      {/* Product Image */}
      <Link
        href={`/products/${item.productId}`}
        onClick={() => setSidebarOpen(false)}
        className="relative w-[72px] h-24 rounded-lg overflow-hidden bg-stone-50 border border-stone-100 flex-shrink-0 cursor-pointer block"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-stone-100 flex items-center justify-center text-[10px] font-medium text-stone-400">
            No Image
          </div>
        )}
      </Link>

      {/* Info details */}
      <div className="flex-1 flex flex-col justify-between text-left pr-4 select-none">
        <Link
          href={`/products/${item.productId}`}
          onClick={() => setSidebarOpen(false)}
          className="cursor-pointer block"
        >
          {/* Product Name (Product First) */}
          <h3 className="text-xs font-semibold text-stone-900 leading-snug line-clamp-2 pr-2 hover:text-hive-dark/70 transition-colors">
            {cleanProductTitle(item.name)}
          </h3>

          {/* Boutique Name & Verified badge (Boutique Second) */}
          <div className="text-[10px] text-stone-500 font-normal mt-1.5 flex flex-col gap-0.5">
            <div>
              <span className="text-stone-400">Sold by</span>{" "}
              <span className="font-semibold text-stone-750">{item.boutiqueName}</span>
            </div>
            <span className="text-[9px] text-stone-400 uppercase tracking-wider font-medium">
              Verified Partner
            </span>
          </div>

          {/* Selected Size & Preorder / Reservation Badge */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] text-stone-500 block">
              Size {item.size}
            </span>
            {item.isPreorder && item.scheduledProcessingDate && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                Pre-order
              </span>
            )}
            {item.isReservation && isAccepted && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border border-emerald-200">
                Seller Accepted
              </span>
            )}
            {item.isReservation && isAwaitingStore && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-200">
                Reserved
              </span>
            )}
            {item.isReservation && isExpired && (
              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border border-rose-200">
                Expired
              </span>
            )}
            {item.isReservation && isUnavailable && (
              <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border border-stone-200">
                Unavailable
              </span>
            )}
          </div>
        </Link>

        {/* Bottom details: Price & Quantity / Reservation Action */}
        <div className="flex items-center justify-between mt-2.5">
          {/* Price */}
          <span className="text-xs font-bold text-stone-900">
            {formatRupees(item.price)}
          </span>

          {/* Quantity selector or Reserved status */}
          {item.isReservation ? (
            <div className="flex flex-col items-end gap-0.5 pr-1 text-right">
              {isAccepted ? (
                <>
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                    Ready to Pay
                  </span>
                  {minutesLeft > 0 && (
                    <span className="text-[9px] text-amber-700 font-semibold bg-amber-50 px-1 rounded">
                      ⏱ {minutesLeft}m left
                    </span>
                  )}
                </>
              ) : isExpired ? (
                <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">
                  Expired
                </span>
              ) : isUnavailable ? (
                <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                  Declined
                </span>
              ) : (
                <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                  Awaiting Store
                </span>
              )}
              <span className="text-[9px] text-stone-400 font-medium">Qty: 1</span>
            </div>
          ) : (
            <div className="flex items-center gap-4.5 select-none pr-1">
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                className="text-stone-400 hover:text-stone-800 transition-colors text-sm font-light px-1 focus:outline-none"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-medium text-stone-900 min-w-[10px] text-center">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                disabled={item.quantity >= (item.availableStock ?? 1)}
                className="text-stone-400 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-light px-1 focus:outline-none"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Remove Button */}
      <button
        type="button"
        onClick={() => removeItem(item.productId, item.size)}
        className="absolute top-3 right-3 p-1 rounded-full text-stone-300 hover:text-red-500 transition-colors focus:outline-none"
        aria-label="Remove item"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
