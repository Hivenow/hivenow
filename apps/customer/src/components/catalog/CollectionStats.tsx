import React from "react";
import { Package, Store, Truck, Star } from "lucide-react";
import { CollectionDetails } from "@/lib/collections";

interface CollectionStatsProps {
  details: CollectionDetails;
}

interface StatItem {
  icon: React.FC<{ className?: string; strokeWidth?: number }>;
  value: string;
  label: string;
}

export const CollectionStats: React.FC<CollectionStatsProps> = ({ details }) => {
  const { stats } = details;

  const items: StatItem[] = [
    {
      icon: Package,
      value: `${stats.productCount}+`,
      label: "Products",
    },
    {
      icon: Store,
      value: `${stats.boutiqueCount}`,
      label: "Stores",
    },
    {
      icon: Truck,
      value: `${stats.sameDayEligible}`,
      label: "Same Day Eligible",
    },
    {
      icon: Star,
      value: stats.averageRating.toFixed(1),
      label: "Avg. Rating",
    },
  ];

  return (
    <div
      className="w-full border-b border-hive-border/60"
      style={{
        background: `linear-gradient(135deg, #FFFDF5 0%, #fff 60%, ${details.accentColor}08 100%)`,
      }}
    >
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-hive-border/40">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-center py-6 px-4 gap-1.5 group"
              >
                <div
                  className="p-2 rounded-xl mb-1 transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: `${details.accentColor}15`,
                    color: details.accentColor,
                  }}
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                </div>
                <span
                  className="text-2xl md:text-3xl font-serif font-extrabold tracking-tight"
                  style={{ color: details.accentColor }}
                >
                  {item.value}
                </span>
                <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-widest text-center">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
