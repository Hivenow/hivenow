// convex/tests/p0HotfixTest.ts
// Regression tests for the three P0 security fixes from the abuse & traffic audit:
//   1. insertMockData      — unauthenticated destructive reseed
//   2. (removed with updatePlatformSettingsFromApi, the legacy markup settings API)
//   3. WhatsApp POST webhook — missing signature verification
//
// Each fix exposes a pure predicate so the security decision can be tested here without
// standing up the Convex runtime, matching the pattern in signatureTest.ts.

import { isSeedingAllowed } from "../seedMutations";
import {
  verifyMetaSignature,
  countStatusUpdates,
  MAX_STATUS_UPDATES_PER_WEBHOOK,
} from "../webhooks/whatsapp";

let passed = 0;
let failed = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${name} - Expected ${String(expected)} but got ${String(actual)}`);
  }
}

/** Signs a payload the way Meta does, so the valid-signature case is genuinely valid. */
async function signPayload(rawBody: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. insertMockData environment gate
// ─────────────────────────────────────────────────────────────────────────────
function testSeedingGate() {
  console.log("\n── insertMockData environment gate ──");

  // Production is refused even when the debug flag is set.
  assertEqual("production + debug enabled -> refused", isSeedingAllowed("production", "true"), false);
  assertEqual("production + debug disabled -> refused", isSeedingAllowed("production", "false"), false);
  assertEqual("production + debug unset -> refused", isSeedingAllowed("production", undefined), false);

  // Non-production still requires an explicit opt-in — an unauthenticated caller against a
  // dev/preview deployment without the flag is refused too.
  assertEqual("development + debug unset -> refused", isSeedingAllowed("development", undefined), false);
  assertEqual("development + debug 'false' -> refused", isSeedingAllowed("development", "false"), false);
  assertEqual("undefined env + debug unset -> refused", isSeedingAllowed(undefined, undefined), false);
  assertEqual("truthy-but-wrong flag value -> refused", isSeedingAllowed("development", "1"), false);

  // The intended dev/QA seed path stays functional.
  assertEqual("development + debug enabled -> allowed", isSeedingAllowed("development", "true"), true);
  assertEqual("test + debug enabled -> allowed", isSeedingAllowed("test", "true"), true);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WhatsApp webhook signature verification + iteration bound
// ─────────────────────────────────────────────────────────────────────────────
async function testWhatsAppWebhook() {
  console.log("\n── WhatsApp POST signature verification ──");

  const secret = "test_app_secret";
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const validSignature = await signPayload(payload, secret);

  assertEqual("valid signature -> accepted", await verifyMetaSignature(payload, validSignature, secret), true);
  assertEqual("missing signature header -> rejected", await verifyMetaSignature(payload, null, secret), false);
  assertEqual("empty signature header -> rejected", await verifyMetaSignature(payload, "", secret), false);
  assertEqual(
    "malformed header (no sha256= prefix) -> rejected",
    await verifyMetaSignature(payload, validSignature.replace("sha256=", ""), secret),
    false
  );
  assertEqual(
    "malformed header (non-hex digest) -> rejected",
    await verifyMetaSignature(payload, "sha256=not-a-hex-digest", secret),
    false
  );
  assertEqual(
    "wrong signature -> rejected",
    await verifyMetaSignature(payload, "sha256=" + "0".repeat(64), secret),
    false
  );
  assertEqual(
    "signature for a different body -> rejected",
    await verifyMetaSignature(payload + " ", validSignature, secret),
    false
  );
  assertEqual(
    "signature from a different secret -> rejected",
    await verifyMetaSignature(payload, await signPayload(payload, "other_secret"), secret),
    false
  );
  assertEqual(
    "app secret not configured -> rejected",
    await verifyMetaSignature(payload, validSignature, undefined),
    false
  );

  console.log("\n── WhatsApp iteration bound ──");

  const mk = (n: number) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { statuses: Array.from({ length: n }, (_, i) => ({ id: `w${i}`, status: "sent" })) } }] }],
  });

  assertEqual("empty payload counts 0", countStatusUpdates({}), 0);
  assertEqual("single status counts 1", countStatusUpdates(mk(1)), 1);
  assertEqual("counts across the bound", countStatusUpdates(mk(MAX_STATUS_UPDATES_PER_WEBHOOK)), MAX_STATUS_UPDATES_PER_WEBHOOK);
  assertEqual(
    "at bound -> not rejected",
    countStatusUpdates(mk(MAX_STATUS_UPDATES_PER_WEBHOOK)) > MAX_STATUS_UPDATES_PER_WEBHOOK,
    false
  );
  assertEqual(
    "over bound -> rejected",
    countStatusUpdates(mk(MAX_STATUS_UPDATES_PER_WEBHOOK + 1)) > MAX_STATUS_UPDATES_PER_WEBHOOK,
    true
  );

  // Fan-out across multiple entries/changes is counted too, not just a single array.
  const spread = {
    object: "whatsapp_business_account",
    entry: Array.from({ length: 10 }, () => ({
      changes: Array.from({ length: 5 }, () => ({
        value: { statuses: Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, status: "sent" })) },
      })),
    })),
  };
  assertEqual("nested fan-out counted (10x5x5)", countStatusUpdates(spread), 250);
  assertEqual("nested fan-out over bound -> rejected", countStatusUpdates(spread) > MAX_STATUS_UPDATES_PER_WEBHOOK, true);
}

export async function runP0HotfixTests() {
  testSeedingGate();
  await testWhatsAppWebhook();

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    throw new Error(`P0 Hotfix Regression Tests Failed (${failed} failures)`);
  }
}

// Run immediately if executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("p0HotfixTest")) {
  runP0HotfixTests();
}
