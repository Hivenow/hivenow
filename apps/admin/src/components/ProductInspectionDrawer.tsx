"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/api";
import { Button } from "@hive/ui";
import { 
  X, 
  Monitor, 
  Smartphone, 
  Scissors, 
  Compass, 
  CheckCircle2, 
  Save, 
  Check, 
  AlertTriangle, 
  Loader2,
  ListRestart,
  Crop
} from "lucide-react";
import { getVerticalConfig } from "@hive/types";
import { ImageCropModal } from "./ImageCropModal";

interface ProductInspectionDrawerProps {
  product: any;
  onClose: () => void;
  categories: any[];
}

export function ProductInspectionDrawer({ 
  product: initialProduct, 
  onClose,
  categories = [] 
}: ProductInspectionDrawerProps) {
  // Query full product details in case enriched data has missing specs
  const product = initialProduct;

  // Derive vertical configuration for specs and variant labels
  const verticalConfig = useMemo(() => {
    return getVerticalConfig(product?.verticalType);
  }, [product?.verticalType]);

  // Local Form state
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [categoryId, setCategoryId] = useState(product?.categoryId || "");
  
  // Seller BASE prices in Rupees (DB stores PAISE). Not rounded, so saving an
  // untouched ₹999.50 base does not silently become ₹1,000.
  const [basePrice, setBasePrice] = useState<number>((product?.basePrice ?? product?.price ?? 0) / 100);
  const [baseDiscountPrice, setBaseDiscountPrice] = useState<number | undefined>(
    product?.baseDiscountPrice ? product.baseDiscountPrice / 100 : undefined
  );

  // Sizing & Inventory
  const [sizes, setSizes] = useState<string[]>(product?.sizes || []);
  const [stockBySize, setStockBySize] = useState<Record<string, number>>(product?.stockBySize || {});

  // Fit & Silhouette
  const [fitRecommendation, setFitRecommendation] = useState<string>(product?.fitRecommendation || "true_to_size");
  const [silhouette, setSilhouette] = useState<string>(product?.silhouette || "regular_fit");

  // Tailoring Details
  const [material, setMaterial] = useState(product?.material || "");
  const [care, setCare] = useState(product?.care || "");
  const [origin, setOrigin] = useState(product?.origin || "");
  const [story, setStory] = useState(product?.story || "");
  const [occasion, setOccasion] = useState(product?.occasion || "");

  // Specifications (details record) - sanitized on init to valid vertical spec keys only
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const raw = product?.details || {};
    const config = getVerticalConfig(product?.verticalType);
    const allowed = new Set(config.specKeys);
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (allowed.has(k as any) && v) {
        sanitized[k] = String(v);
      }
    }
    return sanitized;
  });

  // Drawer options
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeAccordion, setActiveAccordion] = useState<string | null>("details");
  const [selectedSizePreview, setSelectedSizePreview] = useState<string>(sizes[0] || "");
  
  // Submit loading states
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Image crop modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState("");
  const [cropImageIndex, setCropImageIndex] = useState(0);
  const [cropRefreshKey, setCropRefreshKey] = useState(0);

  const openCropModal = useCallback((url: string, index: number) => {
    setCropImageUrl(url);
    setCropImageIndex(index);
    setCropModalOpen(true);
  }, []);

  // Images state (supports instant update on crop)
  const [images, setImages] = useState<string[]>(() => {
    return (product?.imageUrls && product.imageUrls.length > 0)
      ? product.imageUrls
      : (product?.images || []);
  });
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  useEffect(() => {
    const list = (product?.imageUrls && product.imageUrls.length > 0)
      ? product.imageUrls
      : (product?.images || []);
    setImages(list);
    setSelectedImageIndex(0);
  }, [product]);

  const handleCropComplete = useCallback((newUrl?: string, index?: number) => {
    setCropModalOpen(false);
    if (newUrl && typeof index === "number") {
      setImages(prev => {
        const next = [...prev];
        next[index] = newUrl;
        return next;
      });
    }
    setCropRefreshKey(k => k + 1);
  }, []);

  // Mutations
  const updateProductDetails = useMutation(api.adminProducts.updateProductDetailsAdmin);
  const approveProduct = useMutation(api.adminProducts.approveProductAdmin);
  const requestChangesProduct = useMutation(api.adminProducts.requestChangesProductAdmin);

  const safeImageIndex = selectedImageIndex < images.length ? selectedImageIndex : 0;
  const activeImage = images[safeImageIndex] || "";

  // Price split from the server pricing engine (boutique tier, platform config),
  // the same numbers checkout charges and the seller portal shows.
  const pricingBreakdown = useQuery(
    api.adminProducts.getProductPricingPreviewAdmin,
    product?._id && basePrice > 0 ? { productId: product._id, basePricePaise: Math.round(basePrice * 100) } : "skip"
  );
  const discountPricing = useQuery(
    api.adminProducts.getProductPricingPreviewAdmin,
    product?._id && baseDiscountPrice && baseDiscountPrice > 0
      ? { productId: product._id, basePricePaise: Math.round(baseDiscountPrice * 100) }
      : "skip"
  );

  // Storefront prices (rupees) for the PDP preview
  const previewCustomerPrices = useMemo(() => {
    const price = pricingBreakdown ? pricingBreakdown.customerPricePaise / 100 : 0;
    const discountPrice = baseDiscountPrice && discountPricing ? discountPricing.customerPricePaise / 100 : undefined;
    const discountPercent = discountPrice && price > 0 ? Math.round(((price - discountPrice) / price) * 100) : 0;
    return { price, discountPrice, discountPercent };
  }, [pricingBreakdown, discountPricing, baseDiscountPrice]);

  // Fit recommendations config
  const fitRecommendationConfig: Record<string, { label: string; advice: string }> = {
    runs_small: { label: "Runs Small", advice: "Consider ordering one size up." },
    true_to_size: { label: "True to Size", advice: "Fits as expected for standard sizing." },
    runs_large: { label: "Runs Large", advice: "Consider ordering one size down." },
  };

  const silhouetteConfig: Record<string, string> = {
    slim_fit: "Slim Fit — tailored outline, cut close to the body",
    regular_fit: "Regular Fit — standard drape, classic silhouette",
    relaxed_fit: "Relaxed Fit — extra room, comfortable cut",
    oversized: "Oversized Cut — intentionally loose and baggy",
  };

  // Toggle size selection in editor
  const handleSizeToggle = (size: string) => {
    if (sizes.includes(size)) {
      setSizes(sizes.filter(s => s !== size));
      const newStock = { ...stockBySize };
      delete newStock[size];
      setStockBySize(newStock);
    } else {
      setSizes([...sizes, size]);
      setStockBySize({ ...stockBySize, [size]: 1 }); // default stock to 1
    }
  };

  // Handle stock changes
  const handleStockChange = (size: string, qty: number) => {
    setStockBySize({
      ...stockBySize,
      [size]: Math.max(0, qty)
    });
  };

  // The spec editor only knows the vertical's generic keys, while a category
  // with its own attribute set stores other keys (e.g. Bedsheet: fabric,
  // sheetType). Details are sent only once an admin edits a spec, and merged
  // over the product's stored details, so approving never drops attributes
  // the editor cannot show.
  const [detailsDirty, setDetailsDirty] = useState(false);

  // Handle details specs change
  const handleDetailChange = (key: string, value: string) => {
    setDetailsDirty(true);
    setDetails({
      ...details,
      [key]: value
    });
  };

  // Save changes mutation trigger
  const handleSave = async (silent = false) => {
    setSaving(true);
    try {
      let cleanedDetails: Record<string, string> | undefined;
      if (detailsDirty) {
        // Stored details first, then the edited vertical specs on top.
        const allowedKeys = new Set(verticalConfig.specKeys);
        const merged: Record<string, string> = { ...(product?.details || {}) };
        Object.entries(details).forEach(([k, v]) => {
          if (!allowedKeys.has(k as any)) return;
          if (v && v.trim()) merged[k] = v.trim();
          else delete merged[k];
        });
        cleanedDetails = merged;
      }

      await updateProductDetails({
        id: product._id,
        name,
        description,
        categoryId: categoryId as any,
        price: Math.round(basePrice * 100),
        discountPrice: baseDiscountPrice && baseDiscountPrice > 0 ? Math.round(baseDiscountPrice * 100) : undefined,
        sizes,
        stockBySize,
        details: cleanedDetails,
        fitRecommendation: fitRecommendation as any,
        silhouette: silhouette as any,
        material: material || undefined,
        care: care || undefined,
        origin: origin || undefined,
        story: story || undefined,
        occasion: occasion || undefined,
      });

      if (!silent) {
        alert("Product details updated successfully!");
      }
      return true;
    } catch (err: any) {
      alert("Failed to save product details: " + err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Approve product mutation trigger
  const handleApprove = async () => {
    const isSaved = await handleSave(true);
    if (!isSaved) return;

    if (!confirm("Are you sure you want to approve this product listing to go live?")) return;

    setApproving(true);
    try {
      await approveProduct({ id: product._id });
      alert("Product listing approved and published successfully!");
      onClose();
    } catch (err: any) {
      alert("Failed to approve product: " + err.message);
    } finally {
      setApproving(false);
    }
  };

  // Request changes mutation trigger
  const handleRequestChanges = async () => {
    const notes = prompt("Enter specific instructions or reasons for the requested modifications (minimum 10 characters):");
    if (notes === null) return; // User cancelled
    if (notes.trim().length < 10) {
      alert("Error: Rejection notes must be at least 10 characters long.");
      return;
    }

    setRejecting(true);
    try {
      await requestChangesProduct({ id: product._id, notes: notes.trim() });
      alert("Changes requested successfully.");
      onClose();
    } catch (err: any) {
      alert("Failed to request changes: " + err.message);
    } finally {
      setRejecting(false);
    }
  };

  // Resolve category name in real time
  const categoryName = useMemo(() => {
    const cat = categories.find(c => c._id === categoryId);
    return cat ? cat.name : "Uncategorized";
  }, [categoryId, categories]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end font-sans">
      <div className="w-full max-w-full md:max-w-[90vw] xl:max-w-[85vw] h-full bg-[#FCFAF8] shadow-2xl flex flex-col animate-[slideLeft_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards] border-l border-stone-200">
        
        {/* TOP BAR / NAVIGATION */}
        <div className="h-16 border-b border-stone-200/80 bg-white px-3 sm:px-6 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-xs sm:text-sm font-serif font-black text-hive-dark truncate max-w-[150px] sm:max-w-md">
                  Inspect & Edit: {product?.name}
                </h2>
                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border bg-amber-50 text-amber-700 border-amber-250 shrink-0">
                  {product?.approvalStatus || "Pending"}
                </span>
              </div>
              <p className="text-[10px] text-hive-text-muted font-medium truncate">
                Uploaded by {product?.boutiqueName}
              </p>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2.5">
            {/* Save Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave()}
              disabled={saving}
              className="h-9 px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 border-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Edits
            </Button>

            {/* Request Changes Action */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestChanges}
              disabled={rejecting}
              className="h-9 px-3.5 text-xs font-bold text-orange-650 hover:bg-orange-50 border-orange-250 flex items-center gap-1.5 cursor-pointer"
            >
              {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              Request Changes
            </Button>

            {/* Approve Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleApprove}
              disabled={approving}
              className="h-9 px-4 text-xs font-bold text-white bg-[#C59A5B] hover:bg-[#C59A5B]/90 border-transparent rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Approve Listing
            </Button>
          </div>
        </div>

        {/* WORKSPACE PANELS */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* LEFT PANEL: Live PDP Preview */}
          <div className="w-1/2 h-full flex flex-col bg-[#F3EFE9]/40 border-r border-stone-200/60 overflow-hidden relative">
            
            {/* PREVIEW CONTROLS */}
            <div className="h-12 border-b border-stone-200/50 bg-[#FAF8F5]/80 px-6 flex items-center justify-between shrink-0 select-none">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Storefront Customer PDP Preview
              </span>
              <div className="bg-stone-200/60 p-0.5 rounded-lg flex items-center gap-0.5">
                <button
                  onClick={() => setPreviewMode("desktop")}
                  className={`p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-bold ${
                    previewMode === "desktop" ? "bg-white text-stone-850 shadow-xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </button>
                <button
                  onClick={() => setPreviewMode("mobile")}
                  className={`p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-bold ${
                    previewMode === "mobile" ? "bg-white text-stone-850 shadow-xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>
            </div>

            {/* PREVIEW SCROLL CONTAINER */}
            <div className="flex-1 overflow-y-auto p-8 flex items-start justify-center">
              
              {/* DESKTOP LAYOUT PREVIEW */}
              {previewMode === "desktop" && (
                <div className="w-full max-w-4xl bg-white rounded-3xl border border-stone-200/40 p-8 shadow-xs flex flex-col gap-8">
                  <div className="grid grid-cols-12 gap-8 items-start">
                    
                    {/* Left Column: Image Gallery */}
                    <div className="col-span-7 flex flex-col gap-4">
                      <div className="aspect-[3/4] w-full rounded-2xl overflow-hidden bg-[#FAF8F5] border border-stone-100 relative group/hero">
                        {activeImage ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={activeImage} alt="" className="w-full h-full object-cover" />
                            {/* Crop button overlay */}
                            <button
                              onClick={() => openCropModal(activeImage, safeImageIndex)}
                              className="absolute top-3 right-3 p-2 rounded-xl bg-white/85 backdrop-blur-md border border-white/40 text-stone-700 hover:bg-white hover:text-amber-700 shadow-lg transition-all opacity-0 group-hover/hero:opacity-100 z-10 cursor-pointer"
                              title="Crop this image"
                            >
                              <Crop className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 gap-2">
                            <span className="text-3xl">📷</span>
                            <span className="text-xs font-medium">No Images Uploaded</span>
                          </div>
                        )}
                      </div>
                      
                      {images.length > 1 && (
                        <div className="grid grid-cols-4 gap-2">
                          {images.map((img: string, idx: number) => {
                            const isSelected = idx === safeImageIndex;
                            return (
                              <button
                                type="button"
                                key={idx}
                                onClick={() => setSelectedImageIndex(idx)}
                                className={`aspect-[3/4] rounded-lg overflow-hidden border relative group/thumb transition-all cursor-pointer p-0 text-left focus:outline-none ${
                                  isSelected
                                    ? "ring-2 ring-stone-900 border-stone-900 shadow-sm opacity-100"
                                    : "border-stone-200/60 bg-stone-50 opacity-70 hover:opacity-100 hover:border-stone-400"
                                }`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img} alt="" className="w-full h-full object-cover" />
                                {/* Crop button on thumbnail */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCropModal(img, idx);
                                  }}
                                  className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-white/85 backdrop-blur-md border border-white/30 text-stone-600 hover:bg-white hover:text-amber-700 shadow transition-all opacity-0 group-hover/thumb:opacity-100 z-10 cursor-pointer"
                                  title={`Crop image ${idx + 1}`}
                                >
                                  <Crop className="w-3 h-3" />
                                </button>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right Column: PDP Info */}
                    <div className="col-span-5 flex flex-col gap-5 text-left">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-700 leading-none">
                          {occasion ? occasion.toUpperCase() : "CASUAL"}
                        </span>
                        
                        <h1 className="text-base font-serif font-semibold text-stone-900 tracking-tight leading-snug">
                          {name || "Untitled Product"}
                        </h1>

                        <div className="flex items-baseline gap-2 pt-0.5">
                          <span className="text-sm font-bold text-stone-900">
                            ₹{previewCustomerPrices.price.toLocaleString("en-IN")}
                          </span>
                          {previewCustomerPrices.discountPrice && (
                            <>
                              <span className="text-xs text-stone-400 line-through font-normal">
                                ₹{previewCustomerPrices.discountPrice.toLocaleString("en-IN")}
                              </span>
                              <span className="text-[9px] font-bold text-amber-800 tracking-wider">
                                ({previewCustomerPrices.discountPercent}% OFF)
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-[11px] text-stone-500 font-medium pt-0.5">
                          from <span className="font-bold">{product?.boutiqueName || "Boutique Partner"}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 font-medium">
                          Fulfilled by a Verified Hive Partner
                        </div>
                      </div>

                      {/* Sizing Grid Selection */}
                      <div className="space-y-2 select-none border-t border-stone-100 pt-3">
                        <span className="text-[10px] font-bold text-stone-450 uppercase tracking-widest block">Choose Size</span>
                        <div className="flex flex-wrap gap-2">
                          {["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"].map(sz => {
                            const isAvailable = sizes.includes(sz);
                            const hasStock = (stockBySize[sz] || 0) > 0;
                            const isSelected = selectedSizePreview === sz;
                            return (
                              <button
                                key={sz}
                                onClick={() => isAvailable && setSelectedSizePreview(sz)}
                                disabled={!isAvailable}
                                className={`h-9 px-3 rounded-lg border text-[11px] font-bold transition-all ${
                                  !isAvailable ? "border-stone-100 text-stone-300 line-through opacity-50 bg-stone-50" :
                                  !hasStock ? "border-stone-200 text-stone-400 border-dashed bg-white cursor-not-allowed" :
                                  isSelected ? "border-stone-900 bg-stone-900 text-white" :
                                  "border-stone-250 bg-white text-stone-850 hover:bg-stone-50"
                                }`}
                              >
                                {sz}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* True to Size & Silhouette badge */}
                      <div className="space-y-2 border-t border-stone-100 pt-3 text-[11px] text-stone-600 font-medium">
                        {fitRecommendation && fitRecommendationConfig[fitRecommendation] && (
                          <div className="flex items-start gap-2 bg-[#FAF8F5] border border-[#EAE1D4]/40 p-2.5 rounded-xl">
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-bold text-stone-855 uppercase text-[9px] tracking-wider">
                                {fitRecommendationConfig[fitRecommendation].label}
                              </p>
                              <p className="text-[10px] text-stone-500 mt-0.5">
                                {fitRecommendationConfig[fitRecommendation].advice}
                              </p>
                            </div>
                          </div>
                        )}
                        {silhouette && silhouetteConfig[silhouette] && (
                          <div className="flex items-center gap-2 bg-stone-50/65 border border-stone-150 p-2.5 rounded-xl">
                            <span className="text-amber-700 text-xs shrink-0">👕</span>
                            <span className="text-[10px] font-medium text-stone-500">
                              {silhouetteConfig[silhouette]}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Detail Accordions */}
                      <div className="border-t border-stone-100 pt-3 text-left">
                        {[
                          { key: "details", label: "Product Details", check: true },
                          { key: "care", label: "Wash & Care", check: !!care },
                          { key: "return", label: "Delivery & Return Policy", check: true }
                        ].map(acc => {
                          if (!acc.check) return null;
                          const isOpen = activeAccordion === acc.key;
                          return (
                            <div key={acc.key} className="border-b border-stone-100">
                              <button
                                onClick={() => setActiveAccordion(isOpen ? null : acc.key)}
                                className="w-full py-3 flex items-center justify-between text-xs font-bold text-stone-800 uppercase tracking-wider focus:outline-none"
                              >
                                {acc.label}
                                <span>{isOpen ? "−" : "+"}</span>
                              </button>

                              {isOpen && (
                                <div className="pb-4 pt-1 text-[11px] text-stone-600 leading-relaxed font-medium space-y-3">
                                  {acc.key === "details" && (
                                    <>
                                      <p>{description || "No description provided."}</p>
                                      {(Object.entries(verticalConfig.specLabels) as [string, string][]).some(([k]) => details[k]) && (
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-2">
                                          {(Object.entries(verticalConfig.specLabels) as [string, string][]).map(([k, label]) => {
                                            const val = details[k]?.trim();
                                            if (!val) return null;
                                            return (
                                              <div key={k} className="flex flex-col border-b border-stone-50 pb-1.5">
                                                <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold mb-0.5">{label}</span>
                                                <span className="text-[11px] text-stone-850 font-bold">{val}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {acc.key === "care" && <p>{care}</p>}
                                  {acc.key === "return" && (
                                    <p>Returns accepted within 24 hours of delivery. Standard delivery rates apply based on location.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {/* MOBILE LAYOUT PREVIEW */}
              {previewMode === "mobile" && (
                <div className="w-[360px] min-h-[640px] bg-white rounded-[40px] border-[12px] border-stone-900 shadow-2xl relative overflow-hidden flex flex-col font-sans">
                  
                  {/* Speaker and Camera notch mockup */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-stone-900 rounded-b-xl z-30 flex items-center justify-center">
                    <div className="w-10 h-1 bg-stone-800 rounded-full mb-1"></div>
                  </div>

                  {/* Mobile content scroll */}
                  <div className="flex-1 overflow-y-auto px-4 py-8 space-y-4">
                    
                    {/* Gallery */}
                    <div className="aspect-[3/4] w-full rounded-2xl overflow-hidden bg-stone-100 border relative">
                      {activeImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={activeImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 gap-1.5">
                          <span className="text-xl">📷</span>
                          <span className="text-[10px] font-bold">No Image</span>
                        </div>
                      )}
                    </div>

                    {/* Mobile Thumbnails */}
                    {images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {images.map((img: string, idx: number) => {
                          const isSelected = idx === safeImageIndex;
                          return (
                            <button
                              type="button"
                              key={idx}
                              onClick={() => setSelectedImageIndex(idx)}
                              className={`w-12 h-16 rounded-md overflow-hidden shrink-0 border relative transition-all cursor-pointer p-0 ${
                                isSelected
                                  ? "ring-2 ring-stone-900 border-stone-900 opacity-100"
                                  : "border-stone-200 opacity-60 hover:opacity-100"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt="" className="w-full h-full object-cover" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Main Title Details */}
                    <div className="space-y-0.5 text-left select-none">
                      <span className="text-[8px] font-extrabold uppercase tracking-widest text-amber-700 leading-none">
                        {occasion ? occasion.toUpperCase() : "CASUAL"}
                      </span>
                      <h1 className="text-sm font-serif font-black text-stone-905 leading-tight">
                        {name || "Untitled Product"}
                      </h1>
                      
                      <div className="flex items-baseline gap-1.5 pt-0.5">
                        <span className="text-xs font-bold text-stone-900">
                          ₹{previewCustomerPrices.price.toLocaleString("en-IN")}
                        </span>
                        {previewCustomerPrices.discountPrice && (
                          <>
                            <span className="text-[10px] text-stone-400 line-through">
                              ₹{previewCustomerPrices.discountPrice.toLocaleString("en-IN")}
                            </span>
                            <span className="text-[8px] font-bold text-amber-805">
                              ({previewCustomerPrices.discountPercent}% OFF)
                            </span>
                          </>
                        )}
                      </div>

                      <div className="text-[10px] text-stone-600 font-medium">
                        from <span className="font-bold">{product?.boutiqueName || "Boutique Partner"}</span>
                      </div>
                    </div>

                    {/* Sizes Selection */}
                    <div className="space-y-1.5 select-none border-t pt-3 text-left">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Choose Size</span>
                      <div className="flex flex-wrap gap-1.5">
                        {["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"].map(sz => {
                          const isAvailable = sizes.includes(sz);
                          const hasStock = (stockBySize[sz] || 0) > 0;
                          const isSelected = selectedSizePreview === sz;
                          return (
                            <button
                              key={sz}
                              onClick={() => isAvailable && setSelectedSizePreview(sz)}
                              disabled={!isAvailable}
                              className={`h-7 px-2.5 rounded-md border text-[9px] font-bold transition-all ${
                                !isAvailable ? "border-stone-100 text-stone-300 line-through opacity-50 bg-stone-50" :
                                !hasStock ? "border-stone-200 text-stone-400 border-dashed bg-white" :
                                isSelected ? "border-stone-900 bg-stone-900 text-white" :
                                "border-stone-250 bg-white text-stone-850"
                              }`}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fit & Silhouette */}
                    <div className="space-y-1.5 border-t pt-3 text-left text-[9px] text-stone-600">
                      {fitRecommendation && fitRecommendationConfig[fitRecommendation] && (
                        <div className="flex items-start gap-2 bg-[#FAF8F5] border border-[#EAE1D4]/40 p-2 rounded-lg">
                          <CheckCircle2 className="w-3 h-3 text-amber-700 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-bold text-stone-800 uppercase text-[8px] tracking-wider">
                              {fitRecommendationConfig[fitRecommendation].label}
                            </p>
                            <p className="text-[9px] text-stone-500 mt-0.5">
                              {fitRecommendationConfig[fitRecommendation].advice}
                            </p>
                          </div>
                        </div>
                      )}
                      {silhouette && silhouetteConfig[silhouette] && (
                        <div className="flex items-center gap-1.5 bg-stone-50/65 border border-stone-150 p-2 rounded-lg">
                          <span className="text-amber-750 text-[10px] shrink-0">👕</span>
                          <span className="text-[9px] text-stone-500">
                            {silhouetteConfig[silhouette]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Product Details Specs Table */}
                    <div className="border-t pt-3 text-left space-y-2">
                      <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-stone-450">Product Details</h4>
                      <p className="text-[10px] text-stone-550 leading-normal">{description || "No description provided."}</p>
                      
                      {(Object.entries(verticalConfig.specLabels) as [string, string][]).some(([k]) => details[k]) && (
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-50">
                          {(Object.entries(verticalConfig.specLabels) as [string, string][]).map(([k, label]) => {
                            const val = details[k]?.trim();
                            if (!val) return null;
                            return (
                              <div key={k} className="flex flex-col border-b border-stone-50 pb-1">
                                <span className="text-[8px] uppercase tracking-wider text-stone-400 font-bold mb-0.5">{label}</span>
                                <span className="text-[10px] text-stone-850 font-bold truncate">{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>

          {/* RIGHT PANEL: Editor Form */}
          <div className="w-1/2 h-full bg-white flex flex-col overflow-hidden">
            
            {/* EDITOR TAB HEADER */}
            <div className="h-12 border-b border-stone-200/50 bg-[#FAF8F5]/80 px-6 flex items-center shrink-0 select-none">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Listing Details Editor
              </span>
            </div>

            {/* EDITOR FORM SCROLL */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
              
              {/* SECTION: BASIC DETAILS */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  1. Basic Details
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Product Name</label>
                    <input 
                      type="text" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-850"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Category</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-850 cursor-pointer"
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat: any) => (
                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Occasion Tag</label>
                    <input 
                      type="text" 
                      value={occasion} 
                      onChange={(e) => setOccasion(e.target.value)}
                      placeholder="e.g. Wedding, Casual"
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-850"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Description</label>
                    <textarea 
                      rows={3} 
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-850 resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: PRICING */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  2. Pricing Model (Rupees)
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Base Price (Seller's payout)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-stone-400 text-xs font-bold">₹</span>
                      <input 
                        type="number" 
                        value={basePrice} 
                        step="0.01"
                        onChange={(e) => setBasePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full pl-7 pr-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-855"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Base Discount Price (Optional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-stone-400 text-xs font-bold">₹</span>
                      <input 
                        type="number" 
                        value={baseDiscountPrice || ""} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setBaseDiscountPrice(val > 0 ? val : undefined);
                        }}
                        className="w-full pl-7 pr-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-855"
                      />
                    </div>
                  </div>
                </div>

                {pricingBreakdown && (
                  <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Storefront Display Price</span>
                        <p className="text-sm font-bold text-stone-900 font-sans">{formatPaise(pricingBreakdown.customerPricePaise)}</p>
                        <dl className="space-y-0.5 text-[11px] text-stone-500">
                          <PriceRow label="Base price" paise={Math.round(basePrice * 100)} />
                          <PriceRow label="Handling fee" paise={pricingBreakdown.handlingChargePaise} />
                          <PriceRow label="Platform fee" paise={pricingBreakdown.platformFeePaise} />
                          <PriceRow label="GST on fees" paise={pricingBreakdown.platformChargesGstPaise} />
                        </dl>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Seller Net Payout</span>
                        <p className="text-sm font-bold text-emerald-700 font-sans">{formatPaise(pricingBreakdown.sellerPayoutPaise)}</p>
                        <dl className="space-y-0.5 text-[11px] text-stone-500">
                          <PriceRow label="Base price" paise={Math.round(basePrice * 100)} />
                          <PriceRow
                            label={`Commission (${pricingBreakdown.sellerCommissionPercent}%)`}
                            paise={-pricingBreakdown.sellerCommissionPaise}
                          />
                          <PriceRow label="GST on commission" paise={-pricingBreakdown.sellerCommissionGstPaise} />
                        </dl>
                      </div>
                    </div>
                    <p className="mt-2.5 pt-2 border-t border-stone-200/80 text-[10px] text-stone-400">
                      {pricingBreakdown.tierName} tier rates for this boutique
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION: INVENTORY AND SIZES */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  3. Size Inventory & Stock Levels
                </h3>

                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Available Sizes (Click to Toggle)</span>
                  <div className="flex flex-wrap gap-2">
                    {["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"].map(sz => {
                      const active = sizes.includes(sz);
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleSizeToggle(sz)}
                          className={`h-8 px-3 rounded-lg border text-xs font-bold transition-all ${
                            active ? "bg-stone-900 border-stone-900 text-white shadow-2xs" : "bg-white border-stone-200 text-stone-500 hover:bg-slate-50"
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>

                  {sizes.length > 0 && (
                    <div className="border border-stone-200/60 rounded-xl overflow-hidden mt-3">
                      <table className="w-full text-xs text-left border-collapse bg-slate-50/50">
                        <thead>
                          <tr className="border-b border-stone-150 text-[10px] text-stone-400 uppercase tracking-widest font-bold font-mono">
                            <th className="px-4 py-2 bg-slate-50">Size</th>
                            <th className="px-4 py-2 bg-slate-50">Stock Level (Units)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sizes.map(sz => (
                            <tr key={sz} className="border-b border-stone-100 last:border-0 bg-white">
                              <td className="px-4 py-2 font-bold text-stone-850">{sz}</td>
                              <td className="px-4 py-2">
                                <input
                                  type="number"
                                  value={stockBySize[sz] ?? 0}
                                  onChange={(e) => handleStockChange(sz, parseInt(e.target.value) || 0)}
                                  className="w-24 px-2.5 py-1 border border-stone-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#C59A5B]"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: STYLING AND FIT Badging */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  4. Fit Recommendation & Silhouette
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Fit Recommendation</label>
                    <select
                      value={fitRecommendation}
                      onChange={(e) => setFitRecommendation(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-855 cursor-pointer"
                    >
                      <option value="true_to_size">True to Size</option>
                      <option value="runs_small">Runs Small</option>
                      <option value="runs_large">Runs Large</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Silhouette Shape</label>
                    <select
                      value={silhouette}
                      onChange={(e) => setSilhouette(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-855 cursor-pointer"
                    >
                      <option value="regular_fit">Regular Fit</option>
                      <option value="slim_fit">Slim Fit</option>
                      <option value="relaxed_fit">Relaxed Fit</option>
                      <option value="oversized">Oversized Cut</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: TAILORING DETAILS */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  5. Tailoring details & Craft
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Fabric Material</label>
                    <input 
                      type="text" 
                      value={material} 
                      onChange={(e) => setMaterial(e.target.value)}
                      placeholder="e.g. 100% Cotton, Pure Silk"
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Craft / Origin</label>
                    <input 
                      type="text" 
                      value={origin} 
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g. Handwoven in Banaras"
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B]"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Wash & Care Instructions</label>
                    <input 
                      type="text" 
                      value={care} 
                      onChange={(e) => setCare(e.target.value)}
                      placeholder="e.g. Dry Clean Only, Gentle Hand Wash"
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B]"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Product Story</label>
                    <textarea 
                      rows={2} 
                      value={story} 
                      onChange={(e) => setStory(e.target.value)}
                      placeholder="The heritage or inspiration behind this creation"
                      className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: SPECIFICATIONS RECORD DETAILS */}
              <div className="space-y-4 pt-2 pb-12">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59A5B] border-b pb-1">
                  6. Technical Specifications (Details)
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {(Object.entries(verticalConfig.specLabels) as [string, string][]).map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">{label}</label>
                      <input 
                        type="text" 
                        value={details[key] || ""} 
                        onChange={(e) => handleDetailChange(key, e.target.value)}
                        placeholder={`e.g. ${label} description`}
                        className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C59A5B] bg-white text-stone-855"
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* STICKY MOBILE ACTION BAR (<md) */}
        <div className="md:hidden sticky bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200 p-3 flex items-center justify-between gap-2 shadow-lg shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave()}
            disabled={saving}
            className="flex-1 h-9 text-[11px] font-bold text-slate-700 hover:bg-slate-50 border-slate-200 flex items-center justify-center gap-1 cursor-pointer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestChanges}
            disabled={rejecting}
            className="flex-1 h-9 text-[11px] font-bold text-orange-650 hover:bg-orange-50 border-orange-250 flex items-center justify-center gap-1 cursor-pointer"
          >
            {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            Changes
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 h-9 text-[11px] font-bold text-white bg-[#C59A5B] hover:bg-[#C59A5B]/90 border-transparent rounded-xl flex items-center justify-center gap-1 cursor-pointer shadow-sm"
          >
            {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Approve
          </Button>
        </div>

      </div>

      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => setCropModalOpen(false)}
        imageUrl={cropImageUrl}
        imageIndex={cropImageIndex}
        productId={product?._id || ""}
        productName={product?.name || ""}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}

function formatPaise(paise: number) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PriceRow({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-mono tabular-nums">{paise < 0 ? "−" : ""}{formatPaise(Math.abs(paise))}</dd>
    </div>
  );
}
