"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useConvexMutation } from "@/hooks/useConvexMutation";
import { useSessionStore } from "@/context/SessionContext";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, cn } from "@hive/ui";
import { Store, User, Phone, MapPin, Truck, AlignLeft, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight, Loader2, Sparkles, DollarSign, Package, FileText, TrendingUp, Check, ChevronRight, Shirt, Crown, Gem, Layers, ShoppingBag } from "lucide-react";
import { useLocation } from "@/context/LocationContext";
import Link from "next/link";
import { getSignInUrl, getSignUpUrl } from "@/lib/auth-redirect";



export function BecomeSellerClient() {
  const { user, isAuthenticated, isLoading, token } = useSessionStore();
  const isUserLoaded = !isLoading;
  const isSignedIn = isAuthenticated;
  const { latitude: userLat, longitude: userLng } = useLocation();

  const SELLER_PORTAL_URL = process.env.NEXT_PUBLIC_SELLER_PORTAL_URL || "https://seller.hivenow.in";

  // Fetch boutique status
  const boutiqueSafe = useQuery(api.boutiques.getMyBoutiqueSafeCustomer, { token: token || undefined });
  const applyBoutique = useConvexMutation(api.boutiques.applyBoutique);


  // Form State
  const [boutiqueName, setBoutiqueName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Kochi");
  const [stateName, setStateName] = useState("Kerala");
  const [pincode, setPincode] = useState("682001");
  const [area, setArea] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [serviceType, setServiceType] = useState<"ready_to_ship" | "made_to_order" | "alterations" | "custom_design">("ready_to_ship");
  const [latitude, setLatitude] = useState<number>(9.9312);
  const [longitude, setLongitude] = useState<number>(76.2673);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(15);
  const [description, setDescription] = useState("");
  const [storeCategory, setStoreCategory] = useState<"women_fashion" | "mens_fashion" | "jewellery" | "multi_category">("women_fashion");
  const [sellerModel, setSellerModel] = useState<"boutique" | "brand" | "multi_brand_store">("boutique");
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isReapplying, setIsReapplying] = useState(false);
  const [hasPrefilledOwner, setHasPrefilledOwner] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (name: string, value: string) => {
    let err = "";
    if (name === "boutiqueName") {
      if (!value.trim()) {
        err = "Store / Brand name is required.";
      } else if (value.trim().length < 3) {
        err = "Store / Brand name must be at least 3 characters.";
      }
    } else if (name === "sellerModel") {
      if (!value) err = "Seller model is required.";
    } else if (name === "address") {
      if (!value.trim()) err = "Store physical address is required.";
    } else if (name === "phone") {
      const phoneClean = value.replace(/[^0-9]/g, "");
      if (!value.trim()) {
        err = "Phone number is required.";
      } else if (!/^[6-9]\d{9}$/.test(phoneClean)) {
        err = "Invalid phone number. Must be a 10-digit Indian mobile number starting with 6-9.";
      }
    }
    setErrors(prev => ({ ...prev, [name]: err }));
    return err;
  };

  const handleBlur = (field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateField(field, value);
  };

  // Prefill details on reapplication
  useEffect(() => {
    if (isReapplying && boutiqueSafe?.exists && boutiqueSafe?.boutique) {
      const b = boutiqueSafe.boutique as any;
      setBoutiqueName(b.boutiqueName || "");
      setOwnerName(b.ownerName || "");
      setHasPrefilledOwner(true);
      setPhone(b.phone || "");
      setAddress(b.address || "");
      setCity(b.city || "Kochi");
      setStateName(b.state || "Kerala");
      setPincode(b.pincode || "682001");
      setArea(b.area || "");
      setKeywordsInput(b.searchKeywords ? b.searchKeywords.join(", ") : "");
      setServiceType(b.serviceType || "ready_to_ship");
      setLatitude(b.latitude || 9.9312);
      setLongitude(b.longitude || 76.2673);
      setDeliveryRadiusKm(b.deliveryRadiusKm || 15);
      setDescription(b.description || "");
      setStoreCategory(b.storeCategory || "women_fashion");
      setSellerModel(b.sellerModel || "boutique");
    }
  }, [isReapplying, boutiqueSafe]);

  const formRef = useRef<HTMLDivElement>(null);

  // Get category/model from query param if any on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const catParam = params.get("category");
      if (catParam) {
        setStoreCategory(catParam as any);
      }
      const modelParam = params.get("model");
      if (modelParam) {
        setSellerModel(modelParam as any);
      }
    }
  }, []);

  // Set default coordinates when user context loads
  useEffect(() => {
    if (userLat && userLng && latitude === 0 && longitude === 0) {
      setLatitude(userLat);
      setLongitude(userLng);
    } else if (latitude === 0 && longitude === 0) {
      // Default to Kochi central coordinates if no user context
      setLatitude(9.9312);
      setLongitude(76.2673);
    }
  }, [userLat, userLng, latitude, longitude]);

  const isApprovedMerchant = boutiqueSafe?.exists && boutiqueSafe?.boutique?.status === "APPROVED";

  // Redirect approved partners to their portal
  useEffect(() => {
    if (isApprovedMerchant) {
      window.location.href = SELLER_PORTAL_URL;
    }
  }, [isApprovedMerchant, SELLER_PORTAL_URL]);

  // Set default owner name from session
  useEffect(() => {
    if (user && user.name && !hasPrefilledOwner) {
      setOwnerName(user.name);
      setHasPrefilledOwner(true);
    }
  }, [user, hasPrefilledOwner]);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const e1 = validateField("boutiqueName", boutiqueName);
    const e2 = validateField("sellerModel", sellerModel);
    const e3 = validateField("address", address);
    const e4 = validateField("phone", phone);
    
    if (e1 || e2 || e3 || e4) {
      setTouched({ boutiqueName: true, sellerModel: true, address: true, phone: true });
      return;
    }

    if (latitude < 8.0 || latitude > 13.0) {
      alert("Error: Store Latitude must be a valid coordinate within Kerala region (8.0 to 13.0).");
      return;
    }
    if (longitude < 74.0 || longitude > 78.0) {
      alert("Error: Store Longitude must be a valid coordinate within Kerala region (74.0 to 78.0).");
      return;
    }

    // Parse and validate keywords input
    const keywords = keywordsInput
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keywords.length > 10) {
      alert("Error: Maximum of 10 search keywords allowed.");
      return;
    }
    for (const kw of keywords) {
      if (kw.length > 40) {
        alert(`Error: Keyword "${kw}" exceeds maximum length of 40 characters.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await applyBoutique({
        boutiqueName,
        ownerName,
        phone,
        address,
        city,
        state: stateName,
        pincode,
        latitude,
        longitude,
        deliveryRadiusKm,
        description,
        storeCategory,
        sellerModel,
        area: area || undefined,
        searchKeywords: keywords.length > 0 ? keywords : undefined,
        serviceType: serviceType || undefined,
        token: token || undefined,
      });
      setIsSuccess(true);
    } catch (err: any) {
      alert("Failed to submit merchant application: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Loading State
  if (!isUserLoaded || boutiqueSafe === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Checking partner registration status...</p>
      </div>
    );
  }



  // 3. Existing application checks & Success State
  if ((boutiqueSafe.exists && boutiqueSafe.boutique && !isReapplying) || isSuccess) {
    const isPending = isSuccess || (boutiqueSafe.boutique?.status === "PENDING");
    const isApproved = !isSuccess && (boutiqueSafe.boutique?.status === "APPROVED");
    const isRejected = !isSuccess && (boutiqueSafe.boutique?.status === "REJECTED");
    const name = isSuccess ? boutiqueName : (boutiqueSafe.boutique?.boutiqueName || "");
    const category = isSuccess ? storeCategory : (boutiqueSafe.boutique?.storeCategory || "");
    const model = isSuccess ? sellerModel : (boutiqueSafe.boutique?.sellerModel || "");
    const rejectionReason = !isSuccess ? boutiqueSafe.boutique?.rejectionReason : null;

    // Formatting category display
    const formatCategory = (cat: string) => {
      const mapping: Record<string, string> = {
        women_fashion: "Women's Fashion",
        mens_fashion: "Men's Fashion",
        jewellery: "Jewellery",
        multi_category: "Multi-category Store"
      };
      return mapping[cat] || cat;
    };

    // Formatting model display
    const formatModel = (mdl: string) => {
      const mapping: Record<string, string> = {
        boutique: "Retail Store",
        brand: "Independent Brand",
        multi_brand_store: "Multi-brand Store"
      };
      return mapping[mdl] || mdl;
    };

    return (
      <div className="min-h-screen bg-hive-cream flex flex-col items-center justify-center pb-24 animate-fadeIn">
        {/* Decorative background blur blobs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-hive-gold/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-hive-amber/3 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-2xl mx-auto px-6 pt-12 relative z-10 text-left">
          <div className="bg-white border border-hive-border rounded-3xl shadow-[0_8px_30px_rgba(140,122,90,0.05)] overflow-hidden p-6 md:p-8 flex flex-col gap-6">
            
            {/* Header Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-hive-border/40">
              <div className="space-y-1">
                <h1 className="text-2xl font-serif font-black text-hive-dark">Partner Portal Status</h1>
                <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-hive-text-muted">Registered partnership request tracking console</p>
              </div>
              
              {/* Badges */}
              <div>
                {isPending && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-hive-comb/30 border border-hive-gold/40 text-[10px] font-bold text-hive-text-muted uppercase tracking-wider animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5 animate-spin text-hive-gold" /> Under Review
                  </span>
                )}
                {isApproved && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50/50 border border-emerald-250 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active Partner
                  </span>
                )}
                {isRejected && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50/50 border border-red-200 text-[10px] font-bold text-red-700 uppercase tracking-wider">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Rejected
                  </span>
                )}
              </div>
            </div>

            {/* Stepper Visualization */}
            <div className="grid grid-cols-3 items-center gap-4 py-4 relative">
              {/* Connecting line */}
              <div className="absolute left-[16.6%] right-[16.6%] top-[34px] h-[2px] bg-stone-100 -z-10" />
              <div 
                className="absolute left-[16.6%] top-[34px] h-[2px] bg-hive-gold transition-all duration-1000 -z-10" 
                style={{ 
                  width: isApproved ? "66.8%" : isRejected ? "0%" : "33.4%" 
                }} 
              />

              {/* Step 1 */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center font-bold text-xs shadow-sm">
                  ✓
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-stone-800 uppercase block tracking-[0.1em]">Submitted</span>
                  <span className="text-[9px] text-stone-400 block font-medium">Request received</span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border-2 transition-colors duration-300",
                  isApproved ? "bg-emerald-50 border-emerald-500 text-emerald-600" :
                  isRejected ? "bg-red-50 border-red-500 text-red-600" :
                  "bg-hive-comb/40 border-hive-gold text-hive-gold animate-pulse"
                )}>
                  {isApproved ? "✓" : isRejected ? "✗" : "2"}
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-stone-800 uppercase block tracking-[0.1em]">Verification</span>
                  <span className="text-[9px] text-stone-400 block font-medium">
                    {isRejected ? "Failed criteria" : "Address & GPS check"}
                  </span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border-2 transition-colors duration-300",
                  isApproved ? "bg-emerald-50 border-emerald-500 text-emerald-600" :
                  "bg-stone-50 border-stone-200 text-stone-400"
                )}>
                  {isApproved ? "✓" : "3"}
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-stone-800 uppercase block tracking-[0.1em]">Portal Active</span>
                  <span className="text-[9px] text-stone-400 block font-medium">Seller Center access</span>
                </div>
              </div>
            </div>

            {/* Profile Overview Card */}
            <div className="bg-hive-cream border border-hive-border/60 rounded-2xl p-5 flex flex-col gap-4">
              <span className="text-[9px] font-bold uppercase text-hive-text-muted tracking-[0.2em]">Partnership Request Summary</span>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div>
                  <span className="text-[9px] font-bold text-stone-400 tracking-[0.15em] uppercase block">Merchant Name</span>
                  <span className="font-bold text-hive-dark">{name}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] block">Store Category</span>
                  <span className="font-semibold text-stone-750">{formatCategory(category)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] block">Seller Model</span>
                  <span className="font-semibold text-stone-750">{formatModel(model)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] block">Logistics Status</span>
                  <span className="font-semibold text-stone-750">Same-Day Eligible</span>
                </div>
              </div>
            </div>

            {/* Rejection Banner */}
            {isRejected && (
              <div className="p-5 rounded-2xl bg-red-50/40 border border-red-100/60 flex flex-col gap-2 animate-fadeIn">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Rejection Details
                </span>
                <p className="text-xs text-red-800 font-medium leading-relaxed">
                  {rejectionReason || "Your store details did not match our current verification parameters."}
                </p>
                <p className="text-[10px] text-red-500/80 mt-1 italic leading-relaxed">
                  * Please reach out to support@hivenow.in to clarify physical store location details or request a re-review.
                </p>
              </div>
            )}

            {/* Explanatory Message / CTAs */}
            <div className="pt-2 text-center">
              {isPending && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto">
                    We are currently verifying your store location coordinates and contact profiles. Approvals typically take less than 24 hours.
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button 
                      onClick={() => window.location.reload()} 
                      variant="outline" 
                      className="px-6 h-11 border border-hive-gold text-hive-dark hover:bg-hive-cream tracking-[0.2em] text-[10px] font-semibold uppercase rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Refresh Status
                    </Button>
                  </div>
                </div>
              )}

              {isApproved && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto">
                    Welcome onboard! Your account is active. You can now access your partner workspace to upload inventories, configure custom branding, and track orders.
                  </p>
                  <div className="flex justify-center">
                    <Link href={SELLER_PORTAL_URL}>
                      <Button variant="primary" className="px-8 h-12 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 font-semibold tracking-[0.2em] text-[10px] uppercase rounded-xl flex items-center gap-2 shadow-sm shadow-hive-gold/10 hover:shadow-hive-gold/25 transition-all">
                        Open Seller Center <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {isRejected && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto">
                    You can submit a corrected partnership request once you resolve the verification criteria.
                  </p>
                  <div className="flex justify-center">
                    <Button 
                      onClick={() => {
                        setIsReapplying(true);
                      }} 
                      variant="primary" 
                      className="px-8 h-12 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 font-semibold tracking-[0.2em] text-[10px] uppercase rounded-xl flex items-center gap-2 shadow-sm shadow-hive-gold/10 hover:shadow-hive-gold/25 transition-all"
                    >
                      Resubmit Partnership Request <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  // 5. Registration Form
  return (
    <div className="min-h-screen bg-hive-cream w-full pb-24 text-hive-dark">
      {/* Decorative background blurs */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-hive-gold/3 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-hive-amber/3 rounded-full blur-[100px] pointer-events-none" />

      {/* ──────────────────────────────────────────────────
          1. MARKETING HERO
          ────────────────────────────────────────────────── */}
      <section className="w-full max-w-4xl mx-auto px-6 pt-12 md:pt-16 pb-16 text-center">
        <div className="space-y-6 flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-hive-gold/10 border border-hive-gold/25 text-[10px] font-bold text-hive-dark uppercase tracking-widest">
            <Store className="w-3.5 h-3.5 text-hive-gold" /> Hive Merchant Hub
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6.5xl font-serif font-light text-hive-dark tracking-tight leading-[1.1] text-center">
            Sell Fashion Locally. <br />
            <span className="font-serif italic font-normal text-hive-gold">
              Deliver in Hours.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-stone-500 max-w-2xl leading-relaxed text-center">
            Join Kerala&apos;s hyperlocal fashion marketplace. From boutiques to independent designers, Hive helps partners reach nearby customers with same-day logistics.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 max-w-2xl w-full text-left">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-hive-gold/10 border border-hive-gold/20 text-hive-gold">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-hive-dark">Reach Nearby Shoppers</h4>
                <p className="text-[10px] text-stone-500">Sell within your local radius</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-hive-gold/10 border border-hive-gold/20 text-hive-gold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-hive-dark">Same-Day Delivery</h4>
                <p className="text-[10px] text-stone-500">Orders dispatched in hours</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-hive-gold/10 border border-hive-gold/20 text-hive-gold">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-hive-dark">Managed Logistics</h4>
                <p className="text-[10px] text-stone-500">Fully integrated courier network</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-hive-gold/10 border border-hive-gold/20 text-hive-gold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-hive-dark">Partnership Access</h4>
                <p className="text-[10px] text-stone-500">Frictionless settlements & order tracking</p>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row gap-4 items-center justify-center w-full">
            <Button
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              variant="primary"
              className="px-8 h-12 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 font-bold tracking-[0.2em] text-[10px] uppercase rounded-xl shadow-sm transition-all duration-300 active:scale-[0.98] w-full sm:w-auto"
            >
              Request Store Partnership
            </Button>
          </div>

          <div className="pt-2">
            <p className="text-xs text-stone-500 font-medium">
              Already a Hive Partner?{" "}
              <a
                href={SELLER_PORTAL_URL}
                className="text-hive-gold hover:underline font-semibold"
              >
                Open Partner Portal →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────
          2. CATEGORY SELECTOR ("What do you sell?")
          ────────────────────────────────────────────────── */}
      <section className="w-full bg-hive-cream border-y border-hive-border/40 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center space-y-8">
          <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-hive-gold">SELECT YOUR STYLE</span>
            <h2 className="text-3xl font-serif font-light text-hive-dark uppercase tracking-tight">What do you sell?</h2>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Select your primary fashion category to see yourself represented and pre-configure your onboarding portal parameters.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { id: "women_fashion", label: "Women's Fashion", desc: "Kurtis, Sarees, Dresses", icon: Sparkles },
              { id: "mens_fashion", label: "Men's Fashion", desc: "Shirts, Kurtas, Vests", icon: Shirt },
              { id: "jewellery", label: "Jewellery", desc: "Necklaces, Rings, Bangles", icon: Crown },
              { id: "multi_category", label: "Multi-category", desc: "Apparel & Accessories", icon: Layers },
            ].map((cat) => {
              const isSelected = storeCategory === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setStoreCategory(cat.id as any);
                    formRef.current?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={cn(
                    "flex flex-col items-center justify-between p-6 rounded-2xl border text-center transition-all duration-300 group cursor-pointer h-full",
                    isSelected
                      ? "bg-white border-hive-gold shadow-[0_8px_25px_rgba(140,122,90,0.06)] ring-1 ring-hive-gold"
                      : "bg-white/40 border-hive-border/50 hover:bg-white hover:border-hive-gold/40 hover:shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                    isSelected ? "bg-hive-gold/10 text-hive-gold scale-110" : "bg-stone-50 text-stone-500 group-hover:scale-105 group-hover:bg-hive-gold/5 group-hover:text-hive-gold"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="mt-4 space-y-1">
                    <span className="text-xs font-bold text-hive-dark block tracking-tight">
                      {cat.label}
                    </span>
                    <span className="text-[9px] text-stone-400 font-semibold block leading-tight">
                      {cat.desc}
                    </span>
                  </div>
                  <div className="mt-4 pt-1">
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-0.5",
                      isSelected ? "text-hive-gold" : "text-stone-400 group-hover:text-stone-600"
                    )}>
                      {isSelected ? "Selected ✓" : "Choose"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────
          3. WHY HIVE IS DIFFERENT SECTION
          ────────────────────────────────────────────────── */}
      <section className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-20 text-center space-y-12">
        <div className="space-y-2">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-hive-gold">OUR MOAT</span>
          <h2 className="text-3xl font-serif font-light text-hive-dark uppercase tracking-tight">Why Hive Is Different</h2>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            We are built to empower fashion businesses with localized reach, same-day delivery, and high shopper conversions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-hive-border/50 rounded-3xl p-8 text-left space-y-4 hover:shadow-[0_8px_30px_rgba(140,122,90,0.04)] hover:border-hive-gold/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-hive-gold/10 flex items-center justify-center text-hive-gold font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-serif font-semibold text-hive-dark">Sell Nearby</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-sans">
              Reach customers within your delivery radius. Focus local marketing directly to high-intent buyers in Kochi&apos;s prime sub-zones.
            </p>
          </div>

          <div className="bg-white border border-hive-border/50 rounded-3xl p-8 text-left space-y-4 hover:shadow-[0_8px_30px_rgba(140,122,90,0.04)] hover:border-hive-gold/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-hive-gold/10 flex items-center justify-center text-hive-gold font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-serif font-semibold text-hive-dark">Deliver Today</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-sans">
              Orders dispatched in hours, not days. Offer your local customer base instant gratification with our integrated courier dispatch network.
            </p>
          </div>

          <div className="bg-white border border-hive-border/50 rounded-3xl p-8 text-left space-y-4 hover:shadow-[0_8px_30px_rgba(140,122,90,0.04)] hover:border-hive-gold/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-hive-gold/10 flex items-center justify-center text-hive-gold font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-serif font-semibold text-hive-dark">Grow Average Order Value</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-sans">
              Cross-sell products from your catalog with complete-the-look recommendations. Hive automatically styles outfits to push basket sizes higher.
            </p>
          </div>
        </div>
      </section>



      {/* ──────────────────────────────────────────────────
          5. HOW HIVE WORKS (4 STEPS)
          ────────────────────────────────────────────────── */}
      <section className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-20">
        <div className="text-center space-y-12">
          <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-hive-gold">STEP BY STEP</span>
            <h2 className="text-3xl font-serif font-light text-hive-dark uppercase tracking-tight">How It Works</h2>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Going live is fast. Build your setup and start receiving local orders in four simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-left">
            {[
              { step: "01", title: "Register Store", desc: "Create your merchant profile, specify your category model, and pin your physical store location details on our interactive map." },
              { step: "02", title: "List Catalog", desc: "Upload product listings, add sizing details, set local store inventory levels, and define your custom service radius." },
              { step: "03", title: "Receive Orders", desc: "Get real-time alerts as local customers discover and purchase from your store catalogue in their immediate delivery radius." },
              { step: "04", title: "Hourly Dispatch", desc: "Pack the order. Hive's integrated logistics partner courier picks it up and delivers it same-day to the buyer's doorstep." },
            ].map((step, idx) => (
              <div key={idx} className="space-y-3 relative group">
                <span className="text-3xl font-serif font-black text-hive-gold/30 block group-hover:text-hive-gold transition-colors">
                  {step.step}
                </span>
                <h4 className="text-sm font-bold text-hive-dark tracking-tight">{step.title}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-sans">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* ──────────────────────────────────────────────────
          7. REGISTRATION SUBMIT FORM (OR SIGN IN CTA)
          ────────────────────────────────────────────────── */}
      <section ref={formRef} className="w-full max-w-3xl mx-auto px-6 pt-20">
        {!isSignedIn ? (
          /* Sign In CTA Card for signed-out users */
          <div className="bg-white border border-hive-border/50 rounded-3xl p-8 md:p-10 shadow-[0_8px_30px_rgba(140,122,90,0.05)] text-center space-y-6 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-hive-gold/10 flex items-center justify-center text-hive-gold mx-auto">
              <Store className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-light text-hive-dark uppercase tracking-tight">Ready to Request Partnership?</h2>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                Sign in to your Hive account to submit your partnership request details, configure custom delivery options, and specify your store coordinates.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row justify-center gap-4 max-w-xs mx-auto">
              <Link href={getSignInUrl(`/become-seller?storeCategory=${storeCategory}&model=${sellerModel}`)} className="w-full">
                <Button variant="primary" className="w-full h-11 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 font-semibold tracking-[0.2em] text-[10px] uppercase rounded-xl transition-all">
                  Sign In to Account
                </Button>
              </Link>
              <Link href={getSignUpUrl(`/become-seller?storeCategory=${storeCategory}&model=${sellerModel}`)} className="w-full">
                <Button variant="outline" className="w-full h-11 border border-hive-gold text-hive-dark hover:bg-hive-cream tracking-[0.2em] text-[10px] font-semibold uppercase rounded-xl transition-all">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Onboarding Form for signed-in users */
          <form onSubmit={handleSubmit} className="bg-white border border-hive-border/60 rounded-3xl p-6 md:p-10 shadow-[0_8px_30px_rgba(140,122,90,0.05)] flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-serif font-light text-hive-dark pb-3 border-b border-hive-border/30 flex items-center gap-2">
                <Store className="w-5 h-5 text-hive-gold" /> Partnership Request Form
              </h2>
              <p className="text-xs text-stone-400 mt-1">Complete your request details to apply for store partnership on Hive.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-hive-gold" /> Merchant Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Silk & Zari Weaves"
                  value={boutiqueName}
                  onChange={(e) => {
                    setBoutiqueName(e.target.value);
                    if (touched.boutiqueName) validateField("boutiqueName", e.target.value);
                  }}
                  onBlur={(e) => handleBlur("boutiqueName", e.target.value)}
                  className={cn(
                    "w-full h-11 px-4 rounded-xl border text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:ring-1",
                    errors.boutiqueName && touched.boutiqueName
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-hive-border/50 focus:border-hive-gold focus:ring-hive-gold"
                  )}
                />
                {touched.boutiqueName && errors.boutiqueName && (
                  <span className="text-[12px] text-red-500 font-medium mt-1">{errors.boutiqueName}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-hive-gold" /> Owner Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Nair"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-hive-gold" /> Contact Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (touched.phone) validateField("phone", e.target.value);
                  }}
                  onBlur={(e) => handleBlur("phone", e.target.value)}
                  className={cn(
                    "w-full h-11 px-4 rounded-xl border text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:ring-1",
                    errors.phone && touched.phone
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-hive-border/50 focus:border-hive-gold focus:ring-hive-gold"
                  )}
                />
                {touched.phone && errors.phone && (
                  <span className="text-[12px] text-red-500 font-medium mt-1">{errors.phone}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-hive-gold" /> Delivery Radius (Km)
                </label>
                <select
                  value={deliveryRadiusKm}
                  onChange={(e) => setDeliveryRadiusKm(parseInt(e.target.value) || 15)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold font-medium"
                >
                  {[5, 8, 10, 15, 20, 25].map((km) => (
                    <option key={km} value={km}>
                      {km} km {km === 15 ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">
                  Store Category
                </label>
                <select
                  value={storeCategory}
                  onChange={(e: any) => setStoreCategory(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold font-medium"
                >
                  <option value="women_fashion">Women&apos;s Fashion</option>
                  <option value="mens_fashion">Men&apos;s Fashion</option>
                  <option value="jewellery">Jewellery</option>
                  <option value="multi_category">Multi-category Store</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">
                  Seller Model
                </label>
                <select
                  value={sellerModel}
                  onChange={(e: any) => {
                    setSellerModel(e.target.value);
                    if (touched.sellerModel) validateField("sellerModel", e.target.value);
                  }}
                  onBlur={(e) => handleBlur("sellerModel", e.target.value)}
                  className={cn(
                    "w-full h-11 px-4 rounded-xl border text-hive-dark bg-white text-xs transition-all duration-200 outline-none focus:ring-1 font-medium",
                    errors.sellerModel && touched.sellerModel
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-hive-border/50 focus:border-hive-gold focus:ring-hive-gold"
                  )}
                >
                  <option value="boutique">Merchant Store</option>
                  <option value="brand">Independent Brand</option>
                  <option value="multi_brand_store">Multi-brand Store</option>
                </select>
                {touched.sellerModel && errors.sellerModel && (
                  <span className="text-[12px] text-red-500 font-medium mt-1">{errors.sellerModel}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">
                  Area / Locality
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kaloor"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">
                  Service Type
                </label>
                <select
                  value={serviceType}
                  onChange={(e: any) => setServiceType(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold font-medium"
                >
                  <option value="ready_to_ship">Ready to Ship</option>
                  <option value="made_to_order">Made to Order</option>
                  <option value="alterations">Alterations</option>
                  <option value="custom_design">Custom Design</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5 text-hive-gold" /> Merchant Description & Speciality
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe your store's fabric specialization, bridal wear, custom stitching options..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-hive-gold" /> Physical Store Address
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Shop 12, Ground Floor, Central Mall, Kochi"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (touched.address) validateField("address", e.target.value);
                }}
                onBlur={(e) => handleBlur("address", e.target.value)}
                className={cn(
                  "w-full h-11 px-4 rounded-xl border text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:ring-1",
                  errors.address && touched.address
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                    : "border-hive-border/50 focus:border-hive-gold focus:ring-hive-gold"
                )}
              />
              {touched.address && errors.address && (
                <span className="text-[12px] text-red-500 font-medium mt-1">{errors.address}</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">
                Search Keywords (Comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Bridal Wear, Designer Sarees, Silk Sarees"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold"
              />
              <span className="text-[9px] text-stone-400 italic">
                * Enter up to 10 keywords, max 40 characters per keyword.
              </span>
            </div>

            {/* Store Location Coordinates Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-hive-border/30 pt-4">
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-hive-gold" /> Store Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  min="8.0"
                  max="13.0"
                  required
                  placeholder="e.g. 9.9312"
                  value={latitude || ""}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold"
                />
              </div>

              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-hive-gold" /> Store Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  min="74.0"
                  max="78.0"
                  required
                  placeholder="e.g. 76.2673"
                  value={longitude || ""}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  className="w-full h-11 px-4 rounded-xl border border-hive-border/50 text-hive-dark bg-white text-xs placeholder-stone-400 transition-all duration-200 outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold"
                />
              </div>
            </div>
            <span className="text-[9px] text-stone-400 italic block text-left">
              * Store coordinates must be within the Kerala boundary region (Latitude: 8.0 to 13.0, Longitude: 74.0 to 78.0).
            </span>

            <div className="flex gap-3 mt-4 pt-4 border-t border-hive-border/30">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 font-bold tracking-[0.2em] text-[10px] uppercase rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-hive-gold/10 hover:shadow-hive-gold/25 transition-all duration-300 animate-fadeIn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting request...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" /> Submit Partnership Request
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </section>

      <style>{`
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
