"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

interface PromoCouponCelebrationProps {
  code: string;
  savingsRupees: number;
  onDismiss: () => void;
}

/**
 * Swiggy-style animated celebration popup when a promo coupon is applied.
 * Auto-dismisses after 4 seconds.
 */
export function PromoCouponCelebration({ code, savingsRupees, onDismiss }: PromoCouponCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss after 4s
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? "bg-black/40 backdrop-blur-[2px]" : "bg-transparent pointer-events-none"
      }`}
      onClick={handleDismiss}
    >
      <div
        className={`relative bg-white rounded-3xl shadow-2xl w-full max-w-[320px] overflow-hidden transition-all duration-300 ${
          isVisible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-90 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
          {/* Animated checkmark badge */}
          <div
            className={`w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4 transition-all duration-500 ${
              isVisible ? "scale-100" : "scale-0"
            }`}
            style={{ transitionDelay: "150ms" }}
          >
            <div
              className={`w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 transition-all duration-500 ${
                isVisible ? "scale-100 rotate-0" : "scale-0 rotate-180"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              <CheckCircle2 className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
          </div>

          {/* Code applied */}
          <p
            className={`text-xs font-bold text-stone-500 uppercase tracking-wider mb-1 transition-all duration-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            &apos;{code}&apos; applied
          </p>

          {/* Savings amount */}
          <p
            className={`text-xl font-black text-stone-900 leading-snug transition-all duration-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
            style={{ transitionDelay: "500ms" }}
          >
            ₹{savingsRupees.toLocaleString("en-IN")} savings
            <br />
            <span className="text-base">with this coupon.</span>
          </p>

          {/* Congratulations */}
          <p
            className={`text-xs text-stone-400 font-medium mt-1 transition-all duration-400 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "600ms" }}
          >
            Congratulations
          </p>

          {/* YAY button */}
          <button
            type="button"
            onClick={handleDismiss}
            className={`mt-5 w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.97] text-stone-900 font-black text-sm uppercase tracking-[0.2em] shadow-sm transition-all duration-400 cursor-pointer ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{ transitionDelay: "700ms" }}
          >
            YAY!
          </button>
        </div>
      </div>
    </div>
  );
}
