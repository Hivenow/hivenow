// convex/lib/cart.ts
// Pure cart v2 helpers (docs/specs/cart-v2.md, revision 2).
//
// Everything here is deterministic and free of database, Convex context and network access, so
// the decisions the spec freezes — line limits, quantity caps, guest merge and boutique conflicts,
// price-change flags — are unit-tested directly (convex/tests/cartPlanTest.ts).
//
// Helpers that need the database (resolving product refs, evaluating a line's status, clearing
// ordered lines) belong to rollout step 2 and are intentionally not here yet.

import { normalizeSize } from "./inventory";

/** Distinct product + size lines in one cart. Physical units are not counted. */
export const MAX_LINES = 20;
/** Units on one line, further capped by available stock. */
export const MAX_QTY_PER_LINE = 10;
/** Lines accepted by previewItems for a guest bag. */
export const MAX_PREVIEW_LINES = 20;

export interface PlanLine {
  productId: string;
  boutiqueId: string;
  size: string;
  quantity: number;
  /** Paise. */
  priceAtAddPaise: number;
  addedAt: number;
}

/** A line's identity: product + size. "FS" / "Free Size" / "Free" are one size. */
export function lineKey(productId: string, size: string): string {
  return `${productId}|${normalizeSize(size)}`;
}

/** The storefront selling price in paise: a lower discountPrice wins, otherwise price. */
export function effectiveSellingPricePaise(product: { price: number; discountPrice?: number | null }): number {
  const { price, discountPrice } = product;
  if (typeof discountPrice === "number" && discountPrice > 0 && discountPrice < price) return discountPrice;
  return price;
}

export function priceChange(currentPricePaise: number, priceAtAddPaise: number): {
  priceChanged: boolean;
  priceDeltaPaise: number;
} {
  const priceDeltaPaise = currentPricePaise - priceAtAddPaise;
  return { priceChanged: priceDeltaPaise !== 0, priceDeltaPaise };
}

/**
 * The quantity a line may hold: at most MAX_QTY_PER_LINE, and at most `available` when stock is
 * known and positive. Stock at zero (or unknown) does not reduce the quantity — the line keeps it
 * and is reported as out of stock, so the shopper decides rather than the cart silently changing it.
 */
export function capLineQuantity(requested: number, available?: number): number {
  let quantity = Math.min(Math.max(Math.floor(requested), 0), MAX_QTY_PER_LINE);
  if (typeof available === "number" && available > 0) quantity = Math.min(quantity, available);
  return quantity;
}

/** Outcome of a quantity-changing write, before it is applied. */
export type QuantityDecision =
  | { ok: true; quantity: number }
  | { ok: false; code: "CART_QUANTITY_LIMIT"; maxQuantity: number }
  | { ok: false; code: "CART_QUANTITY_EXCEEDS_STOCK"; available: number };

/**
 * Validates a target quantity for a write (addItem's resulting quantity, setQuantity increases).
 * Writes never clamp: an over-limit request is rejected with the allowed maximum.
 */
export function decideQuantity(target: number, available: number): QuantityDecision {
  if (target > MAX_QTY_PER_LINE) return { ok: false, code: "CART_QUANTITY_LIMIT", maxQuantity: MAX_QTY_PER_LINE };
  if (target > available) return { ok: false, code: "CART_QUANTITY_EXCEEDS_STOCK", available };
  return { ok: true, quantity: target };
}

/** Whether adding `productId + size` would exceed MAX_LINES for a cart holding `existing`. */
export function wouldExceedLineLimit(existing: Array<Pick<PlanLine, "productId" | "size">>, productId: string, size: string): boolean {
  const keys = new Set(existing.map((l) => lineKey(l.productId, l.size)));
  if (keys.has(lineKey(productId, size))) return false;
  return keys.size >= MAX_LINES;
}

/** The single boutique a set of lines belongs to, "none" when empty, "mixed" when it violates the invariant. */
export function cartBoutique(lines: Array<Pick<PlanLine, "boutiqueId">>): { kind: "none" } | { kind: "single"; boutiqueId: string } | { kind: "mixed" } {
  if (lines.length === 0) return { kind: "none" };
  const first = lines[0]!.boutiqueId;
  return lines.every((l) => l.boutiqueId === first) ? { kind: "single", boutiqueId: first } : { kind: "mixed" };
}

/** Earliest-added first; ties broken by key so ordering is fully deterministic. */
function byAddedAt(a: PlanLine, b: PlanLine): number {
  if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
  return lineKey(a.productId, a.size) < lineKey(b.productId, b.size) ? -1 : 1;
}

/**
 * Collapses lines that share a product + size into one: the larger quantity, the earliest
 * addedAt, and the priceAtAddPaise recorded by that earliest line (so an earlier, lower price
 * still flags a later rise). Output is ordered by addedAt.
 */
export function dedupeLines(lines: PlanLine[]): PlanLine[] {
  const merged = new Map<string, PlanLine>();
  for (const line of [...lines].sort(byAddedAt)) {
    const key = lineKey(line.productId, line.size);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...line });
    } else {
      seen.quantity = Math.max(seen.quantity, line.quantity);
    }
  }
  return [...merged.values()].sort(byAddedAt);
}

export type DroppedReason = "line_limit" | "invalid_quantity";

export interface DroppedLine {
  line: PlanLine;
  reason: DroppedReason;
}

export type MergeResolution = "keep_guest" | "keep_account";

export type MergePlan =
  | { kind: "no_change"; lines: PlanLine[]; droppedGuestLines: DroppedLine[] }
  | {
      // The device guest bag itself spans more than one boutique — corrupt or legacy local state.
      // The caller writes nothing; the client repairs the bag or asks. Never silently discard the
      // lines of one boutique.
      kind: "invalid_guest_bag";
      guestBoutiqueIds: string[];
      guestLines: PlanLine[];
      droppedGuestLines: DroppedLine[];
    }
  | {
      kind: "conflict";
      accountBoutiqueId: string;
      guestBoutiqueId: string;
      accountLines: PlanLine[];
      guestLines: PlanLine[];
      droppedGuestLines: DroppedLine[];
    }
  | {
      kind: "merged";
      lines: PlanLine[];
      droppedGuestLines: DroppedLine[];
      /** Lines no longer in the cart after a boutique conflict was resolved (offer Move to Wishlist). */
      displacedLines: PlanLine[];
    };

export interface GuestMergeInput {
  accountLines: PlanLine[];
  guestLines: PlanLine[];
  /** Available stock per lineKey, when known. Missing keys are capped only by MAX_QTY_PER_LINE. */
  availableByKey?: Map<string, number>;
  resolution?: MergeResolution;
}

function capAll(lines: PlanLine[], availableByKey?: Map<string, number>): PlanLine[] {
  return lines.map((l) => ({
    ...l,
    quantity: capLineQuantity(l.quantity, availableByKey?.get(lineKey(l.productId, l.size))),
  }));
}

/** Keeps `base` lines, then adds `extra` lines earliest-first until MAX_LINES. */
function fillToLineLimit(base: PlanLine[], extra: PlanLine[]): { lines: PlanLine[]; overflow: DroppedLine[] } {
  const lines = [...base];
  const overflow: DroppedLine[] = [];
  for (const line of [...extra].sort(byAddedAt)) {
    if (lines.length < MAX_LINES) lines.push(line);
    else overflow.push({ line, reason: "line_limit" });
  }
  return { lines: lines.sort(byAddedAt), overflow };
}

/**
 * Plans how a device guest bag joins an account cart at sign-in (spec §6).
 *
 * - Empty guest bag: no change.
 * - Account cart empty: the guest bag becomes the cart.
 * - Mixed guest bag: the device bag itself spans two boutiques — invalid state, returned as
 *   "invalid_guest_bag" so the caller can repair or ask; nothing is written.
 * - Same boutique: combine; a shared product + size takes max(guest, account) quantity, never the
 *   sum, so replaying the same guest bag is idempotent. Account lines are always kept; guest-only
 *   lines fill the remaining MAX_LINES slots earliest-first, the rest are dropped with "line_limit".
 * - Different boutiques without a resolution: a conflict — the caller must write nothing and ask
 *   the shopper. With a resolution, the chosen bag becomes the cart and the other is displaced.
 */
export function planGuestMerge(input: GuestMergeInput): MergePlan {
  const { availableByKey, resolution } = input;
  const accountLines = dedupeLines(input.accountLines);

  const invalid: DroppedLine[] = [];
  const validGuest = input.guestLines.filter((l) => {
    const ok = Number.isFinite(l.quantity) && l.quantity >= 1;
    if (!ok) invalid.push({ line: l, reason: "invalid_quantity" });
    return ok;
  });
  const guestDeduped = dedupeLines(validGuest);
  const droppedBeforeMerge = invalid;

  if (guestDeduped.length === 0) {
    return { kind: "no_change", lines: accountLines, droppedGuestLines: droppedBeforeMerge };
  }

  // The one-boutique-per-bag invariant applies to the device bag too. A mixed guest bag is
  // corrupt/legacy local state; surface it rather than silently keeping one boutique's lines.
  const guestBoutiqueInfo = cartBoutique(guestDeduped);
  if (guestBoutiqueInfo.kind === "mixed") {
    return {
      kind: "invalid_guest_bag",
      guestBoutiqueIds: [...new Set(guestDeduped.map((l) => l.boutiqueId))],
      guestLines: guestDeduped,
      droppedGuestLines: droppedBeforeMerge,
    };
  }

  const guestFitted = fillToLineLimit([], capAll(guestDeduped, availableByKey));

  if (accountLines.length === 0) {
    return {
      kind: "merged",
      lines: guestFitted.lines,
      droppedGuestLines: [...droppedBeforeMerge, ...guestFitted.overflow],
      displacedLines: [],
    };
  }

  const accountBoutique = accountLines[0]!.boutiqueId;
  const guestBoutique = guestDeduped[0]!.boutiqueId;

  if (accountBoutique === guestBoutique) {
    const byKey = new Map(accountLines.map((l) => [lineKey(l.productId, l.size), { ...l }]));
    const guestOnly: PlanLine[] = [];
    for (const g of guestDeduped) {
      const key = lineKey(g.productId, g.size);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity = Math.max(existing.quantity, g.quantity);
        if (g.addedAt < existing.addedAt) {
          existing.addedAt = g.addedAt;
          existing.priceAtAddPaise = g.priceAtAddPaise;
        }
      } else {
        guestOnly.push(g);
      }
    }
    const combined = fillToLineLimit(capAll([...byKey.values()], availableByKey), capAll(guestOnly, availableByKey));
    return {
      kind: "merged",
      lines: combined.lines,
      droppedGuestLines: [...droppedBeforeMerge, ...combined.overflow],
      displacedLines: [],
    };
  }

  if (!resolution) {
    return {
      kind: "conflict",
      accountBoutiqueId: accountBoutique,
      guestBoutiqueId: guestBoutique,
      accountLines,
      guestLines: guestFitted.lines,
      droppedGuestLines: [...droppedBeforeMerge, ...guestFitted.overflow],
    };
  }

  if (resolution === "keep_guest") {
    return {
      kind: "merged",
      lines: guestFitted.lines,
      droppedGuestLines: [...droppedBeforeMerge, ...guestFitted.overflow],
      displacedLines: accountLines,
    };
  }

  return {
    kind: "merged",
    lines: accountLines,
    droppedGuestLines: droppedBeforeMerge,
    displacedLines: guestDeduped,
  };
}
