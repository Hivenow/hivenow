"use client";
import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { ShoppingBag, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface StyledTogetherProps {
  productId: string;
}

export const CompleteTheLook: React.FC<StyledTogetherProps> = ({ productId }) => {
  const recommendations = useQuery(api.recommendations.getCompleteTheLook, {
    productId: productId as any,
  });

  if (recommendations === undefined) {
    return (
      <div className="w-full border-t border-stone-250/60 pt-10 mt-10 animate-pulse space-y-5 text-left">
        <div className="h-3.5 w-24 bg-stone-100 rounded" />
        <div className="h-6 w-48 bg-stone-150 rounded" />
        <div className="flex gap-4 overflow-hidden">
          <div className="h-32 w-[280px] bg-stone-100 rounded-2xl shrink-0" />
          <div className="h-32 w-[280px] bg-stone-100 rounded-2xl shrink-0" />
        </div>
      </div>
    );
  }
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <section 
      aria-labelledby="complete-the-look-title" 
      className="w-full border-t border-stone-200/80 pt-10 mt-10 text-left select-none"
    >
      <div className="flex flex-col gap-1 mb-6">
        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.2em] select-none">
          STYLE PAIRINGS
        </span>
        <h2 
          id="complete-the-look-title" 
          className="text-lg sm:text-xl font-serif font-bold text-stone-900"
        >
          Complete The Look
        </h2>
        <p className="text-xs text-stone-500 font-medium">
          Matching pieces and accessories from this store
        </p>
      </div>

      {/* Horizontal scroll container with smaller cards */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x scroll-smooth -mx-6 px-6 sm:mx-0 sm:px-0">
        {recommendations.map((item: any) => {
          return (
            <Link 
              key={item._id} 
              href={`/products/${item.slug}`}
              className="w-[260px] sm:w-[280px] shrink-0 snap-start bg-white border border-stone-200/60 rounded-2xl p-3 flex gap-3.5 transition-all duration-300 hover:shadow-md hover:border-stone-900/30 group cursor-pointer"
            >
              {/* Product Thumbnail */}
              <div className="w-20 h-24 relative rounded-xl overflow-hidden bg-stone-50 shrink-0">
                {item.images && item.images[0] ? (
                  <Image 
                    src={item.images[0]} 
                    alt={item.name}
                    fill
                    sizes="80px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-300 bg-stone-100">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="flex-1 flex flex-col justify-between text-left min-w-0 py-0.5">
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700 block truncate">
                    {item.categoryName || "Merchandise"}
                  </span>
                  <h3 className="text-xs font-bold text-stone-850 group-hover:text-stone-950 transition-colors truncate block mt-0.5">
                    {item.name}
                  </h3>
                  
                  <div className="text-xs font-bold text-stone-900 mt-1">
                    ₹{item.price.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-700 group-hover:text-amber-800 transition-colors">
                  <span>View Details</span>
                  <ArrowRight className="w-2.5 h-2.5 transform group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
