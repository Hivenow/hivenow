"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useLocation } from "@/context/LocationContext";
import { toQueryCoords } from "@/lib/distance";

/**
 * High-density fast-fashion category navigation rail.
 *
 * Structure:
 * - Level 1: Clean top-level group tabs (All Items, Women's Fashion, Men's Fashion, etc.)
 * - Level 2: Compact horizontal pill rail for the active group's subcategories:
 *   [ All ] [ Kurtis ] [ Sarees ] [ Tops ] [ Gowns · Soon ] ...
 *
 * Distinguishes:
 * - Active: solid stone-900 fill
 * - Available: white pill with stone-200 border
 * - Coming soon: subtle dashed styling with restrained "Soon" badge (globalCount === 0 only)
 *
 * Excludes "In this group", eliminates cream background, and preserves URL parameters.
 */
interface CategoryPillRailProps {
  activeCategorySlug?: string;
}

export function CategoryPillRail({ activeCategorySlug }: CategoryPillRailProps = {}) {
  const searchParams = useSearchParams();
  const activeCategory = activeCategorySlug || searchParams.get("category");
  const browseAllFromUrl = searchParams.get("browse") === "all";
  const boutiqueIdFromUrl = searchParams.get("boutiqueId");

  const { latitude, longitude, browseAllProducts } = useLocation();
  const browseAll = browseAllFromUrl || browseAllProducts;

  const hierarchyArgs = React.useMemo(() => {
    const args: Record<string, any> = {};
    if (
      !browseAll &&
      latitude !== null &&
      longitude !== null &&
      !(latitude === 0 && longitude === 0)
    ) {
      Object.assign(args, toQueryCoords(latitude, longitude));
    }
    if (boutiqueIdFromUrl) {
      args.boutiqueId = boutiqueIdFromUrl as Id<"boutiques">;
    }
    return args;
  }, [browseAll, latitude, longitude, boutiqueIdFromUrl]);

  const categoryHierarchy = useQuery(
    api.categories.getCategoryHierarchy,
    hierarchyArgs,
  );

  const { roots, activeRoot } = React.useMemo(() => {
    if (!categoryHierarchy || categoryHierarchy.roots.length === 0) {
      return { roots: [], activeRoot: null };
    }

    const rootList = categoryHierarchy.roots;
    const wanted = activeCategory?.trim().toLowerCase();

    if (!wanted) {
      return { roots: rootList, activeRoot: null };
    }

    // Find root either by direct match or because one of its children matched
    let foundRoot = null;
    for (const root of rootList) {
      if (root.slug.toLowerCase() === wanted) {
        foundRoot = root;
        break;
      }
      const hasChild = root.children.some(
        (c: any) => c.slug.toLowerCase() === wanted,
      );
      if (hasChild) {
        foundRoot = root;
        break;
      }
    }

    return { roots: rootList, activeRoot: foundRoot };
  }, [categoryHierarchy, activeCategory]);

  if (!categoryHierarchy || roots.length === 0) return null;

  const suffix = browseAll ? "&browse=all" : "";

  return (
    <div className="w-full bg-white border-b border-stone-100 z-10 relative">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col gap-1.5">
        {/* Level 1: Root Categories */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
          {/* All Items tab */}
          <Link
            href="/products?browse=all"
            className={`relative shrink-0 px-3 py-1.5 text-[11px] sm:text-xs uppercase tracking-wider transition-colors duration-200 ${
              !activeCategory
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-semibold"
            }`}
          >
            All Items
            {!activeCategory && (
              <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-stone-900 rounded-full" />
            )}
          </Link>

          {/* Root category tabs */}
          {roots.map((root: any) => {
            const isRootActive = activeRoot?._id === root._id;
            return (
              <Link
                key={root._id}
                href={`/products/${root.slug}${suffix}`}
                className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] sm:text-xs uppercase tracking-wider transition-colors duration-200 ${
                  isRootActive
                    ? "text-stone-900 font-bold"
                    : "text-stone-400 hover:text-stone-700 font-semibold"
                }`}
              >
                <span>{root.name}</span>
                {root.isComingSoon && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-500 bg-stone-100/90 border border-stone-200/80 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                )}
                {isRootActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-stone-900 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Level 2: Subcategories Rail (Compact horizontal capsule pills) */}
        {activeRoot && activeRoot.children.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1.5 pb-0.5">
            {/* "All" pill representing the whole group */}
            <Link
              href={`/products/${activeRoot.slug}${suffix}`}
              className={`shrink-0 inline-flex items-center px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 ${
                activeCategory === activeRoot.slug
                  ? "bg-stone-900 text-white font-semibold shadow-xs"
                  : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400 hover:text-stone-900 font-medium"
              }`}
            >
              All
            </Link>

            {/* Child subcategory pills */}
            {activeRoot.children.map((child: any) => {
              const isChildActive = activeCategory === child.slug;
              const isComingSoon = child.isComingSoon;

              if (isComingSoon) {
                return (
                  <Link
                    key={child._id}
                    href={`/products/${child.slug}${suffix}`}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-150 ${
                      isChildActive
                        ? "bg-stone-800 text-white font-semibold"
                        : "bg-stone-50 border border-dashed border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 font-medium"
                    }`}
                  >
                    <span>{child.name}</span>
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-500 bg-stone-100/90 border border-stone-200/80 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={child._id}
                  href={`/products/${child.slug}${suffix}`}
                  className={`shrink-0 inline-flex items-center px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 ${
                    isChildActive
                      ? "bg-stone-900 text-white font-semibold shadow-xs"
                      : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400 hover:text-stone-900 font-medium"
                  }`}
                >
                  {child.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
