<script lang="ts">
  import type { Nudge } from '../../lib/assistant/types';

  let {
    nudge,
    onPrimary,
    onSecondary,
    onClose,
  }: {
    nudge: Nudge;
    onPrimary?: () => void;
    onSecondary?: () => void;
    onClose?: () => void;
  } = $props();
</script>

<div
  class="bubble"
  role="status"
  aria-live="polite"
  style="
    position: fixed; bottom: 88px; right: 24px; z-index: 53;
    max-width: 280px;
    background: var(--ink-850);
    border: 1px solid #d7b06a;
    border-radius: 12px 12px 4px 12px;
    padding: 14px 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
    color: var(--fg);
    font-family: var(--font-sans);
    font-size: 13px;
    line-height: 1.45;
  "
>
  <div style="font-family: var(--font-display); font-size: 12px; color: #d7b06a; margin-bottom: 6px;">
    ✦ Mentolder-Assistent
  </div>
  <div><strong style="color: #d7b06a; font-weight: 500;">{nudge.headline}</strong>{nudge.body ? ` — ${nudge.body}` : ''}</div>
  <div style="display: flex; gap: 6px; margin-top: 10px;">
    {#if nudge.primaryAction}
      <button onclick={onPrimary} class="btn primary">{nudge.primaryAction.label}</button>
    {/if}
    {#if nudge.secondaryAction}
      <button onclick={onSecondary} class="btn ghost">{nudge.secondaryAction.label}</button>
    {/if}
    <button onclick={onClose} aria-label="schließen" class="btn ghost icon">✕</button>
  </div>
</div>

<style>
  .btn {
    font-size: 12px; padding: 5px 10px; border-radius: 4px; cursor: pointer; border: none;
    font-family: inherit; font-weight: 500;
  }
  .btn.primary { background: #d7b06a; color: #0b111c; }
  .btn.ghost { background: transparent; color: var(--mute); border: 1px solid var(--line); }
  .btn.icon { padding: 5px 8px; margin-left: auto; }
</style>
