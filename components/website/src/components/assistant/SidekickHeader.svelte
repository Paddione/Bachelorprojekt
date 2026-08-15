<script lang="ts">
  let {
    title,
    onClose,
    onBack,
    expanded = false,
    onToggleExpand,
    available = true,
  }: {
    title: string;
    onClose: () => void;
    onBack?: () => void;
    expanded?: boolean;
    onToggleExpand?: () => void;
    available?: boolean;
  } = $props();
</script>

<div class="sk-header">
  <div class="sk-header-left">
    {#if onBack}
      <button class="sk-chrome-btn" onclick={onBack} aria-label="Zurück">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 5l-7 7 7 7"/>
        </svg>
      </button>
      <span class="sk-title">{title}</span>
    {:else}
      <!-- Home: show "Sidekick · availability" eyebrow -->
      <span class="sk-mono-label">Sidekick</span>
      <span class="sk-divider" aria-hidden="true"></span>
      <span class="sk-availability">
        <span class="sk-pulse" aria-hidden="true"></span>
        {available ? 'Verfügbar' : 'Offline'}
      </span>
    {/if}
  </div>

  <div class="sk-header-right">
    {#if onToggleExpand}
      <button class="sk-chrome-btn" onclick={onToggleExpand} aria-label={expanded ? 'Verkleinern' : 'Vergrößern'}>
        {#if expanded}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"/>
          </svg>
        {:else}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M2 2l4 4M6 2H2v4M14 2l-4 4M10 2h4v4M2 14l4-4M6 14H2v-4M14 14l-4-4M10 14h4v-4"/>
          </svg>
        {/if}
      </button>
    {/if}
    <button class="sk-chrome-btn sk-chrome-btn--close" onclick={onClose} aria-label="Schließen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .sk-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    background: var(--admin-bg, #0f1623);
    border-bottom: 1px solid rgba(232, 200, 112, 0.18);
    flex-shrink: 0;
    min-height: 56px;
    gap: 12px;
    position: relative;
  }

  .sk-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .sk-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .sk-mono-label {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--admin-text, #e8e8f0);
  }

  .sk-title {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--admin-text, #e8e8f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sk-divider {
    width: 1px;
    height: 14px;
    background: rgba(255,255,255,0.12);
    flex-shrink: 0;
  }

  .sk-availability {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--admin-text-mute, #8899aa);
  }

  .sk-pulse {
    position: relative;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: oklch(0.80 0.06 160);
    display: inline-block;
    flex-shrink: 0;
    animation: sk-pulse 2.2s ease-in-out infinite;
  }

  @keyframes sk-pulse {
    0%   { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0.45); }
    70%  { box-shadow: 0 0 0 8px oklch(0.80 0.06 160 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0); }
  }

  .sk-chrome-btn {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: var(--admin-text-mute, #8899aa);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.18s, color 0.18s;
    flex-shrink: 0;
  }
  .sk-chrome-btn:hover {
    border-color: oklch(0.83 0.09 75);
    color: oklch(0.83 0.09 75);
  }

  .sk-chrome-btn--close:hover {
    border-color: rgba(248,113,113,.5);
    color: #f87171;
  }
</style>
