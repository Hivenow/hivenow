"use client";
// Deploy: Sep 14 2026 — bed linen sizing fix

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Card, CardContent, Button, TextEffect, LoadingState } from "@hive/ui";
import { formatCurrency, toast } from "@hive/utils";
import {
  Loader2,
  ShieldX,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Trophy,
  AlertCircle,
  TrendingUp,
  Package2,
  FileText,
  Check,
  Medal,
  Shield,
  Star,
  ChevronDown,
  Coins,
} from "lucide-react";
import Link from "next/link";

// 1. StatusBadge component with premium light pastel colors
function StatusBadge({ variant, label, icon: Icon }: { variant: "success" | "info" | "warning"; label: string; icon?: React.ComponentType<any> }) {
  const styles = {
    success: "bg-[#EAF6ED] text-[#2E7D32] border-[#C6EBD3]/40",
    info: "bg-[#E8F0FE] text-[#1A73E8] border-[#D2E3FC]/40",
    warning: "bg-[#FEF3D6] text-[#B06000] border-[#FDE7B9]/40",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-wide ${styles[variant]}`}>
      {Icon && <Icon className="w-3 h-3 stroke-[2.2]" />}
      <span>{label}</span>
    </span>
  );
}

// 2. StatusRow component designed for the light theme card
interface StatusRowProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  badge: React.ReactNode;
  iconColorClass: string;
  iconBgClass: string;
  iconBorderClass: string;
}

function StatusRow({ title, description, icon: Icon, badge, iconColorClass, iconBgClass, iconBorderClass }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-hive-border/40 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${iconBorderClass} ${iconBgClass} ${iconColorClass}`}>
          <Icon className="w-4.5 h-4.5 stroke-[1.75]" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-xs font-bold text-hive-text leading-tight">{title}</span>
          {description && <span className="text-[10px] text-hive-text-muted font-medium mt-0.5">{description}</span>}
        </div>
      </div>
      {badge}
    </div>
  );
}

export default function BoutiqueDashboard() {
  const { isLoading: convexAuthLoading } = useConvexAuth();
  const me = useQuery(api.users.getMe);
  const boutique = useQuery(api.boutiques.getMyBoutiqueDetails);
  const products = useQuery(api.products.getBoutiqueProducts);
  const orders = useQuery(api.orders.getBoutiqueOrders);
  const tierStats = useQuery(api.boutiques.getBoutiqueTierAndStats, boutique ? { boutiqueId: boutique._id } : "skip");
  const platformConfig = useQuery(api.adminSettings.getPlatformConfig);

  const toggleAvailability = useMutation(api.boutiques.toggleBoutiqueAvailability);
  const updateStatus = useMutation(api.boutiques.updateStoreStatus);

  const [isPending, setIsPending] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const handleToggleAvailability = async () => {
    if (!boutique) return;
    setIsPending(true);
    try {
      const nextVal = !boutique.isAcceptingOrders;
      await toggleAvailability({ isAcceptingOrders: nextVal });
      if (nextVal) {
        toast.success("Store is Now Open", "Your boutique is online and ready to accept new customer orders.");
      } else {
        toast.info("Store Temporarily Paused", "Order acceptance is paused. Existing orders can still be fulfilled.");
      }
    } catch (e) {
      toast.error("Couldn't Update Status", "Unable to change order acceptance right now. Please try again.");
      console.error(e);
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: "open" | "busy" | "closed") => {
    if (!boutique) return;
    setIsPending(true);
    try {
      await updateStatus({ storeStatus: newStatus });
      const label = newStatus === "open" ? "Open" : newStatus === "busy" ? "Busy Mode" : "Closed";
      const desc = newStatus === "open" 
        ? "Your boutique is open for normal orders."
        : newStatus === "busy"
        ? "Busy mode enabled. Customers will see extended fulfillment times."
        : "Store is currently closed.";
      toast.success(`Store Status: ${label}`, desc);
    } catch (e) {
      toast.error("Couldn't Update Status", "Unable to update store status right now. Please try again.");
      console.error(e);
    } finally {
      setIsPending(false);
    }
  };

  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (convexAuthLoading) return;
    const t = setTimeout(() => setWaitedLong(true), 6000);
    return () => clearTimeout(t);
  }, [convexAuthLoading]);

  // Determine if stock verification is done for today
  const isStockVerifiedToday = useMemo(() => {
    if (!products || products.length === 0) return true;
    return products.every((prod: any) => {
      if (!prod.lastVerifiedAt) return false;
      const date = new Date(prod.lastVerifiedAt);
      const today = new Date();
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    });
  }, [products]);

  // Count items with stock <= 2 but > 0
  const lowStockCount = useMemo(() => {
    if (!products) return 0;
    let count = 0;
    products.forEach((p: any) => {
      p.sizes.forEach((sz: string) => {
        const stock = p.stockBySize[sz] ?? 0;
        if (stock > 0 && stock <= 2) {
          count++;
        }
      });
    });
    return count;
  }, [products]);

  const lowStockDetail = useMemo(() => {
    if (!products) return null;
    const lowStockItems: { name: string; size: string; stock: number }[] = [];
    products.forEach((p: any) => {
      p.sizes.forEach((sz: string) => {
        const stock = p.stockBySize[sz] ?? 0;
        if (stock > 0 && stock <= 2) {
          lowStockItems.push({ name: p.name, size: sz, stock });
        }
      });
    });
    if (lowStockItems.length === 0) return null;
    return {
      first: lowStockItems[0]!,
      totalCount: lowStockItems.length
    };
  }, [products]);

  const isCreatedToday = (order: any) => {
    const date = new Date(order._creationTime);
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Metrics calculations
  const isActiveOrder = (o: any) =>
    !["cancelled", "refunded", "refund_requested", "booking_failed"].includes(o.status);

  const ordersNewToday = useMemo(() => {
    return orders?.filter(isCreatedToday).filter(isActiveOrder).length ?? 0;
  }, [orders]);

  const netEarningsToday = useMemo(() => {
    return (
      orders
        ?.filter(isCreatedToday)
        ?.filter(isActiveOrder)
        ?.reduce((sum: number, o: any) => {
          // Server payout: the frozen price split, or the item-based figure for older orders.
          const payoutPaise = o.totalPayout ?? 0;
          return sum + (payoutPaise / 100);
        }, 0) ?? 0
    );
  }, [orders]);

  const toPackCount = useMemo(() => {
    return orders?.filter((o: any) => o.status === "confirmed").length ?? 0;
  }, [orders]);

  const pendingConfirmationCount = useMemo(() => {
    return orders?.filter((o: any) => o.status === "pending_confirmation").length ?? 0;
  }, [orders]);

  const salesHistory7Days = useMemo(() => {
    if (!orders) return [0, 0, 0, 0, 0, 0, 0];
    const dailyTotals = Array(7).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach((o: any) => {
      if (!isActiveOrder(o)) return;
      const orderDate = new Date(o._creationTime);
      orderDate.setHours(0, 0, 0, 0);
      const diffTime = today.getTime() - orderDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        const payoutPaise = o.totalPayout ?? 0;
        dailyTotals[6 - diffDays] += Math.round(payoutPaise / 100);
      }
    });
    return dailyTotals;
  }, [orders]);

  const isTrendEmpty = useMemo(() => {
    return salesHistory7Days.every(val => val === 0);
  }, [salesHistory7Days]);

  const sparklinePoints = useMemo(() => {
    const maxVal = Math.max(...salesHistory7Days, 1);
    const height = 30;
    const width = 110;
    const padding = 2;
    const usableHeight = height - padding * 2;
    
    return salesHistory7Days
      .map((val, idx) => {
        const x = (idx / 6) * width;
        const y = height - padding - (val / maxVal) * usableHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [salesHistory7Days]);

  const recentOrders = useMemo(() => {
    if (!orders) return [];
    return orders.slice(0, 3);
  }, [orders]);

  // Delivery Rating: 30-day Merchant Fulfillment Rate
  const deliveryRatingData = useMemo(() => {
    if (!orders || orders.length === 0) {
      return { label: "Excellent", percentage: 100, variant: "success" as const, icon: Sparkles };
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysMs = thirtyDaysAgo.getTime();

    let totalClosedOrders = 0;
    let deliveredOrders = 0;

    orders.forEach((o: any) => {
      if (o._creationTime >= thirtyDaysMs) {
        if (o.status === "delivered") {
          totalClosedOrders++;
          deliveredOrders++;
        } else if (o.status === "cancelled") {
          const reason = (o.cancelReason || "").toLowerCase();
          // Count merchant-initiated cancellations against their fulfillment rate
          const isMerchantFault = reason.includes("out of stock") || reason.includes("stock") || reason.includes("boutique owner") || reason.includes("merchant");
          if (isMerchantFault) {
            totalClosedOrders++;
          }
        }
      }
    });

    if (totalClosedOrders === 0) {
      return { label: "Excellent", percentage: 100, variant: "success" as const, icon: Sparkles };
    }

    const rate = Math.round((deliveredOrders / totalClosedOrders) * 100);
    
    if (rate >= 98) return { label: "Excellent", percentage: rate, variant: "success" as const, icon: Sparkles };
    if (rate >= 90) return { label: "Good", percentage: rate, variant: "info" as const, icon: CheckCircle2 };
    return { label: "Needs Attention", percentage: rate, variant: "warning" as const, icon: AlertTriangle };
  }, [orders]);

  if (me === undefined || boutique === undefined || products === undefined || orders === undefined || tierStats === undefined) {
    if (waitedLong && boutique === null) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
          <ShieldX className="w-10 h-10 text-red-400" />
          <p className="text-base font-bold text-hive-text">Access Denied</p>
          <p className="text-sm text-hive-text-muted max-w-sm">
            Your account does not have seller privileges, or no seller store is linked to your account.
          </p>
        </div>
      );
    }
    return (
      <LoadingState message="Loading dashboard..." variant="full" />
    );
  }

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = boutique.ownerName ? boutique.ownerName.split(' ')[0] : "Partner";

  // Dynamic Onboarding State
  const onboardingSteps = [
    { id: "profile", done: !!boutique },
    { id: "approval", done: boutique?.status === "APPROVED" },
    { id: "delivery", done: !!boutique?.deliveryRadiusKm },
    { id: "location", done: !!boutique?.latitude && !!boutique?.longitude },
    { id: "products", done: products && products.length > 0 },
    { id: "stock", done: products && products.some((p: any) => p.sizes && p.sizes.some((sz: string) => p.stockBySize?.[sz] > 0)) },
  ];
  const completedCount = onboardingSteps.filter(s => s.done).length;
  const totalSteps = onboardingSteps.length;
  const completionPercentage = Math.round((completedCount / totalSteps) * 100);
  const hasProducts = products && products.length > 0;

  const currentHour = new Date().getHours();
  let greetingPrefix = "Good Morning";
  if (currentHour >= 12 && currentHour < 17) {
    greetingPrefix = "Good Afternoon";
  } else if (currentHour >= 17) {
    greetingPrefix = "Good Evening";
  }

  // Stacking order layout (Mobile first stack, Desktop 2-column layout)
  return (
    <div className="flex flex-col gap-6 text-left max-w-6xl w-full pt-2 pb-14 font-sans px-2 lg:px-6">

      {/* 1. Operations Control Center Card */}
      <div className="bg-white border border-slate-200/60 rounded-[24px] p-6 flex flex-col shadow-none select-none">
        
        {/* Top Row: Greeting & Status Dropdown Selector */}
        <div className="flex flex-row items-center justify-between gap-4 mb-4">
          <div className="flex flex-col gap-0.5">
            <TextEffect
              as="h1"
              per="word"
              preset="fade"
              className="text-[24px] md:text-[28px] leading-tight font-extrabold text-slate-800 tracking-tight"
            >
              {`${greetingPrefix}, ${firstName}.`}
            </TextEffect>
            <p className="text-[13px] font-medium text-slate-500">{currentDate}</p>
          </div>

          <div className="relative shrink-0">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-[14px] font-bold transition-all duration-150 cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-700"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${
                boutique.storeStatus === "open"
                  ? "bg-[#059669]"
                  : boutique.storeStatus === "busy"
                  ? "bg-[#D97706]"
                  : "bg-[#E11D48]"
              }`} />
              <span>{boutique.storeStatus === "open" ? "Open" : boutique.storeStatus === "busy" ? "Busy" : "Closed"}</span>
            </button>

            {isStatusDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsStatusDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200/60 rounded-2xl shadow-lg py-2 z-20 animate-in fade-in slide-in-from-top-2 duration-100">
                  {(["open", "busy", "closed"] as const).map((status) => (
                    <button
                      key={status}
                      disabled={isPending}
                      onClick={() => {
                        handleUpdateStatus(status);
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer ${
                        boutique.storeStatus === status ? "bg-slate-50" : ""
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        status === "open" ? "bg-[#059669]" : status === "busy" ? "bg-[#D97706]" : "bg-[#E11D48]"
                      }`} />
                      {status === "open" ? "Open" : status === "busy" ? "Busy" : "Closed"}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-4 py-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Accepting Orders</span>
                    <button
                      disabled={isPending || boutique.storeStatus === "closed"}
                      onClick={() => {
                        handleToggleAvailability();
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        boutique.storeStatus !== "closed" && boutique.isAcceptingOrders
                          ? "bg-[#059669]"
                          : "bg-slate-200"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          boutique.storeStatus !== "closed" && boutique.isAcceptingOrders
                            ? "translate-x-4"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <hr className="border-t border-slate-200/60 my-2" />

        {/* Dynamic Alerts List (Compressed) */}
        <div className="flex flex-col gap-2.5 py-2">
          {/* New Orders Item */}
          <div className="flex items-center gap-3">
            {pendingConfirmationCount > 0 ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#059669]"></span>
                <span className="text-[15px] font-bold text-slate-800">
                  {pendingConfirmationCount} New {pendingConfirmationCount === 1 ? "Order" : "Orders"}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="text-[15px] font-semibold text-slate-500">
                  No New Orders
                </span>
              </>
            )}
          </div>

          {/* Low Stock Item */}
          <div className="flex items-center gap-3">
            {lowStockDetail ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#D97706]" />
                <span className="text-[15px] font-bold text-slate-800">
                  {lowStockDetail.totalCount === 1 ? (
                    <span>
                      {lowStockDetail.first.stock} {lowStockDetail.first.size} left of {lowStockDetail.first.name}
                    </span>
                  ) : (
                    <span>
                      {lowStockDetail.first.stock} {lowStockDetail.first.size} left of {lowStockDetail.first.name} (+{lowStockDetail.totalCount - 1} more)
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="text-[15px] font-semibold text-slate-500">
                  Stock Healthy
                </span>
              </>
            )}
          </div>
        </div>

        {/* Immediate CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
          <Link href="/boutique/orders" className="flex-1">
            <Button 
              className={`w-full py-5 rounded-[16px] font-semibold text-[15px] transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                pendingConfirmationCount > 0
                  ? "bg-[#059669] hover:bg-[#047857] text-white border-none shadow-none"
                  : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60 shadow-none"
              }`}
            >
              {pendingConfirmationCount > 0 ? `Accept Orders (${pendingConfirmationCount})` : "View Orders"}
            </Button>
          </Link>
          <Link href="/boutique/inventory" className="flex-1">
            <Button 
              className={`w-full py-5 rounded-[16px] font-semibold text-[15px] transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                lowStockCount > 0 || !isStockVerifiedToday
                  ? "bg-white border border-[#F5C22B] text-[#D9A71E] hover:bg-[#ffffff] shadow-none"
                  : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60 shadow-none"
              }`}
            >
              Update Inventory
            </Button>
          </Link>
        </div>
      </div>

      {/* Onboarding Checklist Card — shown until all setup steps are complete */}
      {completionPercentage < 100 && (
        <div className="bg-white border border-amber-200/60 rounded-[24px] p-6 flex flex-col gap-4 shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Get Your Store Live
              </h2>
              <p className="text-xs text-slate-500 font-medium">{completedCount} of {totalSteps} steps complete</p>
            </div>
            <span className="text-sm font-extrabold text-amber-600">{completionPercentage}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Checklist Items */}
          <div className="flex flex-col gap-2.5">
            {[
              { done: !!boutique, label: "Account activated", href: null },
              { done: boutique?.status === "APPROVED", label: "Store approved by Hive", href: null },
              { done: !!boutique?.deliveryRadiusKm, label: "Set delivery radius", href: "/boutique/profile" },
              { done: !!boutique?.latitude && !!boutique?.longitude, label: "Store location pinned", href: "/boutique/profile" },
              { done: products && products.length > 0, label: "Add your first product", href: "/boutique/products" },
              { done: products && products.some((p: any) => p.sizes && p.sizes.some((sz: string) => p.stockBySize?.[sz] > 0)), label: "Update stock levels", href: "/boutique/stock" },
            ].map((step, idx) => (
              <div key={idx} className="flex items-center gap-3">
                {step.done ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-amber-300 shrink-0" />
                )}
                {step.href && !step.done ? (
                  <Link href={step.href} className="text-xs font-semibold text-amber-700 hover:underline">
                    {step.label}
                  </Link>
                ) : (
                  <span className={`text-xs font-semibold ${step.done ? "text-slate-400 line-through" : "text-slate-600"}`}>
                    {step.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Secondary Sections Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mt-2">
        
        {/* Left Column (Snapshot & Recent Orders) */}
        <div className="flex flex-col gap-6 w-full">
          
          {/* Today's Snapshot Card */}
          <div className="bg-white border border-slate-200/60 rounded-[24px] p-6 flex flex-col gap-6 shadow-none">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
              {me?.role !== "boutique" ? (
                <div className="flex flex-col gap-0.5 text-left min-w-0">
                  <span className="text-xl sm:text-2xl lg:text-[28px] font-extrabold text-slate-800 tracking-tight truncate" title={netEarningsToday === 0 ? "₹0" : formatCurrency(netEarningsToday).replace(".00", "")}>
                    {netEarningsToday === 0 ? "₹0" : formatCurrency(netEarningsToday).replace(".00", "")}
                  </span>
                  <span className="text-[13px] text-slate-500 font-medium">Today's Net Payout</span>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 text-left min-w-0">
                  <span className="text-xl sm:text-2xl lg:text-[28px] font-extrabold text-slate-800 tracking-tight truncate">
                    {lowStockCount}
                  </span>
                  <span className="text-[13px] text-slate-500 font-medium">Low Stock Items</span>
                </div>
              )}
              <div className="flex flex-col gap-0.5 text-left min-w-0">
                <span className="text-xl sm:text-2xl lg:text-[28px] font-extrabold text-slate-800 tracking-tight truncate">
                  {ordersNewToday}
                </span>
                <span className="text-[13px] text-slate-500 font-medium">Pending Orders</span>
              </div>
              <div className="flex flex-col gap-0.5 text-left min-w-0">
                <span className="text-xl sm:text-2xl lg:text-[28px] font-extrabold text-slate-800 tracking-tight truncate">
                  {toPackCount}
                </span>
                <span className="text-[13px] text-slate-500 font-medium">Ready to Pack</span>
              </div>
            </div>
          </div>

          {/* Recent Orders Card */}
          <div className="bg-white border border-slate-200/60 rounded-[24px] p-6 flex flex-col gap-4 shadow-none">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Recent Orders</h3>
              <Link href="/boutique/orders" className="text-[13px] font-bold text-[#D9A71E] hover:text-[#B88643] transition-colors flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <p className="text-[14px] text-slate-500 font-medium py-4">No orders received yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {recentOrders.map((o: any) => (
                  <div key={o._id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-[14px] text-slate-800">{o.orderNumber}</span>
                      <span className="text-[12px] text-slate-500 font-medium">
                        {new Date(o._creationTime).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="font-extrabold text-[15px] text-slate-800">₹{(o.totalPrice ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column (Shop Standing & Onboarding) */}
        <div className="flex flex-col gap-6 w-full">
          
          {/* Shop Standing Card */}
          <div className="bg-white border border-slate-200/60 rounded-[24px] p-6 flex flex-col gap-4 shadow-none">
            <span className="text-[13px] text-slate-500 font-medium">Shop Standing</span>
            
            <div className="flex flex-col gap-4 mt-2">
              <StatusRow
                title="Store Status"
                description="Ready for selling"
                icon={Shield}
                iconBgClass="bg-white"
                iconColorClass="text-[#059669]"
                iconBorderClass="border-slate-200/60"
                badge={<StatusBadge variant="success" label="Approved" icon={Check} />}
              />

              <StatusRow
                title="Delivery Rating"
                description={`${deliveryRatingData.percentage}% Order Fulfillment Rate`}
                icon={Star}
                iconBgClass="bg-white"
                iconColorClass={
                  deliveryRatingData.variant === "success" ? "text-[#059669]" : 
                  deliveryRatingData.variant === "info" ? "text-[#1A73E8]" : "text-[#D97706]"
                }
                iconBorderClass="border-slate-200/60"
                badge={<StatusBadge variant={deliveryRatingData.variant} label={deliveryRatingData.label} icon={deliveryRatingData.icon} />}
              />

              <StatusRow
                title="Seller Tier"
                description={
                  tierStats.tier === "Bronze" ? "Standard local visibility" :
                  tierStats.tier === "Silver" ? "Featured placement in local boutique searches" :
                  "Top tier partner with priority buyer placement"
                }
                icon={Trophy}
                iconBgClass="bg-white"
                iconColorClass={
                  tierStats.tier === "Bronze" ? "text-[#D97706]" :
                  tierStats.tier === "Silver" ? "text-[#1A73E8]" : "text-[#059669]"
                }
                iconBorderClass="border-slate-200/60"
                badge={
                  <StatusBadge 
                    variant={
                      tierStats.tier === "Bronze" ? "warning" : 
                      tierStats.tier === "Silver" ? "info" : "success"
                    } 
                    label={tierStats.tier} 
                    icon={Trophy} 
                  />
                }
              />

              {/* Pricing Tier — read-only, admin-assigned */}
              {(() => {
                const LEGACY_TIER_KEYS: Record<string, string> = { tier1: "bronze", tier2: "silver", tier3: "gold" };
                const rawTier = String((boutique as any)?.pricingTier || "bronze").toLowerCase();
                const tierKey = LEGACY_TIER_KEYS[rawTier] || rawTier;
                const tierDisplayName =
                  (platformConfig as any)?.tiers?.find((t: any) => String(t.key).toLowerCase() === tierKey)?.name ||
                  tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
                return (
                  <StatusRow
                    title="Pricing Tier"
                    description="Your current platform pricing tier"
                    icon={Coins}
                    iconBgClass="bg-white"
                    iconColorClass="text-[#D9A71E]"
                    iconBorderClass="border-slate-200/60"
                    badge={
                      <StatusBadge variant="info" label={tierDisplayName} icon={Coins} />
                    }
                  />
                );
              })()}
            </div>
          </div>

          {/* Get Your Shop Ready Card (Routine Setup Onboarding) */}
          {!hasProducts && (
            <div className="bg-white border border-slate-200/60 rounded-[24px] p-6 flex flex-row items-center gap-6 shadow-none">
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    className="stroke-slate-100"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    className="stroke-[#D9A71E]"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray="238.76"
                    strokeDashoffset={238.76 - (238.76 * completedCount) / totalSteps}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center leading-none text-center select-none">
                  <span className="text-base font-black text-hive-text font-sans">{completedCount}/{totalSteps}</span>
                  <span className="text-[9px] font-bold text-hive-text-muted mt-1 font-sans">{completionPercentage}%</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 justify-center text-left w-full">
                <h2 className="text-lg md:text-xl font-serif font-extrabold text-hive-text leading-tight">Get Your Shop Ready</h2>
                <p className="text-[11px] md:text-xs font-semibold text-hive-text-muted leading-normal max-w-xs">
                  {completionPercentage === 100 
                    ? "Your storefront is completely ready for live orders." 
                    : "Welcome to Hive! Let's get your digital storefront ready for customers."}
                </p>
                <div className="mt-3.5 w-full">
                  <Link href="/boutique/products" className="w-full">
                    <Button className="w-full border-2 border-[#F5C22B] bg-transparent text-[#D9A71E] hover:bg-[#F5C22B]/10 rounded-full py-3.5 font-bold text-xs uppercase tracking-widest transition-all duration-150 active:scale-[0.98]">
                      ADD FIRST PRODUCT
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
