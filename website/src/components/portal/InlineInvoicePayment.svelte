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
