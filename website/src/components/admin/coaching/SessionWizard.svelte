<script lang="ts">
  import { STEP_DEFINITIONS } from '../../../lib/coaching-session-prompts';
  import type { Session, SessionStep } from '../../../lib/coaching-session-db';
  import type { BeatState } from '../../../lib/coaching-session-beats-db';
  import InstructionBeatView from './InstructionBeatView.svelte';
  import KiPromptBeatView from './KiPromptBeatView.svelte';

  let { sessionId, initialSession, providerName = 'claude' }:
    { sessionId: string; initialSession: Session; providerName?: string } = $props();

  const PHASE_COLORS: Record<string, string> = {
    problem_ziel: 'bg-blue-500', analyse: 'bg-orange-500', loesung: 'bg-green-500', umsetzung: 'bg-purple-500',
  };
  const PHASE_TEXT: Record<string, string> = {
    problem_ziel: 'text-blue-400', analyse: 'text-orange-400', loesung: 'text-green-400', umsetzung: 'text-purple-400',
  };

  let session = $state<Session>(initialSession);
  let currentStep = $state(getInitialStep());
  let currentBeatIndex = $state(0);
  let loading = $state(false);
  let error = $state('');
  let streamingResponse = $state('');
  const isClaudeProvider = $derived(providerName === 'claude');
  const isCompleted = $derived(session.status === 'completed');

  const def = $derived(STEP_DEFINITIONS.find((s) => s.stepNumber === currentStep)!);
  const beats = $derived(def.beats);
  const activeBeat = $derived(beats[currentBeatIndex]);
  const stepData = $derived(session.steps.find((s) => s.stepNumber === currentStep));

  function getInitialStep(): number {
    const firstPending = initialSession.steps.find((s) => s.status === 'pending' || s.status === 'generated');
    return firstPending?.stepNumber ?? 1;
  }

  function beatState(i: number): BeatState | undefined {
    return stepData?.beats?.find((b) => b.beatIndex === i);
  }

  function prevKiResponse(): string | null {
    for (let i = currentBeatIndex - 1; i >= 0; i--) {
      if (beats[i].kind === 'ki_prompt') return beatState(i)?.aiResponse ?? null;
    }
    return null;
  }

  function firstUnfinishedBeat(n: number): number {
    const s = session.steps.find((st) => st.stepNumber === n);
    const b = STEP_DEFINITIONS.find((st) => st.stepNumber === n)!.beats;
    for (let i = 0; i < b.length; i++) {
      const st = s?.beats?.find((x) => x.beatIndex === i);
      if (st?.status !== 'accepted' && st?.status !== 'skipped') return i;
    }
    return 0;
  }

  function navigateToStep(n: number) {
    currentStep = n;
    currentBeatIndex = firstUnfinishedBeat(n);
    error = '';
    streamingResponse = '';
  }

  function applyStep(updated: SessionStep) {
    session = {
      ...session,
      steps: session.steps.find((s) => s.stepNumber === updated.stepNumber)
        ? session.steps.map((s) => (s.stepNumber === updated.stepNumber ? updated : s))
        : [...session.steps, updated],
    };
  }

  async function patchBeat(patch: {
    beatIndex?: number; captured?: string; inputs?: Record<string, string>;
    beatStatus?: BeatState['status']; status?: SessionStep['status'];
  }): Promise<void> {
    const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok && json.step) applyStep(json.step);
  }

  async function advanceBeat() {
    if (currentBeatIndex < beats.length - 1) { currentBeatIndex += 1; error = ''; return; }
    await patchBeat({ status: 'accepted' });
    if (currentStep < 10) navigateToStep(currentStep + 1);
  }

  function goBackBeat() {
    error = '';
    if (currentBeatIndex > 0) { currentBeatIndex -= 1; return; }
    if (currentStep > 1) {
      const prev = currentStep - 1;
      currentStep = prev;
      currentBeatIndex = STEP_DEFINITIONS.find((s) => s.stepNumber === prev)!.beats.length - 1;
    }
  }

  async function onInstructionAdvance(captured?: string) {
    loading = true; error = '';
    try {
      await patchBeat({ beatIndex: currentBeatIndex, captured, beatStatus: 'accepted' });
      await advanceBeat();
    } catch { error = 'Fehler beim Speichern'; }
    finally { loading = false; }
  }

  async function onGenerate(inputs: Record<string, string>) {
    loading = true; error = ''; streamingResponse = '';
    try {
      const url = `/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}/generate${isClaudeProvider ? '?stream=true' : ''}`;
      const body = JSON.stringify({ beatIndex: currentBeatIndex, inputs });
      if (isClaudeProvider) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!res.ok || !res.body) { error = 'Fehler bei KI-Anfrage'; return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; step?: SessionStep; error?: string };
              if (ev.chunk) streamingResponse += ev.chunk;
              else if (ev.done && ev.step) { applyStep(ev.step); streamingResponse = ''; }
              else if (ev.error) error = ev.error;
            } catch { /* skip malformed */ }
          }
        }
      } else {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const json = await res.json();
        if (!res.ok) { error = json.error ?? 'Fehler bei KI-Anfrage'; return; }
        applyStep(json.step);
      }
    } catch { error = 'Verbindungsfehler'; }
    finally { loading = false; }
  }

  async function onAccept(inputs: Record<string, string>) {
    loading = true; error = '';
    try {
      await patchBeat({ beatIndex: currentBeatIndex, inputs, beatStatus: 'accepted' });
      await advanceBeat();
    } catch { error = 'Fehler beim Speichern'; }
    finally { loading = false; }
  }

  async function onReject() {
    loading = true; error = ''; streamingResponse = '';
    try {
      await patchBeat({ beatIndex: currentBeatIndex, beatStatus: 'seen' });
    } catch { error = 'Fehler beim Verwerfen'; }
    finally { loading = false; }
  }

  async function onSkipBeat() {
    loading = true; error = '';
    try {
      await patchBeat({ beatIndex: currentBeatIndex, beatStatus: 'skipped' });
      await advanceBeat();
    } catch { error = 'Fehler'; }
    finally { loading = false; }
  }

  async function skipStep() {
    loading = true; error = '';
    try {
      await patchBeat({ status: 'skipped' });
      if (currentStep < 10) navigateToStep(currentStep + 1);
    } catch { error = 'Fehler'; }
    finally { loading = false; }
  }

  async function completeSession() {
    loading = true; error = '';
    try {
      const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/complete`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { error = json.error ?? 'Fehler beim Abschließen'; return; }
      window.location.href = `/admin/coaching/sessions/${sessionId}`;
    } catch { error = 'Verbindungsfehler'; }
    finally { loading = false; }
  }

  function stepStatus(n: number): 'done' | 'current' | 'pending' {
    if (n === currentStep) return 'current';
    const s = session.steps.find((st) => st.stepNumber === n);
    if (s?.status === 'accepted' || s?.status === 'skipped') return 'done';
    return 'pending';
  }

  const allBeatsResolved = $derived(
    beats.every((_, i) => { const st = beatState(i); return st?.status === 'accepted' || st?.status === 'skipped'; }),
  );
  const canGoBack = $derived(currentBeatIndex > 0 || currentStep > 1);
</script>

<div class="wizard">
  <div class="progress-bar" aria-label="Fortschritt">
    {#each STEP_DEFINITIONS as s}
      {@const status = stepStatus(s.stepNumber)}
      <button class="progress-step {PHASE_COLORS[s.phase]} {status === 'current' ? 'ring-2 ring-white scale-110' : ''} {status !== 'pending' ? 'opacity-100' : 'opacity-40'}"
        onclick={() => { navigateToStep(s.stepNumber); }}
        title="Schritt {s.stepNumber}: {s.stepName}"
        aria-current={status === 'current' ? 'step' : undefined}
      >{#if status === 'done'}&#x2713;{:else}{s.stepNumber}{/if}</button>
    {/each}
  </div>

  <div class="step-header">
    <span class="phase-label {PHASE_TEXT[def.phase]}">{def.phaseLabel}</span>
    <span class="step-description">{def.description}</span>
    <div class="step-title-row">
      <h2 class="step-title">Schritt {currentStep}/10 &mdash; {def.stepName}</h2>
      <span class="beat-indicator">Beat {currentBeatIndex + 1}/{beats.length}</span>
    </div>
  </div>

  {#if error}<div class="error-box">{error}</div>{/if}

  {#if !isCompleted}
    {#key `${currentStep}:${currentBeatIndex}`}
      {#if activeBeat.kind === 'instruction'}
        <InstructionBeatView beat={activeBeat} beatState={beatState(currentBeatIndex)} disabled={loading} {canGoBack} onAdvance={onInstructionAdvance} onBack={goBackBeat} />
      {:else}
        <KiPromptBeatView beat={activeBeat} beatState={beatState(currentBeatIndex)} prevKiResponse={prevKiResponse()} disabled={loading} {loading} {streamingResponse} {canGoBack} {onGenerate} {onAccept} onReject={onReject} onSkip={onSkipBeat} onBack={goBackBeat} />
      {/if}
    {/key}

    <div class="step-footer">
      <button class="btn-ghost" onclick={skipStep} disabled={loading}>Schritt überspringen</button>
      {#if currentStep === 10 && allBeatsResolved}
        <button class="btn-complete" onclick={completeSession} disabled={loading}>
          {loading ? 'Bericht wird erstellt…' : 'Session abschließen & Bericht generieren'}
        </button>
      {/if}
    </div>
  {:else}
    <div class="accepted-badge">&#x2713; Session abgeschlossen</div>
  {/if}
</div>

<style>
  .wizard { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
  .progress-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 1rem 0; }
  .progress-step { width: 2rem; height: 2rem; border-radius: 50%; font-size: 0.75rem; font-weight: 700; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .step-header { border-bottom: 1px solid var(--line); padding-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .phase-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .step-description { font-size: 0.82rem; color: var(--mute); font-style: italic; }
  .step-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
  .step-title { font-family: var(--serif); font-size: 1.5rem; font-weight: 400; letter-spacing: -0.015em; color: var(--fg); margin: 0.15rem 0 0; }
  .beat-indicator { font-size: 0.78rem; color: var(--mute); background: var(--ink-800); padding: 0.2rem 0.6rem; border-radius: 4px; white-space: nowrap; }
  .step-footer { border-top: 1px solid var(--line); padding-top: 1rem; display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  .btn-ghost { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; font-family: var(--sans); }
  .btn-complete { padding: 0.7rem 1.6rem; background: var(--success); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-family: var(--sans); }
  .btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
  .accepted-badge { display: inline-flex; align-items: center; gap: 0.4rem; background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); border-radius: 4px; padding: 0.3rem 0.75rem; font-size: 0.8rem; font-weight: 600; }
  .error-box { background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); border-radius: 6px; padding: 0.75rem; color: var(--danger); font-size: 0.85rem; }
</style>
