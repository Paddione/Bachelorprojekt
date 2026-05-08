<!-- website/src/components/SystemtestBoardCard.svelte -->
<!--
  Single card on the system-test failure kanban (Task 7).

  Props:
    row     – a row from /api/admin/systemtest/board (BoardRow shape)
    onOpen  – click handler invoked when the card is activated.
              v1: the page wires this to "open ticket detail in new tab" as
              a fallback, since the rrweb replay drawer (SystemtestReplayDrawer)
              is documented but not yet wired in.

  The card never trusts strings from the row to be safe HTML — all dynamic
  text is bound through Svelte's auto-escaping interpolation, never via
  {@html …}.
-->
<script lang="ts">
  type BoardRow = {
    assignment_id: string;
    question_id: string;
    last_result: string | null;
    last_result_at: string | null;
    retest_pending_at: string | null;
    retest_attempt: number;
    evidence_id: string | null;
    last_failure_ticket_id: string | null;
    ticket_id: string | null;
    ticket_external_id: string | null;
    ticket_status: string | null;
    ticket_resolution: string | null;
    pr_number: number | null;
    pr_merged_at: string | null;
    column_key: string | null;
  };

  export let row: BoardRow;
  export let onOpen: ((row: BoardRow) => void) | undefined = undefined;

  function ageLabel(ts: string | null): string {
    if (!ts) return '—';
    const diffMs = Date.now() - new Date(ts).getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return '—';
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    return `${days} d`;
  }

  // Stable label shown when external_id is missing (fresh ticket before
  // the BR-YYYYMMDD-xxxx generator stamps one).
  $: externalId = row.ticket_external_id ?? (row.ticket_id ? row.ticket_id.slice(0, 8) : '—');
  $: age = ageLabel(row.last_result_at);
  $: isRetest = (row.retest_attempt ?? 0) > 0;

  function handleClick() {
    if (onOpen) onOpen(row);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="systemtest-card"
  role="button"
  tabindex="0"
  on:click={handleClick}
  on:keydown={handleKey}
>
  <div class="row-head">
    <span class="ext-id">{externalId}</span>
    {#if isRetest}
      <span class="badge badge-retest" title="Retest-Versuch">
        Retest #{row.retest_attempt}
      </span>
    {/if}
  </div>

  <div class="row-body">
    <span class="age" title={row.last_result_at ?? ''}>{age}</span>
    {#if row.pr_number}
      <span class="badge badge-pr">PR #{row.pr_number}</span>
    {/if}
    {#if row.ticket_status}
      <span class="badge badge-status">{row.ticket_status}</span>
    {/if}
  </div>
</div>

<style>
  .systemtest-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.75rem 0.875rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.625rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .systemtest-card:hover,
  .systemtest-card:focus-visible {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(212, 175, 55, 0.4);
    outline: none;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .ext-id {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.75rem;
    color: #d4af37;
  }
  .row-body {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
    font-size: 0.6875rem;
  }
  .age {
    color: #888;
  }
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    line-height: 1.4;
    border: 1px solid transparent;
  }
  .badge-retest {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border-color: rgba(168, 85, 247, 0.3);
  }
  .badge-pr {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.3);
  }
  .badge-status {
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    border-color: rgba(255, 255, 255, 0.12);
  }
</style>
