<script lang="ts">
  import type { TriageSuggestion } from '../lib/planning-office-types';

  let { extId, triage, onTriageDone }: {
    extId: string;
    triage: TriageSuggestion | null;
    onTriageDone: () => void;
  } = $props();

  let busy = $state(false);

  async function triageAction(action: 'apply' | 'discard') {
    busy = true;
    try {
      await fetch(`/api/admin/planungsbuero/${extId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ triageAction: action }),
      });
      onTriageDone();
    } catch {
      // ignore network errors
    }
    busy = false;
  }
</script>

{#if triage}
  <div class="pb-triage" data-testid="pb-triage">
    <div class="pb-triage-hdr">
      <span class="pb-triage-badge">KI-Vorschlag</span>
      <span class="pb-triage-model">{triage.model}</span>
    </div>
    <ul class="pb-triage-fields">
      <li><em>Typ:</em> {triage.type}</li>
      <li><em>Priorität:</em> {triage.priority}</li>
      <li><em>Schwere:</em> {triage.severity}</li>
      <li><em>Bereiche:</em> {(triage.areas ?? []).join(', ') || '—'}</li>
      <li><em>Komponente:</em> {triage.component ?? '—'}</li>
      <li><em>Vorgeschlagen für:</em> {triage.assignee_suggested}</li>
    </ul>
    {#if triage.rationale}
      <blockquote class="pb-triage-rationale">{triage.rationale}</blockquote>
    {/if}
    <div class="pb-triage-actions">
      <button
        class="pb-triage-btn pb-triage-apply"
        data-testid="pb-triage-apply"
        onclick={() => triageAction('apply')}
        disabled={busy}
      >
        Übernehmen
      </button>
      <button
        class="pb-triage-btn pb-triage-discard"
        data-testid="pb-triage-discard"
        onclick={() => triageAction('discard')}
        disabled={busy}
      >
        Verwerfen
      </button>
    </div>
  </div>
{/if}

<style>
  .pb-triage {
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid var(--admin-border);
    border-radius: 6px;
    background: var(--admin-selected-bg);
    font-size: 0.78rem;
  }
  .pb-triage-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .pb-triage-badge {
    background: var(--admin-amber);
    color: var(--admin-bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
  }
  .pb-triage-model {
    color: var(--admin-text-muted);
    font-size: 0.68rem;
  }
  .pb-triage-fields {
    list-style: none;
    padding: 0;
    margin: 0 0 8px 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 16px;
  }
  .pb-triage-fields li {
    color: var(--admin-text);
  }
  .pb-triage-fields em {
    font-style: normal;
    color: var(--admin-text-muted);
  }
  .pb-triage-rationale {
    margin: 6px 0 10px;
    padding: 6px 10px;
    border-left: 3px solid var(--admin-amber-dim);
    color: var(--admin-text-muted);
    font-style: italic;
    font-size: 0.75rem;
  }
  .pb-triage-actions {
    display: flex;
    gap: 8px;
  }
  .pb-triage-btn {
    padding: 4px 12px;
    border: 1px solid var(--admin-border);
    border-radius: 4px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font-family: var(--admin-mono);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .pb-triage-btn:hover:not(:disabled) {
    border-color: var(--admin-text-muted);
  }
  .pb-triage-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pb-triage-apply:hover:not(:disabled) {
    color: var(--admin-amber);
    border-color: var(--admin-amber);
  }
  .pb-triage-discard:hover:not(:disabled) {
    color: #e5534b;
    border-color: #e5534b;
  }
</style>
