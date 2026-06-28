<script lang="ts">
  import type { TicketDetail, Phase, InjectionKind } from '../../lib/factory-floor-types';
  import { phaseDurations } from '../../lib/factory-floor-client';
  import type { CiCheck, CiRollup } from '../../lib/factory-ci';
  import SuggestedFiles from './SuggestedFiles.svelte';

  const PHASE_ORDER: Phase[] = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'];

  let {
    detail,
    ciChecks,
    ciRollup,
    injKind,
    injPhase,
    injTitle,
    injContent,
    injBusy,
    injError,
    onSubmitInjection,
    prUrl,
  }: {
    detail: TicketDetail;
    ciChecks: CiCheck[];
    ciRollup: CiRollup;
    injKind: InjectionKind;
    injPhase: string;
    injTitle: string;
    injContent: string;
    injBusy: boolean;
    injError: string | null;
    onSubmitInjection: () => void;
    prUrl: (n: number) => string;
  } = $props();

  function phaseDotState(phase: Phase): 'active' | 'done' | 'future' {
    const currentPhase = detail.events[0]?.phase;
    const currentIdx = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1;
    const phaseIdx = PHASE_ORDER.indexOf(phase);
    if (phaseIdx < 0) return 'future';
    if (detail.events.some((e) => e.phase === phase && e.state === 'done')) return 'done';
    if (phaseIdx === currentIdx) return 'active';
    if (phaseIdx < currentIdx) return 'done';
    return 'future';
  }

  function fmtDuration(sec: number | null): string {
    if (sec == null) return '';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}min`;
    return `${(sec / 3600).toFixed(1)}h`;
  }
</script>

<div class="detail-panel__phase-chain">
  {#each PHASE_ORDER as phase, i (phase)}
    {#if i > 0}
      <div class="detail-panel__phase-line" class:done={phaseDotState(PHASE_ORDER[i - 1]) === 'done'}></div>
    {/if}
    <div
      class="detail-panel__phase-dot"
      class:active={phaseDotState(phase) === 'active'}
      class:done={phaseDotState(phase) === 'done'}
      title={phase}
    ></div>
  {/each}
</div>

<p class="detail-panel__desc">{detail.title}</p>
<p class="detail-panel__meta">
  Status: {detail.status} · Priorität: {detail.priority} · Retries: {detail.retryCount}
  {#if detail.prNumber}
    · <a href={prUrl(detail.prNumber)} target="_blank" rel="noopener noreferrer" class="detail-panel__link">PR #{detail.prNumber} ↗</a>
  {/if}
</p>

<h4 class="detail-panel__section">Phasen-Timeline</h4>
<ul class="detail-panel__events">
  {#each phaseDurations(detail.events) as e}
    <li class="detail-panel__event">
      <span class="detail-panel__event-phase">{e.phase}/{e.state}</span>
      <span class="detail-panel__event-meta"> · {new Date(e.at).toLocaleString('de-DE')} · {e.driver}</span>
      {#if e.durationSec != null}<span class="detail-panel__event-duration"> · {fmtDuration(e.durationSec)}</span>{/if}
      {#if e.detail}<span class="detail-panel__event-detail">{e.detail}</span>{/if}
    </li>
  {/each}
</ul>

<h4 class="detail-panel__section">CI-Checks</h4>
{#if ciRollup === null}
  <p class="detail-panel__empty">keine CI-Checks</p>
{:else}
  <ul class="detail-panel__events">
    {#each ciChecks as c}
      <li class="detail-panel__event">
        {#if c.url}
          <a href={c.url} target="_blank" rel="noopener noreferrer" class="detail-panel__link">{c.name}</a>
        {:else}
          <span>{c.name}</span>
        {/if}
        <span class="detail-panel__event-meta"> · {c.status}{c.conclusion ? `/${c.conclusion}` : ''}</span>
      </li>
    {/each}
  </ul>
{/if}

{#if detail.breadcrumbs.length}
  <h4 class="detail-panel__section">Breadcrumbs</h4>
  <ul class="detail-panel__breadcrumbs">
    {#each detail.breadcrumbs as b}
      <li class="detail-panel__breadcrumb">
        <span class="detail-panel__breadcrumb-author">{b.authorLabel}:</span> {b.body}
      </li>
    {/each}
  </ul>
{/if}

<h4 class="detail-panel__section">Injektionen</h4>
{#if detail.injections.length}
  <ul class="detail-panel__injections" data-testid="inject-list">
    {#each detail.injections as inj (inj.id)}
      <li class="detail-panel__injection">
        <span class="detail-panel__injection-kind">{inj.kind}{inj.phase ? `@${inj.phase}` : ''}</span>
        {#if inj.title}<span class="detail-panel__injection-title"> {inj.title}</span>{/if}
        <span class="detail-panel__injection-status">{inj.consumedAt ? `✓ konsumiert ${new Date(inj.consumedAt).toLocaleString('de-DE')}` : '⏳ offen'}</span>
        {#if inj.content}<span class="detail-panel__injection-content">{inj.content}</span>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="detail-panel__empty">Keine Injektionen.</p>
{/if}

<details class="detail-panel__inject" data-testid="inject-form">
  <summary class="detail-panel__inject-summary">Injizieren</summary>
  <div class="detail-panel__inject-form">
    <select bind:value={injKind} class="detail-panel__inject-select" data-testid="inject-kind">
      <option value="context">context</option>
      <option value="note">note</option>
      <option value="asset">asset</option>
    </select>
    <select bind:value={injPhase} class="detail-panel__inject-select" data-testid="inject-phase">
      <option value="">nächste Grenze (NULL)</option>
      <option value="scout">scout</option>
      <option value="design">design</option>
      <option value="plan">plan</option>
      <option value="implement">implement</option>
      <option value="verify">verify</option>
      <option value="deploy">deploy</option>
    </select>
    <input bind:value={injTitle} placeholder="Titel (optional)" class="detail-panel__inject-input" data-testid="inject-title" />
    <textarea bind:value={injContent} placeholder="Kontext / Notiz" rows="3" class="detail-panel__inject-textarea" data-testid="inject-content"></textarea>
    {#if injError}<p class="detail-panel__inject-error">{injError}</p>{/if}
    <button onclick={onSubmitInjection} disabled={injBusy} class="detail-panel__inject-submit" data-testid="inject-submit">
      {injBusy ? 'sende…' : 'injizieren'}
    </button>
  </div>
</details>

{#if detail.suggested_files?.length}
  <SuggestedFiles files={detail.suggested_files} />
{/if}

<style>
  .detail-panel__phase-chain {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: var(--factory-spacing-lg);
    padding: var(--factory-spacing-sm) 0;
  }

  .detail-panel__phase-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--factory-phase-future);
    flex-shrink: 0;
    transition: background 0.2s;
  }

  .detail-panel__phase-dot.active { background: var(--factory-accent); box-shadow: 0 0 8px var(--factory-accent); }
  .detail-panel__phase-dot.done { background: var(--factory-success); }

  .detail-panel__phase-line {
    flex: 1;
    height: 2px;
    background: var(--factory-phase-future);
    min-width: 12px;
  }

  .detail-panel__phase-line.done { background: var(--factory-success); }

  .detail-panel__desc {
    font-family: var(--factory-font-sans);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-primary);
    margin: 0 0 var(--factory-spacing-sm);
  }

  .detail-panel__meta {
    font-size: var(--factory-text-xs);
    color: var(--factory-text-muted);
    margin: 0 0 var(--factory-spacing-md);
  }

  .detail-panel__link { color: var(--factory-accent); text-decoration: none; }
  .detail-panel__link:hover { text-decoration: underline; }

  .detail-panel__section {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    font-weight: 600;
    color: var(--factory-text-secondary);
    margin: var(--factory-spacing-md) 0 var(--factory-spacing-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .detail-panel__events {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--factory-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-xs);
  }

  .detail-panel__event {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
    font-size: var(--factory-text-xs);
  }

  .detail-panel__event-phase { color: var(--factory-accent); }
  .detail-panel__event-meta { color: var(--factory-text-muted); }

  .detail-panel__event-detail {
    display: block;
    color: var(--factory-text-muted);
    font-size: 10px;
    margin-top: 2px;
  }

  .detail-panel__event-duration { color: var(--factory-accent); font-size: 10px; }

  .detail-panel__breadcrumbs {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--factory-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-xs);
  }

  .detail-panel__breadcrumb {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
    font-size: 11px;
    color: var(--factory-text-primary);
  }

  .detail-panel__breadcrumb-author { color: var(--factory-text-muted); }

  .detail-panel__injections {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--factory-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-xs);
  }

  .detail-panel__injection {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
    font-size: var(--factory-text-xs);
  }

  .detail-panel__injection-kind { color: var(--factory-accent); }
  .detail-panel__injection-title { font-weight: 600; color: var(--factory-text-primary); }

  .detail-panel__injection-status {
    display: block;
    color: var(--factory-text-muted);
    font-size: 10px;
  }

  .detail-panel__injection-content {
    display: block;
    color: var(--factory-text-muted);
    font-size: 10px;
    margin-top: 2px;
  }

  .detail-panel__empty {
    color: var(--factory-text-muted);
    font-size: var(--factory-text-sm);
    margin: 0 0 var(--factory-spacing-md);
  }

  .detail-panel__inject { margin-top: var(--factory-spacing-md); }

  .detail-panel__inject-summary {
    cursor: pointer;
    font-weight: 600;
    font-size: var(--factory-text-sm);
    color: var(--factory-text-secondary);
  }

  .detail-panel__inject-form {
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-sm);
    margin-top: var(--factory-spacing-sm);
  }

  .detail-panel__inject-select,
  .detail-panel__inject-input,
  .detail-panel__inject-textarea {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-primary);
  }

  .detail-panel__inject-error { color: var(--factory-error); font-size: var(--factory-text-xs); }

  .detail-panel__inject-submit {
    background: var(--factory-success);
    color: white;
    border: none;
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-md);
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .detail-panel__inject-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
