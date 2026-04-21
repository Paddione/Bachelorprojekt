<script lang="ts">
  import { onDestroy, tick } from 'svelte';
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

  onDestroy(() => {
    elementsInstance?.destroy();
    stripeInstance = null;
    elementsInstance = null;
  });

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

      // Set state first so Svelte renders the container div, then mount
      state = 'ready';
      await tick();
      const paymentElement = elementsInstance.create('payment');
      paymentElement.mount(`#payment-element-${invoiceId}`);
    } catch (e) {
      console.error('[InlineInvoicePayment]', e);
      errorMessage = 'Verbindung zu Stripe fehlgeschlagen.';
      state = 'error';
    }
  }

  async function handleSubmit() {
    if (!stripeInstance || !elementsInstance) return;
    state = 'paying';
    errorMessage = '';
    const TIMEOUT_MS = 30000;
    const timeoutPromise = new Promise<{ error: { message: string } }>(resolve =>
      setTimeout(() => resolve({ error: { message: 'Zeitüberschreitung. Bitte prüfen Sie Ihre Verbindung und versuchen es erneut.' } }), TIMEOUT_MS)
    );
    const result = await Promise.race([
      stripeInstance.confirmPayment({
        elements: elementsInstance,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      }),
      timeoutPromise,
    ]);
    if (result.error) {
      errorMessage = result.error.message ?? 'Zahlung fehlgeschlagen.';
      state = 'error';
    } else {
      state = 'success';
    }
  }

  function cancel() {
    elementsInstance?.destroy();
    stripeInstance = null;
    elementsInstance = null;
    state = 'idle';
  }
</script>

{#if state === 'idle'}
  <button
    type="button"
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
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        on:click={handleSubmit}
        disabled={state === 'paying'}
        class="px-4 py-2 bg-accent text-dark text-sm font-semibold rounded-lg disabled:opacity-50 transition-opacity"
      >
        {state === 'paying' ? 'Wird verarbeitet…' : `${formatCurrency(amountDue)} zahlen`}
      </button>
      <button
        type="button"
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
    <button type="button" on:click={() => { state = 'idle'; }} class="block text-xs text-muted hover:text-light transition-colors">
      Erneut versuchen
    </button>
  </div>
{/if}
