<script lang="ts">
  import { STEP_DEFINITIONS } from '../../../lib/coaching-session-prompts';
  import type { Session, SessionStep } from '../../../lib/coaching-session-db';

  let { sessionId, initialSession }: { sessionId: string; initialSession: Session } = $props();

  const PHASE_COLORS: Record<string, string> = {
    problem_ziel: 'bg-blue-500',
    analyse:      'bg-orange-500',
    loesung:      'bg-green-500',
    umsetzung:    'bg-purple-500',
  };
  const PHASE_TEXT: Record<string, string> = {
    problem_ziel: 'text-blue-400',
    analyse:      'text-orange-400',
    loesung:      'text-green-400',
    umsetzung:    'text-purple-400',
  };

  let session = $state<Session>(initialSession);
  let currentStep = $state(getInitialStep());
  let inputs = $state<Record<string, string>>(getStepInputs(getInitialStep()));
  let coachNotes = $state(getStepNotes(getInitialStep()));
  let loading = $state(false);
  let error = $state('');

  function getInitialStep(): number {
    const firstPending = initialSession.steps.find(s => s.status === 'pending' || s.status === 'generated');
    return firstPending?.stepNumber ?? 1;
  }

  function getStepInputs(stepNum: number): Record<string, string> {
    const s = initialSession.steps.find(st => st.stepNumber === stepNum);
    return s?.coachInputs ? { ...s.coachInputs } : {};
  }

  function getStepNotes(stepNum: number): string {
    return initialSession.steps.find(st => st.stepNumber === stepNum)?.coachNotes ?? '';
  }

  function getStepData(n: number): SessionStep | undefined {
    return session.steps.find(s => s.stepNumber === n);
  }

  function navigateTo(n: number) {
    currentStep = n;
    const step = session.steps.find(s => s.stepNumber === n);
    inputs = step?.coachInputs ? { ...step.coachInputs } : {};
    coachNotes = step?.coachNotes ?? '';
  }

  const def = $derived(STEP_DEFINITIONS.find(s => s.stepNumber === currentStep)!);
  const stepData = $derived(getStepData(currentStep));
  const canGenerate = $derived(
    def?.inputs.filter(i => i.required).every(i => (inputs[i.key] ?? '').trim().length > 0) ?? false
  );
  const isCompleted = $derived(session.status === 'completed');

  async function saveInputs() {
    await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachInputs: inputs, coachNotes }),
    });
  }

  async function generate() {
    loading = true; error = '';
    try {
      await saveInputs();
      const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs }),
      });
      const json = await res.json();
      if (!res.ok) { error = json.error ?? 'Fehler bei KI-Anfrage'; return; }
      session = {
        ...session,
        steps: session.steps.find(s => s.stepNumber === currentStep)
          ? session.steps.map(s => s.stepNumber === currentStep ? json.step : s)
          : [...session.steps, json.step],
      };
    } catch { error = 'Verbindungsfehler'; }
    finally { loading = false; }
  }

  async function accept() {
    loading = true; error = '';
    try {
      await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs, coachNotes, status: 'accepted' }),
      });
      session = {
        ...session,
        steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'accepted', coachNotes } : s),
      };
      if (currentStep < 10) { navigateTo(currentStep + 1); }
    } catch { error = 'Fehler beim Speichern'; }
    finally { loading = false; }
  }

  async function reject() {
    loading = true; error = '';
    const prev = session.steps.find(s => s.stepNumber === currentStep);
    session = {
      ...session,
      steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'pending' as const, aiResponse: null } : s),
    };
    try {
      await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs, status: 'pending' }),
      });
    } catch {
      if (prev) {
        session = { ...session, steps: session.steps.map(s => s.stepNumber === currentStep ? prev : s) };
      }
      error = 'Fehler beim Verwerfen';
    } finally {
      loading = false;
    }
  }

  async function skip() {
    loading = true;
    try {
      await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs, coachNotes, status: 'skipped' }),
      });
      session = {
        ...session,
        steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'skipped' } : s),
      };
      if (currentStep < 10) { navigateTo(currentStep + 1); }
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
    const s = getStepData(n);
    if (s?.status === 'accepted' || s?.status === 'skipped') return 'done';
    return 'pending';
  }
</script>

<div class="wizard">
  <!-- Fortschrittsbalken -->
  <div class="progress-bar" aria-label="Fortschritt">
    {#each STEP_DEFINITIONS as s}
      {@const status = stepStatus(s.stepNumber)}
      <button
        class="progress-step {PHASE_COLORS[s.phase]} {status === 'current' ? 'ring-2 ring-white scale-110' : ''} {status === 'done' ? 'opacity-100' : 'opacity-40'}"
        onclick={() => { navigateTo(s.stepNumber); }}
        title="Schritt {s.stepNumber}: {s.stepName}"
        aria-current={status === 'current' ? 'step' : undefined}
      >
        {#if status === 'done'}&#x2713;{:else}{s.stepNumber}{/if}
      </button>
    {/each}
  </div>

  <!-- Schritt-Header -->
  <div class="step-header">
    <span class="phase-label {PHASE_TEXT[def.phase]}">{def.phaseLabel}</span>
    <h2 class="step-title">Schritt {currentStep}/10 &mdash; {def.stepName}</h2>
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <!-- Eingabefelder -->
  <div class="inputs-section">
    {#each def.inputs as input}
      <div class="input-group">
        <label class="input-label" for={input.key}>
          {input.label}{#if input.required}<span class="required">*</span>{/if}
        </label>
        {#if input.multiline}
          <textarea
            id={input.key}
            bind:value={inputs[input.key]}
            rows={3}
            class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'}
            disabled={isCompleted}
          ></textarea>
        {:else}
          <input
            id={input.key}
            type="text"
            bind:value={inputs[input.key]}
            class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'}
            disabled={isCompleted}
          />
        {/if}
      </div>
    {/each}
  </div>

  <!-- KI befragen Button -->
  {#if !isCompleted && stepData?.status !== 'accepted'}
    <button
      class="btn-primary"
      onclick={generate}
      disabled={!canGenerate || loading}
    >
      {loading ? 'KI antwortet…' : 'KI befragen →'}
    </button>
  {/if}

  <!-- KI-Antwort -->
  {#if stepData?.aiResponse}
    <div class="ai-response-box">
      <p class="ai-label">KI-Vorschlag</p>
      <p class="ai-text">{stepData.aiResponse}</p>
    </div>

    <!-- Notizfeld -->
    <div class="input-group">
      <label class="input-label" for="coach-notes">Meine Notiz (optional)</label>
      <textarea
        id="coach-notes"
        bind:value={coachNotes}
        rows={2}
        class="input-field"
        placeholder="Eigene Gedanken, Ergänzungen, Korrekturen…"
        disabled={isCompleted}
      ></textarea>
    </div>

    <!-- Aktions-Buttons -->
    {#if !isCompleted && stepData.status !== 'accepted'}
      <div class="action-buttons">
        {#if currentStep > 1}
          <button class="btn-secondary" onclick={() => { navigateTo(currentStep - 1); }}>&larr; Zurück</button>
        {/if}
        <button class="btn-ghost" onclick={reject} disabled={loading}>Verwerfen &amp; neu</button>
        <button class="btn-ghost" onclick={skip} disabled={loading}>Überspringen</button>
        <button class="btn-primary" onclick={accept} disabled={loading}>Akzeptieren &rarr;</button>
      </div>
    {/if}
  {:else if stepData?.status !== 'accepted'}
    <div class="action-buttons">
      {#if currentStep > 1}
        <button class="btn-secondary" onclick={() => { navigateTo(currentStep - 1); }}>&larr; Zurück</button>
      {/if}
      <button class="btn-ghost" onclick={skip} disabled={loading || isCompleted}>Schritt überspringen</button>
    </div>
  {:else}
    <!-- Schritt abgeschlossen -->
    <div class="accepted-badge">&#x2713; Abgeschlossen</div>
    <div class="action-buttons">
      {#if currentStep > 1}
        <button class="btn-secondary" onclick={() => { navigateTo(currentStep - 1); }}>&larr; Zurück</button>
      {/if}
      {#if currentStep < 10}
        <button class="btn-primary" onclick={() => { navigateTo(currentStep + 1); }}>Weiter &rarr;</button>
      {:else if !isCompleted}
        <button class="btn-complete" onclick={completeSession} disabled={loading}>
          {loading ? 'Bericht wird erstellt…' : 'Session abschließen &amp; Bericht generieren'}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wizard { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
  .progress-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 1rem 0; }
  .progress-step { width: 2rem; height: 2rem; border-radius: 50%; font-size: 0.75rem; font-weight: 700; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .step-header { border-bottom: 1px solid var(--line, #333); padding-bottom: 0.75rem; }
  .phase-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .step-title { font-size: 1.4rem; font-weight: 700; color: var(--text-light, #f0f0f0); margin: 0.25rem 0 0; }
  .inputs-section { display: flex; flex-direction: column; gap: 1rem; }
  .input-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .input-label { font-size: 0.8rem; color: var(--text-muted, #888); }
  .required { color: #f87171; margin-left: 0.2rem; }
  .input-field { background: var(--bg-2, #1a1a1a); border: 1px solid var(--line, #333); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--text-light, #f0f0f0); font-size: 0.9rem; width: 100%; resize: vertical; }
  .input-field:focus { outline: none; border-color: var(--gold, #c9a55c); }
  .ai-response-box { background: var(--bg-2, #1a1a1a); border: 1px solid var(--gold, #c9a55c); border-radius: 8px; padding: 1rem; }
  .ai-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold, #c9a55c); margin: 0 0 0.5rem; }
  .ai-text { color: var(--text-light, #f0f0f0); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; margin: 0; }
  .action-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
  .btn-primary { padding: 0.6rem 1.4rem; background: var(--gold, #c9a55c); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--text-muted, #888); border: 1px solid var(--line, #444); border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .btn-ghost { padding: 0.5rem 1rem; background: transparent; color: var(--text-muted, #888); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; }
  .btn-complete { padding: 0.7rem 1.6rem; background: #22c55e; color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; }
  .btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
  .accepted-badge { display: inline-block; background: #22c55e20; color: #22c55e; border: 1px solid #22c55e40; border-radius: 4px; padding: 0.3rem 0.75rem; font-size: 0.8rem; font-weight: 600; }
  .error-box { background: #ef444420; border: 1px solid #ef444440; border-radius: 6px; padding: 0.75rem; color: #f87171; font-size: 0.85rem; }
</style>
