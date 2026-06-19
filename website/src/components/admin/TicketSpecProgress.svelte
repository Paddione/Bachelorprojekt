<script lang="ts">
  import type { ContainerDor } from '../../lib/tickets/container-detail';

  let { ticket, dor, hasPlan, hasPr }: {
    ticket: { description: string | null };
    dor: ContainerDor;
    hasPlan: boolean;
    hasPr: boolean;
  } = $props();

  const items = $derived([
    { label: 'Beschreibung',          done: (ticket.description ?? '').trim().length > 0 },
    { label: 'Value Prop',            done: (dor.valueProp ?? '').trim().length > 0 },
    { label: 'Anforderungen erfasst', done: dor.requirementsList.length > 0 },
    { label: 'Lastenheft verriegelt', done: dor.lastenheftLocked === true },
    { label: 'Spec skizziert',        done: dor.readiness.spec_skizziert === true },
    { label: 'Offene Fragen geklärt', done: dor.readiness.offene_fragen_geklaert === true },
    { label: 'Abhängigkeiten klar',   done: dor.readiness.abhaengigkeiten_klar === true },
    { label: 'Aufwand geschätzt',     done: dor.readiness.aufwand_geschaetzt === true },
    { label: 'Plan vorhanden',        done: hasPlan },
    { label: 'PR erstellt',           done: hasPr },
  ]);
  const completed = $derived(items.filter((i) => i.done).length);
  const pct = $derived(Math.round((completed / items.length) * 100));
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Noch zu erledigen</h2>
    <span class="text-xs font-mono text-gold">Fertig: {completed}/{items.length}</span>
  </div>
  <div class="h-1.5 w-full rounded-full bg-dark mb-4" role="progressbar"
       aria-valuenow={completed} aria-valuemin="0" aria-valuemax={items.length}>
    <div class="h-1.5 rounded-full bg-gold transition-all" style={`width:${pct}%`}></div>
  </div>
  <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" role="list">
    {#each items as it}
      <li class="flex items-center gap-2" role="listitem">
        <span class={it.done ? 'text-green-400' : 'text-muted'}>{it.done ? '✓' : '○'}</span>
        <span class={it.done ? 'text-light' : 'text-muted'}>{it.label}</span>
      </li>
    {/each}
  </ul>
</div>
