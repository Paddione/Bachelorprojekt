<script lang="ts">
  interface Props {
    num: string;
    title: string;
    meta?: string;
    description: string;
    features: string[];
    price: string;
    priceUnit?: string;
    href: string;
    stripeServiceKey?: string;
  }

  let { num, title, meta, description, features, price, priceUnit, href, stripeServiceKey }: Props = $props();

  let loading = $state(false);
  let errorMsg = $state('');

  // Split price on "/" to extract unit if not provided
  const [priceMain, priceUnitFallback] = price.split('/').map(s => s.trim());
  const displayUnit = priceUnit ?? priceUnitFallback ?? '';

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

<div class="offer">
  <span class="no" aria-hidden="true">{num}</span>

  <div class="title-col">
    <h3>{title}</h3>
    {#if meta}
      <span class="meta-label">{meta}</span>
    {/if}
  </div>

  <div class="desc-col">
    <p class="desc">{description}</p>
    {#if features.length > 0}
      <ul aria-label="Leistungen">
        {#each features as feature}
          <li>{feature}</li>
        {/each}
      </ul>
    {/if}
    {#if stripeServiceKey}
      <button
        type="button"
        onclick={handleBuy}
        disabled={loading}
        class="buy-btn"
        aria-label="Direkt buchen und bezahlen"
      >
        {loading ? 'Wird geladen…' : '💳 Direkt buchen & zahlen'}
      </button>
      {#if errorMsg}
        <p class="error" role="alert">{errorMsg}</p>
      {/if}
    {/if}
  </div>

  <div class="price">
    <span class="p">{priceMain}</span>
    {#if displayUnit}
      <span class="u">{displayUnit}</span>
    {/if}
  </div>

  <a {href} class="go" aria-label="Mehr über {title} erfahren">
    Mehr
    <span aria-hidden="true">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 7h10M8 3l4 4-4 4"/>
      </svg>
    </span>
  </a>
</div>

<style>
  .offer {
    display: grid;
    grid-template-columns: 80px 1fr 1.6fr 220px 140px;
    gap: 36px;
    align-items: start;
    padding: 36px 0;
    border-top: 1px solid var(--line);
    transition: background 0.25s ease;
    position: relative;
  }

  .offer:last-child {
    border-bottom: 1px solid var(--line);
  }

  .offer:hover {
    background: linear-gradient(to right, transparent, rgba(232,200,112,.03) 40%, transparent);
  }

  .no {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.1em;
    color: var(--mute);
    padding-top: 6px;
  }

  .title-col h3 {
    font-family: var(--serif);
    font-size: 28px;
    font-weight: 400;
    letter-spacing: -0.015em;
    color: var(--fg);
    margin: 0;
    line-height: 1.1;
  }

  .meta-label {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sage);
    margin-top: 8px;
  }

  .desc {
    color: var(--fg-soft);
    font-size: 15px;
    line-height: 1.6;
    margin: 0;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: grid;
    gap: 6px;
  }

  ul li {
    font-size: 13px;
    color: var(--mute);
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  ul li::before {
    content: "";
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--brass);
    display: inline-block;
    flex: 0 0 auto;
    transform: translateY(-3px);
  }

  .price {
    border-left: 1px solid var(--line);
    padding-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 6px;
  }

  .price .p {
    font-family: var(--serif);
    font-size: 26px;
    color: var(--fg);
    letter-spacing: -0.015em;
    line-height: 1.1;
  }

  .price .u {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--mute);
    text-transform: uppercase;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--brass);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    justify-self: end;
    margin-top: 6px;
  }

  .go span {
    width: 34px;
    height: 34px;
    border: 1px solid var(--line-2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .go svg {
    width: 14px;
    height: 14px;
  }

  .offer:hover .go span {
    background: var(--brass);
    border-color: var(--brass);
    color: var(--ink-900);
  }

  .buy-btn {
    margin-top: 12px;
    background: none;
    border: 1px solid var(--line-2);
    color: var(--fg-soft);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
    font-family: var(--sans);
  }

  .buy-btn:hover:not(:disabled) {
    border-color: var(--brass);
    color: var(--brass);
  }

  .buy-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    color: oklch(0.65 0.2 25);
    font-size: 12px;
    margin-top: 6px;
  }

  @media (max-width: 1000px) {
    .offer {
      grid-template-columns: 40px 1fr 140px;
      row-gap: 14px;
    }

    .desc-col {
      grid-column: 2 / -1;
    }

    .price {
      border-left: none;
      padding-left: 0;
      grid-column: 2 / 3;
    }

    .go {
      grid-column: 3 / 4;
      align-self: center;
    }
  }

  @media (max-width: 640px) {
    .offer {
      grid-template-columns: 40px 1fr;
      row-gap: 12px;
    }

    .desc-col {
      grid-column: 1 / -1;
    }

    .price {
      grid-column: 1 / -1;
    }

    .go {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
