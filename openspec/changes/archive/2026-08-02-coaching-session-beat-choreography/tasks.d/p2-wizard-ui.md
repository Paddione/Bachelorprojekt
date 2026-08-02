---
title: "coaching-session-beat-choreography — P2 wizard-ui"
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan (P2: wizard-ui)

This is Partial **P2 (wizard-ui)** of 4: **P1 data-model → P2 wizard-ui → P3 export → P4 tests**.
P2 rebuilds `SessionWizard.svelte` from a one-form-per-step wizard into a **beat-player** on top of
the shape P1 froze (`Beat`, `StepDefinition.beats`, `getBeat`, `isKiPromptBeat`,
`buildUserPrompt(beat, inputs, priorCaptures)`, `BeatState`), and threads a `beatIndex` request
param through the two step API routes. It consumes P1's public API verbatim and adds **no** exports
to P1's lib modules. The comprehensive component / E2E / persistence suite is **P4** (tests always
last); P2 ships exactly **one** red→green component anchor (Task 1).

## File Structure

Existing files carry their **verified effective S1 budget** (all three `nicht-baselined` → budget =
extension-limit − current lines; `.svelte` limit 500, `.ts` limit 600).

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/components/admin/coaching/SessionWizard.svelte` | 367 | 133 |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | 230 | 370 |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts` | 27 | 573 |

New files created in this partial (not yet baselined; `.svelte` limit 500, `.ts` limit 600):

| `path` | est. lines | limit |
|--------|-----------|-------|
| `website/src/components/admin/coaching/InstructionBeatView.svelte` | ~95 | 500 |
| `website/src/components/admin/coaching/KiPromptBeatView.svelte` | ~150 | 500 |
| `website/src/components/admin/coaching/InstructionBeatView.test.ts` | ~35 | 600 |

### Component-split decision (S1) — why SessionWizard.svelte must not host the beat renderers

`SessionWizard.svelte` today is 367 lines with a **133-line** budget under the 500-line `.svelte`
limit. A full beat-player rebuild adds, all at once: a beat-progress indicator, two structurally
different beat renderers (highlighted regie box + capture textarea; input-fields + streaming +
Accept/Verwerfen/Überspringen), per-input `prefillFromPrevKiResponse` seeding, and back/forward beat
navigation — each with its own scoped `<style>`. Inlining all of that lands the file far past 500.
So P2 performs a **real split** (`extract`, not cosmetic line-squeezing): the two beat kinds become
self-contained child components, and `SessionWizard.svelte` shrinks to pure **orchestration** —
which step/beat is active, the two API-calling flows (`generate`/`patch`), beat↔step navigation, and
prop plumbing. The child components own their local form state and their own styles.

```
SessionWizard.svelte              (orchestrator: session/step/beat state, API calls, navigation, progress bar)
   ├─ InstructionBeatView.svelte  (leaf: regie box + optional capture textarea + Weiter/Zurück)
   └─ KiPromptBeatView.svelte     (leaf: input fields + KI befragen + streaming + Accept/Verwerfen/Überspringen)
```

Both children import **only** types from the P1 facade (`coaching-session-prompts` /
`coaching-session-beats-db`); they never import DB/API modules → no new S2 import cycle. Estimated
post-rewrite `SessionWizard.svelte` ≈ 330 lines (well under 500). No hardcoded hostnames (S3), no new
`scripts/*`/`k3d/*` (S4). No new `any` types are introduced — every prop bag and callback is fully
typed (CQ02 stays flat).

### beatIndex API-routing decision

The two routes stay **step-scoped in the URL** (`/steps/[n]/…`) and gain `beatIndex` in the **request
body**, not the path — the path already carries `[n]` (stepNumber) and the choreography is
step→beat, so a body field is the minimal, backward-compatible change (step 0 `Abschlussbericht`
PATCH keeps working with no `beatIndex`).

- `generate.ts` (POST): body `{ beatIndex, inputs }`. It resolves the beat with P1's
  `getBeat(stepNumber, beatIndex)`, rejects non-`ki_prompt` beats via `isKiPromptBeat`, builds
  `priorCaptures` (see below) and calls `buildUserPrompt(beat, inputs, priorCaptures)`. It then
  **read-modify-writes** the step's `BeatState[]` (merge the target beat's `{ inputs, aiResponse,
  status:'generated' }`) and persists via P1's `upsertStep({ …, beats })`.
- `index.ts` (PATCH): body `{ beatIndex?, captured?, inputs?, beatStatus?, status? }`. With
  `beatIndex` it merges one `BeatState`; `status` (step-level) still marks the whole step
  `accepted`/`skipped`. Because P1's `upsertStep` **replaces** `coach_inputs` wholesale, both routes
  first read the current `beats` (via `getStep`/the already-fetched session) and merge — never blind-write.

**`priorCaptures` construction (the exact map P1's `buildUserPrompt` expects):** the `captured` values
of the earlier `InstructionBeat`s in the *same* step, keyed by their `beatIndex`, restricted to
indices `< beatIndex`:

```ts
// priorCaptures: Record<number, string> from the step's persisted BeatState[]
const priorCaptures: Record<number, string> = {};
for (const b of stepBeats) {
  if (b.beatIndex < beatIndex && typeof b.captured === 'string' && b.captured.length > 0) {
    priorCaptures[b.beatIndex] = b.captured;
  }
}
```

`buildUserPrompt` then resolves `{capturedFrom:INDEX}` placeholders read-only from this map — that is
P1's **template-placeholder** mechanism, resolved server-side. The distinct **UI-prefill** mechanism
(`StepInput.prefillFromPrevKiResponse`) lives entirely in `KiPromptBeatView.svelte` (Task 3) and never
touches the server prompt.

### Cross-partial contract (what P2 freezes for P3/P4)

P3 (export) and P4 (tests) build on the component structure and prop shapes frozen here — they can
reference these without re-reading the whole `SessionWizard.svelte`:

- **`InstructionBeatView.svelte`** props:
  `{ beat: InstructionBeat; beatState: BeatState | undefined; disabled: boolean; canGoBack: boolean;
  onAdvance: (captured?: string) => void; onBack: () => void }`.
  Emits `onAdvance(capturedText)` when its "Weiter →" fires (the string is present iff `beat.capture`
  is set), `onBack()` for "← Zurück".
- **`KiPromptBeatView.svelte`** props:
  `{ beat: KiPromptBeat; beatState: BeatState | undefined; prevKiResponse: string | null;
  disabled: boolean; loading: boolean; streamingResponse: string; canGoBack: boolean;
  onGenerate: (inputs: Record<string,string>) => void; onAccept: (inputs: Record<string,string>) => void;
  onReject: () => void; onSkip: () => void; onBack: () => void }`.
- **`SessionWizard.svelte`** orchestration state (frozen names P4's E2E/selectors and P3 rely on):
  `currentStep: number` (1–10), `currentBeatIndex: number` (0-based within the step),
  `streamingResponse: string`. The active beat is rendered inside a
  `{#key `${currentStep}:${currentBeatIndex}`}` block so each beat re-instantiates its child with
  fresh local state. A step counts as **done** only when every beat is `accepted`/`skipped`; on the
  last beat's advance the orchestrator PATCHes the **step-level** `status:'accepted'`, so the existing
  10-circle progress bar and next-step unlocking behave exactly as before.
- **Request contract** (frozen for P4 API tests): `POST …/generate` body `{ beatIndex:number,
  inputs:Record<string,string> }`; `PATCH …/steps/[n]` body `{ beatIndex?:number, captured?:string,
  inputs?:Record<string,string>, beatStatus?:BeatState['status'], status?:SessionStep['status'] }`.

**Out of P2's scope (owned by P3/P4):** `session-history.ts`, `session-tools.ts` and `complete.ts`
still read P1's removed flat fields and are migrated by **P3** (export); their tests and the
comprehensive `KiPromptBeatView` + E2E-flow + BeatState-persistence suites are **P4**. The full
`task test:changed` sweep goes green at P4; P2's own anchor test (Task 1) is green within P2, and
`task freshness:check` (S1–S4 ratchet, no typecheck/test-run) is green at P2. This matches the
orchestrator's "P4 = tests" staging.

---

## Task 1 — Red anchor test: `InstructionBeatView` renders + captures (FAIL first)

Create `website/src/components/admin/coaching/InstructionBeatView.test.ts`. It lands in the vitest
**`components`** project (jsdom + `@sveltejs/vite-plugin-svelte`, glob `src/components/**/*.test.ts`).
This is the single red→green anchor for the whole partial; the comprehensive `KiPromptBeatView` +
back/forward-navigation + streaming suites are P4.

```ts
// website/src/components/admin/coaching/InstructionBeatView.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InstructionBeatView from './InstructionBeatView.svelte';
import type { InstructionBeat } from '../../../lib/coaching-session-prompts';

describe('InstructionBeatView (P2)', () => {
  it('shows the regie text and advances with the captured value', async () => {
    const beat: InstructionBeat = {
      kind: 'instruction',
      regie: 'Begrüße den Coachee und erkläre den Ablauf.',
      capture: { key: 'ist_soll', label: 'Ist- und Soll-Zustand' },
    };
    const onAdvance = vi.fn();
    const { getByRole, getByText } = render(InstructionBeatView, {
      props: {
        beat, beatState: undefined, disabled: false, canGoBack: false,
        onAdvance, onBack: () => {},
      },
    });

    expect(getByText('Begrüße den Coachee und erkläre den Ablauf.')).toBeTruthy();
    await fireEvent.input(getByRole('textbox'), { target: { value: 'Mein Anliegen' } });
    await fireEvent.click(getByRole('button', { name: /Weiter/ }));
    expect(onAdvance).toHaveBeenCalledWith('Mein Anliegen');
  });
});
```

Run it targeted:

```bash
cd website && pnpm vitest run InstructionBeatView --reporter verbose
```

**expected: FAIL** — `InstructionBeatView.svelte` does not exist yet → the `import` resolves to
nothing and the suite errors at collection (`Failed to resolve import "./InstructionBeatView.svelte"`).
Task 2 makes it pass.

---

## Task 2 — `InstructionBeatView.svelte` (new leaf component)

Create `website/src/components/admin/coaching/InstructionBeatView.svelte`. Renders the highlighted
regie-instruction box (icon + italic text). With `beat.capture`: a required textarea below, labeled
from `capture.label`; "Weiter →" stays disabled until the captured text is non-empty, then calls
`onAdvance(captured)`. Without `capture`: the box is a pure acknowledgement — "Weiter →" is
immediately clickable and calls `onAdvance()`.

```svelte
<script lang="ts">
  import type { InstructionBeat } from '../../../lib/coaching-session-prompts';
  import type { BeatState } from '../../../lib/coaching-session-beats-db';

  let {
    beat,
    beatState,
    disabled,
    canGoBack,
    onAdvance,
    onBack,
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
      <textarea
        id="beat-capture"
        bind:value={captured}
        rows={4}
        class="input-field"
        placeholder="Aussage des Coachee protokollieren…"
        {disabled}
      ></textarea>
    </div>
  {/if}

  <div class="action-buttons">
    {#if canGoBack}
      <button class="btn-secondary" onclick={onBack} {disabled}>&larr; Zurück</button>
    {/if}
    <button
      class="btn-primary"
      onclick={() => { onAdvance(needsCapture ? captured : undefined); }}
      disabled={disabled || !canAdvance}
    >Weiter &rarr;</button>
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
```

Re-run Task 1 — it must go **green**:

```bash
cd website && pnpm vitest run InstructionBeatView --reporter verbose
```

---

## Task 3 — `KiPromptBeatView.svelte` (new leaf component)

Create `website/src/components/admin/coaching/KiPromptBeatView.svelte`. It reuses the existing
input-fields → "KI befragen" → streaming preview → KI-response → Accept/Verwerfen/Überspringen shape,
but every action is a callback the orchestrator owns; the child holds only its local `inputs`.

**UI-prefill:** for inputs with `prefillFromPrevKiResponse: true`, the field's *initial* value is the
previous ki_prompt beat's accepted `aiResponse` (`prevKiResponse` prop), and remains inline-editable.
This is the "Ich übernehme mit folgenden Modifikationen" mechanism — **distinct** from P1's server-side
`{capturedFrom:INDEX}` template placeholder (already resolved in `buildUserPrompt`; nothing to do here
for that half).

```svelte
<script lang="ts">
  import type { KiPromptBeat } from '../../../lib/coaching-session-prompts';
  import type { BeatState } from '../../../lib/coaching-session-beats-db';

  let {
    beat,
    beatState,
    prevKiResponse,
    disabled,
    loading,
    streamingResponse,
    canGoBack,
    onGenerate,
    onAccept,
    onReject,
    onSkip,
    onBack,
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

  // Local input state, seeded from persisted values → prefill marker → empty.
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
```

<!-- vitest: KiPromptBeatView's streaming + prefill + Accept-advances-beat behavior is covered by the comprehensive component + E2E suite in P4 (tests always last); P2 ships only the InstructionBeatView anchor (Task 1). -->

---

## Task 4 — Rewrite `SessionWizard.svelte` into the beat-player orchestrator

Rewrite the `<script>` to track `currentStep` **and** `currentBeatIndex`, drive both child components,
and keep the outer 10-circle progress bar + step unlocking unchanged. Replace the old flat-field reads
(`s.coachInputs`, `s.coachNotes`, `stepData.aiResponse`, `def.inputs`) with the beat model
(`stepData.beats: BeatState[]`, `def.beats: Beat[]`). Add a beat-progress indicator ("Beat 3/6") and
render the active beat inside a `{#key}` block so each beat re-instantiates its child with fresh
local state.

### 4a — `<script>` (orchestration)

```svelte
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

  // Nearest previous ki_prompt beat's aiResponse — feeds prefillFromPrevKiResponse.
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
    // last beat done → mark the whole step accepted (outer progress-bar semantics), move on
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

  // InstructionBeat "Weiter →"
  async function onInstructionAdvance(captured?: string) {
    loading = true; error = '';
    try {
      await patchBeat({ beatIndex: currentBeatIndex, captured, beatStatus: 'accepted' });
      await advanceBeat();
    } catch { error = 'Fehler beim Speichern'; }
    finally { loading = false; }
  }

  // KiPromptBeat "KI befragen" — SSE (Claude) / JSON dual path, unchanged transport.
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
            } catch { /* skip malformed event */ }
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

  // Whole-step skip (design: only the whole step is skippable; its beats stay pending).
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
```

### 4b — markup (progress bar unchanged; beat indicator + `{#key}` beat host)

```svelte
<div class="wizard">
  <div class="progress-bar" aria-label="Fortschritt">
    {#each STEP_DEFINITIONS as s}
      {@const status = stepStatus(s.stepNumber)}
      <button
        class="progress-step {PHASE_COLORS[s.phase]} {status === 'current' ? 'ring-2 ring-white scale-110' : ''} {status !== 'pending' ? 'opacity-100' : 'opacity-40'}"
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
        <InstructionBeatView
          beat={activeBeat}
          beatState={beatState(currentBeatIndex)}
          disabled={loading}
          {canGoBack}
          onAdvance={onInstructionAdvance}
          onBack={goBackBeat}
        />
      {:else}
        <KiPromptBeatView
          beat={activeBeat}
          beatState={beatState(currentBeatIndex)}
          prevKiResponse={prevKiResponse()}
          disabled={loading}
          {loading}
          {streamingResponse}
          {canGoBack}
          {onGenerate}
          {onAccept}
          onReject={onReject}
          onSkip={onSkipBeat}
          onBack={goBackBeat}
        />
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
```

### 4c — `<style>`

Keep the wizard/progress/header styles from the current file (`.wizard`, `.progress-bar`,
`.progress-step`, `.step-header`, `.phase-label`, `.step-description`, `.step-title`, `.error-box`,
`.btn-ghost`, `.btn-complete`, `.accepted-badge`). Remove the now-unused input/response/action styles
(they moved into the two child components). Add:

```css
.step-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.beat-indicator { font-size: 0.75rem; font-weight: 600; color: var(--mute); background: var(--ink-800); border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.6rem; white-space: nowrap; }
.step-footer { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; border-top: 1px solid var(--line); padding-top: 1rem; }
```

After the rewrite, confirm no removed flat-field reads survive and the file is under budget:

```bash
cd website && ! grep -nE 'coachInputs|coachNotes|\.aiResponse|def\.inputs' src/components/admin/coaching/SessionWizard.svelte
wc -l src/components/admin/coaching/SessionWizard.svelte   # est. ~330, must stay < 500
```

---

## Task 5 — `generate.ts`: route `beatIndex`, resolve the beat, build `priorCaptures`

Thread `beatIndex` through the POST handler and move prompt-building to the beat level (P1's
`getBeat` + `buildUserPrompt(beat, inputs, priorCaptures)`), then read-modify-write the step's
`BeatState[]`.

### 5a — imports + body

```ts
// extend the prompts import
import { getStepDef, getBeat, isKiPromptBeat, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import type { BeatState } from '../../../../../../../../lib/coaching-session-beats-db';
```

```ts
// replace the body type + parse (was { coachInputs })
let body: { beatIndex: number; inputs: Record<string, string> };
try { body = await request.json(); } catch {
  return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
}
const beatIndex = Number(body.beatIndex);
if (!Number.isInteger(beatIndex) || beatIndex < 0) {
  return new Response(JSON.stringify({ error: 'Invalid beat index' }), { status: 400, headers: { 'content-type': 'application/json' } });
}
```

### 5b — resolve beat + `priorCaptures` (replaces the old `getStepDef`/`buildUserPrompt(def, …)` branch)

`coachingSession` is already fetched above. Its step's `beats` supply both the merge base and the
capture map.

```ts
const stepRow = coachingSession?.steps.find((s) => s.stepNumber === stepNumber);
const stepBeats: BeatState[] = stepRow?.beats ?? [];

const priorCaptures: Record<number, string> = {};
for (const b of stepBeats) {
  if (b.beatIndex < beatIndex && typeof b.captured === 'string' && b.captured.length > 0) {
    priorCaptures[b.beatIndex] = b.captured;
  }
}

const def = getStepDef(stepNumber);
const beat = getBeat(stepNumber, beatIndex);
if (!isKiPromptBeat(beat)) {
  return new Response(JSON.stringify({ error: 'Beat is not a ki_prompt beat' }), { status: 400, headers: { 'content-type': 'application/json' } });
}

const dbTemplate = await getStepTemplate(pool, brand, stepNumber);
let systemPrompt: string;
let userPrompt: string;
const stepName = def.stepName;
const phase = def.phase;
if (dbTemplate) {
  systemPrompt = dbTemplate.systemPrompt;
  userPrompt = buildPromptFromTemplate(dbTemplate, body.inputs);
} else {
  systemPrompt = beat.systemPrompt;
  userPrompt = buildUserPrompt(beat, body.inputs, priorCaptures);
}
```

Replace every remaining `body.coachInputs` reference in the scrubber block and the two agent calls
with `body.inputs` (the agent-factory field is still named `coachInputs`, so pass
`coachInputs: body.inputs` — that interface is out of P2's scope).

### 5c — persist the generated `BeatState` (read-modify-write, both stream + non-stream paths)

Add a local merge helper and use it where `upsertStep` was called with the old flat fields:

```ts
function withBeat(existing: BeatState[], patch: BeatState): BeatState[] {
  const rest = existing.filter((b) => b.beatIndex !== patch.beatIndex);
  return [...rest, patch].sort((a, b) => a.beatIndex - b.beatIndex);
}
```

```ts
// streaming done-branch (was upsertStep({ …, coachInputs, aiPrompt, aiResponse, status:'generated' }))
const mergedBeats = withBeat(stepBeats, {
  beatIndex, inputs: body.inputs, aiResponse: fullResponse, status: 'generated',
});
const step = await upsertStep(pool, { sessionId, stepNumber, stepName, phase, beats: mergedBeats, status: 'generated' });
```

```ts
// non-streaming branch — same merge with `aiResponse` (the final string)
const mergedBeats = withBeat(stepBeats, {
  beatIndex, inputs: body.inputs, aiResponse, status: 'generated',
});
const step = await upsertStep(pool, { sessionId, stepNumber, stepName, phase, beats: mergedBeats, status: 'generated' });
```

The `appendAuditLog` calls stay unchanged (they log the assembled prompt/response, not the flat
fields).

> Cross-partial note: `generate.ts` still calls `buildSessionHistory(sessionId, stepNumber)` from
> `session-history.ts`, which reads P1's removed flat fields — that module is migrated by **P3**
> (export partial), not P2. The call-site here is already correct against the frozen shape.

---

## Task 6 — `index.ts` (PATCH): merge one `BeatState`, keep step-level status

Extend the PATCH handler to accept `beatIndex` and merge a single `BeatState` into the step's
`beats`, while `status` still sets the step-level status. Because `upsertStep` replaces
`coach_inputs` wholesale, read the current step first and merge.

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep, getStep } from '../../../../../../../../lib/coaching-session-db';
import { getStepDef } from '../../../../../../../../lib/coaching-session-prompts';
import type { BeatState } from '../../../../../../../../lib/coaching-session-beats-db';
import { pool } from '../../../../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 0 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  let body: {
    beatIndex?: number; captured?: string; inputs?: Record<string, string>;
    beatStatus?: BeatState['status']; status?: 'pending' | 'generated' | 'accepted' | 'skipped';
  };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const def = stepNumber > 0 ? getStepDef(stepNumber) : { stepName: 'Abschlussbericht', phase: 'umsetzung' };
  const current = await getStep(pool, sessionId, stepNumber);
  let beats: BeatState[] = current?.beats ?? [];

  if (typeof body.beatIndex === 'number' && Number.isInteger(body.beatIndex) && body.beatIndex >= 0) {
    const prev = beats.find((b) => b.beatIndex === body.beatIndex);
    const merged: BeatState = {
      beatIndex: body.beatIndex,
      captured: body.captured ?? prev?.captured,
      inputs: body.inputs ?? prev?.inputs,
      aiResponse: prev?.aiResponse ?? null,
      status: body.beatStatus ?? prev?.status ?? 'seen',
    };
    beats = [...beats.filter((b) => b.beatIndex !== body.beatIndex), merged].sort((a, b) => a.beatIndex - b.beatIndex);
  }

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    beats, status: body.status,
  });
  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
```

This keeps the step-0 `Abschlussbericht` PATCH working (no `beatIndex` → `beats` passes through
unchanged, only `status` is set). No `any` types are introduced.

---

## Task 7 — Verify (mandatory gates)

Run, in order, and confirm each passes before handing off to P3:

```bash
# 1. anchor test green (Task 1/2) — proves the InstructionBeatView split renders + captures
cd website && pnpm vitest run InstructionBeatView --reporter verbose

# 2. no new explicit any in the touched website/src files (CQ02 ≤ 200 global)
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"

# 3. regenerate generated artefacts (test-inventory for the new test, repo-index, …)
task test:inventory
task freshness:regenerate

# 4. mandatory CI-equivalent gates
task test:changed          # website vitest --changed (components + node) + domain BATS + quality
task freshness:check       # freshness + quality:check (S1–S4 ratchet: SessionWizard.svelte/new views < 500, no new cycle, no hostname literal, no orphan)
```

- `task freshness:check` is the load-bearing S1 gate for P2: the rewritten `SessionWizard.svelte` must
  land under its 500-line `.svelte` limit (est. ~330 after the split), and the two new
  `*BeatView.svelte` components must each stay under 500. S2 stays clean because both children import
  only P1 types (no back-edge to DB/API layers). No `*.mentolder.de`/`*.korczewski.de` literal (S3),
  no new `scripts/*`/`k3d/*` (S4).
- Commit the regenerated `website/src/data/test-inventory.json` alongside the code (CI fails on drift).
- The full `task test:changed` green across every coaching test (E2E flow, `KiPromptBeatView`
  streaming/prefill, `session-history`/`complete` migration) lands with **P3/P4**; P2's own
  `InstructionBeatView` anchor is green here.
