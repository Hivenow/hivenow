# Go-live dry run (Razorpay test mode)

A guided end-to-end rehearsal to run **before** switching Razorpay to live keys. Every
step below is done in test mode against production Convex (`standing-mosquito-377`),
so nothing here moves real money.

Run the steps in order. After each one, Claude checks the database and Razorpay and
confirms the state before you move on.

---

## 0. Prerequisites

| Item | Where | Status to confirm |
| :--- | :--- | :--- |
| Webhook registered | Razorpay dashboard → Settings → Webhooks | URL `https://standing-mosquito-377.convex.site/webhooks/razorpay` |
| Webhook secret | Razorpay dashboard + Convex prod env | Both equal `RAZORPAY_WEBHOOK_SECRET` |
| Events enabled | Razorpay webhook config | `payment.captured`, `payment.failed`, all `payment.dispute.*`, all `account.*` |
| Auto-capture | Razorpay dashboard → Settings → Payment capture | Automatic, otherwise authorised payments never capture |
| Test seller | One boutique with a Route linked account in **test** mode | `razorpayAccountId` present, KYC activated |

---

## 1. Webhook handshake

1. In the Razorpay dashboard, open the webhook and send a test event.
2. Claude checks the `webhookEvents` table for the event id and the HTTP result.

**Pass:** the event id is stored and the response was 200. A 401 means the secret does
not match; a missing row means the URL is wrong.

---

## 2. Payment and order creation

1. Place an order on the customer app for a product from the test seller.
2. Pay with a Razorpay **test** instrument (test cards are listed in the Razorpay
   dashboard under Test Mode).

**Claude checks:** `payments` row captured with `gatewayFeePaise` recorded, `orders` row
placed with `pricingSnapshot.sellerPayoutPaise`, and a held Route transfer
(`razorpayTransferId`, `transferStatus: "pending"`, `on_hold: true` at Razorpay).

---

## 3. Browser-death rescue

1. Place a second test order, and close the browser tab **during** the Razorpay popup,
   after paying but before the success screen.

**Claude checks:** the `payment.captured` webhook placed the order anyway — the order
exists, is paid, and has exactly one payment row and one transfer (no duplicates).

---

## 4. Delivery and payout release

1. Move the first order to `delivered` (boutique app, or admin order controls).

**Claude checks:** the hold decision ran — Final Sale releases the transfer immediately,
a returns-accepted order gets `on_hold_until = deliveredAt + 24h`. Payout Monitor shows
the order under `paid`, not under Needs attention.

---

## 5. Return and reversal

1. Raise a return on the second order and approve the refund.

**Claude checks:** Razorpay shows one refund (never two), the Route transfer is reversed,
`payoutStatus` moves off `paid`, and the seller is not paid for the returned item.

---

## 6. Failure path

1. Pick a delivered test order for a seller **without** a Route account (or temporarily
   clear the account id on a test boutique).

**Claude checks:** the payout fails, the order appears in Payout Monitor → Needs
attention with the reason, and the Retry button becomes available once the account is
restored.

---

## 7. Freeze and switch to live

Only after steps 1–6 pass:

1. Stop new test orders.
2. Flag the test data so live jobs ignore it:

   ```bash
   npx convex run --prod migrations:markTestModeOrders '{}'
   npx convex run --prod migrations:markTestModeOrders '{"dryRun": false}'
   ```

   The dry run prints how many orders would be flagged; run the second command only when
   that number matches what you expect.
3. Create every seller's Route linked account again in **live** mode and complete KYC
   (test-mode accounts do not carry over).
4. Register the webhook again in live mode, with a fresh secret, and set
   `RAZORPAY_WEBHOOK_SECRET` in Convex prod to the new value.
5. Put the live keys (`rzp_live_…`) in Convex prod and in Vercel for the customer app.
6. Place one small real order, confirm capture, transfer and webhook, then refund it.

---

## Rollback

Test-mode keys can be put back at any point before step 7.6. Orders flagged
`isTestData` stay flagged and stay out of the money jobs, so a second rehearsal later is
safe — re-running the migration only flags orders that are not already flagged.
