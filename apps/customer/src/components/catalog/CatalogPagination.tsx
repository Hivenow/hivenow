import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@hive/ui";

export interface CatalogPaginationProps {
  currentPage: number; // 1-indexed
  totalPages: number;
  onPageChange: (page: number) => void;
  resultCount: number;
  pageSize: number;
  accentColor?: string;
}

export const CatalogPagination: React.FC<CatalogPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  resultCount,
  pageSize,
  accentColor = "#1A1200",
}) => {
  if (resultCount === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, resultCount);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const pageWindow = 1; // Number of pages to show around current page

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - pageWindow && i <= currentPage + pageWindow)
      ) {
        pages.push(i);
      } else if (
        pages[pages.length - 1] !== "..."
      ) {
        pages.push("...");
      }
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="w-full flex flex-col items-center justify-center py-12 border-t border-hive-border/40 mt-8 gap-4">
      {/* Page Navigation Controls */}
      {totalPages > 1 && (
        <nav aria-label="Pagination Navigation" className="flex items-center gap-1.5">
          {/* Previous Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              "w-10 h-10 rounded-xl border border-hive-border/60 bg-white flex items-center justify-center text-hive-dark transition-all duration-200",
              "hover:border-hive-dark/30 hover:bg-hive-dark/5 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-hive-border/60 disabled:cursor-not-allowed"
            )}
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {pages.map((page, idx) => {
              if (page === "...") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="w-10 h-10 flex items-center justify-center text-hive-text-muted font-bold text-xs"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = page as number;
              const isActive = pageNum === currentPage;

              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "w-10 h-10 rounded-xl text-xs font-extrabold flex items-center justify-center transition-all duration-200 border",
                    isActive
                      ? "text-white shadow-md"
                      : "bg-white border-hive-border/60 text-hive-dark hover:border-hive-dark/30 hover:bg-hive-dark/5"
                  )}
                  style={
                    isActive
                      ? {
                          backgroundColor: accentColor,
                          borderColor: accentColor,
                          boxShadow: `0 4px 14px ${accentColor}25`,
                        }
                      : undefined
                  }
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={cn(
              "w-10 h-10 rounded-xl border border-hive-border/60 bg-white flex items-center justify-center text-hive-dark transition-all duration-200",
              "hover:border-hive-dark/30 hover:bg-hive-dark/5 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-hive-border/60 disabled:cursor-not-allowed"
            )}
            aria-label="Next Page"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </nav>
      )}

      {/* Info text displaying items range */}
      <p className="text-xs text-hive-text-muted font-medium">
        Showing <span className="font-bold text-hive-dark">{startItem}</span> –{" "}
        <span className="font-bold text-hive-dark">{endItem}</span> of{" "}
        <span className="font-bold text-hive-dark">{resultCount}</span> designs
      </p>
    </div>
  );
};
