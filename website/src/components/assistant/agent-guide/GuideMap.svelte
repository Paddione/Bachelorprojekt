<script lang="ts">
  import type { MapData } from '../../../lib/agentGuide';
  import { tierColor, tierEmoji, tierLabel } from '../../../lib/agentGuide';

  let {
    map,
    active = null,
    glossaryTerms = [],
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
