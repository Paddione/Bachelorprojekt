<!-- website/src/components/admin/TicketActivityTimeline.svelte -->
<script lang="ts">
  import type { TimelineEntry } from '../../lib/tickets/admin';
  export let entries: TimelineEntry[] = [];

  const FIELD_LABEL: Record<string, string> = {
    status:        'Status',
    resolution:    'Resolution',
    priority:      'Priorität',
    severity:      'Severität',
    assignee_id:   'Zuständig',
    customer_id:   'Kunde',
    reporter_id:   'Reporter',
    reporter_email:'Reporter-E-Mail',
    title:         'Titel',
    description:   'Beschreibung',
    url:           'URL',
    component:     'Komponente',
    thesis_tag:    'Thesis-Tag',
    parent_id:     'Parent',
    start_date:    'Start',
    due_date:      'Fällig',
    estimate_minutes: 'Schätzung',
  };

  const LINK_KIND_LABEL: Record<string, string> = {
    blocks:        'blockt',
    blocked_by:    'blockiert von',
    duplicate_of:  'Duplikat von',
    relates_to:    'verwandt mit',
    fixes:         'behebt',
    fixed_by:      'behoben durch',
  };

  function fmt(d: Date | string): string {
    return new Date(d).toLocaleString('de-DE',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined || v === '') return '∅';
    if (typeof v === 'string')  return v.length > 80 ? v.slice(0, 80) + '…' : v;
    if (typeof v === 'number')  return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v).slice(0, 80);
  }
</script>

<ol class="ticket-timeline">
  {#each entries as e, i (i + '-' + (typeof e.at === 'string' ? e.at : (e.at as Date).toISOString()) + '-' + e.kind)}
    <li class="ticket-timeline-row">
      <span class="ticket-timeline-dot" data-kind={e.kind}></span>
      <div class="ticket-timeline-body">
        <div class="ticket-timeline-meta">
          <span class="ticket-timeline-actor">{e.actor ?? 'system'}</span>
          <span class="ticket-timeline-when">{fmt(e.at)}</span>
        </div>

        {#if e.kind === 'created'}
          <p>Ticket erstellt</p>
        {:else if e.kind === 'updated'}
          <ul class="ticket-timeline-diff">
            {#each Object.entries(e.diff) as [field, change]}
              <li>
                <strong>{FIELD_LABEL[field] ?? field}:</strong>
                <span class="old">{fmtVal(change.old)}</span>
                →
                <span class="new">{fmtVal(change.new)}</span>
              </li>
            {/each}
          </ul>
        {:else if e.kind === 'comment'}
          <div class="ticket-timeline-comment" data-visibility={e.visibility}>
            {#if e.visibility === 'public'}
              <span class="ticket-timeline-badge">öffentlich</span>
            {:else}
              <span class="ticket-timeline-badge">intern</span>
            {/if}
            {#if e.commentKind !== 'comment'}
              <span class="ticket-timeline-badge alt">{e.commentKind}</span>
            {/if}
            <p style="white-space: pre-wrap; margin: 4px 0 0;">{e.body}</p>
          </div>
        {:else if e.kind === 'link_added'}
          <p>
            Verknüpfung: <strong>{LINK_KIND_LABEL[e.linkKind] ?? e.linkKind}</strong>
            <a href={`/admin/tickets/${e.otherId}`}>{e.otherTitle}</a>
            {#if e.prNumber}
              <span class="ticket-timeline-pr">(PR #{e.prNumber})</span>
            {/if}
          </p>
        {:else if e.kind === 'pr_merged'}
          <p>
            PR <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${e.prNumber}`}
                  target="_blank" rel="noopener">#{e.prNumber}</a>
            gemergt: {e.prTitle}
            {#if e.mergedBy} — {e.mergedBy}{/if}
          </p>
        {/if}
      </div>
    </li>
  {/each}
  {#if entries.length === 0}
    <li class="ticket-timeline-empty">Noch keine Aktivität.</li>
  {/if}
</ol>

<style>
  .ticket-timeline {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 14px;
  }
  .ticket-timeline-row { display: grid; grid-template-columns: 16px 1fr; gap: 12px; }
  .ticket-timeline-dot {
    width: 10px; height: 10px; border-radius: 50%; margin-top: 6px;
    background: var(--mute, #888); border: 2px solid var(--ink-900, #0f1623);
    box-shadow: 0 0 0 2px var(--brass-d, #2a3a52);
  }
  .ticket-timeline-dot[data-kind="comment"] { background: var(--brass, #e8c870); }
  .ticket-timeline-dot[data-kind="link_added"] { background: #6ab0ff; }
  .ticket-timeline-dot[data-kind="pr_merged"]  { background: #8be3a0; }
  .ticket-timeline-dot[data-kind="created"]    { background: #b48ce8; }
  .ticket-timeline-meta {
    font-size: 11px; color: var(--mute, #aabbcc); display: flex; gap: 10px; margin-bottom: 2px;
  }
  .ticket-timeline-actor { color: var(--fg, #e8e8f0); font-weight: 500; }
  .ticket-timeline-diff { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .ticket-timeline-diff .old { color: var(--mute, #aabbcc); text-decoration: line-through; }
  .ticket-timeline-diff .new { color: var(--brass, #e8c870); }
  .ticket-timeline-comment {
    background: rgba(255,255,255,0.04); border-radius: 8px; padding: 8px 10px;
    border-left: 3px solid var(--brass, #e8c870);
  }
  .ticket-timeline-comment[data-visibility="public"] {
    border-left-color: #8be3a0;
  }
  .ticket-timeline-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 4px;
    background: rgba(232,200,112,0.15); color: var(--brass, #e8c870);
    font-family: monospace; text-transform: lowercase;
  }
  .ticket-timeline-badge.alt { background: rgba(255,255,255,0.1); color: var(--fg, #e8e8f0); }
  .ticket-timeline-pr { color: var(--mute, #aabbcc); font-family: monospace; font-size: 12px; }
  .ticket-timeline-empty { color: var(--mute, #aabbcc); font-size: 13px; padding: 8px 0; }
  a { color: var(--brass, #e8c870); }
  a:hover { text-decoration: underline; }
</style>
