<script lang="ts">
  import type { ContainerRollup } from '../../lib/tickets/container-detail';
  import { statusLabel } from '../../lib/tickets/cockpit-labels';

  let { rollup, status, planBranch = null, prNumber = null }:
    { rollup: ContainerRollup; status: string; planBranch?: string | null; prNumber?: number | null } = $props();

  const healthColor: Record<string, string> = { green: '#34d399', amber: '#fbbf24', red: '#f87171' };
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center gap-3 mb-3">
    <span class="inline-block w-3 h-3 rounded-full" style={`background:${healthColor[rollup.health] ?? '#fbbf24'}`} aria-hidden="true"></span>
    <span class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Fortschritt</span>
    <span class="ml-auto text-sm font-mono text-gold">{rollup.pctDone}%</span>
  </div>
  <div class="w-full h-2 rounded-full bg-dark overflow-hidden mb-4">
    <div class="h-full bg-gold" style={`width:${rollup.pctDone}%`}></div>
  </div>
  <div class="flex flex-wrap gap-3 text-xs">
    <span class="text-green-400">Fertig {rollup.done}</span>
    <span class="text-red-400">Blockiert {rollup.blocked}</span>
    <span class="text-yellow-400">In Arbeit {rollup.inProgress}</span>
    <span class="text-blue-300">Wartet auf Deploy {rollup.awaitingDeploy}</span>
    <span class="text-muted">Offen {rollup.open}</span>
    <span class="text-muted ml-auto">Σ {rollup.total}</span>
  </div>
  <div class="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-dark-lighter text-xs">
    <span class="px-2 py-0.5 rounded-full border border-dark-lighter text-muted">{statusLabel(status)}</span>
    {#if planBranch}<span class="font-mono text-muted">⎇ {planBranch}</span>{/if}
    {#if prNumber}
      <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${prNumber}`}
         target="_blank" rel="noopener" class="text-gold/70 hover:text-gold font-mono">PR #{prNumber}</a>
    {/if}
  </div>
</div>
