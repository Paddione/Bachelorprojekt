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
