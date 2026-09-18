import React from "react";
import Link from "next/link";
import { useLocation } from "@/context/LocationContext";

export interface CatalogHeaderProps {
  title: string;
  description?: string;
  resultCount: number;
  activeFilterCount: number;
  accentColor?: string;
}

export const CatalogHeader: React.FC<CatalogHeaderProps> = ({
  title,
  description,
  resultCount,
  activeFilterCount,
  accentColor = "#C9A84C", // fallback to Hive Gold
}) => {
  const { isServiceable } = useLocation();
  return (
    <div className="w-full bg-white border-b border-hive-border/40 py-8 lg:py-12 relative overflow-hidden">
      {/* Premium subtle background glow */}
      <div 
        className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] opacity-[0.03] pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />
      
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 w-full flex flex-col md:flex-row md:items-end md:justify-between gap-6 relative">
        <div className="flex-1 max-w-2xl">
          {/* Breadcrumb / category eyebrow */}
          <div className="flex items-center gap-1.5 text-xs text-hive-text-muted mb-3 font-medium">
            <Link href="/products" className="hover:text-hive-dark transition-colors">
              Shop
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-hive-dark font-semibold truncate">
              {title}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl lg:text-4xl font-serif font-extrabold text-hive-dark tracking-tight leading-none">
            {title}
          </h1>

          {/* Description */}
          {description && (
            <p className="text-sm text-hive-text-muted mt-3 leading-relaxed max-w-xl font-medium">
              {description}
            </p>
          )}
        </div>

        {/* Counts summary block */}
        <div className="flex items-center gap-4 flex-wrap text-xs font-semibold text-hive-dark border-t md:border-t-0 pt-4 md:pt-0 border-hive-border/40">
          {resultCount > 0 ? (
            <div className="flex items-center gap-2 bg-hive-cream/30 border border-hive-border/40 px-3.5 py-1.5 rounded-xl">
              <span className="text-hive-text-muted font-medium">Total:</span>
              <span className="font-extrabold text-sm">{resultCount}</span>
              <span className="text-hive-text-muted font-medium">
                {resultCount === 1 ? "Product" : "Products"}
              </span>
            </div>
          ) : (
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50/50 border border-amber-200/30 px-3 py-1.5 rounded-xl">
              {isServiceable ? "Coming to Your Area" : "Launching Soon"}
            </span>
          )}

          {activeFilterCount > 0 && (
            <div 
              className="flex items-center gap-2 border px-3.5 py-1.5 rounded-xl transition-all duration-300"
              style={{ 
                borderColor: `${accentColor}30`, 
                backgroundColor: `${accentColor}08` 
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
              <span className="font-extrabold text-sm" style={{ color: accentColor }}>
                {activeFilterCount}
              </span>
              <span className="font-medium" style={{ color: accentColor }}>
                Active Filter{activeFilterCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
