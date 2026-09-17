"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button, Card, CardContent, Modal, cn } from "@hive/ui";
import { ProductInspectionDrawer } from "@/components/ProductInspectionDrawer";
import { ImageCropModal } from "@/components/ImageCropModal";
import { useMetricsBucket } from "@/hooks/useMetricsBucket";

import { 
  Loader2, 
  Search, 
  Filter, 
  ShieldAlert, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  HelpCircle, 
  Package, 
  ArrowUpRight, 
  Ban,
  Building2,
  ChevronDown,
  Store,
  Activity,
  CheckCircle2,
  XCircle,
  Info,
  Trash2,
  Crop
} from "lucide-react";

const MODERATION_CATEGORIES = [
  { value: "COPYRIGHT", label: "Copyright Infringement" },
  { value: "POLICIES", label: "Policy Violation" },
  { value: "COUNTERFEIT", label: "Counterfeit/Replica Item" },
  { value: "LOW_QUALITY_IMAGES", label: "Low Quality Photography" },
  { value: "PROHIBITED_ITEM", label: "Prohibited Goods" },
  { value: "PRICE_MANIPULATION", label: "Price Manipulation" },
  { value: "OTHER", label: "Other Policy Issue" }
];

export default function AdminProductsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedBoutique, setSelectedBoutique] = useState("all");
  const [statusTab, setStatusTab] = useState<"all" | "active" | "inactive" | "out_of_stock" | "recently_created" | "moderated" | "needs_review">("all");
  const [excludeTestData, setExcludeTestData] = useState(true);
  const [sortBy, setSortBy] = useState<"recently_uploaded" | "lowest_quality" | "highest_claims" | "highest_revenue" | "highest_risk">("recently_uploaded");
  
  // Boutique Dropdown Search State
  const [isBoutiqueDropdownOpen, setIsBoutiqueDropdownOpen] = useState(false);
  const [boutiqueSearch, setBoutiqueSearch] = useState("");

  // Quality check modal state
  const [qualityCheckProduct, setQualityCheckProduct] = useState<any>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Close boutique dropdown on click outside
  useEffect(() => {
    if (!isBoutiqueDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".boutique-combobox")) {
        setIsBoutiqueDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isBoutiqueDropdownOpen]);

  // Read URL params (e.g. ?status=needs_review from dashboard links)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const statusParam = params.get("status");
      if (statusParam) {
        setStatusTab(statusParam as any);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, []);

  const boutiques = useQuery(api.boutiques.getBoutiques, { excludeTestData });
  const products = useQuery(api.adminProducts.getAdminProducts, {
    searchTerm: debouncedSearch || undefined,
    boutiqueId: selectedBoutique === "all" ? undefined : selectedBoutique as any,
    status: statusTab === "all" ? undefined : statusTab,
    excludeTestData,
    sortBy,
  });

  // Bucketed clock: this query was observed re-running every ~51 seconds
  // with no data change while this page was open. See hooks/useMetricsBucket.
  const nowBucket = useMetricsBucket();
  const kpis = useQuery(api.adminProducts.getCatalogDashboardMetricsAdmin, { nowBucket });
  const categories = useQuery(api.categories.getCategories, {});

  const deactivateProduct = useMutation(api.adminProducts.deactivateProductAdmin);
  const reactivateProduct = useMutation(api.adminProducts.reactivateProductAdmin);
  const toggleProductHidden = useMutation(api.adminProducts.toggleProductHiddenAdmin);
  const approveProduct = useMutation(api.adminProducts.approveProductAdmin);
  const requestChangesProduct = useMutation(api.adminProducts.requestChangesProductAdmin);
  const deleteProductAdmin = useMutation(api.adminProducts.deleteProductAdmin);

  const handleApproveProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to approve this product listing to go live?")) return;
    try {
      await approveProduct({ id: productId as any });
      alert("Product approved successfully!");
    } catch (err: any) {
      alert("Failed to approve product: " + err.message);
    }
  };

  const handleRequestChangesProduct = async (productId: string) => {
    const notes = prompt("Enter specific instructions/reasons for requested changes (minimum 10 characters):");
    if (notes === null) return; // User cancelled
    if (notes.trim().length < 10) {
      alert("Error: Rejection/Changes requested feedback must be at least 10 characters long.");
      return;
    }
    try {
      await requestChangesProduct({ id: productId as any, notes: notes.trim() });
      alert("Changes requested successfully.");
    } catch (err: any) {
      alert("Failed to submit request: " + err.message);
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"deactivate" | "reactivate" | "hide" | "unhide" | "delete" | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [moderationCategory, setModerationCategory] = useState("COPYRIGHT");
  const [submitting, setSubmitting] = useState(false);
  const [inspectProduct, setInspectProduct] = useState<any>(null);

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<any>(null);
  const moderationHistory = useQuery(
    api.adminProducts.getProductModerationHistory,
    historyProduct ? { productId: historyProduct._id } : "skip"
  );

  // Image Crop Modal State (for moderation history modal)
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState("");
  const [cropImageIndex, setCropImageIndex] = useState(0);
  const [cropProductId, setCropProductId] = useState("");
  const [cropProductName, setCropProductName] = useState("");

  const openActionModal = (product: any, action: "deactivate" | "reactivate" | "hide" | "unhide" | "delete") => {
    setSelectedProduct(product);
    setModalAction(action);
    setReason("");
    setModerationCategory("COPYRIGHT");
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !modalAction) return;

    if (reason.trim().length < 10) {
      alert("Administrative reason must be at least 10 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      if (modalAction === "deactivate") {
        await deactivateProduct({
          productId: selectedProduct._id,
          reason,
        });
        alert("Product has been deactivated successfully.");
      } else if (modalAction === "reactivate") {
        await reactivateProduct({
          productId: selectedProduct._id,
          reason,
        });
        alert("Product has been reactivated successfully.");
      } else if (modalAction === "hide") {
        await toggleProductHidden({
          productId: selectedProduct._id,
          adminHidden: true,
          moderationCategory,
          reason,
        });
        alert("Product has been hidden and moderated.");
      } else if (modalAction === "unhide") {
        await toggleProductHidden({
          productId: selectedProduct._id,
          adminHidden: false,
          reason,
        });
        alert("Product moderation has been lifted.");
      } else if (modalAction === "delete") {
        await deleteProductAdmin({
          productId: selectedProduct._id,
          reason,
        });
        alert("Product and associated R2 media have been permanently deleted.");
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert("Failed to complete administrative action: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  function formatCurrency(paise: number) {
    return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  if (boutiques === undefined || products === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading catalog control tower...</p>
      </div>
    );
  }

  // Filter boutiques by search query
  const filteredBoutiques = (boutiques || []).filter(b => 
    b.boutiqueName.toLowerCase().includes(boutiqueSearch.toLowerCase())
  );
  const currentBoutique = selectedBoutique === "all" 
    ? { boutiqueName: "All Boutiques" } 
    : boutiques?.find(b => b._id === selectedBoutique);

  return (
    <div className="flex flex-col gap-6 text-left font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 w-full">
        <div>
          <h1 className="text-3xl font-serif font-black text-hive-dark">Catalog Control Tower</h1>
          <p className="text-sm text-hive-text-muted">Monitor merchant trust, listing quality, inventory stock risks, and delivered revenue.</p>
        </div>
      </div>

      {/* KPI Dashboard Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Catalog Health */}
        <Card className="border border-hive-border bg-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider">Catalog Health Score</span>
              <span className="text-2xl font-serif font-black text-hive-dark mt-1">
                {kpis === undefined ? "..." : `${kpis.catalogHealthScore}/100`}
              </span>
            </div>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              kpis === undefined ? "bg-slate-100" :
              kpis.catalogHealthScore >= 90 ? "bg-green-100 text-green-700" :
              kpis.catalogHealthScore >= 75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            )}>
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  kpis === undefined ? "w-0" :
                  kpis.catalogHealthScore >= 90 ? "bg-green-500" :
                  kpis.catalogHealthScore >= 75 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: kpis ? `${kpis.catalogHealthScore}%` : "0%" }}
              />
            </div>
            <span className="text-[10px] text-hive-text-muted font-medium">Weighted overall platform listing completeness score</span>
          </div>
        </Card>

        {/* Revenue at Risk */}
        <Card className="border border-hive-border bg-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider">Revenue at Risk (30d)</span>
              <span className="text-2xl font-serif font-black text-hive-dark mt-1">
                {kpis === undefined ? "..." : formatCurrency(kpis.revenueAtRisk)}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-red-50 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[10px] text-hive-text-muted font-medium">Revenue from drafts, moderated, or quality score &lt; 60 listings</span>
          </div>
        </Card>

        {/* Failing Quality Gates */}
        <Card className="border border-hive-border bg-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider">Failing Quality Gates</span>
              <span className="text-2xl font-serif font-black text-hive-dark mt-1">
                {kpis === undefined ? "..." : `${kpis.failingQualityGateCount} product(s)`}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[10px] text-hive-text-muted font-medium">Active listings with completeness score under 100%</span>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="border border-hive-border bg-white shadow-sm rounded-2xl relative z-30 !overflow-visible">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between !overflow-visible">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-hive-text-muted" />
            <input
              type="text"
              placeholder="Search products by name, description, slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-hive-border rounded-xl text-xs font-semibold text-hive-dark placeholder-hive-text-muted/70 focus:outline-none focus:ring-1 focus:ring-hive-gold bg-slate-50/50"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
            {/* Searchable Boutique Dropdown */}
            <div className="relative boutique-combobox w-full sm:w-auto">
              <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider block mb-1">Boutique Search</span>
              <button
                type="button"
                onClick={() => setIsBoutiqueDropdownOpen(!isBoutiqueDropdownOpen)}
                className="w-full sm:w-60 px-3 py-2 border border-hive-border rounded-xl text-xs font-semibold text-hive-dark bg-white focus:outline-none flex items-center justify-between shadow-sm hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Store className="w-3.5 h-3.5 text-hive-gold shrink-0" />
                  <span className="truncate">{currentBoutique?.boutiqueName}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-hive-text-muted shrink-0 ml-2" />
              </button>
              
              {isBoutiqueDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-hive-border shadow-xl rounded-2xl p-2 w-full sm:w-60 max-h-72 overflow-y-auto flex flex-col gap-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hive-text-muted" />
                    <input
                      type="text"
                      placeholder="Search boutique..."
                      value={boutiqueSearch}
                      onChange={(e) => setBoutiqueSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-hive-border rounded-lg text-xs focus:outline-none bg-slate-50"
                    />
                  </div>
                  <div className="flex flex-col max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBoutique("all");
                        setIsBoutiqueDropdownOpen(false);
                        setBoutiqueSearch("");
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                        selectedBoutique === "all" ? "bg-hive-gold/10 text-hive-gold font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      All Boutiques
                    </button>
                    {filteredBoutiques.map((b) => (
                      <button
                        key={b._id}
                        type="button"
                        onClick={() => {
                          setSelectedBoutique(b._id);
                          setIsBoutiqueDropdownOpen(false);
                          setBoutiqueSearch("");
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex justify-between items-center",
                          selectedBoutique === b._id ? "bg-hive-gold/10 text-hive-gold font-bold" : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <span className="truncate">{b.boutiqueName}</span>
                        {b.isSandbox && (
                          <span className="text-[8px] font-bold bg-amber-100 text-amber-800 px-1 py-0.5 rounded shrink-0">Sandbox</span>
                        )}
                      </button>
                    ))}
                    {filteredBoutiques.length === 0 && (
                      <div className="text-center py-4 text-slate-400 text-xs">No boutiques found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="w-full sm:w-auto">
              <span className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider block mb-1">Sort Catalog</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full sm:w-48 px-3 py-2 border border-hive-border rounded-xl text-xs font-semibold text-hive-dark bg-white focus:outline-none cursor-pointer shadow-sm hover:bg-slate-50 transition-colors"
              >
                <option value="recently_uploaded">Recently Uploaded</option>
                <option value="highest_risk">⚠️ Highest Risk Score</option>
                <option value="lowest_quality">Lowest Quality Score</option>
                <option value="highest_revenue">Highest Delivered Revenue</option>
                <option value="highest_claims">Highest Claims Submitted</option>
              </select>
            </div>

            {/* Sandbox Isolator Switch */}
            <div className="flex items-center gap-2 mt-2 sm:mt-4 lg:mt-0">
              <span className="text-xs font-bold text-hive-text-muted shrink-0">Hide Sandbox:</span>
              <button
                type="button"
                onClick={() => setExcludeTestData(!excludeTestData)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  excludeTestData ? "bg-[#C59A5B]" : "bg-slate-200"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    excludeTestData ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-1 pt-1 font-sans scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {[
          { key: "all", label: "All Products" },
          { key: "pending_approval", label: "Pending Approval ⏳" },
          { key: "needs_review", label: "Needs Review ⚠️" },
          { key: "active", label: "Active/Live" },
          { key: "out_of_stock", label: "Out of Stock" },
          { key: "recently_created", label: "Recently Added (7d)" }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key as any)}
            className={cn(
              "px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors uppercase tracking-wider",
              statusTab === tab.key
                ? "border-hive-amber text-hive-amber font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Products Table */}
      <Card className="border-none bg-white shadow-none overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-hive-border/40 text-[10px] font-bold uppercase tracking-wider text-hive-text-muted font-sans">
                  <th className="px-6 py-4">Image</th>
                  <th className="px-6 py-4">Product Details</th>
                  <th className="px-6 py-4">Boutique & Trust</th>
                  <th className="px-6 py-4">Quality Score</th>
                  <th className="px-6 py-4">Stock Risk</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border/30 font-semibold text-hive-dark font-sans">
                {products.map((prod) => {
                  const isModerated = prod.adminHidden === true;
                  const totalStock = prod.totalStock ?? 0;

                  return (
                    <tr key={prod._id} className={cn("hover:bg-slate-50/30 transition-colors", isModerated && "bg-red-50/10")}>
                      {/* Image */}
                      <td className="px-6 py-4">
                        <div className="relative w-12 h-16 rounded-xl border border-hive-border/40 overflow-hidden bg-slate-50 flex-shrink-0">
                          {prod.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-hive-text-muted">No Image</div>
                          )}
                        </div>
                      </td>

                      {/* Product Details */}
                      <td className="px-6 py-4 max-w-xs text-left">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => {
                              setHistoryProduct(prod);
                              setIsHistoryModalOpen(true);
                            }}
                            className="font-serif font-black text-sm text-hive-dark leading-tight flex items-center gap-1.5 hover:text-hive-amber hover:underline text-left cursor-pointer"
                          >
                            {prod.name}
                            {isModerated && <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                          </button>
                          <span className="font-mono text-[9px] text-hive-text-muted truncate select-all">{prod._id}</span>
                          <span className="text-[10px] text-slate-500 font-medium">Category: {prod.categoryName}</span>
                        </div>
                      </td>

                      {/* Boutique & Trust */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-serif font-bold text-slate-800 text-sm leading-tight">{prod.boutiqueName}</span>
                          <span className={cn(
                            "inline-flex self-start px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider",
                            prod.trustTier?.includes("Elite") ? "bg-purple-50 text-purple-700 border-purple-200" :
                            prod.trustTier?.includes("Gold") ? "bg-amber-50 text-amber-700 border-amber-200" :
                            prod.trustTier?.includes("Silver") ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-orange-50 text-orange-700 border-orange-200"
                          )}>
                            {prod.trustTier}
                          </span>
                        </div>
                      </td>

                      {/* Quality Score Badge (Interactive) */}
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setQualityCheckProduct(prod)}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95",
                            prod.qualityScore === 100 ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" :
                            prod.qualityScore >= 60 ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                          )}
                          title="Click to view full checklist details"
                        >
                          {prod.qualityScore === 100 ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {prod.qualityScore}%
                        </button>
                      </td>

                      {/* Stock Risk Status */}
                      <td className="px-6 py-4 text-left">
                        <div className="flex flex-col gap-1.5">
                          <span className={cn(
                            "inline-flex px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase border self-start",
                            totalStock === 0 ? "bg-red-50 text-red-700 border-red-200 font-bold" :
                            totalStock === 1 ? "bg-red-50 text-red-800 border-red-300 animate-pulse font-extrabold" :
                            totalStock < 5 ? "bg-amber-50 text-amber-700 border-amber-200 font-bold" : "bg-green-50 text-green-700 border-green-200"
                          )}>
                            {totalStock === 0 ? "Out of Stock" :
                             totalStock === 1 ? "Critical (1)" :
                             totalStock < 5 ? `Low Stock (${totalStock})` : `Healthy (${totalStock})`}
                          </span>
                          <div className="flex gap-1 flex-wrap max-w-xs">
                            {prod.sizes.map((sz: string) => (
                              <span key={sz} className="text-[8.5px] font-bold bg-slate-50 text-slate-600 px-1 py-0.5 rounded border border-slate-100">
                                {sz}: {prod.stockBySize?.[sz] ?? 0}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          {prod.active && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border bg-[#C59A5B]/10 text-[#C59A5B] border-[#C59A5B]/20">
                              Active
                            </span>
                          )}

                          {prod.active && prod.approvalStatus === "pending" && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 tracking-wider">
                              Pending Approval
                            </span>
                          )}

                          {prod.active && prod.approvalStatus === "changes_requested" && (
                            <div className="flex flex-col gap-0.5 mt-0.5 text-[9px] text-orange-650 font-medium">
                              <span className="inline-flex items-center gap-1 font-bold bg-orange-50 text-orange-850 border border-orange-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Changes Requested
                              </span>
                              {prod.approvalNotes && (
                                <span className="text-[10px] italic font-semibold text-orange-600 mt-0.5 truncate max-w-[120px]" title={prod.approvalNotes}>
                                  &quot;{prod.approvalNotes}&quot;
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInspectProduct(prod)}
                            className="px-2.5 py-1 text-[10px] font-bold text-[#C59A5B] border-[#C59A5B]/30 hover:bg-[#C59A5B]/5 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                          >
                            Inspect & Edit
                          </Button>
                          {/* Approval Actions */}
                          {prod.active && prod.approvalStatus === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleApproveProduct(prod._id)}
                                className="px-2.5 py-1 text-[10px] font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRequestChangesProduct(prod._id)}
                                className="px-2.5 py-1 text-[10px] font-bold text-orange-650 border-orange-200 hover:bg-orange-50 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                              >
                                Request Changes
                              </Button>
                            </>
                          )}

                          {/* Active Toggle Button */}
                          {prod.active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openActionModal(prod, "deactivate")}
                              className="px-2.5 py-1 text-[10px] font-bold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openActionModal(prod, "reactivate")}
                              className="px-2.5 py-1 text-[10px] font-bold text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                            >
                              Reactivate
                            </Button>
                          )}

                          {/* Moderation Hiding Toggle Button */}
                          {isModerated ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openActionModal(prod, "unhide")}
                              className="px-2.5 py-1 text-[10px] font-bold text-[#C59A5B] border-[#C59A5B]/30 hover:bg-[#C59A5B]/5 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Unmoderate
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openActionModal(prod, "hide")}
                              className="px-2.5 py-1 text-[10px] font-bold text-red-700 bg-red-50 border-red-100 hover:bg-red-100 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                            >
                              <EyeOff className="w-3 h-3" /> Moderate
                            </Button>
                          )}

                          {/* Hard Delete Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openActionModal(prod, "delete")}
                            className="px-2.5 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 rounded-lg flex items-center gap-1 font-sans cursor-pointer"
                            title="Permanently delete product and Cloudflare R2 media"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {products.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-hive-text-muted font-medium font-sans">
                      <p className="text-sm font-bold text-hive-dark">No products found</p>
                      <p className="text-xs text-neutral-400 mt-1">
                        Try adjusting your search criteria, boutique selection, sandbox mode, or status filter.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Quality Gate Checklist Modal */}
      <Modal
        isOpen={qualityCheckProduct !== null}
        onClose={() => setQualityCheckProduct(null)}
        title="Quality Gate Checklist"
      >
        {qualityCheckProduct && (
          <div className="flex flex-col gap-5 font-sans text-left mt-2">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-14 rounded-lg overflow-hidden border bg-slate-50 shrink-0">
                {qualityCheckProduct.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={qualityCheckProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">No Image</div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-serif font-black text-hive-dark text-sm truncate">{qualityCheckProduct.name}</span>
                <span className="text-[10px] text-hive-text-muted">By {qualityCheckProduct.boutiqueName} • Score: {qualityCheckProduct.qualityScore}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  label: "Photos (3+ Uploads Required)",
                  desc: `Found ${qualityCheckProduct.images?.length || 0} image(s). (Weight: 16.6%)`,
                  passed: qualityCheckProduct.qualityChecks?.photos
                },
                {
                  label: "Detailed Description (> 50 Characters)",
                  desc: `Description length is ${qualityCheckProduct.description?.trim().length || 0} character(s). (Weight: 16.6%)`,
                  passed: qualityCheckProduct.qualityChecks?.description
                },
                {
                  label: "Pricing Validity (> ₹0)",
                  desc: `Product price is ${formatCurrency(qualityCheckProduct.price)}. (Weight: 16.6%)`,
                  passed: qualityCheckProduct.qualityChecks?.price
                },
                {
                  label: "Category Assignment",
                  desc: `Assigned category: ${qualityCheckProduct.categoryName}. (Weight: 16.6%)`,
                  passed: qualityCheckProduct.qualityChecks?.category
                },
                {
                  label: "Physical Inventory Availability",
                  desc: `Total available stock: ${qualityCheckProduct.totalStock || 0} unit(s). (Weight: 16.6%)`,
                  passed: qualityCheckProduct.qualityChecks?.inventory
                },
                {
                  label: "Size Measurement Chart Completeness",
                  desc: `Sizing details: ${qualityCheckProduct.qualityChecks?.sizingChart ? "Complete" : "Incomplete (Chest/Waist/Shoulder/Length parameters missing)"}. (Weight: 17%)`,
                  passed: qualityCheckProduct.qualityChecks?.sizingChart
                }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-slate-50 bg-slate-50/40">
                  {item.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-800">{item.label}</span>
                    <span className="text-[11px] font-medium text-slate-500">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                onClick={() => setQualityCheckProduct(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl text-white font-sans bg-hive-dark hover:bg-hive-dark/95 border-transparent uppercase tracking-wider"
              >
                Close Checklist
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Admin Action Reason Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          modalAction === "deactivate" ? "Deactivate Product" :
          modalAction === "reactivate" ? "Reactivate Product" :
          modalAction === "hide" ? "Moderate Product Listing" :
          modalAction === "unhide" ? "Lift Product Moderation" :
          modalAction === "delete" ? "Permanently Delete Product" : "Administrative Action"
        }
      >
        <form onSubmit={handleModalSubmit} className="flex flex-col gap-4 font-sans text-left mt-2">
          {/* Action Warnings */}
          {modalAction === "delete" && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold text-red-900">Irreversible Action: Permanent Hard Delete</p>
                <p className="text-[11px] text-red-700 mt-0.5">This will completely remove the product from the database AND trigger background deletion of all associated images from Cloudflare R2 storage. This cannot be undone.</p>
              </div>
            </div>
          )}

          {modalAction === "deactivate" && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-bold">Warning: Deactivating Product</p>
                <p className="text-[11px] text-amber-700 mt-0.5">This will transition the product status to draft/inactive. The boutique owner can still reactivate it later from their portal.</p>
              </div>
            </div>
          )}

          {modalAction === "hide" && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="font-bold">Warning: Moderating and Hiding Product</p>
                <p className="text-[11px] text-red-700 mt-0.5">This completely hides the product from the customer storefront (search, collections, PDP, cart, checkout). The boutique owner will see a warning badge with your reason, but cannot edit active toggle until lifted.</p>
              </div>
            </div>
          )}

          {/* Product Details Header */}
          {selectedProduct && (
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-14 rounded-lg overflow-hidden border bg-slate-50 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px]">No Image</div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-serif font-black text-hive-dark text-sm truncate">{selectedProduct.name}</span>
                <span className="text-[10px] text-hive-text-muted">By {selectedProduct.boutiqueName} • Price: {formatCurrency(selectedProduct.price)}</span>
              </div>
            </div>
          )}

          {/* Moderation Category Selector */}
          {modalAction === "hide" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-hive-text-muted uppercase tracking-wider">Moderation Category</label>
              <select
                value={moderationCategory}
                onChange={(e) => setModerationCategory(e.target.value)}
                className="w-full px-3 py-2 border border-hive-border rounded-xl text-xs font-semibold text-hive-dark bg-white focus:outline-none cursor-pointer"
              >
                {MODERATION_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Action Reason */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-hive-text-muted uppercase tracking-wider">
              Reason / Explanation Note
            </label>
            <textarea
              required
              rows={3}
              placeholder={
                modalAction === "hide"
                  ? "e.g., Image appears copied from another marketplace. Please upload original photography."
                  : "Explain why this action is being performed..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-hive-border rounded-xl text-xs font-semibold text-hive-dark focus:outline-none focus:ring-1 focus:ring-hive-gold resize-none bg-slate-50/50"
            />
            {modalAction === "hide" && (
              <span className="text-[10px] font-medium text-slate-500 italic">
                * Note: This explanation will be displayed directly to the merchant in their boutique portal.
              </span>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold rounded-xl font-sans"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-xl text-white font-sans border-transparent uppercase tracking-wider",
                (modalAction === "deactivate" || modalAction === "hide" || modalAction === "delete") ? "bg-red-700 hover:bg-red-800" : "bg-hive-dark hover:bg-hive-dark/95"
              )}
            >
              {submitting ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {modalAction === "delete" ? "Deleting..." : "Saving..."}</span>
              ) : (modalAction === "delete" ? "Permanently Delete" : "Confirm Action")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Product Detail & Moderation History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistoryProduct(null);
        }}
        title="Product Details & Moderation History"
      >
        {historyProduct && (
          <div className="flex flex-col gap-6 font-sans text-left mt-2 max-h-[80vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="flex gap-4 border-b border-slate-100 pb-4">
              <div className="w-16 h-20 rounded-xl overflow-hidden border bg-slate-50 shrink-0">
                {historyProduct.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={historyProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-hive-text-muted">No Image</div>
                )}
              </div>
              <div className="flex flex-col justify-between">
                <div>
                  <h3 className="font-serif font-black text-hive-dark text-lg leading-tight">{historyProduct.name}</h3>
                  <p className="text-xs text-hive-text-muted font-mono mt-1 select-all">{historyProduct._id}</p>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mt-2 font-sans">
                  <span>Boutique: <strong className="text-hive-dark">{historyProduct.boutiqueName}</strong></span>
                  <span>Category: <strong className="text-hive-dark">{historyProduct.categoryName}</strong></span>
                  <span>Price: <strong className="text-hive-dark">{formatCurrency(historyProduct.price)}</strong></span>
                </div>
              </div>
            </div>

            {/* Image Gallery */}
            {historyProduct.imageUrls && historyProduct.imageUrls.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-hive-text-muted uppercase tracking-wider mb-2 font-sans">
                  Product Images ({historyProduct.imageUrls.length})
                </h4>
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-thin scrollbar-thumb-slate-200">
                  {historyProduct.imageUrls.map((url: string, idx: number) => (
                    <div key={idx} className="w-32 h-40 shrink-0 rounded-xl border bg-slate-50 overflow-hidden snap-start relative group/himg block">
                      <a href={url} target="_blank" rel="noreferrer" className="block w-full h-full cursor-zoom-in">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Product Image ${idx + 1}`} className="w-full h-full object-cover group-hover/himg:scale-105 transition-transform duration-300" />
                      </a>
                      {idx === 0 && (
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          Primary
                        </div>
                      )}
                      {/* Crop button overlay */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCropImageUrl(url);
                          setCropImageIndex(idx);
                          setCropProductId(historyProduct._id);
                          setCropProductName(historyProduct.name);
                          setCropModalOpen(true);
                        }}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-white/90 backdrop-blur-md border border-white/40 text-stone-600 hover:bg-white hover:text-amber-700 shadow transition-all opacity-0 group-hover/himg:opacity-100 z-10 cursor-pointer"
                        title={`Crop image ${idx + 1}`}
                      >
                        <Crop className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moderation Timeline */}
            <div>
              <h4 className="text-xs font-bold text-hive-text-muted uppercase tracking-wider mb-4 font-sans">
                Moderation Timeline
              </h4>

              {moderationHistory === undefined ? (
                <div className="flex items-center justify-center py-8 gap-2 text-hive-text-muted text-xs font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-hive-amber" />
                  <span>Loading history log...</span>
                </div>
              ) : moderationHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  No administrative actions logged for this product.
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-slate-100 space-y-6 ml-3">
                  {moderationHistory.map((log: any) => {
                    const isModeration = log.action === "product.moderated";
                    const isUnmoderated = log.action === "product.unmoderated";
                    const isDeactivated = log.action === "product.deactivated_admin";
                    const isReactivated = log.action === "product.reactivated_admin";
                    
                    const meta = log.metadata ? JSON.parse(log.metadata) : {};

                    return (
                      <div key={log._id} className="relative">
                        {/* Timeline Node Point */}
                        <span className={cn(
                          "absolute -left-[33px] top-0.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center",
                          isModeration ? "border-red-500" :
                          isDeactivated ? "border-amber-500" :
                          isUnmoderated ? "border-green-500" : "border-blue-500"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isModeration ? "bg-red-500" :
                            isDeactivated ? "bg-amber-500" :
                            isUnmoderated ? "bg-green-500" : "bg-blue-500"
                          )} />
                        </span>

                        {/* Node Content */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-4 font-sans">
                            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-800">
                              {isModeration ? "Moderated (Hidden)" :
                               isUnmoderated ? "Moderation Lifted" :
                               isDeactivated ? "Force Deactivated" :
                               isReactivated ? "Reactivated" : log.action}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {new Date(log.createdAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-slate-500 font-medium">
                            Action by: <strong className="text-slate-700">{log.actorEmail}</strong>
                          </div>

                          {meta.category && (
                            <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider mt-0.5">
                              Violation Category: {meta.category}
                            </div>
                          )}

                          {meta.reason && (
                            <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 italic select-text">
                              &quot;{meta.reason}&quot;
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  setHistoryProduct(null);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl text-white font-sans bg-hive-dark hover:bg-hive-dark/95 border-transparent"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {inspectProduct && (
        <ProductInspectionDrawer
          product={inspectProduct}
          onClose={() => setInspectProduct(null)}
          categories={categories || []}
        />
      )}

      {/* Image Crop Modal (for moderation history) */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => setCropModalOpen(false)}
        imageUrl={cropImageUrl}
        imageIndex={cropImageIndex}
        productId={cropProductId}
        productName={cropProductName}
        onCropComplete={(newUrl, idx) => {
          setCropModalOpen(false);
          if (newUrl && typeof idx === "number" && historyProduct?.imageUrls) {
            setHistoryProduct((prev: any) => {
              if (!prev) return prev;
              const nextUrls = [...(prev.imageUrls || [])];
              nextUrls[idx] = newUrl;
              return { ...prev, imageUrls: nextUrls };
            });
          }
        }}
      />
    </div>
  );
}
