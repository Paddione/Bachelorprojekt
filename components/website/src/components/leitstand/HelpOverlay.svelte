<script lang="ts">
  import { onMount } from 'svelte';
  import { helpOverlayActive } from '../../lib/stores/help-overlay-store';
  import { leitstandPurposes, type PurposeId } from '../../lib/sdlc/leitstand-purpose-registry';

  // E5 (T008017) — Help-Overlay-Layer.
  //
  // KEINE statischen Positions-Hinweise in der Registry (Requirement "no
  // static position hints"): Die Karten entstehen zur Laufzeit aus den
  // getBoundingClientRect() der im DOM gemounteten [data-purpose-id]-Anker.
  // Die DeckLeiste mountet Decks per {#if} — wechselt das Deck, verschwinden
  // die alten Anker und neue erscheinen. Ein MutationObserver auf der Shell
  // plus scroll/resize-Listener halten die Karten deshalb am Leben.
  //
  // Der eigene Anker (data-purpose-id="help-overlay") dient dem Anker-
  // Kontrakt; eine Karte fuer den Layer selbst wird bewusst nicht gezeichnet
  // (die Position waere der ganze Viewport — eine Karte ueber sich selbst).

  interface Card {
    id: PurposeId;
    top: number;
    left: number;
    width: number;
  }

  const SHELL_SELECTOR = '#cockpit-root';
  const CARD_GAP = 8;
  const CARD_H_EST = 180; // Hoehen-Schaetzung fuer die Ankerwahl (unter/ueber)
  const CARD_MAX_W = 300;

  let active = $state(false);
  let cards = $state<Card[]>([]);
  let placeQueued = false;
  let observer: MutationObserver | null = null;

  function place(): void {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => {
      placeQueued = false;
      if (!active) return;
      const shell = document.querySelector(SHELL_SELECTOR);
      const anchors = shell
        ? Array.from(shell.querySelectorAll<HTMLElement>('[data-purpose-id]'))
        : [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const W = Math.min(CARD_MAX_W, vw - 2 * CARD_GAP);

      const next: Card[] = [];
      for (const el of anchors) {
        const id = el.dataset.purposeId ?? '';
        if (!(id in leitstandPurposes) || id === 'help-overlay') continue;
        const r = el.getBoundingClientRect();
        let top = r.bottom + CARD_GAP;
        if (top + CARD_H_EST > vh - CARD_GAP) top = Math.max(CARD_GAP, r.top - CARD_H_EST - CARD_GAP);
        const left = Math.max(CARD_GAP, Math.min(r.left, vw - W - CARD_GAP));
        next.push({ id: id as PurposeId, top, left, width: W });
      }
      cards = next;
    });
  }

  function close(): void {
    helpOverlayActive.set(false);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  onMount(() => {
    const unsub = helpOverlayActive.subscribe((v) => {
      active = v;
      if (v) place();
      else cards = [];
    });

    // Decks mounten/dismounten per {#if} in DeckLeiste — Anker kommen und
    // gehen, ohne dass der Layer das selbst erfaehrt.
    const shell = document.querySelector(SHELL_SELECTOR);
    if (shell) {
      observer = new MutationObserver(place);
      observer.observe(shell, { childList: true, subtree: true });
    }

    // Scroll und Resize verschieben Anker — Karten folgen (passiv, rAF-
    // gebuendelt in place()).
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    window.addEventListener('keydown', onKeydown);

    return () => {
      unsub();
      observer?.disconnect();
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKeydown);
    };
  });
</script>

{#if active}
  <!-- eslint-disable-next-line a11y/no-static-element-interactions -- Layer als Backdrop: Klick auf eine Karte stoppt die Propagation, jeder andere Klick schliesst -->
  <div
    class="help-overlay"
    data-purpose-id="help-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Hilfe-Overlay"
    onclick={close}
  >
    {#each cards as card (card.id)}
      <article
        class="help-overlay__card"
        style={`top: ${card.top}px; left: ${card.left}px; width: ${card.width}px;`}
        onclick={(e) => e.stopPropagation()}
      >
        <h3 class="help-overlay__title">{card.id}</h3>
        <p class="help-overlay__zweck">{leitstandPurposes[card.id].zweck}</p>
        <dl class="help-overlay__meta">
          <dt>Datenquelle</dt>
          <dd>{leitstandPurposes[card.id].datenquelle}</dd>
        </dl>
        {#if leitstandPurposes[card.id].aktionen.length > 0}
          <ul class="help-overlay__actions">
            {#each leitstandPurposes[card.id].aktionen as a (a)}
              <li>{a}</li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  </div>
{/if}

<style>
  /* Layer: fixiert, ueber allen Shell-Zonen (Statusband z-50, Kit-Drawer 10/11). */
  .help-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: color-mix(in oklab, var(--ls-bg) 55%, transparent);
    backdrop-filter: blur(1px);
  }

  .help-overlay__card {
    position: fixed;
    max-height: 180px;
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--ls-space-5);
    background: var(--ls-surface-raised);
    border: 1px solid var(--ls-line-strong);
    border-radius: var(--ls-radius-lg);
    box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
    font-family: var(--ls-font-sans);
    font-size: 0.8rem;
    color: var(--ls-text-primary);
    cursor: default;
  }

  .help-overlay__title {
    margin: 0 0 var(--ls-space-3);
    font-family: var(--ls-font-mono);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ls-signal-info);
  }

  .help-overlay__zweck {
    margin: 0 0 var(--ls-space-4);
    color: var(--ls-text-secondary);
  }

  .help-overlay__meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ls-text-muted);
  }

  .help-overlay__meta dt {
    font-family: var(--ls-font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-overlay__meta dd {
    margin: 0 0 var(--ls-space-3);
  }

  .help-overlay__actions {
    margin: 0;
    padding-left: var(--ls-space-6);
    color: var(--ls-text-secondary);
  }
</style>
