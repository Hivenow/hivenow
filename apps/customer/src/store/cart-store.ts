import { create } from "zustand";
import { persist } from "zustand/middleware";
import { migrateLegacyItemPrices } from "@/lib/legacyCartPrices";

export interface CartItem {
  productId: string;
  size: string;
  quantity: number;
  availableStock?: number;
  price: number; // in rupees
  name: string;
  imageUrl: string;
  boutiqueName: string;
  boutiqueId?: string;
  isPreorder?: boolean;
  preorderType?: string;
  scheduledProcessingDate?: string;
  isReservation?: boolean;
  reservationStatus?: string;
  reservationExpiresAt?: number;
  reservationId?: string;
  returnsAccepted?: boolean;
}

export interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  updateAvailableStock: (productId: string, size: string, stock: number) => void;
  updateReservationStatus: (reservationId: string, status: string, expiresAt?: number) => void;
  updateReservationByProduct: (productId: string, size: string, status: string, reservationId?: string, expiresAt?: number) => void;
  clearCart: () => void;
  getCartTotal: () => number; // returns total in rupees
  getCartCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (newItem) => {
        // Prices are rupees and stored as given. The store used to guess the unit (anything
        // above 10000 was treated as paise), which turned real ₹10,000+ items into ~₹100.
        const normalizedPrice = newItem.price;
        const quantity = newItem.quantity ?? 1;
        set((state) => {
          const sanitizedItems = state.items;
          const existing = sanitizedItems.find(
            (item) => item.productId === newItem.productId && item.size === newItem.size
          );
          if (existing) {
            return {
              items: sanitizedItems.map((item) =>
                item.productId === newItem.productId && item.size === newItem.size
                  ? {
                      ...item,
                      price: normalizedPrice,
                      quantity: Math.min(item.quantity + quantity, item.availableStock ?? newItem.availableStock ?? 1),
                      availableStock: newItem.availableStock ?? item.availableStock,
                    }
                  : item
              ),
            };
          }
          return {
            items: [
              ...sanitizedItems,
              {
                ...newItem,
                price: normalizedPrice,
                quantity: Math.min(quantity, newItem.availableStock ?? 1),
              },
            ],
          };
        });
      },
      removeItem: (productId, size) => {
        set((state) => ({
          items: state.items.filter(
            (item) => !(item.productId === productId && item.size === size)
          ),
        }));
      },
      updateQuantity: (productId, size, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            return {
              items: state.items.filter(
                (item) => !(item.productId === productId && item.size === size)
              ),
            };
          }
          return {
            items: state.items.map((item) => {
              if (item.productId === productId && item.size === size) {
                return { ...item, quantity: Math.min(quantity, item.availableStock ?? 1) };
              }
              return item;
            }),
          };
        });
      },
      updateAvailableStock: (productId, size, stock) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.productId === productId && item.size === size) {
              const newQuantity = Math.min(item.quantity, stock);
              return { ...item, availableStock: stock, quantity: newQuantity };
            }
            return item;
          }),
        }));
      },
      updateReservationStatus: (reservationId, status, expiresAt) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.isReservation && item.reservationId === reservationId) {
              return {
                ...item,
                reservationStatus: status,
                ...(expiresAt ? { reservationExpiresAt: expiresAt } : {}),
              };
            }
            return item;
          }),
        }));
      },
      updateReservationByProduct: (productId, size, status, reservationId, expiresAt) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.productId === productId && item.size === size) {
              return {
                ...item,
                isReservation: true,
                reservationStatus: status,
                ...(reservationId ? { reservationId } : {}),
                ...(expiresAt ? { reservationExpiresAt: expiresAt } : {}),
              };
            }
            return item;
          }),
        }));
      },
      clearCart: () => {
        set({ items: [] });
      },
      getCartTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },
      getCartCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: "hive-cart-storage",
      // v1: prices are stored in rupees without unit guessing. v0 snapshots get the old
      // conversion applied once on rehydrate (lib/legacyCartPrices.ts).
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<CartState>;
        if (version < 1) {
          return { ...state, items: migrateLegacyItemPrices<CartItem>(state.items) } as CartState;
        }
        return state as CartState;
      },
    }
  )
);
