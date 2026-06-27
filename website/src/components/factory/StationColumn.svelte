<script lang="ts">
  import type { Phase, HallItem } from '../../lib/factory-floor-types';
  import WorkpieceCard from './WorkpieceCard.svelte';

  // German display labels + agent personas for each phase key
  const PHASE_META: Record<string, { n: string; label: string; agent: string; task: string }> = {
    scout:     { n: '01', label: 'Sichten',      agent: 'Späher',   task: 'Triage & Einordnung' },
    design:    { n: '02', label: 'Entwurf',       agent: 'Zeichner', task: 'Spezifikation & Skizze' },
    plan:      { n: '03', label: 'Planung',       agent: 'Planer',   task: 'Zerlegung & Abhängigkeiten' },
    implement: { n: '04', label: 'Umsetzung',     agent: 'Macher',   task: 'Implementierung' },
    verify:    { n: '05', label: 'Prüfung',       agent: 'Prüfer',   task: 'Tests & Review' },
    deploy:    { n: '06', label: 'Auslieferung',  agent: 'Lotse',    task: 'Deploy & Übergabe' },
  };

  let {
    station,
    items,
    mobileVisible = false,
    isFirst = false,
    onSelect,
  }: {
    station: { key: Phase; label: string };
    items: HallItem[];
    mobileVisible?: boolean;
    isFirst?: boolean;
    onSelect: (extId: string) => void;
  } = $props();

  let meta  = $derived(PHASE_META[station.key] ?? { n: '—', label: station.label, agent: '', task: '' });
  let active = $derived(items.length > 0);
</script>

<div
  class="station"
  class:station--active={active}
  class:station--mobile-visible={mobileVisible}
  data-col={station.key}
>
  <!-- conveyor node row (brass dot + rails) -->
  <div class="station-node-row">
    {#if !isFirst}
      <span class="station-rail station-rail--left" class:station-rail--lit={active}></span>
    {:else}
      <span class="station-rail station-rail--left station-rail--invisible"></span>
    {/if}
    <span class="station-node" class:station-node--active={active}></span>
    <span class="station-rail station-rail--right"></span>
  </div>

  <!-- station header: number + count + label + agent -->
  <div class="station-header" class:station-header--dim={!active}>
    <div class="station-header-top">
      <span class="station-num">{meta.n}</span>
      <span class="station-count">{items.length || '–'}</span>
    </div>
    <div class="station-label">{meta.label}</div>
    {#if meta.agent}
      <div class="station-agent">{meta.agent} · {meta.task}</div>
    {/if}
  </div>

  <hr class="station-divider" />

  <!-- ticket cards in this lane -->
  <div class="station-cards">
    {#each items as item (item.extId)}
      <WorkpieceCard
        {item}
        onClick={() => onSelect(item.extId)}
      />
    {/each}
    {#if !active}
      <div class="station-empty">Station frei</div>
    {/if}
  </div>
</div>

<style>
  .station {
    display: none; /* hidden on mobile, visible via .station--mobile-visible */
    flex-direction: column;
    min-width: 0;
  }

  /* desktop: always shown */
  @media (min-width: 768px) {
    .station { display: flex; }
  }

  /* mobile: shown when selected */
  .station--mobile-visible {
    display: flex;
    width: 100%;
  }

  /* ── Conveyor node row ─────────────────────────────────────────────── */
  .station-node-row {
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }

  .station-rail {
    flex: 1;
    height: 1px;
    background: var(--line-2);
  }
  .station-rail--invisible { visibility: hidden; }
  .station-rail--lit { background: color-mix(in oklab, var(--brass) 60%, transparent); }

  .station-node {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    flex: none;
    background: var(--ink-750);
    border: 1px solid var(--line-2);
    transition:
      background    var(--dur-base) var(--ease-soft),
      border-color  var(--dur-base) var(--ease-soft),
      box-shadow    var(--dur-base) var(--ease-soft);
  }

  .station-node--active {
    background: var(--brass);
    border-color: var(--brass);
    box-shadow: 0 0 16px -3px var(--brass);
  }

  /* ── Station header ─────────────────────────────────────────────── */
  .station-header {
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--line);
    transition: opacity var(--dur-base) var(--ease-soft);
  }

  .station-header--dim { opacity: .45; }

  .station-header-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 5px;
  }

  .station-num {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .12em;
    color: var(--mute-2);
    .station--active & { color: var(--brass); }
  }

  .station--active .station-num { color: var(--brass); }

  .station-count {
    font-family: var(--serif);
    font-size: 22px;
    line-height: 1;
    color: var(--mute);
    .station--active & { color: var(--fg); }
  }

  .station--active .station-count { color: var(--fg); }

  .station-label {
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
    margin-bottom: 3px;
  }

  .station-agent {
    font-family: var(--mono);
    font-size: 9.5px;
    color: var(--mute-2);
    letter-spacing: .04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .station-divider {
    display: none; /* visual separation handled by station-header border-bottom */
  }

  /* ── Cards ─────────────────────────────────────────────────────── */
  .station-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .station-empty {
    border: 1px dashed var(--line-2);
    border-radius: var(--radius-md);
    padding: 20px 12px;
    text-align: center;
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--mute-2);
    letter-spacing: .1em;
    text-transform: uppercase;
  }
</style>
