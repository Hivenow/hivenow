"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { StatCard, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@hive/ui";
import { formatCurrency } from "@hive/utils";
import { Store, CheckCircle, FolderKanban, Image as ImageIcon, ArrowRight, Loader2, ShieldX, ShoppingBag, Clock, TrendingUp, Package } from "lucide-react";
import Link from "next/link";
import { PWAStatsCard } from "../../components/pwa/PWAStatsCard";
import { BroadcastCampaignModal } from "../../components/pwa/BroadcastCampaignModal";
import { useMetricsBucket } from "@/hooks/useMetricsBucket";

export default function AdminDashboardPage() {
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const boutiques = useQuery(api.boutiques.getBoutiques, { excludeTestData: true });
  const categories = useQuery(api.categories.getCategories, {});
  const banners = useQuery(api.banners.getBanners, {});
  // Bucketed clock: see hooks/useMetricsBucket. Keeps this query a pure
  // function of its arguments instead of re-running on Convex's time-based
  // cache invalidation while the dashboard sits open.
  const nowBucket = useMetricsBucket();
  const orderMetrics = useQuery(api.adminOrders.getAdminDashboardMetrics, { nowBucket });

  // Track how long we've been waiting â€” if Convex auth is ready but queries
  // still return undefined, it means the query threw a role error (FORBIDDEN).
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (convexAuthLoading) return;
    const t = setTimeout(() => setWaitedLong(true), 6000);
    return () => clearTimeout(t);
  }, [convexAuthLoading]);

  const isStillLoading =
    boutiques === undefined ||
    categories === undefined ||
    banners === undefined ||
    orderMetrics === undefined;

  if (isStillLoading) {
    if (waitedLong) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
          <ShieldX className="w-10 h-10 text-red-400" />
          <p className="text-base font-bold text-slate-700">Access Denied</p>
          <p className="text-sm text-slate-500 max-w-sm">
            Your account does not have admin privileges. Make sure your Convex
            user record has <code className="bg-slate-100 px-1 rounded">role: "admin"</code>.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Gathering statistics from Convex...</p>
      </div>
    );
  }

  return (
    <AdminDashboardContent
      boutiques={boutiques}
      categories={categories}
      banners={banners}
      orderMetrics={orderMetrics}
      isBroadcastModalOpen={isBroadcastModalOpen}
      setIsBroadcastModalOpen={setIsBroadcastModalOpen}
    />
  );
}

function AdminDashboardContent({
  boutiques,
  categories,
  banners,
  orderMetrics,
  isBroadcastModalOpen,
  setIsBroadcastModalOpen,
}: {
  boutiques: any[];
  categories: any[];
  banners: any[];
  orderMetrics: any;
  isBroadcastModalOpen: boolean;
  setIsBroadcastModalOpen: (val: boolean) => void;
}) {
  const totalBoutiquesCount = boutiques.length;
  const approvedBoutiquesCount = boutiques.filter((b: any) => b.status === "APPROVED").length;
  const categoriesCount = categories.length;
  const activeBannersCount = banners.filter((b: any) => b.active).length;

  return (
    <div className="flex flex-col gap-8 text-left">
      
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-serif font-black text-hive-dark">Overview Dashboard</h1>
        <p className="text-sm text-hive-text-muted">Central directory configuration and marketplace registry statistics.</p>
      </div>

      {/* PWA App Download Analytics & Broadcast Campaign Action */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PWAStatsCard />
        </div>
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-amber-500/20 text-amber-500 rounded-lg text-xs font-bold">PROMO</span>
              <h4 className="text-sm font-bold text-slate-900">Customer Push Campaign</h4>
            </div>
            <p className="text-xs text-slate-600">
              Broadcast rich push notifications with Cloudflare R2 banners to all customer PWA apps.
            </p>
          </div>
          <button
            onClick={() => setIsBroadcastModalOpen(true)}
            className="mt-4 w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span>Broadcast Campaign ðŸš€</span>
          </button>
        </div>
      </div>

      <BroadcastCampaignModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
      />

      {/* Order KPI Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-hive-text-muted uppercase tracking-wider">Order Metrics</h2>
          <Link href="/admin/orders" className="text-xs font-bold text-hive-amber hover:text-hive-gold flex items-center gap-1 transition-colors">
            View All Orders <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { label: "Total Orders", value: orderMetrics.totalOrders, icon: ShoppingBag, color: "text-blue-500 bg-blue-50 border-blue-100" },
            { label: "Pending Orders", value: orderMetrics.pendingOrders, icon: Clock, color: "text-amber-500 bg-amber-50 border-amber-100" },
            { label: "Delivered", value: orderMetrics.deliveredOrders, icon: CheckCircle, color: "text-green-500 bg-green-50 border-green-100" },
            { label: "Total Revenue", value: formatCurrency(orderMetrics.totalRevenue), icon: TrendingUp, color: "text-indigo-500 bg-indigo-50 border-indigo-100" },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 sm:p-5 flex flex-col justify-between min-h-[100px] sm:min-h-[110px]"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] sm:text-xs font-bold text-hive-text-muted uppercase tracking-wider leading-tight">
                    {card.label}
                  </span>
                  <div className={`p-1.5 sm:p-2 rounded-xl border shrink-0 ${card.color}`}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <span className="text-xl sm:text-2xl font-extrabold text-hive-dark tracking-tight mt-2 sm:mt-3">
                  {card.value}
                </span>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Marketplace KPI Cards */}
      <div>
        <h2 className="text-sm font-bold text-hive-text-muted uppercase tracking-wider mb-3">Marketplace</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard
            title="Total Boutiques"
            value={totalBoutiquesCount}
            icon={<Store className="w-4 h-4" />}
          />
          <StatCard
            title="Approved Boutiques"
            value={approvedBoutiquesCount}
            icon={<CheckCircle className="w-4 h-4 text-green-500" />}
          />
          <StatCard
            title="Categories"
            value={categoriesCount}
            icon={<FolderKanban className="w-4 h-4" />}
          />
          <StatCard
            title="Active Banners"
            value={activeBannersCount}
            icon={<ImageIcon className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-serif font-bold text-hive-dark">Recent Orders</h2>
          <Link href="/admin/orders" className="text-xs font-bold text-hive-amber hover:text-hive-gold flex items-center gap-1 transition-colors">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-hive-border/40 text-[10px] font-bold uppercase tracking-wider text-hive-text-muted">
                    <th className="px-5 py-3.5">Order #</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Boutique</th>
                    <th className="px-5 py-3.5">Amount</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hive-border/30 font-medium text-hive-dark">
                  {orderMetrics.recentOrders.map((order: any) => (
                    <tr key={order._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-slate-700">
                        {order.orderNumber}
                      </td>
                      <td className="px-5 py-4 max-w-[140px] truncate">
                        {order.customerName}
                      </td>
                      <td className="px-5 py-4 max-w-[140px] truncate text-hive-text-muted">
                        {order.boutiqueName}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          order.status === "delivered" ? "bg-green-50 text-green-700 border-green-200" :
                          order.status === "cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                          order.status === "pending_confirmation" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {orderMetrics.recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-hive-text-muted">
                        No orders placed yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Setup Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Categories Shortcut */}
        <Card className="hover:shadow-md transition-shadow duration-200 border-hive-border bg-white">
          <CardHeader>
            <CardTitle className="font-serif font-bold text-lg flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-hive-gold" /> Categories Registry
            </CardTitle>
            <CardDescription>
              Configure product category mappings, upload icons, and edit category slugs.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/categories">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-hive-amber hover:text-hive-gold transition-colors cursor-pointer">
                Manage Categories <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </CardContent>
        </Card>

        {/* Banners Shortcut */}
        <Card className="hover:shadow-md transition-shadow duration-200 border-hive-border bg-white">
          <CardHeader>
            <CardTitle className="font-serif font-bold text-lg flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-hive-gold" /> Promo Banners
            </CardTitle>
            <CardDescription>
              Manage mobile and desktop homepage promotions, hyperlinks, and slide sorting.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/banners">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-hive-amber hover:text-hive-gold transition-colors cursor-pointer">
                Manage Banners <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </CardContent>
        </Card>

        {/* Boutiques Shortcut */}
        <Card className="hover:shadow-md transition-shadow duration-200 border-hive-border bg-white md:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif font-bold text-lg flex items-center gap-2">
              <Store className="w-5 h-5 text-hive-gold" /> Boutique Approvals & Registry
            </CardTitle>
            <CardDescription>
              Register new boutique designers, view details, search addresses on Leaflet maps, and confirm serviceable status.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/boutiques">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-hive-amber hover:text-hive-gold transition-colors cursor-pointer">
                Manage Boutiques <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

