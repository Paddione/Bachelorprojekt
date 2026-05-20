<script lang="ts">
  let {
    title,
    onClose,
    onBack,
    expanded = false,
    onToggleExpand,
  }: {
    title: string;
    onClose: () => void;
    onBack?: () => void;
    expanded?: boolean;
    onToggleExpand?: () => void;
  } = $props();
</script>

<div class="header">
  <div class="left">
    {#if onBack}
      <button class="icon-btn" onclick={onBack} aria-label="Zurück">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <path d="M10 3l-5 5 5 5"/>
        </svg>
      </button>
    {/if}
    <span class="title">{title}</span>
  </div>
  <div class="right">
    {#if onToggleExpand}
      <button class="icon-btn" onclick={onToggleExpand} aria-label={expanded ? 'Verkleinern' : 'Vergrößern'}>
        {#if expanded}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <path d="M5 5l-3-3M2 5V2h3M11 5l3-3M14 5V2h-3M5 11l-3 3M2 11v3h3M11 11l3 3M14 11v3h-3"/>
          </svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <path d="M2 2l4 4M6 2H2v4M14 2l-4 4M10 2h4v4M2 14l4-4M6 14H2v-4M14 14l-4-4M10 14h4v-4"/>
          </svg>
        {/if}
      </button>
    {/if}
    <button class="icon-btn close-btn" onclick={onClose} aria-label="Schließen">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
        <path d="M3 3l10 10M13 3L3 13"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: #1a2235;
    border-bottom: 1px solid #243049;
    flex-shrink: 0;
    min-height: 44px;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: #e8e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: #8899aa;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    flex-shrink: 0;
  }
  .icon-btn:hover { background: #243049; color: #e8e8f0; }
  .close-btn:hover { background: rgba(248,113,113,.12); color: #f87171; }
</style>
