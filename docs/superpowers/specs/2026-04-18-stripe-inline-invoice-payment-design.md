# Stripe Inline Invoice Payment

**Date:** 2026-04-18
**Status:** Approved

## Summary

Add an inline Stripe Payment Element to the portal's invoice list so customers can pay open invoices directly on the site, without redirecting to Stripe's hosted invoice page.

## Architecture & Data Flow

```
User clicks "Zahlen" on an open invoice
  → InlineInvoicePayment.svelte POSTs to /api/stripe/invoice-payment-intent { invoiceId }
  → Server retrieves invoice from Stripe, creates PaymentIntent for amount_remaining
    with metadata: { invoice_id }
  → Returns { clientSecret } to client
  → Component mounts Stripe Payment Element inline (dark theme) below the invoice row
  → User enters card details and confirms
  → Stripe confirms payment client-side
  → Component transitions to success state ("Bezahlt ✓"), row updates visually
  → Stripe fires payment_intent.succeeded webhook
  → /api/stripe/webhook calls stripe.invoices.pay(invoiceId, { paid_out_of_band: true })
```

## New Pieces

| File | Role |
|------|------|
| `website/src/pages/api/stripe/invoice-payment-intent.ts` | `POST` endpoint — retrieves invoice, creates PaymentIntent, returns `clientSecret` |
| `website/src/components/portal/InlineInvoicePayment.svelte` | Interactive payment form (idle → loading → success) |
| `website/src/pages/api/stripe/webhook.ts` (extended) | Handles `payment_intent.succeeded` with `invoice_id` metadata → marks invoice paid |

**Unchanged:** `stripe-billing.ts`, `BillingInvoice` shape, overall `RechnungenSection.astro` structure.

## Component Design

`InlineInvoicePayment.svelte` props: `{ invoiceId: string, amountDue: number, hostedUrl: string | null }`

**States:**
- **idle** — "Jetzt zahlen" button (dark theme, replaces current `text-xs` link)
- **loading** — fetches `clientSecret`, mounts `PaymentElement` with `appearance: { theme: 'night' }`
- **success** — green "Bezahlt ✓" badge, form unmounts, no page reload needed

**Integration points:**
- `RechnungenSection.astro` — replace `<a href={inv.hostedUrl}>Jetzt zahlen ↗</a>` with `<InlineInvoicePayment invoiceId={inv.id} amountDue={inv.amountDue} hostedUrl={inv.hostedUrl} client:load />`
- `InvoicesTab.astro` — same replacement

## API Endpoint

`POST /api/stripe/invoice-payment-intent`

Request body: `{ invoiceId: string }`

Logic:
1. Retrieve invoice via `stripe.invoices.retrieve(invoiceId)`
2. If `amount_remaining <= 0` → 400 "Bereits beglichen"
3. `stripe.paymentIntents.create({ amount: invoice.amount_remaining, currency: 'eur', customer: invoice.customer, metadata: { invoice_id: invoiceId } })` with `idempotencyKey: invoiceId`
4. Return `{ clientSecret: paymentIntent.client_secret }`

## Webhook Extension

In `payment_intent.succeeded` handler:
```ts
const invoiceId = event.data.object.metadata?.invoice_id;
if (invoiceId) {
  await stripe.invoices.pay(invoiceId, { paid_out_of_band: true });
}
```

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Invoice already paid | Gated by `status !== 'paid'` check in template — component never renders |
| `amount_remaining <= 0` | API returns 400; component shows "Bereits beglichen" |
| Stripe API unavailable | Component falls back to `hostedUrl` text link |
| Card declined | Payment Element surfaces decline reason inline; form stays mounted for retry |
| Duplicate payment attempt | `idempotencyKey: invoiceId` on PaymentIntent creation — Stripe won't double-charge |
| Webhook fires after UI already updated | `paid_out_of_band` on already-paid invoice is a no-op |
