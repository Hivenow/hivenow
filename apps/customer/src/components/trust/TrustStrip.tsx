"use client";

import React from "react";
import { Zap, Store, Headphones, ShieldCheck } from "lucide-react";

const trustPillars = [
  {
    icon: Zap,
    title: "90-Min Delivery",
    subtitle: "Hyperlocal Kochi Dispatch",
  },
  {
    icon: Store,
    title: "Independent Brands",
    subtitle: "Direct from Kochi Stores",
  },
  {
    icon: Headphones,
    title: "Dedicated Support",
    subtitle: "Personal Order Assistance",
  },
  {
    icon: ShieldCheck,
    title: "100% Safe Payments",
    subtitle: "Instant UPI & Card Checkout",
  },
];

export const TrustStrip: React.FC = () => {
  return (
    <section className="w-full bg-stone-50/70 dark:bg-stone-950 border-y border-stone-200/80 dark:border-stone-800 py-6 sm:py-7 my-2 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 sm:gap-6 md:divide-x md:divide-stone-200 dark:md:divide-stone-800">
          {trustPillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex flex-col items-center text-center px-2 sm:px-4 md:first:pl-0 group"
              >
                {/* Premium Icon Badge */}
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 flex items-center justify-center text-stone-800 dark:text-stone-200 flex-shrink-0 shadow-2xs mb-2.5 group-hover:scale-105 group-hover:border-amber-400 transition-all duration-200">
                  <Icon className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={2.2} />
                </div>

                {/* Title */}
                <h3 className="text-xs sm:text-[13px] font-bold text-stone-900 dark:text-white tracking-tight leading-snug">
                  {item.title}
                </h3>

                {/* Subtitle */}
                <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium leading-tight mt-1">
                  {item.subtitle}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
