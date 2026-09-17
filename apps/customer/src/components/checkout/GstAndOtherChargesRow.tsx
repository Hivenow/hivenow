"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

interface GstAndOtherChargesRowProps {
  handlingCharge: number;   // in Rupees
  platformFee: number;      // in Rupees
  gstOnCharges: number;     // GST on handling + platform fee, in Rupees
  formatAmount: (amount: number) => string;
  className?: string;
  amountClassName?: string;
}

/**
 * Collapses handling fee, platform fee and GST on those fees into a single
 * "GST & Other Charges" line. Tapping the label reveals the split in a popover.
 */
export const GstAndOtherChargesRow: React.FC<GstAndOtherChargesRowProps> = ({
  handlingCharge,
  platformFee,
  gstOnCharges,
  formatAmount,
  className = "",
  amountClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const total = handlingCharge + platformFee + gstOnCharges;
  if (total <= 0) return null;

  const lines = [
    {
      label: "Handling Fee",
      amount: handlingCharge,
      note: "Covers packing and handover of your order to our delivery partner.",
    },
    {
      label: "Platform Fee",
      amount: platformFee,
      note: "Helps us run and maintain the Hive platform.",
    },
    {
      label: "GST on Fees",
      amount: gstOnCharges,
      note: "18% GST on the handling and platform fees, as required by law.",
    },
  ].filter((line) => line.amount > 0);

  return (
    <div ref={containerRef} className={`relative flex justify-between items-center ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        className="flex items-center gap-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-hive-gold/60 rounded"
      >
        <span className="underline decoration-dashed decoration-1 underline-offset-4">GST & Other Charges</span>
        <Info className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </button>
      <span className={amountClassName}>{formatAmount(total)}</span>

      {isOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="GST & Other Charges breakdown"
          className="absolute left-0 bottom-full mb-2 z-50 w-[17rem] max-w-[calc(100vw-3rem)] rounded-2xl bg-white border border-stone-200 shadow-[0_12px_40px_rgb(0,0,0,0.14)] p-4 text-left"
        >
          <p className="text-sm font-bold text-stone-900 mb-3">GST & Other Charges</p>
          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.label} className="space-y-0.5">
                <div className="flex justify-between items-center text-xs font-semibold text-stone-800">
                  <span>{line.label}</span>
                  <span className="font-mono">{formatAmount(line.amount)}</span>
                </div>
                <p className="text-[10.5px] leading-snug text-stone-500 font-medium">{line.note}</p>
              </div>
            ))}
          </div>
          {/* Arrow pointing at the label */}
          <span
            aria-hidden="true"
            className="absolute -bottom-1.5 left-6 w-3 h-3 rotate-45 bg-white border-r border-b border-stone-200"
          />
        </div>
      )}
    </div>
  );
};
