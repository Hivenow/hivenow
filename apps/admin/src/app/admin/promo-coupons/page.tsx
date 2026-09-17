"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import {
  Ticket,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Eye,
  X,
  Loader2,
  Users,
  TrendingUp,
  Clock,
  Tag,
  Store,
  Globe,
  ArrowLeft,
  Copy,
} from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function discountDisplay(type: string, value: number, maxPaise?: number): string {
  if (type === "percentage") {
    let s = `${value}%`;
    if (maxPaise) s += ` (max ${formatRupees(maxPaise)})`;
    return s;
  }
  return formatRupees(value);
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPromoCouponsPage() {
  const { isAuthenticated } = useConvexAuth();

  const [filterTab, setFilterTab] = useState<"all" | "active" | "paused" | "expired">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any | null>(null);
  const [viewingCouponId, setViewingCouponId] = useState<Id<"promoCoupons"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Data fetching
  const stats = useQuery(
    api.promoCoupons.getPromoCouponStatsAdmin,
    isAuthenticated ? {} : "skip"
  );
  const coupons = useQuery(
    api.promoCoupons.listPromoCouponsAdmin,
    isAuthenticated
      ? {
          status: filterTab === "all" ? undefined : filterTab,
          searchCode: searchQuery || undefined,
        }
      : "skip"
  );
  const couponDetail = useQuery(
    api.promoCoupons.getPromoCouponDetailAdmin,
    viewingCouponId ? { couponId: viewingCouponId } : "skip"
  );
  const boutiques = useQuery(
    api.boutiques.getBoutiques,
    isAuthenticated ? {} : "skip"
  );

  const createCoupon = useMutation(api.promoCoupons.createPromoCoupon);
  const updateCoupon = useMutation(api.promoCoupons.updatePromoCoupon);
  const toggleStatus = useMutation(api.promoCoupons.togglePromoCouponStatus);

  // ── Form state
  const defaultForm = {
    code: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 10,
    minOrderPaise: 0,
    maxDiscountPaise: 0,
    usageLimit: 100,
    perUserLimit: 1,
    scope: "platform" as "platform" | "boutique",
    boutiqueId: "" as string,
    startsAt: "",
    expiresAt: "",
  };

  const [form, setForm] = useState(defaultForm);

  const approvedBoutiques = useMemo(
    () => (boutiques || []).filter((b: any) => b.status === "APPROVED"),
    [boutiques]
  );

  // ── Handlers

  const handleOpenCreate = () => {
    setForm(defaultForm);
    setEditingCoupon(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountType === "fixed" ? coupon.discountValue / 100 : coupon.discountValue,
      minOrderPaise: coupon.minOrderPaise / 100,
      maxDiscountPaise: coupon.maxDiscountPaise ? coupon.maxDiscountPaise / 100 : 0,
      usageLimit: coupon.usageLimit,
      perUserLimit: coupon.perUserLimit,
      scope: coupon.scope,
      boutiqueId: coupon.boutiqueId || "",
      startsAt: coupon.startsAt ? new Date(coupon.startsAt).toISOString().slice(0, 16) : "",
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : "",
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        code: form.code,
        description: form.description,
        discountType: form.discountType,
        discountValue: form.discountType === "fixed" ? Math.round(form.discountValue * 100) : form.discountValue,
        minOrderPaise: Math.round(form.minOrderPaise * 100),
        maxDiscountPaise: form.discountType === "percentage" && form.maxDiscountPaise > 0
          ? Math.round(form.maxDiscountPaise * 100)
          : undefined,
        usageLimit: form.usageLimit,
        perUserLimit: form.perUserLimit,
        scope: form.scope,
        boutiqueId: form.scope === "boutique" && form.boutiqueId
          ? (form.boutiqueId as Id<"boutiques">)
          : undefined,
        startsAt: form.startsAt ? new Date(form.startsAt).getTime() : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : undefined,
      };

      if (editingCoupon) {
        await updateCoupon({
          couponId: editingCoupon._id,
          ...payload,
        });
      } else {
        await createCoupon(payload);
      }

      setIsCreateOpen(false);
      setEditingCoupon(null);
    } catch (err: any) {
      alert("Failed: " + (err?.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  // ── Status badge colors
  const statusStyles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    expired: "bg-rose-50 text-rose-700 border-rose-200",
  };

  const StatusIcon = ({ status }: { status: string }) =>
    status === "active" ? <CheckCircle2 className="w-3 h-3" /> :
    status === "paused" ? <Pause className="w-3 h-3" /> :
    <XCircle className="w-3 h-3" />;

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Ticket className="w-6 h-6 text-amber-500" />
            Promo Coupons
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and manage discount codes for your customers. Track usage, control limits, and target specific boutiques.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Create Coupon</span>
        </button>
      </div>

      {/* ── Stats Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active Coupons", value: stats?.activeCoupons ?? "—", icon: Tag, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Total Redemptions", value: stats?.totalRedemptions ?? "—", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Discount Given", value: stats ? formatRupees(stats.totalDiscountGivenPaise) : "—", icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Expiring in 7 Days", value: stats?.expiringWithin7Days ?? "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex items-start gap-3"
          >
            <div className={`${card.bg} rounded-xl p-2.5 shrink-0`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter + Search ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5">
          {(["all", "active", "paused", "expired"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterTab(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors cursor-pointer ${
                filterTab === tab
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* ── Coupons Table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {coupons === undefined ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            <span className="text-xs font-medium">Loading coupons...</span>
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Ticket className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No coupons found</p>
            <p className="text-xs text-slate-400">
              Create your first promo coupon to start giving discounts to customers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-4 py-3.5">Discount</th>
                  <th className="px-4 py-3.5">Usage</th>
                  <th className="px-4 py-3.5">Scope</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Expires</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.map((coupon) => (
                  <tr key={coupon._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-sm text-slate-900">{coupon.code}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(coupon.code)}
                              className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                              title="Copy code"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5 max-w-[200px] truncate">
                            {coupon.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-bold text-slate-800">
                        {discountDisplay(coupon.discountType, coupon.discountValue, coupon.maxDiscountPaise)}
                      </span>
                      {coupon.minOrderPaise > 0 && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Min: {formatRupees(coupon.minOrderPaise)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (coupon.usedCount / coupon.usageLimit) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-700">
                          {coupon.usedCount}/{coupon.usageLimit}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{coupon.perUserLimit}/user</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        coupon.scope === "platform"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                      }`}>
                        {coupon.scope === "platform" ? (
                          <><Globe className="w-2.5 h-2.5" /> All</>
                        ) : (
                          <><Store className="w-2.5 h-2.5" /> {coupon.boutiqueName || "Boutique"}</>
                        )}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {coupon.fundedBy === "seller" ? "Seller pays" : "Hive pays"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusStyles[coupon.status] || ""}`}>
                        <StatusIcon status={coupon.status} />
                        <span className="capitalize">{coupon.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[11px] text-slate-500 font-medium">
                      {coupon.expiresAt ? formatDate(coupon.expiresAt) : "Never"}
                    </td>
                    <td className="px-5 py-4 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingCouponId(coupon._id as Id<"promoCoupons">)}
                        title="View usage"
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(coupon)}
                        title="Edit"
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 hover:text-amber-600 transition-colors cursor-pointer"
                      >
                        <Tag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus({ couponId: coupon._id as Id<"promoCoupons"> })}
                        title={coupon.status === "active" ? "Pause" : "Activate"}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                      >
                        {coupon.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl space-y-5 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCoupon ? "Edit Promo Coupon" : "Create Promo Coupon"}
                </h2>
                <p className="text-xs text-slate-500">Set up your discount code and define rules.</p>
              </div>
              <button
                type="button"
                onClick={() => { setIsCreateOpen(false); setEditingCoupon(null); }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 text-xs">
              {/* Code + Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Coupon Code *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, "") })}
                    placeholder="WELCOME10"
                    disabled={!!editingCoupon}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold uppercase focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description *</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Welcome offer — 10% off for new users"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Discount Type + Value */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Discount Settings</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Type</label>
                    <div className="flex gap-2">
                      {(["percentage", "fixed"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, discountType: t })}
                          className={`flex-1 py-2 rounded-lg border text-center font-bold text-xs cursor-pointer transition-colors ${
                            form.discountType === t
                              ? "bg-amber-500 text-slate-950 border-amber-500 shadow-2xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {t === "percentage" ? "%" : "₹ Fixed"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {form.discountType === "percentage" ? "Percentage (%)" : "Amount (₹)"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                  {form.discountType === "percentage" && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Max Discount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.maxDiscountPaise}
                        onChange={(e) => setForm({ ...form, maxDiscountPaise: Number(e.target.value) })}
                        placeholder="0 = no cap"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min Order Value (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.minOrderPaise}
                    onChange={(e) => setForm({ ...form, minOrderPaise: Number(e.target.value) })}
                    placeholder="0 = no minimum"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none sm:w-1/2"
                  />
                </div>
              </div>

              {/* Limits */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Usage Limits</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Total Usage Limit</label>
                    <input
                      type="number"
                      min={1}
                      value={form.usageLimit}
                      onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Per User Limit</label>
                    <input
                      type="number"
                      min={1}
                      value={form.perUserLimit}
                      onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Scope */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Scope & Targeting</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Scope</label>
                    <div className="flex gap-2">
                      {(["platform", "boutique"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm({ ...form, scope: s })}
                          className={`flex-1 py-2 rounded-lg border text-center font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                            form.scope === s
                              ? "bg-amber-500 text-slate-950 border-amber-500 shadow-2xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {s === "platform" ? <><Globe className="w-3 h-3" /> All Boutiques</> : <><Store className="w-3 h-3" /> Specific</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.scope === "boutique" && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Select Boutique *</label>
                      <select
                        value={form.boutiqueId}
                        onChange={(e) => setForm({ ...form, boutiqueId: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      >
                        <option value="">— Select —</option>
                        {approvedBoutiques.map((b: any) => (
                          <option key={b._id} value={b._id}>
                            {b.boutiqueName || b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Hive pays for coupons created here; the seller still gets their full payout.
                  Sellers create coupons they pay for themselves in the Partners portal.
                </p>
              </div>

              {/* Schedule */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Schedule (Optional)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Starts At</label>
                    <input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Expires At</label>
                    <input
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => { setIsCreateOpen(false); setEditingCoupon(null); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !form.code || !form.description}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-bold text-sm shadow-sm transition-all cursor-pointer"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingCoupon ? "Save Changes" : "Create Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Usage Detail Drawer ───────────────────────────────────────── */}
      {viewingCouponId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-end p-0">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl border-l border-slate-200 flex flex-col animate-[slideInRight_0.2s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setViewingCouponId(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-bold text-slate-900">
                {couponDetail ? couponDetail.code : "Loading..."}
              </h2>
              <button
                type="button"
                onClick={() => setViewingCouponId(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {couponDetail === undefined ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              </div>
            ) : couponDetail ? (
              <div className="flex-1 overflow-y-auto">
                {/* Stats mini-cards */}
                <div className="grid grid-cols-3 gap-3 p-5">
                  <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Used</p>
                    <p className="text-xl font-black text-slate-900">{couponDetail.usedCount}</p>
                    <p className="text-[10px] text-slate-400">of {couponDetail.usageLimit}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Discount Given</p>
                    <p className="text-xl font-black text-slate-900">{formatRupees(couponDetail.totalDiscountGivenPaise)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                    <p className={`text-sm font-black capitalize mt-1 ${
                      couponDetail.status === "active" ? "text-emerald-600" :
                      couponDetail.status === "paused" ? "text-amber-600" : "text-rose-600"
                    }`}>{couponDetail.status}</p>
                  </div>
                </div>

                {/* Usage log */}
                <div className="px-5 pb-5">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                    Usage Log ({couponDetail.usages.length})
                  </h3>
                  {couponDetail.usages.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <Users className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                      No redemptions yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {couponDetail.usages.map((u: any) => (
                        <div
                          key={u._id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{u.userName}</p>
                            {u.userEmail && (
                              <p className="text-[10px] text-slate-400 truncate">{u.userEmail}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-xs font-mono font-bold text-emerald-700">
                              -{formatRupees(u.discountAppliedPaise)}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {u.orderNumber} · {formatDateTime(u.usedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Slide-in animation keyframes */}
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
