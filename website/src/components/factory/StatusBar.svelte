<script lang="ts">
  let {
    stale,
    fetchedAt,
    viewMounted,
    floorView,
    onToggleView,
  }: {
    stale: boolean;
    fetchedAt: string;
    viewMounted: boolean;
    floorView: 'conveyor' | 'kanban';
    onToggleView: () => void;
  } = $props();

  function relTime(iso: string): string {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `vor ${s} Sek.`;
    const m = Math.round(s / 60);
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60);
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.round(h / 24)} Tg.`;
  }
</script>

<div class="ff-status-bar" data-testid="floor-pulse">
  <span class="ff-pulse" class:ff-pulse--warn={stale}></span>
  {#if stale}
    <span class="ff-status-text ff-status-text--warn" data-testid="floor-stale">Veraltet — letzter Stand wird gezeigt.</span>
  {:else}
    <span class="ff-status-text">live · {relTime(fetchedAt)}</span>
  {/if}
  {#if viewMounted}
    <button type="button" class="ff-view-btn" onclick={onToggleView} aria-label="Ansicht wechseln">
      {#if floorView === 'conveyor'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="1" y1="4" x2="15" y2="4" /><line x1="1" y1="8" x2="15" y2="8" /><line x1="1" y1="12" x2="15" y2="12" />
        </svg>
      {/if}
      <span class="ff-view-btn__label">{floorView === 'conveyor' ? 'Band' : 'Kanban'}</span>
    </button>
  {/if}
</div>

<style>
  .ff-status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }

  .ff-pulse {
    position: relative;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--sage, #4ade80);
    flex: none;
  }
  .ff-pulse::after {
    content: "";
    position: absolute; inset: 0;
    border-radius: 50%;
    background: var(--sage, #4ade80);
    animation: ff-pulse-ring 2.2s ease infinite;
  }
  .ff-pulse--warn { background: var(--brass, #d4a96a); }
  .ff-pulse--warn::after {
    background: var(--brass, #d4a96a);
    animation: none;
  }

  .ff-status-text {
    font-family: var(--mono, monospace);
    font-size: 11px;
    color: var(--mute, #8c96a3);
    letter-spacing: .04em;
  }
  .ff-status-text--warn { color: var(--brass, #d4a96a); }

  .ff-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--line-2, rgba(255,255,255,.12));
    border-radius: var(--radius-pill, 999px);
    background: transparent;
    color: var(--mute, #8c96a3);
    font-family: var(--mono, monospace);
    font-size: 11px;
    cursor: pointer;
    transition: color .18s ease, border-color .18s ease;
    margin-left: auto;
  }
  .ff-view-btn:hover { color: var(--fg, #eef1f3); border-color: var(--line-3, rgba(255,255,255,.2)); }
  .ff-view-btn__label { text-transform: uppercase; letter-spacing: .08em; }
</style>
