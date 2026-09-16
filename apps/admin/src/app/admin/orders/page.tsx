"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { OrderMoneyTrail } from "@/components/orders/OrderMoneyTrail";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@hive/ui";
import { formatCurrency } from "@hive/utils";
import {
  ShoppingBag,
  Clock,
  CheckCircle,
  TrendingUp,
  Search,
  Eye,
  Package,
  Filter,
  Loader2,
  ShieldX,
  X,
  MapPin,
  Store,
  User,
  CreditCard,
  Calendar,
  ArrowLeft,
  FileDown,
  Receipt,
  AlertTriangle,
  Phone,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useMetricsBucket } from "@/hooks/useMetricsBucket";

// ── Status badge helper ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_payment: "bg-yellow-50 text-yellow-700 border-yellow-200",
    pending_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    pickup_scheduled: "bg-purple-50 text-purple-700 border-purple-200",
    picked_up: "bg-violet-50 text-violet-700 border-violet-200",
    in_transit: "bg-cyan-50 text-cyan-700 border-cyan-200",
    out_for_delivery: "bg-teal-50 text-teal-700 border-teal-200",
    delivered: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-slate-50 text-slate-700 border-slate-200",
    claim_submitted: "bg-orange-50 text-orange-700 border-orange-200",
  };
  const cls = map[status] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    refunded: "bg-slate-50 text-slate-700 border-slate-200",
    failed: "bg-red-50 text-red-700 border-red-200",
  };
  const cls = map[status] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {status}
    </span>
  );
}

// ── Admin Invoice Section ─────────────────────────────────────────────────
function AdminInvoiceSection({ orderId }: { orderId: Id<"orders"> }) {
  const invoice = useQuery(api.invoices.getInvoiceByOrderId_admin, { orderId });

  if (invoice === undefined) {
    return (
      <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40 animate-pulse">
        <div className="h-3 w-1/3 bg-slate-200 rounded mb-2" />
        <div className="h-3 w-1/2 bg-slate-200 rounded" />
      </div>
    );
  }

  const handleDownload = () => {
    if (!invoice) return;
    if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, "_blank");
    }
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        <Receipt className="w-3 h-3" /> Invoice
      </div>

      {!invoice ? (
        <p className="text-xs text-hive-text-muted italic">Invoice not generated yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 text-xs mb-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Invoice No.</span>
              <span className="font-mono font-bold text-hive-dark select-all">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Transaction ID</span>
              <span className="font-mono text-hive-dark select-all">{invoice.transactionId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Generated</span>
              <span className="text-hive-dark">
                {new Date(invoice.generatedAt).toLocaleDateString("en-IN", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </span>
            </div>
          </div>
          {invoice.pdfUrl ? (
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-hive-dark text-hive-gold text-[10px] font-bold uppercase tracking-wider hover:bg-hive-amber/90 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download Invoice
            </button>
          ) : (
            <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
              PDF not yet generated. Customer must download first.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Admin Invoice Table Cell (compact) ────────────────────────────────────
/**
 * Renders the invoice column from the row the table already has.
 *
 * This used to run its own useQuery per row. With the list fetched at
 * limit: 200 that meant up to ~200 invoice subscriptions for one page view,
 * and invoices.getInvoiceByOrderId_admin became the most-called function in
 * the deployment. getAllOrders already returns invoiceNumber and invoicePdfUrl
 * for every row, so the query was fetching data the page had in hand. The
 * order detail drawer still queries the full invoice, where it is needed.
 */
function AdminInvoiceTableCell({
  invoiceNumber,
  invoicePdfUrl,
}: {
  invoiceNumber: string | null;
  invoicePdfUrl: string | null;
}) {
  if (!invoiceNumber || !invoicePdfUrl) {
    return (
      <span className="text-[9px] text-slate-400 font-medium italic whitespace-nowrap">
        {!invoiceNumber ? "No invoice" : "PDF pending"}
      </span>
    );
  }

  return (
    <button
      onClick={() => window.open(invoicePdfUrl, "_blank")}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-hive-border bg-white text-[9px] font-bold text-hive-dark hover:bg-hive-cream hover:border-hive-gold transition-colors whitespace-nowrap"
      title={invoiceNumber}
    >
      <FileDown className="w-3 h-3 text-hive-gold" />
      PDF
    </button>
  );
}

// ── Order Detail Drawer ────────────────────────────────────────────────────
function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: Id<"orders"> | null;
  onClose: () => void;
}) {
  const order = useQuery(
    api.adminOrders.getOrderDetails,
    orderId ? { orderId } : "skip"
  );
  const updateStatus = useMutation(api.adminOrders.updateOrderStatus);
  const approveReturn = useMutation(api.adminOrders.approveReturnAdmin);
  const initiateReturn = useMutation(api.adminOrders.initiateReturnAdmin);
  const acceptReturnAdmin = useMutation(api.returnInspection.acceptReturnedItemAdmin);
  const markReturned = useMutation(api.returnInspection.markReturnedAdmin);
  const resolveRejection = useMutation(api.returnInspection.resolveRejectedReturnAdmin);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [returnActionLoading, setReturnActionLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (!orderId || !order) return;

    // "Returned" is not an order status — returns are tracked separately. It
    // marks the item back at the boutique, which freezes the seller's payout
    // and puts the Accept / Reject step in front of the customer's refund.
    if (newStatus === "returned") {
      if (
        !window.confirm(
          "Mark this item as returned to the boutique? The seller's payout is frozen, and the customer is refunded only once the return is accepted."
        )
      ) {
        return;
      }
      setUpdatingStatus(true);
      try {
        await markReturned({ orderId });
      } catch (err: any) {
        alert("Failed to mark returned: " + err.message);
      } finally {
        setUpdatingStatus(false);
      }
      return;
    }
    setUpdatingStatus(true);
    try {
      await updateStatus({ orderId, status: newStatus as any });
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleApproveReturn = async () => {
    if (!orderId) return;
    setReturnActionLoading(true);
    try {
      await approveReturn({ orderId });
    } catch (err: any) {
      alert("Failed to approve return: " + err.message);
    } finally {
      setReturnActionLoading(false);
    }
  };

  const handleInitiateReturn = async () => {
    if (!orderId) return;
    setReturnActionLoading(true);
    try {
      await initiateReturn({ orderId });
    } catch (err: any) {
      alert("Failed to initiate return: " + err.message);
    } finally {
      setReturnActionLoading(false);
    }
  };

  // The refund waits for someone to have looked at the returned item.
  const handleAcceptReturn = async () => {
    if (!orderId) return;
    if (
      !window.confirm(
        "Accept this returned item? The customer is refunded in full, or given exchange credit, and the seller's payout for this order is cancelled."
      )
    ) {
      return;
    }
    setReturnActionLoading(true);
    try {
      await acceptReturnAdmin({ orderId });
    } catch (err: any) {
      alert("Failed to accept return: " + err.message);
    } finally {
      setReturnActionLoading(false);
    }
  };

  // Admin decides every return the seller rejected.
  const handleResolveRejection = async (decision: "refund" | "no_refund") => {
    if (!orderId) return;
    const question =
      decision === "refund"
        ? "Refund the customer in full, overruling the seller's rejection?"
        : "Refuse the refund? The customer gets nothing back and the seller is paid for the order.";
    if (!window.confirm(question)) return;
    const note = window.prompt("Note for the record (optional):") || undefined;
    setReturnActionLoading(true);
    try {
      await resolveRejection({ orderId, decision, note });
    } catch (err: any) {
      alert("Failed to record the decision: " + err.message);
    } finally {
      setReturnActionLoading(false);
    }
  };

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-full md:max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-hive-dark text-white px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-[10px] text-hive-gold font-bold uppercase tracking-widest">
              Order Details
            </p>
            <h2 className="text-base font-serif font-black text-white">
              {order ? order.orderNumber : "Loading..."}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {!order && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
          </div>
        )}

        {order && (
          <div className="flex-1 flex flex-col gap-6 p-6">
            {/* Status Row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Inline status updater */}
              <select
                value={
                  order.status === "delivered" &&
                  ["delivered", "completed"].includes(order.returnStatus ?? "")
                    ? "returned"
                    : order.status
                }
                disabled={updatingStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold border border-hive-border bg-white focus:outline-none focus:ring-1 focus:ring-hive-gold cursor-pointer disabled:opacity-60 uppercase tracking-wide"
              >
                {[
                  "pending_payment", "pending_confirmation", "confirmed",
                  "pickup_scheduled", "picked_up",
                  "in_transit", "out_for_delivery", "delivered", "returned", "cancelled",
                ].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              {updatingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin text-hive-amber" />}
              <PaymentBadge status={order.paymentStatus} />
              <span className="text-[10px] text-hive-text-muted font-medium ml-auto">
                {new Date(order.createdAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Customer + Boutique */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <User className="w-3 h-3" /> Customer
                </div>
                <p className="text-sm font-bold text-hive-dark leading-snug">
                  {order.customer.displayName}
                </p>
                {order.customer.email && (
                  <p className="text-[11px] text-hive-text-muted truncate">
                    {order.customer.email}
                  </p>
                )}
                {order.customer.phone && (
                  <p className="text-[11px] text-hive-text-muted">
                    {order.customer.phone}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <Store className="w-3 h-3" /> Boutique
                </div>
                <p className="text-sm font-bold text-hive-dark leading-snug">
                  {order.boutique.boutiqueName}
                </p>
                {order.boutique.ownerName && (
                  <p className="text-[11px] text-hive-text-muted">
                    {order.boutique.ownerName}
                  </p>
                )}
                {order.boutique.phone && (
                  <a
                    href={`tel:${order.boutique.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors w-fit"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call Seller: {order.boutique.phone}
                  </a>
                )}
                {order.boutique.staffPhone1 && (
                  <a
                    href={`tel:${order.boutique.staffPhone1}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors w-fit"
                  >
                    <Phone className="w-3 h-3" />
                    Staff 1: {order.boutique.staffPhone1}
                  </a>
                )}
                {order.boutique.email && (
                  <p className="text-[11px] text-hive-text-muted truncate mt-0.5">
                    {order.boutique.email}
                  </p>
                )}
              </div>
            </div>

            {/* Order Acceptance Attribution Card */}
            {(() => {
              const confirmActivity = order.activities?.find((a: any) => a.action === "confirmed");
              if (confirmActivity) {
                return (
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex flex-col gap-1 text-left shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-amber-600" />
                        Accepted By
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-200/90 text-amber-950 text-[10px] font-extrabold uppercase tracking-wide">
                        {confirmActivity.actorRole === "owner" ? "Store Owner" : confirmActivity.actorRole === "admin" ? "Hive Admin" : "Store Staff"}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {confirmActivity.actorName}
                    </p>
                    {confirmActivity.actorEmail && (
                      <p className="text-[11px] text-slate-600 font-mono">
                        {confirmActivity.actorEmail}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Accepted at: {new Date(confirmActivity.createdAt).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
                      })}
                    </p>
                  </div>
                );
              }
              if (["confirmed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered"].includes(order.status)) {
                return (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 text-left text-xs text-slate-500 flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Accepted By:</span>
                    <span className="text-[11px] text-slate-500 italic">Store (Historical order — accepted prior to actor tracking)</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Timeline — real courier timestamps, not when Hive processed them */}
            <OrderTimeline orderId={order._id} />

            {/* Delivery Address */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <MapPin className="w-3 h-3" /> Delivery Address
              </div>
              <p className="text-sm text-hive-dark font-semibold">
                {order.deliveryAddress.label}
              </p>
              <p className="text-xs text-hive-text-muted leading-relaxed">
                {order.deliveryAddress.line1}
                {order.deliveryAddress.line2 && `, ${order.deliveryAddress.line2}`}
                <br />
                {order.deliveryAddress.city}, {order.deliveryAddress.state}{" "}
                {order.deliveryAddress.pincode}
              </p>
            </div>

            {/* Order Items */}
            <div>
              <h3 className="text-sm font-bold text-hive-dark mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-hive-gold" /> Ordered Products ({order.items.length})
              </h3>
              <div className="rounded-2xl border border-hive-border overflow-hidden">
                {order.items.map((item, idx) => (
                  <div
                    key={item._id}
                    className={`flex items-center gap-3 p-3 ${idx < order.items.length - 1
                        ? "border-b border-hive-border/40"
                        : ""
                      }`}
                  >
                    {/* Image */}
                    <div className="w-12 h-14 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-hive-border/30">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-400">
                          No Img
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-hive-dark truncate">
                        {item.productName}
                      </p>
                      <p className="text-[10px] text-hive-text-muted">
                        Size: <strong>{item.variantSize}</strong> · Qty:{" "}
                        <strong>{item.quantity}</strong>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-hive-dark">
                        {formatCurrency(item.subtotal)}
                      </p>
                      <p className="text-[10px] text-hive-text-muted">
                        {formatCurrency(item.priceAtPurchase)} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Money and logistics trail: Razorpay, Route, refunds, Porter */}
            <OrderMoneyTrail orderId={order._id} />

            {/* Invoice */}
            <AdminInvoiceSection orderId={orderId} />

            {/* Price Breakdown */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-hive-border/40">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                <CreditCard className="w-3 h-3" /> Payment Summary
              </div>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between text-hive-text-muted">
                  <span>Subtotal</span>
                  <span className="font-semibold text-hive-dark">
                    {formatCurrency(order.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-hive-text-muted">
                  <span>Delivery Fee</span>
                  <span className="font-semibold text-hive-dark">
                    {formatCurrency(order.deliveryFee)}
                  </span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-semibold">
                      − {formatCurrency(order.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-hive-dark border-t border-hive-border/40 pt-2 mt-1">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
              {order.notes && (
                <p className="text-[10px] text-hive-text-muted mt-3 border-t border-hive-border/40 pt-2">
                  {order.notes}
                </p>
              )}
            </div>

            {/* Internal Decline/SLA Info (admin eyes only) */}
            {(order.internalCancelReason || order.slaAutoCancelledAt) && (
              <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">
                  <AlertTriangle className="w-3 h-3" /> Cancellation Details (Internal)
                </div>
                {order.slaAutoCancelledAt && (
                  <p className="text-xs text-red-700 font-bold mb-1">
                    🚨 Auto-cancelled by SLA timer at {new Date(order.slaAutoCancelledAt).toLocaleTimeString("en-IN")}
                  </p>
                )}
                {order.internalCancelReason && (
                  <p className="text-xs text-red-600">
                    <span className="font-semibold">Seller reason:</span> {order.internalCancelReason}
                  </p>
                )}
                {order.refundStatus && (
                  <p className="text-xs text-slate-500 mt-1">
                    Refund status: <span className="font-semibold capitalize">{order.refundStatus}</span>
                  </p>
                )}
              </div>
            )}

            {/* ── Return Management ──────────────────────────────────── */}
            {order.status === "delivered" && (
              <div className="bg-indigo-50/80 rounded-2xl p-4 border border-indigo-200/60">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-3">
                  <RotateCcw className="w-3 h-3" /> Return Management
                </div>

                {/* No return status yet — show Approve button */}
                {!order.returnStatus && (
                  <button
                    onClick={handleApproveReturn}
                    disabled={returnActionLoading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {returnActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Approve Return
                  </button>
                )}

                {/* Return requested — show Approve */}
                {order.returnStatus === "requested" && (
                  <button
                    onClick={handleApproveReturn}
                    disabled={returnActionLoading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {returnActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Approve Return
                  </button>
                )}

                {/* Return approved — show Initiate button */}
                {order.returnStatus === "approved" && (
                  <button
                    onClick={handleInitiateReturn}
                    disabled={returnActionLoading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {returnActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Initiate Return Pickup (Customer → Boutique)
                  </button>
                )}

                {/* Return initiated / in-progress / delivered — show status */}
                {order.returnStatus && ["initiated", "picked_up", "in_transit", "delivered", "failed"].includes(order.returnStatus) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">Return Status</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        order.returnStatus === "delivered"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : order.returnStatus === "failed"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {order.returnStatus.replace(/_/g, " ")}
                      </span>
                    </div>

                    {order.returnShipment?.awbNumber && order.returnShipment.awbNumber !== "" && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Porter CRN</span>
                        <span className="text-[11px] font-mono font-bold text-hive-dark select-all">
                          {order.returnShipment.awbNumber}
                        </span>
                      </div>
                    )}

                    {order.returnShipment?.driverName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Driver</span>
                        <span className="text-[11px] font-semibold text-hive-dark">
                          {order.returnShipment.driverName}
                          {order.returnShipment.driverPhone && ` · ${order.returnShipment.driverPhone}`}
                        </span>
                      </div>
                    )}

                    {order.returnShipment?.trackingUrl && (
                      <a
                        href={order.returnShipment.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-indigo-600 hover:underline font-medium"
                      >
                        Track Return →
                      </a>
                    )}

                    {order.returnStatus === "delivered" && !order.returnInspection && (
                      <div className="flex flex-col gap-2 mt-1">
                        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold">
                          Item is back at the boutique and waiting to be checked. No refund has been made yet.
                        </p>
                        <button
                          onClick={handleAcceptReturn}
                          disabled={returnActionLoading}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {returnActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Accept return and refund customer
                        </button>
                      </div>
                    )}

                    {order.returnStatus === "delivered" &&
                      order.returnInspection?.decision === "rejected" &&
                      !order.returnInspection?.resolution && (
                        <div className="flex flex-col gap-2 mt-1 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                          <p className="text-[11px] text-red-900 font-semibold">
                            The seller rejected the returned item
                            {order.returnInspection.reason ? `: "${order.returnInspection.reason}"` : "."}
                          </p>
                          <p className="text-[10px] text-red-800">
                            No money has moved. Decide whether the customer is refunded.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolveRejection("refund")}
                              disabled={returnActionLoading}
                              className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              Refund customer
                            </button>
                            <button
                              onClick={() => handleResolveRejection("no_refund")}
                              disabled={returnActionLoading}
                              className="flex-1 px-3 py-2 rounded-xl bg-white text-red-800 border border-red-300 text-[10px] font-bold uppercase tracking-wider hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              No refund
                            </button>
                          </div>
                        </div>
                      )}

                    {order.returnInspection?.decision === "accepted" && (
                      <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 font-semibold mt-1">
                        Accepted by the {order.returnInspection.byRole === "admin" ? "Hive team" : "seller"}. The customer is being refunded.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Order Timeline */}
            <div>
              <h3 className="text-sm font-bold text-hive-dark mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-hive-gold" /> Order Timeline
              </h3>
              <div className="flex flex-col gap-0">
                {order.timeline.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${step.done
                            ? "bg-hive-gold border-hive-gold text-white"
                            : "bg-white border-slate-200 text-slate-300"
                          }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </div>
                      {idx < order.timeline.length - 1 && (
                        <div
                          className={`w-0.5 h-6 mt-0.5 ${step.done ? "bg-hive-gold/30" : "bg-slate-100"
                            }`}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <p
                        className={`text-xs font-semibold ${step.done ? "text-hive-dark" : "text-slate-300"
                          }`}
                      >
                        {step.label}
                      </p>
                      {/* Actor attribution for Confirmed step */}
                      {step.label === "Confirmed" && step.done && order.activities && (() => {
                        const confirmActivity = order.activities.find((a: any) => a.action === "confirmed");
                        if (!confirmActivity) return null;
                        return (
                          <div className="mt-1">
                            <p className="text-[10px] font-semibold text-stone-700">
                              {confirmActivity.actorRole === "admin" ? "Confirmed" : "Accepted"} by {confirmActivity.actorName}
                            </p>
                            <p className="text-[10px] text-hive-text-muted">
                              {confirmActivity.actorRole === "owner" ? "Owner" : confirmActivity.actorRole === "admin" ? "Admin" : "Staff"}
                              {confirmActivity.actorEmail ? ` · ${confirmActivity.actorEmail}` : ""}
                            </p>
                          </div>
                        );
                      })()}
                      {step.timestamp && (
                        <p className="text-[10px] text-hive-text-muted">
                          {new Date(step.timestamp).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Orders Page ───────────────────────────────────────────────────────
export default function AdminOrdersPage() {
  const { isLoading: convexAuthLoading } = useConvexAuth();
  const nowBucket = useMetricsBucket();
  const orders = useQuery(api.adminOrders.getAllOrders, { limit: 200 });
  // Same bucketed clock the admin home page sends, so both routes share one
  // cached execution instead of each invalidating on its own schedule.
  const metrics = useQuery(api.adminOrders.getAdminDashboardMetrics, { nowBucket });
  const triggerSlaSweep = useMutation(api.orders.triggerSlaOrderSweepAdmin);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<Id<"orders"> | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);

  const handleManualSweep = async () => {
    setIsSweeping(true);
    try {
      const res = await triggerSlaSweep();
      alert(`Auto-cancelled ${res.cancelledCount} overdue order(s) (>45 min).`);
    } catch (e: any) {
      alert("Sweep failed: " + e.message);
    } finally {
      setIsSweeping(false);
    }
  };

  const isLoading = orders === undefined || metrics === undefined;

  // ── SLA overdue computed BEFORE early returns (Rules of Hooks) ──────────────
  const SLA_WARNING_MS = 10 * 60 * 1000;
  const now = Date.now();

  const slaOverdueOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o: any) =>
      o.status === "pending_confirmation" &&
      now - (o.createdAt ?? o._creationTime) > SLA_WARNING_MS
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o: any) => {
      const matchesSearch =
        !searchTerm ||
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.boutiqueName.toLowerCase().includes(searchTerm.toLowerCase());

      if (statusFilter === "sla_overdue") {
        return matchesSearch && o.status === "pending_confirmation" &&
          now - (o.createdAt ?? o._creationTime) > SLA_WARNING_MS;
      }

      const matchesStatus =
        statusFilter === "all" || o.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, searchTerm, statusFilter]);

  if (isLoading) {
    if (convexAuthLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
          <p className="text-sm text-hive-text-muted font-medium">
            Authenticating...
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">
          Loading orders from Convex...
        </p>
      </div>
    );
  }

  if (!orders) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <ShieldX className="w-10 h-10 text-red-400" />
        <p className="text-base font-bold text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500 max-w-sm">
          You do not have admin privileges to view orders.
        </p>
      </div>
    );
  }

  // Filter and SLA already computed above

  const kpiCards = [
    {
      label: "Total Orders",
      value: metrics.totalOrders,
      icon: ShoppingBag,
      color: "text-blue-500 bg-blue-50 border-blue-100",
    },
    {
      label: "Pending Orders",
      value: metrics.pendingOrders,
      icon: Clock,
      color: "text-amber-500 bg-amber-50 border-amber-100",
    },
    {
      label: "Delivered",
      value: metrics.deliveredOrders,
      icon: CheckCircle,
      color: "text-green-500 bg-green-50 border-green-100",
    },
    {
      label: "Total Revenue",
      value: formatCurrency(metrics.totalRevenue),
      icon: TrendingUp,
      color: "text-indigo-500 bg-indigo-50 border-indigo-100",
    },
  ];

  const STATUS_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "sla_overdue", label: "⚠️ SLA Overdue (>10 min)" },
    { value: "pending_confirmation", label: "Pending Confirmation" },
    { value: "confirmed", label: "Confirmed" },
    { value: "pickup_scheduled", label: "Pickup Scheduled" },
    { value: "in_transit", label: "In Transit" },
    { value: "out_for_delivery", label: "Out for Delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunded", label: "Refunded" },
  ];

  return (
    <div className="flex flex-col gap-8 text-left">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="p-2 rounded-xl hover:bg-slate-200/50 transition-colors border border-transparent"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-black text-hive-dark">
            Order Management
          </h1>
          <p className="text-sm text-hive-text-muted">
            All marketplace orders across all boutiques.
          </p>
        </div>
      </div>

      {/* ── SLA Overdue Executive Banner ─────────────────────────────────── */}
      {slaOverdueOrders.length > 0 && (
        <div className="w-full rounded-2xl bg-gradient-to-r from-red-500/10 via-amber-500/5 to-red-500/10 border border-red-200/80 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-red-600 text-white shadow-xs shrink-0 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-red-950 font-sans tracking-tight">
                  {slaOverdueOrders.length} Order{slaOverdueOrders.length > 1 ? "s" : ""} Awaiting Seller Acceptance (&gt;10 min)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white tracking-wide uppercase">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-red-700/80 mt-0.5">
                Auto-cancel &amp; full customer refund fires at 45 minutes. Contact boutique owners immediately.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
            {/* Top 3 most urgent orders snippet */}
            <div className="flex items-center gap-1.5 overflow-hidden">
              {slaOverdueOrders.slice(0, 3).map((o: any) => {
                const elapsedMin = Math.floor((now - (o.createdAt ?? o._creationTime)) / 60000);
                const isCritical = elapsedMin >= 30;
                return (
                  <button
                    key={o._id}
                    onClick={() => setSelectedOrderId(o._id)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${isCritical
                        ? "bg-red-600 border-red-700 text-white animate-pulse shadow-xs"
                        : "bg-white border-red-200 text-red-800 hover:bg-red-50"
                      }`}
                    title={`Click to view #${o.orderNumber}`}
                  >
                    #{o.orderNumber} ({elapsedMin}m)
                  </button>
                );
              })}
              {slaOverdueOrders.length > 3 && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-xl bg-red-100/80 text-red-800 border border-red-200">
                  +{slaOverdueOrders.length - 3} more
                </span>
              )}
            </div>

            <button
              onClick={() => setStatusFilter(statusFilter === "sla_overdue" ? "all" : "sla_overdue")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${statusFilter === "sla_overdue"
                  ? "bg-red-900 text-white shadow-xs"
                  : "bg-red-600 hover:bg-red-700 text-white shadow-xs active:scale-[0.98]"
                }`}
            >
              {statusFilter === "sla_overdue" ? "Showing Overdue (Reset)" : `Filter Overdue (${slaOverdueOrders.length})`}
            </button>

            <button
              onClick={handleManualSweep}
              disabled={isSweeping}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-red-300 text-red-700 hover:bg-red-50 transition-all cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
              title="Auto-cancel all orders unaccepted for >45 minutes"
            >
              {isSweeping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "⚡ Auto-Cancel Expired (>45m)"}
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {kpiCards.map((card) => {
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

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order #, customer, boutique..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-hive-border/60 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-hive-gold bg-white"
          />
        </div>

        {/* Status Filter */}
        <div className="relative w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto pl-8 pr-4 py-2 text-sm border border-hive-border/60 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-hive-gold bg-white appearance-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-hive-text-muted ml-auto">
          {filtered.length} of {orders.length} orders
        </span>
      </div>

      {/* Orders Table */}
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-hive-border/40 text-[10px] font-bold uppercase tracking-wider text-hive-text-muted">
                  <th className="px-5 py-4">Order #</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Boutique</th>
                  <th className="px-5 py-4 text-center">Items</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Payment</th>
                  <th className="px-5 py-4 text-center">Invoice</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border/30 font-medium text-hive-dark">
                {filtered.map((order) => (
                  <tr
                    key={order._id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                      {order.orderNumber}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-hive-text-muted">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4 max-w-[140px] truncate">
                      {order.customerName}
                    </td>
                    <td className="px-5 py-4 max-w-[150px]">
                      <p className="truncate font-semibold text-hive-dark">{order.boutiqueName}</p>
                      {(order as any).boutiquePhone && (
                        <a
                          href={`tel:${(order as any).boutiquePhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                          title="Call boutique owner"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          {(order as any).boutiquePhone}
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {order.itemsCount}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-bold whitespace-nowrap">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={order.status} />
                        {order.acceptanceActivity ? (
                          <span className="text-[10px] font-bold text-slate-700 block leading-tight mt-1">
                            Accepted by {order.acceptanceActivity.actorName} ({order.acceptanceActivity.actorRole === "owner" ? "Owner" : order.acceptanceActivity.actorRole === "admin" ? "Admin" : "Staff"})
                          </span>
                        ) : (
                          ["confirmed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered"].includes(order.status) && (
                            <span className="text-[9px] text-slate-400 font-medium italic block leading-tight mt-0.5">
                              Pre-tracking order
                            </span>
                          )
                        )}
                        {order.status === "pending_confirmation" && (now - (order.createdAt ?? (order as any)._creationTime)) > SLA_WARNING_MS && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md animate-pulse whitespace-nowrap">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {Math.floor((now - (order.createdAt ?? (order as any)._creationTime)) / 60000)}m unaccepted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <PaymentBadge status={order.paymentStatus} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <AdminInvoiceTableCell
                        invoiceNumber={order.invoiceNumber ?? null}
                        invoicePdfUrl={order.invoicePdfUrl ?? null}
                      />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => setSelectedOrderId(order._id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-hive-dark text-white text-[10px] font-bold hover:bg-hive-amber transition-colors"
                        title="View order details"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-12 text-center text-hive-text-muted"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <ShoppingBag className="w-8 h-8 text-slate-300" />
                        <span className="text-sm font-semibold">
                          No orders found
                        </span>
                        {searchTerm && (
                          <button
                            onClick={() => {
                              setSearchTerm("");
                              setStatusFilter("all");
                            }}
                            className="text-xs text-hive-amber hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Order Detail Drawer */}
      <OrderDetailDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
