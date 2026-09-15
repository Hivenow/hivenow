"use client";

import React, { useState } from "react";
import { Plus, Minus, Info, X } from "lucide-react";
import { cn } from "@hive/ui";
import { VerticalVariantConfig, FitOptions } from "@hive/types";

export interface VariantEditorProps {
  config: VerticalVariantConfig;
  showGarmentFit: boolean;
  fitOptions?: FitOptions;
  selectedSizes: string[];
  onToggleSize: (size: string) => void;
  onAddCustomSize?: (size: string) => void;
  stockBySize: Record<string, number>;
  onStockChange: (size: string, qty: number) => void;
  onIncrementStock: (size: string) => void;
  onDecrementStock: (size: string) => void;
  isFreeSizeCategory?: boolean;
  /**
   * Whether the product is a garment. Free size is how every one-variant product
   * is stored, but size language only means something for clothing; a notebook
   * or a postcard just has a stock count. Defaults to true so any caller that
   * does not pass it keeps the existing wording.
   */
  isApparel?: boolean;
  fitRecommendation: "runs_small" | "true_to_size" | "runs_large";
  onFitRecommendationChange: (fit: "runs_small" | "true_to_size" | "runs_large") => void;
  silhouette: string;
  onSilhouetteChange: (sil: any) => void;
}

export function VariantEditor({
  config,
  showGarmentFit,
  fitOptions,
  selectedSizes,
  onToggleSize,
  onAddCustomSize,
  stockBySize,
  onStockChange,
  onIncrementStock,
  onDecrementStock,
  isFreeSizeCategory,
  isApparel = true,
  fitRecommendation,
  onFitRecommendationChange,
  silhouette,
  onSilhouetteChange,
}: VariantEditorProps) {
  const [customInput, setCustomInput] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!selectedSizes.includes(trimmed)) {
      if (onAddCustomSize) {
        onAddCustomSize(trimmed);
      } else {
        onToggleSize(trimmed);
      }
    }
    setCustomInput("");
    setIsAddingCustom(false);
  };

  const axisLabel = config.label || "Size";

  const sizeHeading =
    axisLabel === "Waist Size (Inches)"
      ? "Available Waist Size (Inches) *"
      : axisLabel === "Belt Size (Inches)"
      ? "Available Belt Size (Inches) *"
      : axisLabel.startsWith("Shoe Size")
      ? `Available ${axisLabel} *`
      : `Available ${axisLabel}s *`;

  const addBtnText = axisLabel.toLowerCase().includes("size")
    ? "Add Size"
    : `Add ${axisLabel}`;

  const silhouettes =
    fitOptions?.silhouettes && fitOptions.silhouettes.length > 0
      ? fitOptions.silhouettes
      : [
          { value: "slim_fit", label: "Slim", description: "Closer to body, tailored contour" },
          { value: "regular_fit", label: "Regular", description: "Standard classic silhouette" },
          { value: "relaxed_fit", label: "Relaxed", description: "Loose, comfortable everyday drape" },
          { value: "oversized", label: "Oversized", description: "Intentionally roomy streetwear fit" },
        ];

  // The stored variant stays "Free Size" either way; only the wording changes.
  const isStockOnly = isFreeSizeCategory && !isApparel;

  return (
    <div className="flex flex-col gap-6 select-text" style={{ touchAction: "pan-y" }}>
      {/* Free Size Notice */}
      {isStockOnly ? null : isFreeSizeCategory ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
          <Info className="w-4 h-4 text-slate-600 shrink-0" />
          <p className="text-xs font-medium text-slate-700">
            {selectedSizes.some((s) => s === "Free")
              ? 'This product has size "Free" selected.'
              : 'This product is Free Size. "Free Size" has been selected for you.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {sizeHeading}
            </label>
            <span className="text-[10px] text-slate-400 font-medium">
              Select all options in stock
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {config.defaultOptions.map((opt) => {
              const isSelected = selectedSizes.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => onToggleSize(opt)}
                  className={cn(
                    "min-h-[44px] min-w-[54px] px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer select-none shrink-0 active:scale-95",
                    isSelected
                      ? "bg-slate-950 text-white border-slate-950 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {opt}
                </button>
              );
            })}

            {/* Custom selected variants not in default list */}
            {selectedSizes
              .filter((sz) => !config.defaultOptions.includes(sz))
              .map((customSz) => (
                <div
                  key={customSz}
                  className="min-h-[44px] px-3 py-2 rounded-xl border bg-slate-950 text-white border-slate-950 shadow-xs text-xs font-bold flex items-center gap-1.5"
                >
                  <span>{customSz}</span>
                  <button
                    type="button"
                    onClick={() => onToggleSize(customSz)}
                    className="p-0.5 rounded hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

            {/* Add Custom Variant button */}
            {config.allowCustom && !isAddingCustom && (
              <button
                type="button"
                onClick={() => setIsAddingCustom(true)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addBtnText}</span>
              </button>
            )}
          </div>

          {/* Custom variant inline input */}
          {config.allowCustom && isAddingCustom && (
            <form onSubmit={handleAddCustom} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                autoFocus
                placeholder={
                  config.unit
                    ? `e.g. 75${config.unit}`
                    : axisLabel.toLowerCase().includes("waist")
                    ? "e.g. 31"
                    : `e.g. Custom ${axisLabel}`
                }
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="h-10 px-3.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 w-44"
              />
              <button
                type="submit"
                className="h-10 px-3.5 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-900 cursor-pointer active:scale-95"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setIsAddingCustom(false)}
                className="h-10 px-2.5 text-slate-500 hover:text-slate-900 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {/* Per-Variant Stock Inputs — Mandatory */}
      {selectedSizes.length > 0 && (
        <div className="flex flex-col gap-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {isStockOnly ? "Stock Quantity (Units) *" : "Quantity in Stock (Units) *"}
            </label>
            {!isStockOnly && (
              <span className="text-[10px] text-red-500 font-semibold">
                Mandatory for each {axisLabel.toLowerCase()}
              </span>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
            {selectedSizes.map((sz) => {
              const qty = stockBySize[sz] || 0;
              const hasZero = qty <= 0;
              return (
                <div
                  key={sz}
                  className={cn(
                    "px-4 py-3 flex justify-between items-center transition-colors",
                    hasZero && "bg-red-50/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{isStockOnly ? "In stock" : sz}</span>
                    {hasZero && (
                      <span className="text-[10px] text-red-500 font-medium">
                        (Please enter quantity)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDecrementStock(sz)}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                    >
                      <Minus className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    <input
                      type="number"
                      min="1"
                      value={stockBySize[sz] || ""}
                      onChange={(e) => onStockChange(sz, parseInt(e.target.value) || 0)}
                      className={cn(
                        "w-16 h-9 px-2 py-1 border rounded-xl text-sm font-bold text-center focus:border-slate-900 focus:outline-none",
                        hasZero
                          ? "border-red-300 bg-red-50/40 text-red-700"
                          : "border-slate-200 text-slate-900"
                      )}
                      placeholder="1"
                    />

                    <button
                      type="button"
                      onClick={() => onIncrementStock(sz)}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Garment Fit Recommendation & Silhouette */}
      {showGarmentFit && (
        <div className="flex flex-col gap-6 pt-2 border-t border-slate-100">
          {/* Fit Recommendation */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Fit Sizing
            </label>
            <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
              {[
                { val: "runs_small", label: "Runs Small" },
                { val: "true_to_size", label: "True to Size" },
                { val: "runs_large", label: "Runs Large" },
              ].map((rec) => (
                <button
                  key={rec.val}
                  type="button"
                  onClick={() => onFitRecommendationChange(rec.val as any)}
                  className={cn(
                    "min-h-[44px] py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center select-none active:scale-95",
                    fitRecommendation === rec.val
                      ? "bg-slate-950 text-white border-slate-950 font-bold shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {rec.label}
                </button>
              ))}
            </div>
          </div>

          {/* Silhouette */}
          {silhouettes.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Silhouette
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-md">
                {silhouettes.map((sil) => (
                  <button
                    key={sil.value}
                    type="button"
                    title={sil.description}
                    onClick={() => onSilhouetteChange(sil.value as any)}
                    className={cn(
                      "min-h-[44px] py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center select-none active:scale-95",
                      silhouette === sil.value
                        ? "bg-slate-950 text-white border-slate-950 font-bold shadow-2xs"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {sil.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
