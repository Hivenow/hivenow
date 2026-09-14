"use client";

// Force Vercel deployment update for customer order review features
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Calendar,
  Clock,
  ArrowRight,
  Package,
  Loader2,
  Star,
  CheckCircle,
  CheckCircle2,
  Undo2,
  Repeat,
  Circle,
  Ban,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useInvoiceDownload } from "@/hooks/useInvoiceDownload";
import { useSessionStore } from "@/context/SessionContext";
import { navigateToSignIn } from "@/lib/auth-redirect";
import { ReviewModal } from "@/components/product/ReviewModal";
import { formatCurrency } from "@hive/utils";
import { Tabs, EmptyState } from "@hive/ui";
import { CUSTOMER_FEATURES } from "@/config/features";

// ── Helpers ───────────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = [
  "pending_payment",
  "pending_confirmation",
  "reservation_converted",
  "confirmed",
  "packed",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "replacement_dispatched",
];
const CANCELLED_STATUSES = [
  "cancelled",
  "refunded",
  "booking_failed",
  "declined",
  "cancelled_by_merchant",
];
const COMPLETED_STATUSES = [
  "delivered",
  "replacement_delivered",
  "claim_submitted",
  "replacement_requested",
  "replacement_approved",
  "refund_requested",
];

const ACTIVE_STEPS = [
  { id: "placed", label: "Placed" },
  { id: "confirmed", label: "Confirmed" },
  { id: "picked_up", label: "Picked Up" },
  { id: "out_for_delivery", label: "Out for Delivery" },
] as const;

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
// /orders — Customer Orders Page (with Rate & Review action for delivered orders)
// ─────────────────────────────────────────────────────────────────────────────
export default function MyOrdersPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { token, isAuthenticated, isLoading: sessionLoading } = useSessionStore();
  const [reviewingOrder, setReviewingOrder] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed" | "cancelled">("active");

  // Skipped while signed out: without a token the query can only come back empty, and that empty
  // result was indistinguishable from having no orders.
  const convexOrders = useQuery(
    api.orders.listMyOrders,
    isAuthenticated ? { token: token || undefined } : "skip"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Session first, so a signed-in shopper never sees the sign-in prompt while their session is
  // still resolving.
  if (!mounted || sessionLoading) {
    return <OrdersSkeleton />;
  }

  // Signed out is not the same as having no orders, and this page used to conflate them: a
  // returning customer whose session had expired was told they had never ordered anything, on the
  // page they had opened to track a delivery. Checkout already distinguishes the two - both of its
  // steps ask an unauthenticated visitor to sign in rather than showing them an empty checkout.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white py-10 px-4 sm:px-6 lg:px-8 select-none text-left antialiased">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div className="pb-6 border-b border-stone-200/80">
            <div className="flex justify-between items-baseline gap-4">
              <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">
                My Orders
              </h1>
              <Link
                href="/products"
                className="text-xs font-semibold text-stone-700 hover:text-stone-950 transition-colors whitespace-nowrap"
              >
                Browse Products →
              </Link>
            </div>
          </div>

          <EmptyState
            title="Sign in to see your orders"
            description="Your orders, delivery updates and returns all live here once you're signed in."
            icon={<Package className="w-6 h-6" />}
            action={{
              label: "Sign In",
              onClick: () => navigateToSignIn(router, "/orders"),
            }}
          />
        </div>
      </div>
    );
  }

  if (convexOrders === undefined) {
    return <OrdersSkeleton />;
  }

  // Sort: newest first
  const sortedOrders = [...convexOrders].sort((a, b) => b.createdAt - a.createdAt);

  const activeOrdersCount = sortedOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const deliveredOrdersCount = sortedOrders.filter((o) => COMPLETED_STATUSES.includes(o.status)).length;
  const cancelledOrdersCount = sortedOrders.filter((o) => CANCELLED_STATUSES.includes(o.status)).length;

  const filteredOrders = sortedOrders.filter((o) => {
    if (activeTab === "active") return ACTIVE_STATUSES.includes(o.status);
    if (activeTab === "completed") return COMPLETED_STATUSES.includes(o.status);
    if (activeTab === "cancelled") return CANCELLED_STATUSES.includes(o.status);
    return false;
  });

  // Map every Convex status value → one of the UI step states.
  const mapStatus = (s: string): string => {
    const map: Record<string, string> = {
      pending_payment: "placed",
      pending_confirmation: "placed",
      reservation_converted: "placed",
      confirmed: "confirmed",
      packed: "confirmed",
      pickup_scheduled: "picked_up",
      picked_up: "picked_up",
      in_transit: "picked_up",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      replacement_delivered: "delivered",
      claim_submitted: "delivered",
      replacement_requested: "delivered",
      replacement_approved: "delivered",
      replacement_dispatched: "picked_up",
      refund_requested: "delivered",
      refunded: "cancelled",
      cancelled: "cancelled",
      declined: "cancelled",
      cancelled_by_merchant: "cancelled",
      booking_failed: "cancelled",
    };
    return map[s] ?? "placed";
  };

  const firstReviewItem = reviewingOrder?.items?.[0];

  const emptyCopy: Record<typeof activeTab, { title: string; description: string }> = {
    active: {
      title: "No active orders",
      description: "Everything you've ordered recently has been delivered. Time to add something new to cart.",
    },
    completed: {
      title: "Nothing delivered yet",
      description: "Once an order is delivered it'll show up here, ready to rate and review.",
    },
    cancelled: {
      title: "No cancelled orders",
      description: "Cancelled and refunded orders will be listed here.",
    },
  };

  return (
    <div className="min-h-screen bg-white py-10 px-4 sm:px-6 lg:px-8 select-none text-left antialiased">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {/* Page Header */}
        <div className="pb-6 border-b border-stone-200/80">
          <div className="flex justify-between items-baseline gap-4">
            <div>
              <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">My Orders</h1>
              {sortedOrders.length > 0 && (
                <p className="text-xs text-stone-500 font-medium mt-1">
                  {sortedOrders.length} order{sortedOrders.length !== 1 ? "s" : ""} placed so far
                </p>
              )}
            </div>
            <Link
              href="/products"
              className="text-xs font-semibold text-stone-700 hover:text-stone-950 transition-colors whitespace-nowrap"
            >
              Browse Products →
            </Link>
          </div>
        </div>

        {sortedOrders.length === 0 ? (
          <EmptyState
            title="You haven't placed any orders yet"
            description="Your curation journey is waiting. Explore unique, hand-crafted pieces from India's finest independent local designers."
            icon={<Package className="w-6 h-6" />}
            action={{ label: "Shop Now", onClick: () => router.push("/products") }}
          />
        ) : (
          <>
            {/* Tab Bar — shared @hive/ui Tabs primitive */}
            <Tabs
              variant="pills"
              items={[
                { id: "active", label: "Active", count: activeOrdersCount },
                { id: "completed", label: "Completed", count: deliveredOrdersCount },
                { id: "cancelled", label: "Cancelled", count: cancelledOrdersCount },
              ]}
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as any)}
              className="-mt-2"
            />

            {/* Order List / Empty State */}
            {filteredOrders.length === 0 ? (
              <EmptyState
                title={emptyCopy[activeTab].title}
                description={emptyCopy[activeTab].description}
                icon={<Package className="w-6 h-6" />}
              />
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
                className="flex flex-col gap-4"
              >
                <AnimatePresence mode="popLayout">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order._id}
                      order={order}
                      mapStatus={mapStatus}
                      onOpenReview={(ord) => setReviewingOrder(ord)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {reviewingOrder && firstReviewItem && (
          <ReviewModal
            isOpen={Boolean(reviewingOrder)}
            onClose={() => setReviewingOrder(null)}
            orderId={(reviewingOrder._id || reviewingOrder.convexId || reviewingOrder.id) as any}
            orderItemId={(firstReviewItem._id || firstReviewItem.id || firstReviewItem.productId) as any}
            productName={firstReviewItem.productName || firstReviewItem.name}
            productImage={firstReviewItem.imageUrl}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component: OrderProgressStepper — mini status track for in-flight orders
// ─────────────────────────────────────────────────────────────────────────────
function OrderProgressStepper({ uiStatus }: { uiStatus: string }) {
  const currentIndex = Math.max(
    0,
    ACTIVE_STEPS.findIndex((s) => s.id === uiStatus)
  );

  return (
    <div className="flex items-center gap-0 w-full max-w-[280px]" aria-label={`Order status: ${ACTIVE_STEPS[currentIndex]?.label}`}>
      {ACTIVE_STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-colors ${
                  isDone || isCurrent ? "bg-stone-900" : "bg-stone-200"
                } ${isCurrent ? "ring-2 ring-stone-900/15" : ""}`}
              />
            </div>
            {i < ACTIVE_STEPS.length - 1 && (
              <div className={`h-[1.5px] flex-1 min-w-[10px] ${isDone ? "bg-stone-900" : "bg-stone-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component: OrderThumbnails — single image, or a stacked cluster for multi-item orders
// ─────────────────────────────────────────────────────────────────────────────
function OrderThumbnails({ items }: { items: any[] }) {
  const visible = items.slice(0, 3);

  return (
    <div className="relative w-20 h-24 shrink-0">
      {visible.map((item, i) => (
        <div
          key={item._id || item.id || i}
          style={{ left: i * 6, top: i * 6, zIndex: visible.length - i }}
          className="absolute rounded-xl overflow-hidden bg-stone-100 border border-stone-200/80 shadow-2xs w-16 h-20"
        >
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-stone-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-stone-400" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component: OrderCard
// ─────────────────────────────────────────────────────────────────────────────
type ConvexOrder = NonNullable<ReturnType<typeof useQuery<typeof api.orders.listMyOrders>>>[number];

function OrderCard({
  order,
  mapStatus,
  onOpenReview,
}: {
  order: ConvexOrder;
  mapStatus: (s: string) => string;
  onOpenReview: (ord: ConvexOrder) => void;
}) {
  const { downloadInvoiceByOrderId, isDownloading } = useInvoiceDownload();
  const downloading = isDownloading(order._id);
  const firstItem = order.items[0];
  const itemsCount = order.items.reduce((acc: number, item: any) => acc + item.quantity, 0);
  const uiStatus = mapStatus(order.status);
  const isActive = ["placed", "confirmed", "picked_up", "out_for_delivery"].includes(uiStatus);
  const isDelivered = uiStatus === "delivered" || order.status === "delivered";
  const isCancelled = uiStatus === "cancelled";

  // Window runs from delivery, matching the server and the payout hold.
  const deliveredTime = order.deliveredAt || order.updatedAt;
  const msLeft = 24 * 60 * 60 * 1000 - (Date.now() - deliveredTime);
  const withinWindow = msLeft > 0;
  const hoursLeft = Math.max(0, Math.ceil(msLeft / (60 * 60 * 1000)));
  // Respect the policy frozen onto the order — a Final Sale purchase must not
  // be offered a return here only to be refused on the next screen.
  const returnsAllowed = order.returnsAccepted !== false;
  const exchangesAllowed = order.exchangesAccepted ?? returnsAllowed;
  const isReturnEligible = isDelivered && withinWindow && returnsAllowed;
  const isExchangeEligible = CUSTOMER_FEATURES.EXCHANGES_ENABLED && isDelivered && withinWindow && exchangesAllowed;

  const deliverySlot = order.notes?.split("Slot: ")[1] ?? "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`bg-white border rounded-xl p-6 shadow-sm hover:border-hive-dark/20 transition-all duration-300 text-left flex flex-col md:flex-row md:items-center justify-between gap-6 ${
        isCancelled ? "border-hive-dark/[0.06] opacity-70" : "border-hive-dark/[0.08]"
      }`}
    >
      <div className="flex gap-4 flex-1 min-w-0">
        <OrderThumbnails items={order.items} />

        {/* Order details */}
        <div className="flex flex-col justify-between py-1 flex-1 min-w-0 gap-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-stone-900 tracking-wider select-all">
                #{order.orderNumber}
              </span>
              {/* Only show minimal status tag if active in-flight; NEVER redundant DELIVERED badge */}
              {isActive && (
                <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-stone-600 bg-stone-100 border border-stone-200/80 px-2 py-0.5 rounded">
                  {order.status === "replacement_dispatched"
                    ? (CUSTOMER_FEATURES.EXCHANGES_ENABLED ? "Replacement Dispatched" : "Dispatched")
                    : uiStatus.replace(/_/g, " ")}
                </span>
              )}
              {isCancelled && (
                <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                  {order.status === "refunded" ? "Refunded" : order.status === "booking_failed" ? "Delivery Unsuccessful" : "Cancelled"}
                </span>
              )}
            </div>

            <h4 className="text-sm font-sans font-semibold text-stone-900 truncate leading-snug">
              {firstItem?.productName || "Order"}
              {itemsCount > 1 && (
                <span className="text-xs text-stone-500 font-sans font-medium"> +{itemsCount - 1} more items</span>
              )}
            </h4>

            {firstItem && (
              <div className="pt-0.5">
                <span className="text-[9px] font-bold text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                  Size: {firstItem.variantSize || "Free"}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 font-medium">
            {isDelivered ? (
              <span className="flex items-center gap-1.5 text-stone-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-stone-800" />
                Delivered on {formatDate(deliveredTime)}
              </span>
            ) : isCancelled ? (
              <span className="flex items-center gap-1.5 text-stone-500">
                <Ban className="w-3.5 h-3.5" />
                {order.status === "refunded" ? "Refunded" : order.status === "booking_failed" ? "Delivery Unsuccessful" : "Cancelled"} • {formatDate(order.createdAt)}
              </span>
            ) : order.status === "replacement_dispatched" ? (
              <span className="flex items-center gap-1.5 text-stone-700 font-medium">
                <Package className="w-3.5 h-3.5 text-stone-600" />
                {CUSTOMER_FEATURES.EXCHANGES_ENABLED ? "Replacement in transit" : "Order in transit"} • Ordered {formatDate(order.createdAt)}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-stone-600">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  Ordered on {formatDate(order.createdAt)}
                </span>
                {deliverySlot && (
                  <span className="flex items-center gap-1.5 text-stone-600">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    {deliverySlot}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Mini progress track for orders still in flight */}
          {isActive && (
            <div className="pt-1">
              <OrderProgressStepper uiStatus={uiStatus} />
            </div>
          )}

          {/* Return/exchange window countdown */}
          {isDelivered && (isReturnEligible || isExchangeEligible) && (
            <span className="text-[10px] font-medium text-stone-600 bg-stone-50 border border-stone-200/80 rounded px-2 py-0.5 w-fit">
              {isExchangeEligible ? `Return/exchange window closes in ${hoursLeft}h` : `Return window closes in ${hoursLeft}h`}
            </span>
          )}
        </div>
      </div>

      {/* Right: Paid & CTAs */}
      <div className="flex flex-col md:items-end gap-3.5 border-t border-stone-100 md:border-t-0 pt-4 md:pt-0 md:pl-4 shrink-0">
        <div className="text-left md:text-right">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Total Paid</span>
          <span className="text-base font-mono font-bold text-stone-900">{formatCurrency(order.total)}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDelivered ? (
            <>
              {isExchangeEligible && (
                <Link
                  href={`/orders/${order._id}`}
                  className="h-9 px-3 border border-stone-200 hover:border-stone-300 text-stone-800 bg-white hover:bg-stone-50 transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Repeat className="w-3.5 h-3.5 text-stone-500" />
                  <span>Exchange</span>
                </Link>
              )}
              {isReturnEligible && (
                <Link
                  href={`/orders/${order._id}`}
                  className="h-9 px-3 border border-stone-200 hover:border-stone-300 text-stone-800 bg-white hover:bg-stone-50 transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Undo2 className="w-3.5 h-3.5 text-stone-500" />
                  <span>Return</span>
                </Link>
              )}
              {firstItem?.hasReview ? (
                <div className="h-9 px-3 border border-stone-200/70 text-stone-500 bg-stone-50 rounded-xl text-xs font-medium flex items-center justify-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-stone-400 text-stone-400" />
                  <span>Reviewed</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenReview(order)}
                  className="h-9 px-4 bg-stone-950 text-white hover:bg-stone-800 active:scale-[0.98] transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5" />
                  <span>Rate & Review</span>
                </button>
              )}

              <button
                onClick={() => downloadInvoiceByOrderId(order._id)}
                disabled={downloading}
                className="h-9 px-3.5 border border-stone-200 hover:bg-stone-50 text-stone-800 bg-white transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" /> : "Invoice"}
              </button>

              <Link
                href={`/orders/${order._id}`}
                className="h-9 px-3.5 border border-stone-200 hover:bg-stone-50 text-stone-800 bg-white transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-2xs"
              >
                <span>Details</span>
                <ChevronRight className="w-3 h-3 text-stone-400" />
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => downloadInvoiceByOrderId(order._id)}
                disabled={downloading}
                className="h-9 px-3.5 border border-stone-200 hover:bg-stone-50 text-stone-800 bg-white transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" /> : "Invoice"}
              </button>

              <Link
                href={`/orders/${order._id}`}
                className="h-9 px-4 bg-stone-950 text-white hover:bg-stone-800 active:scale-[0.98] transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-2xs"
              >
                <span>{isCancelled ? "Details" : "Track"}</span>
                <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function OrdersSkeleton() {
  return (
    <div className="min-h-screen bg-white py-10 px-4 sm:px-6 lg:px-8 animate-pulse select-none text-left">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="space-y-2 pb-6 border-b border-hive-dark/[0.08]">
          <div className="h-3 w-24 bg-hive-dark/[0.05] rounded" />
          <div className="h-8 w-40 bg-hive-dark/[0.05] rounded-lg" />
          <div className="h-3 w-28 bg-hive-dark/[0.05] rounded" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-24 bg-hive-dark/[0.05] rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-hive-dark/[0.08] rounded-xl h-32" />
          ))}
        </div>
      </div>
    </div>
  );
}
