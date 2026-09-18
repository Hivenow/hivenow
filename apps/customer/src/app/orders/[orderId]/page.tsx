"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Download,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Package,
  Calendar,
  Clock,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useInvoiceDownload } from "@/hooks/useInvoiceDownload";
import { CustomerPriceBreakdown } from "@/components/checkout/CustomerPriceBreakdown";
import { ReturnExchangeActions } from "@/components/orders/ReturnExchangeActions";
import { useSessionStore } from "@/context/SessionContext";
import { formatCurrency, toast } from "@hive/utils";
import BeeLoader from "@/components/shared/BeeLoader";
import { OrderConfirmationPushPrompt } from "@/components/checkout/OrderConfirmationPushPrompt";
import { NextOrderSavedItemPrompt } from "@/components/checkout/NextOrderSavedItemPrompt";
import { CUSTOMER_FEATURES } from "@/config/features";

// ─────────────────────────────────────────────────────────────────────────────
// Animated Number Ticker Component
// ─────────────────────────────────────────────────────────────────────────────
function NumberTicker({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 600;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setDisplayValue(Math.floor(progress * value));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{formatCurrency(displayValue).replace(".00", "")}</span>;
}

function formatDate(epochMs?: number) {
  if (!epochMs) return "Recently";
  try {
    return new Date(epochMs).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Recently";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Mapping & 4-Step Progress Stepper
// ─────────────────────────────────────────────────────────────────────────────
const DISPLAY_STEPS = [
  { id: "placed", label: "Placed" },
  { id: "confirmed", label: "Confirmed" },
  { id: "dispatched", label: "Dispatched" },
  { id: "delivered", label: "Delivered" },
] as const;

function getOrderHero(status: string) {
  switch (status) {
    // ── Delivered states
    case "delivered":
    case "replacement_delivered":
      return {
        title: "Order Delivered",
        description: "Your pieces have arrived. We hope you love your selection.",
      };

    // ── Post-delivery claims & exchanges (retaining delivered context)
    case "claim_submitted":
      return {
        title: "Order Delivered",
        description: "Delivered • Your claim request is currently in review.",
      };
    case "replacement_requested":
      return {
        title: "Order Delivered",
        description: CUSTOMER_FEATURES.EXCHANGES_ENABLED
          ? "Delivered • Size exchange request received."
          : "Delivered • Return request received.",
      };
    case "replacement_approved":
      return {
        title: "Order Delivered",
        description: CUSTOMER_FEATURES.EXCHANGES_ENABLED
          ? "Delivered • Size exchange approved by designer."
          : "Delivered • Return request under review.",
      };
    case "refund_requested":
      return {
        title: "Order Delivered",
        description: "Delivered • Return refund request received.",
      };

    // ── In-transit replacement dispatch
    case "replacement_dispatched":
      return {
        title: CUSTOMER_FEATURES.EXCHANGES_ENABLED ? "Replacement Dispatched" : "Order Dispatched",
        description: CUSTOMER_FEATURES.EXCHANGES_ENABLED
          ? "Your replacement piece is in transit with our delivery partner."
          : "A package for your order is in transit with our delivery partner.",
      };

    // ── Terminal & Problem states (explicitly non-guessing)
    case "refunded":
      return {
        title: "Order Refunded",
        description: "A full refund has been processed to your original payment method.",
      };
    case "cancelled":
    case "declined":
    case "cancelled_by_merchant":
      return {
        title: "Cancelled",
        description: "This order has been cancelled. An instant refund has been initiated to your original payment method.",
      };
    case "booking_failed":
      return {
        title: "Delivery Unsuccessful",
        description: "We were unable to secure courier dispatch for this delivery. A full refund has been initiated.",
      };

    // ── Out for delivery
    case "out_for_delivery":
      return {
        title: "Out for Delivery",
        description: "Your order is on the courier vehicle and heading to your doorstep.",
      };

    // ── Dispatched / In transit
    case "picked_up":
    case "in_transit":
    case "pickup_scheduled":
      return {
        title: "Order Dispatched",
        description: "Your package is in transit with our hyper-local delivery partner.",
      };

    // ── Confirmed / Packed
    case "confirmed":
    case "packed":
      return {
        title: "Order Confirmed",
        description: "We've received your order and are preparing your pieces for delivery.",
      };

    // ── Placed
    case "pending_payment":
    case "pending_confirmation":
    case "reservation_converted":
      return {
        title: "Order Placed",
        description: "We've received your order and are awaiting seller confirmation.",
      };

    // ── Explicit Non-Guessing Fallback for unknown status
    default:
      return {
        title: "Order Details",
        description: `Current order status: ${status ? status.replace(/_/g, " ") : "Processing"}.`,
      };
  }
}

function getActiveStepIndex(status: string): number {
  switch (status) {
    case "pending_payment":
    case "pending_confirmation":
    case "reservation_converted":
      return 0; // Placed
    case "confirmed":
    case "packed":
      return 1; // Confirmed
    case "pickup_scheduled":
    case "picked_up":
    case "in_transit":
    case "out_for_delivery":
    case "replacement_dispatched":
      return 2; // Dispatched
    case "delivered":
    case "claim_submitted":
    case "replacement_requested":
    case "replacement_approved":
    case "replacement_delivered":
    case "refund_requested":
      return 3; // Delivered
    case "cancelled":
    case "declined":
    case "cancelled_by_merchant":
    case "booking_failed":
    case "refunded":
      return -1; // Terminal / problem state
    default:
      return 0;
  }
}

function OrderStepper({ status }: { status: string }) {
  const currentStep = getActiveStepIndex(status);

  return (
    <div className="w-full pt-1 pb-2">
      <div className="flex items-center justify-between relative">
        {/* Track Line Background */}
        <div className="absolute top-2.5 left-4 right-4 h-[2px] bg-stone-200" />
        {/* Active Progress Track */}
        <div
          className="absolute top-2.5 left-4 h-[2px] bg-stone-900 transition-all duration-500"
          style={{ width: `calc(${(currentStep / (DISPLAY_STEPS.length - 1)) * 100}% - 16px)` }}
        />

        {DISPLAY_STEPS.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 z-10">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                  isDone
                    ? "bg-stone-900 border-stone-900 text-white"
                    : isCurrent
                      ? "bg-stone-900 border-stone-900 text-white ring-4 ring-stone-900/10"
                      : "bg-white border-stone-300 text-transparent"
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3 stroke-[3]" />
                ) : isCurrent ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                ) : null}
              </div>
              <span
                className={`text-[11px] tracking-tight ${
                  isCurrent
                    ? "text-stone-950 font-bold"
                    : isDone
                      ? "text-stone-800 font-semibold"
                      : "text-stone-400 font-medium"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Framer Motion Animation Variants
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// /orders/[orderId] — Editorial Post-Purchase Confirmation Page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const { token } = useSessionStore();
  const { downloadInvoiceByOrderId, isDownloading } = useInvoiceDownload();

  const order = useQuery(api.orders.getOrderById, {
    orderId: orderId as Id<"orders">,
    token: token || undefined,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyOrderId = (idStr: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(idStr);
      setCopied(true);
      toast.success("Order ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!mounted || order === undefined) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <BeeLoader message="Loading order details..." />
      </div>
    );
  }

  // ── Order Not Found State ──────────────────────────────────────────────────
  if (!order) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center py-20 px-6 text-center select-none">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-3xl p-8 space-y-6 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200/50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500 stroke-[1.8]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-2xl font-bold text-stone-900">Order Not Found</h1>
            <p className="text-xs text-stone-500 max-w-[280px] mx-auto leading-relaxed">
              We couldn&apos;t locate any order matching ID:{" "}
              <span className="font-mono font-bold text-stone-800 select-all">{orderId}</span>
            </p>
          </div>
          <Link
            href="/orders"
            className="w-full h-11 bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Back to My Orders</span>
            <ChevronRight className="w-4 h-4 text-stone-400" />
          </Link>
        </div>
      </div>
    );
  }

  const isDeclined = order.status === "declined" || order.status === "cancelled_by_merchant";
  const isBookingFailed = order.status === "booking_failed";
  const isRefunded = order.status === "refunded";
  const isCancelled = isDeclined || order.status === "cancelled" || isBookingFailed || isRefunded;

  const addr = order.deliveryAddress;
  const formattedAddress = addr
    ? `${addr.line1 || addr.formattedAddress || ""}, ${addr.city || ""} (${addr.pincode || ""})`
    : "Delivery Address";

  const isFinalSale = (order as any).returnsAccepted === false || (order as any).items?.every((i: any) => i.returnsAccepted === false);
  const isDelivered =
    order.status === "delivered" ||
    order.status === "replacement_delivered" ||
    order.status === "claim_submitted" ||
    order.status === "replacement_requested" ||
    order.status === "replacement_approved" ||
    order.status === "refund_requested";
  const deliveredTime = order.deliveredAt || order.updatedAt;
  const hoursSinceDelivery = isDelivered ? (Date.now() - deliveredTime) / (1000 * 60 * 60) : 0;
  const isWindowActive = isDelivered && hoursSinceDelivery <= 24;

  const hasLiveTracking = Boolean(order.driverDetails?.liveTrackingUrl);
  const heroContent = getOrderHero(order.status);

  return (
    <div className="min-h-screen bg-white text-stone-900 antialiased selection:bg-amber-100 pb-20">
      
      {/* ── Top Navigation Bar ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-stone-200/80 px-4 py-3.5 sticky top-0 z-30 flex items-center justify-between">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-950 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>My Orders</span>
        </Link>
        <span className="font-mono text-xs font-semibold tracking-tight text-stone-800">
          #{order.orderNumber}
        </span>
        <Link
          href="/contact"
          className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
        >
          Need Help?
        </Link>
      </header>

      {/* ── Main Editorial Content ─────────────────────────────────────────── */}
      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-md mx-auto px-5 py-6 space-y-7 text-left"
      >
        {/* ── Cancelled / Declined / Failed / Refunded State ──────────────────── */}
        {isCancelled ? (
          <motion.div
            variants={itemVariants}
            className="border border-red-200 rounded-3xl p-6 text-center space-y-3 bg-red-50/40"
          >
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <XCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-bold text-red-950">
                {isRefunded
                  ? "Order Refunded"
                  : isBookingFailed
                    ? "Delivery Unsuccessful"
                    : "Order Cancelled"}
              </h1>
              <p className="text-xs text-red-700 max-w-xs mx-auto leading-relaxed">
                {isRefunded
                  ? "A full refund has been processed to your original payment method."
                  : isBookingFailed
                    ? "We were unable to secure courier dispatch for this delivery. A full refund has been initiated."
                    : isDeclined
                      ? "The seller was unable to fulfill this order. A full refund has been initiated."
                      : "This order has been cancelled. An instant refund has been initiated to your original payment method."}
              </p>
            </div>
            <div className="inline-block px-3 py-1 bg-white border border-red-200 rounded-full text-xs font-mono font-bold text-red-700">
              ID: {order.orderNumber}
            </div>
          </motion.div>
        ) : (
          <>
            {/* ── Dominant Editorial Hero ────────────────────────────────────── */}
            <motion.div variants={itemVariants} className="text-center space-y-3 pt-2">
              <div className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-6 h-6 stroke-[2]" />
              </div>

              <div className="space-y-1">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 tracking-tight">
                  {heroContent.title}
                </h1>
                <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed font-medium">
                  {heroContent.description}
                </p>
              </div>

              {/* Order ID Pill with Copy Feedback & Date */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleCopyOrderId(order.orderNumber)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-stone-200/90 rounded-full text-xs font-mono font-bold text-stone-900 tracking-wider transition-colors cursor-pointer group active:scale-95 shadow-2xs"
                >
                  <span>#{order.orderNumber}</span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
                  )}
                </button>

                {order.createdAt && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    <span>{formatDate(order.createdAt)}</span>
                  </span>
                )}
              </div>
            </motion.div>

            {/* ── Saved-For-Next-Order Prompt (cross-boutique bag conflict) ───── */}
            <motion.div variants={itemVariants}>
              <NextOrderSavedItemPrompt orderId={order._id} boutiqueId={(order as any).boutiqueId} />
            </motion.div>

            {/* ── Restrained 4-Step Status Tracker ────────────────────────────── */}
            <motion.div variants={itemVariants} className="pt-2 pb-1 border-y border-stone-100 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 block">
                Order Status
              </span>
              <OrderStepper status={order.status} />
              {/* Only prompt for live delivery alerts if order is in-flight (never on delivered orders) */}
              {!isDelivered && (
                <OrderConfirmationPushPrompt userId={order.customerId} className="mt-1" />
              )}
            </motion.div>

            {/* ── Delivery Address ───────────────────────────────────────────── */}
            <motion.section variants={itemVariants} className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 block">
                Delivery Address
              </span>
              <div className="flex items-start gap-2 pt-0.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                <p className="text-xs text-stone-700 leading-relaxed font-medium">
                  {formattedAddress}
                </p>
              </div>
            </motion.section>

            {/* ── Order Summary & Items ──────────────────────────────────────── */}
            <motion.section variants={itemVariants} className="space-y-3 pt-1 border-t border-stone-100">
              <div className="flex items-baseline justify-between pt-3 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  Order Summary ({order.items.length} {order.items.length === 1 ? "Item" : "Items"})
                </span>
                <span className="text-sm font-mono font-bold text-stone-900">
                  <NumberTicker value={order.total} />
                </span>
              </div>

              <div className="divide-y divide-stone-100">
                {order.items.map((item: any, idx: number) => {
                  const rawSeller = item.boutiqueName || order.boutiqueName || "Independent Designer";
                  const cleanedSeller = rawSeller.replace(/\s*boutique\s*/gi, " ").trim();

                  return (
                    <div key={item._id || idx} className="py-3.5 flex items-center gap-3.5">
                      <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/80 shadow-2xs shrink-0 flex items-center justify-center">
                        {item?.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName || "Product"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <Package className="w-5 h-5 text-stone-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-serif font-bold text-stone-900 truncate leading-snug">
                          {item.productName || "Product"}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9px] font-bold text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                            Size: {item.variantSize || "Free"}
                          </span>
                          <span className="text-[10px] text-stone-500 font-medium">
                            Qty: {item.quantity || 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 mt-1 truncate">
                          Sold by {cleanedSeller || "Brand Store"}
                        </p>
                      </div>
                      <span className="text-sm font-mono font-bold text-stone-900 shrink-0 tabular-nums">
                        {formatCurrency(item.priceAtPurchase || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <CustomerPriceBreakdown
                subtotal={order.subtotal / 100}
                handlingCharge={(order as any).pricingSnapshot?.handlingChargePaise != null ? (order as any).pricingSnapshot.handlingChargePaise / 100 : undefined}
                platformFee={(order as any).pricingSnapshot?.platformFeePaise != null ? (order as any).pricingSnapshot.platformFeePaise / 100 : undefined}
                gstOnCharges={(order as any).pricingSnapshot?.platformChargesGstPaise != null ? (order as any).pricingSnapshot.platformChargesGstPaise / 100 : undefined}
                deliveryFee={order.deliveryFee / 100}
                discount={(order.discount || 0) / 100}
                total={order.total / 100}
                isEstimatedDelivery={false}
                showHelpSection={true}
                className="mt-3 pt-3 border-t border-stone-100"
              />
            </motion.section>

            {/* ── Returns & Exchanges Policy ─────────────────────────────────── */}
            <motion.section variants={itemVariants} className="space-y-1.5 pt-1 border-t border-stone-100">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 block pt-3">
                {CUSTOMER_FEATURES.EXCHANGES_ENABLED ? "Returns & Exchanges" : "Returns & Refunds"}
              </span>
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70 text-xs text-stone-600 space-y-1">
                <div className="flex items-center justify-between font-bold text-stone-900">
                  <span>{isFinalSale ? "Final Sale" : isWindowActive ? "Return Window Active" : "24-Hour Return Window"}</span>
                  {isWindowActive && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      {Math.max(0, Math.floor(24 - hoursSinceDelivery))}h remaining
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed font-normal">
                  {isFinalSale
                    ? "This item is Final Sale. Returns or change-of-mind cancellations are not accepted. Wrong, damaged, defective, or incorrect items remain 100% covered by Hive Guarantee."
                    : order.status === "replacement_dispatched"
                      ? (CUSTOMER_FEATURES.EXCHANGES_ENABLED
                          ? "Your replacement item has been dispatched and is currently en route."
                          : "A package for your order has been dispatched and is currently en route.")
                      : isDelivered
                        ? isWindowActive
                          ? (CUSTOMER_FEATURES.EXCHANGES_ENABLED
                              ? "Your 24-hour return window is active. Submit return or exchange requests within 24 hours of delivery."
                              : "Your 24-hour return window is active. Submit return requests within 24 hours of delivery.")
                          : "Voluntary return window has ended (24h past delivery). Damaged or wrong item claims remain covered."
                        : (CUSTOMER_FEATURES.EXCHANGES_ENABLED
                            ? "Voluntary 24-hour size exchanges and returns activate upon delivery."
                            : "Voluntary 24-hour returns activate upon delivery.")}
                </p>
              </div>

              {/* In-progress or available return actions */}
              {(isDelivered || order.status === "replacement_dispatched") && !isFinalSale && (
                <div className="pt-2">
                  <ReturnExchangeActions
                    orderId={order._id}
                    orderNumber={order.orderNumber}
                    returnStatus={(order as any).returnStatus}
                    isWindowActive={isWindowActive}
                    returnInspection={(order as any).returnInspection}
                  />
                </div>
              )}
            </motion.section>
          </>
        )}

        {/* ── Action Stack with Explicit Hierarchy ───────────────────────────── */}
        <motion.div variants={itemVariants} className="pt-4 space-y-2.5">
          {!isCancelled && (
            <>
              {hasLiveTracking ? (
                <>
                  {/* Primary CTA when live tracking is active */}
                  <a
                    href={order.driverDetails.liveTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-12 bg-stone-950 hover:bg-stone-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <span>Track Live Delivery</span>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400" />
                  </a>

                  {/* Secondary CTA */}
                  <Link
                    href="/products"
                    className="w-full h-11 bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                  >
                    <span>Continue Shopping</span>
                  </Link>
                </>
              ) : (
                /* Primary CTA when no live tracking URL is available */
                <Link
                  href="/products"
                  className="w-full h-12 bg-stone-950 hover:bg-stone-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
                >
                  <span>Continue Shopping</span>
                </Link>
              )}
            </>
          )}

          {/* Secondary Utilities: Invoice & Issue Reporting */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={isDownloading(order._id)}
              onClick={() => downloadInvoiceByOrderId(order._id, order)}
              className="h-11 bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-stone-500" />
              <span>{isDownloading(order._id) ? "Downloading..." : "Invoice"}</span>
            </button>

            <a
              href={`mailto:support@hivenow.in?subject=Order Issue - ${order.orderNumber}`}
              className="h-11 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-[0.98] text-center"
            >
              <AlertCircle className="w-3.5 h-3.5 text-stone-400" />
              <span>Report Issue</span>
            </a>
          </div>

          {/* Direct WhatsApp Helpline for Final Sale issues */}
          {isFinalSale && !isCancelled && (
            <div className="text-center pt-2">
              <a
                href={`https://wa.me/917356019103?text=${encodeURIComponent(
                  `Hi Hive Support, I need assistance with my order #${order.orderNumber}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-stone-500 hover:text-stone-900 underline font-medium"
              >
                Need immediate help? Chat with Hive on WhatsApp
              </a>
            </div>
          )}
        </motion.div>
      </motion.main>
    </div>
  );
}

