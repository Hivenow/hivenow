# Cart v2 — Convex Mutation Retry Verification

Rollout step 1, spec §7 · 2026-09-15 · Read-only investigation, no product code depends on it yet.

## Question

Can one `useMutation` / `client.mutation(...)` call reach the server more than once, and if so, can
it execute more than once? Separately: in which situations does the **application** issue the same
cart intent twice?

## Evidence

Installed client: `convex` **1.42.1** (root, used by Convex functions and `apps/mobile`);
`apps/customer` has its own **1.43.0**. Source read from
`node_modules/convex/dist/esm/browser/sync/`.

### 1. A mutation keeps one request id for its lifetime

`client.js` `enqueueMutation`: assigns `requestId = this.nextRequestId` once, builds
`{ type: "Mutation", requestId, udfPath, args }`, sends it, and registers it with
`RequestManager.request(message, mightBeSent)`. The returned promise resolves only when a response
for that `requestId` arrives.

### 2. On reconnect, in-flight mutations are re-sent with the same request id

`client.js` WebSocket `onOpen` sends `Connect` with the **same** `sessionId` (created once in the
client constructor via `newSessionId()`), then:

```js
for (const message of this.requestManager.restart()) {
  this.webSocketManager.sendMessage(message);
}
```

`request_manager.js` `restart()`:
- Requests never sent (`NotSent`) are sent.
- **Mutations already sent (`Requested`) are re-sent — the identical message, same `requestId`.**
- **Actions already sent are not retried**: they are removed and resolved with
  `"Connection lost while action was in flight"`.

So the client does resend a mutation whose outcome it didn't receive, including one the server may
already have executed.

### 3. Execute-once is a server-side guarantee, not visible in client code

The resend carries `(sessionId, requestId)`. Nothing in the client deduplicates execution; that
happens on the server. Convex's documentation states that the client retries mutations until they
are confirmed and that a mutation call executes once from the application's perspective, and that
mutations are serializable transactions retried internally on write conflicts. The different
treatment of actions (not retried, because they aren't idempotent) is consistent with the server
recognising resent mutations.

**Not experimentally verified here.** Reproducing it needs the connection to drop after the server
commits but before the response is delivered, which isn't practical to force reliably from a test.
This conclusion therefore rests on the client source above plus Convex's documented guarantee.

### 4. The guarantee is scoped to one client instance in memory

`inflightRequests` is an in-memory `Map`. It is not persisted, and a new `ConvexReactClient`
generates a new `sessionId`.

## Conclusion

| Situation | Can the same cart intent run twice? | Covered by |
|---|---|---|
| Network drops, same client reconnects | No (documented guarantee; client re-sends with the same request id) | Convex |
| Write conflicts inside the transaction | No — rerun internally before commit | Convex |
| Shopper taps "Add to Bag" twice | **Yes** — two separate mutation calls, two request ids | App: request receipts (spec §7) |
| App code retries after an error or timeout by calling the mutation again | **Yes** — new request id | App: request receipts; avoid manual retries of mutations |
| App killed / reloaded while a mutation is in flight, shopper repeats the action | **Yes** — the pending call is lost with the client; the repeat is a new call. The original may or may not have committed. | App: request receipts keyed by a request id the app persists with the intent |
| New client instance created (e.g. provider remount) with work in flight | **Yes** — new `sessionId`, old requests not re-sent | Keep one client instance for the app's lifetime (module singleton, as the customer web app already does) |
| A mutation promise that never settles during a long outage | Doesn't duplicate by itself; it waits and re-sends on reconnect | Convex. The UI should show "pending", not re-issue |

## Implications for cart v2 (no change to the spec's design)

1. The spec's receipts for `addItem` and `replaceCart` protect against the **application** issuing
   one intent twice (double tap, manual retry, relaunch). They are not a workaround for Convex
   re-executing a mutation.
2. Absolute-state writes (`setQuantity`, `removeItem`, `clearCart`, merge) stay correct even when
   an intent is repeated.
3. Mobile client rules:
   - One `ConvexReactClient` per app process.
   - Never call a cart mutation again because its promise is slow; let the client re-send.
   - Generate the `requestId` per user intent. Persist it with the pending intent if the UI allows
     resuming after relaunch.
4. Actions are not retried after a lost connection, so cart work belongs in mutations, not actions.
