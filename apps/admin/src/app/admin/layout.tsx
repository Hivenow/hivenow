"use client";

import React, { useState, useEffect } from "react";
import { useAuth, SignOutButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderKanban, Image as ImageIcon, Store, LogOut, Menu, X, Loader2, ShieldX, Users, ShoppingBag, Activity, ShieldAlert, Package, DollarSign, Landmark, CreditCard, Truck, Send, Sparkles, BookOpen, MapPin, RotateCcw, Ticket } from "lucide-react";
import Link from "next/link";
import { Button } from "@hive/ui";
import { HiveLogo } from "@/components/shared/HiveLogo";

const NAV_GROUPS = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Observability", href: "/admin/observability", icon: Activity },
    ]
  },
  {
    title: "MARKETING",
    items: [
      { label: "Blog & SEO", href: "/admin/blog", icon: BookOpen },
      { label: "Campaigns", href: "/admin/marketing/campaigns", icon: Send },
      { label: "Post-Purchase Promos", href: "/admin/promotions", icon: Sparkles },
      { label: "Promo Coupons", href: "/admin/promo-coupons", icon: Ticket },
    ]
  },
  {
    title: "MERCHANDISING",
    items: [
      { label: "Experiences", href: "/admin/homepage", icon: Sparkles },
      { label: "Collections", href: "/admin/collections", icon: FolderKanban },
      { label: "Banners", href: "/admin/banners", icon: ImageIcon },
    ]
  },
  {
    title: "OPERATIONS",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Reservations", href: "/admin/reservations", icon: ShoppingBag },
      { label: "Claims", href: "/admin/claims", icon: ShieldAlert },
      { label: "Returns & Exchanges", href: "/admin/returns", icon: RotateCcw },
      { label: "Products", href: "/admin/products", icon: Package },
      { label: "Finance", href: "/admin/finance", icon: DollarSign },
      { label: "Settlements", href: "/admin/settlements", icon: Landmark },
      { label: "Payouts", href: "/admin/payouts", icon: CreditCard },
      { label: "Payout Monitor", href: "/admin/payout-monitor", icon: ShieldAlert },
      { label: "Logistics", href: "/admin/logistics", icon: Truck },
      { label: "Serviceable Pincodes", href: "/admin/pincodes", icon: MapPin },
    ]
  },
  {
    title: "MERCHANTS",
    items: [
      { label: "Partners", href: "/admin/boutiques", icon: Store },
    ]
  },
  {
    title: "PLATFORM",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Categories", href: "/admin/categories", icon: FolderKanban },
      { label: "Platform Config", href: "/admin/settings", icon: LayoutDashboard },
    ]
  }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const me = useQuery(api.users.getMe);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  console.log("[AdminLayout] isLoaded:", isLoaded, "isSignedIn:", isSignedIn, "me:", me);

  // Unauthenticated redirect
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Non-admin redirect
  useEffect(() => {
    if (me && me.role !== "admin" && pathname !== "/admin/unauthorized") {
      router.push("/admin/unauthorized");
    }
  }, [me, router, pathname]);

  // ── Loading guard ─────────────────────────────────────────────────────────
  // me===undefined → Convex query still in-flight → show spinner
  // me===null      → user not in DB (UserSync hasn't fired yet, or auth issue)
  //                  → do NOT spin forever, show a clear error
  if (!isLoaded || me === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-hive-amber" />
        <div className="flex flex-col gap-1">
          <span className="text-base font-serif font-black text-hive-dark">Hive Admin Control</span>
          <span className="text-xs text-hive-text-muted">Authenticating secure session...</span>
        </div>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4 text-center px-4">
        <ShieldX className="w-10 h-10 text-red-400" />
        <span className="text-base font-serif font-black text-hive-dark">Account Not Registered</span>
        <p className="text-xs text-hive-text-muted max-w-sm">
          Your Clerk account is not yet linked to a Convex user record.
          Sign out and sign back in — UserSync will register you automatically.
          If the problem persists, ensure your Convex user has{" "}
          <code className="bg-slate-100 px-1 rounded">role: &quot;admin&quot;</code>.
        </p>
        <button
          onClick={() => router.push("/sign-in")}
          className="text-xs underline text-hive-amber mt-2"
        >
          Sign in again
        </button>
      </div>
    );
  }

  // Not signed in
  if (!isSignedIn) {
    return null; // Hook redirects to sign-in
  }

  // Non-admin signed in
  if (me && me.role !== "admin" && pathname !== "/admin/unauthorized") {
    return null; // Redirects to unauthorized
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800">
      
      {/* Mobile Header */}
      <header className="md:hidden h-16 bg-hive-dark text-white border-b border-hive-border/20 flex items-center justify-between px-4 sticky top-0 z-30">
        <HiveLogo roleLabel="ADMIN PANEL" href="/admin" />
        <button 
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-hive-dark text-slate-300 border-r border-hive-border/10 flex flex-col p-6 transition-transform duration-300 transform
        md:translate-x-0 md:static md:h-screen md:sticky md:top-0
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Header Brand */}
        <HiveLogo roleLabel="ADMIN PANEL" href="/admin" className="hidden md:flex pb-4 border-b border-white/5 w-full justify-start shrink-0" />

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto py-6 pr-2 -mr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <nav className="flex flex-col gap-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <span className="px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{group.title}</span>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                    return (
                      <Link 
                        key={item.href} 
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                          isActive 
                            ? "bg-hive-gold text-hive-dark font-bold shadow-md shadow-hive-gold/15" 
                            : "hover:bg-white/5 hover:text-white text-slate-300"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer User Info & Logout */}
        <div className="flex flex-col gap-4 border-t border-white/5 pt-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-hive-gold flex items-center justify-center text-hive-dark font-bold text-xs uppercase border border-hive-border/30">
              {clerkUser?.firstName?.charAt(0) || "A"}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-xs font-bold text-white truncate">
                {clerkUser?.fullName || "Admin User"}
              </span>
              <span className="text-[10px] text-hive-gold font-semibold tracking-wider uppercase">
                {me?.role}
              </span>
            </div>
          </div>

          <SignOutButton redirectUrl="http://localhost:3000/">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 rounded-xl text-xs py-2 font-medium"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-900" />
              <span>Log out</span>
            </Button>
          </SignOutButton>
        </div>
      </aside>

      {/* Backdrop overlay for mobile sidebar */}
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/45 z-30 md:hidden animate-fade-in"
        />
      )}

      {/* Page Content Slot */}
      <main className="flex-1 overflow-x-hidden md:h-screen md:overflow-y-auto">
        <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
