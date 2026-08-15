<script lang="ts">
  import type { ContainerDor } from '../../lib/tickets/container-detail';
  import { DOR_KEYS } from '../../lib/planning-office-types';

  let { dor }: { dor: ContainerDor } = $props();

  const DOR_LABELS: Record<string, string> = {
    spec_skizziert: 'Spec skizziert',
    offene_fragen_geklaert: 'Offene Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar',
    aufwand_geschaetzt: 'Aufwand geschätzt',
  };
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Definition of Ready</h2>
    <span class="text-xs font-mono text-gold">{dor.dorScore}/4</span>
  </div>
  <ul class="space-y-1 text-sm mb-4" role="list">
    {#each DOR_KEYS as k}
      <li class="flex items-center gap-2" role="listitem">
        <span class={dor.readiness[k] ? 'text-green-400' : 'text-muted'}>{dor.readiness[k] ? '✓' : '○'}</span>
        <span class="text-light">{DOR_LABELS[k] ?? k}</span>
      </li>
    {/each}
  </ul>
  {#if dor.valueProp}<p class="text-sm text-light/90 mb-2"><span class="text-muted">Nutzen:</span> {dor.valueProp}</p>{/if}
  <div class="flex flex-wrap gap-3 text-xs mb-2">
    {#if dor.effort}<span class="text-muted">Aufwand: <span class="text-light">{dor.effort}</span></span>{/if}
    {#each dor.areas as a}<span class="px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted">{a}</span>{/each}
  </div>
  {#if dor.dependsOn.length > 0}
    <p class="text-xs text-muted mb-2">Abhängig von: {dor.dependsOn.join(', ')}</p>
  {/if}
  <div class="flex items-center justify-between mt-3 mb-1">
    <h3 class="text-xs text-muted uppercase tracking-wide">
      {dor.lastenheftLocked ? 'Lastenheft' : 'Pflichtenheft'}
    </h3>
    {#if dor.lastenheftLocked}
      <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-green-800 bg-green-900/40 text-green-300">🔒 verriegelt · KI-bereit</span>
    {:else}
      <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-yellow-800 bg-yellow-900/40 text-yellow-300">✏ Entwurf</span>
    {/if}
  </div>
  {#if dor.requirementsList.length > 0}
    <ul class="list-disc list-inside text-sm text-light/90 space-y-0.5" role="list">
      {#each dor.requirementsList as r}<li role="listitem">{r}</li>{/each}
    </ul>
  {:else}
    <p class="text-sm text-yellow-300">⚠ Keine Anforderungen erfasst</p>
  {/if}
</div>
