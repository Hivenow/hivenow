"use client";

import React from "react";
import { HelpCircle, AlertCircle } from "lucide-react";
import { GstAndOtherChargesRow } from "./GstAndOtherChargesRow";

export interface CustomerPriceBreakdownProps {
  subtotal: number;          // Product total in Rupees
  handlingCharge?: number;   // in Rupees (from server pricing snapshot)
  platformFee?: number;      // in Rupees (from server pricing snapshot)
  gstOnCharges?: number;     // GST on handling + platform fee, in Rupees
  deliveryFee: number;       // in Rupees
  discount?: number;         // in Rupees
  total: number;             // in Rupees (authoritative server total)
  isEstimatedDelivery?: boolean;
  showHelpSection?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const CustomerPriceBreakdown: React.FC<CustomerPriceBreakdownProps> = ({
  subtotal,
  handlingCharge = 0,
  platformFee = 0,
  gstOnCharges = 0,
  deliveryFee,
  discount = 0,
  total,
  isEstimatedDelivery = false,
  showHelpSection = true,
  isLoading = false,
  isError = false,
  className = "",
}) => {
  const deliveryLabel = isEstimatedDelivery ? "Estimated Delivery Fee" : "Delivery Partner Fee";

  if (isError) {
    return (
      <div className={`bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-semibold space-y-1.5 flex flex-col items-center justify-center text-center ${className}`}>
        <AlertCircle className="w-5 h-5 text-rose-600" />
        <p className="font-bold text-sm">Unable to load checkout pricing.</p>
        <p className="text-rose-600">Please refresh and try again.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-4 animate-pulse ${className}`}>
        <div className="h-4 w-28 bg-stone-200 rounded" />
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center"><div className="h-3 w-20 bg-stone-100 rounded" /><div className="h-3 w-16 bg-stone-100 rounded" /></div>
          <div className="flex justify-between items-center"><div className="h-3 w-28 bg-stone-100 rounded" /><div className="h-3 w-12 bg-stone-100 rounded" /></div>
          <div className="flex justify-between items-center"><div className="h-3 w-24 bg-stone-100 rounded" /><div className="h-3 w-12 bg-stone-100 rounded" /></div>
          <div className="flex justify-between items-center pt-3 border-t border-stone-100"><div className="h-4 w-24 bg-stone-200 rounded" /><div className="h-4 w-20 bg-stone-200 rounded" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Price Details Card */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-3.5 text-left">
        <h3 className="text-xs font-bold text-stone-900 uppercase tracking-widest border-b border-stone-100 pb-2.5">
          PRICE DETAILS
        </h3>

        <div className="space-y-2.5 text-xs font-medium text-stone-600">
          {/* 1. Product Total (All-Inclusive), broken down into what it's made of */}
          <div className="flex justify-between items-center">
            <span className="text-stone-700">Product Total</span>
            <span className="font-mono text-stone-900 text-sm font-bold">{formatCurrency(subtotal)}</span>
          </div>

          {(handlingCharge > 0 || platformFee > 0 || gstOnCharges > 0) && (
            <div className="ml-3 pl-3 border-l-2 border-stone-100 space-y-1.5">
              <div className="flex justify-between items-center text-[11px] text-stone-500">
                <span>Base Price</span>
                <span className="font-mono">{formatCurrency(Math.max(0, subtotal - handlingCharge - platformFee - gstOnCharges))}</span>
              </div>
              <GstAndOtherChargesRow
                handlingCharge={handlingCharge}
                platformFee={platformFee}
                gstOnCharges={gstOnCharges}
                formatAmount={formatCurrency}
                className="text-[11px] text-stone-500"
                amountClassName="font-mono"
              />
            </div>
          )}

          {/* 2. Delivery Fee */}
          <div className="flex justify-between items-center">
            <span className="text-stone-700">{deliveryLabel}</span>
            <span className="font-mono text-stone-900 font-medium">
              {deliveryFee === 0 ? (
                <span className="text-emerald-700 font-bold uppercase text-[10px] tracking-wider">
                  FREE
                </span>
              ) : (
                formatCurrency(deliveryFee)
              )}
            </span>
          </div>

          {/* 3. Discount */}
          {discount > 0 && (
            <div className="flex justify-between items-center text-emerald-700 font-bold">
              <span>Discount</span>
              <span className="font-mono">-{formatCurrency(discount)}</span>
            </div>
          )}

          {/* 4. Grand Total */}
          <div className="flex justify-between items-center border-t border-stone-200 pt-3 mt-2">
            <span className="text-sm font-bold text-stone-900">Grand Total</span>
            <span className="text-base font-bold text-stone-900 font-mono">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Trust strip — the fee breakdown above already answers "why am I paying this?" directly,
          so this is a plain reassurance line rather than a second hidden copy of the same numbers. */}
      {showHelpSection && (
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-stone-50/80 border border-stone-200/70 text-[10.5px] text-stone-500 font-medium">
          <HelpCircle className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span>Every fee is shown above — nothing new is added at checkout.</span>
        </div>
      )}

    </div>
  );
};
