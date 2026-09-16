# Cart v2 — Server-Authoritative Cart for Hive Mobile

Status: **Approved direction, revision 2** · 2026-09-15 · No code written against this spec yet.

Builds on the cart audit of 2026-09-15 and the price-unit contract shipped in `4c5830e` / `9e5d433`.

---

## 1. Decisions this spec implements

| # | Question | Decision |
|---|---|---|
| D1 | Source of truth | Signed-in shoppers: the Convex cart (`cartItems`). **All cart writes are server-authoritative.** |
| D2 | Guest shopping | Guests can add to bag. The bag lives on the device, is rendered through a read-only server query, and is merged into the account cart on sign-in; the device copy is then cleared. No anonymous server writes. |
| D3 | Boutique conflict at sign-in | Guest bag and account cart from different boutiques: **ask the shopper**. |
| D4 | Same-boutique merge | Combine; a matching product+size takes `max(guestQty, accountQty)`, capped by the quantity limit and available stock. |
| D5 | Website | Keeps its browser-only bag during mobile V1; moves to the server cart in the next phase. |
| D6 | Price changes | Flag them, using `priceAtAddPaise`. |
| D7 | Buy Now | Stays outside the persistent cart. Placing an order clears only the lines that were ordered. |
| D8 | Bag limit | **20 distinct lines**, where a line is one product + size. |
| D9 | Quantity per line | **10 maximum**, then capped by available stock. |
| D10 | Closed boutique | **Not purchasable while closed.** Lines stay in the bag, marked unavailable; the shopper chooses Remove or Move to Wishlist. Nothing is deleted automatically. |
| D11 | Delivery fee | **Not in the bag.** Calculated at checkout, as today. The bag shows "Delivery calculated at checkout". |
| D12 | Stock | Held by the checkout session, never by the cart (unchanged). |

## 2. Invariants

1. **Units.** Stored prices are paise. `priceAtAddPaise` is paise. Every query that returns a price to a client returns it in **both** `…Paise` and `…Rupees` fields, converted by dividing by 100. No value's unit is ever inferred from its size.
2. **Identity.** A cart line is keyed by `(userId, productId: Id<"products">, size)`. Slugs are resolved to ids at the boundary and never stored.
3. **One boutique per cart.** Every line in a user's cart belongs to the same boutique. Enforced on every write.
4. **No client-supplied product data.** Name, image, boutique and price are always read from the database. Clients send only `productId`, `size`, `quantity` (plus request ids, §7).
5. **Availability = stock minus reservation locks**, computed by one shared helper used by the cart **and** checkout, so the bag and checkout apply identical rules.
6. **Reads are advisory; writes are authoritative.** Availability shown by `getCart` / `previewItems` is never trusted for a write. Every mutation that sets or increases a quantity recomputes availability inside its own transaction (§8).
7. **Ownership.** Every mutation and user-scoped query resolves the user from `ctx.auth`; line ids from clients are checked against that user.

## 3. Schema

`cartItems` is empty on dev and prod (verified 2026-09-15), so the table is redefined in place. **Deploy precondition:** re-verify the table is empty on the target deployment immediately before deploying (§13).

```ts
cartItems: defineTable({
  userId:          v.id("users"),
  productId:       v.id("products"),
  boutiqueId:      v.id("boutiques"),   // denormalised for the one-boutique rule and suspension cleanup
  size:            v.string(),
  quantity:        v.number(),          // 1..MAX_QTY_PER_LINE
  priceAtAddPaise: v.number(),          // effective selling price (discountPrice ?? price) when added or last acknowledged
  addedAt:         v.number(),
  updatedAt:       v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_product_size", ["userId", "productId", "size"])
  .index("by_boutiqueId", ["boutiqueId"]),

// Idempotency receipts for non-idempotent cart writes (§7).
cartRequestReceipts: defineTable({
  userId:    v.id("users"),
  requestId: v.string(),               // client-generated UUID, one per user intent
  operation: v.union(v.literal("addItem"), v.literal("replaceCart")),
  result:    v.any(),                  // the original mutation result, returned on replay
  createdAt: v.number(),
})
  .index("by_userId_requestId", ["userId", "requestId"])
  .index("by_createdAt", ["createdAt"]),
```

Removed from v1 `cartItems`: `productSlug`, `name`, `price` (rupees), `imageUrl`, `boutiqueName` (client-supplied snapshots).

## 4. Shared helpers

### 4.1 `convex/lib/inventory.ts` — `getAvailableStock` (new, non-throwing)

```ts
export async function getAvailableStock(
  db, productId: Id<"products">, size: string, excludeReservationId?: string
): Promise<{ stock: number; lockedByReservations: number; available: number; sizeExists: boolean }>
```

- Extracted from `lib/mockInventory.ts` `validateProductSizeAndStock`: size normalisation, the three lock statuses (`reservation_active`, `awaiting_store_confirmation`, `awaiting_payment`), `excludeReservationId`.
- `validateProductSizeAndStock` is refactored to call it and keep its current error messages — **behaviour-preserving** for checkout, verified by existing tests plus a new availability test. Cart reads and cart writes use `getAvailableStock`; checkout keeps using `validateProductSizeAndStock`. One lock rule, two call styles.

### 4.2 `convex/lib/cart.ts` (new)

| Function | Purpose |
|---|---|
| `resolveProductRef(db, ref: string)` | Slug or id → product row or null. Used by `previewItems` and `mergeGuestCart` (guest bags may hold either). |
| `effectiveSellingPricePaise(product)` | `discountPrice` when present and lower than `price`, else `price`. Same rule as `displayPricing`. |
| `evaluateLine(ctx, line, context)` | Builds the response line (§5.1) and its status for one `(product, size, quantity, priceAtAddPaise)`. Shared by `getCart` and `previewItems`. |
| `planGuestMerge(accountLines, guestLines)` | **Pure.** Returns `{ kind: "merged", lines, droppedGuestLines }` or `{ kind: "conflict" }` (§6). Unit-testable without Convex. |
| `clearOrderedLines(ctx, userId, orderedItems)` | Deletes only the user's lines matching ordered `(productId, size)`; resolves slug ids in legacy session items (§10). |

### 4.3 Limits

| Constant | Value | Meaning |
|---|---|---|
| `MAX_LINES` | **20** | Distinct **product + size** lines in one cart. Physical units are not counted. |
| `MAX_QTY_PER_LINE` | **10** | Units on one line, further capped by available stock. |
| `MAX_PREVIEW_LINES` | 20 | Same as `MAX_LINES`, for guest bag previews. |
| `RECEIPT_TTL_MS` | 24 h | How long idempotency receipts are kept (§7). |

Example — 4 lines, 12 units:

```
Kurti    / M    × 3   → 1 line
Kurti    / L    × 2   → 1 line
Bag      / Free × 1   → 1 line
Notebook / Free × 6   → 1 line
```

## 5. API

### 5.1 Line and status shapes

```ts
type CartLineStatus =
  | "available"
  | "quantity_exceeded"    // quantity > available (available > 0)
  | "out_of_stock"         // available === 0
  | "size_unavailable"     // size no longer offered
  | "product_unavailable"  // deleted, inactive, adminHidden, not approved
  | "boutique_closed"      // getBoutiqueStatus CLOSED_TODAY or CLOSED_EXTENDED (D10)
  | "boutique_paused"      // PAUSED
  | "boutique_unavailable";// not APPROVED / suspended

interface CartLine {
  cartItemId?: Id<"cartItems">;      // absent in previewItems
  productId: Id<"products">;
  slug: string;
  name: string;
  imageUrl: string;                   // "card" variant
  size: string;
  quantity: number;
  status: CartLineStatus;
  isPurchasable: boolean;             // status === "available"
  availableStock: number;             // advisory only (§8)
  unitPricePaise: number;             // current effective selling price
  unitPriceRupees: number;
  compareAtPriceRupees?: number;      // only when a genuine higher MRP exists (displayPricing rules)
  lineTotalPaise: number;
  priceAtAddPaise: number;
  priceChanged: boolean;              // unitPricePaise !== priceAtAddPaise
  priceDeltaPaise: number;            // unitPricePaise - priceAtAddPaise
  suggestedActions: Array<"remove" | "move_to_wishlist" | "reduce_quantity">;
}

interface CartBoutique {
  boutiqueId: Id<"boutiques">;
  name: string;
  slug?: string;
  status: "OPEN" | "CLOSED_TODAY" | "CLOSED_EXTENDED" | "PAUSED"; // getBoutiqueStatus
  nextOperatingDay?: string;          // informational only; closed boutiques are not purchasable (D10)
  isAcceptingOrders: boolean;
  minimumOrderValuePaise?: number;
  deliverable: boolean | null;        // null when no coordinates supplied
}
```

`suggestedActions`:
- `boutique_closed`, `boutique_paused`, `boutique_unavailable`, `product_unavailable`, `size_unavailable`, `out_of_stock` → `["remove", "move_to_wishlist"]`
- `quantity_exceeded` → `["reduce_quantity", "remove"]`
- `available` → `[]`

### 5.2 Queries

**`cart.getCart({ lat?, lng? })`** — auth optional (returns empty for signed-out)
- Coordinates must be rounded by the client to 3 decimals (≈110 m) to keep subscriptions stable.
- Returns:
  ```ts
  { lines: CartLine[]; boutique: CartBoutique | null;
    subtotalPaise: number; subtotalRupees: number;       // purchasable lines only
    itemCount: number;                                   // physical units across purchasable lines
    lineCount: number;                                   // distinct lines, all statuses (counts toward MAX_LINES)
    hasBlockingIssues: boolean;                          // any line not purchasable, or deliverable === false
    hasPriceChanges: boolean;
    belowMinimumOrder: boolean; }
  ```
- **No delivery fee** (D11). Checkout remains the only place delivery is priced.
- A display answer only. Checkout re-validates everything and remains authoritative.

**`cart.previewItems({ items: { productId: string; size: string; quantity: number; priceAtAddPaise?: number }[], lat?, lng? })`** — no auth
- For guest bags. Read-only. Same response shape as `getCart` (no `cartItemId`).
- Rejects more than `MAX_PREVIEW_LINES` items. Unknown or malformed ids become `product_unavailable` lines, never errors, so one stale item can't break the bag.
- Queries can't write rate-limit counters, so abuse protection is the line cap plus the fact that it only reads public catalogue data.

### 5.3 Mutations (all require auth)

| Mutation | Args | Behaviour | Idempotency (§7) |
|---|---|---|---|
| `addItem` | `requestId, productId, size, quantity` | Product purchasable, boutique approved and **OPEN** (closed or paused → `CART_BOUTIQUE_CLOSED` / `CART_BOUTIQUE_PAUSED`). Cart has another boutique's lines → `CART_DIFFERENT_BOUTIQUE` with that boutique's name (client offers Replace). Existing line: new quantity = existing + quantity. New line: counts against `MAX_LINES`. Resulting quantity validated **in this transaction** against `getAvailableStock` and `MAX_QTY_PER_LINE`; over the limit → `CART_QUANTITY_EXCEEDS_STOCK` / `CART_QUANTITY_LIMIT` with the allowed maximum. Sets `priceAtAddPaise` to the current price. | Receipt by `requestId` |
| `setQuantity` | `cartItemId, quantity` | **Absolute** quantity. Ownership check. `quantity <= 0` deletes. Increases are validated in the transaction against availability and `MAX_QTY_PER_LINE`; decreases always succeed (even if the boutique is closed). Does not touch `priceAtAddPaise`. Replaces v1 `updateQuantity`. | Naturally idempotent |
| `removeItem` | `cartItemId` | Ownership check. Missing line → success with `{ removed: false }`. | Naturally idempotent |
| `clearCart` | — | Deletes the user's lines. | Naturally idempotent |
| `replaceCart` | `requestId, productId, size, quantity` | **Atomic** clear-and-add for the one-boutique conflict. Validates the new line first (same rules as `addItem`, including OPEN boutique), so a failure leaves the old cart intact. Returns the removed lines for "Move to Wishlist". | Receipt by `requestId` |
| `removeUnavailableLines` | `statuses?: CartLineStatus[]` | Deletes the caller's lines in the given non-purchasable statuses. Only runs on explicit shopper action (D10); never called automatically. Replaces v1 `removeInvalidItems`. | Naturally idempotent |
| `acknowledgePriceChanges` | — | Sets `priceAtAddPaise` to the current price on every line. Called when the shopper dismisses the price-change notice. | Naturally idempotent |
| `mergeGuestCart` | `items: GuestLine[], resolution?: "keep_guest" \| "keep_account"` | See §6. Rate-limited: `checkRateLimit(ctx, "cart_merge:" + userId, 10, 10 * 60_000)`. | Naturally idempotent (max-not-sum) |

Error codes are `ConvexError({ code, message, ...data })` so mobile can branch on `code`: `CART_DIFFERENT_BOUTIQUE`, `CART_QUANTITY_EXCEEDS_STOCK`, `CART_QUANTITY_LIMIT`, `CART_LINE_LIMIT`, `CART_PRODUCT_UNAVAILABLE`, `CART_BOUTIQUE_CLOSED`, `CART_BOUTIQUE_PAUSED`, `CART_REQUEST_REUSED`.

### 5.4 Internal

- **`onBoutiqueSuspended(boutiqueId)`** — replace the two full-table scans with `cartItems.by_boutiqueId`. Keeps the in-app notification per affected user.
- **`cleanupCartRequestReceipts`** — cron (hourly) deleting receipts older than `RECEIPT_TTL_MS` via `by_createdAt`, in bounded batches.

## 6. Guest merge (D2, D3, D4)

Guest line: `{ productId: string (slug or id), size, quantity, priceAtAddPaise?, addedAt }`.

```
mergeGuestCart(items, resolution?)
  1. Resolve guest lines -> products; drop unknown/deleted products into droppedGuestLines (with reason).
     Lines from closed or paused boutiques are KEPT and merged; they surface as non-purchasable in the result (D10).
  2. Load account lines.
  3. plan = planGuestMerge(accountLines, validGuestLines)

  Empty guest bag              -> { kind: "merged", noChange }        (client clears device bag)
  Mixed guest bag              -> write NOTHING, return
   (spans >1 boutique)            { kind: "invalid_guest_bag", guestBoutiqueIds, guestLines }
                                  The one-boutique-per-bag invariant applies to the device bag too; a
                                  mixed bag is corrupt/legacy local state. The client repairs it or asks
                                  the shopper. NEVER silently keep one boutique's lines. Independent of
                                  the account cart and of any resolution.
  Account cart empty           -> insert guest lines
  Same boutique                -> combine: same (product,size) takes max(guest, account) quantity,
                                  capped at min(available, MAX_QTY_PER_LINE); keep the earlier priceAtAddPaise
                                  so a pre-sign-in price rise is still flagged; enforce MAX_LINES
                                  (earliest addedAt kept, extras returned as droppedGuestLines)
  Different boutiques, no resolution
                               -> write NOTHING, return
                                  { kind: "conflict",
                                    account: { boutique, lines },
                                    guest:   { boutique, lines } }      (both fully evaluated, for the choice screen)
  Different boutiques + resolution
      keep_guest               -> replace account lines with guest lines (one transaction); return displacedAccountLines
      keep_account             -> leave account lines; return guest lines as displaced
```

- Returns `{ kind: "merged", cart: <getCart shape>, droppedGuestLines, displacedLines }`.
- The client clears the device bag **only** after a `merged` response. On `conflict` it shows the choice screen and calls again with `resolution`. If the app is killed in between, the device bag is still there and the flow repeats on next launch.
- Displaced lines are returned, not silently deleted, so the client can offer "Move to Wishlist" (wishlist is device-local today).

## 7. Idempotency and retries

Two layers:

1. **Transport.** The Convex client queues mutations and resends unacknowledged ones after a reconnect. **To verify during step 1:** confirm in the Convex client documentation/source for the installed version whether a resent mutation can execute twice. This spec does not rely on it either way.
2. **Application.** Covers the case the transport can't: the app (or shopper) issues the same intent again after a timeout, crash or ambiguous error.

| Operation | Strategy | Replay outcome |
|---|---|---|
| `setQuantity`, `removeItem`, `clearCart`, `removeUnavailableLines`, `acknowledgePriceChanges` | Absolute target state | Same final state; no duplicates |
| `mergeGuestCart` | `max(guest, account)`; conflict writes nothing; resolution result is a fixed target | Same final state |
| `addItem` | **Receipt** keyed by `(userId, requestId)` | Returns the stored result; quantity added once |
| `replaceCart` | **Receipt** keyed by `(userId, requestId)` | Returns the stored result, including the originally removed lines |

Receipt rules:
- The client generates one UUID per **user intent** (one tap of "Add to Bag"), keeps it while retrying that intent, and discards it once a result arrives.
- The receipt is inserted **in the same transaction** as the write, so a committed write always has its receipt and a failed write never does.
- A replayed `requestId` returns the stored `result` without writing.
- The same `requestId` reused with a different operation → `CART_REQUEST_REUSED`.
- Validation failures (`CART_QUANTITY_EXCEEDS_STOCK`, etc.) write no receipt; a retry re-evaluates against current stock, which is correct.

## 8. Concurrency and stock races

```
getCart shows 2 available
      ↓
shopper taps +            ← decision made on a stale read
      ↓
another shopper checks out and the checkout session decrements stock
      ↓
setQuantity(3) runs       ← must see the new stock
```

- `addItem`, `setQuantity` (increases) and `replaceCart` call `getAvailableStock` **inside the mutation**, reading the product and the reservation rows in the same transaction as the write. Convex serialisable transactions (OCC) rerun the mutation if those rows change before commit, so the check and the write can't interleave with a concurrent checkout or reservation.
- `availableStock` in query responses is advisory UI data only.
- The cart holds no stock (D12). A line that was valid when added can become `out_of_stock` or `quantity_exceeded` later; `getCart` reports it and the shopper decides (`suggestedActions`).
- Checkout (`initCheckoutSessionInternal`) is still the final gate and the only place stock is held.

## 9. Price-change flag (D6)

- `priceChanged = unitPricePaise !== priceAtAddPaise`; UI shows "Price changed from ₹{priceAtAdd}" in rupees.
- `priceAtAddPaise` refreshes on `addItem` for that line and for all lines on `acknowledgePriceChanges`.
- Checkout keeps its own tolerance check (`STALE_CART_PRICE`, ₹1). The flag exists so shoppers see the change **before** checkout rejects it.

## 10. Order placement clears only ordered lines (D7)

Replace the three "delete every cart line for the user" blocks with `clearOrderedLines(ctx, userId, orderedItems)`:

| Site | Items source |
|---|---|
| `convex/payments.ts` `verifyPaymentAndPlaceOrderInternal` (~1271) | `session.items` |
| `convex/webhooks/razorpay.ts` `processPaymentCaptured` (~662) | `session.items` |
| `convex/orders.ts` `placeOrder` (~718) | `args.items` |

- Session items store `productId` as a string that may be a slug or an id, so `clearOrderedLines` resolves each to a product id before matching `(productId, size)`.
- A Buy Now order leaves the rest of the bag untouched. An order placed from the bag clears exactly those lines.
- Both the client verify path and the webhook can run for one payment; clearing is idempotent (already-deleted lines are skipped).
- Web impact: none today (the web never writes to the server cart).

## 11. Mobile client contract

- **Guest bag** (AsyncStorage key `hive_guest_bag_v1`): `GuestLine[]`, at most `MAX_LINES`, quantity at most `MAX_QTY_PER_LINE`. Rendered via `previewItems`. Local edits are validated against the preview response.
- **Sign-in:** after `syncUser` resolves, call `mergeGuestCart(deviceBag)`; handle `merged` / `conflict` as §6. Only then switch the Bag screen to `getCart`.
- **Signed in:** `getCart` subscription. Writes use Convex optimistic updates, rolled back on error codes. `addItem` / `replaceCart` carry a per-intent `requestId` (§7).
- **Unavailable lines** (closed, paused, out of stock, etc.): show "Currently unavailable" with the line's `suggestedActions`. The bag never removes a line on the shopper's behalf. Checkout is blocked while `hasBlockingIssues` is true.
- **Delivery:** the bag shows "Delivery calculated at checkout" (D11).
- **Sign-out:** clear the device bag (it belongs to nobody) and let the `getCart` subscription drop. The account cart stays on the server.
- **Checkout** is built from `getCart` purchasable lines (bag) or a single Buy Now line; it still calls `createCheckoutSession`, which revalidates and holds stock.
- **Coordinates** passed to `getCart` / `previewItems` are rounded to 3 decimals.

## 12. Web during mobile V1 (D5)

- Web keeps its Zustand bag and checkout.
- In the same change as the schema, remove the dead `getCart` "stock sync" from `apps/customer/src/app/cart/page.tsx` and `checkout/review/page.tsx` (it only ever read an empty server cart) and the `removeInvalidItems` call, so they don't break on the new API. Web `clearCart` calls keep working (no args).
- Web migration to v2 is a separate spec.

## 13. Rollout (stop for review between steps)

1. **Helpers + tests, no behaviour change:** `getAvailableStock` extraction with `validateProductSizeAndStock` refactored onto it; `lib/cart.ts` pure planner and price helpers; tests (§14). Verify the Convex mutation-resend behaviour noted in §7. Deploy is safe (checkout behaviour unchanged).
2. **Schema v2 (`cartItems`, `cartRequestReceipts`) + queries + mutations + receipt cleanup cron + web dead-code removal.** Precondition: `npx convex data cartItems --prod` returns no documents. Deploy Convex, then push web.
3. **Order placement change** (§10), deployed on its own so it can be reverted independently.
4. Mobile Bag screens consume the API (separate task).

## 14. Tests

Pure (`convex/tests/`, run by `npm test`):
- `planGuestMerge`: empty guest; empty account; same-boutique combine with max-not-sum; per-line cap at available and 10; 20-line overflow keeps earliest `addedAt`; different boutiques without resolution → conflict and no writes; `keep_guest`; `keep_account`; idempotent replay; closed-boutique guest lines kept but non-purchasable.
- Limits: 20 lines counts product+size, not units (e.g. 4 lines / 12 units allowed; 21st line rejected); 10-unit line cap; stock cap below 10.
- Availability: stock minus the three lock statuses; `excludeReservationId`; size normalisation; the refactored `validateProductSizeAndStock` keeps its existing messages.
- Status mapping: `CLOSED_TODAY` / `CLOSED_EXTENDED` → `boutique_closed`, not purchasable, `suggestedActions` remove + wishlist; `PAUSED` → `boutique_paused`.
- Price flag: unchanged, increase, decrease; `effectiveSellingPricePaise` discount rules; rupee fields equal paise / 100 at ₹99, ₹100, ₹999, ₹10,000, ₹12,500.
- Receipt logic: first call writes and stores result; replay returns stored result without writing; reused id with different operation → `CART_REQUEST_REUSED`; validation failure stores nothing.
- `clearOrderedLines` matching: id and slug session items; different size not cleared; second call is a no-op.

Dev deployment checks after each deploy (scripted with `ConvexHttpClient` as a test user):
- Add two sizes, exceed stock → `CART_QUANTITY_EXCEEDS_STOCK`; exceed 10 → `CART_QUANTITY_LIMIT`; 21st line → `CART_LINE_LIMIT`.
- Add from a second boutique → `CART_DIFFERENT_BOUTIQUE`; `replaceCart` swaps atomically.
- `addItem` sent twice with the same `requestId` → quantity added once.
- Stock race: two clients increase the last unit concurrently → one succeeds, one gets `CART_QUANTITY_EXCEEDS_STOCK`.
- Closed boutique: add → `CART_BOUTIQUE_CLOSED`; existing line shows `boutique_closed` and is not deleted.
- Guest merge: same boutique combine; different boutique → conflict then `keep_guest` / `keep_account`.
- Change a product's price → `priceChanged` true; `acknowledgePriceChanges` → false.
- Buy Now order leaves other bag lines; bag order clears only its lines.

## 15. Out of scope for V1

- Purchasing from closed boutiques, pre-order, or next-operating-day fulfilment (D10).
- Delivery-fee estimation in the bag (D11).
- Reservation items in the server cart (the store-closed reservation flow stays separate; mobile V1 excludes reservations).
- Coupons and promo codes in the bag (applied at checkout as today).
- Server-synced wishlist.
- Web bag migration (D5).
