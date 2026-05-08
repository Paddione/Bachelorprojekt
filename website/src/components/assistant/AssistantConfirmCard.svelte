<script lang="ts">
  import type { ProposedAction } from '../../lib/assistant/types';

  let {
    action,
    onConfirm,
    onCancel,
    busy = false,
  }: {
    action: ProposedAction;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
  } = $props();
</script>

<div
  role="group"
  aria-labelledby="confirm-title"
  style="
    align-self: flex-start;
    background: var(--ink-900);
    border: 1px solid #d7b06a;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    max-width: 88%;
    color: var(--fg);
    font-family: var(--font-sans);
  "
>
  <div id="confirm-title" style="color: #d7b06a; font-family: var(--font-display); margin-bottom: 4px;">
    Soll ich das machen?
  </div>
  <div style="margin-bottom: 4px;"><strong>{action.targetLabel}</strong></div>
  <div style="opacity: .85;">{action.summary}</div>
  <div style="display: flex; gap: 6px; margin-top: 8px;">
    <!-- Default focus is on Cancel — Confirm requires deliberate move -->
    <button onclick={onCancel} disabled={busy} class="btn ghost" autofocus>Abbrechen</button>
    <button onclick={onConfirm} disabled={busy} class="btn primary">{busy ? '…' : 'Ja, mach'}</button>
  </div>
</div>

<style>
  .btn {
    font-size: 11px; padding: 3px 9px; border-radius: 3px; cursor: pointer; border: none;
    font-family: inherit; font-weight: 500;
  }
  .btn[disabled] { opacity: .5; cursor: not-allowed; }
  .btn.primary { background: #d7b06a; color: #0b111c; }
  .btn.ghost { background: transparent; color: var(--mute); border: 1px solid var(--line); }
</style>
