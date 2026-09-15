// apps/customer/src/lib/sessionOwner.ts
//
// The bag, Buy Now items, checkout selections and saved addresses live in this browser's
// localStorage, not on the account. Without an owner marker, whoever signs in next on a shared
// device inherits the previous customer's shopping state.
//
// The rule: shopping state belongs to the last account that signed in here.
// - A guest who signs in keeps their bag (there is no previous owner to protect).
// - The same account signing in again keeps everything.
// - A different account signing in — including after a session expired without an explicit
//   logout — starts clean.
//
// Deliberately free of store and React imports so it can be unit tested directly.
// Run the tests with: npx tsx apps/customer/src/lib/sessionOwner.test.ts

/** localStorage key holding the Convex user id that owns the persisted shopping state. */
export const SESSION_OWNER_KEY = "hive_session_owner";

export function shouldClearForSignIn(
  previousOwnerId: string | null | undefined,
  signedInUserId: string
): boolean {
  if (!previousOwnerId) return false;
  return previousOwnerId !== signedInUserId;
}
