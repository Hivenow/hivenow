"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { navigateToSignIn } from "@/lib/auth-redirect";
import { PremiumShoppingBag } from "@/components/shared/PremiumShoppingBag";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  Phone,
  Ticket,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Loader2
} from "lucide-react";
import BeeLoader from "@/components/shared/BeeLoader";
import { useCartStore } from "@/store/cart-store";
import { useCheckoutStore } from "@/store/checkout-store";
import { useOrderStore } from "@/store/order-store";
import { useQuery, useMutation, useAction, useConvex } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useConvexMutation } from "@/hooks/useConvexMutation";
import { getEffectiveCheckoutItems } from "@/lib/getEffectiveCheckoutItems";
import { useSessionStore } from "@/context/SessionContext";
import { CustomerPriceBreakdown } from "@/components/checkout/CustomerPriceBreakdown";
import { GstAndOtherChargesRow } from "@/components/checkout/GstAndOtherChargesRow";
import { SwipeToPayButton } from "@/components/checkout/SwipeToPayButton";
import { AppliedCouponCard } from "@/components/checkout/AppliedCouponCard";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { formatRupees, toast } from "@hive/utils";
import { getCustomerErrorMessage, getCustomerErrorCode } from "@/lib/customerErrors";

// ── Payment Method Labels ────────────────────────────────────────────────────
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "EMI",
};

// ── Razorpay Script Loader ──────────────────────────────────────────────────
function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ── Analytics Event Tracker ────────────────────────────────────────────────
function trackCheckoutEvent(
  event: "checkout_started" | "checkout_abandoned" | "payment_failed" | "payment_success",
  metadata?: Record<string, any>
) {
  console.log(`[Analytics] Track Event: ${event}`, metadata);
  if (typeof window === "undefined") return;

  const customEvent = new CustomEvent("hive_analytics", { detail: { event, metadata } });
  window.dispatchEvent(customEvent);

  if ((window as any).gtag) {
    (window as any).gtag("event", event, metadata);
  }
  if ((window as any).fbq) {
    (window as any).fbq("trackCustom", event, metadata);
  }
}

export default function OrderReviewPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: sessionLoading, token, user } = useSessionStore();

  // Zustand stores
  const storedAddressId = useCheckoutStore((state) => state.selectedAddressId);
  const selectedDate = useCheckoutStore((state) => state.selectedDate);
  const selectedSlot = useCheckoutStore((state) => state.selectedSlot);
  const appliedPromo = useCheckoutStore((state) => state.appliedPromo);
  const promoCouponId = useCheckoutStore((state) => state.promoCouponId);
  const promoCouponDiscountPaise = useCheckoutStore((state) => state.promoCouponDiscountPaise);
  const rawDiscountAmount = useCheckoutStore((state) => state.discountAmount);
  const deliveryInstructions = useCheckoutStore((state) => state.deliveryInstructions);
  const checkoutItems = useCheckoutStore((state) => state.checkoutItems);

  const setDeliverySelection = useCheckoutStore((state) => state.setDeliverySelection);
  const setAppliedPromo = useCheckoutStore((state) => state.setAppliedPromo);
  const setDeliveryInstructions = useCheckoutStore((state) => state.setDeliveryInstructions);
  const clearCheckout = useCheckoutStore((state) => state.clearCheckout);

  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const placeOrder = useOrderStore((state) => state.placeOrder);
  const latestOrder = useOrderStore((state) => state.latestOrder);

  // Convex
  const convexAddresses = useQuery(api.addresses.list, { token: token || undefined }) ?? [];
  const cartData = useQuery(api.cart.getCart, { token: token || undefined });
  const currentUser = user;
  const lastUsedPaymentMethod = useQuery(api.payments.getLastUsedPaymentMethod, { token: token || undefined });
  // Defaults to remembering the last method; "Change" drops it so Razorpay opens its full picker instead of jumping straight to one tab.
  const [useRememberedMethod, setUseRememberedMethod] = useState(true);
  const createCheckoutSession = useAction(api.payments.createCheckoutSession);
  const placeCouponFundedOrder = useConvexMutation(api.payments.placeCouponFundedOrder);
  const convex = useConvex();
  // Exchange credit is tracked separately from promo codes: a promo reduces the
  // order's value, a coupon only reduces what the customer is charged.
  const [appliedCoupon, setAppliedCoupon] = React.useState<{ code: string; amountPaise: number } | null>(null);
  const verifyPaymentAndPlaceOrder = useConvexMutation(api.payments.verifyPaymentAndPlaceOrder);
  const clearCartMutation = useMutation(api.cart.clearCart).withOptimisticUpdate((localStore, args) => {
    const tokenQueryArg = { token: token || undefined };
    const cart = localStore.getQuery(api.cart.getCart, tokenQueryArg);
    if (cart) {
      localStore.setQuery(
        api.cart.getCart,
        tokenQueryArg,
        {
          items: [],
          hasIssues: false,
          blockingReason: undefined,
        }
      );
    }
  });

  // States
  const [mounted, setMounted] = useState(false);
  const [stockSyncedMessage, setStockSyncedMessage] = useState<string | null>(null);
  
  const updateAvailableStock = useCartStore((state) => state.updateAvailableStock);

  useEffect(() => {
    if (cartData && cartData.items && checkoutItems.length === 0) {
      let changed = false;
      cartData.items.forEach((backendItem: any) => {
        const localItem = items.find(
          (i) => i.productId === backendItem.productId && i.size === backendItem.size
        );
        if (localItem && backendItem.availableStock !== undefined) {
          if (localItem.quantity > backendItem.availableStock) {
            updateAvailableStock(localItem.productId, localItem.size, backendItem.availableStock);
            changed = true;
          } else if (localItem.availableStock !== backendItem.availableStock) {
            updateAvailableStock(localItem.productId, localItem.size, backendItem.availableStock);
          }
        }
      });
      if (changed) {
        setStockSyncedMessage("Some items in your bag have been updated due to stock changes.");
        setTimeout(() => setStockSyncedMessage(null), 10000);
      }
    }
  }, [cartData, items, checkoutItems, updateAvailableStock]);

  const [isPriceExpanded, setIsPriceExpanded] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccessMsg, setPromoSuccessMsg] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [scriptLoadError, setScriptLoadError] = useState(false);

  const isOrderPlacing = useRef(false);

  // Map Convex Address structure to display attributes
  const addresses = convexAddresses.map((a) => ({
    id: a._id,
    name: a.label,
    phone: a.phone || "—",
    addressLine1: a.formattedAddress || a.line1 || "",
    addressLine2: a.line2 || a.landmark || "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
    lat: a.lat,
    lng: a.lng,
  }));

  const selectedAddressId = storedAddressId || (addresses.find((a) => a.isDefault)?.id || addresses[0]?.id || null);
  const selectedAddress = addresses.find((addr) => addr.id === selectedAddressId) || null;

  const orderItems = getEffectiveCheckoutItems(items, checkoutItems);
  // Cart and Buy Now items are stored in rupees (see lib/legacyCartPrices.ts).
  const rawSubtotal = orderItems.reduce((total, item) => total + item.price * item.quantity, 0);

  const itemsForPricing = useMemo(() => {
    return orderItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      size: item.size,
    }));
  }, [orderItems]);

  let boutiqueId = orderItems?.[0]?.boutiqueId;
  if (!boutiqueId && cartData?.items) {
    const firstItem = orderItems?.[0];
    if (firstItem) {
      const match = cartData.items.find((ci: any) => ci.productId === firstItem.productId);
      if (match) boutiqueId = match.boutiqueId;
    }
  }

  // Delivery Quote Query
  const skipQuote = !selectedAddress || selectedAddress.lat === undefined || selectedAddress.lng === undefined || !boutiqueId;
  const getDeliveryQuoteAction = useAction(api.routing.getDeliveryQuoteAction);
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  
  const [quoteId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)));

  const rawDeliveryFee = (deliveryQuote && deliveryQuote.serviceable && typeof deliveryQuote.customerPaidFee === "number")
    ? deliveryQuote.customerPaidFee / 100
    : undefined;

  const backendPricing = useQuery(
    api.payments.getCheckoutPricing,
    orderItems.length > 0
      ? {
          items: itemsForPricing,
          deliveryFee: rawDeliveryFee,
          promoCode: appliedPromo || undefined,
          promoCouponId: promoCouponId ? (promoCouponId as Id<"promoCoupons">) : undefined,
        }
      : "skip"
  );

  const subtotal = backendPricing?.subtotalRupees ?? rawSubtotal;
  const deliveryFee = backendPricing?.deliveryFeeRupees ?? (rawSubtotal >= 10000 ? 0 : 99);
  // Promo coupon discount from checkout store (server-validated), or backend pricing
  const discountAmount = backendPricing?.discountRupees || (promoCouponDiscountPaise > 0 ? promoCouponDiscountPaise / 100 : 0);
  // v2: separate platform charges
  const handlingCharge = backendPricing?.handlingChargeRupees ?? 0;
  const platformFee = backendPricing?.platformFeeRupees ?? 0;
  const gstOnCharges = backendPricing?.gstOnChargesRupees ?? (backendPricing?.gstRupees ?? 0);
  const total = backendPricing?.totalRupees ?? Math.max(0, subtotal - discountAmount + deliveryFee);

  useEffect(() => {
    let active = true;
    if (skipQuote) {
      setDeliveryQuote(null);
      return;
    }
    
    setIsQuoteLoading(true);
    getDeliveryQuoteAction({
      userLat: Number(selectedAddress.lat),
      userLng: Number(selectedAddress.lng),
      userPincode: selectedAddress.pincode,
      boutiqueId: boutiqueId as any,
      subtotal: subtotal,
      quoteId,
    }).then((quote) => {
      if (active) {
        setDeliveryQuote(quote);
        setIsQuoteLoading(false);
      }
    }).catch((err) => {
      if (active) {
        console.error("Failed to fetch quote", err);
        setIsQuoteLoading(false);
      }
    });

    return () => { active = false; };
  }, [selectedAddress?.id, selectedAddress?.lat, selectedAddress?.lng, selectedAddress?.pincode, boutiqueId, subtotal, skipQuote, getDeliveryQuoteAction, quoteId]);

  // Hydration checker
  useEffect(() => {
    setMounted(true);
  }, []);

  // Bypass delivery preference screen and default slot values
  useEffect(() => {
    if (mounted) {
      const istHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
      const isAfter10PM = istHour >= 22; // 10 PM IST
      if (isAfter10PM) {
        setDeliverySelection("Next Day", "Next-Day", "Next-Day Delivery");
      } else {
        setDeliverySelection("Same Day", "Same-Day", "Same-Day Delivery");
      }
    }
  }, [mounted, setDeliverySelection]);

  // Auth & Address guard
  useEffect(() => {
    if (mounted && !sessionLoading) {
      if (!isAuthenticated) {
        navigateToSignIn(router, "/checkout/review");
      } else if (!storedAddressId && convexAddresses.length > 0) {
        // Wait till addresses load before deciding to redirect
        const defaultId = convexAddresses.find((a) => a.isDefault)?._id || convexAddresses[0]?._id;
        if (!defaultId) {
          router.replace("/checkout/address");
        }
      }
    }
  }, [mounted, sessionLoading, isAuthenticated, storedAddressId, convexAddresses, router]);

  if (!mounted || sessionLoading) {
    return <OrderReviewSkeleton />;
  }

  if (!isAuthenticated) {
    return <OrderReviewSkeleton />;
  }

  // Promo handling
  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);
    setPromoSuccessMsg(null);
    const code = promoInput.trim().toUpperCase();

    if (!code) return;

    // Exchange coupons are validated on the server: only it knows who the
    // credit belongs to, which boutique it is scoped to, and whether it is
    // still unspent.
    if (code.startsWith("HIVE-")) {
      try {
        const boutiqueIds = Array.from(
          new Set(items.map((i: any) => i.boutiqueId).filter(Boolean))
        );
        const result: any = await convex.query(api.coupons.validateCouponCode, {
          code,
          boutiqueIds,
          cartTotalPaise: Math.round(total * 100),
          token: token || undefined,
        });

        if (!result?.valid) {
          setPromoError(result?.message || "That coupon code isn't valid.");
          return;
        }

        setAppliedCoupon({ code, amountPaise: result.amountPaise });
        setPromoSuccessMsg(
          `${code} applied: ₹${(result.amountPaise / 100).toLocaleString("en-IN")} credit.`
        );
        setPromoInput("");
      } catch (err: any) {
        setPromoError(err?.message || "Couldn't check that coupon. Try again.");
      }
      return;
    }

    // Server-validate promo coupons from the promoCoupons table
    setPromoValidating(true);
    try {
      const boutiqueIds = Array.from(
        new Set(items.map((i: any) => i.boutiqueId).filter(Boolean))
      );
      const result: any = await convex.query(api.promoCoupons.validatePromoCode, {
        code,
        boutiqueIds,
        cartTotalPaise: Math.round(subtotal * 100),
        token: token || undefined,
      });

      if (!result?.valid) {
        setPromoError(result?.message || "That coupon code isn't valid.");
        return;
      }

      const discountRupees = result.discountPaise / 100;
      setAppliedPromo(code, discountRupees, result.promoCouponId, result.discountPaise);
      setPromoInput("");
    } catch (err: any) {
      setPromoError(err?.message || "Couldn't validate that code. Try again.");
    } finally {
      setPromoValidating(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedCoupon(null);
    setAppliedPromo(null, 0, null, 0);
    setPromoSuccessMsg(null);
    setPromoError(null);
  };

  // Payment Handler
  const handlePay = async () => {
    if (isPlacingOrder || isOrderPlacing.current) return;
    if (!selectedAddress) {
      toast.error("Please select a delivery address first.");
      return;
    }

    setPaymentError(null);

    if (!deliveryQuote?.serviceable) {
      toast.error("We don't deliver to this pincode yet. Please select a different address.");
      return;
    }
    
    if (deliveryQuote.quotedAt && Date.now() - deliveryQuote.quotedAt > 15 * 60 * 1000) {
      toast.error("Delivery rate expired (valid for 15 mins). Please refresh the page to get a new rate.");
      return;
    }

    isOrderPlacing.current = true;
    setIsPlacingOrder(true);

    trackCheckoutEvent("checkout_started", {
      subtotal,
      deliveryFee,
      total,
      itemCount: orderItems.length,
    });

    // Sync cart details using cartData to resolve real product IDs
    const convexCartMap = new Map(
      (cartData?.items ?? []).map((ci: any) => [`${ci.productId}|${ci.size}`, ci])
    );

    const snapshotItems = orderItems.map((item) => {
      const convexMatch =
        convexCartMap.get(`${item.productId}|${item.size}`) ??
        (cartData?.items ?? []).find((ci: any) => ci.name === item.name && ci.size === item.size);

      const resolvedProductId = item.productId || convexMatch?.productId || "";

      return {
        productId: resolvedProductId,
        name: item.name,
        price: item.price, // already in rupees
        imageUrl: item.imageUrl || "",
        boutiqueName: item.boutiqueName,
        size: item.size,
        quantity: item.quantity,
        reservationId: item.reservationId,
      };
    });

    const invalid = snapshotItems.filter((i) => !i.productId);
    if (invalid.length > 0) {
      toast.error(`Cannot place order: ${invalid.length} item(s) are missing a product ID. Please try again.`);
      setIsPlacingOrder(false);
      isOrderPlacing.current = false;
      return;
    }

    const istHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
    const isAfter10PM = istHour >= 22; // 10 PM IST
    const resolvedDeliveryDate = isAfter10PM ? "Next Day" : "Same Day";
    const resolvedDeliverySlot = isAfter10PM ? "Next-Day" : "Same-Day";

    try {
      // 1. Create Checkout Session (Backend expects all values in rupees)
      const sessionResult = await createCheckoutSession({
        addressId: selectedAddress.id as Id<"addresses">,
        deliveryDate: resolvedDeliveryDate,
        deliverySlot: resolvedDeliverySlot,
        paymentMethod: "online",
        items: snapshotItems,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        discount: discountAmount,
        total: total,
        promoCode: appliedPromo || undefined,
        promoCouponId: promoCouponId ? (promoCouponId as Id<"promoCoupons">) : undefined,
        promoCouponDiscountPaise: promoCouponDiscountPaise || undefined,
        couponCode: appliedCoupon?.code,
        token: token || undefined,
        quoteId,
      });

      const { checkoutSessionId, razorpayOrderId } = sessionResult;
      const payablePaise = (sessionResult as any).customerPayablePaise;

      // The coupon covers the order, so there is nothing to charge and no
      // Razorpay checkout to open. Anything under Razorpay's ₹1 floor counts as
      // covered — the server absorbs the remainder rather than failing.
      if (typeof payablePaise === "number" && payablePaise < 100) {
        const verifyResult = await placeCouponFundedOrder({
          checkoutSessionId,
          token: token || undefined,
        });
        if (verifyResult) {
          clearCart();
          router.push(`/order/success?orderId=${verifyResult.orderId}`);
        }
        return;
      }

      // 2. Handle Mock Order Simulation (offline mode)
      if (razorpayOrderId.startsWith("order_mock_")) {
        const verifyResult = await verifyPaymentAndPlaceOrder({
          checkoutSessionId,
          razorpayPaymentId: `pay_mock_${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          razorpaySignature: "mock_signature",
          token: token || undefined,
        });

        if (verifyResult) {
          placeOrder({
            id: verifyResult.orderNumber,
            convexId: verifyResult.orderId,
            items: orderItems,
            subtotal,
            discount: discountAmount,
            deliveryFee,
            codFee: 0,
            total,
            paymentMethod: "online",
            address: {
              id: selectedAddress.id,
              name: selectedAddress.name,
              phone: selectedAddress.phone || "",
              addressLine1: selectedAddress.addressLine1 ?? "",
              addressLine2: selectedAddress.addressLine2,
              city: selectedAddress.city,
              state: selectedAddress.state,
              pincode: selectedAddress.pincode,
              isDefault: selectedAddress.isDefault,
            },
            deliveryDate: resolvedDeliveryDate,
            deliverySlot: resolvedDeliverySlot,
          });
        }

        const isBuyNow = checkoutItems.length > 0;
        trackCheckoutEvent("payment_success", {
          total,
          orderNumber: verifyResult.orderNumber,
          razorpayOrderId,
          isMock: true,
        });
        router.push(`/order/success?orderId=${verifyResult.orderNumber}`);

        setTimeout(() => {
          if (!isBuyNow) {
            clearCartMutation({}).catch(console.error);
            clearCart();
          }
          clearCheckout();
          setIsPlacingOrder(false);
        }, 500);
        return;
      }

      // 3. Real Payment Mode: load Razorpay
      setScriptLoadError(false);
      const scriptLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      if (!scriptLoaded) {
        setScriptLoadError(true);
        setIsPlacingOrder(false);
        isOrderPlacing.current = false;
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(total * 100),
        currency: "INR",
        name: "Hive",
        description: "Secure Checkout",
        image: "https://ui-avatars.com/api/?name=Hive&background=000&color=fff&rounded=true&size=128",
        order_id: razorpayOrderId,
        handler: async function (response: any) {
          try {
            setIsPlacingOrder(true);
            const verifyResult = await verifyPaymentAndPlaceOrder({
              checkoutSessionId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              token: token || undefined,
            });

            if (verifyResult) {
              placeOrder({
                id: verifyResult.orderNumber,
                convexId: verifyResult.orderId,
                items: orderItems,
                subtotal,
                discount: discountAmount,
                deliveryFee,
                codFee: 0,
                total,
                paymentMethod: "online",
                address: {
                  id: selectedAddress.id,
                  name: selectedAddress.name,
                  phone: selectedAddress.phone || "",
                  addressLine1: selectedAddress.addressLine1 ?? "",
                  addressLine2: selectedAddress.addressLine2,
                  city: selectedAddress.city,
                  state: selectedAddress.state,
                  pincode: selectedAddress.pincode,
                  isDefault: selectedAddress.isDefault,
                },
                deliveryDate: resolvedDeliveryDate,
                deliverySlot: resolvedDeliverySlot,
              });
            }

            const isBuyNow = checkoutItems.length > 0;
            trackCheckoutEvent("payment_success", {
              total,
              orderNumber: verifyResult.orderNumber,
              razorpayOrderId,
            });
            router.push(`/order/success?orderId=${verifyResult.orderNumber}`);

            setTimeout(() => {
              if (!isBuyNow) {
                clearCartMutation({}).catch(console.error);
                clearCart();
              }
              clearCheckout();
              setIsPlacingOrder(false);
            }, 500);
          } catch (err) {
            console.error("Signature verification failed:", err);
            toast.error("Signature verification failed. Please try again or contact support.");
            setIsPlacingOrder(false);
            isOrderPlacing.current = false;
          }
        },
        prefill: {
          name: (currentUser as any)?.name || currentUser?.email?.split("@")[0] || "Hive Customer",
          email: currentUser?.email || "",
          contact: selectedAddress?.phone || currentUser?.phone || "",
          ...(useRememberedMethod && lastUsedPaymentMethod
            ? { method: lastUsedPaymentMethod }
            : {}),
        },
        theme: {
          color: "#E2B93B",
        },
        modal: {
          ondismiss: function () {
            setIsPlacingOrder(false);
            isOrderPlacing.current = false;
            setPaymentError("Payment cancelled. Your items are still reserved for a few minutes.");
            trackCheckoutEvent("checkout_abandoned", {
              total,
              razorpayOrderId,
            });
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        toast.error("Payment failed: " + response.error.description);
        setIsPlacingOrder(false);
        isOrderPlacing.current = false;
        trackCheckoutEvent("payment_failed", {
          total,
          error: response.error.description,
          razorpayOrderId,
        });
      });
      rzp.open();
    } catch (err: any) {
      console.error("Order session failed:", err);
      
      // Self-healing cart UX for stale prices
      if (getCustomerErrorCode(err) === "STALE_CART_PRICE") {
        toast.error(
          getCustomerErrorMessage(err, "Cart prices have been updated. Please review the new total.")
        );
        // The Convex useQuery will automatically reactively update the UI to show the new prices
        // based on the Phase 1 background batch updates on the products table.
      } else {
        // Not err.message: a Convex failure reads "[CONVEX A(payments:createOrder)] [Request ID:
        // ...] Server Error", and a shopper who has just pressed Pay is the last person who
        // should be shown one. The raw error is already on the console above.
        toast.error(
          getCustomerErrorMessage(err, "We couldn't start this payment. Please try again.")
        );
      }
      setIsPlacingOrder(false);
      isOrderPlacing.current = false;
    }
  };

  if (orderItems.length === 0) {
    const lastBoutiqueId = latestOrder?.items?.[0]?.boutiqueId;
    const exploreUrl = "/shop/all";
    return (
      <div className="min-h-screen bg-hive-cream/30 py-20 px-6 flex items-center justify-center text-left animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        <div className="max-w-md w-full bg-white border border-hive-border rounded-3xl p-8 shadow-sm space-y-6 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-hive-comb/40 flex items-center justify-center border border-hive-border/40">
            <PremiumShoppingBag className="w-6 h-6 text-hive-dark" strokeWidth={1.5} />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="font-serif text-xl font-bold text-hive-dark">Your Hive Bag is empty</h1>
            <p className="text-xs text-hive-text-muted max-w-[280px] mx-auto leading-relaxed">
              Please add items to your Hive Bag before proceeding to checkout.
            </p>
          </div>
          <button
            onClick={() => router.push(exploreUrl)}
            className="w-full h-11 bg-stone-950 text-white hover:bg-stone-900 active:scale-[0.98] transition-all rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm focus:outline-none cursor-pointer"
          >
            Explore Styles
          </button>
        </div>
      </div>
    );
  }

  if (!selectedAddress) {
    return <OrderReviewSkeleton />;
  }

  return (
    <div className="min-h-screen bg-hive-cream/30 py-6 sm:py-12 px-4 sm:px-6 lg:px-8 select-none text-left">
      {isPlacingOrder && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center gap-4 text-center max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <BeeLoader size="lg" className="p-0" />
            <p className="font-sans text-base font-bold tracking-wide text-white">Processing your payment...</p>
            <p className="text-xs text-slate-400 leading-relaxed">Please do not refresh the page or navigate away.</p>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto flex flex-col gap-5 sm:gap-6 pb-24 sm:pb-0">

        {/* Contextual Header */}
        <div className="flex flex-col gap-1 border-b border-hive-border/10 pb-4">
          <span className="text-[10px] font-extrabold tracking-[0.2em] text-hive-text-muted uppercase">
            Step 2 of 2
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl text-hive-dark tracking-tight leading-none">
            Review & Pay
          </h1>
          <p className="text-xs text-hive-text-muted font-medium mt-0.5">
            Review your order details and complete your secure payment.
          </p>
        </div>

        {stockSyncedMessage && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl animate-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium leading-relaxed">
                {stockSyncedMessage}
              </p>
            </div>
          </div>
        )}

        {paymentError && (
          <div className="p-4 bg-amber-50 border border-amber-200/50 rounded-lg flex items-start gap-2.5 text-xs text-amber-800 font-semibold animate-[fadeIn_0.2s_ease-out]">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-amber-900">Payment Cancelled</p>
              <p className="text-amber-700/90 font-medium">Your items are still in your bag for a few minutes.</p>
            </div>
          </div>
        )}

        {/* Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start mt-2">

          {/* Left Panel: Summaries & Items */}
          <div className="lg:col-span-8 space-y-6">

            {/* 1. Items list review */}
            <div className="bg-white border border-hive-border/50 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-extrabold text-hive-dark uppercase tracking-wider border-b border-hive-border/40 pb-2 flex items-center gap-2">
                <PremiumShoppingBag className="w-4 h-4 text-hive-dark" strokeWidth={1.6} />
                <span>Items in Hive Bag</span>
              </h3>

              <div className="divide-y divide-hive-border/30 flex flex-col">
                {orderItems.map((item) => {
                  const backendItem = backendPricing?.items?.find((b: any) => b.productId === item.productId);
                  const effectivePrice = backendItem?.allInclusivePriceRupees ?? backendItem?.priceAtPurchaseRupees ?? item.price;
                  return (
                  <div key={`${item.productId}-${item.size}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="relative w-14 h-18 rounded-lg overflow-hidden bg-hive-cream/30 border border-hive-border/20 flex-shrink-0">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} fill sizes="56px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-hive-comb/25" />
                      )}
                    </div>

                    <div className="flex-1 flex flex-col sm:flex-row justify-between sm:items-start text-left gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-hive-dark mt-0.5 line-clamp-1">{item.name}</h4>
                        <span className="text-[10px] text-hive-text-muted font-medium mt-0.5 block">
                          by {item.boutiqueName || "Designer Partner"}
                        </span>
                        <span className="inline-flex items-center text-[9px] font-extrabold text-hive-dark bg-stone-100 px-2 py-0.5 rounded-lg mt-1.5 border border-stone-200">
                          Size: {item.size}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-hive-dark block">
                          {formatRupees(effectivePrice * item.quantity)}
                        </span>
                        <div className="text-[10px] text-stone-500 font-medium leading-none mt-1">
                          {formatRupees(effectivePrice)} x {item.quantity}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              </div>
            </div>

            {/* 2. Address summary review */}
            <div className="bg-white border border-hive-border/50 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-hive-border/40 pb-2">
                <h3 className="text-xs font-extrabold text-hive-dark uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-hive-dark" />
                  <span>Delivery Address</span>
                </h3>
                <button
                  type="button"
                  onClick={() => router.push("/checkout/address")}
                  className="text-[10px] font-bold text-hive-text-muted uppercase tracking-wider hover:text-hive-dark transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="text-xs font-semibold text-hive-text leading-relaxed">
                <p className="font-extrabold text-hive-dark">{selectedAddress.name}</p>
                <p className="mt-0.5 text-hive-text-muted font-normal">{selectedAddress.addressLine1}</p>
                {selectedAddress.addressLine2 && <p className="text-hive-text-muted font-normal">{selectedAddress.addressLine2}</p>}
                <p className="text-hive-text-muted font-normal">{selectedAddress.city}, {selectedAddress.state} - <span className="font-extrabold">{selectedAddress.pincode}</span></p>
                <p className="text-hive-text-muted mt-2 flex items-center gap-1.5 font-bold">
                  <Phone className="w-3.5 h-3.5 opacity-60" />
                  <span>{selectedAddress.phone}</span>
                </p>
              </div>
            </div>


            {/* 4. Delivery Instructions (Order Notes) */}
            <div className="bg-white border border-hive-border/50 rounded-2xl p-5 shadow-sm space-y-3">
              <label htmlFor="notes" className="text-xs font-extrabold text-hive-dark uppercase tracking-wider flex items-center gap-2">
                <span>Delivery Instructions</span>
              </label>
              <textarea
                id="notes"
                rows={3}
                placeholder="e.g. Leave with building security gate, call before arrival, or ring bell."
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                className="w-full p-4 text-xs border border-hive-border/50 rounded-xl focus:outline-none focus:border-hive-dark/40 bg-white font-semibold placeholder:opacity-50"
              />
            </div>


          </div>

          {/* Right Panel: Pricing calculations & Checkout */}
          <div className="lg:col-span-4 space-y-4 hidden lg:block">
            <CustomerPriceBreakdown
              subtotal={subtotal}
              handlingCharge={handlingCharge}
              platformFee={platformFee}
              gstOnCharges={gstOnCharges}
              deliveryFee={deliveryFee}
              discount={discountAmount}
              total={total}
              isEstimatedDelivery={false}
              showHelpSection={true}
              isLoading={orderItems.length > 0 && backendPricing === undefined}
            />

              {/* Exchange credit: reduces what is charged, not the order total. */}
              {appliedCoupon && (
                <div className="border-t border-hive-border/40 pt-4 mt-1 text-left space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-700">
                    <span>Store credit ({appliedCoupon.code})</span>
                    <span className="font-mono">
                      −₹{(Math.min(appliedCoupon.amountPaise, Math.round(total * 100)) / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-black text-hive-dark">
                    <span>To pay now</span>
                    <span className="font-mono">
                      ₹{Math.max(0, total - appliedCoupon.amountPaise / 100).toFixed(2)}
                    </span>
                  </div>
                  {appliedCoupon.amountPaise > Math.round(total * 100) && (
                    <p className="text-[11px] text-emerald-700 font-semibold leading-snug">
                      ₹{((appliedCoupon.amountPaise - Math.round(total * 100)) / 100).toFixed(2)} left
                      over will be refunded to your original payment method.
                    </p>
                  )}
                </div>
              )}

              {/* Promo code widget */}
              <div className="border-t border-hive-border/40 pt-4 mt-1 text-left">
                <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider block mb-2">
                  Have a Coupon?
                </span>

                {!appliedPromo ? (
                  <form onSubmit={handleApplyPromo} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. WELCOME10"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="flex-1 h-9 px-3 text-xs border border-hive-border rounded-xl focus:outline-none focus:border-hive-dark/40 bg-white font-medium uppercase placeholder:opacity-50"
                    />
                    <button
                      type="submit"
                      className="h-9 px-4 rounded-lg bg-white border border-hive-dark text-hive-dark hover:bg-hive-cream/40 active:scale-[0.98] transition-all text-xs font-bold uppercase tracking-[0.15em] shadow-sm focus:outline-none"
                    >
                      Apply
                    </button>
                  </form>
                ) : (
                  <AppliedCouponCard code={appliedPromo} savingsRupees={discountAmount} onRemove={handleRemovePromo} />
                )}

                {promoError && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{promoError}</span>
                  </div>
                )}
                {promoSuccessMsg && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 mt-2">
                    <span>{promoSuccessMsg}</span>
                  </div>
                )}
              </div>

              {scriptLoadError && (
                <div className="p-3 bg-red-50 border border-red-200/50 rounded-xl flex items-center justify-between text-xs text-red-700 font-semibold mt-3 animate-[fadeIn_0.2s_ease-out]">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span>Unable to load payment gateway.</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setScriptLoadError(false);
                      handlePay();
                    }}
                    className="text-[10px] font-black uppercase text-hive-dark hover:text-hive-dark/80 underline focus:outline-none"
                  >
                    Retry Payment
                  </button>
                </div>
              )}

              {lastUsedPaymentMethod && useRememberedMethod && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-hive-text-muted">
                    Pay using <span className="font-bold text-hive-dark">{PAYMENT_METHOD_LABELS[lastUsedPaymentMethod] ?? lastUsedPaymentMethod}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseRememberedMethod(false)}
                    className="text-xs font-bold text-hive-dark underline underline-offset-2 hover:text-hive-dark/70 transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Proceed to Payment CTA */}
              <button
                type="button"
                disabled={isPlacingOrder || isQuoteLoading}
                onClick={handlePay}
                className="w-full h-14 bg-hive-gold text-hive-dark hover:bg-hive-amber active:scale-[0.98] transition-all rounded-lg mt-3 font-semibold uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPlacingOrder ? (
                  <Loader2 className="w-4 h-4 animate-spin text-hive-dark" />
                ) : (
                  <span>Pay Now →</span>
                )}
              </button>


          </div>
        </div>
      </div>

      {/* Sticky Bottom Summary (Mobile Only) */}
      <div className="fixed bottom-0 left-0 right-0 z-[999] bg-white border-t border-hive-border/30 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] lg:hidden pb-[env(safe-area-inset-bottom)]">
        {isPriceExpanded && (
          <div className="px-5 py-4 border-b border-hive-border/20 bg-neutral-50/50 space-y-2.5 text-xs animate-[fadeIn_0.2s_ease-out]">
            <div className="flex justify-between items-center text-hive-text-muted">
              <span>Cart Subtotal</span>
              <span>{formatRupees(subtotal)}</span>
            </div>

            {(handlingCharge > 0 || platformFee > 0 || gstOnCharges > 0) && (
              <div className="ml-3 pl-3 border-l-2 border-hive-border/40 space-y-1.5">
                <div className="flex justify-between items-center text-[10.5px] text-hive-text-muted/80">
                  <span>Base Price</span>
                  <span>{formatRupees(Math.max(0, subtotal - handlingCharge - platformFee - gstOnCharges))}</span>
                </div>
                <GstAndOtherChargesRow
                  handlingCharge={handlingCharge}
                  platformFee={platformFee}
                  gstOnCharges={gstOnCharges}
                  formatAmount={formatRupees}
                  className="text-[10.5px] text-hive-text-muted/80"
                />
              </div>
            )}

            {discountAmount > 0 && (
              <div className="flex justify-between items-center text-green-700">
                <span>Discount</span>
                <span>-{formatRupees(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-hive-text-muted">
              <span>Delivery Partner Fee</span>
              <span>{deliveryFee === 0 ? "FREE" : formatRupees(deliveryFee)}</span>
            </div>

            {/* Coupon Widget inside Mobile Sticky Drawer */}
            <div className="border-t border-hive-border/20 pt-3 mt-1">
              <span className="text-[10px] font-extrabold text-hive-text-muted uppercase tracking-wider block mb-1.5">
                Have a Coupon?
              </span>
              {!appliedPromo ? (
                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="WELCOME10"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    className="flex-1 h-8 px-3 text-xs border border-hive-border rounded-lg bg-white uppercase placeholder:opacity-50"
                  />
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-lg bg-white border border-hive-dark text-hive-dark hover:bg-hive-cream/40 text-xs font-bold uppercase tracking-[0.15em] focus:outline-none"
                  >
                    Apply
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  <span className="text-xs font-bold text-green-800 uppercase">{appliedPromo}</span>
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    className="text-[10px] font-bold text-red-500"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>



          </div>
        )}

        {scriptLoadError && (
          <div className="px-5 py-3.5 bg-red-50 border-b border-hive-border/20 flex items-center justify-between text-xs text-red-700 font-semibold animate-[fadeIn_0.2s_ease-out]">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <span>Unable to load payment gateway.</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setScriptLoadError(false);
                handlePay();
              }}
              className="text-[10px] font-black uppercase text-hive-dark hover:text-hive-dark/80 underline focus:outline-none"
            >
              Retry Payment
            </button>
          </div>
        )}

        <div className="px-5 pb-3">
          <p className="text-[10px] text-hive-text-muted text-center leading-relaxed">
            By placing this order, you agree to our{" "}
            <Link href="/legal/return-policy" target="_blank" className="font-semibold text-hive-dark hover:underline">
              Return & Refund Policy
            </Link>.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 border-t border-hive-border/20">
          <button
            type="button"
            onClick={() => setIsPriceExpanded(!isPriceExpanded)}
            className="flex items-center justify-between text-left focus:outline-none"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-hive-text-muted flex items-center gap-1">
              Total Payable {isPriceExpanded ? "↓" : "↑"}
            </span>
            <span className="text-base font-black text-hive-dark">
              {formatRupees(total)}
            </span>
          </button>

          {lastUsedPaymentMethod && useRememberedMethod && (
            <div className="flex items-center justify-between -mt-1">
              <span className="text-[11px] text-hive-text-muted">
                Pay using <span className="font-bold text-hive-dark">{PAYMENT_METHOD_LABELS[lastUsedPaymentMethod] ?? lastUsedPaymentMethod}</span>
              </span>
              <button
                type="button"
                onClick={() => setUseRememberedMethod(false)}
                className="text-[11px] font-bold text-hive-dark underline underline-offset-2"
              >
                Change
              </button>
            </div>
          )}

          <SwipeToPayButton
            onComplete={handlePay}
            disabled={isQuoteLoading}
            isProcessing={isPlacingOrder}
            label="Slide to Pay"
          />
        </div>
      </div>

    </div>
  );
}

// ── Skeleton Loader ─────────────────────────────────────────────────────────
function OrderReviewSkeleton() {
  return (
    <div className="min-h-screen bg-hive-cream/30 py-12 px-4 sm:px-6 lg:px-8 animate-pulse select-none text-left">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="h-4 w-24 bg-hive-comb/10 rounded-lg" />
        <div className="h-14 w-full bg-white border border-hive-border/20 rounded-3xl" />
        <div className="h-8 w-60 bg-hive-comb/15 rounded-xl mt-4" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-[140px] bg-white border border-hive-border/20 rounded-3xl" />
            <div className="h-[140px] bg-white border border-hive-border/20 rounded-3xl" />
            <div className="h-[160px] bg-white border border-hive-border/20 rounded-3xl" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="h-[280px] bg-white border border-hive-border/20 rounded-3xl" />
            <div className="h-[180px] bg-white border border-hive-border/20 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
