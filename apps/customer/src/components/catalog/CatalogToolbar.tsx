"use client";

import React from "react";
import { SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { ProductSortOption } from "@/lib/catalogSort";
import { SortDropdown } from "./CatalogSort";
import { CatalogFilterState, PRICE_MIN, PRICE_MAX } from "@/lib/catalogFilters";

export type FilterTabKey =
  | "category"
  | "size"
  | "price"
  | "occasion"
  | "new_arrivals";

export interface CatalogToolbarProps {
  activeFilterCount: number;
  resultCount: number;
  sortOption: ProductSortOption;
  onChangeSort: (sort: ProductSortOption) => void;
  onOpenMobileFilters: (initialTab?: FilterTabKey) => void;
  onClearFilters?: () => void;
  filters?: CatalogFilterState;
  onToggleNewArrivals?: () => void;
  activeBoutiqueName?: string;
  onClearBoutique?: () => void;
}

export const CatalogToolbar: React.FC<CatalogToolbarProps> = ({
  activeFilterCount,
  resultCount,
  sortOption,
  onChangeSort,
  onOpenMobileFilters,
  onClearFilters,
  filters,
  onToggleNewArrivals,
  activeBoutiqueName,
  onClearBoutique,
}) => {
  const isPriceActive =
    filters && (filters.minPrice > PRICE_MIN || filters.maxPrice < PRICE_MAX);
  const isSizeActive = filters && filters.sizes && filters.sizes.length > 0;
  const isOccasionActive =
    filters && filters.occasions && filters.occasions.length > 0;
  const isNewActive = filters && filters.newArrivals;

  const formatPriceLabel = () => {
    if (!filters) return "Price";
    if (filters.minPrice > PRICE_MIN && filters.maxPrice < PRICE_MAX) {
      return `₹${filters.minPrice}–₹${filters.maxPrice}`;
    }
    if (filters.maxPrice < PRICE_MAX) {
      return `Under ₹${filters.maxPrice}`;
    }
    if (filters.minPrice > PRICE_MIN) {
      return `Above ₹${filters.minPrice}`;
    }
    return "Price";
  };

  return (
    <div className="relative z-30 w-full flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 my-1">
      {/* 1. All Filters button with active count badge */}
      <button
        type="button"
        onClick={() => onOpenMobileFilters("category")}
        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border cursor-pointer ${
          activeFilterCount > 0
            ? "bg-stone-900 border-stone-900 text-white font-semibold"
            : "bg-white border-stone-200 text-stone-800 hover:border-stone-400"
        }`}
        aria-label="Open all filters"
      >
        <SlidersHorizontal
          className={`w-3 h-3 ${activeFilterCount > 0 ? "text-white" : "text-stone-500"}`}
        />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="bg-white text-stone-900 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center shrink-0">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* 2. Sort Dropdown Trigger */}
      <div className="shrink-0">
        <SortDropdown value={sortOption} onChange={onChangeSort} />
      </div>

      {/* Boutique Filter Capsule if scoped to a boutique */}
      {activeBoutiqueName && onClearBoutique && (
        <button
          type="button"
          onClick={onClearBoutique}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-stone-900 border border-stone-900 text-white transition-all cursor-pointer hover:bg-stone-800 shadow-xs"
          title={`Filter by ${activeBoutiqueName} (Click to remove)`}
        >
          <span>{activeBoutiqueName}</span>
          <X className="w-3 h-3 text-stone-300 hover:text-white shrink-0" />
        </button>
      )}

      {/* 3. Quick Size Capsule */}
      <button
        type="button"
        onClick={() => onOpenMobileFilters("size")}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all duration-150 border cursor-pointer ${
          isSizeActive
            ? "bg-stone-900 border-stone-900 text-white font-semibold"
            : "bg-white border-stone-200 text-stone-700 hover:border-stone-400 font-medium"
        }`}
      >
        <span>
          {isSizeActive
            ? filters.sizes.length === 1
              ? `Size: ${filters.sizes[0]}`
              : `Size (${filters.sizes.length})`
            : "Size"}
        </span>
        <ChevronDown
          className={`w-3 h-3 ${isSizeActive ? "text-stone-300" : "text-stone-400"}`}
        />
      </button>

      {/* 4. Quick Price Capsule */}
      <button
        type="button"
        onClick={() => onOpenMobileFilters("price")}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all duration-150 border cursor-pointer ${
          isPriceActive
            ? "bg-stone-900 border-stone-900 text-white font-semibold"
            : "bg-white border-stone-200 text-stone-700 hover:border-stone-400 font-medium"
        }`}
      >
        <span>{formatPriceLabel()}</span>
        <ChevronDown
          className={`w-3 h-3 ${isPriceActive ? "text-stone-300" : "text-stone-400"}`}
        />
      </button>

      {/* 5. Quick Occasion Capsule */}
      <button
        type="button"
        onClick={() => onOpenMobileFilters("occasion")}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all duration-150 border cursor-pointer ${
          isOccasionActive
            ? "bg-stone-900 border-stone-900 text-white font-semibold"
            : "bg-white border-stone-200 text-stone-700 hover:border-stone-400 font-medium"
        }`}
      >
        <span>
          {isOccasionActive
            ? `Occasion (${filters!.occasions.length})`
            : "Occasion"}
        </span>
        <ChevronDown
          className={`w-3 h-3 ${isOccasionActive ? "text-stone-300" : "text-stone-400"}`}
        />
      </button>

      {/* 6. Quick New Arrivals Toggle Capsule */}
      <button
        type="button"
        onClick={() => {
          if (onToggleNewArrivals) {
            onToggleNewArrivals();
          } else {
            onOpenMobileFilters("new_arrivals");
          }
        }}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all duration-150 border cursor-pointer ${
          isNewActive
            ? "bg-stone-900 border-stone-900 text-white font-semibold"
            : "bg-white border-stone-200 text-stone-700 hover:border-stone-400 font-medium"
        }`}
      >
        <span>New</span>
        {isNewActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
        )}
      </button>

      {/* Clear all shortcut if multiple filters are active */}
      {activeFilterCount > 1 && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="shrink-0 px-2 py-1 text-[11px] font-semibold text-stone-500 hover:text-stone-900 underline underline-offset-2 transition-colors cursor-pointer"
        >
          Clear
        </button>
      )}
    </div>
  );
};
