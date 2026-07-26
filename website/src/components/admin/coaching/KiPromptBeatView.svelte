<script lang="ts">
  import type { KiPromptBeat } from '../../../lib/coaching-session-prompts';
  import type { BeatState } from '../../../lib/coaching-session-beats-db';

  let {
    beat, beatState, prevKiResponse, disabled, loading,
    streamingResponse, canGoBack, onGenerate, onAccept,
    onReject, onSkip, onBack,
  }: {
    beat: KiPromptBeat;
    beatState: BeatState | undefined;
    prevKiResponse: string | null;
    disabled: boolean;
    loading: boolean;
    streamingResponse: string;
    canGoBack: boolean;
    onGenerate: (inputs: Record<string, string>) => void;
    onAccept: (inputs: Record<string, string>) => void;
    onReject: () => void;
    onSkip: () => void;
    onBack: () => void;
  } = $props();

  function seed(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const input of beat.inputs) {
      out[input.key] =
        beatState?.inputs?.[input.key] ??
        (input.prefillFromPrevKiResponse ? (prevKiResponse ?? '') : '');
    }
    return out;
  }
  let inputs = $state<Record<string, string>>(seed());

  const canGenerate = $derived(
    beat.inputs.filter((i) => i.required).every((i) => (inputs[i.key] ?? '').trim().length > 0),
  );
  const aiResponse = $derived(beatState?.aiResponse ?? '');
  const isAccepted = $derived(beatState?.status === 'accepted');
</script>

<div class="beat-ki">
  {#if beat.regie}
    <div class="regie-box">
      <span class="regie-icon" aria-hidden="true">💬</span>
      <p class="regie-text">{beat.regie}</p>
    </div>
  {/if}

  <div class="inputs-section">
    {#each beat.inputs as input}
      <div class="input-group">
        <label class="input-label" for={input.key}>
          {input.label}{#if input.required}<span class="required">*</span>{/if}
        </label>
        {#if input.multiline}
          <textarea id={input.key} bind:value={inputs[input.key]} rows={4} class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'} disabled={disabled || isAccepted}></textarea>
        {:else}
          <input id={input.key} type="text" bind:value={inputs[input.key]} class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'} disabled={disabled || isAccepted} />
        {/if}
      </div>
    {/each}
  </div>

  {#if !isAccepted}
    <button class="btn-primary" onclick={() => onGenerate(inputs)} disabled={!canGenerate || loading}>
      {loading ? 'KI antwortet…' : 'KI befragen →'}
    </button>
  {/if}

  {#if streamingResponse}
    <div class="ai-response-box streaming">
      <p class="ai-label">KI generiert…</p>
      <p class="ai-text">{streamingResponse}</p>
    </div>
  {/if}

  {#if aiResponse}
    <div class="ai-response-box">
      <p class="ai-label">KI-Vorschlag</p>
      <p class="ai-text">{aiResponse}</p>
    </div>
  {/if}

  <div class="action-buttons">
    {#if canGoBack}
      <button class="btn-secondary" onclick={onBack} {disabled}>&larr; Zurück</button>
    {/if}
    {#if aiResponse && !isAccepted}
      <button class="btn-ghost" onclick={onReject} disabled={loading}>Verwerfen &amp; neu</button>
      <button class="btn-ghost" onclick={onSkip} disabled={loading}>Überspringen</button>
      <button class="btn-primary" onclick={() => onAccept(inputs)} disabled={loading}>Akzeptieren &rarr;</button>
    {:else if !aiResponse && !isAccepted}
      <button class="btn-ghost" onclick={onSkip} disabled={loading}>Überspringen</button>
    {:else}
      <span class="accepted-badge">&#x2713; Beat übernommen</span>
    {/if}
  </div>
</div>

<style>
  .beat-ki { display: flex; flex-direction: column; gap: 1rem; }
  .regie-box { display: flex; gap: 0.75rem; align-items: flex-start; background: color-mix(in srgb, var(--brass) 8%, transparent); border-left: 3px solid var(--brass); border-radius: 6px; padding: 0.75rem 1rem; }
  .regie-icon { font-size: 1rem; line-height: 1.4; }
  .regie-text { margin: 0; font-style: italic; color: var(--fg); font-size: 0.9rem; line-height: 1.55; }
  .inputs-section { display: flex; flex-direction: column; gap: 1rem; }
  .input-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .input-label { font-size: 0.8rem; color: var(--mute); }
  .required { color: #f87171; margin-left: 0.2rem; }
  .input-field { background: var(--ink-800); border: 1px solid var(--line); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--fg); font-size: 0.9rem; width: 100%; resize: vertical; font-family: var(--sans); }
  .input-field:focus { outline: none; border-color: var(--brass); }
  .ai-response-box { background: var(--ink-800); border: 1px solid var(--brass); border-radius: 8px; padding: 1rem; }
  .ai-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--brass); margin: 0 0 0.5rem; }
  .ai-text { color: var(--fg); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; margin: 0; }
  .action-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
  .btn-primary { padding: 0.6rem 1.4rem; background: var(--brass); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-family: var(--sans); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: var(--sans); }
  .btn-ghost { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; font-family: var(--sans); }
  .accepted-badge { display: inline-flex; align-items: center; gap: 0.4rem; background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); border-radius: 4px; padding: 0.3rem 0.75rem; font-size: 0.8rem; font-weight: 600; }
</style>
