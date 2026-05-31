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
  } = $props();

  const AXES: { id: Axis; label: string }[] = [
    { id: 'thema', label: 'Thema' },
    { id: 'gefahr', label: 'Gefahr' },
    { id: 'art', label: 'Art' },
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
