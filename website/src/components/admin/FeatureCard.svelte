<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  export let feature: FeatureNode;
  export let onClick: () => void;
  const dispatch = createEventDispatcher();
  $: r = feature.rollup;
  function activate(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    onClick();
  }
</script>

<div
  class={`feature-card health-${feature.health}`}
  data-testid="feature-card"
  role="button" tabindex="0"
  on:click={onClick} on:keydown={activate}
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
    padding: 0.75rem 1rem; background: var(--admin-card-bg, #1c1f26); cursor: pointer; }
  .feature-card:focus-visible { outline: 2px solid #6ea8fe; }
  .health-green { --health: #10b981; }
  .health-amber { --health: #f59e0b; }
  .health-red   { --health: #ef4444; }
  .title { margin: 0 0 0.25rem; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value-prop { margin: 0 0 0.5rem; font-size: 0.8rem; opacity: 0.7; }
  .bar { display: flex; height: 6px; border-radius: 3px; background: #2a2e37; overflow: hidden; }
  .seg.done { background: #10b981; } .seg.blocked { background: #ef4444; }
  .chips { display: flex; gap: 0.4rem; margin-top: 0.5rem; font-size: 0.72rem; }
  .chip { padding: 0.05rem 0.4rem; border-radius: 4px; background: #2a2e37; }
</style>
