import { shouldClearForSignIn } from "./sessionOwner";

/**
 * Regression tests for clearing browser-persisted shopping state between accounts.
 *
 * The production fault: logout only signed out of Firebase, so the bag, checkout selections and
 * saved addresses stayed in localStorage and the next customer on the same browser saw them.
 * Logout now clears that state; these tests pin down the sign-in rule that also covers sessions
 * which ended without an explicit logout.
 */
export function runSessionOwnerTests() {
  let passed = 0;
  let failed = 0;

  function check(name: string, actual: unknown, expected: unknown) {
    if (actual === expected) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.log(`[FAIL] ${name}\n  expected: ${expected}\n  actual:   ${actual}`);
    }
  }

  check("guest signing in keeps their bag (no owner)", shouldClearForSignIn(null, "user_a"), false);
  check("empty owner is treated as no owner", shouldClearForSignIn("", "user_a"), false);
  check("undefined owner is treated as no owner", shouldClearForSignIn(undefined, "user_a"), false);
  check("same account signing in keeps state", shouldClearForSignIn("user_a", "user_a"), false);
  check("different account signing in clears state", shouldClearForSignIn("user_a", "user_b"), true);

  console.log(`\nSession owner: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}

// Run immediately if executed via tsx, matching convex/tests/signatureTest.ts.
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("sessionOwner.test")) {
  const { failed } = runSessionOwnerTests();
  if (failed > 0) process.exit(1);
}
