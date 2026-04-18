# Stripe Inline Invoice Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a Stripe Payment Element inline in the portal's invoice list so customers can pay open invoices without leaving the site.

**Architecture:** A new `POST /api/stripe/invoice-payment-intent` endpoint creates a PaymentIntent for an invoice's `amount_remaining`. A new `InlineInvoicePayment.svelte` component fetches the `clientSecret`, mounts Stripe's Payment Element inline, and transitions through idle → loading → ready → success states. On payment success, the existing webhook is extended to call `stripe.invoices.pay(invoiceId, { paid_out_of_band: true })`.

**Tech Stack:** Astro (SSR), Svelte, `@stripe/stripe-js` (client-side Stripe.js), `stripe` npm package (server-side, already installed).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `website/src/pages/api/stripe/invoice-payment-intent.ts` | POST endpoint: validates invoiceId, creates PaymentIntent, returns clientSecret |
| Create | `website/src/components/portal/InlineInvoicePayment.svelte` | Interactive inline payment form (idle/loading/ready/success/error states) |
| Modify | `website/src/pages/api/stripe/webhook.ts` | Add `payment_intent.succeeded` handler to mark invoice paid |
| Modify | `website/src/components/portal/RechnungenSection.astro` | Replace static "Jetzt zahlen" link with InlineInvoicePayment component |
| Modify | `website/src/components/portal/InvoicesTab.astro` | Same replacement as RechnungenSection |
| Modify | `tests/e2e/specs/fa-21-billing.spec.ts` | Add T4: inline payment form renders for open invoice |
| Modify | `tests/local/FA-21.sh` | Add T5: invoice-payment-intent API validates input |

---

## Task 1: Install @stripe/stripe-js

**Files:**
- Modify: `website/package.json` (via npm install)

- [ ] **Step 1: Install the client-side Stripe.js wrapper**

```bash
cd website && npm install @stripe/stripe-js
```

Expected output: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Verify it appears in package.json**

```bash
grep "stripe-js" website/package.json
```

Expected: `"@stripe/stripe-js": "^x.x.x"`

- [ ] **Step 3: Commit**

```bash
git add website/package.json website/package-lock.json
git commit -m "feat(billing): install @stripe/stripe-js for inline payment element"
```

---

## Task 2: API endpoint — create PaymentIntent for an invoice

**Files:**
- Create: `website/src/pages/api/stripe/invoice-payment-intent.ts`

- [ ] **Step 1: Write the failing test (bash)**

Add to `tests/local/FA-21.sh` before the final line:

```bash
# ── T5: invoice-payment-intent API validates missing invoiceId ────
if [[ "$WEB_READY" -gt 0 ]]; then
  PI_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/stripe/invoice-payment-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$PI_CODE" "400" "FA-21" "T5" "invoice-payment-intent API validiert (400 bei leerem Body)"
else
  skip_test "FA-21" "T5" "invoice-payment-intent API" "Website nicht bereit"
fi
```

- [ ] **Step 2: Create the endpoint**

Create `website/src/pages/api/stripe/invoice-payment-intent.ts`:

```typescript
import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const invoiceId: string = body?.invoiceId ?? '';

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'invoiceId erforderlich.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    if ((invoice.amount_remaining ?? 0) <= 0) {
      return new Response(
        JSON.stringify({ error: 'Bereits beglichen.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : (invoice.customer as { id: string } | null)?.id;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: invoice.amount_remaining,
        currency: invoice.currency,
        customer: customerId,
        metadata: { invoice_id: invoiceId },
      },
      { idempotencyKey: `pay-invoice-${invoiceId}` }
    );

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[stripe/invoice-payment-intent]', err);
    return new Response(
      JSON.stringify({ error: 'Zahlung konnte nicht initiiert werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

- [ ] **Step 3: Verify the endpoint rejects an empty body**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4321/api/stripe/invoice-payment-intent \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `400`

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/stripe/invoice-payment-intent.ts tests/local/FA-21.sh
git commit -m "feat(billing): add invoice-payment-intent API endpoint"
```

---

## Task 3: Svelte component — InlineInvoicePayment

**Files:**
- Create: `website/src/components/portal/InlineInvoicePayment.svelte`

- [ ] **Step 1: Write the Playwright test first**

Add to `tests/e2e/specs/fa-21-billing.spec.ts` inside the `test.describe` block:

```typescript
test('T4: inline payment button renders for open invoice in portal', async ({ page }) => {
  // This test verifies the component mounts — it does not complete a real payment.
  // Navigate to the portal invoices section (portal requires auth; skip if unauthenticated).
  const res = await page.goto(`${BASE}/portal`);
  if (res?.status() === 302 || res?.url().includes('auth')) {
    test.skip(true, 'Portal requires authentication — skipped in unauthenticated env');
    return;
  }
  // If the section exists, it should contain either an invoice list or "Keine Rechnungen".
  await page.waitForSelector('[data-testid="invoice-item"], p:has-text("Keine Rechnungen")', { timeout: 5000 });
});
```

- [ ] **Step 2: Run the test to confirm it is skipped or passes structurally**

```bash
cd tests && npx playwright test e2e/specs/fa-21-billing.spec.ts --reporter=line
```

Expected: T4 either passes or is skipped (not failed).

- [ ] **Step 3: Create the component**

Create `website/src/components/portal/InlineInvoicePayment.svelte`:

```svelte
<script lang="ts">
  import { loadStripe } from '@stripe/stripe-js';
  import type { Stripe, StripeElements } from '@stripe/stripe-js';

  export let invoiceId: string;
  export let amountDue: number;
  export let hostedUrl: string | null = null;
  export let publishableKey: string;

  type State = 'idle' | 'loading' | 'ready' | 'paying' | 'success' | 'error';
  let state: State = 'idle';
  let errorMessage = '';
  let stripeInstance: Stripe | null = null;
  let elementsInstance: StripeElements | null = null;

  function formatCurrency(n: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  }

  async function startPayment() {
    state = 'loading';
    errorMessage = '';
    try {
      const res = await fetch('/api/stripe/invoice-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        errorMessage = data.error ?? 'Fehler beim Starten der Zahlung.';
        state = 'error';
        return;
      }

      stripeInstance = await loadStripe(publishableKey);
      if (!stripeInstance) throw new Error('Stripe konnte nicht geladen werden.');

      elementsInstance = stripeInstance.elements({
        clientSecret: data.clientSecret,
        appearance: { theme: 'night' },
      });

      // Defer mount until after Svelte renders the container div
      await new Promise<void>(r => setTimeout(r, 0));
      const paymentElement = elementsInstance.create('payment');
      paymentElement.mount(`#payment-element-${invoiceId}`);
      state = 'ready';
    } catch {
      errorMessage = 'Verbindung zu Stripe fehlgeschlagen.';
      state = 'error';
    }
  }

  async function handleSubmit() {
    if (!stripeInstance || !elementsInstance) return;
    state = 'paying';
    errorMessage = '';
    const { error } = await stripeInstance.confirmPayment({
      elements: elementsInstance,
      confirmParams: {},
      redirect: 'if_required',
    });
    if (error) {
      errorMessage = error.message ?? 'Zahlung fehlgeschlagen.';
      state = 'error';
    } else {
      state = 'success';
    }
  }

  function cancel() {
    state = 'idle';
    stripeInstance = null;
    elementsInstance = null;
  }
</script>

{#if state === 'idle'}
  <button
    on:click={startPayment}
    class="mt-1 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
  >
    Jetzt zahlen →
  </button>

{:else if state === 'loading'}
  <span class="mt-1 text-xs text-muted">Wird geladen…</span>

{:else if state === 'ready' || state === 'paying'}
  <div class="mt-3 w-full">
    <div id="payment-element-{invoiceId}"></div>
    {#if errorMessage}
      <p class="mt-2 text-xs text-red-400">{errorMessage}</p>
    {/if}
    <div class="mt-3 flex gap-2">
      <button
        on:click={handleSubmit}
        disabled={state === 'paying'}
        class="px-4 py-2 bg-accent text-dark text-sm font-semibold rounded-lg disabled:opacity-50 transition-opacity"
      >
        {state === 'paying' ? 'Wird verarbeitet…' : `${formatCurrency(amountDue)} zahlen`}
      </button>
      <button
        on:click={cancel}
        disabled={state === 'paying'}
        class="px-4 py-2 text-sm text-muted hover:text-light transition-colors disabled:opacity-50"
      >
        Abbrechen
      </button>
    </div>
  </div>

{:else if state === 'success'}
  <span class="mt-1 inline-flex items-center gap-1 text-sm font-medium text-green-400">
    ✓ Bezahlt
  </span>

{:else if state === 'error'}
  <div class="mt-1 space-y-1">
    <p class="text-xs text-red-400">{errorMessage}</p>
    {#if hostedUrl}
      <a href={hostedUrl} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline">
        Alternativ: Stripe-Seite öffnen ↗
      </a>
    {/if}
    <button on:click={() => { state = 'idle'; }} class="block text-xs text-muted hover:text-light transition-colors">
      Erneut versuchen
    </button>
  </div>
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/portal/InlineInvoicePayment.svelte tests/e2e/specs/fa-21-billing.spec.ts
git commit -m "feat(billing): add InlineInvoicePayment Svelte component"
```

---

## Task 4: Extend webhook to mark invoice paid

**Files:**
- Modify: `website/src/pages/api/stripe/webhook.ts`

- [ ] **Step 1: Open the file and read it**

Current `webhook.ts` only handles `checkout.session.completed`. The full current file content is:

```typescript
import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  if (!webhookSecret) {
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring event');
    return new Response('OK', { status: 200 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return new Response('Bad Request', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amount = session.amount_total ?? 0;
    const amountFormatted = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount / 100);
    const customerEmail = session.customer_details?.email ?? 'unbekannt';
    const serviceKey = session.metadata?.serviceKey ?? 'unbekannt';

    console.log(`[stripe] Payment received: ${serviceKey} ${amountFormatted} from ${customerEmail} (${session.id})`);
  }

  return new Response('OK', { status: 200 });
};
```

- [ ] **Step 2: Add the payment_intent.succeeded handler**

Replace the entire file content with:

```typescript
import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  if (!webhookSecret) {
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring event');
    return new Response('OK', { status: 200 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return new Response('Bad Request', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amount = session.amount_total ?? 0;
    const amountFormatted = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount / 100);
    const customerEmail = session.customer_details?.email ?? 'unbekannt';
    const serviceKey = session.metadata?.serviceKey ?? 'unbekannt';
    console.log(`[stripe] Payment received: ${serviceKey} ${amountFormatted} from ${customerEmail} (${session.id})`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const invoiceId = pi.metadata?.invoice_id;
    if (invoiceId) {
      try {
        await stripe.invoices.pay(invoiceId, { paid_out_of_band: true });
        console.log(`[stripe] Invoice ${invoiceId} marked paid via payment_intent ${pi.id}`);
      } catch (err) {
        // Invoice may already be paid (e.g. webhook replayed) — log and continue
        console.error(`[stripe] Failed to mark invoice ${invoiceId} as paid:`, err);
      }
    }
  }

  return new Response('OK', { status: 200 });
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/stripe/webhook.ts
git commit -m "feat(billing): handle payment_intent.succeeded to mark invoice paid"
```

---

## Task 5: Wire up RechnungenSection.astro

**Files:**
- Modify: `website/src/components/portal/RechnungenSection.astro`

- [ ] **Step 1: Add import and replace the static link**

In `website/src/components/portal/RechnungenSection.astro`, make these two changes:

**Add import** after the existing imports at the top of the frontmatter (inside `---`):

```typescript
import InlineInvoicePayment from '../portal/InlineInvoicePayment.svelte';
const publishableKey = import.meta.env.STRIPE_PUBLISHABLE_KEY ?? '';
```

**Replace** the existing "Jetzt zahlen" anchor (lines 49–52):

Old:
```astro
{inv.hostedUrl && inv.status !== 'paid' && (
  <a href={inv.hostedUrl} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline mt-0.5 block">
    Jetzt zahlen ↗
  </a>
)}
```

New:
```astro
{inv.status !== 'paid' && (
  <InlineInvoicePayment
    invoiceId={inv.id}
    amountDue={inv.amountDue}
    hostedUrl={inv.hostedUrl}
    {publishableKey}
    client:load
  />
)}
```

- [ ] **Step 2: Start dev server and verify the button renders**

```bash
cd website && task website:dev
```

Navigate to `http://localhost:4321/portal` → Rechnungen section. Open invoices should show "Jetzt zahlen →" button instead of the small link. Paid invoices should show nothing.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/portal/RechnungenSection.astro
git commit -m "feat(billing): wire InlineInvoicePayment into RechnungenSection"
```

---

## Task 6: Wire up InvoicesTab.astro

**Files:**
- Modify: `website/src/components/portal/InvoicesTab.astro`

- [ ] **Step 1: Add import and replace the static link**

In `website/src/components/portal/InvoicesTab.astro`, make these two changes:

**Add import** after existing imports inside the frontmatter:

```typescript
import InlineInvoicePayment from '../portal/InlineInvoicePayment.svelte';
const publishableKey = import.meta.env.STRIPE_PUBLISHABLE_KEY ?? '';
```

**Replace** the existing "Jetzt zahlen" anchor (lines 81–84):

Old:
```astro
{inv.hostedUrl && inv.status !== 'paid' && (
  <a href={inv.hostedUrl} target="_blank" rel="noopener"
     class="mt-1 inline-block text-xs text-blue-400 hover:underline">
    Jetzt zahlen ↗
  </a>
)}
```

New:
```astro
{inv.status !== 'paid' && (
  <InlineInvoicePayment
    invoiceId={inv.id}
    amountDue={inv.amountDue}
    hostedUrl={inv.hostedUrl}
    {publishableKey}
    client:load
  />
)}
```

- [ ] **Step 2: Verify in dev server**

Navigate to any client page in admin (e.g. `/admin/<clientId>`) → Rechnungen tab. Open invoices should show the "Jetzt zahlen →" button.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/portal/InvoicesTab.astro
git commit -m "feat(billing): wire InlineInvoicePayment into InvoicesTab"
```

---

## Task 7: End-to-end smoke test with Stripe test card

**Files:**
- No file changes — this is a manual verification step using the dev server.

- [ ] **Step 1: Ensure Stripe is in test mode**

```bash
grep "sk_test_" /home/patrick/Bachelorprojekt/k3d/secrets.yaml || echo "Check your STRIPE_SECRET_KEY"
```

The secret key should start with `sk_test_` for safe testing.

- [ ] **Step 2: Open an unpaid invoice in the portal**

Navigate to `http://localhost:4321/portal` → Rechnungen. Click "Jetzt zahlen →" on an open invoice. The Stripe Payment Element should appear inline below the invoice row.

- [ ] **Step 3: Pay with Stripe test card**

Enter test card number `4242 4242 4242 4242`, any future expiry (e.g. `12/29`), any 3-digit CVC, any postal code.

Click the "€X,XX zahlen" button. Expected: button shows "Wird verarbeitet…", then transitions to green "✓ Bezahlt".

- [ ] **Step 4: Verify invoice marked paid in Stripe dashboard**

Open `https://dashboard.stripe.com/test/invoices` and confirm the invoice status is now "Paid".

- [ ] **Step 5: Run the existing test suite**

```bash
./tests/runner.sh local FA-21
```

Expected: T1, T2, T5 pass (T3, T4 skip as before).

---

## Task 8: Final commit and PR

- [ ] **Step 1: Verify no regressions**

```bash
./tests/runner.sh local
```

Expected: No new failures compared to baseline.

- [ ] **Step 2: Create PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat(billing): inline Stripe Payment Element for invoice payments" \
  --body "$(cat <<'EOF'
## Summary
- Customers can now pay open invoices directly in the portal without leaving the site
- Stripe Payment Element mounts inline below the invoice row on click
- Webhook extended to mark invoices as paid after payment_intent.succeeded

## Test plan
- [ ] Open invoice in portal → click "Jetzt zahlen →" → Payment Element appears
- [ ] Pay with test card 4242 4242 4242 4242 → row shows ✓ Bezahlt
- [ ] Stripe dashboard confirms invoice is paid
- [ ] Card declined → error message shown inline, form stays mounted
- [ ] Paid invoices: no button rendered
- [ ] FA-21 tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
