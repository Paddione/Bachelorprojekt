<script lang="ts">
  interface PhaseSummary {
    phase: string;
    label: string;
    total: number;
    done: number;
    blocked: number;
    inProgress: number;
  }

  interface AttentionItem {
    extId: string;
    reason: string;
    minutes?: number;
    type: 'blocked' | 'stuck' | 'cooldown';
  }

  let phases = $state<PhaseSummary[]>([]);
  let attention = $state<AttentionItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const PHASE_LABELS: Record<string, string> = {
    triage: 'Triage',
    planung: 'Planung',
    bauen: 'Bauen',
    review: 'Review',
    deploy: 'Deploy',
    ship: 'Ship',
  };

  async function load() {
    loading = true;
    error = null;
    try {
      // Aggregate from existing endpoints
      const res = await fetch('/api/cockpit/portfolio');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Build phase summaries from portfolio data
      const phaseMap = new Map<string, PhaseSummary>();
      const phaseOrder = ['triage', 'planung', 'bauen', 'review', 'deploy', 'ship'];

      for (const p of phaseOrder) {
        phaseMap.set(p, { phase: p, label: PHASE_LABELS[p] || p, total: 0, done: 0, blocked: 0, inProgress: 0 });
      }

      if (data.products) {
        for (const product of data.products) {
          for (const feature of product.features || []) {
            if (feature.rollup) {
              // Map feature health to a phase — this is approximate
              // In a real implementation, we'd have phase-per-ticket data
              const phase = feature.nextStep ? 'bauen' : feature.discarded ? 'triage' : 'planung';
              const s = phaseMap.get(phase);
              if (s) {
                s.total += feature.rollup.total || 0;
                s.done += feature.rollup.done || 0;
                s.blocked += feature.rollup.blocked || 0;
                s.inProgress += feature.rollup.inProgress || 0;
              }
            }
          }
        }
      }

      phases = Array.from(phaseMap.values());

      // Build attention list from the floor store attention data
      // This would normally come from a dedicated API; for now, use floor store stub
      attention = [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Daten nicht verfügbar';
      // Provide empty phase structure so the UI still renders
      phases = ['triage', 'planung', 'bauen', 'review', 'deploy', 'ship'].map((p) => ({
        phase: p,
        label: PHASE_LABELS[p] || p,
        total: 0, done: 0, blocked: 0, inProgress: 0,
      }));
    } finally {
      loading = false;
    }
  }

  function navigateToPhase(phase: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'fokus');
    url.searchParams.set('phase', phase);
    history.pushState({}, '', url.toString());
    // Dispatch mode change event for the cockpit shell
    const el = document.createElement('div');
    el.dispatchEvent(new CustomEvent('cockpit-modechange', {
      detail: { mode: 'fokus', phase },
      bubbles: true,
    }));
  }

  $effect(() => { load(); });
</script>

<div class="overview-dashboard" data-testid="overview-dashboard">
  {#if error}
    <div class="overview-dashboard__error">
      <p>{error}</p>
      <button onclick={load} disabled={loading}>Erneut laden</button>
    </div>
  {/if}

  <section class="phase-cards">
    <h2 class="overview-dashboard__heading">Lifecycle</h2>
    {#if loading}
      <div class="phase-cards__loading">Lade Phasen…</div>
    {:else}
      <div class="phase-cards__grid">
        {#each phases as phase}
          <button
            class="phase-card"
            class:phase-card--empty={phase.total === 0}
            onclick={() => navigateToPhase(phase.phase)}
          >
            <span class="phase-card__label">{phase.label}</span>
            <span class="phase-card__count">{phase.total}</span>
            <span class="phase-card__detail">
              {#if phase.inProgress > 0}
                <span class="phase-card__chip phase-card__chip--progress">{phase.inProgress} aktiv</span>
              {/if}
              {#if phase.blocked > 0}
                <span class="phase-card__chip phase-card__chip--blocked">{phase.blocked} ⛔</span>
              {/if}
              {#if phase.done > 0}
                <span class="phase-card__chip phase-card__chip--done">{phase.done} ✓</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  {#if attention.length > 0}
    <section class="attention-section">
      <h2 class="overview-dashboard__heading">Aufmerksamkeit</h2>
      <div class="attention-list">
        {#each attention as item}
          <div class="attention-item attention-item--{item.type}">
            <span class="attention-item__id">{item.extId}</span>
            <span class="attention-item__reason">{item.reason}</span>
            {#if item.minutes != null}
              <span class="attention-item__time">{item.minutes}min</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {:else if !loading}
    <section class="attention-section">
      <h2 class="overview-dashboard__heading">Aufmerksamkeit</h2>
      <p class="attention-section__empty">Keine offenen Punkte</p>
    </section>
  {/if}
</div>

<style>
  .overview-dashboard {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .overview-dashboard__heading {
    font-size: var(--admin-text-sm, 0.85rem);
    color: var(--admin-text-secondary, #8892b0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem;
    font-family: var(--admin-font-mono, monospace);
  }

  .overview-dashboard__error {
    padding: 1rem;
    background: oklch(0.62 0.20 25 / 0.1);
    border: 1px solid oklch(0.62 0.20 25 / 0.25);
    border-radius: var(--admin-radius-md, 8px);
  }

  .overview-dashboard__error p {
    color: var(--admin-error, #d77a6e);
    margin: 0 0 0.75rem;
  }

  .overview-dashboard__error button {
    padding: 0.4rem 1rem;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    color: var(--admin-text);
    border-radius: var(--admin-radius-sm);
    cursor: pointer;
  }

  .phase-cards__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .phase-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.75rem;
    background: var(--admin-surface, rgba(255,255,255,0.03));
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-radius: var(--admin-radius-md, 8px);
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
    font-family: var(--admin-font-mono, monospace);
    border: none;
    color: inherit;
  }

  .phase-card:hover {
    border-color: var(--admin-accent, oklch(0.80 0.09 75));
    transform: translateY(-1px);
  }

  .phase-card--empty {
    opacity: 0.5;
  }

  .phase-card__label {
    font-size: var(--admin-text-xs, 0.75rem);
    color: var(--admin-text-secondary, #8892b0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .phase-card__count {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--admin-text, #ccd6f6);
  }

  .phase-card__detail {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .phase-card__chip {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    white-space: nowrap;
  }

  .phase-card__chip--progress {
    background: oklch(0.80 0.09 75 / 0.15);
    color: oklch(0.80 0.09 75);
  }

  .phase-card__chip--blocked {
    background: oklch(0.62 0.20 25 / 0.15);
    color: oklch(0.72 0.18 25);
  }

  .phase-card__chip--done {
    background: oklch(0.80 0.06 160 / 0.15);
    color: oklch(0.80 0.06 160);
  }

  .attention-section__empty {
    color: var(--admin-text-mute, #555);
    font-size: var(--admin-text-sm);
  }

  .attention-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .attention-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--admin-radius-sm, 4px);
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-xs, 0.75rem);
  }

  .attention-item--blocked {
    background: oklch(0.62 0.20 25 / 0.08);
    border-left: 3px solid oklch(0.62 0.20 25);
  }

  .attention-item--stuck {
    background: oklch(0.80 0.09 75 / 0.08);
    border-left: 3px solid oklch(0.80 0.09 75);
  }

  .attention-item--cooldown {
    background: oklch(0.70 0.10 240 / 0.08);
    border-left: 3px solid oklch(0.70 0.10 240);
  }

  .attention-item__id {
    font-weight: 600;
    color: var(--admin-text);
  }

  .attention-item__reason {
    color: var(--admin-text-secondary);
    flex: 1;
  }

  .attention-item__time {
    color: var(--admin-text-mute);
  }

  .phase-cards__loading {
    color: var(--admin-text-mute);
    font-size: var(--admin-text-sm);
    padding: 2rem;
    text-align: center;
  }

  @media (max-width: 767px) {
    .overview-dashboard {
      padding: 1rem;
    }

    .phase-cards__grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .phase-card {
      padding: 0.75rem 0.5rem;
    }

    .phase-card__count {
      font-size: 1.25rem;
    }
  }
</style>
