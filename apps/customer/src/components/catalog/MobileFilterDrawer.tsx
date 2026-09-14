"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Check } from "lucide-react";
import { cn } from "@hive/ui";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  CatalogFilterState,
  DEFAULT_FILTER_STATE,
  STANDARD_SIZES,
  PRICE_MIN,
  PRICE_MAX,
  PRICE_PRESETS,
  countActiveFilters,
} from "@/lib/catalogFilters";
import { toQueryCoords } from "@/lib/distance";
import { FilterTabKey } from "./CatalogToolbar";

interface MobileFilterDrawerProps {
  filters: CatalogFilterState;
  onChange: (filters: CatalogFilterState) => void;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: FilterTabKey;
  latitude?: number | null;
  longitude?: number | null;
  browseAll?: boolean;
  boutiqueId?: string | null;
}

const OCCASIONS = [
  { id: "casual", label: "Casual Wear" },
  { id: "festive", label: "Festive & Traditional" },
  { id: "party", label: "Party & Evening" },
  { id: "wedding", label: "Bridal & Wedding" },
  { id: "workwear", label: "Office & Formal" },
];


export const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  filters,
  onChange,
  isOpen,
  onClose,
  initialTab = "category",
  latitude,
  longitude,
  browseAll = false,
  boutiqueId,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTabKey>(initialTab);
  const [draftFilters, setDraftFilters] =
    useState<CatalogFilterState>(filters);

  // Sync draft state with external filters whenever drawer opens
  useEffect(() => {
    if (isOpen) {
      setDraftFilters(filters);
      if (initialTab) setActiveTab(initialTab);
    }
  }, [isOpen, filters, initialTab]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Query live category hierarchy for base availability counts
  const hierarchyArgs = useMemo(() => {
    const args: Record<string, any> = {};
    if (
      !browseAll &&
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      !(latitude === 0 && longitude === 0)
    ) {
      Object.assign(args, toQueryCoords(latitude, longitude));
    }
    if (boutiqueId) {
      args.boutiqueId = boutiqueId as Id<"boutiques">;
    }
    return args;
  }, [browseAll, latitude, longitude, boutiqueId]);

  const categoryHierarchy = useQuery(
    api.categories.getCategoryHierarchy,
    isOpen ? hierarchyArgs : "skip",
  );

  // Draft query args to fetch exact matching item count reactively
  const draftQueryArgs = useMemo(() => {
    const args: Record<string, any> = {
      page: 1,
      pageSize: 1,
    };
    if (
      !browseAll &&
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      !(latitude === 0 && longitude === 0)
    ) {
      Object.assign(args, toQueryCoords(latitude, longitude));
    }
    if (boutiqueId) {
      args.boutiqueId = boutiqueId as Id<"boutiques">;
    }
    if (draftFilters.categories.length > 0) {
      args.categoryIds = draftFilters.categories as Id<"categories">[];
    }
    if (draftFilters.sizes && draftFilters.sizes.length > 0) {
      args.sizes = draftFilters.sizes;
    }
    if (draftFilters.minPrice > PRICE_MIN) {
      args.minPrice = draftFilters.minPrice;
    }
    if (draftFilters.maxPrice < PRICE_MAX) {
      args.maxPrice = draftFilters.maxPrice;
    }
    if (draftFilters.occasions.length > 0) {
      args.occasions = draftFilters.occasions;
    }
    if (draftFilters.newArrivals) {
      args.newArrivals = true;
    }
    return args;
  }, [draftFilters, browseAll, latitude, longitude, boutiqueId]);

  const draftCatalogPage = useQuery(
    api.products.getCatalogPage,
    isOpen ? draftQueryArgs : "skip",
  );

  const draftCount = draftCatalogPage?.totalCount;
  const activeCount = countActiveFilters(draftFilters);

  // Section active flags for indicators
  const isCategoryActive = draftFilters.categories.length > 0;
  const isSizeActive = (draftFilters.sizes || []).length > 0;
  const isPriceActive =
    draftFilters.minPrice > PRICE_MIN || draftFilters.maxPrice < PRICE_MAX;
  const isOccasionActive = draftFilters.occasions.length > 0;
  const isNewActive = draftFilters.newArrivals;

  const handleApply = () => {
    onChange(draftFilters);
    onClose();
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTER_STATE);
    onChange(DEFAULT_FILTER_STATE);
  };

  const toggleCategory = (catId: string) => {
    setDraftFilters((prev) => {
      const exists = prev.categories.includes(catId);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((id) => id !== catId)
          : [...prev.categories, catId],
      };
    });
  };

  const toggleSize = (size: string) => {
    setDraftFilters((prev) => {
      const current = prev.sizes || [];
      const exists = current.includes(size);
      return {
        ...prev,
        sizes: exists
          ? current.filter((s) => s !== size)
          : [...current, size],
      };
    });
  };

  const toggleOccasion = (occId: string) => {
    setDraftFilters((prev) => {
      const exists = prev.occasions.includes(occId);
      return {
        ...prev,
        occasions: exists
          ? prev.occasions.filter((id) => id !== occId)
          : [...prev.occasions, occId],
      };
    });
  };

  const setPriceBracket = (min: number, max: number) => {
    setDraftFilters((prev) => ({
      ...prev,
      minPrice: min,
      maxPrice: max,
    }));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel: high-density two-pane discovery sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Product filters"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 flex flex-col",
          "bg-white rounded-t-2xl shadow-2xl border-t border-stone-200",
          "h-[82dvh] max-h-[700px] transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-stone-900 tracking-tight">
              Filters
            </h3>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={activeCount === 0}
              className="text-xs font-semibold text-stone-500 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-500 uppercase tracking-wider transition-colors cursor-pointer"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Split-pane body: Left rail + Right options */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Rail */}
          <div className="w-28 sm:w-36 bg-stone-50 border-r border-stone-200 flex flex-col overflow-y-auto shrink-0 py-2">
            {/* Category Tab */}
            <button
              type="button"
              onClick={() => setActiveTab("category")}
              className={`w-full text-left px-3.5 py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === "category"
                  ? "bg-white text-stone-950 font-bold border-l-2 border-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-100/60"
              }`}
            >
              <span>Category</span>
              {isCategoryActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-stone-900 shrink-0" />
              )}
            </button>

            {/* Size Tab */}
            <button
              type="button"
              onClick={() => setActiveTab("size")}
              className={`w-full text-left px-3.5 py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === "size"
                  ? "bg-white text-stone-950 font-bold border-l-2 border-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-100/60"
              }`}
            >
              <span>Size</span>
              {isSizeActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-stone-900 shrink-0" />
              )}
            </button>

            {/* Price Tab */}
            <button
              type="button"
              onClick={() => setActiveTab("price")}
              className={`w-full text-left px-3.5 py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === "price"
                  ? "bg-white text-stone-950 font-bold border-l-2 border-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-100/60"
              }`}
            >
              <span>Price</span>
              {isPriceActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-stone-900 shrink-0" />
              )}
            </button>

            {/* Occasion Tab */}
            <button
              type="button"
              onClick={() => setActiveTab("occasion")}
              className={`w-full text-left px-3.5 py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === "occasion"
                  ? "bg-white text-stone-950 font-bold border-l-2 border-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-100/60"
              }`}
            >
              <span>Occasion</span>
              {isOccasionActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-stone-900 shrink-0" />
              )}
            </button>

            {/* New Arrivals Tab */}
            <button
              type="button"
              onClick={() => setActiveTab("new_arrivals")}
              className={`w-full text-left px-3.5 py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === "new_arrivals"
                  ? "bg-white text-stone-950 font-bold border-l-2 border-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-100/60"
              }`}
            >
              <span>New</span>
              {isNewActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-stone-900 shrink-0" />
              )}
            </button>
          </div>

          {/* Right Options Area */}
          <div className="flex-1 bg-white p-4 overflow-y-auto">
            {/* 1. Category Options */}
            {activeTab === "category" && (
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Select Categories
                </div>
                {categoryHierarchy ? (
                  categoryHierarchy.roots.map((root: any) => (
                    <div key={root._id} className="space-y-2">
                      <div className="font-semibold text-xs text-stone-900 tracking-tight pb-1 border-b border-stone-100">
                        {root.name}
                      </div>
                      <div className="space-y-1 pl-1">
                        {root.children.map((child: any) => {
                          const isSelected = draftFilters.categories.includes(
                            child._id,
                          );
                          const count = browseAll
                            ? child.globalCount
                            : child.serviceableCount;

                          return (
                            <button
                              key={child._id}
                              type="button"
                              onClick={() => toggleCategory(child._id)}
                              className="w-full flex items-center justify-between py-2 text-left text-xs text-stone-700 hover:text-stone-900 group cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "bg-stone-900 border-stone-900 text-white"
                                      : "border-stone-300 group-hover:border-stone-400 bg-white"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check
                                      className="w-3 h-3"
                                      strokeWidth={2.5}
                                    />
                                  )}
                                </div>
                                <span
                                  className={
                                    isSelected
                                      ? "font-semibold text-stone-900"
                                      : "font-normal"
                                  }
                                >
                                  {child.name}
                                </span>
                              </div>
                              {count !== undefined && count > 0 && (
                                <span className="text-[11px] text-stone-400 tabular-nums">
                                  ({count})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-stone-400 py-4">
                    Loading categories...
                  </div>
                )}
              </div>
            )}

            {/* 2. Size Options (No fake counts) */}
            {activeTab === "size" && (
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Select Size
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STANDARD_SIZES.map((size) => {
                    const isSelected = (draftFilters.sizes || []).includes(size);
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleSize(size)}
                        className={`h-11 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? "bg-stone-900 border-stone-900 text-white shadow-xs"
                            : "bg-white border-stone-200 text-stone-800 hover:border-stone-400"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Price Options */}
            {activeTab === "price" && (
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Price Range
                </div>
                <div className="space-y-2">
                  {PRICE_PRESETS.map((preset) => {
                    const isSelected =
                      draftFilters.minPrice === preset.min &&
                      draftFilters.maxPrice === preset.max;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setPriceBracket(preset.min, preset.max)
                        }
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "border-stone-900 bg-stone-50 font-semibold text-stone-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 font-medium"
                        }`}
                      >
                        <span>{preset.label}</span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-stone-900 bg-stone-900 text-white"
                              : "border-stone-300 bg-white"
                          }`}
                        >
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Occasion Options (No fake counts) */}
            {activeTab === "occasion" && (
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Select Occasion
                </div>
                <div className="space-y-1">
                  {OCCASIONS.map((occ) => {
                    const isSelected = draftFilters.occasions.includes(occ.id);
                    return (
                      <button
                        key={occ.id}
                        type="button"
                        onClick={() => toggleOccasion(occ.id)}
                        className="w-full flex items-center justify-between py-2.5 text-left text-xs text-stone-700 hover:text-stone-900 group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                              isSelected
                                ? "bg-stone-900 border-stone-900 text-white"
                                : "border-stone-300 group-hover:border-stone-400 bg-white"
                            }`}
                          >
                            {isSelected && (
                              <Check
                                className="w-3 h-3"
                                strokeWidth={2.5}
                              />
                            )}
                          </div>
                          <span
                            className={
                              isSelected
                                ? "font-semibold text-stone-900"
                                : "font-normal"
                            }
                          >
                            {occ.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. New Arrivals Options */}
            {activeTab === "new_arrivals" && (
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Fresh Discoveries
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      newArrivals: !prev.newArrivals,
                    }))
                  }
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-xs transition-all cursor-pointer ${
                    draftFilters.newArrivals
                      ? "border-stone-900 bg-stone-50 font-semibold text-stone-900"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 font-medium"
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-stone-900">
                      New Finds Only
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      Items added to the collection in the last 14 days
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      draftFilters.newArrivals
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {draftFilters.newArrivals && (
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA: Exact live count button */}
        <div className="px-4 py-3.5 border-t border-stone-200 bg-white shrink-0">
          <button
            type="button"
            onClick={handleApply}
            disabled={draftCount === undefined}
            className="w-full py-3.5 rounded-xl bg-stone-900 text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-stone-800 disabled:opacity-50 transition-all duration-150 cursor-pointer"
          >
            {draftCount !== undefined
              ? draftCount === 0
                ? "No Matching Items"
                : draftCount === 1
                  ? "Show 1 Item"
                  : `Show ${draftCount} Items`
              : "Updating..."}
          </button>
        </div>
      </div>
    </>
  );
};
