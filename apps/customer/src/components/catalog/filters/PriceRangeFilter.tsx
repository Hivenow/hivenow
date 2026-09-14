"use client";

import React, { useCallback } from "react";
import { FilterSection } from "./FilterSection";
import { PRICE_MIN, PRICE_MAX, PRICE_PRESETS } from "@/lib/catalogFilters";

interface PriceRangeFilterProps {
  minPrice: number;
  maxPrice: number;
  onChange: (min: number, max: number) => void;
}

const fmt = (v: number) =>
  `₹${v.toLocaleString("en-IN")}`;

export const PriceRangeFilter: React.FC<PriceRangeFilterProps> = ({
  minPrice,
  maxPrice,
  onChange,
}) => {
  const isActive = minPrice > PRICE_MIN || maxPrice < PRICE_MAX;

  const handleMin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.min(Number(e.target.value), maxPrice - 500);
      onChange(val, maxPrice);
    },
    [maxPrice, onChange]
  );

  const handleMax = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(Number(e.target.value), minPrice + 500);
      onChange(minPrice, val);
    },
    [minPrice, onChange]
  );

  const minPct = Math.min(100, Math.max(0, ((minPrice - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100));
  const maxPct = Math.min(100, Math.max(0, ((maxPrice - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100));

  // Quick presets excluding "All Prices"
  const filterPresets = PRICE_PRESETS.filter(
    (p) => p.min > PRICE_MIN || p.max < PRICE_MAX
  );

  return (
    <FilterSection title="Price Range" activeCount={isActive ? 1 : 0}>
      <div className="flex flex-col gap-5 px-1">
        {/* Range display */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-hive-dark">{fmt(minPrice)}</span>
          <span className="text-xs text-hive-text-muted">–</span>
          <span className="text-sm font-bold text-hive-dark">
            {maxPrice >= PRICE_MAX ? `${fmt(maxPrice)}+` : fmt(maxPrice)}
          </span>
        </div>

        {/* Dual-range slider */}
        <div className="relative h-6 flex items-center">
          {/* Track */}
          <div className="absolute w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800">
            {/* Active track fill */}
            <div
              className="absolute h-full rounded-full bg-stone-900 dark:bg-amber-500"
              style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
            />
          </div>

          {/* Min thumb */}
          <input
            type="range"
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={500}
            value={minPrice}
            onChange={handleMin}
            className="absolute w-full h-full appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4.5 [&::-webkit-slider-thumb]:h-4.5
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-stone-900
                       [&::-webkit-slider-thumb]:shadow-md
                       [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing
                       [&::-webkit-slider-thumb]:transition-all
                       [&::-moz-range-thumb]:w-4.5 [&::-moz-range-thumb]:h-4.5
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                       [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-stone-900"
            aria-label="Minimum price"
            style={{ zIndex: minPrice > PRICE_MAX - 1000 ? 5 : 3 }}
          />

          {/* Max thumb */}
          <input
            type="range"
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={500}
            value={maxPrice}
            onChange={handleMax}
            className="absolute w-full h-full appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4.5 [&::-webkit-slider-thumb]:h-4.5
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-stone-900
                       [&::-webkit-slider-thumb]:shadow-md
                       [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing
                       [&::-webkit-slider-thumb]:transition-all
                       [&::-moz-range-thumb]:w-4.5 [&::-moz-range-thumb]:h-4.5
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                       [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-stone-900"
            aria-label="Maximum price"
            style={{ zIndex: 4 }}
          />
        </div>

        {/* Quick preset chips */}
        <div className="flex flex-wrap gap-2">
          {filterPresets.map((preset) => {
            const active = minPrice === preset.min && maxPrice === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChange(preset.min, preset.max)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                  active
                    ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 border-stone-900 dark:border-white shadow-xs"
                    : "bg-stone-50 dark:bg-stone-900 border-stone-200/80 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-amber-400 hover:bg-stone-100"
                }`}
              >
                {preset.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    </FilterSection>
  );
};
