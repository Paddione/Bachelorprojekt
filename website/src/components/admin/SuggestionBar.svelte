<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  import type { Suggestion } from '../../lib/tickets/suggest-prompt';

  export let features: FeatureNode[] = [];
  export let suggestions: Suggestion[] = [];
  export let isRolling: boolean = false;
  export let onroll: ((detail: { provider: string; model: string }) => void) | undefined = undefined;
  export let onapply: (() => void) | undefined = undefined;
  export let onreset: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  let provider: string = 'deepseek';
  let model: string = 'deepseek-chat';

  $: nextCount = features.filter(f => f.nextStep).length;
  $: discardedCount = features.filter(f => f.discarded).length;
  $: majorCount = features.filter(f => f.majorFeature).length;

  function titleFor(featureId: string): string {
    return features.find(f => f.extId === featureId)?.title ?? featureId;
  }

  function onRoll() {
    const detail = { provider, model };
    onroll?.(detail);
    dispatch('roll', detail);
  }

  function onApply() {
    onapply?.();
    dispatch('apply');
  }

  function onReset() {
    onreset?.();
    dispatch('reset');
  }
</script>

<div class="suggestion-bar" data-testid="suggestion-bar">
  <div class="actions">
    <select bind:value={provider} aria-label="KI-Provider">
      <option value="deepseek">DeepSeek</option>
      <option value="anthropic">Anthropic</option>
      <option value="local-cluster">Local Cluster</option>
    </select>
    <select bind:value={model} aria-label="Modell">
      {#if provider === 'deepseek'}
        <option value="deepseek-chat">DeepSeek Chat</option>
        <option value="deepseek-reasoner">DeepSeek Reasoner</option>
      {:else if provider === 'anthropic'}
        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
      {:else}
        <option value="qwen2.5">Qwen 2.5</option>
      {/if}
    </select>
    <button class="roll-btn" on:click={onRoll} disabled={isRolling || features.length === 0}
      title="Feature-Vorschläge via KI neu rollen">
      {isRolling ? 'Rolle …' : '🎲 Rollen'}
    </button>
    <button class="apply-btn" on:click={onApply} disabled={nextCount === 0}
      title="Aktuelle Vorschläge übernehmen">Übernehmen</button>
    <button class="reset-btn" on:click={onReset} disabled={nextCount === 0}
      title="Alle next_step-Flags zurücksetzen">Zurücksetzen</button>
  </div>
  <div class="counters">
    <span class="counter next" title="Für nächsten Schritt">▶ {nextCount} nächster Schritt</span>
    <span class="counter discarded" title="Verworfen">🗑 {discardedCount} verworfen</span>
    <span class="counter major" title="Major Features">★ {majorCount} Major</span>
    <span class="counter total">∑ {features.length} Features</span>
  </div>
</div>

{#if suggestions.length > 0}
  <ul class="suggestion-list" data-testid="suggestion-list">
    {#each suggestions as s (s.featureId)}
      <li class="suggestion" class:next={s.nextStep}>
        <span class="s-flag" title={s.nextStep ? 'Als nächster Schritt empfohlen' : 'Nicht für nächsten Schritt'}>
          {s.nextStep ? '▶' : '·'}
        </span>
        <span class="s-title">{titleFor(s.featureId)}</span>
        {#if s.impact}
          <span class="impact impact-{s.impact}" title="Geschätzter Nutzen">{s.impact}</span>
        {/if}
        <span class="s-reason">{s.reason}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .suggestion-bar { display: flex; align-items: center; justify-content: space-between;
    gap: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(28,31,38,.5); border-radius: 8px;
    border: 1px solid #2a2e37; flex-wrap: wrap; }
  .actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  select { padding: 0.3rem 0.5rem; border-radius: 6px; border: 1px solid #2a2e37;
    background: #1c1f26; color: #e5e7eb; font-size: 0.8rem; }
  button { padding: 0.35rem 0.7rem; border-radius: 6px; border: 1px solid #2a2e37;
    background: #1c1f26; color: #e5e7eb; cursor: pointer; font-size: 0.8rem;
    transition: all 0.12s ease; }
  button:hover:not(:disabled) { background: #2a2e37; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .roll-btn { background: #1a3a5c; border-color: #2a5a8c; font-weight: 600; }
  .roll-btn:hover:not(:disabled) { background: #2a5a8c; }
  .apply-btn { background: rgba(16,185,129,.15); border-color: #10b981; color: #34d399; }
  .apply-btn:hover:not(:disabled) { background: rgba(16,185,129,.25); }
  .reset-btn { background: rgba(239,68,68,.1); border-color: #ef4444; color: #f87171; }
  .reset-btn:hover:not(:disabled) { background: rgba(239,68,68,.2); }
  .counters { display: flex; gap: 0.75rem; font-size: 0.78rem; flex-wrap: wrap; }
  .counter { padding: 0.1rem 0.45rem; border-radius: 999px; font-weight: 500; }
  .counter.next { background: rgba(16,185,129,.12); color: #34d399; }
  .counter.discarded { background: rgba(239,68,68,.12); color: #f87171; }
  .counter.major { background: rgba(245,158,11,.12); color: #fbbf24; }
  .counter.total { background: #2a2e37; color: #9ca3af; }

  .suggestion-list { list-style: none; margin: 0.5rem 0 0; padding: 0;
    display: flex; flex-direction: column; gap: 0.25rem; }
  .suggestion { display: flex; align-items: baseline; gap: 0.4rem;
    font-size: 0.78rem; padding: 0.2rem 0.4rem; border-radius: 6px;
    background: rgba(28,31,38,.4); }
  .suggestion.next { background: rgba(16,185,129,.08); }
  .s-flag { color: #34d399; width: 1ch; flex-shrink: 0; }
  .s-title { font-weight: 600; color: #e5e7eb; flex-shrink: 0; }
  .s-reason { color: #9ca3af; }
  .impact { padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.7rem;
    font-weight: 600; flex-shrink: 0; }
  .impact-hoch { background: rgba(16,185,129,.15); color: #34d399; }
  .impact-mittel { background: rgba(245,158,11,.15); color: #fbbf24; }
  .impact-niedrig { background: #2a2e37; color: #9ca3af; }
</style>
