import React from "react";
import { CollectionDetails } from "@/lib/collections";
import { Sparkles, ShieldCheck } from "lucide-react";

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
  resultCount,
  title,
  description,
  productCount,
  coverImage,
  accentColor,
  isVerified = true,
}) => {
  const headerTitle = title || details?.title || "Curated Collection";
  const headerDesc = description || details?.description || "Hand-picked fashion edits from verified local stores.";
  const headerCount = productCount ?? resultCount ?? details?.productCount ?? 0;
  const headerAccent = accentColor || details?.accentColor || "#1A1200";
  const bgCover = coverImage || details?.imageUrl;

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-br from-[#FFFDF5] via-white to-white border-b border-hive-border/60 py-10 lg:py-14 select-none">
      {bgCover && (
        <div className="absolute inset-0 opacity-10 blur-xl pointer-events-none">
          <img src={bgCover} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-8 w-full flex flex-col gap-3 relative z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ background: headerAccent }}
          />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-hive-dark bg-hive-dark/5 border border-hive-dark/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-hive-dark" />
            <span>CURATED EDIT</span>
          </span>
          {isVerified && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Verified Sellers</span>
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl md:text-4xl font-serif font-extrabold text-hive-dark tracking-tight leading-tight">
              {headerTitle}
            </h1>
            <p className="text-xs sm:text-sm text-hive-text-muted max-w-xl leading-relaxed">
              {headerDesc}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/90 backdrop-blur-sm border border-hive-border/60 text-xs font-bold text-hive-dark self-start sm:self-auto shadow-xs">
            <span className="w-2 h-2 rounded-full bg-hive-dark animate-ping" />
            <span>{headerCount} {headerCount === 1 ? "Piece Available" : "Pieces Available"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
