// convex/lib/mockInventory.ts
// Helper to validate sizes and stock levels for catalog products.
// Handles both mock products and database-backed products.

import { GenericDatabaseWriter, GenericDatabaseReader } from "convex/server";
import { DataModel } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { normalizeSize, resolveSizeStock, countReservationLocks, computeAvailableStock } from "./inventory";

// P1-3 FIX: Mock products are ONLY available when ENABLE_DEBUG_TOOLS is explicitly "true".
// In production, this is an empty object — no mock product IDs will ever match.
const _MOCK_DATA: Record<string, { sizes: string[]; inventory: Record<string, number> }> = {
  "varanasi-silk-katan-saree": {
    sizes: ["FS", "Free"],
    inventory: { FS: 5, Free: 5 },
  },
  "crimson-rose-embroidered-lehenga": {
    sizes: ["S", "M", "L"],
    inventory: { S: 2, M: 3, L: 0 },
  },
  "emerald-hand-painted-anarkali-kurti": {
    sizes: ["S", "M", "L", "XL"],
    inventory: { S: 12, M: 8, L: 4, XL: 2 },
  },
  "saffron-linen-wide-leg-co-ord-set": {
    sizes: ["S", "M", "L"],
    inventory: { S: 5, M: 0, L: 4 },
  },
  "silk-bandhani-midi-dress": {
    sizes: ["S", "M", "L"],
    inventory: { S: 3, M: 5, L: 2 },
  },
  "pastel-pink-chikankari-palazzo-suit": {
    sizes: ["M", "L", "XL"],
    inventory: { M: 8, L: 10, XL: 6 },
  },
  "mulberry-handloom-silk-saree": {
    sizes: ["FS", "Free"],
    inventory: { FS: 3, Free: 3 },
  },
  "royal-indigo-hand-block-print-maxi": {
    sizes: ["S", "M", "L", "XL"],
    inventory: { S: 14, M: 12, L: 0, XL: 8 },
  },
};

export const MOCK_INVENTORY: Record<string, { sizes: string[]; inventory: Record<string, number> }> =
  process.env.ENABLE_DEBUG_TOOLS === "true" ? _MOCK_DATA : {};

// Size normalization and the stock-minus-reservations rule live in ./inventory so checkout and
// the cart share one implementation. Re-exported here for existing importers.
export { normalizeSize };

/**
 * Validates a product size selection and stock level.
 * @param db Convex database reader
 * @param productId Product slug or ID
 * @param size Selected size string (e.g. "S", "M", "FS")
 * @param quantity Requested quantity
 * @returns true if valid, throws an Error with a descriptive message if invalid.
 */
export async function validateProductSizeAndStock(
  db: GenericDatabaseReader<DataModel>,
  productId: string,
  size: string,
  quantity: number,
  excludeReservationId?: string
): Promise<boolean> {
  if (!size || size.trim() === "") {
    throw new ConvexError("Size selection is mandatory.");
  }

  const normalized = normalizeSize(size);

  // 1. Try to check mock products inventory first
  const mockProduct = MOCK_INVENTORY[productId];
  if (mockProduct) {
    const validSizes = mockProduct.sizes.map(normalizeSize);
    if (!validSizes.includes(normalized)) {
      throw new ConvexError(`Invalid size "${size}" for product "${productId}". Available sizes are: ${mockProduct.sizes.join(", ")}`);
    }

    // Check stock. Note: we support keys like FS or Free, or direct normalized matching.
    let stock = 0;
    if (mockProduct.inventory[size] !== undefined) {
      stock = mockProduct.inventory[size];
    } else if (mockProduct.inventory[normalized] !== undefined) {
      stock = mockProduct.inventory[normalized];
    } else if (size === "Free" && mockProduct.inventory["FS"] !== undefined) {
      stock = mockProduct.inventory["FS"];
    } else if (size === "FS" && mockProduct.inventory["Free"] !== undefined) {
      stock = mockProduct.inventory["Free"];
    }

    if (stock === 0) {
      throw new ConvexError(`Size "${size}" is out of stock.`);
    }

    if (stock < quantity) {
      throw new ConvexError(`Requested quantity (${quantity}) exceeds available stock (${stock}) for size "${size}".`);
    }

    return true;
  }

  // 2. Try to query database catalog tables
  let productRow = await db
    .query("products")
    .withIndex("by_slug", (q) => q.eq("slug", productId))
    .unique();

  if (!productRow) {
    try {
      productRow = (await db.get(productId as any)) as any;
    } catch {
      // Ignore
    }
  }

  if (productRow) {
    if (productRow.adminHidden === true) {
      throw new ConvexError("The item is temporarily unavailable for purchase.");
    }
    const validSizes = productRow.sizes.map(normalizeSize);
    if (!validSizes.includes(normalized)) {
      throw new ConvexError(
        `Invalid size "${size}" for product. Available sizes: ${productRow.sizes.join(", ")}`
      );
    }

    // Stock minus units held by other customers' reservations (shared with the cart; see ./inventory).
    // The reserving customer's own reservation is excluded when they check out.
    const stock = resolveSizeStock(productRow.stockBySize, size);
    const lockedStock = await countReservationLocks(db, productRow._id, size, excludeReservationId);
    const { available: availableStock } = computeAvailableStock(stock, lockedStock);

    if (availableStock === 0) {
      if (stock > 0) {
        throw new ConvexError(`All units of size "${size}" are currently reserved by other customers.`);
      } else {
        throw new ConvexError(`Size "${size}" is out of stock.`);
      }
    }

    if (availableStock < quantity) {
      throw new ConvexError(
        `Requested quantity (${quantity}) exceeds available stock (${availableStock}) for size "${size}".`
      );
    }

    return true;
  }

  // Fallback: if product slug/id is not found in either mock inventory or products table, raise error
  throw new ConvexError(`The product with slug/ID "${productId}" is no longer available.`);
}
