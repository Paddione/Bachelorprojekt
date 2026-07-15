<script lang="ts">
  import PhaseStepper from '../factory/PhaseStepper.svelte';
  import AdminBadge from './ui/AdminBadge.svelte';
  import { toCockpitExpand, type CockpitExpandModel } from '../../lib/admin/cockpit-expand';

  let { extId }: { extId: string } = $props();
  let model = $state<CockpitExpandModel | null>(null);
  let error = $state(false);

  $effect(() => {
    let cancelled = false;
    fetch(`/api/factory-floor/${extId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch_failed'))))
      .then((detail) => { if (!cancelled) model = toCockpitExpand(detail); })
      .catch(() => { if (!cancelled) error = true; });
    return () => { cancelled = true; };
  });
</script>

<div class="expand" data-testid="cockpit-expand">
  {#if error}
    <p class="expand__muted">Details konnten nicht geladen werden.</p>
  {:else if !model}
    <p class="expand__muted">Lädt …</p>
  {:else}
    {#if model.description}<p class="expand__desc">{model.description}</p>{/if}
    <PhaseStepper segments={model.segments} />
    {#if model.links.length}
      <div class="expand__links">
        {#each model.links as l}<a href={l.href}><AdminBadge variant="warning" size="sm">{l.label}</AdminBadge></a>{/each}
        <a href="/admin/pipeline?tab=factory"><AdminBadge variant="warning" size="sm">Pipeline</AdminBadge></a>
      </div>
    {/if}
    {#if model.latestEvents.length}
      <ul class="expand__events">
        {#each model.latestEvents as e}<li><AdminBadge variant="neutral" size="sm">{e.phase}</AdminBadge> {e.state}</li>{/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .expand { padding: var(--space-3) var(--space-4); background: var(--admin-surface); border-top: 1px solid var(--admin-border); display: flex; flex-direction: column; gap: 8px; }
  .expand__muted { color: var(--admin-text-mute); font-size: 12px; margin: 0; }
  .expand__desc { color: var(--admin-text); font-size: 13px; margin: 0; white-space: pre-wrap; }
  .expand__links, .expand__events { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; }
</style>
