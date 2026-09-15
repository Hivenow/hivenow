"use client";
import React, { useState, useMemo } from "react";
import { Scissors, Compass, Ruler, FileText, Shirt, CheckCircle2, RotateCcw, Truck, ShieldCheck, Star } from "lucide-react";
import { cn } from "@hive/ui";
import { formatCurrency } from "@hive/utils";
import { CUSTOMER_FEATURES } from "@/config/features";
import { getVerticalConfig, resolveCategorySizing } from "@hive/types";
import { SILHOUETTE_DESCRIPTIONS } from "@/lib/silhouettes";
import { MeasurementMatrix } from "./MeasurementMatrix";
import { ProductDetail } from "@/lib/mockProductDetails";
import { SizeSelector } from "./SizeSelector";
import { PurchaseActions } from "./PurchaseActions";
import { ProductSpecifications } from "./ProductSpecifications";
import { resolveSpecRows } from "@/lib/productSpecs";
import { ProductPhotoDisclaimer } from "./ProductPhotoDisclaimer";
import { useRouter } from "next/navigation";
import { cleanProductTitle } from "./ProductCard";
import Link from "next/link";
import { DeliveryCountdownPill } from "./DeliveryCountdownPill";
import { useLocation } from "@/context/LocationContext";

export interface ProductInfoProps {
  product: ProductDetail;
  selectedSize: string;
  setSelectedSize: (size: string) => void;
}

const truncateText = (text: string, limit: number = 180) => {
  if (text.length <= limit) return text;
  return text.slice(0, limit).trim() + "...";
};

export const ProductInfo: React.FC<ProductInfoProps> = ({ 
  product, 
  selectedSize, 
  setSelectedSize 
}) => {
  const [openAccordion, setOpenAccordion] = useState<string | null>("returns");
  const router = useRouter();
  const { locality } = useLocation();

  // ── Single source of truth for stock ──────────────────────────────────────
  const stockMap: Record<string, number> =
    (product as any).stockBySize ?? product.inventory ?? {};

  const discountPercent = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  // Fit recommendation & silhouette from product
  const fitRecommendation = (product as any).fitRecommendation as "runs_small" | "true_to_size" | "runs_large" | undefined;
  const silhouette = (product as any).silhouette as string | undefined;
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const fitBadgeConfig = {
    runs_small:   { label: "Runs Small", advice: "Consider ordering one size up." },
    true_to_size: { label: "True to Size", advice: "Fits as expected for standard sizing." },
    runs_large:   { label: "Runs Large", advice: "Consider ordering one size down." },
  };

  const silhouetteConfig: Record<string, string> = SILHOUETTE_DESCRIPTIONS;

  // Occasion tags formatter helper
  const formatTag = (tag: string) => {
    return tag
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const isReturnsAccepted = product.returnsAccepted ?? true;
  const sellerName = product.boutique.name;

  const verticalConfig = getVerticalConfig(product.verticalType);
  const hasCustomSellerMeasurements =
    Array.isArray((product as any).measurementMatrix) &&
    (product as any).measurementMatrix.length > 0;

  const resolvedSizing = useMemo(() => {
    return resolveCategorySizing(
      (product as any).category || {
        name: (product as any).categoryName || product.name || "",
        slug: (product as any).categorySlug || (product as any).slug || "",
        verticalType: product.verticalType,
      },
      null,
      product.verticalType
    );
  }, [product]);

  const hasDescription = product.description && product.description.trim() !== "";
  const productDetails = product.details || {};
  // Same rows ProductSpecifications renders, so a notebook with specs but no
  // description still gets its Product Details section.
  const hasDetails =
    resolveSpecRows(
      productDetails,
      verticalConfig.specKeys,
      verticalConfig.specLabels,
      product.attributeFields
    ).length > 0;

  // Prepare spec list items dynamically using tailoring-focused icons (Fabric, Craft, Fit Notes)
  const specItems = [
    { key: "fabric", label: "Fabric", value: (product as any).material, icon: Scissors },
    { key: "origin", label: "Craft", value: (product as any).origin, icon: Compass },
  ].filter(item => !!item.value);

  return (
    <div className="w-full flex flex-col gap-5 text-left">
      
      {/* ── SECTION 1: HERO (wrapped in pdp-hero-section for IntersectionObserver) ── */}
      <div id="pdp-hero-section" className="space-y-1 select-none">
        {/* Occasion / Category label */}
        {product.occasionTags && product.occasionTags.length > 0 && product.occasionTags[0] && (
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-700 leading-none">
            {formatTag(product.occasionTags[0])}
          </div>
        )}
        
        {/* Product Title */}
        <h1 className="text-lg md:text-xl font-serif font-semibold text-stone-900 tracking-tight leading-none pt-0.5">
          {cleanProductTitle(product.name)}
        </h1>

        {/* Rating — only when the product actually has published reviews */}
        {typeof product.rating === "number" && product.rating > 0 && (
          <div className="flex items-center gap-1.5 text-xs pt-0.5">
            <div className="flex items-center gap-0.5">
              <Star className="w-3.5 h-3.5 fill-hive-amber text-hive-amber" />
              <span className="font-bold text-stone-900">{product.rating.toFixed(1)}</span>
            </div>
            {typeof product.reviewCount === "number" && product.reviewCount > 0 && (
              <span className="text-stone-400 font-medium">
                ({product.reviewCount} review{product.reviewCount === 1 ? "" : "s"})
              </span>
            )}
          </div>
        )}

        {/* Pricing */}
        <div className="flex flex-col gap-1 pt-1 select-none">
          <div className="flex items-baseline gap-2.5 leading-none">
            <span className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
              ₹{product.price.toLocaleString("en-IN")}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <>
                <span className="text-xs md:text-sm text-stone-400 line-through font-normal">
                  MRP ₹{product.compareAtPrice.toLocaleString("en-IN")}
                </span>
                <span className="text-xs md:text-sm font-extrabold text-hive-amber tracking-wide">
                  ({discountPercent}% OFF)
                </span>
              </>
            )}
          </div>
          <span className="text-[10.5px] text-stone-400 font-medium leading-none">
            inclusive of all taxes
          </span>
        </div>

        {/* Brand attribution */}
        <div className="text-xs text-stone-600 font-medium leading-none pt-0.5">
          from <span className="font-bold">{product.boutique.name}</span>
        </div>

        {/* Fulfillment line */}
        <div className="text-xs text-stone-500 font-medium pt-0.5 leading-none">
          Fulfilled by a Verified Hive Partner
        </div>

        {/* Live delivery countdown */}
        <div className="pt-2">
          <DeliveryCountdownPill countdown={(product as any).deliveryCountdown} locality={locality} />
        </div>
      </div>

      {/* ── Structured Product Specs Grid (Fabric, Origin, Care, Fit) ── */}
      {specItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-1 select-none">
          {specItems.map((item, idx) => {
            const isLastOdd = specItems.length % 2 !== 0 && idx === specItems.length - 1;
            const Icon = item.icon;
            return (
              <div 
                key={item.key} 
                className={cn(
                  "border border-stone-200/70 rounded-xl p-3.5 bg-stone-50/70 flex items-start gap-2.5 shadow-2xs",
                  isLastOdd && "col-span-2"
                )}
              >
                <Icon className="w-4 h-4 text-amber-700 stroke-[1.5] mt-0.5 shrink-0" />
                <div className="flex flex-col min-w-0 text-left">
                  <span className="text-[9px] font-bold tracking-wider text-stone-400 uppercase leading-none mb-1.5">{item.label}</span>
                  <span className="text-xs font-semibold text-stone-850 leading-normal">
                    {item.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SECTION 2: SIZE SELECTION ── */}
      <div className="border-t border-stone-100 pt-2">
        <SizeSelector
          sizes={product.sizes}
          inventory={stockMap}
          selectedSize={selectedSize}
          onSelectSize={setSelectedSize}
          hasMeasurements={resolvedSizing.variant.requiresMeasurements}
          hasCustomSellerMeasurements={hasCustomSellerMeasurements}
          label={resolvedSizing.variant.label}
          onOpenSizeGuide={() => setIsSizeGuideOpen((prev) => !prev)}
          fitNote={product.fitNote}
        />
        {isSizeGuideOpen && (
          <div className="mt-3 p-3.5 bg-stone-50/90 border border-stone-200/80 rounded-2xl animate-fade-in shadow-xs">
            <MeasurementMatrix
              productName={product.name}
              category={(product as any).category}
              verticalType={product.verticalType}
              measurementMatrix={(product as any).measurementMatrix}
              sizes={product.sizes}
              selectedSize={selectedSize}
              isOpen={isSizeGuideOpen}
              setIsOpen={setIsSizeGuideOpen}
            />
          </div>
        )}
      </div>

      {/* ── SECTION 2.5: FIT BADGE & SILHOUETTE INDICATOR ── */}
      {resolvedSizing.fitOptions.showGarmentFitWidget && (fitRecommendation || (silhouette && silhouetteConfig[silhouette])) && (
        <div className="flex flex-col gap-2 select-none">
          {fitRecommendation && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-stone-200/80 bg-stone-50/60 text-stone-700">
              <Ruler className="w-4 h-4 text-stone-500 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-extrabold uppercase tracking-wider leading-none mb-1 text-stone-800">{fitBadgeConfig[fitRecommendation].label}</span>
                <span className="text-[11px] font-medium leading-tight text-stone-500">{fitBadgeConfig[fitRecommendation].advice}</span>
              </div>
            </div>
          )}
          {silhouette && (
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-stone-200/60 bg-stone-50/40 text-stone-600">
              <Shirt className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <span className="text-[11px] font-medium leading-tight">{silhouetteConfig[silhouette]}</span>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 4: PURCHASE ACTIONS ── */}
      <div className="border-t border-stone-100 pt-2">
        <PurchaseActions
          product={product}
          selectedSize={selectedSize}
          onOpenSizeGuide={() => {}}
        />
      </div>

      {/* ── SECTION 5: TRUST REASSURANCE ── */}
      <div className="border-t border-stone-100 pt-4 mt-3 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] font-bold tracking-wider text-stone-600 uppercase select-none">
        <span className="flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
          <span className={!isReturnsAccepted ? "text-stone-700 font-bold" : "text-stone-800 font-extrabold"}>
            {!isReturnsAccepted ? "Final Sale" : "1-Day Easy Return Window"}
          </span>
        </span>
        <span className="text-stone-300">•</span>
        <span className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-stone-500" />
          <span>{product.sameDayEligible ? "Same-Day Delivery" : "Express Delivery"}</span>
        </span>
        <span className="text-stone-300">•</span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
          <span>Verified Partner</span>
        </span>
      </div>

      {/* ── SECTION 6: ACCORDIONS (Product Details, Wash & Care, Delivery & Returns) ── */}
      <div className="border-t border-stone-100 pt-2.5 mt-2 space-y-1">
        {/* Product Details (Description + Specifications) Area */}
        {(hasDescription || hasDetails) && (
          <div className="border-b border-stone-100/60 pb-3">
            <div className="w-full flex items-center justify-between py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-900">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-700/80" />
                <span>Product Details</span>
              </span>
            </div>

            {/* AI Generated Product Description Paragraph */}
            {hasDescription && (
              <p className="text-xs sm:text-[13px] text-stone-700 leading-relaxed font-medium pt-1 pb-3 text-left">
                {product.description}
              </p>
            )}

            {/* Specifications Grid */}
            <ProductSpecifications product={product} config={verticalConfig} />

            {/* Photo Origin Reassurance Note */}
            <ProductPhotoDisclaimer source={product.photoSource} variant="note" />
          </div>
        )}

        {/* Design Story Accordion */}
        {(product as any).story && (
          <div className="border-b border-stone-100/60 pb-2.5">
            <button
              type="button"
              onClick={() => setOpenAccordion(openAccordion === "story" ? null : "story")}
              className="w-full flex items-center justify-between py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-900 focus:outline-none"
            >
              <span>The Design Story</span>
              <span className="text-stone-400 text-xs font-normal">
                {openAccordion === "story" ? "−" : "+"}
              </span>
            </button>
            {openAccordion === "story" && (
              <p className="text-xs text-stone-600 leading-relaxed font-medium pt-1 animate-fade-in text-left italic font-serif">
                {(product as any).story}
              </p>
            )}
          </div>
        )}

        {/* Wash & Care Accordion */}
        {(product as any).care && (
          <div className="border-b border-stone-100/60 pb-2.5">
            <button
              type="button"
              onClick={() => setOpenAccordion(openAccordion === "care" ? null : "care")}
              className="w-full flex items-center justify-between py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-900 focus:outline-none"
            >
              <span>Wash & Care</span>
              <span className="text-stone-400 text-xs font-normal">
                {openAccordion === "care" ? "−" : "+"}
              </span>
            </button>
            {openAccordion === "care" && (
              <p className="text-xs text-stone-600 leading-relaxed font-medium pt-1 animate-fade-in text-left">
                {(product as any).care}
              </p>
            )}
          </div>
        )}

        {/* Delivery & Returns Accordion */}
        <div className="border-b border-stone-100/10 pb-1">
          <button
            type="button"
            onClick={() => setOpenAccordion(openAccordion === "returns" ? null : "returns")}
            className="w-full flex items-center justify-between py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-900 focus:outline-none cursor-pointer"
          >
            <span>{isReturnsAccepted ? "DELIVERY & 24H RETURN POLICY" : "DELIVERY & FINAL SALE POLICY"}</span>
            <span className="text-stone-400 text-xs font-normal">
              {openAccordion === "returns" ? "−" : "+"}
            </span>
          </button>
          {openAccordion === "returns" && (
            <div className="text-xs text-stone-600 leading-relaxed font-medium pt-1 space-y-2.5 text-left animate-fade-in">
              {!isReturnsAccepted ? (
                <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-2 text-xs text-stone-800 font-medium">
                  <div className="flex items-center gap-2 font-bold text-stone-900">
                    <RotateCcw className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" />
                    <span>Final Sale</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed pl-5">
                    This brand does not accept returns or change-of-mind cancellations for this item.
                  </p>
                  <div className="pt-2 border-t border-stone-200/60 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-stone-700 leading-relaxed font-medium">
                      <strong className="font-bold text-stone-900">Hive Guarantee:</strong> We’ve got you covered. If you receive a wrong, damaged, defective, stained, or incorrect item, Hive will accept the return and help you with a refund or resolution.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-2 text-xs text-stone-800 font-medium">
                  <div className="flex items-center gap-2 font-bold text-stone-900">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                    <span>{CUSTOMER_FEATURES.EXCHANGES_ENABLED ? "24-Hour Easy Returns & Size Exchange" : "24-Hour Easy Returns"}</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed pl-5.5">
                    {CUSTOMER_FEATURES.EXCHANGES_ENABLED
                      ? "Enjoy a 24-hour return and size exchange window starting from doorstep delivery time."
                      : "Enjoy a 24-hour return window starting from doorstep delivery time."}
                  </p>
                  <div className="pt-2 border-t border-stone-200/60 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-stone-700 leading-relaxed font-semibold">
                      Hive Guarantee: Damaged, defective, or wrong items are fully covered with a 100% refund.
                    </p>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-stone-500 pt-0.5">
                • <strong>Refund Timeline</strong>: Once approved, refunds credit back to your original payment method within 5–7 business days.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 7: MERCHANT ── */}
      <div className="border-t border-stone-200/80 pt-5 mt-4 select-none text-left">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Link 
                href={`/shop/${product.boutique.slug}`} 
                className="text-sm font-extrabold text-stone-900 hover:text-hive-amber transition-colors leading-none"
              >
                {product.boutique.name}
              </Link>
              {product.boutique.verified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-hive-gold fill-hive-gold/10 flex-shrink-0" />
              )}
            </div>
            <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-[0.12em] block mt-1.5">
              Hive Partner {product.boutique.city ? `• ${product.boutique.city.toUpperCase()}` : ""}
            </span>
          </div>

          {product.boutique.description && (
            <div className="relative group mt-1">
              {/* Ambient Glow Orb Behind Card */}
              <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-hive-gold/25 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
              
              {/* Editorial Glass Card */}
              <div className="relative z-10 bg-hive-cream/40 backdrop-blur-md border border-stone-200/60 border-l-4 border-l-hive-gold p-4 rounded-r-xl text-left flex gap-3.5 items-start hover:shadow-[0_8px_30px_rgba(240,194,67,0.18)] hover:-translate-y-0.5 transition-all duration-300">
                {product.boutique.logoUrl && (
                  <div className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden border-2 border-white bg-stone-100 shadow-md mt-0.5">
                    <img 
                      src={product.boutique.logoUrl} 
                      alt={`${product.boutique.name} Logo`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-hive-amber uppercase tracking-wider block mb-1">
                    Brand Story
                  </span>
                  <p className="font-serif text-[12.5px] text-stone-850 leading-relaxed italic whitespace-pre-line">
                    {truncateText(product.boutique.description, 500)}
                  </p>
                  {product.boutique.ownerName && (
                    <p className="font-serif text-[11px] text-hive-amber font-bold tracking-wide mt-2.5 text-right">
                      — {product.boutique.ownerName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading State Skeleton
// ─────────────────────────────────────────────────────────────────────────────
export const ProductInfoSkeleton: React.FC = () => {
  return (
    <div className="w-full flex flex-col gap-6 animate-pulse text-left p-2">
      <div className="space-y-2">
        <div className="h-4 w-1/4 bg-stone-200 rounded" />
        <div className="h-6 w-full bg-stone-200 rounded" />
        <div className="h-6 w-1/2 bg-stone-200 rounded" />
      </div>
      <div className="h-4 w-1/3 bg-stone-150 rounded" />
      <div className="h-10 w-full bg-stone-100 rounded-xl" />
      <div className="h-24 w-full bg-stone-100 rounded-2xl" />
      <div className="h-20 w-full bg-stone-50 rounded-2xl" />
    </div>
  );
};
