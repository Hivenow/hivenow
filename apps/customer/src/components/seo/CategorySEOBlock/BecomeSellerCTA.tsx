import React from "react";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";

export function BecomeSellerCTA() {
  return (
    <div className="mt-16 border-t border-hive-border/40 pt-12 pb-6">
      <div className="bg-hive-dark rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,100 C30,80 70,80 100,100 L100,0 L0,0 Z" fill="url(#grad)" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFFDF5" />
                <stop offset="100%" stopColor="#8A8578" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-6">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mb-4">
            Own a fashion brand or store in Ernakulam?
          </h2>
          <p className="text-stone-300 mb-8 leading-relaxed max-w-lg">
            Join Hive to reach thousands of local customers. Offer same-day delivery and grow your fashion business with zero upfront costs.
          </p>
          <Link
            href="/become-seller"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-hive-cream hover:bg-white text-hive-dark font-extrabold text-xs uppercase tracking-widest rounded-full transition-all duration-300 hover:scale-[1.02] shadow-lg group"
          >
            Become a Seller
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
