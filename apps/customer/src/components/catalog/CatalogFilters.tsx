"use client";

import React from "react";
import { cn } from "@hive/ui";
import { X, RotateCcw } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import {
  CatalogFilterState,
  DEFAULT_FILTER_STATE,
  PRICE_MIN,
  PRICE_MAX,
  countActiveFilters,
} from "@/lib/catalogFilters";
import { CategoryFilter } from "./filters/CategoryFilter";
import { PriceRangeFilter } from "./filters/PriceRangeFilter";
import { NewArrivalsFilter } from "./filters/NewArrivalsFilter";
import { OccasionFilter } from "./filters/OccasionFilter";

export interface CatalogFiltersProps {
  filters: CatalogFilterState;
  onChange: (filters: CatalogFilterState) => void;
  /** Compact mode — used inside mobile drawer */
  compact?: boolean;
  className?: string;
}

export const CatalogFilters: React.FC<CatalogFiltersProps> = ({
  filters,
  onChange,
  compact = false,
  className,
}) => {
  const activeCount = countActiveFilters(filters);
  const isPriceActive = filters.minPrice > PRICE_MIN || filters.maxPrice < PRICE_MAX;

  const formatPriceLabel = () => {
    if (filters.minPrice > PRICE_MIN && filters.maxPrice < PRICE_MAX) {
      return `₹${filters.minPrice.toLocaleString("en-IN")}–₹${filters.maxPrice.toLocaleString("en-IN")}`;
    }
    if (filters.maxPrice < PRICE_MAX) {
      return `Under ₹${filters.maxPrice.toLocaleString("en-IN")}`;
    }
    if (filters.minPrice > PRICE_MIN) {
      return `Above ₹${filters.minPrice.toLocaleString("en-IN")}`;
    }
    return "";
  };

  // The chips below carried category IDs, so an active category filter showed
  // the shopper a raw document id instead of the category's name.
  const dbCategories = useQuery(api.categories.getCategories, { onlyActive: true });
  const categoryName = (id: string) =>
    dbCategories?.find((c: any) => c._id === id)?.name ?? "Category";

  const reset = () => onChange(DEFAULT_FILTER_STATE);

  const patch = (partial: Partial<CatalogFilterState>) =>
    onChange({ ...filters, ...partial });

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border border-hive-border/60 rounded-[24px] overflow-hidden",
        !compact && "sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto",
        "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:bg-hive-border [&::-webkit-scrollbar-thumb]:rounded-full",
        className
      )}
      aria-label="Product filters"
    >
      {/* Header — hidden in compact mode to prevent double headers in mobile drawer */}
      {!compact && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-hive-border/60 bg-hive-cream/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-hive-dark font-serif">Filters</span>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-hive-dark text-white text-[10px] font-extrabold min-w-[20px]">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-hive-text-muted hover:text-hive-amber transition-colors uppercase tracking-widest cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={2.5} />
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Filter sections — Delivery → Price → Category */}
      <div className="flex flex-col px-5 divide-y divide-hive-border/40">
        <NewArrivalsFilter
          newArrivals={filters.newArrivals}
          onChange={(v) => patch({ newArrivals: v })}
        />

        <OccasionFilter
          selected={filters.occasions}
          onChange={(v) => patch({ occasions: v })}
        />

        <PriceRangeFilter
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onChange={(min, max) => patch({ minPrice: min, maxPrice: max })}
        />

        <CategoryFilter
          selected={filters.categories}
          onChange={(v) => patch({ categories: v })}
        />
      </div>

      {/* Active filter chips — quick remove */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-hive-border/40 bg-hive-cream/20">
          {filters.categories.map((id) => (
            <ActiveTag
              key={`cat-${id}`}
              label={categoryName(id)}
              onRemove={() =>
                patch({ categories: filters.categories.filter((c) => c !== id) })
              }
            />
          ))}
          {isPriceActive && (
            <ActiveTag
              label={formatPriceLabel()}
              onRemove={() => patch({ minPrice: PRICE_MIN, maxPrice: PRICE_MAX })}
            />
          )}
          {filters.newArrivals && (
            <ActiveTag
              label="New Finds"
              onRemove={() => patch({ newArrivals: false })}
            />
          )}
          {filters.occasions.map((occ) => (
            <ActiveTag
              key={`occ-${occ}`}
              label={occ}
              onRemove={() =>
                patch({ occasions: filters.occasions.filter((o) => o !== occ) })
              }
            />
          ))}
        </div>
      )}
    </aside>
  );
};

/* ── Small chip to remove a single active filter ── */
const ActiveTag: React.FC<{ label: string; onRemove: () => void }> = ({
  label,
  onRemove,
}) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-hive-dark/5 border border-hive-dark/15 text-[10px] font-bold text-hive-dark capitalize">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="ml-0.5 hover:text-red-500 transition-colors"
      aria-label={`Remove ${label} filter`}
    >
      <X className="w-2.5 h-2.5" strokeWidth={3} />
    </button>
  </span>
);
