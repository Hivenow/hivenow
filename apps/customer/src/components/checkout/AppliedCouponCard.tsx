"use client";

import React from "react";
import { Check } from "lucide-react";

interface AppliedCouponCardProps {
  code: string;
  /** Exact saving in rupees, as charged (not rounded). */
  savingsRupees: number;
  onRemove: () => void;
}

/**
 * Applied promo coupon, shown in place of the code input. Confirms the code
 * and the exact saving without covering the page mid-checkout.
 */
export function AppliedCouponCard({ code, savingsRupees, onRemove }: AppliedCouponCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 bg-white border border-emerald-200 px-3 py-2.5 rounded-xl animate-[fadeIn_0.2s_ease-out]"
    >
      <span className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
        <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />
      </span>
      <div className="flex flex-col min-w-0 flex-1 text-left">
        <span className="text-xs font-extrabold text-hive-dark tracking-wide uppercase truncate">{code}</span>
        <span className="text-[11px] text-hive-text-muted font-medium">
          {savingsRupees > 0 ? (
            <>
              You save{" "}
              <span className="font-bold text-emerald-700">
                ₹{savingsRupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </>
          ) : (
            "Coupon applied"
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[11px] font-bold text-hive-text-muted hover:text-hive-dark underline-offset-2 hover:underline px-1.5 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hive-dark/20"
      >
        Remove
      </button>
    </div>
  );
}
