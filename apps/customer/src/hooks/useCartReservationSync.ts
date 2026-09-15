"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSessionStore } from "@/context/SessionContext";
import { useCartStore } from "@/store/cart-store";

/**
 * useCartReservationSync
 * 
 * Subscribes to live Convex reservations and synchronizes their statuses
 * (e.g. reservation_active -> awaiting_payment -> order_confirmed / expired)
 * directly into the client Zustand cart in real-time.
 */
export function useCartReservationSync() {
  const { token, isAuthenticated } = useSessionStore();
  const items = useCartStore((state) => state.items);
  const updateReservationByProduct = useCartStore((state) => state.updateReservationByProduct);
  const addItem = useCartStore((state) => state.addItem);

  // Live Convex query for user's reservations
  const reservations = useQuery(
    (api as any).reservations.getMyReservations,
    isAuthenticated ? { token: token || undefined } : "skip"
  );

  const prevSyncRef = useRef<string>("");

  useEffect(() => {
    if (!isAuthenticated || !reservations || !Array.isArray(reservations)) {
      return;
    }

    const syncKey = JSON.stringify(
      reservations.map((r: any) => ({
        id: r._id,
        status: r.status,
        expiresAt: r.paymentExpiresAt || r.reservationExpiresAt,
      }))
    );

    if (syncKey === prevSyncRef.current) {
      return;
    }
    prevSyncRef.current = syncKey;

    // 1. Sync existing cart items with latest DB reservation statuses
    items.forEach((item) => {
      if (item.isReservation) {
        // Match by reservationId first, then fallback to productId + size
        const match = reservations.find(
          (r: any) =>
            (item.reservationId && r._id === item.reservationId) ||
            (r.productId === item.productId && r.size === item.size)
        );

        if (match) {
          const effectiveExpiresAt = match.paymentExpiresAt || match.reservationExpiresAt;
          if (
            item.reservationStatus !== match.status ||
            item.reservationExpiresAt !== effectiveExpiresAt ||
            item.reservationId !== match._id
          ) {
            console.log(
              `[useCartReservationSync] Updating cart item ${item.name} status to ${match.status}`
            );
            updateReservationByProduct(
              item.productId,
              item.size,
              match.status,
              match._id,
              effectiveExpiresAt
            );
          }
        }
      }
    });

    // 2. If user has an active "awaiting_payment" reservation not currently in the cart, add it
    const activePaymentReservations = reservations.filter(
      (r: any) => r.status === "awaiting_payment"
    );

    activePaymentReservations.forEach((res: any) => {
      const inCart = items.some(
        (i) =>
          (i.reservationId && i.reservationId === res._id) ||
          (i.productId === res.productId && i.size === res.size)
      );

      if (!inCart) {
        console.log(
          `[useCartReservationSync] Adding accepted reservation ${res.productName} to bag`
        );
        addItem({
          productId: res.productId,
          size: res.size,
          // Already rupees: reservations.getMyReservations converts the stored paise.
          price: res.priceAtReserve,
          name: res.productName,
          imageUrl: res.productImageUrl || "",
          boutiqueName: res.boutiqueName || "Boutique",
          boutiqueId: res.boutiqueId,
          isReservation: true,
          reservationStatus: res.status,
          reservationExpiresAt: res.paymentExpiresAt,
          reservationId: res._id,
          quantity: res.quantity || 1,
        });
      }
    });
  }, [reservations, items, isAuthenticated, updateReservationByProduct, addItem]);
}
