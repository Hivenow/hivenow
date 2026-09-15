// convex/lib/inventory.ts
import { GenericMutationCtx, GenericDatabaseReader } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";

// ─── Stock availability ─────────────────────────────────────────────────────
//
// One rule for "how many units can be sold", shared by checkout (via
// validateProductSizeAndStock, which throws) and the cart (getAvailableStock, which doesn't):
//
//   available = max(0, stock for the size − reservations currently holding a unit)
//
// A reservation holds one unit while it is active, awaiting store confirmation, or awaiting
// payment. When the reserving customer checks out, their own reservation is excluded.

/**
 * Standardizes size names. Specifically maps "FS" to "Free".
 */
export function normalizeSize(size: string): string {
  const upper = size.trim().toUpperCase();
  if (upper === "FS" || upper === "FREE SIZE") {
    return "Free";
  }
  return size.trim();
}

/** Reservation statuses that hold one unit of stock. */
export const RESERVATION_LOCK_STATUSES = [
  "reservation_active",
  "awaiting_store_confirmation",
  "awaiting_payment",
] as const;

/** Stock recorded for a size: the exact key first, then the normalized key; 0 when absent. */
export function resolveSizeStock(stockBySize: Record<string, number> | undefined | null, size: string): number {
  if (!stockBySize) return 0;
  if (stockBySize[size] !== undefined) return stockBySize[size]!;
  const normalized = normalizeSize(size);
  if (stockBySize[normalized] !== undefined) return stockBySize[normalized]!;
  return 0;
}

/** Pure availability arithmetic. */
export function computeAvailableStock(stock: number, lockedByReservations: number): {
  stock: number;
  lockedByReservations: number;
  available: number;
} {
  return { stock, lockedByReservations, available: Math.max(0, stock - lockedByReservations) };
}

/**
 * Counts reservations holding a unit of `productId` in exactly `size` (the reservation's stored
 * size string, not normalized), optionally excluding one reservation.
 */
export async function countReservationLocks(
  db: GenericDatabaseReader<DataModel>,
  productId: Id<"products">,
  size: string,
  excludeReservationId?: string
): Promise<number> {
  let count = 0;
  for (const status of RESERVATION_LOCK_STATUSES) {
    const rows = await db
      .query("reservations")
      .withIndex("by_productId_size_status", (q) =>
        q.eq("productId", productId).eq("size", size).eq("status", status)
      )
      .collect();
    for (const r of rows) {
      if (!excludeReservationId || r._id !== excludeReservationId) count++;
    }
  }
  return count;
}

/**
 * Non-throwing availability for one product + size. Callers decide what an insufficient amount
 * means. Purchasability (active, hidden, approval, boutique state) is not judged here.
 */
export async function getAvailableStock(
  db: GenericDatabaseReader<DataModel>,
  productId: Id<"products">,
  size: string,
  excludeReservationId?: string
): Promise<{ productFound: boolean; sizeExists: boolean; stock: number; lockedByReservations: number; available: number }> {
  const product = await db.get(productId);
  if (!product) {
    return { productFound: false, sizeExists: false, stock: 0, lockedByReservations: 0, available: 0 };
  }
  const normalized = normalizeSize(size);
  const sizeExists = (product.sizes ?? []).map(normalizeSize).includes(normalized);
  const stock = resolveSizeStock(product.stockBySize, size);
  const locked = await countReservationLocks(db, product._id, size, excludeReservationId);
  return { productFound: true, sizeExists, ...computeAvailableStock(stock, locked) };
}

/**
 * Shared helper to restore reserved stock from a checkout session.
 * Used during payment failures, webhooks, and session expiration sweeps.
 * 
 * IDEMPOTENT: If session.stockRestoredAt is already set, this is a no-op.
 * After restoring, patches the session with stockRestoredAt to prevent
 * duplicate restoration from concurrent callers.
 */
export async function restoreCheckoutSessionStock(
  ctx: GenericMutationCtx<any>,
  session: any
) {
  // Idempotency guard: if stock was already restored for this session, skip
  if (session.stockRestoredAt) {
    return;
  }

  const now = Date.now();
  for (const item of session.items) {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q: any) => q.eq("slug", item.productId))
      .unique();
    let productRow = product;
    if (!productRow) {
      try {
        productRow = await ctx.db.get(item.productId as Id<"products">);
      } catch { }
    }

    if (productRow && !item.reservationId) {
      const currentStock = productRow.stockBySize[item.size] ?? 0;
      const newStock = currentStock + item.quantity;
      const stockBySize = { ...productRow.stockBySize };
      stockBySize[item.size] = newStock;

      const totalStock = Object.values(stockBySize).reduce((sum: number, val: any) => sum + (val || 0), 0);
      const autoDeactivatedBecauseOutOfStock = totalStock <= 0;

      await ctx.db.patch(productRow._id, { 
        stockBySize, 
        autoDeactivatedBecauseOutOfStock, 
        updatedAt: now 
      });

      await ctx.db.insert("inventoryMovements", {
        productId: productRow._id,
        boutiqueId: productRow.boutiqueId,
        size: item.size,
        beforeQty: currentStock,
        afterQty: newStock,
        adjustmentQty: item.quantity,
        reason: "online_order_reversal",
        source: "return",
        createdBy: session.userId,
        createdAt: now,
      });
    }
  }

  // Mark session as stock-restored (idempotency flag)
  // Under Convex OCC, concurrent callers writing this same field will conflict,
  // and the retrying caller will see stockRestoredAt is set and exit early.
  if (session._id) {
    await ctx.db.patch(session._id, { stockRestoredAt: now });
  }
}

