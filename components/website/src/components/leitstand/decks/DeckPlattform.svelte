<script lang="ts">
  // DeckPlattform.svelte — Nebendomaenen-Deck "Plattform" (T008016/E4).
  // Betriebsparameter (ControlPanel), Observability (FactoryObservability),
  // Budgets (FactoryBudgetPage) und Cluster-/Deployment-Kennzahlen aus den
  // bestehenden /sdlc/api/ Routen. Jede Sektion ist fail-soft: eine
  // fehlende/fehlschlagende Datenquelle rendert einen Leerzustand statt die
  // ganze Sektion zu blockieren (Anforderung "Live Platform Deck").
  import { onMount } from 'svelte';
  import ControlPanel from '../../sdlc/factory/ControlPanel.svelte';
  import FactoryObservability from '../../sdlc/factory/FactoryObservability.svelte';
  import FactoryBudgetPage from '../../sdlc/factory/FactoryBudgetPage.svelte';
</script>

<section class="deck-plattform" data-testid="deck-panel-plattform">
  <ControlPanel />

  <h3 class="deck-plattform__sub">Observability</h3>
  <div class="deck-plattform__card">
    <FactoryObservability />
  </div>

  <h3 class="deck-plattform__sub">Budgets</h3>
  <div class="deck-plattform__card">
    <FactoryBudgetPage />
  </div>

  <h3 class="deck-plattform__sub">Cluster</h3>
  <div class="deck-plattform__card">
    {#if cluster}
      <dl class="cluster-stats" data-testid="deck-plattform-cluster">
        <div class="cluster-stat">
          <dt>Knoten</dt>
          <dd>{cluster.nodes}</dd>
        </div>
        <div class="cluster-stat">
          <dt>Pods</dt>
          <dd>{cluster.pods}</dd>
        </div>
        <div class="cluster-stat">
          <dt>Brands</dt>
          <dd>{cluster.brands}</dd>
        </div>
      </dl>
    {:else if clusterError}
      <p class="deck-plattform__fallback">{clusterError} — Cluster-Kennzahlen nicht verfügbar.</p>
    {:else}
      <p class="deck-plattform__fallback">Cluster-Status wird geladen …</p>
    {/if}
  </div>
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

  .deck-plattform__card {
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-md, 6px);
    padding: var(--ls-space-4, 8px);
  }

  .deck-plattform__fallback {
    margin: 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .cluster-stats {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--ls-space-4, 8px);
  }

  .cluster-stat dt {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .cluster-stat dd {
    margin: 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--ls-text-primary, #e6edf3);
  }
</style>
