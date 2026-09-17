import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WishlistProduct {
  id?: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  imageUrl: string;
  boutiqueName: string;
  rating?: number;
  reviewCount?: number;
  sizes?: string[];
  stockBySize?: Record<string, number>;
  // Set when this item was saved from the cross-boutique bag-conflict modal instead of
  // switching bags. Holds the boutiqueId of the order that was in progress at save time, so
  // the post-checkout prompt can find "the item you saved while ordering from boutique X" once
  // that specific order is placed — and stays put (not cleared by "remind me later") until the
  // shopper acts on it or dismisses it from the wishlist page.
  pendingOrderBoutiqueId?: string;
  savedAt?: number;
}

export interface WishlistState {
  items: WishlistProduct[];
  toggleItem: (item: WishlistProduct) => void;
  hasItem: (slug: string) => boolean;
  clearWishlist: () => void;
  saveForNextOrder: (item: Omit<WishlistProduct, "pendingOrderBoutiqueId" | "savedAt">, pendingOrderBoutiqueId: string) => void;
  clearPendingOrder: (slug: string) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggleItem: (item) => {
        set((state) => {
          const exists = state.items.some((i) => i.slug === item.slug);
          if (exists) {
            return {
              items: state.items.filter((i) => i.slug !== item.slug),
            };
          }
          return {
            items: [...state.items, item],
          };
        });
      },
      hasItem: (slug) => {
        return get().items.some((i) => i.slug === slug);
      },
      clearWishlist: () => set({ items: [] }),
      saveForNextOrder: (item, pendingOrderBoutiqueId) => {
        set((state) => {
          const exists = state.items.some((i) => i.slug === item.slug);
          if (exists) {
            return {
              items: state.items.map((i) =>
                i.slug === item.slug ? { ...i, pendingOrderBoutiqueId, savedAt: Date.now() } : i
              ),
            };
          }
          return {
            items: [...state.items, { ...item, pendingOrderBoutiqueId, savedAt: Date.now() }],
          };
        });
      },
      clearPendingOrder: (slug) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.slug === slug ? { ...i, pendingOrderBoutiqueId: undefined } : i
          ),
        }));
      },
    }),
    {
      name: "hive-wishlist-storage",
    }
  )
);
