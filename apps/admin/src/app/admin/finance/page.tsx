"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent } from "@hive/ui";
import { CircleDollarSign, Loader2, Coins, CreditCard, Sparkles, RefreshCw, Database, ArrowRight, ShieldAlert, CheckCircle2, TrendingUp, Percent, BarChart2 } from "lucide-react";
import Link from "next/link";

export default function FinanceDashboardPage() {
  const metrics = useQuery(api.adminFinance.getFinanceDashboardMetricsAdmin);
  const settlements = useQuery(api.adminFinance.getSettlementsAdmin, {});
  const payouts = useQuery(api.adminFinance.getPayoutsAdmin, {});
  const regionalEconomics = useQuery(api.adminFinance.getRegionalEconomicsDashboardAdmin);

  const settleOrders = useMutation(api.adminFinance.settleEligibleOrdersAdmin);
  const seedFinanceData = useMutation(api.adminFinance.seedFinanceMockDataAdmin);

  const [processingSettle, setProcessingSettle] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Formatter helper (paise to INR)
  const formatCurrency = (paise?: number) => {
    if (paise === undefined) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(paise / 100);
  };

  const handleSettleOrders = async () => {
    setProcessingSettle(true);
    try {
      const res = await settleOrders();
      alert(`Settle Batch Run: Transitioned ${res.settledCount} pending orders to available status. Total settled: ${formatCurrency(res.settledAmountSum)}.`);
    } catch (err: any) {
      alert("Failed to settle orders: " + err.message);
    } finally {
      setProcessingSettle(false);
    }
  };

  const handleSeedFinance = async () => {
    setSeeding(true);
    try {
      const res = await seedFinanceData();
      alert(`Successfully seeded financial transactions for ${res.seededCount} historical paid orders!`);
    } catch (err: any) {
      alert("Failed to seed finance mock data: " + err.message);
    } finally {
      setSeeding(false);
    }
  };

  if (metrics === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading finance metrics...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 text-left">
      {/* Title & Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-black text-hive-dark">Finance Overview</h1>
          <p className="text-sm text-hive-text-muted">Manage platform commissions, track settlements, process payouts, and audit refund ledger lines.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/finance/reconciliation">
            <button
              className="flex items-center gap-2 border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 rounded-xl text-xs py-2.5 px-4 font-bold transition-all shadow-sm"
            >
              <BarChart2 className="w-3.5 h-3.5 text-[#8E867C]" />
              <span>Reconciliation Scan</span>
            </button>
          </Link>

          <button
            onClick={handleSettleOrders}
            disabled={processingSettle}
            className="flex items-center gap-2 border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-50 rounded-xl text-xs py-2.5 px-4 font-bold transition-all shadow-sm"
          >
            {processingSettle ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8E867C]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#8E867C]" />
            )}
            <span>Settle Eligible Orders</span>
          </button>
          
          <button
            onClick={handleSeedFinance}
            disabled={seeding}
            className="flex items-center gap-2 bg-hive-gold text-hive-dark hover:bg-hive-gold/90 disabled:opacity-50 rounded-xl text-xs py-2.5 px-4 font-extrabold transition-all shadow-sm shadow-hive-gold/10"
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            <span>Seed Finance Data</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 sm:gap-6">
        
        {/* 1. Gross GMV */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div>
            <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider block">
              Gross GMV
            </span>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-hive-dark tracking-tight">
              {formatCurrency(metrics.grossGmv)}
            </span>
            <span className="text-[9px] text-[#A89F91] font-semibold mt-1">Total Sales Confirmed</span>
          </div>
        </Card>

        {/* 2. Refund Rate */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider">
              Refund Rate
            </span>
            <div className="p-1 rounded-md bg-red-50 text-red-650 border border-red-100">
              <Percent className="w-3 h-3" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-hive-dark tracking-tight">
              {metrics.refundRate.toFixed(1)}%
            </span>
            <span className="text-[9px] text-red-750 font-bold mt-1">
              -{formatCurrency(metrics.totalRefunds)}
            </span>
          </div>
        </Card>

        {/* 3. Net GMV */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div>
            <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider block">
              Net GMV
            </span>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-hive-dark tracking-tight text-emerald-800">
              {formatCurrency(metrics.netGmv)}
            </span>
            <span className="text-[9px] text-emerald-700 font-semibold mt-1">Sales Less Refunds</span>
          </div>
        </Card>

        {/* 4. Platform Revenue */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider">
              Platform Revenue
            </span>
            <div className="p-1 rounded-md bg-emerald-50 text-emerald-650 border border-emerald-100">
              <TrendingUp className="w-3 h-3" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-hive-dark tracking-tight">
              {formatCurrency(metrics.platformRevenue)}
            </span>
            <span className="text-[9px] text-[#A89F91] font-semibold mt-1">Commissions Net GST</span>
            <span className="text-[9px] text-red-700 font-semibold">
              Razorpay fees −{formatCurrency(metrics.gatewayFees)}
              {metrics.paymentsMissingFee > 0 ? ` (${metrics.paymentsMissingFee} not recorded)` : ""}
            </span>
            <span className="text-[9px] text-hive-dark font-bold">
              After fees {formatCurrency(metrics.platformRevenue - metrics.gatewayFees)}
            </span>
          </div>
        </Card>

        {/* 5. Pending Settlements */}
        <Card className="border border-[#F0D597] bg-[#FAF3E0]/40 shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div>
            <span className="text-[10px] font-extrabold text-amber-850 uppercase tracking-wider block">
              Pending Settlements
            </span>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-amber-950 tracking-tight">
              {formatCurrency(metrics.pendingSettlements)}
            </span>
            <span className="text-[9px] text-amber-800 font-semibold mt-1">Held in Claim Windows</span>
          </div>
        </Card>

        {/* 6. Available For Payout */}
        <Card className="border border-[#A5D5A5] bg-[#EAF8EA]/30 shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div>
            <span className="text-[10px] font-extrabold text-emerald-850 uppercase tracking-wider block">
              Available For Payout
            </span>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-emerald-950 tracking-tight">
              {formatCurrency(metrics.availableForPayout)}
            </span>
            <span className="text-[9px] text-emerald-800 font-bold mt-1">Owed to Merchants</span>
          </div>
        </Card>

        {/* 7. Paid Out */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden p-4 flex flex-col justify-between min-h-[105px]">
          <div>
            <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider block">
              Paid Out
            </span>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-lg font-black text-hive-dark tracking-tight">
              {formatCurrency(metrics.totalPaidOut)}
            </span>
            <span className="text-[9px] text-[#A89F91] font-semibold mt-1">Total Payouts Settled</span>
          </div>
        </Card>

      </div>

      {/* Grid Layout: Settlements & Payouts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left: Settlements Awaiting Process */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl lg:col-span-2">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-hive-dark">Recent Ledger Accruals</h2>
              <p className="text-[11px] text-hive-text-muted">Overview of earnings ledger accruals waiting for payout batches.</p>
            </div>
            <Link href="/admin/settlements" className="text-xs text-hive-amber font-bold hover:underline flex items-center gap-1">
              View Settlements Queue <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3">Boutique</th>
                  <th className="px-6 py-3">Accrued Date</th>
                  <th className="px-6 py-3">Type / Source</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {settlements && settlements.slice(0, 5).map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-900 truncate max-w-[120px]">
                      {s.boutiqueName}
                    </td>
                    <td className="px-6 py-3.5 text-slate-550">
                      {new Date(s.accruedAt).toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-800 capitalize">{s.type.replace("_", " ")}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{s.source}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      {s.status === "available" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {s.payoutId ? "Processed" : "Available"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Pending
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-3.5 text-right font-black ${s.amount < 0 ? "text-red-650" : "text-slate-900"}`}>
                      {formatCurrency(s.amount)}
                    </td>
                  </tr>
                ))}
                {(!settlements || settlements.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                      No settlements logged. Run "Seed Finance Data" to mock order accruals.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right: Recent Payouts */}
        <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-hive-dark">Recent Payouts</h2>
              <p className="text-[11px] text-hive-text-muted">Batch bank transfers processing logs.</p>
            </div>
            <Link href="/admin/payouts" className="text-xs text-hive-amber font-bold hover:underline flex items-center gap-1">
              Registry <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {payouts && payouts.slice(0, 3).map((p) => (
              <div key={p._id} className="p-3.5 rounded-2xl border border-slate-100 flex flex-col gap-2.5 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] font-mono text-slate-400">{p.payoutNumber}</span>
                    <span className="text-xs font-black text-slate-900 mt-0.5">{p.boutiqueName}</span>
                  </div>
                  <span className="text-xs font-black text-emerald-800">{formatCurrency(p.amount)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-50 text-[10px]">
                  <span className="text-slate-400">
                    {new Date(p.createdAt).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold bg-green-50 text-green-700 border border-green-200">
                    ✓ Success
                  </span>
                </div>
              </div>
            ))}
            {(!payouts || payouts.length === 0) && (
              <p className="text-xs text-slate-400 italic py-8 text-center">No payouts recorded. Process payouts under the Payouts registry menu.</p>
            )}
          </div>
        </Card>

      </div>

      {/* Regional Economics Section */}
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl w-full">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-hive-dark">Kochi Regional Economics (by Locality)</h2>
          <p className="text-[11px] text-hive-text-muted">Analysis of GMV, delivery fees, Courier Costs, and resulting contribution margins per geocoded customer locality.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3">Locality</th>
                <th className="px-6 py-3 text-center">Orders</th>
                <th className="px-6 py-3 text-right">GMV</th>
                <th className="px-6 py-3 text-right">Delivery Revenue</th>
                <th className="px-6 py-3 text-right">Actual Courier Cost</th>
                <th className="px-6 py-3 text-right">Contribution Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {regionalEconomics ? (
                regionalEconomics.map((row: any) => {
                  const isPositiveMargin = row.contributionMargin >= 0;
                  return (
                    <tr key={row.locality} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900">{row.locality}</td>
                      <td className="px-6 py-3.5 text-center font-medium text-slate-600">{row.orderCount}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-slate-900">
                        ₹{row.gmv.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-slate-600">
                        ₹{row.deliveryRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-slate-600">
                        ₹{row.actualCourierCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-3.5 text-right font-black ${isPositiveMargin ? "text-emerald-700" : "text-red-650"}`}>
                        ₹{row.contributionMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-hive-amber" /> Loading regional aggregation...
                  </td>
                </tr>
              )}
              {regionalEconomics && regionalEconomics.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                    No regional economics data available. Run "Seed Finance Data" or process payments.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

