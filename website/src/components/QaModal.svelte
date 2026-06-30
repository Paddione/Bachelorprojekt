<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { QaItem } from '../lib/qa-dal';

  export let item: QaItem;
  export let criteria: { key: string; label: string }[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    submitted: { verdict: 'approved' | 'rejected' };
  }>();

  let checked: Record<string, boolean> = {};
  let notes = '';
  let reEntryPhase: 'implement' | 'verify' | 'scout' = 'implement';
  let submitting = false;
  let error = '';

  $: if (item.lastReview) {
    for (const c of item.lastReview.criteria) checked[c.key] = c.passed;
    notes = item.lastReview.notes ?? '';
  }

  $: checkedCount = criteria.filter((c) => checked[c.key]).length;
  $: anyUnchecked = criteria.some((c) => !checked[c.key]);
  $: allChecked = criteria.length > 0 && criteria.every((c) => checked[c.key]);
  $: canApprove = allChecked && !submitting;
  $: canReject = anyUnchecked && notes.trim().length > 0 && !submitting;

  function relTime(iso: string | null): string {
    if (!iso) return '?';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)} Min.`;
    if (h < 24) return `${h} Std.`;
    return `${Math.floor(h / 24)} Tage`;
  }

  async function submit(verdict: 'approved' | 'rejected') {
    submitting = true;
    error = '';
    try {
      const res = await fetch('/api/admin/qa-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: item.ticketId,
          criteria: criteria.map((c) => ({ key: c.key, passed: !!checked[c.key] })),
          notes: notes || undefined,
          verdict,
          re_entry_phase: verdict === 'rejected' ? reEntryPhase : undefined,
        }),
      });
      if (!res.ok) {
        const { error: e } = await res.json();
        throw new Error(e ?? 'Unbekannter Fehler');
      }
      dispatch('submitted', { verdict });
      dispatch('close');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="overlay" on:click|self={() => dispatch('close')} data-testid="qa-modal-overlay">
  <div class="modal" data-testid="qa-modal">
    <header>
      <div class="header-left">
        <span class="ext-id">{item.extId}</span>
        <span class="title">{item.title}</span>
        {#if item.prNumber}
          <a href="https://github.com/Paddione/Bachelorprojekt/pull/{item.prNumber}"
             target="_blank" rel="noopener" class="pr-link">PR #{item.prNumber}</a>
        {/if}
      </div>
      <div class="header-right">
        {#if item.deployedAt}
          <span class="age">vor {relTime(item.deployedAt)}</span>
        {/if}
        <button class="close-btn" on:click={() => dispatch('close')} aria-label="Schließen">✕</button>
      </div>
    </header>

    <section class="checklist" data-testid="qa-checklist">
      <div class="section-label">Abnahme-Kriterien</div>
      {#if item.lastReview}
        <p class="re-review-hint">Vorheriges Review: {item.lastReview.notes ?? '–'}</p>
      {/if}
      {#each criteria as c}
        <label class="criterion">
          <input
            type="checkbox"
            bind:checked={checked[c.key]}
            data-testid="qa-criterion-{c.key}"
          />
          <span>{c.label}</span>
        </label>
      {/each}
    </section>

    {#if anyUnchecked}
      <section class="feedback">
        <div class="section-label">Kommentar <span class="required">*</span></div>
        <textarea
          bind:value={notes}
          placeholder="Was muss behoben werden?"
          data-testid="qa-notes"
          rows="3"
        ></textarea>

        <div class="section-label phase-label">Zurück in Pipeline bei Phase</div>
        <select bind:value={reEntryPhase} data-testid="qa-phase-select">
          <option value="implement">implement — neu bauen</option>
          <option value="verify">verify — nochmal prüfen</option>
          <option value="scout">scout — neu scopen</option>
        </select>
      </section>
    {/if}

    {#if error}
      <p class="error-msg">{error}</p>
    {/if}

    <footer>
      <span class="progress">{checkedCount}/{criteria.length} bestanden</span>
      <div class="actions">
        <button
          class="btn btn-reject"
          disabled={!canReject}
          on:click={() => submit('rejected')}
          data-testid="qa-btn-reject"
        >↺ Zurückschicken</button>
        <button
          class="btn btn-approve"
          disabled={!canApprove}
          on:click={() => submit('approved')}
          data-testid="qa-btn-approve"
        >✓ Abnehmen</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center; z-index: 50;
  }
  .modal {
    background: #1a2035; border: 1px solid #22c55e; border-radius: 6px;
    padding: 20px; width: min(560px, 95vw); max-height: 90vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .header-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ext-id { font-family: monospace; font-size: 13px; color: #f0c040; }
  .title { font-weight: 600; font-size: 14px; }
  .pr-link { font-size: 11px; color: #6366f1; text-decoration: none; }
  .pr-link:hover { text-decoration: underline; }
  .header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .age { font-size: 11px; color: #8892a4; }
  .close-btn { background: none; border: none; color: #8892a4; cursor: pointer; font-size: 16px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8892a4; margin-bottom: 6px; }
  .required { color: #ef4444; }
  .re-review-hint { font-size: 11px; color: #8892a4; background: rgba(255,255,255,0.05); padding: 6px 8px; border-radius: 3px; margin-bottom: 8px; }
  .criterion { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; font-size: 13px; }
  .criterion input { accent-color: #22c55e; width: 15px; height: 15px; }
  .feedback { display: flex; flex-direction: column; gap: 6px; }
  .phase-label { margin-top: 8px; }
  textarea {
    background: #0d1117; border: 1px solid #333; border-radius: 4px;
    color: #e6edf3; font-size: 12px; padding: 8px; resize: vertical; width: 100%; box-sizing: border-box;
  }
  select {
    background: #0d1117; border: 1px solid #333; border-radius: 4px;
    color: #e6edf3; font-size: 12px; padding: 6px; width: 100%;
  }
  .error-msg { color: #ef4444; font-size: 12px; }
  footer { display: flex; justify-content: space-between; align-items: center; }
  .progress { font-size: 11px; color: #8892a4; }
  .actions { display: flex; gap: 8px; }
  .btn { border: none; border-radius: 4px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-approve { background: #22c55e; color: #000; }
  .btn-reject { background: #ef4444; color: #fff; }
</style>
