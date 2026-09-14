"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { Info, Ruler, HelpCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@hive/ui";
import { MeasurementRow } from "@/lib/mockProductDetails";
import { resolveCategorySizing, isFreeSizeLiteral } from "@hive/types";

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: SizeConfidenceCard (Section: Stats Mocking)
// ─────────────────────────────────────────────────────────────────────────────
interface SizeConfidenceCardProps {
  productName: string;
  className?: string;
}

export const SizeConfidenceCard: React.FC<SizeConfidenceCardProps> = ({
  productName,
  className = "",
}) => {
  const hash = productName.length;
  const trueToSizePercent = 88 + (hash % 9); // e.g., 88% - 96%
  const runsSmallPercent = 3 + (hash % 5);
  const runsLargePercent = 100 - trueToSizePercent - runsSmallPercent;

  let fitText = "True to Size";
  let fitDescription = "Most customers report this design fits precisely as measured.";
  if (trueToSizePercent < 90) {
    fitText = "Runs Slightly Small";
    fitDescription = "Tailored cut. If you are in-between sizes, we recommend ordering one size up.";
  } else if (hash % 3 === 0) {
    fitText = "Relaxed Fit";
    fitDescription = "Breezy and comfortable silhouette. Order your standard size.";
  }

  return (
    <div className={cn("bg-gradient-to-br from-[#FFFDF5] to-[#FAF8F0] border border-hive-gold/30 rounded-2xl p-4 text-left shadow-sm", className)}>
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-4 h-4 text-hive-amber" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-hive-amber">
          Hive Fit Confidence
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-hive-dark font-serif">
          {trueToSizePercent}%
        </span>
        <span className="text-[11px] font-bold text-hive-text-muted">
          of buyers report: <strong className="text-hive-dark">{fitText}</strong>
        </span>
      </div>
      <p className="text-[11px] text-hive-text-muted leading-relaxed mt-1 font-medium">
        {fitDescription}
      </p>

      {/* Mini Bar Chart */}
      <div className="mt-3.5 space-y-1.5">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-hive-border/30">
          <div
            style={{ width: `${trueToSizePercent}%` }}
            className="bg-hive-amber transition-all duration-500"
            title={`True to size: ${trueToSizePercent}%`}
          />
          <div
            style={{ width: `${runsSmallPercent}%` }}
            className="bg-hive-gold transition-all duration-500"
            title={`Runs small: ${runsSmallPercent}%`}
          />
          <div
            style={{ width: `${runsLargePercent}%` }}
            className="bg-hive-comb/30 transition-all duration-500"
            title={`Runs large: ${runsLargePercent}%`}
          />
        </div>
        <div className="flex justify-between text-[9px] font-extrabold uppercase tracking-wider text-hive-text-muted/80">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-hive-amber" />
            True ({trueToSizePercent}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-hive-gold" />
            Small ({runsSmallPercent}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-hive-comb/30" />
            Large ({runsLargePercent}%)
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: FitGuidance (prominent display of product.fitNote)
// ─────────────────────────────────────────────────────────────────────────────
interface FitGuidanceProps {
  fitNote: string;
  className?: string;
}

export const FitGuidance: React.FC<FitGuidanceProps> = ({ fitNote, className = "" }) => {
  return (
    <div className={cn("bg-hive-cream/20 border border-hive-border/40 rounded-2xl p-4 text-left flex gap-3 shadow-sm", className)}>
      <div className="w-8 h-8 rounded-lg bg-hive-gold/10 border border-hive-gold/20 flex items-center justify-center text-hive-amber flex-shrink-0">
        <Info className="w-4 h-4" />
      </div>
      <div className="text-xs">
        <span className="font-extrabold uppercase tracking-wider text-hive-dark block">
          Fit & Sizing Note
        </span>
        <p className="text-hive-text-muted mt-1 leading-relaxed font-medium">
          {fitNote}
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: MeasurementLegend (definitions section)
// ─────────────────────────────────────────────────────────────────────────────
interface MeasurementLegendProps {
  profileType?: "tops" | "bottoms" | "free_size" | "none" | "footwear";
}

export const MeasurementLegend: React.FC<MeasurementLegendProps> = ({ profileType = "tops" }) => {
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  return (
    <div className="border border-stone-200/80 rounded-2xl overflow-hidden bg-white text-left">
      <button
        type="button"
        onClick={() => setIsLegendOpen(!isLegendOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-stone-850 hover:bg-stone-50/50 transition-all outline-none"
      >
        <span className="flex items-center gap-2 uppercase tracking-wider">
          <Ruler className="w-4 h-4 text-stone-400" />
          How We Measure ({profileType === "free_size" ? "Dimensions Guide" : "Inches Guide"})
        </span>
        {isLegendOpen ? (
          <ChevronUp className="w-4 h-4 text-stone-450" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-455" />
        )}
      </button>

      {isLegendOpen && (
        <div className="px-4 pb-4 pt-1.5 text-xs text-stone-500 space-y-3 leading-relaxed border-t border-stone-200/60 bg-stone-50/10 font-medium animate-fade-in">
          {profileType === "bottoms" ? (
            <>
              <div>
                <strong className="text-stone-900 font-bold">1. Waist:</strong> Measured flat across the top of the waistband, then doubled.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">2. Inseam:</strong> Measured along the inner leg seam from crotch to bottom hem.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">3. Hip:</strong> Measured across the widest part of the seat/hips, then doubled.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">4. Length:</strong> Measured along the outer side seam from top of waistband down to bottom hem.
              </div>
            </>
          ) : profileType === "free_size" ? (
            <>
              <div>
                <strong className="text-stone-900 font-bold">1. Length:</strong> Running length of fabric from pallu to end seam (standard 5.5 meters).
              </div>
              <div>
                <strong className="text-stone-900 font-bold">2. Width:</strong> Vertical drape width from top border seam down to bottom border hem.
              </div>
            </>
          ) : (
            <>
              <div>
                <strong className="text-stone-900 font-bold">1. Chest:</strong> Measured flat from armpit seam to armpit seam, then doubled.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">2. Waist:</strong> Measured across the narrowest point of the waist, then doubled.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">3. Shoulder:</strong> Measured straight across the back from shoulder seam to shoulder seam.
              </div>
              <div>
                <strong className="text-stone-900 font-bold">4. Length:</strong> Measured vertically from the highest shoulder seam down to the hem.
              </div>
            </>
          )}
          <div className="text-[10px] text-stone-500 border-t border-stone-200/60 pt-2 font-bold italic flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 text-stone-400" />
            Measurements are physical tape dimensions of the item flat-laid, not body sizes.
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to generate a contextual sizing chart based on categories and sizing parameters
export function getUniversalSizeChart(
  sizes: string[] = [],
  productName: string = "",
  category?: any,
  verticalType?: string
): MeasurementRow[] {
  const resolved = resolveCategorySizing(
    category || { name: productName, slug: "" },
    null,
    verticalType
  );
  const profileType = resolved.measurementProfile.type;

  // 1. Bed Linen (Single, Double, Queen, King, Super King)
  if (
    resolved.sizeSystem === "bed_linen" ||
    productName.toLowerCase().includes("bedsheet") ||
    sizes.some((s) => ["single", "double", "queen", "king", "super king"].includes(s.toLowerCase()))
  ) {
    const bedStandardMap: Record<string, { length: string; width: string }> = {
      Single: { length: '90"', width: '60"' },
      Double: { length: '100"', width: '90"' },
      Queen: { length: '108"', width: '90"' },
      King: { length: '108"', width: '108"' },
      "Super King": { length: '120"', width: '108"' },
    };
    const activeSizes = sizes.length > 0 ? sizes : ["Single", "Double", "Queen", "King"];
    return activeSizes.map((sz) => {
      const match = bedStandardMap[sz] || { length: "Standard", width: "Standard" };
      return {
        size: sz,
        chest: "N/A",
        waist: "N/A",
        shoulder: "N/A",
        length: match.length,
        width: match.width,
        hip: "N/A",
        fitType: "Bed Linen",
        stretch: "None",
      };
    });
  }

  // 2. Free-size garments (Sarees, Dupattas, Kasavu)
  if (profileType === "free_size" || sizes.some(isFreeSizeLiteral) || productName.toLowerCase().includes("saree") || productName.toLowerCase().includes("kasavu")) {
    const s: string = sizes.find(isFreeSizeLiteral) ?? sizes[0] ?? "Free Size";
    return [
      {
        size: s,
        chest: "N/A",
        waist: "N/A",
        shoulder: "N/A",
        length: "5.5 meters",
        width: "44 inches",
        hip: "N/A",
        fitType: "Draped",
        stretch: "None",
      }
    ];
  }

  // 2. Bottomwear (Jeans, Trousers, Shorts)
  if (profileType === "bottoms") {
    const bottomStandardMap: Record<string, Omit<MeasurementRow, "size" | "chest" | "shoulder">> = {
      "28": { waist: "28\"", inseam: "30\"", hip: "35\"", length: "39\"", fitType: "Straight", stretch: "Low" },
      "30": { waist: "30\"", inseam: "31\"", hip: "37\"", length: "40\"", fitType: "Straight", stretch: "Low" },
      "32": { waist: "32\"", inseam: "32\"", hip: "39\"", length: "41\"", fitType: "Straight", stretch: "Low" },
      "34": { waist: "34\"", inseam: "32\"", hip: "41\"", length: "42\"", fitType: "Straight", stretch: "Low" },
      "36": { waist: "36\"", inseam: "32\"", hip: "43\"", length: "42\"", fitType: "Straight", stretch: "Low" },
      "38": { waist: "38\"", inseam: "32\"", hip: "45\"", length: "43\"", fitType: "Straight", stretch: "Low" },
      "40": { waist: "40\"", inseam: "32\"", hip: "47\"", length: "43\"", fitType: "Straight", stretch: "Low" },
      "42": { waist: "42\"", inseam: "32\"", hip: "49\"", length: "44\"", fitType: "Straight", stretch: "Low" },
    };

    const matrix: MeasurementRow[] = [];
    const activeSizes = sizes.length > 0 ? sizes : ["28", "30", "32", "34", "36"];

    for (const sz of activeSizes) {
      const matched = bottomStandardMap[sz];
      if (matched) {
        matrix.push({
          size: sz,
          chest: "N/A",
          shoulder: "N/A",
          waist: matched.waist,
          length: matched.length,
          inseam: matched.inseam,
          hip: matched.hip,
          fitType: matched.fitType,
          stretch: matched.stretch,
        });
      } else {
        const num = parseInt(sz);
        const waistVal = !isNaN(num) ? `${num}"` : "32\"";
        const hipVal = !isNaN(num) ? `${num + 7}"` : "39\"";
        matrix.push({
          size: sz,
          chest: "N/A",
          waist: waistVal,
          shoulder: "N/A",
          inseam: "32\"",
          hip: hipVal,
          length: "41\"",
          fitType: "Straight",
          stretch: "Low",
        });
      }
    }
    return matrix;
  }

  // 3. Topwear / Default apparel (Shirts, T-Shirts, Kurtis, Jackets)
  const standardMap: Record<string, Omit<MeasurementRow, "size">> = {
    "XS": { chest: "32\"", waist: "26\"", shoulder: "13.5\"", length: "42\"", hip: "36\"", fitType: "Regular", stretch: "Low" },
    "S": { chest: "34\"", waist: "28\"", shoulder: "14\"", length: "43\"", hip: "38\"", fitType: "Regular", stretch: "Low" },
    "M": { chest: "36\"", waist: "30\"", shoulder: "14.5\"", length: "44\"", hip: "40\"", fitType: "Regular", stretch: "Low" },
    "L": { chest: "38\"", waist: "32\"", shoulder: "15\"", length: "45\"", hip: "42\"", fitType: "Regular", stretch: "Low" },
    "XL": { chest: "40\"", waist: "34\"", shoulder: "15.5\"", length: "45\"", hip: "44\"", fitType: "Regular", stretch: "Low" },
    "XXL": { chest: "42\"", waist: "36\"", shoulder: "16\"", length: "46\"", hip: "46\"", fitType: "Regular", stretch: "Low" },
    "3XL": { chest: "44\"", waist: "38\"", shoulder: "16.5\"", length: "46\"", hip: "48\"", fitType: "Regular", stretch: "Low" },
    "4XL": { chest: "46\"", waist: "40\"", shoulder: "17\"", length: "47\"", hip: "50\"", fitType: "Regular", stretch: "Low" },
  };

  const matrix: MeasurementRow[] = [];
  const activeSizes = sizes.length > 0 ? sizes : ["S", "M", "L", "XL"];
  
  for (const sz of activeSizes) {
    const upperSz = sz.toUpperCase();
    if (standardMap[upperSz]) {
      matrix.push({
        size: sz,
        ...standardMap[upperSz],
      });
    } else {
      matrix.push({
        size: sz,
        chest: "36\"",
        waist: "30\"",
        shoulder: "14.5\"",
        length: "44\"",
        hip: "40\"",
        fitType: "Regular",
        stretch: "Low",
      });
    }
  }

  return matrix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: MeasurementTable
// ─────────────────────────────────────────────────────────────────────────────
interface MeasurementTableProps {
  matrix: MeasurementRow[];
  selectedSize: string;
  isFallback: boolean;
  profileType?: "tops" | "bottoms" | "free_size" | "none" | "footwear";
}


function formatDim(val: string | undefined, isApprox: boolean): string {
  if (!val || val === "N/A") return "N/A";
  if (!isApprox) return val;
  if (val.startsWith("~")) return val;
  const compact = val.replace(/\s*meters?/i, "m").replace(/\s*inches?/i, "\"");
  return `~${compact}`;
}

export const MeasurementTable: React.FC<MeasurementTableProps> = ({
  matrix,
  selectedSize,
  isFallback,
  profileType = "tops",
}) => {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the highlighted row on size select
  useEffect(() => {
    if (selectedSize && rowRefs.current[selectedSize]) {
      const targetRow = rowRefs.current[selectedSize];
      targetRow?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedSize]);

  return (
    <div className="w-full text-left">
      {isFallback ? (
        <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-3.5 mb-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-stone-850">
              <Info className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-900">
                STANDARD SIZE REFERENCE (APPROX.)
              </span>
            </div>
            {selectedSize ? (
              <span className="text-[9px] font-bold text-stone-600 bg-stone-100/80 px-2 py-0.5 rounded border border-stone-200/50">
                Active Size: {selectedSize}
              </span>
            ) : (
              <span className="text-[9px] font-bold text-stone-500 bg-stone-100/80 px-2 py-0.5 rounded border border-stone-200/50">
                Standard Fit
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-stone-500 mt-2 leading-relaxed font-medium">
            Standard industry sizing for reference. This boutique partner has not recorded flat garment tape measurements for this item. Exact dimensions may vary by cut and fabric stretch.
          </p>
        </div>
      ) : (
        <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-3.5 mb-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-stone-850">
              <Info className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-900">
                GARMENT MEASUREMENTS
              </span>
            </div>
            {selectedSize && (
              <span className="text-[9px] font-bold text-stone-600 bg-stone-100/80 px-2 py-0.5 rounded border border-stone-200/50">
                Active Size: {selectedSize}
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-stone-500 mt-2 leading-relaxed font-medium">
            Garment measurements provided by the partner.
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full border border-stone-200/80 rounded-2xl overflow-x-auto scrollbar-thin scrollbar-thumb-stone-300 hover:scrollbar-thumb-stone-400"
      >
        <table className="min-w-[440px] w-full text-left border-collapse text-xs table-fixed">
          <thead>
            {profileType === "bottoms" ? (
              <tr className="bg-stone-50/50 border-b border-stone-200/80 text-[9px] font-bold text-stone-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="px-3.5 py-3 w-[70px]">Size</th>
                <th className="px-3.5 py-3">Waist</th>
                <th className="px-3.5 py-3">Inseam</th>
                <th className="px-3.5 py-3">Hip</th>
                <th className="px-3.5 py-3">Length</th>
                <th className="px-3.5 py-3">Fit Type</th>
                <th className="px-3.5 py-3">Stretch</th>
              </tr>
            ) : profileType === "free_size" ? (
              <tr className="bg-stone-50/50 border-b border-stone-200/80 text-[9px] font-bold text-stone-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="px-3.5 py-3 w-[80px]">Size</th>
                <th className="px-3.5 py-3">Length</th>
                <th className="px-3.5 py-3">Width</th>
                <th className="px-3.5 py-3">Fit Type</th>
                <th className="px-3.5 py-3">Stretch</th>
              </tr>
            ) : (
              <tr className="bg-stone-50/50 border-b border-stone-200/80 text-[9px] font-bold text-stone-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="px-3.5 py-3 w-[70px]">Size</th>
                <th className="px-3.5 py-3">Chest</th>
                <th className="px-3.5 py-3">Waist</th>
                <th className="px-3.5 py-3">Shoulder</th>
                <th className="px-3.5 py-3">Length</th>
                <th className="px-3.5 py-3">Fit Type</th>
                <th className="px-3.5 py-3">Stretch</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-stone-100 font-semibold text-stone-850">
            {matrix.map((row, idx) => {
              const isSelected = row.size === selectedSize;
              const fitTypeVal = row.fitType ?? (profileType === "free_size" ? "Draped" : "Regular");
              const stretchVal = row.stretch ?? (profileType === "free_size" ? "None" : "Low");

              return (
                <tr
                  key={row.size}
                  ref={(el) => {
                    rowRefs.current[row.size] = el;
                  }}
                  className={cn(
                    "transition-all duration-200",
                    isSelected
                      ? "bg-stone-100/70 border-l-2 border-l-stone-900 scale-[1.002]"
                      : idx % 2 === 1
                      ? "bg-stone-50/20"
                      : "bg-white"
                  )}
                >
                  <td
                    className={cn(
                      "px-3.5 py-3 font-bold transition-colors",
                      profileType === "free_size" ? "w-[80px]" : "w-[70px]",
                      isSelected ? "text-stone-900 bg-stone-100/30" : "text-stone-850"
                    )}
                  >
                    {row.size}
                  </td>
                  {profileType === "bottoms" ? (
                    <>
                      <td className="px-3.5 py-3">{formatDim(row.waist, isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.inseam || "30\"", isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.hip || "N/A", isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.length, isFallback)}</td>
                    </>
                  ) : profileType === "free_size" ? (
                    <>
                      <td className="px-3.5 py-3">{formatDim(row.length, isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.width || "44\"", isFallback)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3.5 py-3">{formatDim(row.chest, isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.waist, isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.shoulder, isFallback)}</td>
                      <td className="px-3.5 py-3">{formatDim(row.length, isFallback)}</td>
                    </>
                  )}
                  <td className="px-3.5 py-3 text-stone-500 font-medium">{fitTypeVal}</td>
                  <td className="px-3.5 py-3 text-stone-500 font-medium">{stretchVal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isFallback && (
        <p className="text-[10px] text-stone-500 mt-2.5 italic text-left">
          *Dimensions shown are standard reference estimates, not flat-tape measurements of this specific item.
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: MeasurementMatrix
// ─────────────────────────────────────────────────────────────────────────────
export interface MeasurementMatrixProps {
  productName: string;
  category?: any;
  verticalType?: string;
  measurementMatrix?: MeasurementRow[];
  sizes?: string[];
  selectedSize: string;
  fitNote?: string;
  className?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export const MeasurementMatrix: React.FC<MeasurementMatrixProps> = ({
  productName,
  category,
  verticalType,
  measurementMatrix = [],
  sizes = [],
  selectedSize,
  fitNote = "Standard sizing. Fits true to size.",
  className = "",
  isOpen: controlledIsOpen,
  setIsOpen: controlledSetIsOpen,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledSetIsOpen !== undefined ? controlledSetIsOpen : setInternalIsOpen;

  const resolved = useMemo(() => {
    return resolveCategorySizing(
      category || { name: productName, slug: "" },
      null,
      verticalType
    );
  }, [category, productName, verticalType]);

  const profileType = resolved.measurementProfile.type;

  const hasCustomSellerMeasurements =
    Array.isArray(measurementMatrix) && measurementMatrix.length > 0;
  const isFallback = !hasCustomSellerMeasurements;

  // Only render when open
  if (!isOpen) return null;

  const activeMatrix =
    measurementMatrix && measurementMatrix.length > 0
      ? measurementMatrix
      : getUniversalSizeChart(sizes, productName, category, verticalType);

  return (
    <div className={cn("w-full flex flex-col text-left py-2", className)}>
      <div className="w-full flex flex-col gap-4 animate-fade-in pt-2">
        {/* Table Section */}
        <MeasurementTable
          matrix={activeMatrix}
          selectedSize={selectedSize}
          isFallback={isFallback}
          profileType={profileType}
        />

        {/* Legend Guide Accordion */}
        <MeasurementLegend profileType={profileType} />

        {/* Bottom Close Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
          >
            Hide Measurements ↑
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading State Skeleton
// ─────────────────────────────────────────────────────────────────────────────
export const MeasurementMatrixSkeleton: React.FC = () => {
  return (
    <div className="w-full flex flex-col gap-5 py-4 border-b border-hive-border/40 animate-pulse text-left">
      <div className="flex justify-between items-center">
        <div className="h-3 w-1/3 bg-hive-comb/15 rounded" />
      </div>

      <div className="w-full border border-hive-border/20 rounded-2xl h-36 bg-hive-cream/5 flex flex-col p-4 gap-3">
        <div className="h-4 bg-hive-comb/15 rounded w-full" />
        <div className="h-3.5 bg-hive-comb/10 rounded w-full" />
        <div className="h-3.5 bg-hive-comb/10 rounded w-5/6" />
        <div className="h-3.5 bg-hive-comb/10 rounded w-4/5" />
      </div>

      <div className="h-10 w-full bg-hive-comb/10 border border-hive-border/20 rounded-2xl" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-28 bg-hive-comb/10 border border-hive-border/20 rounded-2xl" />
        <div className="h-28 bg-hive-comb/10 border border-hive-border/20 rounded-2xl" />
      </div>
    </div>
  );
};
