<script lang="ts">
  import { onMount } from 'svelte';
  import { parseLeitstandQuery, toLeitstandQuery } from '../../lib/sdlc/leitstand-url';
  import DeckQualitaet from './decks/DeckQualitaet.svelte';
  import DeckPlattform from './decks/DeckPlattform.svelte';
  import DeckKi from './decks/DeckKi.svelte';
  import DeckWissen from './decks/DeckWissen.svelte';

  type DeckId = 'qualitaet' | 'plattform' | 'ki' | 'wissen';
  const DECKS: { id: DeckId; label: string }[] = [
    { id: 'qualitaet', label: 'Qualität' },
    { id: 'plattform', label: 'Plattform' },
    { id: 'ki',        label: 'KI' },
    { id: 'wissen',    label: 'Wissen' },
  ];
  const DEFAULT_DECK: DeckId = 'qualitaet';
  const isDeckId = (v: string | undefined): v is DeckId =>
    v === 'qualitaet' || v === 'plattform' || v === 'ki' || v === 'wissen';

  let { initialDeck }: { initialDeck?: string } = $props();
  let active = $state<DeckId>(isDeckId(initialDeck) ? initialDeck : DEFAULT_DECK);

  function pushDeck(next: DeckId) {
    active = next;
    const current = parseLeitstandQuery(new URLSearchParams(window.location.search));
    const qs = toLeitstandQuery({ ...current, deck: next });
    const url = window.location.pathname + (qs ? `?${qs}` : '');
    history.pushState({}, '', url);
  }

  onMount(() => {
    window.addEventListener('popstate', () => {
      const sel = parseLeitstandQuery(new URLSearchParams(window.location.search));
      active = isDeckId(sel.deck) ? sel.deck : DEFAULT_DECK;
    });
  });
</script>

<!-- Z5 (Kontrakt C): genau ein Deck ist gemountet -- die {#if}-Kette haelt
     inaktive Decks aus dem DOM, damit keine ihrer onMount-Fetches feuert
     (D11, p2 Task 5). -->
<nav class="deck-leiste" data-testid="leitstand-deck-leiste" data-purpose-id="deck-leiste">
  <div class="deck-leiste__tabs">
    {#each DECKS as deck}
      <button
        type="button"
        class="deck-leiste__tab"
        class:deck-leiste__tab--active={active === deck.id}
        data-testid="deck-switch-{deck.id}"
        aria-pressed={active === deck.id}
        onclick={() => pushDeck(deck.id)}
      >
        {deck.label}
      </button>
    {/each}
  </div>

  <div class="deck-leiste__body">
    {#if active === 'qualitaet'}
      <DeckQualitaet />
    {:else if active === 'plattform'}
      <DeckPlattform />
    {:else if active === 'ki'}
      <DeckKi />
    {:else}
      <DeckWissen />
    {/if}
  </div>
</nav>

<style>
  .deck-leiste {
    display: flex;
    flex-direction: column;
    background: var(--ls-surface-base, #0e1117);
    border-left: 1px solid var(--ls-line, #1d232c);
    min-height: 0;
    overflow-y: auto;
  }

  .deck-leiste__tabs {
    display: flex;
    gap: var(--ls-space-1, 2px);
    padding: var(--ls-space-3, 6px);
    border-bottom: 1px solid var(--ls-line, #1d232c);
    position: sticky;
    top: 0;
    background: var(--ls-surface-base, #0e1117);
    z-index: 1;
  }

  .deck-leiste__tab {
    flex: 1;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-text-secondary, #9aa4b2);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: var(--ls-space-2, 4px) var(--ls-space-3, 6px);
    cursor: pointer;
  }

  .deck-leiste__tab:hover {
    color: var(--ls-text-primary, #e6edf3);
    border-color: var(--ls-line, #1d232c);
  }

  .deck-leiste__tab--active {
    color: var(--ls-signal-info, #4c8dff);
    border-color: var(--ls-signal-info-dim, rgba(76, 141, 255, 0.3));
    background: var(--ls-signal-info-dim, rgba(76, 141, 255, 0.12));
  }

  .deck-leiste__body {
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 767px) {
    .deck-leiste {
      border-left: none;
      border-top: 1px solid var(--ls-line, #1d232c);
    }
  }
</style>
