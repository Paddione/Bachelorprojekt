<script lang="ts">
  import type { TierEntry, Theme } from '../../../lib/agentGuide';
  import type { Axis } from '../../../lib/agentGuideSearch';

  let {
    taxonomy,
    themes,
    tierCounts,
    query = '',
    axis = 'thema',
    tierFilter,
    domainFilter = null,
    resultCount = 0,
    searching = false,
    onQuery,
    onAxis,
    onToggleTier,
    onToggleDomain,
    harnessFilter,
    harnessCounts,
    onToggleHarness,
  }: {
    taxonomy: TierEntry[];
    themes: Theme[];
    tierCounts: Record<string, number>;
    query?: string;
    axis?: Axis;
    tierFilter: Set<string>;
    domainFilter?: string | null;
    resultCount?: number;
    searching?: boolean;
    onQuery: (v: string) => void;
    onAxis: (a: Axis) => void;
    onToggleTier: (id: string) => void;
    onToggleDomain: (id: string | null) => void;
    harnessFilter: Set<string>;
    harnessCounts: Record<string, number>;
    onToggleHarness: (id: string) => void;
  } = $props();

  const AXES: { id: Axis; label: string }[] = [
    { id: 'thema', label: 'Thema' },
    { id: 'gefahr', label: 'Gefahr' },
    { id: 'art', label: 'Art' },
  ];

  const HARNESSES: { id: string; label: string }[] = [
    { id: 'claude', label: 'Claude Code' },
    { id: 'opencode', label: 'opencode' },
  ];
</script>

<div class="ag-findbar">
  <!-- Tier-filter rail (the legend, now clickable) -->
  <ul class="ag-tier-rail" aria-label="Nach Gefahrenstufe filtern">
    {#each taxonomy as tier (tier.id)}
      <li>
        <button
          type="button"
          class="ag-tier-toggle"
          class:on={tierFilter.has(tier.id)}
          style="--tier: {tier.color}"
          aria-pressed={tierFilter.has(tier.id)}
          onclick={() => onToggleTier(tier.id)}
        >
          <span aria-hidden="true">{tier.emoji}</span>
          <span class="ag-tier-toggle-label">{tier.label_de}</span>
          <span class="ag-tier-toggle-count">{tierCounts[tier.id] ?? 0}</span>
        </button>
      </li>
    {/each}
  </ul>

  <ul class="ag-harness-rail" aria-label="Nach Werkzeugumgebung filtern">
    {#each HARNESSES as h (h.id)}
      <li>
        <button
          type="button"
          class="ag-harness-toggle"
          class:on={harnessFilter.has(h.id)}
          aria-pressed={harnessFilter.has(h.id)}
          onclick={() => onToggleHarness(h.id)}
        >
          <span class="ag-harness-toggle-label">{h.label}</span>
          <span class="ag-harness-toggle-count">{harnessCounts[h.id] ?? 0}</span>
        </button>
      </li>
    {/each}
  </ul>

  <!-- Grouping-axis toggle -->
  <div class="ag-axis" role="group" aria-label="Gruppierung wählen">
    {#each AXES as a (a.id)}
      <button type="button" class="ag-axis-btn" class:on={axis === a.id} aria-pressed={axis === a.id} onclick={() => onAxis(a.id)}>{a.label}</button>
    {/each}
  </div>

  <!-- Domain-chip index -->
  <div class="ag-chip-index" role="group" aria-label="Nach Thema springen">
    <button type="button" class="ag-index-chip" class:on={domainFilter === null} onclick={() => onToggleDomain(null)}>Alle</button>
    {#each themes as t (t.id)}
      <button type="button" class="ag-index-chip" class:on={domainFilter === t.id} style="--accent: {t.accent}" onclick={() => onToggleDomain(t.id)}>{t.emoji} {t.label_de}</button>
    {/each}
  </div>

  <!-- Search -->
  <div class="ag-search">
    <span class="ag-search-icon" aria-hidden="true">🔎</span>
    <label class="ag-sr" for="ag-search-input">Anleitung durchsuchen</label>
    <input
      id="ag-search-input"
      class="ag-search-input"
      type="search"
      placeholder="Suchen … (ab 3 Zeichen)"
      value={query}
      oninput={(e) => onQuery((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
  <p class="ag-search-count" aria-live="polite">
    {#if searching}{resultCount} Treffer{/if}
  </p>
</div>

<style>
  .ag-harness-rail {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
  }

  .ag-harness-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--line, #e2e8f0);
    background: transparent;
    color: var(--fg-soft, #64748b);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .ag-harness-toggle:hover {
    border-color: var(--brass, #b8860b);
    color: var(--fg, #1a1a1a);
  }

  .ag-harness-toggle.on {
    background: var(--brass, #b8860b);
    border-color: var(--brass, #b8860b);
    color: var(--ink-900, #1a1a1a);
  }

  .ag-harness-toggle-label {
    font-weight: 500;
  }

  .ag-harness-toggle-count {
    font-size: 11px;
    opacity: 0.7;
  }
</style>
