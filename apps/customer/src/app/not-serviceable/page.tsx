"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLocation } from "@/context/LocationContext";
import { MapPinOff, ArrowRight } from "lucide-react";
import { Button } from "@hive/ui";

export default function NotServiceablePage() {
  const router = useRouter();
  const { setGateOpen } = useLocation();

  return (
    <main className="flex flex-col items-center justify-center p-6 min-h-[75vh] bg-gradient-to-tr from-hive-cream/40 via-white to-hive-cream/20 select-none">
      <div className="max-w-lg w-full bg-white border border-hive-border/60 rounded-[32px] p-8 sm:p-10 shadow-[0_16px_40px_rgba(0,0,0,0.03)] flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
        
        {/* Animated Map Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-hive-gold border border-hive-gold/10 relative shadow-inner">
          <MapPinOff className="w-8 h-8 relative z-10" />
          <span className="absolute inset-0 rounded-2xl bg-hive-gold/5 animate-ping opacity-75 pointer-events-none" />
        </div>

        {/* Title and Description */}
        <div className="space-y-3">
          <h1 className="font-serif text-2xl sm:text-3xl font-black text-hive-dark tracking-tight">
            No products are currently deliverable to your location
          </h1>
          <p className="text-sm text-hive-text-muted leading-relaxed max-w-sm mx-auto font-medium">
            Hive delivers items within store-specific delivery radiuses. Please change your location or browse all available products.
          </p>
        </div>

        {/* Button Actions */}
        <div className="w-full flex flex-col sm:flex-row gap-3 mt-3">
          <Button
            variant="primary"
            onClick={() => setGateOpen(true)}
            className="flex-1 py-3 px-6 rounded-xl font-extrabold uppercase tracking-wider text-xs shadow-sm hover:shadow-md transition-all duration-300"
          >
            Change Location
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push("/products?browse=all")}
            className="flex-1 py-3 px-6 rounded-xl font-extrabold uppercase tracking-wider text-xs border-hive-border/80 hover:bg-slate-50 transition-all duration-300 flex items-center justify-center gap-1.5"
          >
            <span>Browse All Products</span>
            <ArrowRight className="w-4 h-4 text-hive-text-muted transition-transform" />
          </Button>
        </div>

      </div>
    </main>
  );
}
