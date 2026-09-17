"use client";

// Trigger Vercel build: null-safe order pricing checks deployed (July 31, 2026)
import React from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Card, CardContent, LoadingState } from "@hive/ui";
import { formatCurrency, toast } from "@hive/utils";
import { getClientAuth } from "@/lib/firebase";
import { ExchangeRequestsPanel } from "@/components/orders/ExchangeRequestsPanel";
import { ReturnLegPanel } from "@/components/orders/ReturnLegPanel";
import {
  Loader2,
  ClipboardList,
  Calendar,
  FileDown,
  Receipt,
  FileText,
  CheckCircle2,
  XCircle,
  Check,
  X,
  Clock,
  User,
  MapPin,
  Package,
  Truck,
  RotateCcw,
  Phone,
  Bike,
  Info,
  ArrowDownToLine,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

// ── Invoice download cell ────────────────────────────────────────────────────
function BoutiqueInvoiceCell({ orderId }: { orderId: Id<"orders"> }) {
  const invoice = useQuery(api.invoices.getInvoiceByOrderId_boutique, { orderId });
  // auth accessed inside handleGenerate (client-only event handler)
  const [generating, setGenerating] = React.useState(false);

  if (invoice === undefined) {
    return <span className="inline-block w-14 h-4 bg-slate-100 rounded-lg animate-pulse" />;
  }

  if (!invoice) {
    return (
      <span className="text-[10px] text-slate-400 font-medium italic whitespace-nowrap">
        No invoice
      </span>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const token = await getClientAuth().currentUser?.getIdToken();
      if (!token) throw new Error("Authentication token is missing.");

      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate invoice");
      }
      toast.success("Invoice Generated", "PDF invoice is ready for download.");
    } catch (e: any) {
      toast.error("Invoice Generation Failed", e.message || "Failed to create invoice PDF.");
    } finally {
      setGenerating(false);
    }
  };

  if (!invoice.pdfUrl) {
    return (
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100/80 text-[11px] font-semibold text-stone-800 transition-all active:scale-[0.98] shadow-2xs whitespace-nowrap disabled:opacity-50 cursor-pointer"
        title="Generate official invoice PDF"
      >
        {generating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-600" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-stone-600" />
        )}
        Generate
      </button>
    );
  }

  return (
    <button
      onClick={() => window.open(invoice.pdfUrl!, "_blank")}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-400 text-[11px] font-semibold text-stone-900 transition-all active:scale-[0.98] shadow-2xs whitespace-nowrap cursor-pointer"
      title={`Download ${invoice.invoiceNumber}`}
    >
      <ArrowDownToLine className="w-3.5 h-3.5 text-stone-700" />
      Invoice
    </button>
  );
}

// ── Boutique Orders Page ──────────────────────────────────────────────────────
// ── Order Status Badge Component ───────────────────────────────────────────────
const OrderStatusBadge = ({ status }: { status: string }) => {
  // 1. Active Logistics States (Pulsing Amber Dot)
  if (["waiting_for_rider", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery"].includes(status) || status === "confirmed") {
    return (
      <div className="flex items-center justify-center w-full py-2.5 px-3 bg-white border border-stone-200/80 rounded-xl shadow-2xs">
        <span className="relative flex h-2 w-2 mr-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span className="text-[11px] font-bold text-stone-800 tracking-wider uppercase">
          {status === 'confirmed' ? 'Confirmed' : status.replace(/_/g, " ")}
        </span>
      </div>
    );
  }

  // 1b. Packed State (Solid Slate Indicator)
  if (status === "packed") {
    return (
      <div className="flex items-center justify-center w-full py-2.5 px-3 bg-white border border-stone-200/80 rounded-xl shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-stone-700 mr-2.5" />
        <span className="text-[11px] font-bold text-stone-800 tracking-wider uppercase">
          Packed
        </span>
      </div>
    );
  }

  // 1c. Booking Failed State (Refined Warning)
  if (status === "booking_failed") {
    return (
      <div className="flex items-center justify-center w-full py-2.5 px-3 bg-rose-50/60 border border-rose-200/80 rounded-xl shadow-2xs">
        <AlertCircle className="w-3.5 h-3.5 mr-2 text-rose-600 stroke-[2.2]" />
        <span className="text-[11px] font-bold text-rose-700 tracking-wider uppercase">
          Pickup Failed
        </span>
      </div>
    );
  }

  // 2. Delivered State (Emerald Badge)
  if (status === "delivered") {
    return (
      <div className="flex items-center justify-center w-full py-2.5 px-3 bg-emerald-50/40 border border-emerald-200/80 rounded-xl shadow-2xs">
        <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600 stroke-[2.2]" />
        <span className="text-[11px] font-bold text-emerald-800 tracking-wider uppercase">
          Delivered
        </span>
      </div>
    );
  }

  // 3. Cancelled State (Rose Badge)
  if (status === "cancelled") {
    return (
      <div className="flex items-center justify-center w-full py-2.5 px-3 bg-stone-50 border border-stone-200 rounded-xl shadow-2xs">
        <XCircle className="w-3.5 h-3.5 mr-2 text-rose-500 stroke-[2.2]" />
        <span className="text-[11px] font-bold text-stone-600 tracking-wider uppercase">
          Cancelled
        </span>
      </div>
    );
  }

  // Fallback for any other locked states
  return (
    <div className="flex items-center justify-center w-full py-2.5 px-3 bg-stone-50 border border-stone-200/70 rounded-xl">
      <span className="text-[11px] font-bold text-stone-600 tracking-wider uppercase">
        {status.replace(/_/g, " ")}
      </span>
    </div>
  );
};

export default function BoutiqueOrders() {
  const orders = useQuery(api.orders.getBoutiqueOrders);
  const updateStatus = useMutation(api.orders.updateBoutiqueOrderStatus);
  const retryDispatch = useAction(api.orders.retryBoutiqueOrderDispatch);
  const readyForPickup = useAction(api.orders.readyForPickupAction);
  const acceptReservation = useMutation((api as any).reservations.storeConfirmAvailable);
  const declineReservation = useMutation((api as any).reservations.storeDeclineUnavailable);
  const [retryingOrderId, setRetryingOrderId] = React.useState<string | null>(null);
  const [dispatchingOrderId, setDispatchingOrderId] = React.useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = React.useState<string | null>(null);
  const [orderToDecline, setOrderToDecline] = React.useState<string | null>(null);
  const [retryDispatchOrderId, setRetryDispatchOrderId] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState<string>("");
  const [declineReasonType, setDeclineReasonType] = React.useState<string>("Out of stock");
  const [declineStep, setDeclineStep] = React.useState<"confirm" | "reason">("confirm");
  const [declineError, setDeclineError] = React.useState<boolean>(false);
  const [acceptedOrderIds, setAcceptedOrderIds] = React.useState<Record<string, boolean>>({});

  const [activeTab, setActiveTab] = React.useState<"orders" | "reservations">("orders");
  const reservations = useQuery((api as any).reservations.getBoutiqueReservations);
  const pendingReservationsCount = useQuery((api as any).reservations.getBoutiquePendingReservationCount) ?? 0;

  if (orders === undefined) {
    return <LoadingState message="Loading orders..." variant="full" />;
  }

  return (
    <div className="flex flex-col gap-6 text-left pb-24">
      <div className="flex flex-col gap-1 pt-1">
        <h1 className="text-3xl font-serif font-black text-[#0f172a] tracking-tight">Orders</h1>
        <p className="text-sm font-medium text-[#64748b]">Review incoming orders and reservations.</p>
      </div>

      {/* Exchange requests sit above the order list — they are time-boxed to 24h. */}
      <ExchangeRequestsPanel />

      <div className="flex items-center gap-2 border-b border-hive-border/30 pb-2">
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2 text-sm font-bold tracking-wide rounded-full transition-colors ${
            activeTab === "orders" ? "bg-slate-900 text-white" : "bg-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Orders
        </button>
        <button
          onClick={() => setActiveTab("reservations")}
          className={`relative px-4 py-2 text-sm font-bold tracking-wide rounded-full transition-colors ${
            activeTab === "reservations" ? "bg-slate-900 text-white" : "bg-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Reservations
          {pendingReservationsCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full">
              {pendingReservationsCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "orders" ? (

      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="hidden md:table-header-group">
                <tr className="bg-slate-50/60 border-b border-hive-border/30 text-[10px] font-extrabold uppercase tracking-wider text-[#94a3b8] select-none">
                  <th className="px-6 py-4">Order No.</th>
                  <th className="px-6 py-4">Delivery Slot / Date</th>
                  <th className="px-6 py-4">Customer Details</th>
                  <th className="px-6 py-4">Purchased Items</th>
                  <th className="px-6 py-4">Net Payout</th>
                  <th className="px-6 py-4">Invoice</th>
                  <th className="px-6 py-4">Order Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border/30 font-semibold text-hive-dark">
                {orders.map((order: any) => {
                  const isPending = order.status === "pending_confirmation";
                  const isAcceptedOptimistically = acceptedOrderIds[order._id];

                  if (isPending) {
                    const createdTime = order.createdAt || order._creationTime || Date.now();
                    const elapsedMin = Math.max(0, Math.floor((Date.now() - createdTime) / 60000));
                    const timeText = elapsedMin === 0 ? "Just now" : elapsedMin < 60 ? `${elapsedMin} min ago` : `${Math.floor(elapsedMin / 60)} hr ago`;

                    const payoutRupees = Math.round((order.totalPayout ?? 0) / 100);
                    const baseRupees = Math.round((order.totalBasePrice ?? 0) / 100);
                    const feeRupees = Math.max(0, baseRupees - payoutRupees);

                    const custName = order.customerName || order.deliveryAddress?.name || order.deliveryAddress?.label || "Customer";
                    const firstCustName = custName.trim().split(" ")[0] || "Customer";
                    const locality = (order.deliveryAddress?.locality || order.deliveryAddress?.city || "Local").split(",")[0].trim();
                    const distanceStr = order.distanceKm ? `${order.distanceKm} km` : "3.2 km";

                    return (
                      <tr key={order._id} className="flex flex-col md:table-row bg-[#ffffff] border border-[#f1f5f9]/80 shadow-[0_4px_20px_-4px_rgba(168,154,126,0.08)] rounded-2xl mb-3.5 hover:shadow-[0_8px_24px_-4px_rgba(168,154,126,0.14)] transition-all p-4 md:p-5">
                        <td colSpan={7} className="p-0">
                          <div className="flex flex-col text-left font-sans gap-2.5">
                            {/* 1. Top Header: Status Capsule (Warm cream & green dot) & Real Timestamp */}
                            <div className="flex items-center justify-between pb-2 border-b border-[#f1f5f9]/60">
                              <span className="inline-flex items-center gap-1.5 bg-slate-50 text-[#334155] px-2.5 py-0.5 rounded-full text-[12px] font-semibold tracking-normal border border-[#f1f5f9]/80">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                                New order
                              </span>
                              <span className="text-[12px] text-[#64748b] font-medium font-mono">
                                {timeText}
                              </span>
                            </div>

                            {/* 2. Compact Product Row (Exact 56x56px thumbnail + dominant title & muted gold category) */}
                            <div className="flex items-center gap-3.5">
                              <div className="w-[56px] h-[56px] rounded-[14px] border border-[#f1f5f9] overflow-hidden bg-slate-50 flex-shrink-0 shadow-2xs relative">
                                {order.items?.[0]?.imageUrl ? (
                                  <img src={order.items[0].imageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-[#94a3b8]">No Image</div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0 justify-center">
                                <h3 className="text-[17px] font-extrabold text-[#0f172a] tracking-[-0.02em] leading-tight truncate">
                                  {order.items?.[0]?.productName || "Product Order"}
                                </h3>
                                {order.items?.[0]?.category && (
                                  <span className="text-[12px] font-semibold text-[#B88643] tracking-wide mt-0.5">
                                    {order.items[0].category}
                                  </span>
                                )}
                                <p className="text-[13px] font-medium text-[#64748b] mt-0.5">
                                  Size {order.items?.[0]?.variantSize || "Free"} • Qty {order.items?.[0]?.quantity || 1}
                                  {order.items?.length > 1 ? ` (+${order.items.length - 1} more)` : ""}
                                </p>
                              </div>
                            </div>

                            {/* 3. Money & Lucide Customer Row */}
                            <div className="pt-2 border-t border-[#f1f5f9]/60 flex flex-col gap-1">
                              <span className="text-[12px] font-medium text-[#64748b] block">
                                You&apos;ll receive
                              </span>
                              <div className="flex items-baseline justify-between -mt-0.5">
                                <span className="text-[26px] font-black text-[#0f172a] tracking-tight leading-none">
                                  ₹{payoutRupees.toLocaleString("en-IN")}
                                </span>
                                <span className="text-[12px] font-medium text-[#64748b]">
                                  Hive fee ₹{feeRupees.toLocaleString("en-IN")}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-[12px] text-[#334155] font-medium pt-2 border-t border-[#f1f5f9]/50 mt-1">
                                <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5 text-[#64748b] stroke-[1.75]" /> {firstCustName}</span>
                                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#64748b] stroke-[1.75]" /> {locality}</span>
                                <span className="text-[#64748b] font-mono">{distanceStr}</span>
                              </div>
                            </div>

                            {/* 4. Action Stack (Luxury Warm Gold Accept Order CTA + subtle Decline button) */}
                            <div className="pt-2.5 border-t border-[#f1f5f9]/60 flex flex-col items-center gap-1.5">
                              {isAcceptedOptimistically ? (
                                <div className="w-full py-2.5 bg-stone-50 border border-stone-200/80 text-stone-800 rounded-xl flex items-center justify-center gap-2 select-none animate-in fade-in duration-200">
                                  <Check className="w-4 h-4 text-amber-600 stroke-[2.5]" />
                                  <span className="font-bold text-[13px]">Order Accepted — Ready to Pack</span>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={async () => {
                                      setAcceptedOrderIds(prev => ({ ...prev, [order._id]: true }));
                                      setPendingActionId(order._id);
                                      try {
                                        await updateStatus({
                                          orderId: order._id,
                                          status: "confirmed",
                                        });
                                        toast.success("Order Accepted", "Order confirmed and ready for packing.");
                                      } catch (err: any) {
                                        setAcceptedOrderIds(prev => ({ ...prev, [order._id]: false }));
                                        toast.error("Couldn't Accept Order", err.message || "Failed to confirm order.");
                                      } finally {
                                        setPendingActionId(null);
                                      }
                                    }}
                                    disabled={pendingActionId === order._id}
                                    className="w-full py-2.5 bg-[#F5C22B] hover:bg-[#E0B024] active:bg-[#D9A71E] text-stone-950 font-extrabold rounded-xl text-[13px] tracking-wide disabled:opacity-50 transition-all shadow-sm cursor-pointer text-center active:scale-[0.98]"
                                  >
                                    Accept Order
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOrderToDecline(order._id);
                                      setDeclineStep("confirm");
                                    }}
                                    disabled={pendingActionId === order._id}
                                    className="w-full py-1.5 bg-transparent hover:bg-stone-50 active:bg-stone-100 text-stone-500 hover:text-rose-600 rounded-lg text-[12px] font-semibold tracking-wide disabled:opacity-50 transition-all cursor-pointer text-center"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Non-pending (Already Accepted / Confirmed / etc.) row layout
                  return (
                    <tr key={order._id} className="flex flex-col md:table-row bg-white border-b border-hive-border/30 mb-4 md:mb-0 hover:bg-slate-50/30 transition-colors p-4 md:p-0">
                      {/* Order Number */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <div className="flex flex-col gap-1">
                          <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider">Order No.</span>
                          <span className="font-mono font-bold text-sm text-slate-700">{order.orderNumber}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 text-left border-t md:border-t-0 border-hive-border/10">
                        <div className="flex flex-col gap-1.5 text-slate-700">
                          <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider">Delivery Slot / Date</span>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-hive-amber flex-shrink-0" />
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          </div>
                          {order.scheduledProcessingDate && (
                            <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                              Pre-order — process on {new Date(`${order.scheduledProcessingDate}T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Customer Details (delivery address as proxy) */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 text-left border-t md:border-t-0 border-hive-border/10">
                        <div className="flex flex-col gap-1">
                          <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider">Customer Details</span>
                          <span className="font-bold text-hive-dark">
                            {(() => {
                              const name = order.customerName || order.deliveryAddress.name || order.deliveryAddress.label || "Customer";
                              const parts = name.trim().split(" ");
                              if (parts.length <= 1) return parts[0] || "Customer";
                              return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                            })()}
                          </span>
                          <span className="text-hive-text-muted leading-tight max-w-xs truncate">
                            {order.deliveryAddress.city}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">Pincode: {order.deliveryAddress.pincode}</span>
                        </div>
                      </td>

                      {/* Items */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 text-left border-t md:border-t-0 border-hive-border/10">
                        <div className="flex flex-col gap-2">
                          <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider">Purchased Items</span>
                          {order.items.map((it: any) => (
                            <div key={it._id} className="flex items-center gap-2">
                              <div className="relative w-8 h-10 rounded border border-slate-100 overflow-hidden bg-slate-50 flex-shrink-0">
                                {it.imageUrl ? (
                                  <img src={it.imageUrl} alt={it.productName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-hive-text-muted">No Image</div>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-hive-dark">{it.productName}</span>
                                <span className="text-[10px] text-hive-text-muted">Size: {it.variantSize} x {it.quantity}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Net Payout */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 font-bold text-sm border-t md:border-t-0 border-hive-border/10">
                        <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider block mb-1">Net Payout</span>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            ₹{Math.round((order.totalPayout ?? order.orderSnapshot?.merchantPayable ?? (order.total * 0.98)) / 100).toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {order.sellerFundedDiscountPaise > 0
                              ? `After your coupon (−₹${(order.sellerFundedDiscountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })})`
                              : "Net earnings"}
                          </span>
                        </div>
                      </td>

                      {/* Invoice */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 border-t md:border-t-0 border-hive-border/10">
                        <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider block mb-1">Invoice</span>
                        <BoutiqueInvoiceCell orderId={order._id} />
                      </td>

                      {/* Status updater */}
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 min-w-[160px] border-t md:border-t-0 border-hive-border/10">
                        <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider block mb-2">Order Status</span>
                        <OrderStatusBadge status={order.status} />

                        {/* Courier timestamps from Porter, so the boutique can
                            see when the item actually moved. */}
                        {(order.pickedUpAt || order.deliveredAt) && (
                          <div className="mt-2 px-2.5 py-2 bg-emerald-50/60 border border-emerald-200/60 rounded-xl text-left space-y-0.5">
                            {order.pickedUpAt && (
                              <p className="text-[10px] text-emerald-900 font-semibold leading-snug flex items-center gap-1">
                                <Truck className="w-3 h-3 shrink-0" />
                                Picked up{" "}
                                {new Date(order.pickedUpAt).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </p>
                            )}
                            {order.deliveredAt && (
                              <p className="text-[10px] text-emerald-900 font-bold leading-snug flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                Delivered{" "}
                                {new Date(order.deliveredAt).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Acceptance attribution — compact actor badge */}
                        {order.acceptanceActivity && (
                          <div className="mt-2 px-2.5 py-2 bg-stone-50/80 border border-stone-200/60 rounded-xl text-left">
                            <p className="text-[11px] font-bold text-stone-800 leading-snug">
                              Accepted by {order.acceptanceActivity.actorName}
                            </p>
                            <p className="text-[10px] text-stone-500 font-medium leading-snug">
                              {order.acceptanceActivity.actorRole === "owner" ? "Owner" : order.acceptanceActivity.actorRole === "admin" ? "Admin" : "Staff"}
                              {" · "}
                              {new Date(order.acceptanceActivity.createdAt).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </p>
                          </div>
                        )}

                        {order.shipment && (order.shipment.providerBookingId || order.shipment.awbNumber) && (
                          <div className="mt-2.5 p-2.5 bg-stone-50/80 border border-stone-200/80 rounded-xl text-left flex flex-col gap-1 text-[11px]">
                            <div className="flex items-center justify-between text-stone-700">
                              <span className="uppercase text-[9px] text-stone-400 tracking-wider font-extrabold">Provider</span>
                              <span className="capitalize font-bold text-stone-900">{order.shipment.provider || "Porter"}</span>
                            </div>
                            <div className="flex items-center justify-between text-stone-600 font-mono text-[10px]">
                              <span className="uppercase text-[9px] text-stone-400 font-sans tracking-wider font-extrabold">Booking ID</span>
                              <span className="font-bold text-stone-900">{order.shipment.providerBookingId || order.shipment.awbNumber}</span>
                            </div>
                            {order.shipment.trackingUrl && order.shipment.trackingUrl !== "http://test.com" && (
                              <a
                                href={order.shipment.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 text-white rounded-lg text-[10px] font-bold tracking-wide transition-all shadow-2xs cursor-pointer"
                              >
                                <span>Track Delivery</span>
                                <ExternalLink className="w-3 h-3 text-stone-300" />
                              </a>
                            )}
                          </div>
                        )}

                        {order.shipment && (order.shipment.providerBookingId || order.shipment.awbNumber) && (
                          <div className="mt-2.5 p-3 bg-white border border-stone-200/80 rounded-xl text-left shadow-2xs">
                            <h4 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider mb-2 border-b border-stone-100 pb-1 flex items-center justify-between">
                              <span>Rider Information</span>
                              {order.shipment.driverName && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                            </h4>
                            {order.shipment.driverName ? (
                              <div className="flex flex-col gap-2 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="font-bold text-stone-900">{order.shipment.driverName}</span>
                                </div>
                                {order.shipment.driverPhone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span className="font-semibold text-stone-700 font-mono">{order.shipment.driverPhone}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <Bike className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="font-mono text-stone-700 font-medium">{order.shipment.vehiclePlate || "2 Wheeler"}</span>
                                </div>
                                {order.shipment.etaMinutes != null && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span className="font-semibold text-amber-700">{order.shipment.etaMinutes} mins away</span>
                                  </div>
                                )}
                                <div className="flex gap-2 mt-1.5">
                                  {order.shipment.liveTrackingUrl && (
                                    <a
                                      href={order.shipment.liveTrackingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 text-center py-2 px-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[10px] font-bold tracking-wide transition-all shadow-2xs cursor-pointer"
                                    >
                                      Track Live
                                    </a>
                                  )}
                                  {order.shipment.driverPhone && (
                                    <a
                                      href={`tel:${order.shipment.driverPhone}`}
                                      className="flex-1 text-center py-2 px-2.5 bg-stone-100 hover:bg-stone-200/80 text-stone-800 rounded-lg text-[10px] font-bold tracking-wide transition-all border border-stone-200 cursor-pointer"
                                    >
                                      Call Rider
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 text-[11px] font-medium text-stone-500 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                <span>Assigning delivery partner...</span>
                              </div>
                            )}
                          </div>
                        )}

                        <ReturnLegPanel
                          orderId={order._id as Id<"orders">}
                          returnStatus={(order as any).returnStatus}
                          returnShipment={(order as any).returnShipment}
                          returnInspection={(order as any).returnInspection}
                        />
                        
                        {(order.status === "confirmed" || order.status === "packed" || order.status === "booking_failed") && (
                          <button
                            onClick={async () => {
                              setDispatchingOrderId(order._id);
                              try {
                                await readyForPickup({ orderId: order._id as Id<"orders"> });
                                toast.success("Pickup Requested", "Porter delivery partner has been notified.");
                              } catch (err: any) {
                                const msg = (err.message || "").toLowerCase();
                                let friendlyMessage = "Delivery partner network is currently busy. Please try again in a moment.";
                                if (msg.includes("address") || msg.includes("pincode") || msg.includes("location")) {
                                  friendlyMessage = "There is an issue with the delivery address. Please contact Hive support.";
                                } else if (msg.includes("unauthorized") || msg.includes("token")) {
                                  friendlyMessage = "Session expired. Please refresh the page and try again.";
                                }
                                toast.error("Pickup Request Issue", friendlyMessage);
                              } finally {
                                setDispatchingOrderId(null);
                              }
                            }}
                            disabled={dispatchingOrderId === order._id}
                            className={`mt-2.5 flex items-center justify-center gap-2 w-full px-3.5 py-2.5 text-[11px] font-extrabold uppercase tracking-wider rounded-xl transition-all duration-200 shadow-sm active:scale-[0.98] select-none cursor-pointer disabled:opacity-50 ${
                              order.status === "booking_failed"
                                ? "bg-rose-50 hover:bg-rose-100/70 active:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs"
                                : "bg-[#F5C22B] hover:bg-[#E0B024] active:bg-[#D9A71E] text-stone-950"
                            }`}
                          >
                            {dispatchingOrderId === order._id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Dispatching...</span>
                              </>
                            ) : order.status === "booking_failed" ? (
                              <>
                                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                                <span>Retry Pickup</span>
                              </>
                            ) : (
                              <>
                                <Truck className="w-3.5 h-3.5 text-stone-900" />
                                <span>Ready for Pickup</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-hive-text-muted">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <ClipboardList className="w-8 h-8 text-hive-border" />
                        <span>No orders found for your boutique yet.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      ) : activeTab === "reservations" ? (
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="hidden md:table-header-group">
                <tr className="bg-slate-50/60 border-b border-hive-border/30 text-[10px] font-extrabold uppercase tracking-wider text-[#94a3b8] select-none">
                  <th className="px-6 py-4">Reservation Status</th>
                  <th className="px-6 py-4">Reservation ID</th>
                  <th className="px-6 py-4">Requested Item</th>
                  <th className="px-6 py-4">Net Payout</th>
                  <th className="px-6 py-4">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border/30 font-semibold text-hive-dark">
                {reservations?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-hive-text-muted">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Calendar className="w-8 h-8 text-hive-border" />
                        <span>No reservations found for your boutique yet.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reservations?.map((reservation: any) => {
                    const isPending = reservation.status === "reservation_active" || reservation.status === "awaiting_store_confirmation";
                    
                    return (
                      <tr key={reservation._id} className="flex flex-col md:table-row bg-white border-b border-hive-border/30 mb-4 md:mb-0 hover:bg-slate-50/30 transition-colors p-4 md:p-0">
                        <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-black text-slate-800 tracking-wide uppercase">
                              {reservation.status.replace(/_/g, " ")}
                            </span>
                            {isPending && (
                              <div className="flex flex-col gap-1 mt-1 items-start">
                                <span className="inline-block px-2 py-0.5 border border-amber-200 bg-amber-50 text-amber-700 text-[9px] font-extrabold uppercase tracking-widest rounded-full">
                                  Action Required
                                </span>
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={async () => {
                                      setPendingActionId(reservation._id);
                                      try {
                                        await acceptReservation({ reservationId: reservation._id });
                                        toast.success("Reservation Confirmed", "Customer has been notified to proceed with checkout.");
                                      } catch (err: any) {
                                        toast.error("Confirmation Failed", err.message || "Failed to confirm reservation.");
                                      } finally {
                                        setPendingActionId(null);
                                      }
                                    }}
                                    disabled={pendingActionId === reservation._id}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 text-amber-400 text-[11px] font-bold tracking-wide rounded-xl shadow-2xs disabled:opacity-50 transition-all cursor-pointer active:scale-[0.98]"
                                  >
                                    {pendingActionId === reservation._id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                                    )}
                                    <span>Confirm</span>
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setPendingActionId(reservation._id);
                                      try {
                                        await declineReservation({ reservationId: reservation._id });
                                        toast.success("Reservation Declined", "Customer has been notified.");
                                      } catch (err: any) {
                                        toast.error("Decline Failed", err.message || "Failed to decline reservation.");
                                      } finally {
                                        setPendingActionId(null);
                                      }
                                    }}
                                    disabled={pendingActionId === reservation._id}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-600 hover:text-rose-600 text-[11px] font-bold tracking-wide rounded-xl disabled:opacity-50 transition-all cursor-pointer active:scale-[0.98]"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Decline</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                          <span className="text-[11px] font-mono text-slate-500 font-semibold bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            RES-{reservation._id.slice(-5).toUpperCase()}
                          </span>
                        </td>
                        <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-[44px] h-[44px] rounded-xl border border-[#f1f5f9] overflow-hidden bg-slate-50 flex-shrink-0 relative shadow-2xs">
                              {reservation.productImageUrl ? (
                                <img src={reservation.productImageUrl} alt={reservation.productName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-slate-400">No Img</div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-800 truncate">{reservation.productName || "Product"}</span>
                              <span className="text-[10px] text-slate-500 font-medium">Size {reservation.size}</span>
                            </div>
                          </div>
                        </td>
                        <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4 font-bold text-slate-700">
                          <span className="md:hidden text-[10px] font-extrabold text-[#94a3b8] uppercase tracking-wider block mb-1">Net Payout</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">
                              ₹{(reservation.netPayout ?? reservation.priceAtReserve ?? 0).toLocaleString("en-IN")}
                            </span>
                            <span className="text-[10px] font-normal text-slate-400">Net payout</span>
                          </div>
                        </td>
                        <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                          {reservation.reservationExpiresAt && (
                            <span className="text-xs text-slate-600">
                              {new Date(reservation.reservationExpiresAt).toLocaleString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {/* Full-Screen Decline Modal (Apple restraint + Aesop warmth + Linear clarity) */}
      {orderToDecline !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-3xl p-6 md:p-7 w-full max-w-md shadow-[0_20px_60px_-15px_rgba(44,38,30,0.25)] border border-[#f1f5f9] flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            {declineStep === "confirm" ? (
              <>
                <div>
                  <h3 className="text-xl font-serif font-black text-[#0f172a]">Are you sure you can&apos;t fulfil this order?</h3>
                  <p className="text-[13px] font-medium text-[#64748b] mt-2 leading-relaxed">
                    This helps keep delivery times reliable for customers and protects your boutique rating.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => {
                      setOrderToDecline(null);
                      setDeclineStep("confirm");
                      setCancelReason("");
                      setDeclineReasonType("Out of stock");
                      setDeclineError(false);
                    }}
                    className="flex-1 py-3 bg-[#F5C22B] hover:bg-[#E0B024] active:bg-[#D9A71E] text-slate-900 font-extrabold rounded-xl text-[14px] font-extrabold tracking-wide transition-all shadow-xs cursor-pointer text-center"
                  >
                    Continue with order
                  </button>
                  <button
                    onClick={() => setDeclineStep("reason")}
                    className="py-3 px-5 bg-transparent hover:bg-slate-50 text-[#64748b] hover:text-rose-600 rounded-xl text-[13px] font-bold tracking-wide transition-all cursor-pointer text-center"
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-xl font-serif font-black text-[#0f172a]">Decline order</h3>
                  <p className="text-[13px] font-medium text-[#334155] mt-1">
                    This order will be cancelled and the customer will be notified.
                  </p>
                  <p className="text-[11px] font-medium text-[#64748b] mt-0.5">
                    Refunds, if applicable, will be processed automatically.
                  </p>
                </div>
                
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-[13px] font-extrabold text-[#0f172a] pb-1">
                    Why can&apos;t you fulfil this order?
                  </span>
                  
                  {[
                    "Out of stock",
                    "Unable to prepare in time",
                    "Store closing",
                    "Other"
                  ].map((option) => {
                    const isSelected = declineReasonType === (option === "Other" ? "Other (Type reason)" : option);
                    return (
                      <div
                        key={option}
                        onClick={() => {
                          const val = option === "Other" ? "Other (Type reason)" : option;
                          setDeclineReasonType(val);
                          setDeclineError(false);
                        }}
                        className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none ${
                          isSelected
                            ? "border-[#F5C22B] bg-slate-50 text-[#0f172a] font-extrabold shadow-2xs"
                            : "border-[#f1f5f9] bg-white text-[#334155] font-semibold hover:border-[#F5C22B]/50 hover:bg-slate-50/40"
                        }`}
                      >
                        <span className="text-[13px]">{option}</span>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-[#F5C22B] text-slate-900 font-bold"
                            : "border border-stone-200 text-transparent"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-stone-950 stroke-[3]" />}
                        </span>
                      </div>
                    );
                  })}
                  
                  {declineReasonType === "Other (Type reason)" && (
                    <input 
                      id="cancelReason"
                      type="text" 
                      placeholder="e.g. System glitch, Manager away" 
                      value={cancelReason}
                      onChange={(e) => {
                        setCancelReason(e.target.value);
                        setDeclineError(false);
                      }}
                      className={`mt-1 px-3.5 py-3 border ${
                        declineError 
                          ? "border-rose-400 bg-rose-50 placeholder:text-rose-300 focus:ring-rose-400" 
                          : "border-[#f1f5f9] bg-white focus:border-[#F5C22B] focus:ring-[#F5C22B]"
                      } rounded-xl text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-1 transition-colors w-full`}
                      autoFocus
                    />
                  )}

                  {declineReasonType === "Out of stock" && (
                    <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl text-[12px] font-medium text-stone-600 flex items-start gap-2 mt-1">
                      <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                      <span>Consider updating your inventory after declining this order.</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-[#f1f5f9]/60">
                  <button
                    onClick={() => {
                      setOrderToDecline(null);
                      setDeclineStep("confirm");
                      setCancelReason("");
                      setDeclineReasonType("Out of stock");
                      setDeclineError(false);
                    }}
                    disabled={pendingActionId === orderToDecline}
                    className="flex-1 py-3 bg-[#F5C22B] hover:bg-[#E0B024] active:bg-[#D9A71E] text-stone-950 font-extrabold rounded-xl text-[13px] tracking-wide transition-all shadow-xs cursor-pointer text-center"
                  >
                    Keep Order
                  </button>
                  <button
                    onClick={async () => {
                      const finalReason = declineReasonType === "Other (Type reason)" ? cancelReason.trim() : declineReasonType;
                      
                      if (declineReasonType === "Other (Type reason)" && !finalReason) {
                        setDeclineError(true);
                        return;
                      }
                      
                      setPendingActionId(orderToDecline);
                      try {
                        await updateStatus({
                          orderId: orderToDecline as Id<"orders">,
                          status: "cancelled",
                          cancelReason: finalReason,
                        });
                        toast.success("Order Declined", "Order cancelled and customer has been notified.");
                      } catch (err: any) {
                        toast.error("Failed to Decline Order", err.message || "Failed to cancel order.");
                      } finally {
                        setPendingActionId(null);
                        setOrderToDecline(null);
                        setDeclineStep("confirm");
                        setCancelReason("");
                        setDeclineReasonType("Out of stock");
                        setDeclineError(false);
                      }
                    }}
                    disabled={pendingActionId === orderToDecline}
                    className="py-3 px-5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-xl text-[13px] font-bold tracking-wide transition-all cursor-pointer text-center disabled:opacity-50"
                  >
                    {pendingActionId === orderToDecline ? "Processing..." : "Decline order"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Full-Screen Retry Logistics Modal */}
      {retryDispatchOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-black text-hive-dark">Retry Logistics Booking</h3>
              <p className="text-sm font-medium text-slate-600 mt-2">
                The previous attempt to assign a delivery rider failed. Would you like to try again?
              </p>
            </div>
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={async () => {
                  setRetryingOrderId(retryDispatchOrderId);
                  try {
                    await retryDispatch({ orderId: retryDispatchOrderId as Id<"orders"> });
                    toast.success("Logistics Retried", "Requesting delivery partner dispatch.");
                    setRetryDispatchOrderId(null);
                  } catch (err: any) {
                    const msg = (err.message || "").toLowerCase();
                    let friendlyMessage = "Delivery partner network is currently busy. Please click retry again in 1 minute.";
                    
                    if (msg.includes("address") || msg.includes("pincode") || msg.includes("location")) {
                      friendlyMessage = "There is an issue with the customer's delivery location. Please contact Hive support.";
                    } else if (msg.includes("unauthorized") || msg.includes("token") || msg.includes("auth")) {
                      friendlyMessage = "System connection issue. Please refresh the page and try again.";
                    }
                    
                    toast.error("Retry Failed", friendlyMessage);
                  } finally {
                    setRetryingOrderId(null);
                  }
                }}
                disabled={retryingOrderId === retryDispatchOrderId}
                className="flex-1 px-4 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
              >
                {retryingOrderId === retryDispatchOrderId ? "Retrying..." : "Confirm Retry"}
              </button>
              <button
                onClick={() => setRetryDispatchOrderId(null)}
                disabled={retryingOrderId === retryDispatchOrderId}
                className="flex-1 px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
