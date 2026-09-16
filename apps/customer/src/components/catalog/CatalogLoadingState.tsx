import React from "react";

interface SkeletonCardProps {
  /** Delay in ms for cascade animation */
  delay?: number;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ delay = 0 }) => (
  <div
    className="w-full bg-white border border-gray-100 rounded-[24px] p-3 overflow-hidden"
    style={{ animationDelay: `${delay}ms` }}
  >
    {/* Image placeholder — 4:5 aspect to match ProductCard */}
    <div className="relative w-full aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden bg-gray-200">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>

    {/* Content placeholders */}
    <div className="px-1.5 py-3 flex flex-col gap-3">
      {/* Store name */}
      <div className="h-2 w-1/3 rounded-full bg-gray-200 relative overflow-hidden">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_0.1s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>
      {/* Product name — 2 lines */}
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-full rounded-full bg-gray-200 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_0.15s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
        <div className="h-3 w-3/4 rounded-full bg-gray-200 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_0.2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
      </div>

      {/* Price row */}
      <div className="pt-2 border-t border-gray-100">
        <div className="h-4 w-1/3 rounded-full bg-gray-200 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_0.35s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
      </div>
    </div>

    <style>{`
      @keyframes shimmer {
        to { transform: translateX(200%); }
      }
    `}</style>
  </div>
);

export interface CatalogLoadingStateProps {
  count?: number;
}

export const CatalogLoadingState: React.FC<CatalogLoadingStateProps> = ({
  count = 10,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} delay={idx * 60} />
      ))}
    </div>
  );
};
