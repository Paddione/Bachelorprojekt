# Stripe Checkout — mentolder Homepage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can purchase mentolder coaching packages directly via Stripe Checkout (hosted) from the homepage service cards and the Leistungen page.

**Architecture:** `src/lib/stripe.ts` holds the Stripe client and product map. A POST endpoint creates Checkout Sessions server-side and returns the hosted URL; the browser redirects to Stripe. After payment, a webhook handler sends a Mattermost notification. K8s manifests are updated to inject Stripe env vars and allow HTTPS egress.

**Tech Stack:** stripe npm, Astro SSR (Node), Svelte 5, Kubernetes (mentolder + korczewski clusters), Mattermost webhooks

---

## File Map

| Action | File |
|---|---|
| Create | `website/src/lib/stripe.ts` |
| Create | `website/src/pages/api/stripe/checkout.ts` |
| Create | `website/src/pages/api/stripe/webhook.ts` |
| Create | `website/src/pages/stripe/success.astro` |
| Modify | `website/src/config/types.ts` — add `stripeServiceKey?` to `HomepageService` |
| Modify | `website/src/config/brands/mentolder.ts` — add `stripeServiceKey` to services |
| Modify | `website/src/components/ServiceCard.svelte` — add optional Stripe CTA button |
| Modify | `website/src/pages/index.astro` — pass `stripeServiceKey` to ServiceCard |
| Modify | `website/src/pages/leistungen.astro` — dual CTA: Kaufen + Termin |
| Modify | `website/src/env.d.ts` — declare Stripe env var types |
| Modify | `k3d/website.yaml` — add Stripe env entries + HTTPS egress NetworkPolicy |
| Modify | `k3d/website-dev-secrets.yaml` — add placeholder Stripe keys |

---

### Task 1: Install stripe package + declare env types

**Files:**
- Modify: `website/package.json`
- Modify: `website/src/env.d.ts`

- [ ] **Step 1: Install stripe**

```bash
cd website && npm install stripe
```

Expected: `added N packages`, `stripe` appears in `package.json` dependencies.

- [ ] **Step 2: Add Stripe types to `website/src/env.d.ts`**

Inside `interface ImportMetaEnv` (after the last existing entry), add:

```typescript
  // Stripe
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_PUBLISHABLE_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
```

- [ ] **Step 3: Commit**

```bash
cd website && git add package.json package-lock.json src/env.d.ts
git commit -m "feat(stripe): install stripe package and declare env types"
```

---

### Task 2: Create `src/lib/stripe.ts`

**Files:**
- Create: `website/src/lib/stripe.ts`

- [ ] **Step 1: Create the stripe lib**

Write `website/src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export interface StripeProduct {
  name: string;
  amountCents: number;
  currency: 'eur';
}

export const STRIPE_PRODUCTS: Record<string, StripeProduct> = {
  'digital-cafe-einzel': { name: '50+ digital — Einzelstunde',          amountCents: 6000,  currency: 'eur' },
  'digital-cafe-5er':    { name: '50+ digital — 5er-Paket',             amountCents: 27000, currency: 'eur' },
  'digital-cafe-10er':   { name: '50+ digital — 10er-Paket',            amountCents: 50000, currency: 'eur' },
  'digital-cafe-gruppe': { name: '50+ digital — Gruppe',                 amountCents: 4000,  currency: 'eur' },
  'coaching-session':    { name: 'Coaching — Einzelsession (90 Min.)',   amountCents: 15000, currency: 'eur' },
  'coaching-6er':        { name: 'Coaching — 6er-Paket',                 amountCents: 80000, currency: 'eur' },
  'coaching-intensiv':   { name: 'Coaching — Intensivtag (6 Std.)',      amountCents: 50000, currency: 'eur' },
};

export async function createCheckoutSession(params: {
  serviceKey: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const product = STRIPE_PRODUCTS[params.serviceKey];
  if (!product) throw new Error(`Unknown serviceKey: ${params.serviceKey}`);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    automatic_payment_methods: { enabled: true },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.amountCents,
          product_data: { name: product.name },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { serviceKey: params.serviceKey },
    locale: 'de',
  });

  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return session.url;
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/stripe.ts
git commit -m "feat(stripe): add stripe client and product map"
```

---

### Task 3: Create checkout API endpoint

**Files:**
- Create: `website/src/pages/api/stripe/checkout.ts`

- [ ] **Step 1: Create the endpoint**

Write `website/src/pages/api/stripe/checkout.ts`:

```typescript
import type { APIRoute } from 'astro';
import { createCheckoutSession, STRIPE_PRODUCTS } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const serviceKey: string = body?.serviceKey ?? '';

    if (!serviceKey || !STRIPE_PRODUCTS[serviceKey]) {
      return new Response(
        JSON.stringify({ error: 'Ungültiger Service-Key.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl = (process.env.SITE_URL || 'https://web.mentolder.de').replace(/\/$/, '');
    const url = await createCheckoutSession({
      serviceKey,
      successUrl: `${siteUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/leistungen`,
    });

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return new Response(
      JSON.stringify({ error: 'Checkout konnte nicht gestartet werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/stripe/checkout.ts
git commit -m "feat(stripe): add POST /api/stripe/checkout endpoint"
```

---

### Task 4: Create success page

**Files:**
- Create: `website/src/pages/stripe/success.astro`

- [ ] **Step 1: Create success page**

Write `website/src/pages/stripe/success.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import BugReportWidget from '../../components/BugReportWidget.svelte';
import { stripe } from '../../lib/stripe';

const sessionId = Astro.url.searchParams.get('session_id') ?? '';

let productName = '';
let amountFormatted = '';
let customerEmail = '';

if (sessionId && process.env.STRIPE_SECRET_KEY) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
    productName = session.line_items?.data[0]?.description ?? '';
    const amount = session.amount_total ?? 0;
    amountFormatted = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount / 100);
    customerEmail = session.customer_details?.email ?? '';
  } catch {
    // Stripe unreachable or invalid session — generic success shown
  }
}
---

<Layout title="Zahlung erfolgreich — Mentolder">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-2xl mx-auto px-6 text-center">

      <div class="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-8 border border-green-800">
        <svg class="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 class="text-4xl font-bold text-light mb-4 font-serif">Zahlung erfolgreich!</h1>

      {productName && (
        <p class="text-xl text-gold mb-2">{productName}</p>
      )}
      {amountFormatted && (
        <p class="text-2xl font-bold text-light mb-6">{amountFormatted}</p>
      )}

      <p class="text-lg text-muted mb-4">
        Vielen Dank für Ihre Buchung. Gerald meldet sich in der Regel innerhalb von 24 Stunden bei Ihnen.
      </p>
      {customerEmail && (
        <p class="text-muted mb-8">
          Eine Bestätigung wurde an <span class="text-light">{customerEmail}</span> gesendet.
        </p>
      )}

      <a
        href="/"
        class="inline-block bg-gold hover:bg-gold-light text-dark px-8 py-3 rounded-full font-bold transition-colors uppercase tracking-wide text-sm"
      >
        Zur Startseite
      </a>

      <div class="mt-20 pt-8 border-t border-dark-lighter text-left">
        <p class="text-sm text-muted mb-4 text-center">
          Gab es Probleme bei der Zahlung? Bitte melden Sie uns den Fehler:
        </p>
        <BugReportWidget client:load />
      </div>

    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/stripe/success.astro
git commit -m "feat(stripe): add /stripe/success page with BugReportWidget"
```

---

### Task 5: Create webhook handler

**Files:**
- Create: `website/src/pages/api/stripe/webhook.ts`

- [ ] **Step 1: Create webhook handler**

Write `website/src/pages/api/stripe/webhook.ts`:

```typescript
import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';
import { postWebhook } from '../../../lib/mattermost';

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

    await postWebhook({
      text:
        `💳 **Neue Zahlung eingegangen!**\n\n` +
        `**Service:** ${serviceKey}\n` +
        `**Betrag:** ${amountFormatted}\n` +
        `**Kunde:** ${customerEmail}\n` +
        `**Stripe Session:** ${session.id}`,
      icon_emoji: ':moneybag:',
    });
  }

  return new Response('OK', { status: 200 });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/stripe/webhook.ts
git commit -m "feat(stripe): add webhook handler with Mattermost notification"
```

---

### Task 6: Update config types + mentolder brand

**Files:**
- Modify: `website/src/config/types.ts` — `HomepageService` interface
- Modify: `website/src/config/brands/mentolder.ts` — services array

- [ ] **Step 1: Add `stripeServiceKey?` to `HomepageService` in `types.ts`**

In `website/src/config/types.ts`, find the `HomepageService` interface and add the new optional field after `price`:

```typescript
export interface HomepageService {
  slug: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
  price: string;
  stripeServiceKey?: string;
  pageContent: ServicePageContent;
}
```

- [ ] **Step 2: Add `stripeServiceKey` to mentolder services**

In `website/src/config/brands/mentolder.ts`, in the `services` array:

For the `digital-cafe` entry, add after `price: 'Ab 60 € / Stunde'`:
```typescript
      stripeServiceKey: 'digital-cafe-einzel',
```

For the `coaching` entry, add after `price: 'Ab 150 € / Session'`:
```typescript
      stripeServiceKey: 'coaching-session',
```

The `beratung` entry gets no `stripeServiceKey` (price is "nach Vereinbarung").

- [ ] **Step 3: Commit**

```bash
git add website/src/config/types.ts website/src/config/brands/mentolder.ts
git commit -m "feat(stripe): add stripeServiceKey to HomepageService type and mentolder config"
```

---

### Task 7: Update ServiceCard + index.astro

**Files:**
- Modify: `website/src/components/ServiceCard.svelte`
- Modify: `website/src/pages/index.astro`

- [ ] **Step 1: Rewrite `ServiceCard.svelte` with optional Stripe CTA**

Replace the full content of `website/src/components/ServiceCard.svelte`:

```svelte
<script lang="ts">
  interface Props {
    title: string;
    description: string;
    icon: string;
    features: string[];
    href: string;
    price?: string;
    stripeServiceKey?: string;
  }

  let { title, description, icon, features, href, price, stripeServiceKey }: Props = $props();

  let loading = $state(false);
  let errorMsg = $state('');

  async function handleBuy() {
    loading = true;
    errorMsg = '';
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceKey: stripeServiceKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        errorMsg = data.error || 'Checkout fehlgeschlagen.';
      }
    } catch {
      errorMsg = 'Verbindungsfehler. Bitte erneut versuchen.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-8 hover:border-gold/30 transition-all duration-300 hover:-translate-y-1 flex flex-col h-full">
  <div class="text-5xl mb-6">{icon}</div>
  <h3 class="text-2xl font-bold text-light mb-3 font-serif">{title}</h3>
  <p class="text-muted text-lg mb-6 leading-relaxed">{description}</p>

  <ul class="space-y-3 mb-8 flex-1">
    {#each features as feature}
      <li class="flex items-start gap-3 text-muted">
        <svg class="w-6 h-6 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{feature}</span>
      </li>
    {/each}
  </ul>

  {#if price}
    <p class="text-lg font-semibold text-gold mb-4">{price}</p>
  {/if}

  <a
    {href}
    class="block text-center bg-gold hover:bg-gold-light text-dark px-6 py-3.5 rounded-full font-bold text-lg transition-colors uppercase tracking-wide"
  >
    Mehr erfahren
  </a>

  {#if stripeServiceKey}
    <button
      type="button"
      onclick={handleBuy}
      disabled={loading}
      class="mt-3 block w-full text-center border border-gold/60 hover:border-gold text-gold px-6 py-2.5 rounded-full font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if loading}
        Wird geladen…
      {:else}
        💳 Direkt buchen & zahlen
      {/if}
    </button>
    {#if errorMsg}
      <p class="text-red-400 text-xs mt-2 text-center">{errorMsg}</p>
    {/if}
  {/if}
</div>
```

- [ ] **Step 2: Pass `stripeServiceKey` from `index.astro` to ServiceCard**

In `website/src/pages/index.astro`, find the `services.map(...)` block (around line 56) and add the new prop:

```astro
        {services.map((service) => (
          <ServiceCard
            title={service.title}
            description={service.description}
            icon={service.icon}
            features={service.features}
            href={`/${service.slug}`}
            price={service.price}
            stripeServiceKey={service.stripeServiceKey}
            client:visible
          />
        ))}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/ServiceCard.svelte website/src/pages/index.astro
git commit -m "feat(stripe): add Stripe checkout CTA to ServiceCard and homepage"
```

---

### Task 8: Update leistungen.astro

**Files:**
- Modify: `website/src/pages/leistungen.astro`

- [ ] **Step 1: Replace single CTA with dual CTAs on each service card**

In `website/src/pages/leistungen.astro`, replace the inner `<div class="flex flex-col">` card block (the `cat.services.map(...)` section, currently lines 44–65) with this version that adds a "Jetzt kaufen" button for services with a numeric price, keeping the booking link as secondary CTA:

```astro
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cat.services.map((svc) => {
              const hasStripe = svc.price !== 'nach Vereinbarung';
              return (
                <div class={`bg-dark-light rounded-xl p-6 border ${svc.highlight ? 'border-gold' : 'border-dark-lighter'} flex flex-col`}>
                  <div class="flex-1">
                    <h3 class="text-xl font-bold text-light mb-1">{svc.name}</h3>
                    <div class="mb-3">
                      <span class="text-2xl font-bold text-gold">{svc.price}</span>
                      <span class="text-muted-dark ml-2">{svc.unit}</span>
                    </div>
                    <p class="text-muted mb-4">{svc.desc}</p>
                  </div>
                  <div class="flex flex-col gap-2 mt-auto">
                    {hasStripe ? (
                      <>
                        <button
                          type="button"
                          class="stripe-buy-btn w-full text-center bg-gold hover:bg-gold-light text-dark px-6 py-3 rounded-full font-bold transition-colors uppercase tracking-wide text-sm"
                          data-service-key={svc.key}
                        >
                          💳 Jetzt kaufen
                        </button>
                        <a
                          href={`${leistungenCta.href}?service=${svc.key}`}
                          class="block text-center border border-gold/40 hover:border-gold text-gold px-6 py-2 rounded-full font-semibold text-sm transition-colors"
                        >
                          Termin vereinbaren
                        </a>
                      </>
                    ) : (
                      <a
                        href={leistungenCta.href}
                        class="block text-center bg-gold hover:bg-gold-light text-dark px-6 py-3 rounded-full font-bold transition-colors uppercase tracking-wide text-sm"
                      >
                        {leistungenCta.text}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
```

- [ ] **Step 2: Add client-side script to handle buy button clicks**

Append a `<script>` block at the bottom of `website/src/pages/leistungen.astro` (before `</Layout>`):

```astro
<script>
  document.querySelectorAll<HTMLButtonElement>('.stripe-buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const serviceKey = btn.dataset.serviceKey;
      if (!serviceKey) return;
      const originalText = btn.textContent ?? '';
      btn.textContent = 'Wird geladen…';
      btn.disabled = true;
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceKey }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert(data.error || 'Checkout fehlgeschlagen. Bitte erneut versuchen.');
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } catch {
        alert('Verbindungsfehler. Bitte erneut versuchen.');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  });
</script>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/leistungen.astro
git commit -m "feat(stripe): add dual CTA (Kaufen + Termin) to Leistungen page"
```

---

### Task 9: K8s manifest updates

**Files:**
- Modify: `k3d/website.yaml`
- Modify: `k3d/website-dev-secrets.yaml`

- [ ] **Step 1: Add Stripe env entries to the website Deployment in `k3d/website.yaml`**

In `k3d/website.yaml`, find the `containers[0].env` block (after the existing `SMTP_PASS` secretKeyRef entry around line 135). Add these three entries:

```yaml
            - name: STRIPE_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: STRIPE_SECRET_KEY
            - name: STRIPE_PUBLISHABLE_KEY
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: STRIPE_PUBLISHABLE_KEY
            - name: STRIPE_WEBHOOK_SECRET
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: STRIPE_WEBHOOK_SECRET
                  optional: true
```

- [ ] **Step 2: Append HTTPS egress NetworkPolicy to `k3d/website.yaml`**

Append at the very end of `k3d/website.yaml`:

```yaml
---
# Stripe API Egress: Website-Pod darf api.stripe.com (HTTPS) und andere externe HTTPS-Dienste erreichen
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-https-egress
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - ports:
    - port: 443
      protocol: TCP
```

- [ ] **Step 3: Add placeholder Stripe keys to `k3d/website-dev-secrets.yaml`**

In `k3d/website-dev-secrets.yaml`, add to `stringData`:

```yaml
  STRIPE_SECRET_KEY: "sk_test_dev_placeholder"
  STRIPE_PUBLISHABLE_KEY: "pk_test_dev_placeholder"
  STRIPE_WEBHOOK_SECRET: ""
```

- [ ] **Step 4: Validate manifests**

```bash
task workspace:validate 2>&1 | tail -5
```

Expected: no errors (exit 0).

- [ ] **Step 5: Commit**

```bash
git add k3d/website.yaml k3d/website-dev-secrets.yaml
git commit -m "feat(stripe): inject Stripe env vars into website deployment + allow HTTPS egress"
```

---

### Task 10: Add live Stripe keys to website-secrets + deploy

*(Cluster-state changes — no git commits needed)*

- [ ] **Step 1: Add keys to mentolder `website-secrets`**

```bash
SK="<your sk_live_... key from Stripe Dashboard>"
PK="<your pk_live_... key from Stripe Dashboard>"

kubectl --context=mentolder patch secret website-secrets -n website \
  --type=json \
  -p="[
    {\"op\":\"add\",\"path\":\"/data/STRIPE_SECRET_KEY\",\"value\":\"$(echo -n $SK | base64 -w0)\"},
    {\"op\":\"add\",\"path\":\"/data/STRIPE_PUBLISHABLE_KEY\",\"value\":\"$(echo -n $PK | base64 -w0)\"}
  ]"
```

Expected: `secret/website-secrets patched`

- [ ] **Step 2: Add keys to korczewski `website-secrets`**

```bash
kubectl --context=korczewski patch secret website-secrets -n website \
  --type=json \
  -p="[
    {\"op\":\"add\",\"path\":\"/data/STRIPE_SECRET_KEY\",\"value\":\"$(echo -n $SK | base64 -w0)\"},
    {\"op\":\"add\",\"path\":\"/data/STRIPE_PUBLISHABLE_KEY\",\"value\":\"$(echo -n $PK | base64 -w0)\"}
  ]"
```

Expected: `secret/website-secrets patched`

- [ ] **Step 3: Build and deploy**

```bash
task website:deploy
```

Expected: new website pod in Running state.

- [ ] **Step 4: Smoke-test the checkout endpoint**

```bash
kubectl --context=mentolder exec -n website \
  $(kubectl --context=mentolder get pods -n website -l app=website -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'node -e "
fetch(\"http://localhost:4321/api/stripe/checkout\", {
  method: \"POST\",
  headers: { \"Content-Type\": \"application/json\" },
  body: JSON.stringify({ serviceKey: \"coaching-session\" })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d))).catch(e => console.error(e.message));
"'
```

Expected: `{"url":"https://checkout.stripe.com/c/pay/..."}` — a real Stripe hosted URL.

---

### Task 11: Register Stripe webhook + add STRIPE_WEBHOOK_SECRET

- [ ] **Step 1: Register webhook in Stripe Dashboard**

Go to the Stripe Dashboard → Developers → Webhooks → "Add endpoint":
- **Endpoint URL:** `https://web.mentolder.de/api/stripe/webhook`
- **Events to listen to:** `checkout.session.completed`
- Click "Add endpoint"
- Copy the **Signing secret** (starts with `whsec_`)

- [ ] **Step 2: Store webhook secret in both clusters**

```bash
WHSEC="whsec_PASTE_HERE"

kubectl --context=mentolder patch secret website-secrets -n website \
  --type=json \
  -p="[{\"op\":\"add\",\"path\":\"/data/STRIPE_WEBHOOK_SECRET\",\"value\":\"$(echo -n $WHSEC | base64 -w0)\"}]"

kubectl --context=korczewski patch secret website-secrets -n website \
  --type=json \
  -p="[{\"op\":\"add\",\"path\":\"/data/STRIPE_WEBHOOK_SECRET\",\"value\":\"$(echo -n $WHSEC | base64 -w0)\"}]"
```

- [ ] **Step 3: Restart website pod**

```bash
kubectl --context=mentolder rollout restart deployment/website -n website
kubectl --context=mentolder rollout status deployment/website -n website
```

Expected: `deployment "website" successfully rolled out`

- [ ] **Step 4: Verify webhook via Stripe test event**

In Stripe Dashboard → Webhooks → your endpoint → "Send test event" → `checkout.session.completed`

Then check Mattermost (anfragen channel) for:
```
💳 Neue Zahlung eingegangen!
Service: unbekannt
Betrag: 0,00 €
Kunde: ...
```

---

### Task 12: Resolve bug report

- [ ] **Step 1: Identify the correct bug report**

The following are currently open. Ask the user which one corresponds to the Stripe/payment request:

| Ticket-ID | Beschreibung |
|---|---|
| BR-20260415-4754 | Whiteboard-Darstellungsfehler aus Vault |
| BR-20260415-c59e | Vault → Kundenlogin erfordert erneutes Login |
| BR-20260415-2556 | Vault → Invoice erfordert erneutes Login |
| BR-20260415-9355 | Projektmanagementsystem als Erweiterungswunsch |

If a newer Stripe-related ticket was created, query the DB:

```bash
kubectl --context=mentolder exec -n website \
  $(kubectl --context=mentolder get pods -n website -l app=website -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'node -e "
const { Pool } = require(\"pg\");
const pool = new Pool({ connectionString: process.env.SESSIONS_DATABASE_URL });
pool.query(\"SELECT ticket_id, LEFT(description,100) as desc FROM bug_tickets ORDER BY created_at DESC LIMIT 5\")
  .then(r => { r.rows.forEach(r => console.log(r.ticket_id, \"|\", r.desc)); pool.end(); });
"'
```

- [ ] **Step 2: Resolve via admin UI**

Navigate to `https://web.mentolder.de/admin/bugs` → find the ticket → click "Erledigt" → enter:

```
Stripe Checkout (hosted) implementiert. Kunden können Pakete direkt auf der Homepage und Leistungen-Seite per Kreditkarte kaufen. Live-Keys sk_live/pk_live hinterlegt, Webhook bei Stripe registriert, Mattermost-Notification aktiv.
```
