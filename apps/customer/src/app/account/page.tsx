"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSessionStore } from "@/context/SessionContext";
import { useRouter } from "next/navigation";
import { navigateToSignIn } from "@/lib/auth-redirect";
import { useQuery, useMutation, useAction } from "convex/react";
import { toast, formatCurrency } from "@hive/utils";
import { Tabs } from "@hive/ui";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  User,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Star,
  Home,
  Briefcase,
  Bookmark,
  Check,
  X,
  ChevronRight,
  AlertTriangle,
  Phone,
  Mail,
  Calendar,
  Loader2,
  ShoppingBag,
  Heart,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Navigation,
  MessageCircle,
  ArrowUpRight,
  ShieldCheck,
  Package,
} from "lucide-react";
import Link from "next/link";
import { ReservationStatusCard } from "@/components/reservation/ReservationStatusCard";
import { LocationMapPicker, ReverseGeocodeResult } from "@/components/location/LocationMapPicker";
import { useWishlistStore } from "@/store/wishlist-store";
import { calculateDisplayPricing } from "@/lib/pricing";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import { getCustomerErrorMessage } from "@/lib/customerErrors";

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTitleCase(str?: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAddressDisplay(addr: Address): string {
  const parts: string[] = [];
  if (addr.houseNumber) parts.push(addr.houseNumber);
  if (addr.line1) parts.push(addr.line1);
  if (addr.formattedAddress && !addr.line1) parts.push(addr.formattedAddress);
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.pincode) parts.push(addr.pincode);
  if (addr.landmark) parts.push(`Near ${addr.landmark}`);
  return parts.join(", ");
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Address = {
  _id: Id<"addresses">;
  label: string;
  line1?: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  formattedAddress?: string;
  houseNumber?: string;
  landmark?: string;
  phone?: string;
  isDefault: boolean;
  _creationTime?: number;
};

type AddressFormData = {
  label: string;
  houseNumber: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  phone: string;
  isDefault: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
};

const EMPTY_FORM: AddressFormData = {
  label: "Home",
  houseNumber: "",
  line1: "",
  city: "Kochi",
  state: "Kerala",
  pincode: "",
  landmark: "",
  phone: "",
  isDefault: false,
};

const LABEL_OPTIONS = ["Home", "Work", "Other"];

// ── Reusable Field ─────────────────────────────────────────────────────────────
function Field({
  label,
  ...inputProps
}: {
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
        {label}
      </label>
      <input
        {...inputProps}
        className="w-full h-11 px-4 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
      />
    </div>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────
function DeleteConfirm({
  address,
  onConfirm,
  onCancel,
  deleting,
}: {
  address: Address;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 bg-white rounded-2xl border border-stone-200 shadow-2xl p-6 max-w-sm w-full flex flex-col gap-5 text-left animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-stone-900">Delete Address?</h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">
              This will permanently remove your <strong>{address.label}</strong> address.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Address Card ───────────────────────────────────────────────────────────────
function AddressCard({
  address,
  userName,
  onEdit,
  onDelete,
  onSetDefault,
  settingDefault,
}: {
  address: Address;
  userName: string;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  settingDefault: boolean;
}) {
  return (
    <div
      className={`relative bg-white border rounded-2xl p-5 flex flex-col justify-between min-h-[180px] transition-all duration-300 ${
        address.isDefault
          ? "border-stone-900 shadow-sm ring-1 ring-stone-900/5"
          : "border-stone-200/80 hover:border-stone-300 shadow-2xs"
      }`}
    >
      <div className="space-y-3.5">
        {/* Top row: Label & Default Indicator */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-full">
            {address.label}
          </span>
          {address.isDefault && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-stone-800 bg-stone-100 border border-stone-200/80 px-2.5 py-0.5 rounded-full">
              <Star className="w-2.5 h-2.5 fill-stone-700 text-stone-700" />
              Default
            </span>
          )}
        </div>

        {/* Clean Hierarchy: Name, Phone, Address */}
        <div className="space-y-1.5 text-left">
          <h4 className="text-sm font-semibold text-stone-900">{toTitleCase(userName)}</h4>

          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Phone className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>{address.phone || "No phone added"}</span>
          </div>

          <div className="flex items-start gap-1.5 text-xs text-stone-600 pt-0.5">
            <MapPin className="w-3.5 h-3.5 stroke-[1.5] mt-0.5 flex-shrink-0 text-stone-400" />
            <p className="leading-relaxed">{formatAddressDisplay(address)}</p>
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between pt-3.5 border-t border-stone-100 mt-4">
        <div>
          {!address.isDefault && (
            <button
              onClick={onSetDefault}
              disabled={settingDefault}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-stone-700 hover:text-stone-900 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {settingDefault ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Star className="w-3 h-3" />
              )}
              Set Default
            </button>
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <button
            onClick={onEdit}
            className="text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-red-600 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Address Form Modal ─────────────────────────────────────────────────────────
function AddressFormModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial: AddressFormData;
  onSave: (data: AddressFormData) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddressFormData>(initial);
  const [mapLat, setMapLat] = useState<number>(initial.lat || 9.9312);
  const [mapLng, setMapLng] = useState<number>(initial.lng || 76.2673);
  const [mapResult, setMapResult] = useState<ReverseGeocodeResult | null>(
    initial.formattedAddress ? {
      city: initial.city,
      locality: initial.line1,
      state: initial.state,
      country: "India",
      pincode: initial.pincode,
      formattedAddress: initial.formattedAddress,
    } : null
  );
  const [gpsDetecting, setGpsDetecting] = useState(false);

  const handleMapChange = (lat: number, lng: number) => {
    setMapLat(lat);
    setMapLng(lng);
    setForm(prev => ({ ...prev, lat, lng }));
  };

  const handleReverseGeocode = (result: ReverseGeocodeResult) => {
    setMapResult(result);
    setForm(prev => ({
      ...prev,
      city: result.city || prev.city || "Kochi",
      state: result.state || prev.state || "Kerala",
      pincode: result.pincode || prev.pincode,
      line1: result.locality || result.formattedAddress.split(",")[0] || prev.line1,
      formattedAddress: result.formattedAddress,
    }));
  };

  const handleGPSDetect = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGpsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapLat(latitude);
        setMapLng(longitude);
        setForm(prev => ({ ...prev, lat: latitude, lng: longitude }));
        setGpsDetecting(false);
      },
      (err) => {
        console.error("GPS detection error:", err);
        toast.error("Could not fetch your location. Please select on map.");
        setGpsDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const set = (field: keyof AddressFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val =
        e.target.type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : e.target.value;
      setForm((prev) => ({ ...prev, [field]: val }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.city.trim() || !form.state.trim() || !form.pincode.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-2xl overflow-y-auto max-h-[90vh] animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <div className="flex flex-col text-left">
            <h3 className="text-base font-serif font-bold text-stone-900">
              {initial.houseNumber || initial.line1 ? "Edit Address" : "Set Delivery Location"}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Pin your location on Google Maps and enter building details
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-stone-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                1. Pin Location on Map
              </span>
              <button
                type="button"
                onClick={handleGPSDetect}
                disabled={gpsDetecting}
                className="text-[11px] font-bold text-stone-700 hover:text-stone-900 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {gpsDetecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Locating...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Use Current GPS</span>
                  </>
                )}
              </button>
            </div>

            <div className="w-full h-60 sm:h-64 rounded-2xl overflow-hidden relative border border-stone-200 shadow-inner bg-stone-100">
              <LocationMapPicker
                lat={mapLat}
                lng={mapLng}
                onChange={handleMapChange}
                onReverseGeocode={handleReverseGeocode}
                showCurrentLocation={false}
                height="100%"
              />
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200/70 rounded-xl text-left w-full space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <p className="text-xs font-bold text-stone-900 truncate">
                  {mapResult ? `${mapResult.locality || mapResult.city}, ${mapResult.pincode}` : "Pin location on map"}
                </p>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed pl-4 line-clamp-2">
                {mapResult ? mapResult.formattedAddress : "Move the pin on the map or search your building above to set your location."}
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-stone-100">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
              2. Building & Receiver Information
            </span>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                Address Type
              </label>
              <div className="flex gap-2.5">
                {LABEL_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, label: opt }))}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      form.label === opt
                        ? "bg-stone-900 text-white shadow-xs"
                        : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Flat / House / Building"
              value={form.houseNumber}
              onChange={set("houseNumber")}
              placeholder="e.g. Flat 4B, Skyline Ivy"
            />

            <Field
              label="Area / Street / Locality"
              value={form.line1}
              onChange={set("line1")}
              placeholder="e.g. Panampilly Nagar Main Road"
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="City"
                value={form.city}
                onChange={set("city")}
                placeholder="Kochi"
                required
              />
              <Field
                label="Pincode"
                value={form.pincode}
                onChange={set("pincode")}
                placeholder="682036"
                required
              />
            </div>

            <Field
              label="Landmark (Optional)"
              value={form.landmark}
              onChange={set("landmark")}
              placeholder="e.g. Near Coffee Spot"
            />

            <Field
              label="Contact Phone for Delivery"
              value={form.phone}
              onChange={set("phone")}
              placeholder="+91 98075 76986"
              type="tel"
            />

            <label className="flex items-center gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={set("isDefault")}
                className="w-4 h-4 rounded text-stone-900 border-stone-300 focus:ring-stone-900"
              />
              <span className="text-xs font-semibold text-stone-700">Set as default delivery address</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-xl bg-stone-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-stone-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer mt-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Address
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Overview Tab (Shopping Hub & Personal Details) ───────────────────────────
const ORDER_ACTIVE_STATUSES = [
  "pending_payment",
  "pending_confirmation",
  "confirmed",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
];

function mapOrderStatus(s: string): string {
  const map: Record<string, string> = {
    pending_payment: "placed",
    pending_confirmation: "placed",
    confirmed: "confirmed",
    pickup_scheduled: "picked_up",
    picked_up: "picked_up",
    in_transit: "picked_up",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  return map[s] ?? "placed";
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; text: string }> = {
    placed: { label: "Placed", dot: "bg-amber-500", text: "text-amber-700" },
    confirmed: { label: "Confirmed", dot: "bg-green-500", text: "text-green-700" },
    picked_up: { label: "Picked Up", dot: "bg-green-500", text: "text-green-700" },
    out_for_delivery: { label: "Out For Delivery", dot: "bg-amber-500", text: "text-amber-700" },
    delivered: { label: "Delivered", dot: "bg-green-500", text: "text-green-700" },
    cancelled: { label: "Cancelled", dot: "bg-stone-400", text: "text-stone-500" },
  };
  const { label, dot, text } = map[status] ?? { label: "Processing", dot: "bg-stone-400", text: "text-stone-500" };
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 border border-stone-200 rounded-full bg-white/50 backdrop-blur-sm shadow-sm">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className={`text-[9px] font-bold uppercase tracking-widest ${text}`}>{label}</span>
    </div>
  );
}

// Task grid tile — one real-data shortcut per row. Count is a plain number (not a query
// state), so callers pass 0 while loading rather than this component guessing a skeleton.
function OverviewTile({
  href,
  onClick,
  icon,
  label,
  meta,
  hoverBg,
  hoverText,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  meta: string;
  hoverBg: string;
  hoverText: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3.5">
        <div
          className={`w-10 h-10 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center transition-colors ${hoverBg} group-hover:text-current`}
        >
          {icon}
        </div>
        <div className="space-y-0.5">
          <h4 className={`text-sm font-semibold text-stone-900 transition-colors ${hoverText}`}>{label}</h4>
          <p className="text-xs text-stone-500">{meta}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition-colors" />
    </>
  );
  const className =
    "p-4 bg-white border border-stone-200/80 hover:border-stone-300 rounded-2xl shadow-2xs transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-between group cursor-pointer text-left";
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function OverviewTab({
  addresses,
  reservations,
  user,
  setActiveTab,
}: {
  addresses: Address[];
  reservations: any[] | undefined;
  user: any;
  setActiveTab: (tab: NavId) => void;
}) {
  const { token } = useSessionStore();
  const orders = useQuery(api.orders.listMyOrders, { token: token || undefined });
  const wishlistCount = useWishlistStore((state) => state.items.length);
  const recentlyViewed = useQuery(
    api.homepage.getRecentlyViewed,
    user?._id ? { userId: user._id as Id<"users">, limit: 6 } : "skip"
  );

  const activeOrder = useMemo(() => {
    if (!orders) return null;
    return (orders as any[]).find((o) => ORDER_ACTIVE_STATUSES.includes(o.status)) ?? null;
  }, [orders]);

  const upcomingReservation = useMemo(() => {
    if (!reservations) return null;
    return reservations.find((r) => ["reservation_active", "awaiting_store_confirmation"].includes(r.status)) ?? null;
  }, [reservations]);

  const formatDate = (epochMs: number) => {
    try {
      return new Date(epochMs).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="flex flex-col gap-8 text-left animate-fadeIn">
      {/* ── ACTIVE ORDER HERO ── */}
      {activeOrder && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Active Order</h3>
          <Link
            href="/orders"
            className="block bg-white border border-stone-200/80 hover:border-stone-300 rounded-2xl p-5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex gap-4">
              <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-hive-cream border border-stone-200/80 shrink-0">
                {activeOrder.items?.[0]?.imageUrl ? (
                  <img
                    src={activeOrder.items[0].imageUrl}
                    alt={activeOrder.items[0].productName || "Order item"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-5 h-5 text-stone-500" />
                  </div>
                )}
                <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-green-500 border border-white animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-sans font-bold text-stone-900 tracking-wider">
                      {activeOrder.orderNumber}
                    </span>
                    <OrderStatusBadge status={mapOrderStatus(activeOrder.status)} />
                  </div>
                  <h4 className="text-sm font-sans font-semibold text-stone-900 truncate">
                    {activeOrder.items?.[0]?.productName || "Store Order"}
                    {activeOrder.items?.length > 1 && (
                      <span className="text-xs text-stone-500 font-sans font-medium">
                        {" "}
                        +{activeOrder.items.length - 1} more
                      </span>
                    )}
                  </h4>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-stone-500 font-medium">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-stone-500" />
                    {formatDate(activeOrder.createdAt)}
                  </span>
                  <span className="flex items-center gap-1 font-bold text-stone-900">
                    {formatCurrency(activeOrder.total)}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-stone-400 self-center shrink-0" />
            </div>
          </Link>
        </section>
      )}

      {/* ── CLEAN UTILITY NAVIGATION LIST ── */}
      <section className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OverviewTile
            href="/orders"
            icon={<ShoppingBag className="w-5 h-5 text-stone-700" />}
            label="My Orders"
            meta={orders === undefined ? "Loading…" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
            hoverBg="group-hover:bg-stone-50"
            hoverText="group-hover:text-stone-900"
          />
          <OverviewTile
            href="/wishlist"
            icon={<Heart className="w-5 h-5 fill-stone-700 stroke-stone-700" />}
            label="Saved Wishlist"
            meta={`${wishlistCount} saved item${wishlistCount === 1 ? "" : "s"}`}
            hoverBg="group-hover:bg-stone-50"
            hoverText="group-hover:text-stone-900"
          />
          <OverviewTile
            onClick={() => setActiveTab("addresses")}
            icon={<MapPin className="w-5 h-5 text-stone-700" />}
            label="Delivery Addresses"
            meta={`${addresses.length} saved location${addresses.length === 1 ? "" : "s"}`}
            hoverBg="group-hover:bg-stone-50"
            hoverText="group-hover:text-stone-900"
          />
          <OverviewTile
            href="https://wa.me/917356019103"
            icon={<MessageCircle className="w-5 h-5 text-emerald-600" />}
            label="Help & Support"
            meta="Order support on WhatsApp"
            hoverBg="group-hover:bg-emerald-50/50"
            hoverText="group-hover:text-emerald-900"
          />
        </div>
      </section>

      {/* ── UPCOMING RESERVATION PREVIEW (If Any) ── */}
      {upcomingReservation && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Store Reservation</h3>
          <ReservationStatusCard reservation={upcomingReservation} />
        </section>
      )}
    </div>
  );
}

// ── Addresses Tab Component ──────────────────────────────────────────────────
function AddressesTab({ userName, addresses }: { userName: string; addresses: Address[] }) {
  const { token } = useSessionStore();
  const addAddress = useAction(api.addresses.add);
  const updateAddress = useAction(api.addresses.update);
  const removeAddress = useMutation(api.addresses.remove);
  const setDefaultAddress = useMutation(api.addresses.setDefault);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Address | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const handleAdd = async (data: AddressFormData) => {
    setSaving(true);
    try {
      await addAddress({
        label: data.label,
        houseNumber: data.houseNumber || undefined,
        line1: data.line1 || undefined,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark || undefined,
        isDefault: data.isDefault,
        phone: data.phone || undefined,
        lat: data.lat || 9.9312,
        lng: data.lng || 76.2673,
        token: token || undefined,
      });
      setShowForm(false);
      toast.success("Address added successfully");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: AddressFormData) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateAddress({
        addressId: editTarget._id,
        label: data.label,
        houseNumber: data.houseNumber || undefined,
        line1: data.line1 || undefined,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark || undefined,
        isDefault: data.isDefault,
        phone: data.phone || undefined,
        lat: data.lat || editTarget.lat || 9.9312,
        lng: data.lng || editTarget.lng || 76.2673,
        token: token || undefined,
      });
      setEditTarget(null);
      toast.success("Address updated successfully");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeAddress({ addressId: deleteTarget._id, token: token || undefined });
      setDeleteTarget(null);
      toast.success("Address removed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (id: Id<"addresses">) => {
    setSettingDefaultId(id);
    try {
      await setDefaultAddress({ addressId: id, token: token || undefined });
      toast.success("Default address updated");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const editForm: AddressFormData = editTarget
    ? {
      label: editTarget.label,
      houseNumber: editTarget.houseNumber || "",
      line1: editTarget.line1 || "",
      city: editTarget.city,
      state: editTarget.state,
      pincode: editTarget.pincode,
      landmark: editTarget.landmark || "",
      phone: editTarget.phone || "",
      isDefault: editTarget.isDefault,
      lat: editTarget.lat,
      lng: editTarget.lng,
      formattedAddress: editTarget.formattedAddress,
    }
    : EMPTY_FORM;

  return (
    <div className="flex flex-col gap-6 text-left animate-fadeIn">
      <div className="flex justify-between items-center border-b border-stone-200/80 pb-4">
        <div>
          <h2 className="text-xl font-serif font-medium text-stone-900">Delivery Addresses</h2>
          <p className="text-xs text-stone-500 mt-0.5">Saved locations for express dispatch.</p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="h-10 px-4 rounded-xl bg-stone-900 text-white hover:bg-stone-800 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Address
        </button>
      </div>

      {addresses.length === 0 && (
        <div className="text-center py-16 bg-white border border-stone-200/80 rounded-2xl flex flex-col items-center gap-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-stone-500" />
          </div>
          <p className="font-serif font-medium text-stone-900">No saved addresses</p>
          <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
            Add your primary shipping location for 1-tap 90-min checkout.
          </p>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <AddressCard
              key={addr._id}
              address={addr}
              userName={userName}
              onEdit={() => setEditTarget(addr)}
              onDelete={() => setDeleteTarget(addr)}
              onSetDefault={() => handleSetDefault(addr._id)}
              settingDefault={settingDefaultId === addr._id}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AddressFormModal
          initial={EMPTY_FORM}
          onSave={handleAdd}
          onClose={() => setShowForm(false)}
          saving={saving}
        />
      )}

      {editTarget && (
        <AddressFormModal
          initial={editForm}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
          saving={saving}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          address={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

// ── Reservations Tab Component ───────────────────────────────────────────────
function ReservationsTab({ reservations }: { reservations: any[] | undefined }) {
  return (
    <div className="flex flex-col gap-6 text-left animate-fadeIn">
      <div className="border-b border-stone-200/80 pb-4">
        <h2 className="text-xl font-serif font-medium text-stone-900">Store Reservations</h2>
        <p className="text-xs text-stone-500 mt-0.5">In-store try-on bookings and fitting holds.</p>
      </div>

      {reservations === undefined ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-16 bg-white border border-stone-200/80 rounded-2xl flex flex-col items-center gap-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-stone-500" />
          </div>
          <p className="font-serif font-medium text-stone-900">No active reservations</p>
          <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
            Reserve pieces online to try on in person at local Kochi stores.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reservations.map((reservation: any) => (
            <ReservationStatusCard key={reservation._id} reservation={reservation} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab Component ───────────────────────────────────────────────────
// Personal Information lives here now (moved off Overview — it's account admin, not a shopping
// task). The two notification toggles that used to sit below Push Notifications never persisted
// anything (local useState only, no mutation, no backend field) — removed rather than shipped as
// a working-looking control that silently does nothing. Re-add once there's a real preference
// field + mutation behind them.
function SettingsTab({ user, token }: { user: any; token: string | null }) {
  const { isSupported, isSubscribed, isLoading, subscribeToPush } = usePushSubscription();
  const updateDisplayName = useMutation(api.users.updateProfileDisplayName);
  const updatePhone = useMutation(api.users.updateProfilePhone);

  const [prefPhone, setPrefPhone] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneVal, setPhoneVal] = useState("");

  useEffect(() => {
    if (user?.name) setNameVal(user.name);
  }, [user]);

  useEffect(() => {
    if (user?.phone) {
      setPrefPhone(user.phone);
      setPhoneVal(user.phone);
      if (typeof window !== "undefined") {
        safeSetItem("hive_pref_phone", user.phone);
      }
    } else if (typeof window !== "undefined") {
      const storedPhone = safeGetItem("hive_pref_phone");
      if (storedPhone) {
        setPrefPhone(storedPhone);
        setPhoneVal(storedPhone);
        updatePhone({ phone: storedPhone, token: token || undefined }).catch((err) =>
          console.error("Auto-sync phone failed:", err)
        );
      }
    }
  }, [user?.phone, token, updatePhone]);

  const handlePhoneChange = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setPrefPhone(trimmed);
    safeSetItem("hive_pref_phone", trimmed);
    try {
      await updatePhone({ phone: trimmed, token: token || undefined });
      toast.success("Phone number updated successfully");
    } catch (err: any) {
      console.error("Failed to update phone number:", err);
      // The raw error stays on the console above; a Convex failure names an internal function and
      // a request id, neither of which means anything to the person typing their phone number.
      toast.error(getCustomerErrorMessage(err, "We couldn't save your phone number. Please try again."));
    }
  };

  return (
    <div className="flex flex-col gap-8 text-left animate-fadeIn">
      <div className="border-b border-stone-200/80 pb-4">
        <h2 className="text-xl font-serif font-light text-stone-900">Account &amp; Preferences</h2>
        <p className="text-xs text-stone-500 mt-0.5">Your details, and how you hear about deliveries.</p>
      </div>

      {/* ── Personal Information (moved from Overview) ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Personal Information</h3>
        <div className="bg-white border border-stone-200/80 rounded-2xl divide-y divide-stone-100 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors hover:bg-stone-50/50">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Full Name</span>
              {!isEditingName && (
                <div className="text-sm font-semibold text-stone-900">
                  {user?.name || <span className="text-stone-400 italic font-normal">Add your name</span>}
                </div>
              )}
            </div>
            {isEditingName ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!nameVal.trim()) return;
                  try {
                    await updateDisplayName({ displayName: nameVal, token: token || undefined });
                    toast.success("Name updated");
                  } catch (err) {
                    console.error("Failed to update name:", err);
                  }
                  setIsEditingName(false);
                }}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <input
                  type="text"
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className="bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 flex-1 sm:w-56"
                  autoFocus
                />
                <button type="submit" className="px-3 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 cursor-pointer">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNameVal(user?.name || "");
                    setIsEditingName(false);
                  }}
                  className="px-2.5 py-1.5 border border-stone-200 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors cursor-pointer self-start sm:self-center"
              >
                {user?.name ? "Edit" : "Add name →"}
              </button>
            )}
          </div>

          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors hover:bg-stone-50/50">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Email Address</span>
              <div className="text-sm font-semibold text-stone-900 break-all">{user?.email || "—"}</div>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors hover:bg-stone-50/50">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Phone Number</span>
              {!isEditingPhone && (
                <div className="text-sm font-semibold text-stone-900">
                  {prefPhone || <span className="text-stone-400 italic font-normal">Add phone number</span>}
                </div>
              )}
            </div>
            {isEditingPhone ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePhoneChange(phoneVal);
                  setIsEditingPhone(false);
                }}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <input
                  type="tel"
                  value={phoneVal}
                  onChange={(e) => setPhoneVal(e.target.value)}
                  className="bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 flex-1 sm:w-56"
                  autoFocus
                />
                <button type="submit" className="px-3 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 cursor-pointer">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneVal(prefPhone);
                    setIsEditingPhone(false);
                  }}
                  className="px-2.5 py-1.5 border border-stone-200 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsEditingPhone(true)}
                className="text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors cursor-pointer self-start sm:self-center"
              >
                {prefPhone ? "Edit" : "Add phone →"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Notification Preferences ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Notifications</h3>
        <div className="bg-white border border-stone-200/80 rounded-2xl divide-y divide-stone-100 overflow-hidden shadow-2xs">
          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-stone-500" /> Push Notifications
              </h4>
              <p className="text-xs text-stone-500">Live order status and dispatch updates on this device</p>
            </div>
            {isSupported ? (
              <button
                role="switch"
                aria-checked={isSubscribed}
                aria-label="Push notifications"
                onClick={() => {
                  if (!isSubscribed && !isLoading) {
                    subscribeToPush().then((success) => {
                      if (success) toast.success("Push Notifications Enabled");
                    });
                  }
                }}
                disabled={isLoading || isSubscribed}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  isSubscribed ? "bg-stone-900 flex justify-end opacity-80" : "bg-stone-200 flex justify-start"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-xs transition-all duration-200 flex items-center justify-center">
                  {isLoading && <Loader2 className="w-3 h-3 text-stone-900 animate-spin" />}
                </span>
              </button>
            ) : (
              <span className="text-[10px] font-bold uppercase text-stone-400 bg-stone-100 px-2 py-1 rounded">
                Not Supported
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Navigation Tabs ──────────────────────────────────────────────────────────
const NAVIGATION_ITEMS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "reservations", label: "Reservations", icon: Calendar },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type NavId = (typeof NAVIGATION_ITEMS)[number]["id"];

export default function AccountPage() {
  const { isAuthenticated, isLoading } = useSessionStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigateToSignIn(router, "/account");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-white py-6 sm:pt-10 px-4 sm:px-6 lg:px-8 animate-pulse select-none">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div className="h-24 bg-stone-100 rounded-3xl" />
          <div className="h-14 bg-stone-100 rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-stone-100 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <AccountPageContent />;
}

function AccountPageContent() {
  const [activeTab, setActiveTab] = useState<NavId>("overview");
  const { user, token, logout } = useSessionStore();
  const router = useRouter();

  // Fetched once here and passed down — previously AddressesTab and ReservationsTab each
  // re-queried the same data independently.
  const addresses = useQuery(api.addresses.list, { token: token || undefined }) as Address[] || [];
  const reservations = useQuery((api as any).reservations.getMyReservations, { token: token || undefined });

  // Monogram initials for profile avatar
  const initials = useMemo(() => {
    if (!user?.name) return "AK";
    return user.name
      .split(" ")
      .map((n: string) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [user]);

  const handleSignOut = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-white text-stone-900 font-sans pb-24 antialiased selection:bg-stone-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        
        {/* ── TOP IDENTITY CARD (Pure Luxury & Minimalist) ── */}
        <div className="bg-stone-50/60 border border-stone-200/80 rounded-3xl p-5 sm:p-6 mb-6 text-left flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border border-stone-200/80 flex items-center justify-center shadow-2xs select-none shrink-0">
              <span className="font-serif text-xl sm:text-2xl font-normal text-stone-900 tracking-wider">
                {initials}
              </span>
            </div>
            <div className="space-y-0.5">
              <h1 className="text-xl sm:text-2xl font-serif font-normal text-stone-900">
                {toTitleCase(user?.name) || "Athul"}
              </h1>
              <p className="text-xs text-stone-500 font-mono sm:font-sans">
                {user?.phone || user?.email || "Hive Account"}
              </p>
            </div>
          </div>
        </div>

        {/* ── TAB NAVIGATION STRIP — shared @hive/ui Tabs primitive ── */}
        <Tabs
          items={NAVIGATION_ITEMS.map((tab) => ({
            id: tab.id,
            label: tab.label,
            icon: <tab.icon className="w-3.5 h-3.5" />,
          }))}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as NavId)}
          variant="comb"
          className="mb-8"
        />

        {/* ── ACTIVE TAB CONTENT ── */}
        <main className="min-h-[400px]">
          {activeTab === "overview" && (
            <OverviewTab addresses={addresses} reservations={reservations} user={user} setActiveTab={setActiveTab} />
          )}

          {activeTab === "addresses" && (
            <AddressesTab userName={user?.name || "Athul"} addresses={addresses} />
          )}

          {activeTab === "reservations" && (
            <ReservationsTab reservations={reservations} />
          )}

          {activeTab === "settings" && (
            <SettingsTab user={user} token={token} />
          )}
        </main>

        {/* ── CLEAN UNDERSTATED FOOTER (With Discreet Sign Out) ── */}
        <footer className="mt-14 pt-8 border-t border-stone-200/60 flex flex-col items-center justify-center gap-2 text-center">
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-stone-500 hover:text-stone-950 transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-4 rounded-xl hover:bg-stone-100/80"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </footer>

      </div>
    </div>
  );
}
