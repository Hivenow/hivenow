"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useSellerAuth } from "@/context/SellerAuthContext";
import { api } from "../../../../../../convex/_generated/api";
import { Button, Card, CardContent, cn, LoadingState } from "@hive/ui";
import Link from "next/link";
import { Loader2, Store, Phone, Mail, MapPin, Shield, CheckCircle2, UploadCloud, LogOut, Star, Wallet, ChevronRight, ShieldCheck, Lock, Repeat, Volume2, TicketPercent } from "lucide-react";
import { toast } from "@hive/utils";
import Cropper from "react-easy-crop";
import { Modal } from "@hive/ui";

export default function BoutiqueProfile() {
  const { signOut } = useSellerAuth();
  const boutique = useQuery(api.boutiques.getMyBoutiqueDetails);
  const updateBoutiqueProfile = useMutation(api.boutiques.updateBoutiqueProfile);
  const me = useQuery(api.users.getMe);
  const updateBoutiqueStaff = useMutation(api.boutiques.updateBoutiqueStaff);
  const generateUploadUrl = useAction(api.media.api.generateUploadUrl);
  const commitUpload = useAction(api.media.api.commitUpload);

  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  // Editable fields
  const [boutiqueName, setBoutiqueName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(15);
  const [latitude, setLatitude] = useState(17.385);
  const [longitude, setLongitude] = useState(78.487);

  const [alertMode, setAlertMode] = useState<"store" | "mobile">("mobile");
  const [hasOverlayPerm, setHasOverlayPerm] = useState(false);
  const [isCapacitorApp, setIsCapacitorApp] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMode = (localStorage.getItem("hive_alert_mode") as "store" | "mobile") || "mobile";
      setAlertMode(savedMode);

      const cap = (window as any).Capacitor;
      if (cap?.Plugins?.FcmToken) {
        setIsCapacitorApp(true);
        cap.Plugins.FcmToken.canDrawOverlays?.()
          .then((res: { granted?: boolean }) => {
            setHasOverlayPerm(!!res?.granted);
          })
          .catch(() => {});
      }
    }
  }, []);

  const handleRequestOverlay = () => {
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : null;
    if (cap?.Plugins?.FcmToken?.requestOverlayPermission) {
      cap.Plugins.FcmToken.requestOverlayPermission()
        .then(() => {
          setTimeout(() => {
            cap.Plugins.FcmToken.canDrawOverlays?.().then((res: { granted?: boolean }) => {
              setHasOverlayPerm(!!res?.granted);
            });
          }, 1000);
        })
        .catch(console.error);
    }
  };
  
  // Store status
  const [storeStatus, setStoreStatus] = useState<"open" | "busy" | "closed">("open");
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [pauseReason, setPauseReason] = useState<string>("other");
  const [closedUntilStr, setClosedUntilStr] = useState<string>("");

  // Operating Hours and Holidays
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("21:00");
  const [weeklyClosedDays, setWeeklyClosedDays] = useState<number[]>([]);
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");
  
  // Image states
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoStorageId, setLogoStorageId] = useState<string | null>(null);
  
  // Crop states
  const [isLogoCropOpen, setIsLogoCropOpen] = useState(false);
  const [logoCrop, setLogoCrop] = useState({ x: 0, y: 0 });
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoCroppedAreaPixels, setLogoCroppedAreaPixels] = useState<any>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverStorageId, setCoverStorageId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [returnsAcceptedDefault, setReturnsAcceptedDefault] = useState(true);
  const [exchangesAcceptedDefault, setExchangesAcceptedDefault] = useState(true);

  // Staff States
  const [staffEmail1, setStaffEmail1] = useState("");
  const [staffEmail2, setStaffEmail2] = useState("");
  const [staffPhone1, setStaffPhone1] = useState("");
  const [staffPhone2, setStaffPhone2] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [savingOperations, setSavingOperations] = useState(false);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [staffNotificationSelection, setStaffNotificationSelection] = useState("none");

  // Sync details when boutique query resolves
  useEffect(() => {
    if (boutique) {
      setPhone(boutique.phone || boutique.phoneNumber || "");
      setDescription(boutique.description || "");
      const resolvedLogo = typeof boutique.logoUrl === "string" ? boutique.logoUrl : (boutique.logoUrl as any)?.objectKey || null;
      const resolvedBanner = typeof boutique.bannerUrl === "string" ? boutique.bannerUrl : (boutique.bannerUrl as any)?.objectKey || null;

      setLogoPreview(resolvedLogo);
      setCoverPreview(resolvedBanner);
      setLogoStorageId(resolvedLogo);
      setCoverStorageId(resolvedBanner);

      setBoutiqueName(boutique.boutiqueName || boutique.name || "");
      setOwnerName(boutique.ownerName || "");
      setAddress(boutique.address || "");
      setDeliveryRadiusKm(boutique.deliveryRadiusKm ?? 15);
      setLatitude(boutique.latitude ?? 17.385);
      setLongitude(boutique.longitude ?? 78.487);
      
      setStoreStatus(boutique.storeStatus as any || "open");
      setIsAcceptingOrders(boutique.isAcceptingOrders ?? true);
      setPauseReason(boutique.pauseReason || "other");
      if (boutique.closedUntil) {
        const date = new Date(boutique.closedUntil);
        setClosedUntilStr(date.toISOString().split("T")[0] || "");
      } else {
        setClosedUntilStr("");
      }

      setOpeningTime(boutique.openingTime || "09:00");
      setClosingTime(boutique.closingTime || "21:00");
      setWeeklyClosedDays(boutique.weeklyClosedDays || []);
      setHolidayDates(boutique.holidayDates || []);
      setReturnsAcceptedDefault(boutique.returnsAcceptedDefault !== false);
      // Unset falls back to the return policy, so existing sellers keep the
      // behaviour their current setting already implied.
      setExchangesAcceptedDefault(
        (boutique as any).exchangesAcceptedDefault ?? boutique.returnsAcceptedDefault !== false
      );
      setStaffEmail1(boutique.staffEmail1 || "");
      setStaffEmail2(boutique.staffEmail2 || "");
      setStaffPhone1((boutique as any).staffPhone1 || "");
      setStaffPhone2((boutique as any).staffPhone2 || "");
      setStaffNotificationSelection((boutique as any).staffNotificationSelection || "none");
    }
  }, [boutique]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image Too Large", "Logo image must be under 5MB.");
      return;
    }
    setPendingLogoFile(file);
    setPendingLogoUrl(URL.createObjectURL(file));
    setIsLogoCropOpen(true);
  };

  const handleApplyLogoCrop = async () => {
    if (!pendingLogoFile || !pendingLogoUrl || !logoCroppedAreaPixels) return;
    setUploadMsg("Cropping image...");
    setSaving(true);
    
    try {
      const croppedFile = await cropImage(pendingLogoUrl, logoCroppedAreaPixels, pendingLogoFile);
      setLogoFile(croppedFile);
      setLogoPreview(URL.createObjectURL(croppedFile));
      setIsLogoCropOpen(false);
    } catch (err) {
      toast.error("Crop Failed", "Could not crop the logo.");
    } finally {
      setSaving(false);
      setUploadMsg("");
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image Too Large", "Cover photo must be under 5MB.");
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const uploadFileToR2 = async (file: File, context: string) => {
    const { presignedUrl, sessionId } = await generateUploadUrl({
      mimeType: file.type,
      fileSize: file.size,
      ownerType: "boutique",
      ownerId: boutique!._id,
      context,
    });

    const result = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!result.ok) throw new Error("Failed to upload file to R2");

    return await commitUpload({ sessionId });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boutique) {
      toast.error("Error: Boutique profile is not loaded yet.");
      return;
    }
    setSaving(true);
    setUploadMsg("Saving your updates...");

    try {
      let logoPayload = undefined;
      let bannerPayload = undefined;

      if (logoFile) {
        setUploadMsg("Uploading Boutique Logo...");
        logoPayload = await uploadFileToR2(logoFile, "boutique_logo");
        setLogoFile(null);
      }

      if (coverFile) {
        setUploadMsg("Uploading Cover Banner...");
        bannerPayload = await uploadFileToR2(coverFile, "boutique_banner");
        setCoverFile(null);
      }

      const payload: any = {
        phone,
        description,
        boutiqueName,
        ownerName,
        address,
        latitude,
        longitude,
        deliveryRadiusKm,
        storeStatus,
        isAcceptingOrders,
        pauseReason: (!isAcceptingOrders || storeStatus === "closed") ? (pauseReason as any) : undefined,
        closedUntil: (!isAcceptingOrders || storeStatus === "closed") && closedUntilStr 
                       ? new Date(closedUntilStr).getTime() 
                       : undefined,
        returnsAcceptedDefault,
        exchangesAcceptedDefault,
      };

      if (logoPayload !== undefined) {
        payload.logoUrl = logoPayload;
      }
      if (bannerPayload !== undefined) {
        payload.bannerUrl = bannerPayload;
      }

      await updateBoutiqueProfile(payload);

      toast.success("Profile Updated", "Your boutique details were saved successfully.");
    } catch (err: any) {
      toast.error("Couldn't Save Profile", "Something went wrong while updating your profile. Please try again.");
    } finally {
      setSaving(false);
      setUploadMsg("");
    }
  };

  const handleUpdateOperations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boutique) return;
    
    setSavingOperations(true);
    try {
      await updateBoutiqueProfile({
        phone,
        description,
        openingTime,
        closingTime,
        weeklyClosedDays,
        holidayDates,
      });
      toast.success("Operations Updated", "Store timings and holidays saved successfully.");
    } catch (err: any) {
      toast.error("Couldn't Update Operations", "Something went wrong. Please try again.");
    } finally {
      setSavingOperations(false);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (staffPhone1 && !phoneRegex.test(staffPhone1)) {
      toast.error("Invalid Phone Format", "Please enter a valid mobile number with country code (e.g. +91 98765 43210).");
      return;
    }
    if (staffPhone2 && !phoneRegex.test(staffPhone2)) {
      toast.error("Invalid Phone Format", "Please enter a valid mobile number with country code (e.g. +91 98765 43210).");
      return;
    }

    setSavingStaff(true);
    try {
      await updateBoutiqueStaff({
        staffEmail1: staffEmail1 || undefined,
        staffEmail2: staffEmail2 || undefined,
        staffPhone1: staffPhone1 || undefined,
        staffPhone2: staffPhone2 || undefined,
        staffNotificationSelection,
      });
      toast.success("Staff Details Updated", "Notification and contact details saved successfully.");
      setIsEditingStaff(false);
    } catch (err: any) {
      toast.error("Couldn't Update Staff", "Something went wrong while updating staff details. Please try again.");
    } finally {
      setSavingStaff(false);
    }
  };

  const handleCancelStaffEdit = () => {
    if (boutique) {
      setStaffEmail1(boutique.staffEmail1 || "");
      setStaffEmail2(boutique.staffEmail2 || "");
      setStaffPhone1((boutique as any).staffPhone1 || "");
      setStaffPhone2((boutique as any).staffPhone2 || "");
      setStaffNotificationSelection((boutique as any).staffNotificationSelection || "none");
    }
    setIsEditingStaff(false);
  };

  if (boutique === undefined) {
    return <LoadingState message="Loading account..." variant="full" />;
  }

  return (
    <div className="flex flex-col gap-8 text-left">


      <div>
        <h1 className="text-3xl font-serif font-black text-hive-dark">More & Account Hub</h1>
        <p className="text-sm text-hive-text-muted">Manage your store profile, customer feedback, and financial settlements.</p>
      </div>

      {/* Quick Management Hub Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/boutique/reviews"
          className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-slate-900 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#F5C22B]">
              <Star className="w-5 h-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 group-hover:text-slate-900">Customer Reviews & Ratings</span>
              <span className="text-[11px] text-slate-500 font-medium">View product ratings & reply to buyers</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
        </Link>

        <Link
          href="/boutique/coupons"
          className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-slate-900 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
              <TicketPercent className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 group-hover:text-slate-900">Coupons</span>
              <span className="text-[11px] text-slate-500 font-medium">Create discount codes for your store</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
        </Link>

        {me?.role !== "boutique" && (
          <Link
            href="/boutique/finance"
            className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-slate-900 transition-all flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900 group-hover:text-slate-900">Earnings & Settlements</span>
                <span className="text-[11px] text-slate-500 font-medium">Track payouts, ledgers & revenue</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
          </Link>
        )}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Form: Editable Settings (7 cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 flex flex-col gap-6">
          <Card className="border border-hive-border bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-5">
            <h3 className="text-lg font-serif font-bold text-hive-dark pb-2 border-b border-hive-border/60">
              Customize Presentation
            </h3>

            {/* Logo Upload */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Logo Representation</label>
              <div className="relative w-28 h-28 rounded-full border-2 border-dashed border-hive-border hover:border-[#F5C22B] flex items-center justify-center overflow-hidden bg-slate-50 cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover animate-fade-in" />
                ) : (
                  <Store className="w-8 h-8 text-slate-300" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">
                  Replace Logo
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Shop Name</label>
                <input
                  type="text"
                  required
                  value={boutiqueName}
                  onChange={(e) => setBoutiqueName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Owner Name</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Public Contact Phone</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Delivery Radius (Km)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={deliveryRadiusKm}
                  onChange={(e) => setDeliveryRadiusKm(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10"
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
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Brand Story</label>
                <span className={`text-[10px] font-bold ${description.length > 500 ? 'text-rose-500' : 'text-hive-text-muted/70'}`}>
                  {description.length}/500
                </span>
              </div>
              <textarea
                required
                rows={4}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share your boutique's story—your style philosophy, custom stitching heritage, fabric sourcing focus, and design choices..."
                className="w-full px-4 py-2.5 rounded-xl border border-hive-border/60 focus:outline-none focus:ring-1.5 focus:ring-[#F5C22B] text-sm bg-hive-cream/10 resize-none"
              />
            </div>

            {/* Map Coordinates display */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <div className="font-bold text-hive-text-muted flex justify-between items-center">
                <span>Coordinates</span>
                <span className="font-mono text-[10px] text-hive-amber">
                  Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
                </span>
              </div>
            </div>
            {/* Store Default Return Policy Toggle Card */}
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 font-sans">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Store Default Return Policy
                  </h4>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                    Auto-applies when listing new products.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Option A: Accept 24h Returns */}
                <div
                  onClick={() => setReturnsAcceptedDefault(true)}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    returnsAcceptedDefault
                      ? "bg-emerald-50/60 border-emerald-500/80 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Accept 24h Returns</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-500 font-medium leading-snug mt-1">
                      Allows 24-hour voluntary size exchanges & returns.
                    </p>
                  </div>

                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    returnsAcceptedDefault ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white"
                  }`}>
                    {returnsAcceptedDefault && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>

                {/* Option B: Final Sale Default */}
                <div
                  onClick={() => setReturnsAcceptedDefault(false)}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    !returnsAcceptedDefault
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${!returnsAcceptedDefault ? "text-white" : "text-slate-900"}`}>
                        Final Sale Only
                      </span>
                    </div>
                    <p className={`text-[11.5px] font-medium leading-snug mt-1 ${!returnsAcceptedDefault ? "text-slate-300" : "text-slate-500"}`}>
                      No voluntary returns. Damaged items remain covered.
                    </p>
                  </div>

                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    !returnsAcceptedDefault ? "bg-white text-slate-900" : "border border-slate-300 bg-white"
                  }`}>
                    {!returnsAcceptedDefault && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Exchange policy: a separate opt-in from cash returns ────── */}
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-start gap-2 mb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-amber-600" />
                    Store Default Exchange Policy
                  </h4>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                    Separate from returns — you can swap sizes without offering refunds.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  onClick={() => setExchangesAcceptedDefault(true)}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    exchangesAcceptedDefault
                      ? "bg-amber-50/70 border-amber-500/80 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Accept Exchanges</span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-500 font-medium leading-snug mt-1">
                      Customer gets 30-day credit for your store. Money stays with you.
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    exchangesAcceptedDefault ? "bg-amber-600 text-white" : "border border-slate-300 bg-white"
                  }`}>
                    {exchangesAcceptedDefault && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>

                <div
                  onClick={() => setExchangesAcceptedDefault(false)}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    !exchangesAcceptedDefault
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-bold ${!exchangesAcceptedDefault ? "text-white" : "text-slate-900"}`}>
                      No Exchanges
                    </span>
                    <p className={`text-[11.5px] font-medium leading-snug mt-1 ${!exchangesAcceptedDefault ? "text-slate-300" : "text-slate-500"}`}>
                      Customers cannot request a size swap on your orders.
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    !exchangesAcceptedDefault ? "bg-white text-slate-900" : "border border-slate-300 bg-white"
                  }`}>
                    {!exchangesAcceptedDefault && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Order Alert Sound Settings ────────────────────────────────────── */}
            <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-slate-600" />
                  Order Notification Sound
                </h4>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                  Choose how your device alerts you when a new order arrives.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  onClick={() => {
                    setAlertMode("mobile");
                    if (typeof window !== "undefined") {
                      localStorage.setItem("hive_alert_mode", "mobile");
                      window.dispatchEvent(new Event("hive_alert_mode_change"));
                    }
                  }}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    alertMode === "mobile"
                      ? "bg-amber-50/70 border-amber-500/80 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-900">Standard Chime</span>
                    <p className="text-[11.5px] text-slate-500 font-medium leading-snug mt-1">
                      Plays a single order chime when a new order is received.
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    alertMode === "mobile" ? "bg-amber-600 text-white" : "border border-slate-300 bg-white"
                  }`}>
                    {alertMode === "mobile" && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>

                <div
                  onClick={() => {
                    setAlertMode("store");
                    if (typeof window !== "undefined") {
                      localStorage.setItem("hive_alert_mode", "store");
                      window.dispatchEvent(new Event("hive_alert_mode_change"));
                    }
                  }}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 text-left cursor-pointer ${
                    alertMode === "store"
                      ? "bg-amber-50/70 border-amber-500/80 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-900">Continuous Ring</span>
                    <p className="text-[11.5px] text-slate-500 font-medium leading-snug mt-1">
                      Loops the audio alarm until you accept or mute the order.
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    alertMode === "store" ? "bg-amber-600 text-white" : "border border-slate-300 bg-white"
                  }`}>
                    {alertMode === "store" && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Display Over Other Apps (Overlay) for Native Android App ───── */}
            {isCapacitorApp && (
              <div className="mt-4 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-[#D9A71E]" />
                      Display Over Other Apps
                    </span>
                    <p className="text-[11.5px] text-slate-600 font-medium mt-0.5 leading-snug">
                      Allow Hive to pop up order alerts immediately even when you are using WhatsApp or other apps.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestOverlay}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-all ${
                      hasOverlayPerm
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                    }`}
                  >
                    {hasOverlayPerm ? "Enabled ✓" : "Enable Overlay"}
                  </button>
                </div>
              </div>
            )}


            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              className="mt-2 py-3 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {uploadMsg}
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </Card>
        </form>

        {/* Right Side: Read-only Settings (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card: Operational Hours & Holidays */}
          <form onSubmit={handleUpdateOperations}>
            <Card className="border border-hive-border bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-5">
              <div>
                <h3 className="text-lg font-serif font-bold text-hive-dark">
                  Operations & Holidays
                </h3>
                <p className="text-xs text-hive-text-muted mt-0.5">Configure store timings (in IST), weekly days off, and holiday periods.</p>
              </div>

            {/* Timings */}
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Opening Time (IST)</label>
                <input
                  type="time"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Closing Time (IST)</label>
                <input
                  type="time"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Weekly Days Off */}
            <div className="flex flex-col gap-2 pb-4 border-b border-slate-100">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Weekly Days Off</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: "Sun" },
                  { value: 1, label: "Mon" },
                  { value: 2, label: "Tue" },
                  { value: 3, label: "Wed" },
                  { value: 4, label: "Thu" },
                  { value: 5, label: "Fri" },
                  { value: 6, label: "Sat" }
                ].map((day) => {
                  const isClosed = weeklyClosedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        if (isClosed) {
                          setWeeklyClosedDays(weeklyClosedDays.filter((d) => d !== day.value));
                        } else {
                          setWeeklyClosedDays([...weeklyClosedDays, day.value]);
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                        isClosed
                          ? "bg-amber-50 border-amber-200 text-amber-700 font-bold"
                          : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Holiday Manager */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Manage Holidays</label>
              
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newHoliday}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="flex-1 h-10 px-3 border border-hive-border rounded-xl text-sm"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (!newHoliday) return;
                    if (holidayDates.includes(newHoliday)) {
                      toast.error("Holiday date already added.");
                      return;
                    }
                    setHolidayDates([...holidayDates, newHoliday]);
                    setNewHoliday("");
                  }}
                  className="h-10 text-xs px-4"
                >
                  Add
                </Button>
              </div>

              {/* Holiday List */}
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto mt-1 pr-1">
                {holidayDates.length === 0 ? (
                  <p className="text-xs text-stone-400 italic">No holidays configured.</p>
                ) : (
                  holidayDates
                    .sort()
                    .map((date) => (
                      <div key={date} className="flex justify-between items-center bg-stone-50 border border-stone-200/60 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-semibold text-stone-700">
                          {new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setHolidayDates(holidayDates.filter((d) => d !== date));
                          }}
                          className="text-stone-400 hover:text-red-600 text-xs font-bold transition-all px-1.5 py-0.5"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={savingOperations}
              className="mt-2 py-3 flex items-center justify-center gap-2 w-full"
            >
              {savingOperations ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Operations"
              )}
            </Button>
          </Card>
          </form>

          {/* Card: Staff Management (Owner-only) */}
          {me?.role !== "boutique" && (
            <Card className="border border-hive-border bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-lg font-serif font-bold text-hive-dark">
                    Manage Shop Staff
                  </h3>
                  <p className="text-xs text-hive-text-muted mt-0.5 font-medium leading-relaxed">
                    Update active staff contact emails and WhatsApp numbers. Changed staff will automatically lose authentication access.
                  </p>
                </div>
                {!isEditingStaff && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditingStaff(true)}
                    className="shrink-0 h-9 text-xs px-3 font-bold border-slate-200 hover:border-slate-800 text-slate-700 hover:text-slate-900 rounded-xl"
                  >
                    Edit
                  </Button>
                )}
              </div>

              <form onSubmit={handleUpdateStaff} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3.5">
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff Email 1</label>
                    <input
                      type="email"
                      placeholder="e.g. staff1@store.com"
                      value={staffEmail1}
                      onChange={(e) => setStaffEmail1(e.target.value)}
                      disabled={!isEditingStaff}
                      className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed transition-all duration-150"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff WhatsApp 1</label>
                    <input
                      type="tel"
                      placeholder="e.g. +919876543211"
                      value={staffPhone1}
                      onChange={(e) => setStaffPhone1(e.target.value)}
                      disabled={!isEditingStaff}
                      className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed transition-all duration-150"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 border-t border-slate-100 pt-3.5">
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff Email 2</label>
                    <input
                      type="email"
                      placeholder="e.g. staff2@store.com"
                      value={staffEmail2}
                      onChange={(e) => setStaffEmail2(e.target.value)}
                      disabled={!isEditingStaff}
                      className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed transition-all duration-150"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold uppercase tracking-wider text-hive-text-muted">Staff WhatsApp 2</label>
                    <input
                      type="tel"
                      placeholder="e.g. +919876543212"
                      value={staffPhone2}
                      onChange={(e) => setStaffPhone2(e.target.value)}
                      disabled={!isEditingStaff}
                      className="w-full h-11 px-3 border border-hive-border rounded-xl text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Order Notifications Routing Selection */}
                <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3.5 text-left select-none animate-in fade-in duration-200">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Order Notification Routing</label>
                  <p className="text-[10px] text-slate-455 text-slate-500 font-medium leading-relaxed">
                    Order alerts are always dispatched to the store owner. Choose which staff member should also receive notifications:
                  </p>
                  
                  <div className="flex flex-col gap-2 mt-1.5">
                    <label className="flex items-center gap-2.5 text-xs text-slate-800 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="staffNotification"
                        value="none"
                        checked={staffNotificationSelection === "none"}
                        onChange={() => setStaffNotificationSelection("none")}
                        disabled={!isEditingStaff}
                        className="w-4 h-4 accent-[#E9B929]"
                      />
                      <span>Owner Only (No Staff)</span>
                    </label>

                    {(staffEmail1 || staffPhone1) && (
                      <label className="flex items-center gap-2.5 text-xs text-slate-800 font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="staffNotification"
                          value="staff1"
                          checked={staffNotificationSelection === "staff1"}
                          onChange={() => setStaffNotificationSelection("staff1")}
                          disabled={!isEditingStaff}
                          className="w-4 h-4 accent-[#E9B929]"
                        />
                        <span>Owner + Staff 1 ({staffEmail1 || staffPhone1})</span>
                      </label>
                    )}

                    {(staffEmail2 || staffPhone2) && (
                      <label className="flex items-center gap-2.5 text-xs text-slate-800 font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="staffNotification"
                          value="staff2"
                          checked={staffNotificationSelection === "staff2"}
                          onChange={() => setStaffNotificationSelection("staff2")}
                          disabled={!isEditingStaff}
                          className="w-4 h-4 accent-[#E9B929]"
                        />
                        <span>Owner + Staff 2 ({staffEmail2 || staffPhone2})</span>
                      </label>
                    )}

                    {(staffEmail1 || staffPhone1) && (staffEmail2 || staffPhone2) && (
                      <label className="flex items-center gap-2.5 text-xs text-slate-800 font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="staffNotification"
                          value="both"
                          checked={staffNotificationSelection === "both"}
                          onChange={() => setStaffNotificationSelection("both")}
                          disabled={!isEditingStaff}
                          className="w-4 h-4 accent-[#E9B929]"
                        />
                        <span>Owner + Both Staff (Staff 1 & Staff 2)</span>
                      </label>
                    )}
                  </div>
                </div>

                {isEditingStaff && (
                  <div className="flex gap-3 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelStaffEdit}
                      className="flex-1 py-2.5 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl text-xs font-bold transition-all"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={savingStaff}
                      className="flex-1 py-2.5 flex items-center justify-center gap-2 rounded-2xl text-xs font-bold"
                    >
                      {savingStaff && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save Details
                    </Button>
                  </div>
                )}
              </form>
            </Card>
          )}

          <Card className="border border-hive-border bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-5">
            <h3 className="text-lg font-serif font-bold text-hive-dark pb-2 border-b border-hive-border/60">
              Registration Meta
            </h3>

            <div className="flex flex-col gap-4 text-xs">
              
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="font-bold text-hive-text-muted">Shop Name</span>
                <span className="font-extrabold text-hive-dark">{boutiqueName}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="font-bold text-hive-text-muted">Owner Name</span>
                <span className="font-extrabold text-hive-dark">{ownerName}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="font-bold text-hive-text-muted">Email</span>
                <span className="font-extrabold text-hive-dark">{boutique.email}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="font-bold text-hive-text-muted">Delivery Radius</span>
                <span className="font-extrabold text-hive-dark">{deliveryRadiusKm} Km</span>
              </div>

              <div className="flex justify-between items-center py-2.5 border-b border-slate-100/60">
                <span className="font-bold text-hive-text-muted">Verification Status</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/40 shadow-[0_1px_2px_rgba(16,185,129,0.04)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Approved
                </span>
              </div>

              <div className="flex flex-col gap-1 text-left py-2">
                <span className="font-bold text-hive-text-muted">Physical Registered Address</span>
                <span className="font-semibold text-slate-700 leading-normal">{address}</span>
              </div>

            </div>
          </Card>

          {/* Mobile-only Logout */}
          <div className="md:hidden mt-4">
            <Button 
              variant="outline" 
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              className="w-full justify-center gap-2 border-[#f1f5f9] bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-800 rounded-2xl py-3 text-xs font-bold shadow-sm"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>

      </div>

      <Modal isOpen={isLogoCropOpen} onClose={() => setIsLogoCropOpen(false)} title="Crop Logo">
        <div className="p-4 flex flex-col gap-4">
          <div className="relative w-full h-64 bg-slate-900 rounded-xl overflow-hidden">
            {pendingLogoUrl && (
              <Cropper
                image={pendingLogoUrl}
                crop={logoCrop}
                zoom={logoZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setLogoCrop}
                onZoomChange={setLogoZoom}
                onCropComplete={(_, croppedAreaPixels) => setLogoCroppedAreaPixels(croppedAreaPixels)}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400">ZOOM</span>
            <input
              type="range"
              value={logoZoom}
              min={1}
              max={3}
              step={0.1}
              onChange={(e) => setLogoZoom(Number(e.target.value))}
              className="flex-1 accent-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsLogoCropOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleApplyLogoCrop} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Apply Crop
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Helper function for cropping
const cropImage = (
  srcUrl: string,
  croppedAreaPixels: { x: number; y: number; width: number; height: number },
  originalFile: File
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(originalFile);

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      canvas.toBlob((blob) => {
        if (!blob) return resolve(originalFile);
        resolve(new File([blob], originalFile.name, { type: originalFile.type || "image/jpeg", lastModified: Date.now() }));
      }, originalFile.type || "image/jpeg", 0.95);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = srcUrl;
  });
};
