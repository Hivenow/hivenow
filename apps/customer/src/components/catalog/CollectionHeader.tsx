import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CollectionDetails } from "@/lib/collections";

interface CollectionHeaderProps {
  details?: CollectionDetails;
  resultCount?: number;
  title?: string;
  description?: string;
  productCount?: number;
  coverImage?: string;
  accentColor?: string;
  isVerified?: boolean;
}

export const CollectionHeader: React.FC<CollectionHeaderProps> = ({
  details,
  title,
}) => {
  const headerTitle = title || details?.title || "Curated Collection";

  return (
    <div className="w-full bg-[#FAF8F5] border-b border-stone-200/60 py-8 sm:py-10 lg:py-12 select-none">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-8 w-full flex flex-col gap-3 sm:gap-4">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
          <Link
            href="/products"
            className="hover:text-stone-900 transition-colors"
          >
            Shop
          </Link>
          <ChevronRight className="w-3 h-3 text-stone-400" />
          <Link
            href="/products"
            className="hover:text-stone-900 transition-colors"
          >
            Collections
          </Link>
          <ChevronRight className="w-3 h-3 text-stone-400" />
          <span className="text-stone-800 font-semibold truncate max-w-[200px] sm:max-w-none">
            {headerTitle}
          </span>
        </nav>

        {/* Minimalist Editorial Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-stone-950 tracking-tight leading-tight">
          {headerTitle}
        </h1>
      </div>
    </div>
  );
};
