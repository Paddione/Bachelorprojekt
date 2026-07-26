<script lang="ts">
  import type { InstructionBeat } from '../../../lib/coaching-session-prompts';
  import type { BeatState } from '../../../lib/coaching-session-beats-db';

  let {
    beat, beatState, disabled, canGoBack, onAdvance, onBack,
  }: {
    beat: InstructionBeat;
    beatState: BeatState | undefined;
    disabled: boolean;
    canGoBack: boolean;
    onAdvance: (captured?: string) => void;
    onBack: () => void;
  } = $props();

  let captured = $state(beatState?.captured ?? '');
  const needsCapture = $derived(!!beat.capture);
  const canAdvance = $derived(!needsCapture || captured.trim().length > 0);
</script>

<div class="beat-instruction">
  <div class="regie-box">
    <span class="regie-icon" aria-hidden="true">🎬</span>
    <p class="regie-text">{beat.regie}</p>
  </div>

  {#if beat.capture}
    <div class="input-group">
      <label class="input-label" for="beat-capture">
        {beat.capture.label}<span class="required">*</span>
      </label>
      <textarea id="beat-capture" bind:value={captured} rows={4} class="input-field"
        placeholder="Aussage des Coachee protokollieren…" {disabled}></textarea>
    </div>
  {/if}

  <div class="action-buttons">
    {#if canGoBack}
      <button class="btn-secondary" onclick={onBack} {disabled}>&larr; Zurück</button>
    {/if}
    <button class="btn-primary" onclick={() => { onAdvance(needsCapture ? captured : undefined); }}
      disabled={disabled || !canAdvance}>Weiter &rarr;</button>
  </div>
</div>

<style>
  .beat-instruction { display: flex; flex-direction: column; gap: 1.25rem; }
  .regie-box { display: flex; gap: 0.75rem; align-items: flex-start; background: color-mix(in srgb, var(--brass) 8%, transparent); border-left: 3px solid var(--brass); border-radius: 6px; padding: 0.9rem 1rem; }
  .regie-icon { font-size: 1.1rem; line-height: 1.4; }
  .regie-text { margin: 0; font-style: italic; color: var(--fg); font-size: 0.95rem; line-height: 1.6; }
  .input-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .input-label { font-size: 0.8rem; color: var(--mute); }
  .required { color: #f87171; margin-left: 0.2rem; }
  .input-field { background: var(--ink-800); border: 1px solid var(--line); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--fg); font-size: 0.9rem; width: 100%; resize: vertical; font-family: var(--sans); }
  .input-field:focus { outline: none; border-color: var(--brass); }
  .action-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
  .btn-primary { padding: 0.6rem 1.4rem; background: var(--brass); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-family: var(--sans); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: var(--sans); }
</style>
