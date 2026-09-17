"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Loader2, Plus, TicketPercent, X } from "lucide-react";
import { toast } from "@hive/utils";
import { LoadingState } from "@hive/ui";

type CouponRow = NonNullable<ReturnType<typeof useQuery<typeof api.promoCoupons.listMyPromoCoupons>>>[number];

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function describeOffer(c: Pick<CouponRow, "discountType" | "discountValue" | "maxDiscountPaise" | "minOrderPaise">) {
  const parts = [
    c.discountType === "percentage" ? `${c.discountValue}% off` : `${rupees(c.discountValue)} off`,
  ];
  if (c.discountType === "percentage" && c.maxDiscountPaise) parts.push(`up to ${rupees(c.maxDiscountPaise)}`);
  if (c.minOrderPaise > 0) parts.push(`min order ${rupees(c.minOrderPaise)}`);
  return parts.join(" · ");
}

function statusOf(c: CouponRow, now: number): { label: string; className: string } {
  if (c.status === "expired" || (c.expiresAt && c.expiresAt <= now)) {
    return { label: "Ended", className: "bg-slate-100 text-slate-500" };
  }
  if (c.status === "paused") return { label: "Paused", className: "bg-slate-100 text-slate-600" };
  if (c.usedCount >= c.usageLimit) return { label: "Used up", className: "bg-slate-100 text-slate-500" };
  if (c.startsAt && c.startsAt > now) return { label: "Scheduled", className: "bg-slate-100 text-slate-700" };
  return { label: "Live", className: "bg-emerald-50 text-emerald-700" };
}

const EMPTY_FORM = {
  code: "",
  discountType: "percentage" as "percentage" | "fixed",
  value: "",
  maxDiscount: "",
  minOrder: "",
  usageLimit: "100",
  perUserLimit: "1",
  endsOn: "",
};

export default function BoutiqueCouponsPage() {
  const coupons = useQuery(api.promoCoupons.listMyPromoCoupons, {});
  const createCoupon = useMutation(api.promoCoupons.createMyPromoCoupon);
  const toggleStatus = useMutation(api.promoCoupons.toggleMyPromoCouponStatus);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  if (coupons === undefined) {
    return <LoadingState message="Loading coupons..." variant="full" />;
  }

  const now = Date.now();
  const ownCoupons = coupons.filter((c) => c.fundedBy === "seller");
  const hiveCoupons = coupons.filter((c) => c.fundedBy !== "seller");
  const totalCostPaise = ownCoupons.reduce((sum, c) => sum + c.totalDiscountGivenPaise, 0);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Live example on a ₹1,000 order so the seller sees what the coupon costs them.
  const exampleOrderPaise = 100000;
  const valueNum = Number(form.value);
  let exampleDiscountPaise = 0;
  if (valueNum > 0) {
    if (form.discountType === "percentage") {
      exampleDiscountPaise = Math.round((exampleOrderPaise * valueNum) / 100);
      const cap = Number(form.maxDiscount);
      if (cap > 0) exampleDiscountPaise = Math.min(exampleDiscountPaise, Math.round(cap * 100));
    } else {
      exampleDiscountPaise = Math.min(Math.round(valueNum * 100), exampleOrderPaise);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !(valueNum > 0)) {
      toast.error("Missing Details", "Add a code and how much off it gives.");
      return;
    }
    setSaving(true);
    try {
      const endsOn = form.endsOn ? new Date(`${form.endsOn}T23:59:59`).getTime() : undefined;
      const result = await createCoupon({
        code: form.code,
        discountType: form.discountType,
        discountValue: form.discountType === "percentage" ? valueNum : Math.round(valueNum * 100),
        minOrderPaise: Math.round((Number(form.minOrder) || 0) * 100),
        maxDiscountPaise:
          form.discountType === "percentage" && Number(form.maxDiscount) > 0
            ? Math.round(Number(form.maxDiscount) * 100)
            : undefined,
        usageLimit: Math.round(Number(form.usageLimit) || 0),
        perUserLimit: Math.round(Number(form.perUserLimit) || 0),
        expiresAt: endsOn,
      });
      toast.success("Coupon Created", `${result.code} is live for your store.`);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err: any) {
      toast.error("Couldn't Create Coupon", err?.data || err?.message || "Please check the details and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (couponId: Id<"promoCoupons">) => {
    setTogglingId(couponId);
    try {
      const { newStatus } = await toggleStatus({ couponId });
      toast.success(newStatus === "active" ? "Coupon Resumed" : "Coupon Paused");
    } catch (err: any) {
      toast.error("Couldn't Update Coupon", err?.data || err?.message || "Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  const inputClass =
    "w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-slate-900 placeholder:text-slate-400";
  const labelClass = "text-[11px] font-bold text-slate-600";

  return (
    <div className="max-w-3xl mx-auto font-sans flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Coupons</h1>
          <p className="text-xs text-slate-500 font-medium max-w-md">
            Discount codes for your store. You pay for the discount: it comes out of your payout for that order,
            and Hive&apos;s commission is charged on the discounted price.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 h-10 px-4 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New coupon
          </button>
        )}
      </div>

      {ownCoupons.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Redemptions</span>
            <span className="text-xl font-black text-slate-900">
              {ownCoupons.reduce((sum, c) => sum + c.usedCount, 0)}
            </span>
          </div>
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Discount you gave</span>
            <span className="text-xl font-black text-slate-900">{rupees(totalCostPaise)}</span>
          </div>
        </div>
      )}

      {/* Create form */}
      {formOpen && (
        <form onSubmit={handleCreate} className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">New coupon</span>
            <button
              type="button"
              onClick={() => { setFormOpen(false); setForm(EMPTY_FORM); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Code</span>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, "") }))}
              placeholder="e.g. ONAM15"
              maxLength={20}
              className={`${inputClass} font-bold tracking-wider uppercase`}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Discount</span>
            <div className="flex gap-2">
              <div className="flex p-0.5 bg-slate-100 rounded-xl shrink-0">
                {(["percentage", "fixed"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, discountType: type, value: "", maxDiscount: "" }))}
                    className={`px-3 h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      form.discountType === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {type === "percentage" ? "% off" : "₹ off"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={form.discountType === "percentage" ? 50 : 5000}
                value={form.value}
                onChange={set("value")}
                placeholder={form.discountType === "percentage" ? "10" : "200"}
                className={inputClass}
              />
            </div>
            <span className="text-[10px] text-slate-400">
              {form.discountType === "percentage" ? "1 to 50%" : "₹10 to ₹5,000"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {form.discountType === "percentage" && (
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Max discount (₹, optional)</span>
                <input type="number" inputMode="numeric" min={1} value={form.maxDiscount} onChange={set("maxDiscount")} placeholder="No cap" className={inputClass} />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Min order (₹, optional)</span>
              <input type="number" inputMode="numeric" min={0} value={form.minOrder} onChange={set("minOrder")} placeholder="None" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Total uses</span>
              <input type="number" inputMode="numeric" min={1} value={form.usageLimit} onChange={set("usageLimit")} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Uses per customer</span>
              <input type="number" inputMode="numeric" min={1} value={form.perUserLimit} onChange={set("perUserLimit")} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Ends on (optional)</span>
              <input type="date" value={form.endsOn} onChange={set("endsOn")} className={inputClass} />
            </label>
          </div>

          {exampleDiscountPaise > 0 && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
              On a ₹1,000 order the customer saves <span className="font-bold text-slate-900">{rupees(exampleDiscountPaise)}</span>,
              and your payout for that order is <span className="font-bold text-slate-900">{rupees(exampleDiscountPaise)}</span> less
              (before commission).
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="h-11 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create coupon"}
          </button>
        </form>
      )}

      {/* Your coupons */}
      {ownCoupons.length === 0 && !formOpen ? (
        <div className="p-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center text-center gap-2">
          <TicketPercent className="w-7 h-7 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">No coupons yet</h3>
          <p className="text-xs text-slate-400 max-w-xs">
            Create a code like ONAM15 and share it with your customers on WhatsApp or Instagram.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ownCoupons.map((c) => {
            const status = statusOf(c, now);
            const canToggle = status.label !== "Ended";
            return (
              <div key={c._id} className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black tracking-wider text-slate-900">{c.code}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${status.className}`}>{status.label}</span>
                    </div>
                    <span className="text-xs text-slate-500">{describeOffer(c)}</span>
                  </div>
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => handleToggle(c._id)}
                      disabled={togglingId === c._id}
                      className="shrink-0 h-8 px-3 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 hover:border-slate-900 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {togglingId === c._id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : c.status === "active" ? "Pause" : "Resume"}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                  <span>
                    Used <span className="font-bold text-slate-900">{c.usedCount}</span> of {c.usageLimit}
                  </span>
                  <span>
                    You gave <span className="font-bold text-slate-900">{rupees(c.totalDiscountGivenPaise)}</span>
                  </span>
                  {c.expiresAt && (
                    <span>
                      {c.expiresAt > now ? "Ends" : "Ended"} {new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hive-run offers on this store */}
      {hiveCoupons.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-slate-900">Hive offers on your store</span>
            <span className="text-[11px] text-slate-500">Hive pays for these. Your payout is not affected.</span>
          </div>
          {hiveCoupons.map((c) => (
            <div key={c._id} className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-black tracking-wider text-slate-900">{c.code}</span>
                <span className="text-xs text-slate-500">{describeOffer(c)}</span>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${statusOf(c, now).className}`}>
                {statusOf(c, now).label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
