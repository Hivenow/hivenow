"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card } from "@hive/ui";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldAlert,
  X,
  Banknote,
  Clock,
  Lock,
  Unlock,
  Download,
  Ban,
  HandCoins,
} from "lucide-react";

const STATE_TABS: Array<{ key: string; label: string }> = [
  { key: "attention", label: "Needs attention" },
  { key: "", label: "All orders" },
  { key: "failed", label: "Failed" },
  { key: "withheld", label: "On hold" },
  { key: "eligible", label: "Eligible" },
  { key: "processing", label: "Processing" },
  { key: "pending", label: "Pending" },
  { key: "not_eligible", label: "Not eligible" },
  { key: "paid", label: "Paid" },
  { key: "settled", label: "Settled" },
  { key: "none", label: "No payout state" },
];

const formatCurrency = (paise: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((paise ?? 0) / 100);

const formatDate = (ms: number | null | undefined) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const statusChip = (row: any) => {
  const state = row.payoutStatus ?? "none";
  const tone =
    state === "paid" || state === "settled"
      ? "bg-emerald-100 text-emerald-800"
      : state === "failed"
        ? "bg-red-100 text-red-800"
        : state === "withheld" || state === "processing"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${tone}`}>
      {state.replace("_", " ")}
    </span>
  );
};

export default function PayoutMonitorPage() {
  const [tab, setTab] = useState<string>("attention");
  const [boutiqueId, setBoutiqueId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeTestData, setIncludeTestData] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<any | null>(null);

  const [controlNote, setControlNote] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const retryTransfer = useAction(api.razorpayRoute.retrySellerTransfer);
  const inspectAtRazorpay = useAction(api.adminPayoutMonitor.inspectOrderMoneyAdmin);
  const payFromBalance = useAction(api.adminPayoutMonitor.payFromHiveBalanceAdmin);
  const setPayoutHold = useAction(api.adminPayoutMonitor.setPayoutHoldAdmin);
  const capturePayment = useAction(api.adminPayoutMonitor.capturePaymentAdmin);
  const cancelAndRefund = useMutation(api.adminPayoutMonitor.cancelAndRefundOrderAdmin);
  const setSellerFreeze = useMutation(api.adminPayoutMonitor.setSellerPayoutFreezeAdmin);

  const data = useQuery(api.adminPayoutMonitor.getPayoutMonitorAdmin, {
    payoutStatus: tab || undefined,
    boutiqueId: (boutiqueId || undefined) as any,
    search: search || undefined,
    fromMs: fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : undefined,
    toMs: toDate ? new Date(`${toDate}T23:59:59`).getTime() : undefined,
    includeTestData: includeTestData || undefined,
  });

  const tabCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const counts: Record<string, number> = { "": 0, attention: data.attention.count };
    for (const [key, cell] of Object.entries(data.summary as Record<string, any>)) {
      counts[key] = cell.count;
      counts[""] += cell.count;
    }
    return counts;
  }, [data]);

  const selectedSeller = useMemo(
    () => (data && boutiqueId ? data.sellers.find((s: any) => s.boutiqueId === boutiqueId) : null),
    [data, boutiqueId]
  );

  const runRetry = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      const result = await retryTransfer({ orderId: orderId as any });
      alert(result?.success ? "Payout retried. Status will update shortly." : `Retry result: ${JSON.stringify(result)}`);
    } catch (err: any) {
      alert(`Retry failed: ${err?.data?.message || err.message}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  /** Every control runs through here: confirm, call, show the outcome. */
  const runControl = async (
    orderId: string,
    confirmText: string,
    call: () => Promise<any>
  ) => {
    if (!window.confirm(confirmText)) return;
    setBusyOrderId(orderId);
    setResult(null);
    try {
      const outcome = await call();
      setResult(JSON.stringify(outcome, null, 2));
    } catch (err: any) {
      setResult(`Failed: ${err?.data?.message || err?.data || err.message}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const exportCsv = () => {
    const columns = [
      "orderNumber", "createdAt", "deliveredAt", "orderStatus", "boutiqueName",
      "razorpayAccountId", "customerPaidPaise", "sellerPayoutPaise", "hiveKeepsPaise",
      "gatewayFeePaise", "refundAmountPaise", "payoutStatus", "transferStatus",
      "razorpayTransferId", "razorpayPaymentId", "payoutHoldUntil", "payoutFailureReason",
      "disputeStatus", "settledUtr", "isTestData",
    ];
    const cell = (row: any, key: string) => {
      const value = row[key];
      if (value === null || value === undefined) return "";
      if (key.endsWith("Paise")) return (value / 100).toFixed(2);
      if (key.endsWith("At") || key === "payoutHoldUntil") return new Date(value).toISOString();
      return String(value).replace(/"/g, '""');
    };
    const csv = [
      columns.join(","),
      ...data!.rows.map((row: any) => columns.map((c) => `"${cell(row, c)}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `hive-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runInspect = async (orderId: string) => {
    setBusyOrderId(orderId);
    setInspection(null);
    try {
      setInspection(await inspectAtRazorpay({ orderId: orderId as any }));
    } catch (err: any) {
      setInspection({ error: err?.data?.message || err.message });
    } finally {
      setBusyOrderId(null);
    }
  };

  if (data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading payout monitor...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left font-sans max-w-[1400px] mx-auto w-full">
      <div>
        <h1 className="text-3xl font-serif font-black text-hive-dark mb-2">Seller Payout Monitor</h1>
        <p className="text-sm text-hive-text-muted">
          Every paid order with the money the customer paid, what the seller is owed, and where that payout stands.
        </p>
      </div>

      {/* Macro cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`p-5 rounded-[20px] border-none shadow-sm ${data.attention.count > 0 ? "bg-red-50" : "bg-[#FAF6F0]"}`}>
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#2A2312]/60 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Needs attention
          </span>
          <div className="font-serif font-black text-3xl text-[#2A2312]">{data.attention.count}</div>
          <p className="text-xs text-[#2A2312]/70 mt-1 font-medium">{formatCurrency(data.attention.payoutPaise)} at risk</p>
        </Card>
        <Card className="p-5 rounded-[20px] border-none shadow-sm bg-[#FAF6F0]">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#2A2312]/60 mb-2 block">Customer paid (filtered)</span>
          <div className="font-serif font-black text-3xl text-[#2A2312]">{formatCurrency(data.totals.customerPaidPaise)}</div>
          <p className="text-xs text-[#2A2312]/70 mt-1 font-medium">{data.totals.matchedOrders} orders shown</p>
        </Card>
        <Card className="p-5 rounded-[20px] border-none shadow-sm bg-[#FAF6F0]">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#2A2312]/60 mb-2 block">Seller payout (filtered)</span>
          <div className="font-serif font-black text-3xl text-[#2A2312]">{formatCurrency(data.totals.sellerPayoutPaise)}</div>
        </Card>
        <Card className="p-5 rounded-[20px] border-none shadow-sm bg-[#FAF6F0]">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#2A2312]/60 mb-2 block">Hive keeps (filtered)</span>
          <div className="font-serif font-black text-3xl text-[#2A2312]">{formatCurrency(data.totals.hiveKeepsPaise)}</div>
          <p className="text-xs text-[#2A2312]/70 mt-1 font-medium">Before Razorpay fee</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-hive-border bg-white shadow-sm rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {STATE_TABS.map((t) => (
            <button
              key={t.key || "all"}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === t.key ? "bg-hive-dark text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
              {tabCounts[t.key] !== undefined && (
                <span className="ml-1.5 opacity-70">{tabCounts[t.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Seller</span>
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs min-w-[220px]"
            >
              <option value="">All sellers</option>
              {data.sellers.map((s: any) => (
                <option key={s.boutiqueId} value={s.boutiqueId}>
                  {s.boutiqueName}
                  {s.razorpayAccountId ? "" : " (no Razorpay account)"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
          </label>

          <label className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Order number, payment id or transfer id
            </span>
            <div className="flex gap-2">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
                placeholder="HIVE-XXXXXX-0000"
                className="border border-slate-200 rounded-lg px-3 py-2 text-xs flex-1"
              />
              <button
                onClick={() => setSearch(searchInput)}
                className="bg-hive-dark text-white px-3 rounded-lg flex items-center"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 py-2">
            <input
              type="checkbox"
              checked={includeTestData}
              onChange={(e) => setIncludeTestData(e.target.checked)}
            />
            Show test-mode orders
            {data.testDataCount > 0 && <span className="text-slate-400">({data.testDataCount})</span>}
          </label>

          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50"
            title="Downloads exactly the rows shown below, amounts in rupees"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>

          <button
            onClick={() => {
              setTab("attention");
              setIncludeTestData(false);
              setBoutiqueId("");
              setSearchInput("");
              setSearch("");
              setFromDate("");
              setToDate("");
            }}
            className="text-xs font-bold text-slate-500 underline px-2 py-2"
          >
            Reset
          </button>
        </div>
      </Card>

      {/* Seller-wide freeze, only meaningful with one seller selected */}
      {selectedSeller && (
        <Card
          className={`border shadow-sm rounded-3xl p-5 flex flex-wrap items-center gap-4 ${
            selectedSeller.payoutsFrozen ? "border-red-200 bg-red-50" : "border-hive-border bg-white"
          }`}
        >
          <div className="flex-1 min-w-[280px]">
            <div className="font-bold text-hive-dark flex items-center gap-2">
              {selectedSeller.payoutsFrozen ? <Lock className="w-4 h-4 text-red-600" /> : <Unlock className="w-4 h-4 text-slate-400" />}
              {selectedSeller.boutiqueName} — payouts {selectedSeller.payoutsFrozen ? "frozen" : "normal"}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Freezing stops every release to this seller, including the automatic one at delivery.
              Their share is still reserved out of each payment, so nothing is lost — it simply stays
              frozen until you lift this. Money already settled is not affected.
            </p>
            {selectedSeller.payoutsFrozenReason && (
              <p className="text-xs font-semibold text-red-700 mt-1">Reason: {selectedSeller.payoutsFrozenReason}</p>
            )}
          </div>
          <button
            onClick={async () => {
              const frozen = !selectedSeller.payoutsFrozen;
              const reason = frozen
                ? window.prompt(`Why are you freezing payouts for ${selectedSeller.boutiqueName}?`)
                : undefined;
              if (frozen && !reason) return;
              if (!window.confirm(
                frozen
                  ? `Freeze all payouts for ${selectedSeller.boutiqueName}? Nothing will be released to them until you unfreeze.`
                  : `Unfreeze payouts for ${selectedSeller.boutiqueName}? Normal releases resume.`
              )) return;
              try {
                await setSellerFreeze({ boutiqueId: selectedSeller.boutiqueId as any, frozen, reason: reason ?? undefined });
              } catch (err: any) {
                alert(err?.data?.message || err.message);
              }
            }}
            className={`inline-flex items-center gap-2 font-extrabold text-[10px] uppercase tracking-widest px-4 py-3 rounded-lg text-white ${
              selectedSeller.payoutsFrozen ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
            }`}
          >
            {selectedSeller.payoutsFrozen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {selectedSeller.payoutsFrozen ? "Unfreeze payouts" : "Freeze payouts"}
          </button>
        </Card>
      )}

      {/* Table */}
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3 text-right">Customer paid</th>
                <th className="px-4 py-3 text-right">Seller payout</th>
                <th className="px-4 py-3 text-right">Hive keeps</th>
                <th className="px-4 py-3">Payout</th>
                <th className="px-4 py-3">Transfer</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.rows.map((row: any) => (
                <tr key={row.orderId} className="hover:bg-slate-50/50 transition-colors align-top">
                  <td className="px-4 py-4">
                    <div className="font-bold text-hive-dark flex items-center gap-1.5">
                      {row.orderNumber}
                      {row.isTestData && (
                        <span className="bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase">test</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">{formatDate(row.createdAt)}</div>
                    <div className="text-[10px] text-slate-400">{row.orderStatus}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold">{row.boutiqueName}</div>
                    {row.razorpayAccountId ? (
                      <div className="font-mono text-[10px] text-slate-400">{row.razorpayAccountId}</div>
                    ) : (
                      <div className="text-[10px] font-bold text-red-600">No Razorpay account</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold">{formatCurrency(row.customerPaidPaise)}</td>
                  <td className="px-4 py-4 text-right font-black text-[#2E7D32]">
                    {formatCurrency(row.sellerPayoutPaise)}
                    {row.payoutSource === "legacy" && (
                      <div className="text-[10px] font-medium text-amber-600">legacy estimate</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">{formatCurrency(row.hiveKeepsPaise)}</td>
                  <td className="px-4 py-4">
                    {statusChip(row)}
                    {row.attentionReasons.length > 0 && (
                      <div className="mt-1.5 text-[10px] font-semibold text-red-600 flex items-start gap-1">
                        <ShieldAlert className="w-3 h-3 mt-[1px] shrink-0" />
                        <span>{row.attentionReasons.join(" · ")}</span>
                      </div>
                    )}
                    {row.payoutHoldUntil && (
                      <div className="text-[10px] text-slate-400 mt-1">Hold until {formatDate(row.payoutHoldUntil)}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-[11px]">{row.transferStatus ?? "—"}</div>
                    {row.razorpayTransferId && (
                      <div className="font-mono text-[10px] text-slate-400">{row.razorpayTransferId}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        onClick={() => {
                          setDetail(row);
                          setInspection(null);
                          setResult(null);
                          setControlNote("");
                          setHoldUntil("");
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-hive-dark"
                      >
                        Details
                      </button>
                      {row.retryable && (
                        <button
                          disabled={busyOrderId === row.orderId}
                          onClick={() => runRetry(row.orderId)}
                          className="inline-flex items-center gap-1 bg-hive-dark text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-2 rounded-lg hover:bg-black disabled:opacity-50"
                        >
                          {busyOrderId === row.orderId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                    No orders match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data.truncated && (
          <div className="px-6 py-3 text-[11px] text-slate-500 border-t border-slate-100">
            Showing the first {data.rows.length} matches. Narrow the filters to see the rest.
          </div>
        )}
      </Card>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-full md:max-w-lg bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-[#FAF6F0]">
              <h2 className="font-serif font-black text-lg text-[#2A2312]">{detail.orderNumber}</h2>
              <button onClick={() => setDetail(null)} className="p-1 rounded-full hover:bg-black/5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 text-xs">
              <section className="flex flex-col gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">Money</h3>
                <Line label="Customer paid" value={formatCurrency(detail.customerPaidPaise)} />
                <Line label="Seller payout" value={formatCurrency(detail.sellerPayoutPaise)} />
                <Line label="Hive keeps" value={formatCurrency(detail.hiveKeepsPaise)} />
                <Line label="Razorpay fee" value={detail.gatewayFeePaise === null ? "not recorded" : formatCurrency(detail.gatewayFeePaise)} />
                <Line label="Refunded" value={detail.refundAmountPaise ? formatCurrency(detail.refundAmountPaise) : "—"} />
                <Line label="Payout figure from" value={detail.payoutSource} />
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">Payout state</h3>
                <Line label="Payout status" value={detail.payoutStatus ?? "—"} />
                <Line label="Transfer status" value={detail.transferStatus ?? "—"} />
                <Line label="Transfer id" value={detail.razorpayTransferId ?? "—"} mono />
                <Line label="Payment id" value={detail.razorpayPaymentId ?? "—"} mono />
                <Line label="Delivered" value={formatDate(detail.deliveredAt)} />
                <Line label="Eligible at" value={formatDate(detail.payoutEligibleAt)} />
                <Line label="Hold until" value={formatDate(detail.payoutHoldUntil)} />
                <Line label="Hold reason" value={detail.payoutHoldReason ?? "—"} />
                <Line label="Processed at" value={formatDate(detail.payoutProcessedAt)} />
                <Line label="Failure reason" value={detail.payoutFailureReason ?? "—"} />
                <Line label="Chargeback" value={detail.disputeStatus ?? "—"} />
                <Line label="Manual UTR" value={detail.settledUtr ?? "—"} mono />
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">Seller</h3>
                <Line label="Boutique" value={detail.boutiqueName} />
                <Line label="Razorpay account" value={detail.razorpayAccountId ?? "not created"} mono />
                <Line label="KYC" value={detail.kycStatus ?? "—"} />
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                  Controls
                </h3>
                <p className="text-[11px] text-slate-500">
                  Each control below moves real money or changes when it moves. Every use is written to
                  the audit log with your name.
                </p>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Note / reason (saved with the action)
                  </span>
                  <input
                    value={controlNote}
                    onChange={(e) => setControlNote(e.target.value)}
                    placeholder="e.g. store credit order, paying seller manually"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </label>

                <ControlCard
                  icon={<HandCoins className="w-4 h-4" />}
                  title="Pay seller from Hive balance"
                  what="Sends the seller their payout straight out of Hive's Razorpay balance instead of splitting the customer's payment."
                  when="Use when the customer paid with store credit (₹0 captured) or the payment can no longer carry a transfer. Hive's balance must cover it."
                  disabledReason={
                    detail.razorpayTransferId
                      ? "A transfer already exists for this order."
                      : detail.payoutStatus === "paid" || detail.payoutStatus === "settled"
                        ? "This payout is already done."
                        : !detail.razorpayAccountId
                          ? "This seller has no Razorpay account yet."
                          : detail.sellerPayoutsFrozen
                            ? "This seller's payouts are frozen."
                            : null
                  }
                  busy={busyOrderId === detail.orderId}
                  buttons={[
                    {
                      label: `Pay ${formatCurrency(detail.sellerPayoutPaise)} now`,
                      tone: "primary",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Send ${formatCurrency(detail.sellerPayoutPaise)} from Hive's Razorpay balance to ${detail.boutiqueName} for ${detail.orderNumber}? This moves real money and cannot be undone from here.`,
                          () =>
                            payFromBalance({
                              orderId: detail.orderId as any,
                              reason: controlNote || "Manual payout from Hive balance",
                            })
                        ),
                    },
                    {
                      label: "Send but keep frozen",
                      tone: "ghost",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Send ${formatCurrency(detail.sellerPayoutPaise)} to ${detail.boutiqueName} but keep it frozen in their Razorpay account? You release it later from this same drawer.`,
                          () =>
                            payFromBalance({
                              orderId: detail.orderId as any,
                              hold: true,
                              reason: controlNote || "Manual payout from Hive balance, held",
                            })
                        ),
                    },
                  ]}
                />

                <ControlCard
                  icon={<Clock className="w-4 h-4" />}
                  title="Change the hold on this payout"
                  what="Release the seller's frozen money now, park it until a date you pick, or freeze it with no end date."
                  when="Release once you are sure the order is settled. Hold until a date to extend the return window. Freeze indefinitely while a return or investigation is open."
                  disabledReason={
                    !detail.razorpayTransferId
                      ? "No transfer exists yet, so there is nothing to hold or release."
                      : detail.payoutStatus === "paid" || detail.payoutStatus === "settled"
                        ? "This payout was already released."
                        : null
                  }
                  busy={busyOrderId === detail.orderId}
                  extra={
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Hold until (for the middle button)
                      </span>
                      <input
                        type="datetime-local"
                        value={holdUntil}
                        onChange={(e) => setHoldUntil(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </label>
                  }
                  buttons={[
                    {
                      label: "Release now",
                      tone: "primary",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Release ${formatCurrency(detail.sellerPayoutPaise)} to ${detail.boutiqueName}? Razorpay settles it to their bank on their normal cycle and it can no longer be reversed automatically.`,
                          () =>
                            setPayoutHold({
                              orderId: detail.orderId as any,
                              mode: "release",
                              reason: controlNote || "Released by admin",
                            })
                        ),
                    },
                    {
                      label: "Hold until date",
                      tone: "ghost",
                      onClick: () => {
                        if (!holdUntil) {
                          alert("Pick a date and time first.");
                          return;
                        }
                        const untilMs = new Date(holdUntil).getTime();
                        runControl(
                          detail.orderId,
                          `Keep ${formatCurrency(detail.sellerPayoutPaise)} frozen until ${new Date(untilMs).toLocaleString("en-IN")}? Razorpay releases it automatically after that.`,
                          () =>
                            setPayoutHold({
                              orderId: detail.orderId as any,
                              mode: "hold_until",
                              untilMs,
                              reason: controlNote || "Hold date set by admin",
                            })
                        );
                      },
                    },
                    {
                      label: "Freeze with no end date",
                      tone: "ghost",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Freeze ${formatCurrency(detail.sellerPayoutPaise)} indefinitely? It stays in the seller's account, unusable, until you release it here.`,
                          () =>
                            setPayoutHold({
                              orderId: detail.orderId as any,
                              mode: "hold_indefinite",
                              reason: controlNote || "Frozen by admin",
                            })
                        ),
                    },
                  ]}
                />

                <ControlCard
                  icon={<Banknote className="w-4 h-4" />}
                  title="Capture the payment"
                  what="Takes money that Razorpay only reserved on the customer's card."
                  when="Only needed when a payment sits at 'authorised' — auto-capture off, or it failed. After capturing, Razorpay's webhook places the order and creates the seller transfer by itself."
                  disabledReason={detail.capturable ? null : "This payment is already captured or has no Razorpay payment to capture."}
                  busy={busyOrderId === detail.orderId}
                  buttons={[
                    {
                      label: "Capture now",
                      tone: "primary",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Capture the authorised payment for ${detail.orderNumber}? This takes the money from the customer.`,
                          () => capturePayment({ orderId: detail.orderId as any })
                        ),
                    },
                  ]}
                />

                <ControlCard
                  icon={<Ban className="w-4 h-4" />}
                  title="Cancel order and refund customer"
                  what="Cancels the order and queues a full refund. The seller's transfer is reversed along with it, so nobody is paid for a cancelled order."
                  when="Use before delivery. The refund leaves within minutes; the customer's bank shows it in 5-7 working days. Delivered orders must go through Returns & Exchanges instead."
                  disabledReason={
                    detail.orderStatus === "cancelled"
                      ? "This order is already cancelled."
                      : detail.orderStatus === "delivered"
                        ? "Delivered — use Returns & Exchanges so the goods come back first."
                        : null
                  }
                  busy={busyOrderId === detail.orderId}
                  buttons={[
                    {
                      label: "Cancel and refund",
                      tone: "danger",
                      onClick: () =>
                        runControl(
                          detail.orderId,
                          `Cancel ${detail.orderNumber} and refund ${formatCurrency(detail.customerPaidPaise)} to the customer? The seller's transfer is reversed too.`,
                          () =>
                            cancelAndRefund({
                              orderId: detail.orderId as any,
                              reason: controlNote || "Cancelled by admin from Payout Monitor",
                            })
                        ),
                    },
                  ]}
                />

                <ControlCard
                  icon={detail.sellerPayoutsFrozen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  title={detail.sellerPayoutsFrozen ? "Unfreeze this seller" : "Freeze this seller's payouts"}
                  what="Applies to every order of this seller, not just this one."
                  when="Freeze during a fraud check or an account problem: their share is still reserved from each payment but never released. Unfreeze to resume normal releases."
                  disabledReason={null}
                  busy={busyOrderId === detail.orderId}
                  buttons={[
                    {
                      label: detail.sellerPayoutsFrozen ? "Unfreeze seller" : "Freeze seller",
                      tone: detail.sellerPayoutsFrozen ? "primary" : "danger",
                      onClick: async () => {
                        const frozen = !detail.sellerPayoutsFrozen;
                        const reason = frozen
                          ? window.prompt(`Why are you freezing payouts for ${detail.boutiqueName}?`)
                          : undefined;
                        if (frozen && !reason) return;
                        await runControl(
                          detail.orderId,
                          frozen
                            ? `Freeze all payouts for ${detail.boutiqueName}?`
                            : `Unfreeze payouts for ${detail.boutiqueName}?`,
                          () =>
                            setSellerFreeze({
                              boutiqueId: detail.boutiqueId as any,
                              frozen,
                              reason: reason ?? undefined,
                            })
                        );
                      },
                    },
                  ]}
                />

                {result && (
                  <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[10px] overflow-x-auto whitespace-pre-wrap">
                    {result}
                  </pre>
                )}
              </section>

              <button
                disabled={busyOrderId === detail.orderId}
                onClick={() => runInspect(detail.orderId)}
                className="inline-flex items-center justify-center gap-2 border border-slate-200 rounded-lg px-4 py-3 font-bold text-[11px] uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
              >
                {busyOrderId === detail.orderId ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Ask Razorpay what really happened
              </button>

              {inspection && (
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[10px] overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(inspection, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One control: what it does, when to use it, and its buttons. A disabled control
 * still explains itself, so it is obvious why it cannot be used right now.
 */
function ControlCard({
  icon,
  title,
  what,
  when,
  disabledReason,
  busy,
  buttons,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  what: string;
  when: string;
  disabledReason: string | null;
  busy: boolean;
  buttons: Array<{ label: string; tone: "primary" | "danger" | "ghost"; onClick: () => void }>;
  extra?: React.ReactNode;
}) {
  const disabled = !!disabledReason || busy;
  const toneClass = (tone: string) =>
    tone === "primary"
      ? "bg-hive-dark text-white hover:bg-black"
      : tone === "danger"
        ? "bg-red-700 text-white hover:bg-red-800"
        : "border border-slate-200 text-slate-700 hover:bg-slate-50";

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${disabledReason ? "border-slate-100 bg-slate-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center gap-2 font-bold text-hive-dark text-xs">
        {icon}
        {title}
      </div>
      <p className="text-[11px] text-slate-600">{what}</p>
      <p className="text-[11px] text-slate-500">{when}</p>
      {disabledReason ? (
        <p className="text-[11px] font-semibold text-slate-400">Not available: {disabledReason}</p>
      ) : (
        <>
          {extra}
          <div className="flex flex-wrap gap-2 pt-1">
            {buttons.map((b) => (
              <button
                key={b.label}
                disabled={disabled}
                onClick={b.onClick}
                className={`inline-flex items-center gap-1.5 font-extrabold text-[10px] uppercase tracking-widest px-3 py-2.5 rounded-lg disabled:opacity-50 ${toneClass(b.tone)}`}
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold text-slate-800 text-right ${mono ? "font-mono text-[10px] break-all" : ""}`}>{value}</span>
    </div>
  );
}
