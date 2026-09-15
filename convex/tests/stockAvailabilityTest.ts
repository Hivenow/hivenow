import {
  normalizeSize,
  resolveSizeStock,
  computeAvailableStock,
  countReservationLocks,
  getAvailableStock,
} from "../lib/inventory";
import { validateProductSizeAndStock } from "../lib/mockInventory";

/**
 * Tests for the shared stock rule: available = stock for the size − reservations holding a unit.
 *
 * validateProductSizeAndStock (checkout) was refactored onto the helpers in lib/inventory.ts so the
 * cart can reuse the same rule without throwing. These tests pin the helpers and, against a small
 * in-memory stand-in for the Convex database, prove every checkout error message is unchanged.
 */

type Doc = Record<string, any>;

function makeDb(seed: { products: Doc[]; reservations?: Doc[] }) {
  const tables: Record<string, Doc[]> = {
    products: seed.products.map((d) => ({ ...d })),
    reservations: (seed.reservations ?? []).map((d) => ({ ...d })),
  };

  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const api: any = {
      withIndex(_name: string, fn: (q: any) => any) {
        const captured: Record<string, unknown> = {};
        const q = {
          eq(field: string, value: unknown) {
            captured[field] = value;
            return q;
          },
        };
        fn(q);
        rows = rows.filter((r) => Object.entries(captured).every(([f, v]) => r[f] === v));
        return api;
      },
      collect: async () => rows,
      unique: async () => {
        if (rows.length > 1) throw new Error("unique() matched more than one row");
        return rows[0] ?? null;
      },
      first: async () => rows[0] ?? null,
    };
    return api;
  }

  return {
    get: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const hit = rows.find((r) => r._id === id);
        if (hit) return hit;
      }
      return null;
    },
    query,
  } as any;
}

const kurti = (overrides: Doc = {}): Doc => ({
  _id: "products_kurti",
  slug: "cotton-kurti",
  sizes: ["S", "M", "FS"],
  stockBySize: { S: 0, M: 3, Free: 2 },
  ...overrides,
});

const hold = (id: string, status: string, size = "M", productId = "products_kurti"): Doc => ({
  _id: id,
  productId,
  size,
  status,
});

export async function runStockAvailabilityTests() {
  let passed = 0;
  let failed = 0;

  function check(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual) ?? "undefined";
    const e = JSON.stringify(expected) ?? "undefined";
    if (a === e) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.log(`[FAIL] ${name}\n  expected: ${e}\n  actual:   ${a}`);
    }
  }

  /** Runs checkout validation and returns "ok" or the ConvexError message. */
  async function validate(db: any, productId: string, size: string, quantity: number, exclude?: string) {
    try {
      await validateProductSizeAndStock(db, productId, size, quantity, exclude);
      return "ok";
    } catch (err: any) {
      return typeof err?.data === "string" ? err.data : String(err?.message ?? err);
    }
  }

  // ── Pure helpers ──────────────────────────────────────────────────────────
  check("normalizeSize maps FS to Free", normalizeSize("FS"), "Free");
  check("normalizeSize maps 'free size' to Free", normalizeSize(" free size "), "Free");
  check("normalizeSize trims other sizes", normalizeSize(" M "), "M");
  check("resolveSizeStock uses exact key", resolveSizeStock({ M: 3 }, "M"), 3);
  check("resolveSizeStock falls back to normalized key", resolveSizeStock({ Free: 2 }, "FS"), 2);
  check("resolveSizeStock is 0 for missing size", resolveSizeStock({ M: 3 }, "XL"), 0);
  check("resolveSizeStock is 0 for missing map", resolveSizeStock(undefined, "M"), 0);
  check("computeAvailableStock: no reservations", computeAvailableStock(3, 0), { stock: 3, lockedByReservations: 0, available: 3 });
  check("computeAvailableStock: partial", computeAvailableStock(3, 2), { stock: 3, lockedByReservations: 2, available: 1 });
  check("computeAvailableStock: fully reserved", computeAvailableStock(2, 2).available, 0);
  check("computeAvailableStock: never negative", computeAvailableStock(1, 4).available, 0);

  // ── Reservation locks ─────────────────────────────────────────────────────
  const locksDb = makeDb({
    products: [kurti()],
    reservations: [
      hold("r1", "reservation_active"),
      hold("r2", "awaiting_store_confirmation"),
      hold("r3", "awaiting_payment"),
      hold("r4", "payment_expired"),
      hold("r5", "order_confirmed"),
      hold("r6", "reservation_active", "S"),
    ],
  });
  check("locks count only the three holding statuses for the size", await countReservationLocks(locksDb, "products_kurti" as any, "M"), 3);
  check("locks exclude the checking-out reservation", await countReservationLocks(locksDb, "products_kurti" as any, "M", "r3"), 2);

  // ── getAvailableStock ─────────────────────────────────────────────────────
  const noHolds = makeDb({ products: [kurti()] });
  check("getAvailableStock: no reservation", await getAvailableStock(noHolds, "products_kurti" as any, "M"), {
    productFound: true, sizeExists: true, stock: 3, lockedByReservations: 0, available: 3,
  });
  const partial = makeDb({ products: [kurti()], reservations: [hold("r1", "reservation_active")] });
  check("getAvailableStock: partial reservation", (await getAvailableStock(partial, "products_kurti" as any, "M")).available, 2);
  const full = makeDb({ products: [kurti({ stockBySize: { M: 2 } })], reservations: [hold("r1", "awaiting_payment"), hold("r2", "reservation_active")] });
  check("getAvailableStock: fully reserved", (await getAvailableStock(full, "products_kurti" as any, "M")).available, 0);
  check("getAvailableStock: Free size via FS", (await getAvailableStock(noHolds, "products_kurti" as any, "FS")).available, 2);
  check("getAvailableStock: size not offered", await getAvailableStock(noHolds, "products_kurti" as any, "XL"), {
    productFound: true, sizeExists: false, stock: 0, lockedByReservations: 0, available: 0,
  });
  check("getAvailableStock: missing product does not throw", await getAvailableStock(noHolds, "products_missing" as any, "M"), {
    productFound: false, sizeExists: false, stock: 0, lockedByReservations: 0, available: 0,
  });

  // ── Checkout validation: behaviour and messages unchanged ──────────────────
  check("checkout: ok by slug", await validate(noHolds, "cotton-kurti", "M", 3), "ok");
  check("checkout: ok by id", await validate(noHolds, "products_kurti", "M", 1), "ok");
  check("checkout: partial reservation still allows remaining units", await validate(partial, "cotton-kurti", "M", 2), "ok");
  check(
    "checkout: quantity exceeds available (message)",
    await validate(partial, "cotton-kurti", "M", 3),
    'Requested quantity (3) exceeds available stock (2) for size "M".'
  );
  check(
    "checkout: fully reserved (message)",
    await validate(full, "cotton-kurti", "M", 1),
    'All units of size "M" are currently reserved by other customers.'
  );
  check(
    "checkout: own reservation excluded when checking out",
    await validate(makeDb({ products: [kurti({ stockBySize: { M: 1 } })], reservations: [hold("mine", "awaiting_payment")] }), "cotton-kurti", "M", 1, "mine"),
    "ok"
  );
  check("checkout: out of stock (message)", await validate(noHolds, "cotton-kurti", "S", 1), 'Size "S" is out of stock.');
  check(
    "checkout: invalid size (message)",
    await validate(noHolds, "cotton-kurti", "XL", 1),
    'Invalid size "XL" for product. Available sizes: S, M, FS'
  );
  check("checkout: empty size (message)", await validate(noHolds, "cotton-kurti", "  ", 1), "Size selection is mandatory.");
  check(
    "checkout: hidden product (message)",
    await validate(makeDb({ products: [kurti({ adminHidden: true })] }), "cotton-kurti", "M", 1),
    "The item is temporarily unavailable for purchase."
  );
  check(
    "checkout: nonexistent product (message)",
    await validate(noHolds, "no-such-product", "M", 1),
    'The product with slug/ID "no-such-product" is no longer available.'
  );
  check("checkout: FS request matches Free stock", await validate(noHolds, "cotton-kurti", "FS", 2), "ok");

  console.log(`\nStock availability: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("stockAvailabilityTest")) {
  runStockAvailabilityTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
