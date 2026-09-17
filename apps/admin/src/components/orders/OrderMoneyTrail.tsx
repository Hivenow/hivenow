"use client";

import React from "react";
import { useQuery } from "convex/react";
import {
  CreditCard,
  Split,
  RotateCcw,
  Truck,
  Ticket,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { formatCurrency } from "@hive/utils";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

/**
 * The money and logistics trail for one order.
 *
 * This answers, without leaving the drawer or opening the Razorpay dashboard:
 * did the customer actually pay, where did each rupee go, is the seller's cut
 * still held, did a refund really move money, and where is the parcel.
 */

function stamp(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Identifiers are long and get pasted into Razorpay and Porter dashboards. */
function CopyableId({ value, label }: { value: string | null; label: string }) {
  const [copied, setCopied] = React.useState(false);

  if (!value) {
    return (
      <Row label={label}>
        <span className="text-slate-300">not set</span>
      </Row>
    );
  }

  return (
    <Row label={label}>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title="Copy"
        className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-800 hover:text-hive-amber transition-colors cursor-pointer max-w-full"
      >
        <span className="truncate">{value}</span>
        {copied ? (
          <Check className="w-3 h-3 shrink-0 text-emerald-600" />
        ) : (
          <Copy className="w-3 h-3 shrink-0 opacity-40" />
        )}
      </button>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800 text-right min-w-0">
        {children}
      </span>
    </div>
  );
}

function Money({ label, paise, tone }: { label: string; paise: number | null; tone?: string }) {
  return (
    <Row label={label}>
      <span className={tone ?? "text-slate-800"}>
        {paise === null || paise === undefined ? "—" : formatCurrency(paise)}
      </span>
    </Row>
  );
}

const TONES: Record<string, string> = {
  captured: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  processed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  created: "bg-amber-50 text-amber-700 border-amber-200",
  withheld: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  reversed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-slate-100 text-slate-700 border-slate-300",
};

function Pill({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const cls = TONES[value] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

function Card({
  icon,
  title,
  children,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-hive-border/40">
      <div
        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2 ${
          accent ?? "text-slate-400"
        }`}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Porter hands back two links: a tracking page for the job, and a live map for
 * the rider once one is assigned. The seller portal shows both; admin was
 * showing only the first, which meant the team fielding "where is my order"
 * had less to go on than the boutique did.
 */
function TrackingLinks({
  trackingUrl,
  liveTrackingUrl,
  label = "Open Porter tracking",
}: {
  trackingUrl: string | null;
  liveTrackingUrl: string | null;
  label?: string;
}) {
  if (!trackingUrl && !liveTrackingUrl) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {liveTrackingUrl && (
        <a
          href={liveTrackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hive-dark text-hive-gold text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          <Truck className="w-3 h-3" />
          Track live
        </a>
      )}
      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hive-border/60 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Truck className="w-3 h-3" />
          {label}
        </a>
      )}
    </div>
  );
}

export function OrderMoneyTrail({ orderId }: { orderId: Id<"orders"> }) {
  const data = useQuery(api.orderFinancials.getOrderFinancialsAdmin, { orderId });

  if (data === undefined) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-hive-border/40">
        <div className="h-3 w-32 bg-slate-100 rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-full bg-slate-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { payment, route, refund, courier, returnCourier, money, coupon } = data;

  // The order gates fulfilment on its own paymentStatus; Razorpay is the truth.
  // When they disagree, that is worth seeing rather than quietly averaging.
  const statusMismatch =
    payment?.status === "captured" && data.orderPaymentStatus !== "paid";

  const failedRefund = refund.jobs.find((j: any) => j.status === "failed");

  // Money is in, but there is no linked account for the seller's share to
  // reach. Without this the panel just reads "not set" twice, which looks like
  // a display bug rather than an order nobody can settle.
  const sellerUnpayable =
    data.orderPaymentStatus === "paid" && !route.linkedAccountId && !route.transferId;

  return (
    <div className="space-y-3">
      {statusMismatch && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-900 font-semibold">
            Razorpay captured this payment but the order still reads{" "}
            <span className="font-mono">{data.orderPaymentStatus}</span>. The
            customer has paid and the order is not being treated as paid.
          </p>
        </div>
      )}

      {sellerUnpayable && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-amber-950 font-semibold">
              {money.sellerPayoutPaise === null
                ? "This seller has no Razorpay linked account, so their share cannot be paid out automatically."
                : `${formatCurrency(money.sellerPayoutPaise)} is owed to this seller, but they have no Razorpay linked account so it cannot be paid out automatically.`}
            </p>
            <p className="text-[10px] text-amber-800 mt-0.5">
              The customer&apos;s money is captured and sitting in Hive&apos;s account. Onboard the
              boutique to Razorpay Route, or settle them by bank transfer.
            </p>
          </div>
        </div>
      )}

      {failedRefund && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-red-900 font-semibold">
              A refund of {formatCurrency(failedRefund.amountPaise)} failed and no
              money has moved.
            </p>
            {failedRefund.lastError && (
              <p className="text-[10px] text-red-700 mt-0.5 break-words">
                {failedRefund.lastError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── What the customer paid ─────────────────────────────────────── */}
      <Card icon={<CreditCard className="w-3 h-3" />} title="Razorpay payment">
        {payment ? (
          <>
            <Row label="Status">
              <Pill value={payment.status} />
            </Row>
            <Row label="Order reads">
              <Pill value={data.orderPaymentStatus} />
            </Row>
            <Money label="Amount charged" paise={payment.amountPaise} />
            <Row label="Method">{payment.method ?? "—"}</Row>
            <CopyableId label="Razorpay order ID" value={payment.razorpayOrderId} />
            <CopyableId label="Payment ID" value={payment.razorpayPaymentId} />
            <Row label="Last update">{stamp(payment.updatedAt)}</Row>
          </>
        ) : (
          <p className="text-[11px] text-slate-400">
            No payment record. Either the order is unpaid, or checkout never
            reached Razorpay.
          </p>
        )}
      </Card>

      {/* ── The split ──────────────────────────────────────────────────── */}
      <Card icon={<Split className="w-3 h-3" />} title="Where the money goes">
        <Money label="Product subtotal" paise={money.productSubtotalPaise} />
        <Money label="Handling charge" paise={money.handlingChargePaise} />
        <Money label="Platform fee" paise={money.platformFeePaise} />
        <Money label="GST on fees" paise={money.platformChargesGstPaise} />
        <Money label="Delivery fee" paise={money.deliveryFeePaise} />
        {(money.discountPaise ?? 0) > 0 && (
          <Money label="Discount" paise={money.discountPaise} tone="text-emerald-600" />
        )}
        <div className="border-t border-hive-border/40 my-2" />
        <Money label="Customer paid" paise={money.totalPayablePaise} />
        <div className="border-t border-hive-border/40 my-2" />
        <Row label="Commission rate">
          {money.sellerCommissionPercent === null
            ? "—"
            : `${money.sellerCommissionPercent}%${
                money.sellerTierName ? ` · ${money.sellerTierName}` : ""
              }`}
        </Row>
        <Money label="Commission" paise={money.sellerCommissionPaise} />
        <Money label="GST on commission" paise={money.sellerCommissionGstPaise} />
        <Money
          label="Seller receives"
          paise={money.sellerPayoutPaise}
          tone="text-emerald-700 font-bold"
        />
        <Money
          label="Hive keeps (fees + GST)"
          paise={money.platformRevenuePaise}
          tone="text-indigo-700 font-bold"
        />
        <Money
          label="Razorpay fee (incl. GST)"
          paise={data.payment?.gatewayFeePaise ?? null}
          tone="text-red-700"
        />
        <div className="border-t border-hive-border/40 my-2" />
        <Money label="Courier quoted" paise={data.estimatedCourierCostPaise} />
        <Money
          label="Courier actual"
          paise={data.hasShipment ? data.actualCourierCostPaise : null}
        />
        {money.source !== "pricingSnapshot" && (
          <p className="text-[10px] text-amber-700 mt-2">
            Legacy order — placed before the pricing snapshot existed, so the fee
            split is reconstructed and some lines are unavailable.
          </p>
        )}
      </Card>

      {/* ── Route settlement ───────────────────────────────────────────── */}
      <Card icon={<Split className="w-3 h-3" />} title="Route settlement (seller)">
        <CopyableId label="Transfer ID" value={route.transferId} />
        <Row label="Transfer status">
          <Pill value={route.transferStatus} />
        </Row>
        <CopyableId label="Seller linked account" value={route.linkedAccountId} />
        <Row label="Account status">
          <Pill value={route.linkedAccountStatus} />
        </Row>
        <Row label="Payout status">
          <Pill value={route.payoutStatus} />
        </Row>
        <Row label="Held until">
          {route.payoutHoldUntil
            ? stamp(route.payoutHoldUntil)
            : route.payoutStatus === "withheld"
              ? "indefinitely — a return or unused coupon is holding it"
              : "—"}
        </Row>
        {route.payoutHoldReason && <Row label="Hold reason">{route.payoutHoldReason}</Row>}
        <Row label="Released at">{stamp(route.payoutProcessedAt)}</Row>
        {route.payoutFailureReason && (
          <Row label="Failure">
            <span className="text-red-700">{route.payoutFailureReason}</span>
          </Row>
        )}
        {route.manualSettlement && (
          <>
            <div className="border-t border-hive-border/40 my-2" />
            <Money label="Paid by bank transfer" paise={route.manualSettlement.netSettlement} />
            <Row label="UTR">{route.manualSettlement.utrNumber}</Row>
            <Row label="Settled at">{stamp(route.manualSettlement.settledAt)}</Row>
          </>
        )}
      </Card>

      {/* ── Refunds ────────────────────────────────────────────────────── */}
      {(refund.orderRefundStatus ||
        refund.returnStatus ||
        payment?.refundId ||
        refund.jobs.length > 0) && (
        <Card icon={<RotateCcw className="w-3 h-3" />} title="Refund">
          <Row label="Order refund status">
            <Pill value={refund.orderRefundStatus} />
          </Row>
          <Row label="Return status">
            <Pill value={refund.returnStatus} />
          </Row>
          <CopyableId label="Razorpay refund ID" value={payment?.refundId ?? null} />
          <Money label="Refunded" paise={payment?.refundAmountPaise ?? null} />
          <Row label="Refunded at">{stamp(payment?.refundedAt)}</Row>
          {refund.jobs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-hive-border/40 space-y-1.5">
              {refund.jobs.map((job: any) => (
                <div key={job._id} className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-slate-500 truncate">
                    {formatCurrency(job.amountPaise)} · {job.reason}
                  </span>
                  <Pill value={job.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Coupon funding ─────────────────────────────────────────────── */}
      {coupon && (
        <Card icon={<Ticket className="w-3 h-3" />} title="Exchange coupon used">
          <Row label="Code">
            <span className="font-mono">{coupon.code}</span>
          </Row>
          <Money label="Applied to this order" paise={coupon.appliedPaise} />
          <Money label="Coupon value" paise={coupon.valuePaise} />
          <Row label="Status">
            <Pill value={coupon.status} />
          </Row>
        </Card>
      )}

      {/* ── Porter ─────────────────────────────────────────────────────── */}
      <Card icon={<Truck className="w-3 h-3" />} title="Porter delivery">
        {courier ? (
          <>
            <Row label="Status">
              <Pill value={courier.status} />
            </Row>
            <CopyableId label="Porter CRN" value={courier.crn} />
            <Row label="Rider">
              {courier.driverName
                ? `${courier.driverName}${courier.vehiclePlate ? ` · ${courier.vehiclePlate}` : ""}`
                : "—"}
            </Row>
            <Row label="Rider phone">
              {courier.driverPhone ? (
                <a
                  href={`tel:${courier.driverPhone}`}
                  className="font-mono text-hive-amber hover:underline"
                >
                  {courier.driverPhone}
                </a>
              ) : (
                "—"
              )}
            </Row>
            {courier.etaMinutes !== null && (
              <Row label="ETA">
                <span className="text-amber-700">{courier.etaMinutes} mins away</span>
              </Row>
            )}
            <Row label="Picked up">{stamp(courier.pickedUpAt)}</Row>
            <Row label="Delivered">{stamp(courier.deliveredAt)}</Row>
            <Row label="Last courier update">{stamp(courier.lastWebhookAt)}</Row>
            <TrackingLinks
              trackingUrl={courier.trackingUrl}
              liveTrackingUrl={courier.liveTrackingUrl}
            />
          </>
        ) : (
          <p className="text-[11px] text-slate-400">
            {["pending_payment", "pending_confirmation"].includes(data.orderStatus)
              ? "No shipment yet — the boutique has not accepted this order."
              : data.orderStatus === "cancelled"
                ? "No shipment — this order was cancelled before dispatch."
                : "No shipment yet — the boutique has not marked this order ready for pickup. Tracking, the rider's details and delivery times appear here once Porter books a trip."}
          </p>
        )}

        {returnCourier && (
          <div className="mt-3 pt-3 border-t border-hive-border/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Return leg
            </p>
            <Row label="Status">
              <Pill value={returnCourier.status} />
            </Row>
            <CopyableId label="Return CRN" value={returnCourier.crn} />
            <Row label="Collected">{stamp(returnCourier.pickedUpAt)}</Row>
            <Row label="Back with seller">{stamp(returnCourier.deliveredAt)}</Row>
            <TrackingLinks
              trackingUrl={returnCourier.trackingUrl}
              liveTrackingUrl={returnCourier.liveTrackingUrl}
              label="Track return"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
