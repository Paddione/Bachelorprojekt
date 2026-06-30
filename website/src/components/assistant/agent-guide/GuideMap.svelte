<script lang="ts">
  import type { MapData } from '../../../lib/agentGuide';
  import { tierColor, tierEmoji, tierLabel, tierLegend } from '../../../lib/agentGuide';

  // Danger-tier legend rows (🟢/🟡/🟠/🔴 → Bedeutung), derived from the taxonomy.
  const legend = tierLegend();

  let {
    map,
    active = null,
    onSelect,
  }: {
    map: MapData;
    active?: { kind: 'flow' | 'node'; id: string } | null;
    glossaryTerms?: string[];
    onSelect: (sel: { kind: 'flow' | 'node'; id: string; label: string } | null) => void;
  } = $props();

  const isActive = (kind: 'flow' | 'node', id: string) =>
    active?.kind === kind && active?.id === id;

  function pick(kind: 'flow' | 'node', id: string, label: string) {
    if (isActive(kind, id)) onSelect(null);          // toggle off
    else onSelect({ kind, id, label });
  }
</script>

<div class="ag-map" aria-label="So funktioniert die Plattform">
  <!-- Legende: erklärt die Gefahrenstufen-Farben/Emojis, damit die Karte verständlich ist -->
  <details class="ag-legend">
    <summary class="ag-legend-summary">
      <span aria-hidden="true">🗺️</span>
      <span>Legende: Was bedeuten die Farben?</span>
    </summary>
    <p class="ag-sr">
      Jeder Knoten und jede Station ist nach Gefahrenstufe eingefärbt.
      {#each legend as row}{row.emoji} {row.label}: {row.meaning} {/each}
    </p>
    <ul class="ag-legend-list" aria-hidden="true">
      {#each legend as row (row.id)}
        <li class="ag-legend-row">
          <span class="ag-legend-dot" style="--tier: {row.color}">{row.emoji}</span>
          <span class="ag-legend-label">{row.label}</span>
          <span class="ag-legend-meaning">{row.meaning}</span>
        </li>
      {/each}
    </ul>
  </details>

  <!-- Flow ribbon -->
  <p class="ag-section-label">Dein Weg: Idee → live</p>
  <ol class="ag-flowband">
    {#each map.flow as s, i (s.id)}
      <li>
        <button
          type="button"
          class="ag-flow-station"
          class:on={isActive('flow', s.id)}
          style="--tier: {tierColor(s.danger)}"
          aria-pressed={isActive('flow', s.id)}
          title={s.blurb_de}
          onclick={() => pick('flow', s.id, s.label_de)}
        >
          <span aria-hidden="true">{s.emoji}</span>
          <span class="ag-flow-name">{s.label_de}</span>
          <span class="ag-sr">– {tierLabel(s.danger)}, {s.goalIds.length + s.toolIds.length} Einträge</span>
        </button>
      </li>
      {#if i < map.flow.length - 1}<li class="ag-flow-arrow" aria-hidden="true">→</li>{/if}
    {/each}
  </ol>

  <!-- Territory map -->
  <p class="ag-section-label">Die Plattform: was läuft wo</p>
  <div class="ag-territory">
    {#each map.territory.filter(a => a.nodes.length) as area (area.id)}
      <div class="ag-terr-area">
        <span class="ag-terr-label">{area.label_de}</span>
        <div class="ag-terr-nodes">
          {#each area.nodes as n (n.slug)}
            <button
              type="button"
              class="ag-terr-node"
              class:on={isActive('node', n.slug)}
              style="--accent: {n.accent}; --tier: {tierColor(n.sensitivity)}"
              aria-pressed={isActive('node', n.slug)}
              onclick={() => pick('node', n.slug, n.name)}
            >
              <span aria-hidden="true">{n.emoji}</span> {n.name}
              <span aria-hidden="true" class="ag-terr-dot">{tierEmoji(n.sensitivity)}</span>
              <span class="ag-sr">Gefahrenstufe {tierLabel(n.sensitivity)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Collapsible danger-tier legend. Reuses the panel CSS custom properties
     (--brass/--mute/--line/--serif) that cascade from the sidekick drawer. */
  .ag-legend {
    border: 1px solid color-mix(in srgb, var(--line, #3a3327) 70%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--brass, #b08a4f) 6%, transparent);
    margin: 0 0 10px;
    padding: 0;
  }
  .ag-legend-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    list-style: none;
    cursor: pointer;
    padding: 9px 12px;
    font-family: var(--serif, Georgia, serif);
    font-size: 14px;
    color: var(--ink, #ece6da);
  }
  .ag-legend-summary::-webkit-details-marker { display: none; }
  .ag-legend-summary::after {
    content: '▸';
    margin-inline-start: auto;
    color: var(--mute, #9a917f);
    transition: transform 0.15s ease;
  }
  .ag-legend[open] > .ag-legend-summary::after { transform: rotate(90deg); }
  .ag-legend-summary:focus-visible { outline: 2px solid var(--brass, #b08a4f); outline-offset: -2px; }
  .ag-legend-list {
    list-style: none;
    margin: 0;
    padding: 2px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ag-legend-row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
  }
  .ag-legend-dot {
    width: 1.25em;
    text-align: center;
    border-radius: 4px;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tier) 60%, transparent);
  }
  .ag-legend-label { font-weight: 600; color: var(--ink, #ece6da); }
  .ag-legend-meaning { color: var(--mute, #9a917f); }
  @media (prefers-reduced-motion: reduce) {
    .ag-legend-summary::after { transition: none; }
  }
</style>
