"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Button, Card, CardContent } from "@hive/ui";
import { ArrowLeft, Loader2, Save, Store, MapPin, CreditCard, ShieldCheck, AlertCircle, Coins } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Load BoutiqueMap dynamically with SSR disabled to prevent Leaflet window reference crashes during Next.js builds.
const BoutiqueMap = dynamic(() => import("@/components/BoutiqueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[250px] w-full rounded-2xl bg-hive-cream/30 border border-hive-border flex items-center justify-center gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-hive-amber" />
      <span className="text-xs text-hive-text-muted font-bold">Loading interactive map container...</span>
    </div>
  ),
});

export function EditBoutiqueClient({ boutiqueId }: { boutiqueId: string }) {
  const router = useRouter();

  console.log("[EditBoutiquePage] Initialized with boutiqueId:", boutiqueId);

  // Fetch boutique details
  const boutique = useQuery(api.boutiques.getBoutiqueById, boutiqueId ? { id: boutiqueId as any } : "skip");
  const updateBoutique = useMutation(api.boutiques.updateBoutique);

  // Form State
  const [boutiqueName, setBoutiqueName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [staffEmail1, setStaffEmail1] = useState("");
  const [staffEmail2, setStaffEmail2] = useState("");
  const [staffPhone1, setStaffPhone1] = useState("");
  const [staffPhone2, setStaffPhone2] = useState("");
  const [latitude, setLatitude] = useState(17.385044);
  const [longitude, setLongitude] = useState(78.486671);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(10);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [city, setCity] = useState("Kochi");
  const [state, setState] = useState("Kerala");
  const [pincode, setPincode] = useState("");
  const [razorpayAccountId, setRazorpayAccountId] = useState("");
  const [returnsAcceptedDefault, setReturnsAcceptedDefault] = useState(true);
  const [returnsAcceptedDefaultLocked, setReturnsAcceptedDefaultLocked] = useState(false);
  const [pricingTier, setPricingTier] = useState<"bronze" | "silver" | "gold">("bronze");
  const [submitting, setSubmitting] = useState(false);

  // Prepopulate form when boutique query completes
  useEffect(() => {
    if (boutique) {
      console.log("[EditBoutiquePage] Boutique details loaded successfully:", boutique);
      setBoutiqueName(boutique.boutiqueName);
      setOwnerName(boutique.ownerName);
      setEmail(boutique.email);
      setPhone(boutique.phone);
      setAddress(boutique.address);
      setStaffEmail1(boutique.staffEmail1 || "");
      setStaffEmail2(boutique.staffEmail2 || "");
      setStaffPhone1((boutique as any).staffPhone1 || "");
      setStaffPhone2((boutique as any).staffPhone2 || "");
      setLatitude(boutique.latitude);
      setLongitude(boutique.longitude);
      setDeliveryRadiusKm(boutique.deliveryRadiusKm);
      setDescription(boutique.description);
      setStatus(boutique.status);
      setCity(boutique.city || boutique.addressDetails?.city || "Kochi");
      setState(boutique.state || boutique.addressDetails?.state || "Kerala");
      setPincode(boutique.pincode || boutique.addressDetails?.pincode || "");
      setRazorpayAccountId((boutique as any).razorpayAccountId || "");
      setReturnsAcceptedDefault(boutique.returnsAcceptedDefault ?? true);
      setReturnsAcceptedDefaultLocked(boutique.returnsAcceptedDefaultLocked ?? false);
      // Map legacy tier keys to new keys
      const legacyMap: Record<string, string> = { tier1: "bronze", tier2: "silver", tier3: "gold" };
      const rawTier = (boutique as any).pricingTier || "bronze";
      setPricingTier((legacyMap[rawTier] || rawTier) as "bronze" | "silver" | "gold");
    }
  }, [boutique]);

  const handleCoordinatesChange = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const handleSelectPlace = (place: any) => {
    setAddress(place.address || "");
    setCity(place.city || "Kochi");
    setState(place.state || "Kerala");
    setPincode(place.pincode || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (latitude === 0 || longitude === 0) {
      alert("Error: Geolocation coordinates are mandatory. Please pin the boutique on the map.");
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (staffPhone1 && !phoneRegex.test(staffPhone1)) {
      alert("Staff WhatsApp 1 must be a valid E.164 phone number (e.g. +919876543210)");
      return;
    }
    if (staffPhone2 && !phoneRegex.test(staffPhone2)) {
      alert("Staff WhatsApp 2 must be a valid E.164 phone number (e.g. +919876543210)");
      return;
    }

    const trimmedAccountId = razorpayAccountId.trim();
    if (trimmedAccountId && !trimmedAccountId.startsWith("acc_")) {
      alert("Razorpay Linked Account ID must start with \"acc_\". Example: acc_TLcH6m3i3GBI2n");
      return;
    }

    setSubmitting(true);
    console.log("[EditBoutiquePage] Submitting update request for ID:", boutiqueId, {
      boutiqueName,
      ownerName,
      email,
      phone,
      address,
      latitude,
      longitude,
      deliveryRadiusKm,
      description,
      status,
      staffEmail1,
      staffEmail2,
      staffPhone1,
      staffPhone2,
    });

    try {
      await updateBoutique({
        id: boutiqueId as any,
        boutiqueName,
        ownerName,
        email,
        phone,
        address,
        city,
        state,
        pincode,
        latitude,
        longitude,
        deliveryRadiusKm,
        description,
        status,
        staffEmail1: staffEmail1 || undefined,
        staffEmail2: staffEmail2 || undefined,
        staffPhone1: staffPhone1 || undefined,
        staffPhone2: staffPhone2 || undefined,
        razorpayAccountId: razorpayAccountId.trim() || undefined,
        returnsAcceptedDefault,
        returnsAcceptedDefaultLocked,
        pricingTier,
      });
      console.log("[EditBoutiquePage] Update successful!");
      alert("Boutique profile updated successfully!");
      router.push("/admin/boutiques");
    } catch (err: any) {
      console.error("[EditBoutiquePage] Save failed:", err);
      alert("Failed to save boutique profile: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (boutique === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading boutique details...</p>
      </div>
    );
  }

  if (boutique === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <Store className="w-10 h-10 text-red-400" />
        <h2 className="text-lg font-serif font-bold text-hive-dark">Boutique Not Found</h2>
        <p className="text-xs text-hive-text-muted max-w-sm">
          No boutique registration matches the provided ID: <code className="bg-slate-100 px-1 rounded">{boutiqueId}</code>.
        </p>
        <Link href="/admin/boutiques" className="text-xs underline text-hive-amber mt-2">
          Back to boutiques registry
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      
      {/* Header back button */}
      <div className="flex items-center gap-4">
        <Link href="/admin/boutiques" className="p-2 rounded-xl hover:bg-slate-200/50 transition-colors border border-transparent">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-3xl font-serif font-black text-hive-dark">Edit Boutique Profile</h1>
          <p className="text-xs sm:text-sm text-hive-text-muted">Update contact details, map coordinates, delivery radius, and approval verification status.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="bg-white border border-hive-border rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm flex flex-col gap-6">
          <h2 className="text-lg font-serif font-bold text-hive-dark pb-2 border-b border-hive-border/60 flex items-center gap-2">
            <Store className="w-5 h-5 text-hive-amber" />
            <span>Profile Editor: {boutique.boutiqueName}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Boutique Name</label>
              <input
                type="text"
                required
                value={boutiqueName}
                onChange={(e) => setBoutiqueName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 font-semibold text-slate-800"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Owner Name</label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 font-semibold text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Delivery Radius (Km)</label>
              <input
                type="number"
                required
                min={1}
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(parseInt(e.target.value) || 10)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff Email 1 (Optional)</label>
              <input
                type="email"
                placeholder="staff1@boutique.com"
                value={staffEmail1}
                onChange={(e) => setStaffEmail1(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff Email 2 (Optional)</label>
              <input
                type="email"
                placeholder="staff2@boutique.com"
                value={staffEmail2}
                onChange={(e) => setStaffEmail2(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff WhatsApp 1 (Optional)</label>
              <input
                type="text"
                placeholder="e.g. +919876543211"
                value={staffPhone1}
                onChange={(e) => setStaffPhone1(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff WhatsApp 2 (Optional)</label>
              <input
                type="text"
                placeholder="e.g. +919876543212"
                value={staffPhone2}
                onChange={(e) => setStaffPhone2(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Physical Registered Address</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Boutique Description</label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 resize-none text-slate-800 leading-relaxed"
            />
          </div>



          {/* Map picker container */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted flex justify-between">
              <span>Boutique Location Coordinates</span>
              <span className="font-mono text-[10px] text-hive-amber font-extrabold">
                Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
              </span>
            </label>
            <BoutiqueMap 
              lat={latitude} 
              lng={longitude} 
              onChange={handleCoordinatesChange} 
              onSelectPlace={handleSelectPlace}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Pincode</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 text-slate-800"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 md:max-w-xs">
            <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Verification Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-white font-bold text-slate-800"
            >
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>

          {/* ── Pricing Tier Assignment ── */}
          <div className="flex flex-col gap-4 pt-4 border-t border-hive-border/60">
            <h3 className="text-sm font-serif font-bold text-hive-dark flex items-center gap-2">
              <Coins className="w-4 h-4 text-hive-amber" />
              <span>Pricing Tier</span>
            </h3>
            <div className="flex flex-col gap-1.5 md:max-w-xs">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Assigned Pricing Tier</label>
              <select
                value={pricingTier}
                onChange={(e) => setPricingTier(e.target.value as "bronze" | "silver" | "gold")}
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-white font-bold text-slate-800"
              >
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
              <p className="text-[11px] text-hive-text-muted leading-snug">
                Sets this store's handling fee, platform fee and commission rates. Its shop prices are recalculated automatically when you save.
              </p>
            </div>
          </div>

          {/* ── Admin Return Policy Control ── */}
          <div className="flex flex-col gap-4 pt-4 border-t border-hive-border/60">
            <h3 className="text-sm font-serif font-bold text-hive-dark flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Store Return Policy Management</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Default Policy</label>
                <select
                  value={returnsAcceptedDefault ? "24h" : "final_sale"}
                  onChange={(e) => setReturnsAcceptedDefault(e.target.value === "24h")}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-white font-bold text-slate-800"
                >
                  <option value="24h">Accept 24h Returns (Recommended)</option>
                  <option value="final_sale">Final Sale Only (No Returns)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Seller Portal Lock State</label>
                <select
                  value={returnsAcceptedDefaultLocked ? "locked" : "unlocked"}
                  onChange={(e) => setReturnsAcceptedDefaultLocked(e.target.value === "locked")}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-white font-bold text-slate-800"
                >
                  <option value="locked">🔒 Locked (Seller cannot change in dashboard)</option>
                  <option value="unlocked">🔓 Unlocked (Seller can change in dashboard)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Payment Configuration ── */}
          <div className="flex flex-col gap-4 pt-4 border-t border-hive-border/60">
            <h3 className="text-sm font-serif font-bold text-hive-dark flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-hive-amber" />
              <span>Payment Configuration</span>
            </h3>
            <div className="flex flex-col gap-1.5 md:max-w-md">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Razorpay Linked Account ID</label>
              <input
                type="text"
                placeholder="acc_xxxxxxxxxxxxxx"
                value={razorpayAccountId}
                onChange={(e) => setRazorpayAccountId(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-1.5 focus:ring-hive-gold text-sm bg-hive-cream/10 font-mono text-slate-800 ${
                  razorpayAccountId.trim() && !razorpayAccountId.trim().startsWith("acc_")
                    ? "border-red-400"
                    : "border-hive-border/60"
                }`}
              />
              <p className="text-[11px] text-hive-text-muted leading-snug">
                Paste the Razorpay Route Linked Account ID generated from the Razorpay Dashboard.
              </p>
              {status === "APPROVED" && !razorpayAccountId.trim() && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2 font-medium mt-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Route Account Missing:</strong> This boutique is approved but does not have a Razorpay Route Account ID (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">acc_...</code>). Online payment transfers will remain on hold until configured.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-4 pt-4 border-t border-hive-border/60">
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className="flex items-center justify-center gap-2 py-3 px-6"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </Button>
            
            <Link href="/admin/boutiques">
              <Button type="button" variant="outline" className="py-3 px-6">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
