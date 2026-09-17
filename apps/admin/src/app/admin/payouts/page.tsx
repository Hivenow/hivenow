"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card } from "@hive/ui";
import { Loader2, Copy, CheckCircle2, ChevronRight, AlertCircle, X, Banknote } from "lucide-react";

export default function PayoutReconciliation() {
  const payoutsData = useQuery(api.adminFinance.getPendingPayoutsAdmin);
  const handleSettlement = useMutation(api.orders.reconcileBoutiquePayouts);

  const [selectedBoutique, setSelectedBoutique] = useState<any | null>(null);
  const [utrNumber, setUtrNumber] = useState("");
  const [isSettling, setIsSettling] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(paise / 100);
  };

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const submitSettlement = async () => {
    if (!selectedBoutique || utrNumber.length < 10) return;

    setIsSettling(true);
    try {
      await handleSettlement({
        boutiqueId: selectedBoutique.boutiqueId,
        orderIds: selectedBoutique.orders.map((o: any) => o._id),
        utrNumber: utrNumber.trim(),
        netSettledAmount: selectedBoutique.netLiability,
        settledAt: Date.now(),
      });
      // Reset state and close drawer
      setSelectedBoutique(null);
      setUtrNumber("");
    } catch (err: any) {
      alert("Settlement failed: " + err.message);
    } finally {
      setIsSettling(false);
    }
  };

  if (payoutsData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading reconciliation ledger...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 text-left font-sans max-w-7xl mx-auto w-full relative">
      
      {/* 1. Page Header & Macro-Metrics */}
      <div>
        <h1 className="text-3xl font-serif font-black text-hive-dark mb-2">Admin Payout Reconciliation</h1>
        <p className="text-sm text-hive-text-muted mb-6">Manage outstanding liabilities, audit platform math, and log net banking settlements.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-[#FAF6F0] border-none shadow-sm p-6 rounded-[24px]">
            <span className="text-[10px] text-[#2A2312]/60 font-bold tracking-wider uppercase mb-2 block">Total Escrow Pool</span>
            <div className="font-serif font-black text-3xl text-[#2A2312]">{formatCurrency(payoutsData.totalEscrowPool)}</div>
            <p className="text-xs text-[#2A2312]/70 mt-2 font-medium">Gross customer funds captured</p>
          </Card>
          <Card className="bg-[#FAF6F0] border-none shadow-sm p-6 rounded-[24px]">
            <span className="text-[10px] text-[#2A2312]/60 font-bold tracking-wider uppercase mb-2 block">Pending Payouts</span>
            <div className="font-serif font-black text-3xl text-[#2A2312]">{payoutsData.pendingPayoutsCount} <span className="text-lg text-[#2A2312]/50 font-sans font-medium">boutiques</span></div>
            <p className="text-xs text-[#2A2312]/70 mt-2 font-medium">Waiting for active transfer</p>
          </Card>
          <Card className="bg-[#FAF6F0] border-none shadow-sm p-6 rounded-[24px]">
            <span className="text-[10px] text-[#2A2312]/60 font-bold tracking-wider uppercase mb-2 block">Settled This Week</span>
            <div className="font-serif font-black text-3xl text-[#2A2312]">{formatCurrency(payoutsData.settledThisWeek)}</div>
            <p className="text-xs text-[#2A2312]/70 mt-2 font-medium">Cleared within 7-day cycle</p>
          </Card>
        </div>
      </div>

      {/* 2. Core Reconciliation Table Matrix */}
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4">Boutique Name</th>
                <th className="px-6 py-4">Bank Details</th>
                <th className="px-6 py-4 text-center">Pending Orders</th>
                <th className="px-6 py-4 text-right">Net Liability</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {payoutsData.boutiques.map((b: any) => (
                <tr key={b.boutiqueId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5 font-bold text-hive-dark text-sm">{b.boutiqueName}</td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 inline-block w-max">A/C: {b.bankAccountNumber}</span>
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 inline-block w-max">IFSC: {b.bankIfscCode}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                      {b.pendingOrdersCount} orders
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-sm text-[#2E7D32]">
                    {formatCurrency(b.netLiability)}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button
                      onClick={() => {
                        setSelectedBoutique(b);
                        setUtrNumber("");
                      }}
                      className="inline-flex items-center gap-1.5 bg-hive-dark text-white font-extrabold text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-lg hover:bg-black transition-colors"
                    >
                      [Review & Settle] <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {payoutsData.boutiques.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
                      <p className="italic">All clear. No outstanding manual payouts.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. The Settle Drawer Component (Slide-over UI) */}
      {selectedBoutique && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in"
            onClick={() => setSelectedBoutique(null)}
          />
          
          {/* Slide-over panel */}
          <div className="relative w-full max-w-full md:max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-[#FAF6F0]">
              <div className="flex items-center gap-3">
                <Banknote className="w-5 h-5 text-[#2A2312]" />
                <h2 className="font-serif font-black text-lg text-[#2A2312]">{selectedBoutique.boutiqueName} Settlement</h2>
              </div>
              <button 
                onClick={() => setSelectedBoutique(null)}
                className="text-[#2A2312]/60 hover:text-[#2A2312] p-1 rounded-full hover:bg-black/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              
              {/* PENDING ORDERS AUDIT TRAIL */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-2">Pending Orders Audit Trail</h3>
                <div className="flex flex-col gap-3">
                  {selectedBoutique.orders.map((o: any) => (
                    <div key={o._id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-hive-dark text-xs">{o.orderNumber}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-600">Customer Paid: <span className="font-semibold text-slate-800">{formatCurrency(o.customerPaid)}</span></span>
                        <span className="text-slate-600">Seller Payout: <span className="font-semibold text-slate-800">{formatCurrency(o.netDisbursement)}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ITEMIZED DEDUCTION LEDGER */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-2">Itemized Deduction Ledger</h3>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-3 font-mono text-xs">
                  
                  {selectedBoutique.orders.map((o: any) => (
                    <div key={o._id} className="flex flex-col gap-1.5 pb-3 mb-3 border-b border-slate-200/60 last:border-0 last:pb-0 last:mb-0">
                      <div className="text-[10px] font-bold text-slate-400 mb-1 font-sans">{o.orderNumber} Breakdown</div>
                      <div className="flex justify-between text-slate-700">
                        <span>Customer paid:</span>
                        <span className="text-emerald-700">+{formatCurrency(o.customerPaid)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>- Kept by Hive (fees, commission, GST, delivery):</span>
                        <span className="text-red-600">-{formatCurrency(o.hiveKeeps)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-800 pt-1.5 mt-1 border-t border-slate-200 border-dashed">
                        <span>Seller payout:</span>
                        <span>={formatCurrency(o.netDisbursement)}</span>
                      </div>
                      {o.payoutSource === "legacy" && (
                        <div className="text-[10px] text-amber-700 font-sans">Older order without a saved price split: payout estimated from order totals.</div>
                      )}
                    </div>
                  ))}

                </div>
                
                {/* Net Disbursement Target */}
                <div className="mt-4 bg-[#EAF6ED] border border-[#C6EBD3] rounded-xl p-5 flex items-center justify-between">
                  <span className="text-sm font-bold text-[#2E7D32]">NET DISBURSEMENT AMOUNT:</span>
                  <span className="text-2xl font-mono tracking-tight font-black text-[#2E7D32]">
                    ={formatCurrency(selectedBoutique.netLiability)}
                  </span>
                </div>
              </section>

              {/* BANK CLEARANCE VERIFICATION */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-2">Bank Clearance Verification</h3>
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-medium">Beneficiary</span>
                    <span className="text-sm font-bold text-slate-800">{selectedBoutique.boutiqueName}</span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Account Number</span>
                      <span className="font-mono text-sm tracking-wider bg-hive-malt/5 px-2 py-1 rounded select-all text-hive-malt font-bold">
                        {selectedBoutique.bankAccountNumber}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleCopy(selectedBoutique.bankAccountNumber, 'acc')}
                      className="text-xs flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors font-medium text-slate-600"
                    >
                      {copiedField === 'acc' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'acc' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">IFSC Code</span>
                      <span className="font-mono text-sm tracking-wider bg-hive-malt/5 px-2 py-1 rounded select-all text-hive-malt font-bold">
                        {selectedBoutique.bankIfscCode}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleCopy(selectedBoutique.bankIfscCode, 'ifsc')}
                      className="text-xs flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors font-medium text-slate-600"
                    >
                      {copiedField === 'ifsc' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'ifsc' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </section>

            </div>

            {/* Drawer Footer - CLOSING RECONCILIATION DATA */}
            <div className="border-t border-slate-200 p-6 bg-slate-50 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Enter Bank Transaction UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTIB20260706881920"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-hive-dark focus:border-transparent font-mono text-sm shadow-sm"
                />
              </div>

              <button
                disabled={isSettling || utrNumber.length < 10}
                onClick={submitSettlement}
                className="w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest text-white bg-[#2E7D32] hover:bg-[#1B5E20] disabled:bg-slate-300 disabled:text-slate-500 transition-colors flex items-center justify-center gap-2"
              >
                {isSettling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Settlement Committing...
                  </>
                ) : (
                  "(( Settle Disbursement ))"
                )}
              </button>
              {utrNumber.length > 0 && utrNumber.length < 10 && (
                <p className="text-[10px] text-amber-600 font-medium flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> UTR must be at least 10 characters
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
