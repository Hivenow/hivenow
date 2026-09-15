// apps/customer/src/lib/userScopedState.ts
//
// Resets the browser-persisted state that belongs to a signed-in customer: the bag, Buy Now
// items and checkout selections, saved addresses, and the last placed order. Called on logout
// and when a different account signs in on the same browser (see lib/sessionOwner.ts).
//
// The wishlist is intentionally kept: it is not tied to an account anywhere (there is no server
// copy), so clearing it would destroy the only record of it rather than protect anyone.
//
// Each store's setter also rewrites its localStorage entry through the persist middleware.

import { useCartStore } from "@/store/cart-store";
import { useCheckoutStore } from "@/store/checkout-store";
import { useAddressStore } from "@/store/address-store";
import { useOrderStore } from "@/store/order-store";

export function clearUserScopedState(): void {
  useCartStore.getState().clearCart();
  useCheckoutStore.getState().clearCheckout();
  useAddressStore.setState({ addresses: [], selectedAddressId: null });
  useOrderStore.setState({ orders: [], latestOrder: null });
}
