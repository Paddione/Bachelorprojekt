<script lang="ts">
  import type { HallItem, LoadingDockItem } from '../lib/factory-floor-types';
  import { PHASE_ORDER } from '../lib/factory-floor-types';
  import type { Phase } from '../lib/factory-floor-types';
  import ConveyorBelt from './factory/ConveyorBelt.svelte';
  import { prioDot, ticketUrl } from '../lib/factory-floor-client';

  const STATIONS: { key: Phase; label: string }[] =
    PHASE_ORDER.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));

  let {
    hall,
    loadingDock,
    mobileColIndex,
    onSelect,
    activeConfigs = {},
    onOpenDrawerPhase,
  }: {
    hall: HallItem[];
    loadingDock: LoadingDockItem[];
    mobileColIndex: number;
    onSelect: (extId: string) => void;
    activeConfigs?: Record<string, any>;
    onOpenDrawerPhase?: (phase: string) => void;
  } = $props();
</script>

<div data-col="backlog" class:mobile-visible={mobileColIndex === 1} class="lg:w-1/5" data-testid="floor-loadingdock">
  <h3 class="font-semibold mb-2">Laderampe</h3>
  {#if loadingDock.length === 0}
    <p class="text-muted text-sm">Leer.</p>
  {:else}
    <ul class="space-y-1">
      {#each loadingDock as d (d.extId)}
        <li class="rounded bg-white/5 px-2 py-1 text-sm">
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 shrink-0 rounded-full {prioDot(d.priority)}" title={`Priorität: ${d.priority}`}></span>
            <a href={ticketUrl(d.extId)} class="font-mono text-xs text-gold hover:underline">{d.extId}</a>
            <span class="truncate">{d.title}</span>
          </div>
          <span class="block text-muted text-xs">⏳ {d.waitReason}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if true}
  <div class="conveyor-wrapper w-full" data-testid="floor-hall">
    <ConveyorBelt
      stations={STATIONS}
      hallItems={hall}
      {mobileColIndex}
      {onSelect}
      {activeConfigs}
      {onOpenDrawerPhase}
    />
  </div>
{/if}
