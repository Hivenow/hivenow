"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { usePathname, useRouter } from "next/navigation";
import { Home, Tag, Package, ClipboardList, User, LogOut, Loader2, Wallet, Star, Plus, TicketPercent } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button, LoadingState } from "@hive/ui";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { useSellerAuth } from "@/context/SellerAuthContext";

const BOUTIQUE_NAV_ITEMS = [
  { label: "Home", href: "/boutique", icon: Home },
  { label: "Products", href: "/boutique/products", icon: Tag },
  { label: "Stock", href: "/boutique/inventory", icon: Package },
  { label: "Orders", href: "/boutique/orders", icon: ClipboardList },
  { label: "Reviews", href: "/boutique/reviews", icon: Star },
  { label: "Coupons", href: "/boutique/coupons", icon: TicketPercent },
  { label: "Money", href: "/boutique/finance", icon: Wallet },
  { label: "More", href: "/boutique/profile", icon: User },
];

export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user: firebaseUser, signOut } = useSellerAuth();
  const me = useQuery(api.users.getMe);
  const myBoutiqueSafe = useQuery(api.boutiques.getMyBoutiqueSafe);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = me?.role === "boutique"
    ? BOUTIQUE_NAV_ITEMS.filter(item => item.label !== "Money")
    : BOUTIQUE_NAV_ITEMS;


  // Unauthenticated redirect
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/sign-in");
    }
  }, [isLoading, isAuthenticated, router]);

  // Role-based redirect: customer goes to unauthorized portal
  useEffect(() => {
    if (me === undefined || myBoutiqueSafe === undefined) return;

    if (me) {
      if (me.role === "customer") {
        if (pathname !== "/boutique/unauthorized" && pathname !== "/unauthorized") {
          router.push("/boutique/unauthorized");
        }
        return;
      }
    }

    if (myBoutiqueSafe && !myBoutiqueSafe.exists) {
      // Allow user to view portal even without a boutique record, as requested.
      // We no longer redirect to /boutique/unauthorized here.
    }
  }, [me, myBoutiqueSafe, router, pathname]);

  const boutique = (myBoutiqueSafe as any)?.boutique;

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (isLoading || me === undefined || myBoutiqueSafe === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingState message="Loading secure session..." variant="full" />
      </div>
    );
  }

  // Convex user not yet synced (first login edge case — syncUser fires async)
  if (me === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4 text-center px-4">
        <Loader2 className="w-10 h-10 animate-spin text-hive-amber" />
        <span className="text-base font-serif font-black text-hive-dark">Connecting Your Account</span>
        <p className="text-xs text-hive-text-muted max-w-sm">
          Your Google account is being linked to the Seller Portal. This takes just a moment.
        </p>
        <button
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="text-xs underline text-hive-amber mt-2 cursor-pointer"
        >
          Sign out and sign in again
        </button>
      </div>
    );
  }


  // Display name: Firebase user → fallback to "B"
  const displayInitial = firebaseUser?.displayName?.charAt(0) ?? firebaseUser?.email?.charAt(0) ?? "B";
  const displayName = firebaseUser?.displayName ?? "Shop Owner";
  const boutiqueName = (myBoutiqueSafe as any)?.boutique?.boutiqueName;

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-white text-slate-800">
      
      {/* Mobile Header */}
      <header className="md:hidden h-16 bg-white border-b border-[#f1f5f9] flex items-center justify-between px-5 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <Link href="/boutique" className="flex items-center hover:opacity-85 active:scale-[0.98] transition-all">
            <Image
              src="/logo-square.png?v=1"
              alt="Hive Partners"
              width={64}
              height={64}
              priority
              className="h-10 w-10 sm:h-11 sm:w-11 object-contain shrink-0 rounded-lg shadow-xs"
            />
          </Link>
          {boutiqueName && (
            <span className="text-xs font-bold text-slate-800 truncate max-w-[160px]">
              {boutiqueName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs uppercase border border-slate-200/60">
            {displayInitial}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col justify-between fixed inset-y-0 left-0 z-40 w-64 bg-white text-slate-700 border-r border-[#f1f5f9] p-6 md:static md:h-screen md:sticky md:top-0">
        <div className="flex flex-col gap-8">
          
          {/* Header Brand */}
          <div className="hidden md:flex items-center pb-6 border-b border-[#f1f5f9] w-full justify-start shrink-0">
            <Link href="/boutique" className="flex items-center hover:opacity-85 active:scale-[0.98] transition-all">
              <Image
                src="/logo-square.png?v=1"
                alt="Hive Partners"
                width={80}
                height={80}
                priority
                className="h-14 w-14 sm:h-16 sm:w-16 object-contain shrink-0 rounded-xl shadow-sm"
              />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center justify-between px-4.5 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    isActive 
                      ? "text-[#020617] font-bold bg-slate-50" 
                      : "text-[#94a3b8] hover:text-[#020617] hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer User Info & Logout */}
        <div className="flex flex-col gap-4 border-t border-[#f1f5f9] pt-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center text-slate-800 font-bold text-xs uppercase border border-[#f1f5f9]">
              {displayInitial}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-xs font-bold text-slate-800 truncate">
                {displayName}
              </span>
              <span className="text-[9px] text-[#020617] font-semibold tracking-wider uppercase">
                Partners Portal
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 border border-[#f1f5f9]/60 bg-white text-slate-600 hover:bg-white hover:text-[#020617] hover:border-[#020617]/40 rounded-xl text-xs font-bold shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-all duration-150 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Page Content Slot */}
      <main className="flex-1 overflow-x-hidden md:h-screen md:overflow-y-auto pb-20 md:pb-0">
        <PushNotificationManager
          boutiqueId={(myBoutiqueSafe as any)?.boutique?._id}
          userId={me?._id}
        />
        <div className="p-4 md:p-10 w-full">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Footer (With central gold floating Add button) */}
      {!pathname.includes("/products/new") && !pathname.includes("/products/edit") && (
        <nav className="md:hidden fixed bottom-4 inset-x-0 h-16 bg-white/95 backdrop-blur-md border border-slate-100/90 z-50 flex items-center justify-around px-2 shadow-[0_12px_36px_rgba(0,0,0,0.08)] rounded-2xl mx-4 pb-0 select-none">
          <Link 
            href="/boutique"
            className={`flex flex-col items-center justify-center w-full h-full pt-1 transition-all duration-150 relative ${
              pathname === "/boutique" ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Home</span>
            {pathname === "/boutique" && (
              <span className="w-1 h-1 rounded-full bg-[#E9B929] mt-0.5" />
            )}
          </Link>

          <Link 
            href="/boutique/products"
            className={`flex flex-col items-center justify-center w-full h-full pt-1 transition-all duration-150 relative ${
              pathname === "/boutique/products" && !pathname.includes("/new") ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            <Tag className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Products</span>
            {pathname === "/boutique/products" && !pathname.includes("/new") && (
              <span className="w-1 h-1 rounded-full bg-[#E9B929] mt-0.5" />
            )}
          </Link>

          <Link 
            href="/boutique/inventory"
            className={`flex flex-col items-center justify-center w-full h-full pt-1 transition-all duration-150 relative ${
              pathname === "/boutique/inventory" ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Stock</span>
            {pathname === "/boutique/inventory" && (
              <span className="w-1 h-1 rounded-full bg-[#E9B929] mt-0.5" />
            )}
          </Link>

          <div className="flex items-center justify-center w-full h-full relative">
            <Link 
              href="/boutique/products/new"
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all -translate-y-4 border-4 border-white cursor-pointer z-10 bg-gradient-to-tr from-[#E9B929] to-[#F5C22B] text-slate-900 shadow-[0_6px_20px_rgba(233,185,41,0.4)] active:scale-95 hover:shadow-[0_10px_24px_rgba(233,185,41,0.5)]"
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </Link>
          </div>

          <Link 
            href="/boutique/orders"
            className={`flex flex-col items-center justify-center w-full h-full pt-1 transition-all duration-150 relative ${
              pathname === "/boutique/orders" ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Orders</span>
            {pathname === "/boutique/orders" && (
              <span className="w-1 h-1 rounded-full bg-[#E9B929] mt-0.5" />
            )}
          </Link>

          <Link 
            href="/boutique/profile"
            className={`flex flex-col items-center justify-center w-full h-full pt-1 transition-all duration-150 relative ${
              pathname === "/boutique/profile" || pathname.includes("/reviews") || pathname.includes("/coupons") || pathname.includes("/finance") ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Account</span>
            {(pathname === "/boutique/profile" || pathname.includes("/reviews") || pathname.includes("/coupons") || pathname.includes("/finance")) && (
              <span className="w-1 h-1 rounded-full bg-[#E9B929] mt-0.5" />
            )}
          </Link>
        </nav>
      )}
    </div>
  );
}
