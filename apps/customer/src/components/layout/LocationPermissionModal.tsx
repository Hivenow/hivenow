"use client";

import React, { useState } from "react";
import { Modal, LoadingState } from "@hive/ui";
import { useLocation } from "@/context/LocationContext";
import { MapPin, Loader2, AlertCircle, ArrowRight, X, ShieldCheck, Truck, Lock, Navigation, Compass } from "lucide-react";

export const LocationPermissionModal: React.FC = () => {
  const { 
    isGateOpen, 
    setGateOpen, 
    setDrawerOpen, 
    detectLocation, 
    setBrowseAllProducts 
  } = useLocation();

  const [loadingStep, setLoadingStep] = useState<"idle" | "detecting" | "geocoding">("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);

  const handleDetectLocation = async () => {
    setLoadingStep("detecting");
    setGpsError(null);
    try {
      const result = await detectLocation();
      if (result.success) {
        setGateOpen(false);
      } else {
        setGpsError(result.error || "Location access denied by browser. Please select your area manually.");
      }
    } catch (err: any) {
      setGpsError(err?.message || "Failed to detect location. Please select manually.");
    } finally {
      setLoadingStep("idle");
    }
  };

  const handleChooseManually = () => {
    setGateOpen(false);
    setDrawerOpen(true);
  };

  const handleJustBrowse = () => {
    setBrowseAllProducts(true);
    setGateOpen(false);
  };

  return (
    <Modal
      isOpen={isGateOpen}
      onClose={handleJustBrowse}
      hideHeader={true}
      className="w-[calc(100%-2.5rem)] max-w-md h-fit max-h-[90vh] bg-hive-cream-deep dark:bg-neutral-950 rounded-[32px] sm:rounded-[32px] border border-stone-250/30 dark:border-neutral-800/80 m-auto"
    >
      <div className="flex flex-col gap-4 sm:gap-6 text-center items-center py-2 font-sans overflow-y-auto no-scrollbar">
        {loadingStep === "detecting" || loadingStep === "geocoding" ? (
          <div className="py-10 flex flex-col items-center justify-center gap-4">
            <LoadingState 
              message={loadingStep === "detecting" ? "Scanning your location..." : "Finding local boutiques near you..."} 
              size="md" 
            />
            <p className="text-xs text-slate-500 font-medium max-w-xs animate-pulse">
              Please allow location access when prompted by your browser...
            </p>
          </div>
        ) : (
          <>
            {/* Custom Header Row */}
            <div className="w-full flex items-center justify-between gap-4 pb-2 sm:pb-4 border-b border-stone-200/50 dark:border-neutral-800/60">
              <div className="flex items-center gap-3 text-left">
                <div className="w-12 h-12 rounded-full bg-hive-amber/10 dark:bg-amber-950/30 flex items-center justify-center text-hive-amber flex-shrink-0">
                  <MapPin className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-stone-900 dark:text-white leading-tight">Service Area</span>
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400 font-bold leading-none mt-1">Where should we deliver?</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleJustBrowse}
                className="w-10 h-10 rounded-full border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center text-slate-500 hover:text-stone-950 dark:hover:text-white active:scale-95 transition-all shadow-sm flex-shrink-0 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Premium Vector Illustration Area */}
            <div className="w-full py-1">
              <svg viewBox="0 0 400 150" className="w-full h-20 sm:h-36" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Horizon Line */}
                <line x1="10" y1="130" x2="390" y2="130" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="4 4" />
                
                {/* Clouds */}
                <path d="M50 45 C50 35, 65 35, 70 40 C75 35, 90 35, 90 45 C90 50, 50 50, 50 45 Z" fill="#E5E7EB" opacity="0.4" />
                <path d="M310 35 C310 27, 322 27, 326 31 C330 27, 342 27, 342 35 C342 39, 310 39, 310 35 Z" fill="#E5E7EB" opacity="0.4" />

                {/* Suspension Bridge (Left) */}
                <path d="M30 130 L30 80 M70 130 L70 80" stroke="#E5E7EB" strokeWidth="2" />
                <path d="M20 95 Q50 115, 80 95" stroke="#D1D5DB" strokeWidth="1.5" fill="none" />
                <path d="M10 130 L90 130" stroke="#9CA3AF" strokeWidth="2" />
                {/* Vertical suspender cables */}
                <line x1="40" y1="102" x2="40" y2="130" stroke="#E5E7EB" strokeWidth="1" />
                <line x1="50" y1="104" x2="50" y2="130" stroke="#E5E7EB" strokeWidth="1" />
                <line x1="60" y1="102" x2="60" y2="130" stroke="#E5E7EB" strokeWidth="1" />

                {/* Lighthouse (Right) */}
                <path d="M320 130 L325 80 L335 80 L340 130 Z" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="1.5" />
                {/* Stripes */}
                <path d="M322 110 L338 110 L336 95 L324 95 Z" fill="#EAB308" opacity="0.1" />
                <path d="M325 80 L335 80 L335 73 L325 73 Z" fill="#4B5563" />
                {/* Light beams */}
                <polygon points="330,76 280,50 285,40" fill="#FDE047" opacity="0.1" />
                <polygon points="330,76 380,50 375,40" fill="#FDE047" opacity="0.1" />

                {/* Palm Trees */}
                <path d="M110 130 Q108 110, 112 95" stroke="#A16207" strokeWidth="2.5" fill="none" />
                <path d="M112 95 Q100 90, 95 98 M112 95 Q105 82, 100 85 M112 95 Q112 80, 115 82 M112 95 Q122 82, 125 88 M112 95 Q125 92, 122 100" stroke="#15803D" strokeWidth="1.8" fill="none" />
                
                <path d="M280 130 Q283 112, 278 98" stroke="#A16207" strokeWidth="2.5" fill="none" />
                <path d="M278 98 Q265 92, 262 100 M278 98 Q270 85, 266 88 M278 98 Q278 82, 281 84 M278 98 Q288 85, 291 90 M278 98 Q290 95, 287 103" stroke="#15803D" strokeWidth="1.8" fill="none" />

                {/* Large Kochi Location Pin (Center) */}
                <g transform="translate(180, 15)">
                  <ellipse cx="20" cy="110" rx="12" ry="4" fill="#E5E7EB" />
                  
                  <circle cx="20" cy="108" r="8" fill="none" stroke="#F59E0B" strokeWidth="1.5" opacity="0.5">
                    <animate attributeName="r" values="8;18;8" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
                  </circle>

                  <path d="M20 105 C8 90, 0 75, 0 53 C0 30, 9 20, 20 20 C31 20, 40 30, 40 53 C40 75, 32 90, 20 105 Z" fill="#D97706" />
                  <path d="M20 105 C8 90, 0 75, 0 53 C0 30, 9 20, 20 20 Z" fill="#F59E0B" opacity="0.15" />
                  <circle cx="20" cy="48" r="8" fill="#FFFFFF" />
                </g>
              </svg>
            </div>

            {/* Headline and Subheadline */}
            <div className="flex flex-col gap-2 w-full px-2">
              <h3 className="text-xl sm:text-2xl font-serif font-black text-stone-900 dark:text-white tracking-tight uppercase">
                Hive is launching in <span className="text-hive-amber">Kochi!</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-neutral-350 max-w-[340px] mx-auto leading-relaxed font-semibold">
                We deliver fashion from local brands and stores across Kochi. Allow location access or pick your neighborhood to view available inventory.
              </p>
            </div>

            {/* Grid Value Propositions */}
            <div className="w-full grid grid-cols-3 gap-1 sm:gap-2 bg-hive-cream-deep/60 dark:bg-neutral-900/40 rounded-2xl border border-hive-cream-deep/80 dark:border-neutral-800/60 p-2 sm:p-3 text-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-hive-amber p-1 bg-hive-amber/10 dark:bg-amber-950/40 rounded-lg">
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.8]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-stone-900 dark:text-white leading-tight">Partner Stores</span>
                <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-neutral-400 font-bold leading-none">Trusted local partners</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-hive-amber p-1 bg-hive-amber/10 dark:bg-amber-950/40 rounded-lg">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.8]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-stone-900 dark:text-white leading-tight">Same-day delivery</span>
                <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-neutral-400 font-bold leading-none">On eligible orders</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-hive-amber p-1 bg-hive-amber/10 dark:bg-amber-950/40 rounded-lg">
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.8]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-stone-900 dark:text-white leading-tight">Secure shopping</span>
                <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-neutral-400 font-bold leading-none">Safe & reliable</span>
              </div>
            </div>

            {/* Error display if any */}
            {gpsError && (
              <div className="w-full flex items-start gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-xl text-left border border-red-200">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-bold text-red-700">Location Access Denied</p>
                  <p className="text-[11px] mt-0.5 text-red-600">{gpsError}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2 sm:gap-3 px-1">
              {/* Option 1: Use Current Location (GPS) - User Gesture Trigger for Native Browser Prompt */}
              <button
                type="button"
                onClick={handleDetectLocation}
                className="w-full h-12 rounded-xl bg-hive-amber hover:bg-hive-amber-dark active:scale-[0.98] text-white font-bold text-xs uppercase tracking-[0.15em] flex items-center justify-between px-5 transition-all shadow-md cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 fill-white stroke-none" />
                  <span>Use Current Location (GPS)</span>
                </div>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Option 2: Select Location Manually */}
              <button
                type="button"
                onClick={handleChooseManually}
                className="w-full h-11 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 active:scale-[0.98] text-stone-900 dark:text-white font-bold text-xs uppercase tracking-[0.15em] flex items-center justify-between px-5 transition-all cursor-pointer select-none border border-stone-200 dark:border-neutral-700"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-hive-amber" />
                  <span>Select Area Manually</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Option 3: Browse All Boutiques */}
              <button
                type="button"
                onClick={handleJustBrowse}
                className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer select-none"
              >
                Browse All Boutiques →
              </button>

              {/* Privacy Footer */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-neutral-400 font-semibold mt-1 text-center select-none">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Your location is only used to show nearby boutiques & delivery options.</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
