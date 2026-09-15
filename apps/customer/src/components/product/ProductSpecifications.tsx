"use client";

import React from "react";
import { VerticalConfig } from "@hive/types";
import { ProductDetail } from "@/lib/mockProductDetails";
import { cn } from "@hive/ui";
import { resolveSpecRows } from "@/lib/productSpecs";

export interface ProductSpecificationsProps {
  product: ProductDetail;
  config: VerticalConfig;
  className?: string;
}

export function ProductSpecifications({
  product,
  config,
  className,
}: ProductSpecificationsProps) {
  // The category's attribute schema when it has one, else the vertical's spec
  // keys. See lib/productSpecs.ts.
  const renderedSpecs = resolveSpecRows(
    product.details,
    config.specKeys,
    config.specLabels,
    product.attributeFields
  );

  if (renderedSpecs.length === 0) return null;

  return (
    <div className={cn("space-y-3 pt-2", className)}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1 border-t border-stone-100">
        {renderedSpecs.map(({ key, label, value }) => (
          <div key={key} className="flex flex-col text-left">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider leading-none mb-1">
              {label}
            </span>
            <span className="text-xs font-semibold text-stone-800 leading-normal">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
