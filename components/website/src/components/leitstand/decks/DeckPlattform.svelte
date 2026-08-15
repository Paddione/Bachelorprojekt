<script lang="ts">
  // DeckPlattform.svelte — Nebendomaenen-Deck "Plattform" (T008016/E4).
  // Betriebsparameter (ControlPanel), Observability (FactoryObservability),
  // Budgets (FactoryBudgetPage) und Cluster-Karten aus den bestehenden
  // /sdlc/api/-Routen (lib/sdlc/k8s.ts-gestuetzt: deployments.ts,
  // cluster/pods-list.ts). Jede Sektion ist fail-soft: eine fehlende oder
  // fehlschlagende Datenquelle rendert den Fehlerzustand ihrer eigenen Karte,
  // ohne die uebrigen Sektionen zu blockieren (Spec "Live Platform Deck":
  // keine hartcodierten Kennzahlen, kein Platzhalter-Ersatz — die
  // Dashboard-Fallback-Zahlen von /sdlc/api/cluster/status sind deshalb
  // bewusst KEINE Quelle dieses Decks).
  import { onMount } from 'svelte';
  import ControlPanel from '../../sdlc/factory/ControlPanel.svelte';
  import FactoryObservability from '../../sdlc/factory/FactoryObservability.svelte';
  import FactoryBudgetPage from '../../sdlc/factory/FactoryBudgetPage.svelte';

  type DeploymentStatus = 'healthy' | 'degraded' | 'stopped';
  interface DeploymentInfo {
    name: string;
    desired: number;
    ready: number;
    available: number;
    status: DeploymentStatus;
  }
  interface PodInfo {
    name: string;
    phase: string;
    ready: boolean;
    restarts: number;
  }

  // Cluster-Karten: zwei unabhaengige, k8s.ts-gestuetzte Quellen im
  // Brand-Namespace. D12/D13: explizites error-Feld pro Karte, loadedAt als
  // Lebensnachweis — kein Fallback mit hartcodierten Zahlen.
  let deployments = $state<DeploymentInfo[] | null>(null);
  let deploymentsError = $state<string | null>(null);
  let pods = $state<PodInfo[] | null>(null);
  let podsError = $state<string | null>(null);
  let loadedAt = $state<number | null>(null);

  const sortedDeployments = $derived(
    deployments ? [...deployments].sort((a, b) => a.name.localeCompare(b.name)) : [],
  );

  const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  onMount(() => {
    void fetch('/sdlc/api/deployments', { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ deployments: DeploymentInfo[] }>;
      })
      .then((j) => { deployments = j.deployments; })
      .catch((e: unknown) => { deploymentsError = errText(e); });
    void fetch('/sdlc/api/cluster/pods-list?context=mentolder', { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ pods: PodInfo[] }>;
      })
      .then((j) => { pods = j.pods; })
      .catch((e: unknown) => { podsError = errText(e); });
    loadedAt = Date.now();
  });
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
  <div class="deck-plattform__card" data-testid="deck-plattform-cluster">
    {#if deployments !== null}
      {#if deployments.length === 0}
        <p class="deck-plattform__fallback">Keine Deployments im Namespace.</p>
      {:else}
        <ul class="deploy-list" data-testid="deck-plattform-deployments">
          {#each sortedDeployments as d (d.name)}
            <li class="deploy-item" title="{d.name} — {d.ready}/{d.desired} ready">
              <span class="deploy-item__name">{d.name}</span>
              <span class="deploy-item__replicas">{d.ready}/{d.desired}</span>
              <span class="deploy-item__status deploy-item__status--{d.status}">{d.status}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if deploymentsError}
      <p class="deck-plattform__fallback" data-testid="deck-plattform-deployments-error">
        Deployments nicht verfügbar: {deploymentsError}
      </p>
    {:else}
      <p class="deck-plattform__fallback">Deployments werden geladen …</p>
    {/if}

    {#if pods !== null}
      <p class="deck-plattform__podstat" data-testid="deck-plattform-pods">
        {pods.length} Pods, {pods.filter((p) => p.ready).length} ready
      </p>
    {:else if podsError}
      <p class="deck-plattform__fallback">Pod-Status nicht verfügbar: {podsError}</p>
    {:else}
      <p class="deck-plattform__fallback">Pod-Status wird geladen …</p>
    {/if}

    {#if loadedAt}
      <p class="deck-plattform__fetched">Datenstand: {new Date(loadedAt).toLocaleTimeString('de-DE')}</p>
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

  .deck-plattform__fetched {
    margin: var(--ls-space-2, 4px) 0 0;
    font-size: 0.72rem;
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
