<script lang="ts">
  import { onMount } from 'svelte';
  import { parseLeitstandQuery, toLeitstandQuery } from '../../lib/sdlc/leitstand-url';
  import {
    clampDeckWidth,
    widthFromPointer,
    DECK_WIDTH_DEFAULT,
    DECK_WIDTH_STEP,
    DECK_WIDTH_MIN,
    DECK_WIDTH_MAX,
    DECK_WIDTH_STORAGE_KEY,
  } from '../../lib/sdlc/deck-resize';
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

  // T011499: Resize-Handle am linken Rand der DeckLeiste. Setzt nur die
  // CSS-Var --ls-deck-width auf #cockpit-root -- cockpit.astro konsumiert
  // sie in der .ls-main-Grid-Spalte (clamp(240px, var(--ls-deck-width,
  // 320px), 640px)). Pointer Events + setPointerCapture statt HTML5-DnD
  // (Spec-Konvention, siehe design.md).
  let deckWidth = $state(DECK_WIDTH_DEFAULT);
  let resizing = false;

  function applyDeckWidth(px: number) {
    deckWidth = clampDeckWidth(px);
    document
      .getElementById('cockpit-root')
      ?.style.setProperty('--ls-deck-width', `${deckWidth}px`);
  }

  function persistDeckWidth(px: number) {
    try {
      localStorage.setItem(DECK_WIDTH_STORAGE_KEY, String(px));
    } catch {}
  }

  function clearPersistedDeckWidth() {
    try {
      localStorage.removeItem(DECK_WIDTH_STORAGE_KEY);
    } catch {}
  }

  function onResizePointerDown(e: PointerEvent) {
    resizing = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: PointerEvent) {
    if (!resizing) return;
    applyDeckWidth(widthFromPointer(e.clientX, window.innerWidth));
  }

  function onResizePointerUp(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    persistDeckWidth(deckWidth);
  }

  function onResizeDoubleClick() {
    resizing = false;
    applyDeckWidth(DECK_WIDTH_DEFAULT);
    clearPersistedDeckWidth();
  }

  function onResizeKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applyDeckWidth(deckWidth + DECK_WIDTH_STEP);
      persistDeckWidth(deckWidth);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applyDeckWidth(deckWidth - DECK_WIDTH_STEP);
      persistDeckWidth(deckWidth);
    }
  }

  onMount(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DECK_WIDTH_STORAGE_KEY);
    } catch {}
    applyDeckWidth(clampDeckWidth(stored !== null ? Number(stored) : undefined));
  });
</script>

<!-- Z5 (Kontrakt C): genau ein Deck ist gemountet -- die {#if}-Kette haelt
     inaktive Decks aus dem DOM, damit keine ihrer onMount-Fetches feuert
     (D11, p2 Task 5). -->
<nav class="deck-leiste" data-testid="leitstand-deck-leiste" data-purpose-id="deck-leiste">
  <div
    class="deck-leiste__resize"
    data-testid="deck-leiste-resize"
    role="separator"
    aria-orientation="vertical"
    aria-label="Deck-Leiste Breite anpassen"
    aria-valuemin={DECK_WIDTH_MIN}
    aria-valuemax={DECK_WIDTH_MAX}
    aria-valuenow={deckWidth}
    tabindex="0"
    onpointerdown={onResizePointerDown}
    onpointermove={onResizePointerMove}
    onpointerup={onResizePointerUp}
    onpointercancel={onResizePointerUp}
    ondblclick={onResizeDoubleClick}
    onkeydown={onResizeKeydown}
  ></div>

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
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--ls-surface-base, #0e1117);
    border-left: 1px solid var(--ls-line, #1d232c);
    min-height: 0;
    overflow-y: auto;
  }

  .deck-leiste__resize {
    position: absolute;
    top: 0;
    left: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    touch-action: none;
    z-index: 2;
  }

  .deck-leiste__resize::after {
    content: '';
    position: absolute;
    top: 0;
    left: 3px;
    width: 2px;
    height: 100%;
    background: var(--ls-line, #1d232c);
  }

  .deck-leiste__resize:hover::after,
  .deck-leiste__resize:focus-visible::after {
    background: var(--ls-signal-info, #4c8dff);
  }

  .deck-leiste__resize:focus-visible {
    outline: none;
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
    container-type: inline-size;
  }

  @media (max-width: 767px) {
    .deck-leiste {
      border-left: none;
      border-top: 1px solid var(--ls-line, #1d232c);
    }

    .deck-leiste__resize {
      display: none;
    }
  }
</style>
