import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem } from "./cart-store";
import { migrateLegacyItemPrices } from "@/lib/legacyCartPrices";

export interface CheckoutState {
  selectedDate: string | null;
  selectedSlot: string | null;
  selectedSlotWindow: string | null;
  appliedPromo: string | null;
  discountAmount: number;
  deliveryInstructions: string;
  selectedPaymentMethod: string | null;
  checkoutItems: CartItem[];
  /** Convex address _id stored as string — persists across checkout steps */
  selectedAddressId: string | null;
  setDeliverySelection: (date: string, slot: string, slotWindow: string) => void;
  setAppliedPromo: (promo: string | null, discount: number) => void;
  setDeliveryInstructions: (instructions: string) => void;
  setSelectedPaymentMethod: (method: string | null) => void;
  setCheckoutItems: (items: CartItem[]) => void;
  clearCheckoutItems: () => void;
  setSelectedAddressId: (id: string | null) => void;
  clearCheckout: () => void;
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      selectedDate: null,
      selectedSlot: null,
      selectedSlotWindow: null,
      appliedPromo: null,
      discountAmount: 0,
      deliveryInstructions: "",
      selectedPaymentMethod: null,
      checkoutItems: [],
      selectedAddressId: null,
      setDeliverySelection: (date, slot, slotWindow) => {
        set({ selectedDate: date, selectedSlot: slot, selectedSlotWindow: slotWindow });
      },
      setAppliedPromo: (promo, discount) => {
        set({ appliedPromo: promo, discountAmount: discount });
      },
      setDeliveryInstructions: (instructions) => {
        set({ deliveryInstructions: instructions });
      },
      setSelectedPaymentMethod: (method) => {
        set({ selectedPaymentMethod: method });
      },
      setCheckoutItems: (items) => {
        set({ checkoutItems: items });
      },
      clearCheckoutItems: () => {
        set({ checkoutItems: [] });
      },
      setSelectedAddressId: (id) => {
        set({ selectedAddressId: id });
      },
      clearCheckout: () => {
        set({
          selectedDate: null,
          selectedSlot: null,
          selectedSlotWindow: null,
          appliedPromo: null,
          discountAmount: 0,
          deliveryInstructions: "",
          selectedPaymentMethod: null,
          checkoutItems: [] as CartItem[],
          selectedAddressId: null,
        });
      },
    }),
    {
      name: "hive-checkout-storage",
      // v1: Buy Now items share the cart's rupee convention; see cart-store and
      // lib/legacyCartPrices.ts for why v0 snapshots are converted once.
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<CheckoutState>;
        if (version < 1) {
          return {
            ...state,
            checkoutItems: migrateLegacyItemPrices<CartItem>(state.checkoutItems),
          } as CheckoutState;
        }
        return state as CheckoutState;
      },
    }
  )
);
