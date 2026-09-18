"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatRupees } from "@hive/utils";
import { CheckCircle2, Clock, XCircle, AlertCircle, ShoppingBag } from "lucide-react";

interface ReservationStatusCardProps {
  reservation: any;
}

export const ReservationStatusCard: React.FC<ReservationStatusCardProps> = ({ reservation }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const renderContent = () => {
    switch (reservation.status) {
      case "reservation_active":
      case "awaiting_store_confirmation":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-700">
              <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
              <span className="text-sm font-bold">Awaiting Seller Acceptance</span>
            </div>
            <p className="text-xs text-stone-600">
              The store will confirm availability {reservation.scheduledConfirmDate ? `on ${reservation.scheduledConfirmDate}` : "tomorrow"}. You&apos;ll receive a WhatsApp message once accepted!
            </p>
          </div>
        );
      case "awaiting_payment":
      case "ACCEPTED":
      case "seller_accepted":
      case "PAYMENT_PENDING": {
        let timeLeft = 0;
        if (reservation.paymentExpiresAt) {
          timeLeft = Math.max(0, Math.floor((reservation.paymentExpiresAt - now) / 60000));
        }
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold">Seller Accepted — Complete Payment 🎉</h3>
              </div>
              <p className="text-xs text-stone-600">
                The seller has reserved your item. Complete payment to finalize your order.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <Link
                href={`/checkout/address?reservationId=${reservation._id}`}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-extrabold uppercase tracking-wider py-2.5 px-6 rounded-xl shadow-md active:scale-95 transition-all"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>PAY NOW</span>
                <span>&rarr;</span>
              </Link>
              {timeLeft > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/60">
                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>Expires in {timeLeft}m</span>
                </div>
              )}
            </div>
          </div>
        );
      }
      case "reservation_confirmed":
      case "order_confirmed":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold">Order Confirmed</span>
            </div>
            <p className="text-xs text-stone-600">Your payment was successful and the store is processing your order.</p>
          </div>
        );
      case "payment_expired":
      case "reservation_expired":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-stone-500">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-bold">Reservation ended</span>
            </div>
            <Link href="/" className="text-xs font-bold text-stone-900 hover:text-amber-700 underline">
              Explore similar styles &rarr;
            </Link>
          </div>
        );
      case "unavailable":
      case "cancelled":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-4 h-4" />
              <span className="text-sm font-bold">
                {reservation.status === "cancelled" ? "Reservation cancelled" : "Looks like this item isn't available"}
              </span>
            </div>
            <Link href="/" className="text-xs font-bold text-stone-900 hover:text-amber-700 underline">
              See similar styles &rarr;
            </Link>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-stone-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-bold">{reservation.status.replace(/_/g, " ")}</span>
          </div>
        );
    }
  };

  return (
    <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-start text-left">
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-stone-50 flex-shrink-0 relative border border-stone-100">
        {reservation.productImageUrl ? (
          <img src={reservation.productImageUrl} alt={reservation.productName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <ShoppingBag className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1 w-full">
        <div className="flex justify-between items-start gap-3 w-full">
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-sm font-bold text-stone-900 leading-snug truncate">{reservation.productName}</h3>
            <p className="text-xs text-stone-500 mt-0.5 font-medium">Size {reservation.size}</p>
          </div>
          <span className="text-sm font-extrabold text-stone-900 whitespace-nowrap flex-shrink-0 ml-2">
            {formatRupees(reservation.priceAtReserve)}
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-stone-100 w-full">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
