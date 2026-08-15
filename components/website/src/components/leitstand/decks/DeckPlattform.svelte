<script lang="ts">
  import ControlPanel from '../../sdlc/factory/ControlPanel.svelte';
  import KostenTab from '../../sdlc/factory/KostenTab.svelte';
</script>

<!-- Betriebsparameter + Kosten/Observability (T007957/E3, p2 Task 2). Beide
     Karten laden ihre Daten selbst; die <h3>-Zwischenueberschrift erhaelt die
     visuelle Trennung des alten DevStatusTabs-Doppeltabs. -->
<section class="deck-plattform" data-testid="deck-panel-plattform">
  <ControlPanel />
  <h3 class="deck-plattform__sub">Kosten &amp; Observability</h3>
  <KostenTab />
</section>

<style>
  .deck-plattform {
    padding: var(--ls-space-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-5, 12px);
  }

  .deck-plattform__sub {
    margin: var(--ls-space-4, 8px) 0 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
  }
</style>
