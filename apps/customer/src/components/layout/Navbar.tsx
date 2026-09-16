"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useLocation } from "@/context/LocationContext";
import { useCart } from "@/context/CartContext";
import { Badge, cn } from "@hive/ui";
import { HiveLogo } from "@/components/shared/HiveLogo";
import { PremiumShoppingBag } from "@/components/shared/PremiumShoppingBag";
import { SocialTooltip } from "@/components/shared/SocialTooltip";
import {
  MapPin,
  Search,
  List,
  Menu,
  X,
  Package,
  Home,
  Heart,
  Store,
  Phone,
  FileText,
  ChevronDown,
  ChevronRight,
  Zap,
  ArrowLeft,
  ArrowRight,
  Check,
  User,
  UserCheck,
  Tag,
  ShoppingBag,
  Timer,
  LogOut,
  ArrowUpRight,
  Compass,
  Flame,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/context/SessionContext";
import { useWishlistStore } from "@/store/wishlist-store";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getSignInUrl, getSignUpUrl, navigateToSignIn, navigateToSignUp } from "@/lib/auth-redirect";
import { getAnonSessionId } from "@/lib/anonSession";
import { toQueryCoords } from "@/lib/distance";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/safeStorage";
import { HeaderStatusPill } from "@/components/shared/HeaderStatusPill";

export const Navbar: React.FC = () => {
  const { locality, city, latitude, longitude, setDrawerOpen, isServiceable, updateLocationDetails } = useLocation();
  const { itemsCount, setSidebarOpen } = useCart();
  const wishlistCount = useWishlistStore((state) => state.items.length);
  const [hydrated, setHydrated] = useState(false);
  
  const deliveryPromise = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();

    // Operational boutique delivery hours (9:00 AM to 8:00 PM)
    if (currentHour >= 9 && currentHour < 20) {
      return {
        prefix: "Delivery",
        suffix: "90 MINS",
        isToday: true,
      };
    } else {
      return {
        prefix: "Next Slot",
        suffix: "Tomorrow 10:30 AM",
        isToday: false,
      };
    }
  }, []);

  const [redirectUrl, setRedirectUrl] = useState("/");
  useEffect(() => {
    setHydrated(true);
    if (typeof window !== "undefined") {
      setRedirectUrl(window.location.pathname);
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The drawer's body (editorial image, account hub, collections directory) is heavy — an
  // ~900KB image plus a dozen links — and was being fetched/prefetched on every page load even
  // though the drawer sits off-canvas and closed. Only mount it once the drawer has actually
  // been opened at least once.
  const [drawerContentLoaded, setDrawerContentLoaded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { user, isAuthenticated, logout, token } = useSessionStore();
  const router = useRouter();

  // Focus search input when overlay opens
  useEffect(() => {
    if (searchOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [searchOpen]);

  // Global Escape key listener to close overlay
  useEffect(() => {
    if (!searchOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);
  // Dynamic 2-second placeholder keywords loop
  const keywords = [
    'Search "Women\'s Fashion"',
    'Search "Kurtis & Sarees"',
    'Search "Men\'s Wear"',
    'Search "Kids Wear"',
    'Search "Bedsheets & Linen"',
    'Search "Handbags & Accessories"',
    'Search "Dresses & Co-ords"',
  ];
  // `keywords[0]` is string | undefined under noUncheckedIndexedAccess, which
  // would make the whole state optional and break the indexOf below.
  const [placeholderText, setPlaceholderText] = useState(keywords[0] ?? "");
  const [placeholderFade, setPlaceholderFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderFade(false);
      setTimeout(() => {
        setPlaceholderText((current) => {
          const nextIdx = (keywords.indexOf(current) + 1) % keywords.length;
          return keywords[nextIdx] ?? current;
        });
        setPlaceholderFade(true);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Static micro trust indicator strip is displayed below search input on desktop and mobile views.

  // Recent searches cache
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = safeGetItem("hive_recent_searches");
      if (stored) {
        try {
          setRecentSearches(JSON.parse(stored));
        } catch {}
      }
    }
  }, []);

  const searchProductsAction = useAction(api.products.searchProducts);
  const [searchResults, setSearchResults] = useState<{ query: string; products: any[]; totalMatchedCount: number } | null>(null);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3 || !searchOpen) {
      setSearchResults(null);
      return;
    }

    const delayDebounce = setTimeout(() => {
      // sessionId buckets the anonymous rate limit per browser. Without it every
      // signed-out shopper shares one counter, so unrelated traffic can lock
      // search for all of them. See lib/anonSession.ts.
      //
      // Coordinates are sent for the same reason /search sends them: these suggestions lead
      // straight to that page, and without them the type-ahead drew on the whole catalogue while
      // the results it linked to were filtered to what can actually be delivered.
      searchProductsAction({
        searchTerm: trimmed,
        sessionId: getAnonSessionId(),
        ...toQueryCoords(latitude, longitude),
      })
        .then((res) => {
          setSearchResults({ ...res, query: trimmed });
        })
        .catch((err) => {
          console.error("Suggestions failed:", err);
          setSearchResults({ query: trimmed, products: [], totalMatchedCount: 0 });
        });
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, searchOpen, searchProductsAction, latitude, longitude]);

  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const highlightMatch = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="font-semibold text-gray-900 dark:text-white font-sans">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Built only from what search actually returned, so every suggestion leads to products. A
  // hardcoded "trending" list used to offer searches like "Salwar Sets" with nothing behind them.
  const suggestions = useMemo(() => {
    const query = searchQuery.trim();
    // Results arrive after a debounce; ignore ones produced for an earlier query.
    if (!query || searchResults?.query !== query) return [];

    const categoryNames = searchResults.products
      .map((p: any) => p.categoryName)
      .filter((name: any) => typeof name === "string" && name && name !== "Uncategorized");
    const productNames = searchResults.products
      .map((p: any) => (typeof p.name === "string" ? p.name.trim() : ""))
      .filter(Boolean);

    return Array.from(new Set([...categoryNames, ...productNames])).slice(0, 8);
  }, [searchQuery, searchResults]);

  const SELLER_PORTAL_URL = process.env.NEXT_PUBLIC_SELLER_PORTAL_URL || "https://seller.hivenow.in";

  // Fetch boutique status
  const boutiqueSafe = useQuery(api.boutiques.getMyBoutiqueSafeCustomer, { token: token || undefined });
  const boutique = boutiqueSafe?.boutique;
  const isApprovedMerchant = boutique && boutique.status === "APPROVED";
  const isPendingMerchant = boutique && boutique.status === "PENDING";

  // Mount the drawer's heavy body content only once it's actually been opened
  useEffect(() => {
    if (mobileMenuOpen) setDrawerContentLoaded(true);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const savedAddresses = useQuery(api.addresses.list, { token: token || undefined }) ?? [];
  const categories = useQuery(api.categories.getCategories, { onlyActive: true }) ?? [];
  const subcategories = React.useMemo(() => {
    return categories.filter((c: any) => c.parentId && c.showOnHomepage);
  }, [categories]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const updated = [query, ...recentSearches.filter((s) => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      if (typeof window !== "undefined") {
        safeSetItem("hive_recent_searches", JSON.stringify(updated));
      }
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setMobileMenuOpen(false);
      setSearchOpen(false);
    }
  };

  const handleLocationClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setDrawerOpen(true);
    } else {
      setLocationDropdownOpen(!locationDropdownOpen);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-40 w-full bg-white/95 dark:bg-hive-dark/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2.5 sm:gap-4 w-full relative">
            {/* ── MOBILE TOP BAR (sm:hidden) ── */}
            {/*
              Three explicit tracks rather than an absolutely-centred logo.
              The logo used to be positioned against the viewport (absolute left-1/2), which left
              it unaware of the location pill beside it: measured on production it sat 20px on top
              of the pill at 375px and 48px at 320px, where it also collided with the icons on the
              other side. As a grid cell it cannot overlap either neighbour.
              The outer 1fr tracks are equal, so the logo is centred between the clusters and not
              merely against the viewport — the side weights differ (the pill is wider than the two
              icons), which is why viewport-centring read as off-centre even when nothing collided.
            */}
            <div className="grid sm:hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 w-full">
              {/* 1. Mobile Left: Location Pill */}
              <div className="flex items-center min-w-0">
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center min-h-11 min-w-0 max-w-full select-none cursor-pointer"
                  aria-label="Change location"
                >
                  {/*
                    The tap target is this button, which stays 44px tall; the chip below is only
                    the visible part. Drawing the border on the chip rather than the button lets
                    the pill read as small as the design wants without shrinking the target back
                    under the minimum.
                  */}
                  <span
                    className={`flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-neutral-900 border border-stone-200/90 dark:border-neutral-800 shadow-xs font-semibold transition-all min-w-0 max-w-full ${
                      hydrated && !(locality || city)
                        ? "animate-location-glow text-stone-600"
                        : "text-stone-800 dark:text-stone-100"
                    }`}
                  >
                    <MapPin className={`w-3 h-3 flex-shrink-0 shrink-0 ${hydrated && !(locality || city) ? "text-stone-400" : "text-hive-gold"}`} />
                    <span className="truncate font-semibold text-stone-800 dark:text-stone-100 text-[10px] min-[390px]:text-[11px]">
                      {hydrated && (locality || city) ? (locality || city) : "Set Location"}
                    </span>
                    <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />
                  </span>
                </button>
              </div>

              {/* 2. Mobile Center: hive.now Logo */}
              <div className="flex items-center justify-center">
                <Link href="/" className="hover:opacity-85 active:scale-95 transition-all flex items-center justify-center">
                  <Image
                    src="/hive-logo-gold-trimmed.png"
                    alt="hive.now"
                    width={139}
                    height={36}
                    priority
                    // Stepped so the mark takes only the width the side tracks can spare. Those
                    // tracks are equal — that is what centres it — so every pixel here costs the
                    // location pill half a pixel on each side. At full size below 360px the two
                    // 44px icons overlapped the logo by 10px, and up to 390px the pill lost
                    // enough width to truncate its own "Set Location" label.
                    className="h-4 min-[360px]:h-5 min-[390px]:h-6 w-auto object-contain"
                  />
                </Link>
              </div>

              {/* 3. Mobile Right: Cart & Hamburger Action Icons */}
              <div className="flex items-center gap-1 shrink-0 justify-self-end">
                {/* Cart bag */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="relative text-hive-dark hover:text-hive-gold hover:bg-stone-100/50 rounded-full transition-colors duration-150 outline-none flex items-center justify-center w-11 h-11"
                  aria-label="Open cart"
                >
                  <PremiumShoppingBag className="w-5 h-5" strokeWidth={1.8} />
                  {itemsCount > 0 && (
                    <Badge
                      variant="primary"
                      className="absolute top-1.5 right-1.5 scale-90 min-w-[16px] h-[16px] px-1 bg-hive-dark text-hive-gold border border-white rounded-full flex items-center justify-center text-[9px] font-bold"
                    >
                      {itemsCount}
                    </Badge>
                  )}
                </button>

                {/* Mobile hamburger */}
                <button
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="text-hive-dark hover:text-hive-gold hover:bg-stone-100/50 rounded-full transition-colors duration-150 outline-none flex items-center justify-center w-11 h-11"
                  aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  {mobileMenuOpen ? (
                    <X className="w-5 h-5 stroke-[1.75]" />
                  ) : (
                    <Menu className="w-5 h-5 stroke-[1.75]" />
                  )}
                </button>
              </div>
            </div>

            {/* ── DESKTOP TOP BAR (hidden sm:flex) ── */}
            {/* Zone 1 & 2: Logo + Desktop Location Pill */}
            <div className="hidden sm:flex items-center gap-3 lg:gap-4 shrink-0">
              <div className="flex-shrink-0 shrink-0 mr-1 lg:mr-2">
                <HiveLogo />
              </div>

              <div className="relative shrink min-w-0">
                <button
                  onClick={handleLocationClick}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-50 hover:bg-stone-100/80 border border-stone-200/60 text-[9px] sm:text-[10px] font-semibold transition-all duration-200 min-w-0 max-w-[170px] min-[400px]:max-w-[220px] sm:max-w-[280px] md:max-w-[340px] lg:max-w-[380px] select-none cursor-pointer shadow-none sm:shadow-sm ${
                    hydrated && !(locality || city)
                      ? "animate-location-glow text-stone-600"
                      : "text-stone-800"
                  }`}
                  aria-label="Change location"
                >
                  <MapPin className={`w-3.5 h-3.5 flex-shrink-0 shrink-0 ${hydrated && !(locality || city) ? "text-stone-400" : "text-hive-gold"}`} />
                  {hydrated && (locality || city) ? (
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-semibold text-stone-800 truncate">
                        <span className="hidden min-[400px]:inline">Delivering to </span>{locality || city}
                      </span>
                    </span>
                  ) : (
                    <span className={`truncate flex-1 font-semibold ${hydrated && !(locality || city) ? "text-stone-600" : "text-stone-800"}`}>
                      Set Location
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0 ml-0.5" />
                </button>

                {locationDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40 bg-transparent hidden sm:block" onClick={() => setLocationDropdownOpen(false)} />
                    <div className="absolute left-0 mt-2.5 w-64 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xl py-2 z-50 text-left font-sans animate-in fade-in slide-in-from-top-1 duration-150 hidden sm:block">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-neutral-800/60">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">Delivering To</span>
                      </div>
                      <button
                        onClick={() => {
                          setLocationDropdownOpen(false);
                          setDrawerOpen(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs text-hive-gold hover:bg-slate-50 dark:hover:bg-neutral-800/40 hover:text-hive-dark transition-all font-bold flex items-center gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Change Location</span>
                      </button>
                      {isAuthenticated && token && savedAddresses.length > 0 && (
                        <div className="border-t border-slate-100 dark:border-neutral-800/60 mt-1 pt-1">
                          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Saved Addresses
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {savedAddresses.map((addr: any) => (
                              <button
                                key={addr._id}
                                onClick={async () => {
                                  setLocationDropdownOpen(false);
                                  await updateLocationDetails({
                                    latitude: addr.lat,
                                    longitude: addr.lng,
                                    city: addr.city,
                                    state: addr.state,
                                    country: "India",
                                    postcode: addr.pincode,
                                  });
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-all text-xs font-semibold text-slate-700 dark:text-slate-300 flex flex-col gap-0.5"
                              >
                                <span className="font-bold text-slate-900 dark:text-white">{addr.label}</span>
                                <span className="truncate text-[10px] text-slate-500 dark:text-neutral-400">{addr.formattedAddress || `${addr.houseNumber ? addr.houseNumber + ', ' : ''}${addr.landmark ? addr.landmark + ', ' : ''}${addr.city}`}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Zone 3: Search bar (Desktop only) */}
            <div className="hidden sm:flex flex-grow flex-1 max-w-lg relative min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="group flex-1 h-11 px-4 rounded-full bg-white border border-hive-dark/15 hover:border-hive-dark/35 text-left flex items-center gap-2.5 cursor-pointer transition-all duration-200"
              >
                <Search className="w-4.5 h-4.5 text-hive-dark/60 flex-shrink-0" strokeWidth={2} />
                <span className="relative flex-1 h-5 overflow-hidden flex items-center">
                  <span
                    className={cn(
                      "absolute inset-0 truncate text-sm font-medium text-hive-text-muted flex items-center transition-all duration-300 ease-in-out transform",
                      placeholderFade ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1.5"
                    )}
                  >
                    {placeholderText}
                  </span>
                </span>
              </button>
              {hydrated && (locality || city) && (
                <HeaderStatusPill className="hover:bg-[#FFFDF9] dark:hover:bg-neutral-900/70 hover:shadow-[0_2px_8px_rgba(245,194,43,0.15)] cursor-default border-stone-200/80">
                  <Timer className="w-3.5 h-3.5 text-[#B78324] dark:text-amber-400 shrink-0" strokeWidth={2.2} />
                  <span className="text-[11px] tracking-wide font-sans flex items-center gap-1.5">
                    <span className="text-stone-500 dark:text-neutral-400 font-medium">
                      {deliveryPromise.prefix}
                    </span>
                    <span className="text-stone-300 dark:text-neutral-700 select-none">•</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md font-bold text-[10px] tracking-tight select-none",
                      deliveryPromise.isToday 
                        ? "bg-[#F5C22B] text-stone-950 shadow-[0_2px_8px_rgba(245,194,43,0.25)]" 
                        : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                    )}>
                      {deliveryPromise.suffix}
                    </span>
                  </span>
                </HeaderStatusPill>
              )}
            </div>

            {/* Zone 4: Action icons (Desktop only, hidden on mobile) */}
            <div className="hidden sm:flex items-center gap-3 sm:gap-4 flex-shrink-0">
              {/* My Orders */}
              <Link
                href="/orders"
                prefetch={false}
                className="hidden md:flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-hive-dark hover:text-hive-gold transition-colors duration-150"
              >
                <List className="w-4 h-4" />
                <span>My Orders</span>
              </Link>

              {/* Wishlist */}
              <Link
                href="/wishlist"
                prefetch={false}
                className="relative p-2 text-hive-dark hover:text-hive-gold transition-colors duration-150 outline-none"
                aria-label="Open wishlist"
              >
                <Heart className="w-5 h-5 stroke-[1.8]" />
                {hydrated && wishlistCount > 0 && (
                  <Badge
                    variant="primary"
                    className="absolute top-0 right-0 scale-90 min-w-5 h-5 flex items-center justify-center font-bold px-1.5 bg-hive-dark text-hive-gold border border-white rounded-full"
                  >
                    {wishlistCount}
                  </Badge>
                )}
              </Link>

              {/* Cart bag */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="relative p-2 text-hive-dark hover:text-hive-gold transition-colors duration-150 outline-none"
                aria-label="Open cart"
              >
                <PremiumShoppingBag className="w-5 h-5" strokeWidth={1.8} />
                {itemsCount > 0 && (
                  <Badge
                    variant="primary"
                    className="absolute top-0 right-0 scale-90 min-w-5 h-5 flex items-center justify-center font-bold px-1.5 bg-hive-dark text-hive-gold border border-white rounded-full"
                  >
                    {itemsCount}
                  </Badge>
                )}
              </button>

              {/* Auth Zone */}
              <div className="flex items-center border-l border-slate-200 pl-3 sm:pl-4 relative">
                {!hydrated ? (
                  <div className="h-10 w-24 bg-slate-50 animate-pulse rounded-xl" />
                ) : isAuthenticated && user ? (
                  <div>
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-8 h-8 rounded-full bg-hive-comb/60 border border-hive-border/60 hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center justify-center font-bold text-xs text-hive-dark select-none cursor-pointer"
                    >
                      {user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : "U")}
                    </button>
                    
                    {dropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setDropdownOpen(false)} />
                        <div className="absolute right-0 mt-2.5 w-48 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xl py-2 z-50 text-left font-sans animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="px-4 py-2 border-b border-slate-100 dark:border-neutral-800/60">
                            <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                              {user.name || "User"}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">
                              {user.email || ""}
                            </p>
                          </div>
                          <Link
                            href="/account"
                            onClick={() => setDropdownOpen(false)}
                            className="block px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-800/40 hover:text-hive-gold transition-all"
                          >
                            My Profile
                          </Link>
                          <Link
                            href="/orders"
                            onClick={() => setDropdownOpen(false)}
                            className="block px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-800/40 hover:text-hive-gold transition-all"
                          >
                            My Orders
                          </Link>
                          {isApprovedMerchant ? (
                            <a
                              href={SELLER_PORTAL_URL}
                              onClick={() => setDropdownOpen(false)}
                              className="block px-4 py-2 text-xs font-semibold text-hive-gold hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-all"
                            >
                              Manage Boutique
                            </a>
                          ) : isPendingMerchant ? (
                            <Link
                              href="/become-seller"
                              onClick={() => setDropdownOpen(false)}
                              className="block px-4 py-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-all italic"
                            >
                              Application Under Review
                            </Link>
                          ) : (
                            <Link
                              href="/become-seller"
                              onClick={() => setDropdownOpen(false)}
                              className="block px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-800/40 hover:text-hive-gold transition-all font-semibold"
                            >
                              Sell on Hive
                            </Link>
                          )}
                          <button
                            onClick={async () => {
                              setDropdownOpen(false);
                              await logout();
                              router.push("/");
                            }}
                            className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all font-semibold cursor-pointer border-t border-slate-100 dark:border-neutral-800/60 mt-1"
                          >
                            Log Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => navigateToSignIn(router)}
                        className="h-10 px-5 rounded-xl border border-slate-200 text-xs font-medium text-hive-dark hover:bg-slate-50 transition-colors duration-200 cursor-pointer shadow-sm"
                      >
                        Sign In
                      </button>
                      <button 
                        onClick={() => navigateToSignUp(router)}
                        className="h-10 px-5 rounded-xl bg-[#111111] text-white hover:bg-neutral-800 text-xs font-medium active:scale-[0.98] transition-all duration-200 shadow-sm cursor-pointer"
                      >
                        Create Account
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

      </nav>

      {/* ── Mobile Search Bar (Non-sticky, scrolls away on Mobile) ── */}
      <div className="w-full bg-white dark:bg-hive-dark border-b border-slate-200/80 sm:hidden flex flex-col gap-2 px-4 py-2">
        <div className="w-full flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex-1 h-10 px-3.5 rounded-full bg-white border border-hive-dark/15 active:border-hive-dark/35 text-left flex items-center gap-2 cursor-pointer transition-all duration-200"
          >
            <Search className="w-4 h-4 text-hive-dark/60 flex-shrink-0" strokeWidth={2} />
            <span className="relative flex-1 h-5 overflow-hidden flex items-center">
              <span
                className={cn(
                  "absolute inset-0 truncate text-sm font-medium text-hive-text-muted flex items-center transition-all duration-300 ease-in-out transform",
                  placeholderFade ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1.5"
                )}
              >
                {placeholderText}
              </span>
            </span>
          </button>
          {hydrated && (locality || city) && (
            <HeaderStatusPill className="px-3 cursor-default border-stone-200/80">
              <Timer className="w-3.5 h-3.5 text-[#B78324] dark:text-amber-400 shrink-0" strokeWidth={2.2} />
              <span className="text-[10px] tracking-wide font-sans flex items-center gap-1.5">
                <span className="text-stone-500 dark:text-neutral-400 font-medium">
                  {deliveryPromise.prefix}
                </span>
                <span className="text-stone-300 dark:text-neutral-700 select-none">•</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-md font-bold text-[9.5px] tracking-tight select-none",
                  deliveryPromise.isToday 
                    ? "bg-[#F5C22B] text-stone-950 shadow-[0_2px_8px_rgba(245,194,43,0.25)]" 
                    : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                )}>
                  {deliveryPromise.suffix}
                </span>
              </span>
            </HeaderStatusPill>
          )}
        </div>

      </div>

      {/* ── Mobile drawer backdrop ──────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[48] bg-black/60 backdrop-blur-[4px] transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer — Mini Fashion Magazine ───────────────────── */}
      <div
        className={`md:hidden fixed inset-y-0 right-0 z-[49] w-[88vw] max-w-[360px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] border-l border-stone-200/70 select-none ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Dedicated Drawer Header ─────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-stone-200/60 flex-shrink-0 gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-200 text-stone-950 font-serif font-bold text-sm flex items-center justify-center shadow-xs shrink-0 ring-2 ring-amber-400/20">
                {(user.name?.[0] || "U").toUpperCase()}
              </div>
              <div className="flex flex-col text-left truncate">
                <span className="text-sm font-serif font-bold text-stone-900 truncate leading-tight">
                  Hi, {user.name?.split(" ")[0] || "Member"}
                </span>
                <span className="text-[11px] text-stone-500 font-medium flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                  <span className="truncate">{hydrated && (locality || city) ? locality || city : "Kochi"}</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <HiveLogo />
              {hydrated && (locality || city) && (
                <span className="text-[10px] text-stone-600 font-bold flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200/60">
                  <MapPin className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span className="truncate">{locality || city}</span>
                </span>
              )}
            </div>
          )}
          
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="w-8.5 h-8.5 rounded-full bg-stone-100 hover:bg-stone-200/80 active:scale-95 flex items-center justify-center text-stone-600 hover:text-stone-900 transition-all flex-shrink-0 cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable Body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 text-left">
          {drawerContentLoaded && (
          <>
          {/* ── Core Fashion Categories ─────────────────────────────── */}
          <div className="space-y-1">
            <Link
              href="/search?q=kurti"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-stone-50 active:bg-amber-50/50 transition-colors group"
            >
              <span className="text-[13.5px] font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                Kurtis & Suits
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/search?q=saree"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-stone-50 active:bg-amber-50/50 transition-colors group"
            >
              <span className="text-[13.5px] font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                Sarees & Ethnic
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/search?q=dress"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-stone-50 active:bg-amber-50/50 transition-colors group"
            >
              <span className="text-[13.5px] font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                Dresses & Co-ords
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/search?q=top"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-stone-50 active:bg-amber-50/50 transition-colors group"
            >
              <span className="text-[13.5px] font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                Tops & Tunics
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          <div className="border-t border-stone-200/70 my-2" />

          {/* ── Utility & Support Links ─────────────────────────────── */}
          <div className="space-y-1">
            <a
              href="https://wa.me/917356019103?text=Hi%20Hive%20Team%2C%20I%20need%20some%20help%20with%20my%20order%2Fstyling."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-stone-50 text-stone-700 hover:text-stone-950 transition-colors group"
            >
              <span className="text-xs font-semibold">Contact Us</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
            </a>

            {isApprovedMerchant ? (
              <a
                href={SELLER_PORTAL_URL}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-stone-50 text-stone-700 hover:text-stone-950 transition-colors group"
              >
                <span className="text-xs font-semibold">Merchant Portal</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-600 transition-colors" />
              </a>
            ) : isPendingMerchant ? (
              <Link
                href="/become-seller"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-stone-50 text-stone-700 hover:text-stone-950 transition-colors group"
              >
                <span className="text-xs font-semibold">Seller Application (Pending)</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-600" />
              </Link>
            ) : (
              <Link
                href="/become-seller"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-stone-50 text-stone-700 hover:text-stone-950 transition-colors group"
              >
                <span className="text-xs font-semibold">Sell on Hive</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
              </Link>
            )}
          </div>

          {/* ── Socials Strip (Hive Gold & Charcoal) ─────────────────── */}
          <div className="pt-2 flex justify-center">
            <SocialTooltip variant="light" />
          </div>

          {/* ── Legal Policy Links ──────────────────────────────────── */}
          <div className="pt-1 pb-1 text-center">
            <div className="flex items-center justify-center gap-2.5 text-[10.5px] text-stone-500 font-medium">
              <Link href="/legal/return-policy" onClick={() => setMobileMenuOpen(false)} className="hover:text-stone-900 transition-colors">
                Returns
              </Link>
              <span className="text-stone-300 select-none">•</span>
              <Link href="/legal/privacy-policy" onClick={() => setMobileMenuOpen(false)} className="hover:text-stone-900 transition-colors">
                Privacy
              </Link>
              <span className="text-stone-300 select-none">•</span>
              <Link href="/legal/terms-and-conditions" onClick={() => setMobileMenuOpen(false)} className="hover:text-stone-900 transition-colors">
                Terms
              </Link>
            </div>
          </div>
          </>
          )}
        </div>

        {/* ── Drawer Base: Auth Actions ───────────────────────────── */}
        <div className="flex-shrink-0 border-t border-stone-200/70 p-4 pb-[calc(1rem+max(0.25rem,env(safe-area-inset-bottom)))] bg-white select-none">
          {isAuthenticated && user ? (
            <button
              onClick={async () => {
                setMobileMenuOpen(false);
                await logout();
                router.push("/");
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-stone-400 group-hover:text-red-500" />
              <span>Sign Out</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={getSignInUrl(redirectUrl)}
                prefetch={false}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-xl border border-stone-300 text-xs font-bold text-stone-800 text-center hover:bg-stone-50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href={getSignUpUrl(redirectUrl)}
                prefetch={false}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold text-center shadow-xs transition-colors"
              >
                Join Hive
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Full-Screen Search Overlay ────────────────────────────────── */}
      {searchOpen && (
        <div className="absolute top-0 left-0 w-full min-h-screen bg-[#FCFAF7] dark:bg-neutral-950 z-50 flex flex-col animate-search-overlay-in font-sans pb-[64px] text-left">
          {/* Header row */}
          <div className="flex items-center h-16 border-b border-stone-200/80 dark:border-neutral-800/60 px-4 gap-2 bg-white dark:bg-neutral-950 flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 hover:bg-stone-100 dark:hover:bg-neutral-900 rounded-full transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            {/* Two submit paths on purpose. Android soft keyboards often report the Go key as
                key "" / keyCode 229, so an Enter keydown check alone does nothing on phones —
                the form's implicit submission covers that. Some environments dispatch a real
                "Enter" keydown without triggering implicit submission, so keydown handles that.
                handleSearchSubmit calls preventDefault on the keydown, which stops the form
                from submitting a second time. */}
            <form role="search" onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center">
              <Search className="w-4 h-4 text-hive-dark/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                enterKeyHint="search"
                placeholder="Search collections, fabrics, styles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // isComposing: Malayalam/Hindi IME keyboards use Enter to confirm a word.
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    handleSearchSubmit(e);
                  } else if (e.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                className="w-full h-11 pl-10 pr-10 rounded-full bg-white dark:bg-neutral-900 border border-hive-dark/15 dark:border-neutral-800 focus:outline-none focus:ring-0 focus:border-hive-dark/40 text-sm font-medium text-stone-900 dark:text-white placeholder-hive-text-muted transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 p-1 rounded-full hover:bg-stone-200 dark:hover:bg-neutral-800 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>

          {/* Content area */}
          {!searchQuery.trim() ? (
            <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-7 pb-24">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="flex flex-col gap-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecentSearches([]);
                        if (typeof window !== "undefined") {
                          safeRemoveItem("hive_recent_searches");
                        }
                      }}
                      className="text-[10px] text-stone-400 hover:text-stone-600 font-semibold underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((recent) => (
                      <button
                        key={recent}
                        type="button"
                        onClick={() => {
                          setSearchQuery(recent);
                          router.push(`/search?q=${encodeURIComponent(recent)}`);
                          setSearchOpen(false);
                        }}
                        className="px-3.5 py-1.5 bg-white dark:bg-neutral-900 border border-stone-200 dark:border-neutral-800 rounded-full text-xs font-semibold text-stone-700 dark:text-stone-300 hover:border-stone-900 hover:text-stone-900 dark:hover:text-white transition-all cursor-pointer shadow-2xs"
                      >
                        {recent}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Searches */}
              <div className="flex flex-col gap-3 text-left">
                <span className="text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                  Trending Searches
                </span>
                <div className="flex flex-wrap gap-2">
                  {["Sarees", "Kurtis", "Men's Wear", "Kids Wear", "Bedsheets", "Handbags", "Dresses", "Co-ords"].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setSearchQuery(chip);
                        const updated = [chip, ...recentSearches.filter((s) => s !== chip)].slice(0, 5);
                        setRecentSearches(updated);
                        if (typeof window !== "undefined") {
                          safeSetItem("hive_recent_searches", JSON.stringify(updated));
                        }
                        router.push(`/search?q=${encodeURIComponent(chip)}`);
                        setSearchOpen(false);
                      }}
                      className="px-3.5 py-2 bg-white dark:bg-neutral-900 border border-stone-200/80 dark:border-neutral-800 rounded-2xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:border-amber-500 hover:text-amber-600 transition-all cursor-pointer shadow-2xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shop by Category */}
              {subcategories.length > 0 && (
                <div className="flex flex-col gap-3 text-left">
                  <span className="text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                    Curated Categories
                  </span>
                  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none pl-1">
                    {subcategories.map((subcat: any) => (
                      <button
                        key={subcat._id}
                        type="button"
                        onClick={() => {
                          router.push(`/products/${encodeURIComponent(subcat.slug)}`);
                          setSearchOpen(false);
                        }}
                        className="flex flex-col items-center gap-2 flex-shrink-0 group cursor-pointer"
                      >
                        <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 shadow-2xs group-hover:scale-105 transition-transform duration-200">
                          <img
                            src={subcat.homepageImageUrl || subcat.imageUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80"}
                            alt={subcat.name}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        </div>
                        <span className="text-[10px] font-bold text-stone-700 dark:text-neutral-300 text-center truncate max-w-[76px]">
                          {subcat.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-grow overflow-y-auto p-4 space-y-1 pb-20">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setSearchQuery(suggestion);
                    const updated = [suggestion, ...recentSearches.filter((s) => s !== suggestion)].slice(0, 5);
                    setRecentSearches(updated);
                    if (typeof window !== "undefined") {
                      safeSetItem("hive_recent_searches", JSON.stringify(updated));
                    }
                    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                    setSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between py-3 border-b border-gray-100 dark:border-neutral-800/60 text-left text-slate-700 dark:text-slate-300 hover:text-hive-gold transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-normal">
                      {highlightMatch(suggestion, searchQuery)}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                </button>
              ))}

              {suggestions.length === 0 && (
                <div className="flex flex-col gap-6 py-3">
                  {/* Direct 1-tap search for what they typed */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5);
                      setRecentSearches(updated);
                      if (typeof window !== "undefined") {
                        safeSetItem("hive_recent_searches", JSON.stringify(updated));
                      }
                      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
                      setSearchOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-left hover:border-amber-500 transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-3">
                      <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-stone-900 dark:text-white">
                        Search for <strong className="font-bold">&ldquo;{searchQuery}&rdquo;</strong>
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900 dark:group-hover:text-white transition-colors" />
                  </button>

                  {/* Related Trending Styles */}
                  <div className="flex flex-col gap-2.5 text-left">
                    <span className="text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                      Related Styles
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {["Sarees", "Kurtis", "Lehengas", "Co-ords", "Festive Wear", "Party Dresses", "Handlooms"].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            const updated = [chip, ...recentSearches.filter((s) => s !== chip)].slice(0, 5);
                            setRecentSearches(updated);
                            if (typeof window !== "undefined") {
                              safeSetItem("hive_recent_searches", JSON.stringify(updated));
                            }
                            router.push(`/search?q=${encodeURIComponent(chip)}`);
                            setSearchOpen(false);
                          }}
                          className="px-3.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-full text-xs font-semibold text-stone-700 dark:text-stone-300 hover:border-amber-500 hover:text-amber-600 transition-all cursor-pointer shadow-2xs"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Curated Categories */}
                  {subcategories.length > 0 && (
                    <div className="flex flex-col gap-2.5 text-left pt-1">
                      <span className="text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                        Browse Categories
                      </span>
                      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none pl-0.5">
                        {subcategories.slice(0, 6).map((subcat: any) => (
                          <button
                            key={subcat._id}
                            type="button"
                            onClick={() => {
                              router.push(`/products/${encodeURIComponent(subcat.slug)}`);
                              setSearchOpen(false);
                            }}
                            className="flex flex-col items-center gap-1.5 flex-shrink-0 group cursor-pointer"
                          >
                            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 shadow-2xs group-hover:scale-105 transition-transform duration-200">
                              <img
                                src={subcat.homepageImageUrl || subcat.imageUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80"}
                                alt={subcat.name}
                                className="w-full h-full object-cover pointer-events-none"
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-stone-700 dark:text-neutral-300 text-center truncate max-w-[64px]">
                              {subcat.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <style>{`
            @keyframes searchOverlayIn {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .animate-search-overlay-in {
              animation: searchOverlayIn 0.2s ease-out forwards;
            }
            /* Ensure mobile bottom nav sits above the search overlay */
            div.fixed.bottom-0.inset-x-0.z-40 {
              z-index: 60 !important;
            }
          `}</style>
        </div>
      )}
    </>
  );
};