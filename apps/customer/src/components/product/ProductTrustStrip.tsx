"use client";
import React from "react";
import { ShieldCheck, Ruler, Truck, RefreshCw, Video, CheckCircle2 } from "lucide-react";
import { cn } from "@hive/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: TrustBadge
// ─────────────────────────────────────────────────────────────────────────────
interface TrustBadgeProps {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  className?: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ icon: Icon, text, className }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 bg-hive-gold/10 border border-hive-gold/30 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-hive-amber uppercase tracking-wider",
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: TrustCard
// ─────────────────────────────────────────────────────────────────────────────
interface TrustCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  className?: string;
}

export const TrustCard: React.FC<TrustCardProps> = ({
  icon: Icon,
  title,
  description,
  className = "",
}) => {
  return (
    <div
      className={cn(
        "flex gap-3 items-start p-4 rounded-2xl border border-hive-border/40 bg-white hover:border-hive-gold/50 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 group text-left w-full",
        className
      )}
    >
      {/* Gold Icon Circle */}
      <div className="w-9 h-9 rounded-xl bg-hive-gold/10 border border-hive-gold/30 flex items-center justify-center text-hive-amber flex-shrink-0 group-hover:scale-110 group-hover:bg-hive-gold/20 transition-transform duration-300">
        <Icon className="w-4.5 h-4.5 stroke-[2]" />
      </div>

      {/* Content */}
      <div className="text-xs">
        <h4 className="font-extrabold text-hive-dark group-hover:text-hive-amber transition-colors duration-300">
          {title}
        </h4>
        <p className="text-hive-text-muted mt-1 leading-relaxed font-medium">
          {description}
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: ProductTrustStrip
// ─────────────────────────────────────────────────────────────────────────────
interface ProductTrustStripProps {
  videoUrl?: string;
  sameDayEligible: boolean;
  returnsAccepted?: boolean;
  className?: string;
}

export const ProductTrustStrip: React.FC<ProductTrustStripProps> = ({
  videoUrl,
  sameDayEligible,
  returnsAccepted = true,
  className = "",
}) => {
  // Construct dynamic list of trust signals based on seller product settings
  const signals = [
    {
      icon: Ruler,
      title: "Real Measurements",
      description: "Detailed measurement matrix provided for every size.",
      show: true,
    },
    {
      icon: Video,
      title: "Video Available",
      description: "See fabric movement and drape before purchasing.",
      show: !!videoUrl,
    },
    {
      icon: RefreshCw,
      title: returnsAccepted ? "1-Day Easy Returns" : "Final Sale",
      description: returnsAccepted
        ? "Return request accepted within 24 hours of delivery according to store policy."
        : "Final sale item. Wrong, damaged, defective, or stained items covered by Hive Guarantee.",
      show: true,
    },
    {
      icon: ShieldCheck,
      title: "Verified Partner",
      description: "This designer or label has been reviewed and approved by Hive.",
      show: true,
    },
    {
      icon: Truck,
      title: "Same-Day Delivery",
      description: "Eligible for same-day delivery within supported regions.",
      show: sameDayEligible,
    },
  ].filter((s) => s.show);

  return (
    <div className={cn("w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1 gap-3.5", className)}>
      {signals.map((sig, idx) => (
        <TrustCard
          key={idx}
          icon={sig.icon}
          title={sig.title}
          description={sig.description}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Component: PurchaseConfidenceCard (Checkout panel styling)
// ─────────────────────────────────────────────────────────────────────────────
export const PurchaseConfidenceCard: React.FC<{ className?: string }> = ({ className = "" }) => {
  const guaranteeItems = [
    "Verified Fashion Partner",
    "Authentic Product Listing",
    "Measurement Transparency",
    "Return Protection",
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-[#FFFDF9] via-[#FAF8F2] to-[#FFFDF9] border border-hive-gold/40 rounded-3xl p-5 shadow-sm text-left w-full",
        className
      )}
    >
      {/* Honeycomb geometric vector backdrop */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none select-none">
        <svg className="w-full h-full stroke-hive-gold" aria-hidden="true">
          <defs>
            <pattern id="confidence-honeycomb" patternUnits="userSpaceOnUse" width="28" height="48">
              <path fill="none" strokeWidth="1" d="m0,8 14-8 14,8v16l-14,8-14-8z M14,32v16" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#confidence-honeycomb)" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3.5 relative z-10">
        <div className="w-6 h-6 rounded-full bg-hive-amber/15 flex items-center justify-center text-hive-amber">
          <ShieldCheck className="w-3.5 h-3.5 fill-current" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-hive-dark">
          Hive Buyer Protection
        </span>
      </div>

      {/* Checklist Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 relative z-10">
        {guaranteeItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs font-bold text-hive-dark">
            <CheckCircle2 className="w-4 h-4 text-hive-amber flex-shrink-0" strokeWidth={2.5} />
            <span>{item}</span>
          </div>
        ))}
      </div>

      {/* Reassurance text */}
      <p className="text-[10px] text-hive-text-muted mt-3.5 leading-relaxed font-semibold border-t border-hive-border/30 pt-3 relative z-10">
        Shop with absolute confidence. Every order qualifies for our 100% fit accuracy guarantee and verified partner shipment checks.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading State: TrustStripSkeleton
// ─────────────────────────────────────────────────────────────────────────────
export const TrustStripSkeleton: React.FC = () => {
  return (
    <div className="w-full flex flex-col gap-3.5 animate-pulse text-left">
      {/* 4 Cards Skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 items-start p-4 border border-hive-border/20 rounded-2xl bg-hive-cream/5">
          <div className="w-9 h-9 rounded-xl bg-hive-comb/15 flex-shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3 w-1/3 bg-hive-comb/15 rounded" />
            <div className="h-2.5 w-5/6 bg-hive-comb/10 rounded" />
          </div>
        </div>
      ))}
      
      {/* Confidence Panel Skeleton */}
      <div className="h-36 w-full bg-hive-comb/10 border border-hive-border/20 rounded-3xl" />
    </div>
  );
};
