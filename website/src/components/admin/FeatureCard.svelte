<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  export let feature: FeatureNode;
  export let onClick: () => void;
  // Callback prop for reparent (Svelte 5 compatible, also dispatches event for parent use)
  export let onReparent: ((detail: { ticketId: string; newParentId: string }) => void) | undefined = undefined;
  const dispatch = createEventDispatcher();
  $: r = feature.rollup;
  function activate(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    onClick();
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const ticketId = e.dataTransfer?.getData('text/plain') ?? '';
    if (ticketId) {
      const detail = { ticketId, newParentId: feature.id };
      onReparent?.(detail);
      dispatch('reparent', detail);
    }
  }
</script>

<div
  class={`feature-card health-${feature.health}`}
  data-testid="feature-card"
  role="button" tabindex="0"
  on:click={onClick} on:keydown={activate}
  on:dragover|preventDefault
  on:drop|preventDefault={handleDrop}
>
  <h4 class="title">{feature.title}</h4>
  {#if feature.valueProp}<p class="value-prop">{feature.valueProp}</p>{/if}
  <div class="bar" data-testid="progress-bar" aria-label={`${r.pctDone}% done`}>
    <span class="seg done" style={`width:${r.total ? (100 * r.done) / r.total : 0}%`}></span>
    <span class="seg blocked" style={`width:${r.total ? (100 * r.blocked) / r.total : 0}%`}></span>
  </div>
  <div class="chips">
    <span class="chip done">{r.done} done</span>
    <span class="chip blocked">{r.blocked} blocked</span>
    <span class="chip open">{r.open} open</span>
  </div>
</div>

<style>
  .feature-card { border-left: 4px solid var(--health, #888); border-radius: 8px;
    padding: 0.75rem 1rem; background: var(--admin-card-bg, #1c1f26); cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.2s ease; }
  .feature-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.25); }
  .feature-card:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; }
  .health-green { --health: #10b981; }
  .health-amber { --health: #f59e0b; }
  .health-red   { --health: #ef4444; }
  .title { margin: 0 0 0.25rem; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value-prop { margin: 0 0 0.5rem; font-size: 0.8rem; opacity: 0.65; line-height: 1.35; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .bar { display: flex; height: 6px; border-radius: 3px; background: #2a2e37; overflow: hidden; margin-bottom: 0.35rem; }
  .seg.done { background: linear-gradient(90deg, #059669, #10b981); }
  .seg.blocked { background: linear-gradient(90deg, #dc2626, #ef4444); }
  .chips { display: flex; gap: 0.3rem; margin-top: 0.5rem; font-size: 0.7rem; }
  .chip { padding: 0.1rem 0.45rem; border-radius: 999px; background: #2a2e37; font-weight: 500; }
  .chip.done { background: rgba(16,185,129,.15); color: #34d399; }
  .chip.blocked { background: rgba(239,68,68,.15); color: #f87171; }
  .chip.open { background: rgba(148,163,184,.12); color: #94a3b8; }
</style>
