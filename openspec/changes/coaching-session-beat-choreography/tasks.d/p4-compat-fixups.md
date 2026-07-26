---
title: "coaching-session-beat-choreography — P4 compat-fixups"
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan (P4: compat-fixups)

This is Partial **P4 (compat-fixups)** of 5: **P1 data-model → P2 wizard-ui → P3 export →
P4 compat-fixups → P5 tests**. P4 depends on **P1 only**.

P1 reshaped the coaching data model: `StepDefinition` lost its step-level `inputs` / `systemPrompt`
/ `userTemplate` (those moved onto `KiPromptBeat` inside `StepDefinition.beats: Beat[]`), and
`coaching.session_steps.coach_inputs` now stores a JSON array of `BeatState` instead of a flat
`Record<string, string>` (with `ai_prompt` / `ai_response` / `coach_notes` written `NULL` for beat
steps). Two consumers **outside** the wizard/export UI read the old shapes and break under P1 but
were not covered by P1/P2/P3:

1. `website/src/pages/api/demo/coaching-sim.ts` — the public, rate-limited demo endpoint reads
   `stepDef.inputs` (client mode) and `stepDef.userTemplate` (coach mode); both properties no longer
   exist on `StepDefinition`.
2. `website/src/lib/session-tools.ts` — reads `row.coach_inputs` as `Record<string, string>` and
   `row.ai_response` / `row.coach_notes` (now `NULL`) from raw SQL against `coaching.session_steps`.

P4 migrates **only these two modules and their existing test files** to the frozen P1 exports
(`getStepDef`, `isKiPromptBeat`, `buildUserPrompt`, `Beat` / `KiPromptBeat` / `StepDefinition` from
the `coaching-session-prompts` facade, and `BeatState` / `deserializeBeats` from
`coaching-session-beats-db`). It touches **none** of P1/P2/P3's files. The comprehensive
beat-invariant + persistence test migration (the legacy assertions still in
`coaching-session-prompts.test.ts` / `coaching-session-db.test.ts`) is **P5**; P4 owns only the
targeted red→green tests for its own two modules so it leaves the pipeline compiling and green.

## File Structure

All four files already exist and are `.ts` (S1 limit 600). Baseline lookup for each returned
`nicht-baselined`, so the effective S1 threshold is the static 600-line `.ts` limit and
**budget = 600 − ist**. Verified:

```bash
wc -l website/src/pages/api/demo/coaching-sim.ts website/src/lib/session-tools.ts \
      website/src/pages/api/demo/coaching-sim.test.ts website/src/lib/session-tools.test.ts
jq -r '."S1:website/src/pages/api/demo/coaching-sim.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:website/src/lib/session-tools.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/pages/api/demo/coaching-sim.ts` | 199 | 401 |
| `website/src/lib/session-tools.ts` | 110 | 490 |
| `website/src/pages/api/demo/coaching-sim.test.ts` | 104 | 496 |
| `website/src/lib/session-tools.test.ts` | 78 | 522 |

Both migrations are small, additive edits (a local helper + a few reshaped lines each), so every file
stays far under its 600-line budget — no split/extract needed in this partial.

> Cross-partial dependency (prose only, not a table row above): P4 imports the frozen P1 public API —
> `getStepDef`, `isKiPromptBeat`, `buildUserPrompt`, and the `Beat` / `KiPromptBeat` / `StepDefinition`
> types from `website/src/lib/coaching-session-prompts` (the facade), plus `BeatState` and
> `deserializeBeats` from `website/src/lib/coaching-session-beats-db`. P4 does **not** edit those P1
> modules, the coaching-session-db module, or any P2/P3 file.

---

## Task 1 — `session-tools.ts`: deserialize `coach_inputs` as `BeatState[]` (red→green)

`getSessionStepTool` and `draftSessionReportTool` read `coach_inputs` as a flat
`Record<string, string>` and read the now-`NULL` `ai_response` / `coach_notes` columns. Under P1 the
step's real content lives in the `BeatState[]` array stored in `coach_inputs`. Migrate both readers to
**reuse P1's `deserializeBeats`** (do not reimplement JSON parsing) and derive their outputs from the
beats.

### Return-shape decision (why a derived-flat view + the raw beats)

The only consumers of these two functions are `claude-session-agent.ts`
(`getSessionStepTool` / `draftSessionReportTool`) and — for `searchCoachingKnowledgeTool` only —
`openai-compatible-session-agent.ts` (verified via
`grep -rn "session-tools" website/src`). Both agents pass the result straight through
`JSON.stringify(result)` as LLM tool output and never destructure individual fields, so the return
shape is only ever serialized whole. Therefore:

- `getSessionStepTool` returns the **raw `beats: BeatState[]`** (richest signal for the model) **plus**
  a derived `aiResponse` (the last beat carrying a non-null `aiResponse` — i.e. the step's final
  accepted KI answer) for backward-compatible semantics. The obsolete `coachInputs` and `coachNotes`
  fields are dropped (their content now lives inside `beats`; no consumer reads them by name).
- `draftSessionReportTool` keeps its exact `{ stepsText }` / `{ stepsText: '', error }` contract; only
  the per-step text is rebuilt from beats (captured protocol lines + the final KI answer).

`searchCoachingKnowledgeTool` and `SESSION_TOOLS` are untouched (no `coach_inputs` dependency), so
`openai-compatible-session-agent.ts` needs no change. `claude-session-agent.ts` needs no change either
(it stringifies the whole result). No call site is left broken and none is out of file scope.

### 1a — Rewrite the existing `session-tools.test.ts` to the beat model (extend, don't create)

Edit `website/src/lib/session-tools.test.ts`. The current file drives `upsertStep(pool, { …,
coachInputs, aiPrompt, aiResponse, … })` and asserts `result.aiResponse` / `result.stepsText` against
the flat shape — both invalid under P1 (`UpsertStepArgs` now takes `beats`; `ai_response` is written
`NULL`). Replace the `upsertStep` calls with the beat args and the assertions with the beat-derived
outputs. Keep the same pg-mem harness (`coach_inputs jsonb` column already present).

```ts
// getSessionStepTool — build a step out of BeatState[] and assert the derived view
await upsertStep(pool, {
  sessionId: SID, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
  beats: [
    { beatIndex: 0, captured: 'Konflikt im Team', inputs: { anlass: 'Burnout' }, status: 'accepted' },
    { beatIndex: 1, aiResponse: 'antwort', status: 'accepted' },
  ],
  status: 'accepted',
});
const result = await getSessionStepTool(SID, 1);
expect(result.found).toBe(true);
expect(result.stepName).toBe('Erstanamnese');
expect(result.beats?.length).toBe(2);
expect(result.aiResponse).toBe('antwort');   // derived: last beat with a non-null aiResponse
```

```ts
// draftSessionReportTool — stepsText assembled from accepted beats
await upsertStep(pool, { sessionId: SID2, stepNumber: 1, stepName: 'S1', phase: 'p',
  beats: [{ beatIndex: 0, aiResponse: 'r1', status: 'accepted' }], status: 'accepted' });
await upsertStep(pool, { sessionId: SID2, stepNumber: 2, stepName: 'S2', phase: 'p',
  beats: [{ beatIndex: 0, aiResponse: 'r2', status: 'accepted' }], status: 'accepted' });
const report = await draftSessionReportTool(SID2, 'markdown');
expect(report.stepsText).toContain('S1');
expect(report.stepsText).toContain('r1');
```

The `getSessionStepTool` "nonexistent step" and `draftSessionReportTool` "no accepted steps" cases stay
as-is.

### 1b — Run the rewritten test against the un-migrated `session-tools.ts` (must fail)

```bash
cd website && pnpm vitest run session-tools --reporter verbose
```

**expected: FAIL** — the old `getSessionStepTool` reads `row.ai_response`, which P1 now writes `NULL`,
so `result.aiResponse` is `undefined` (not `'antwort'`) and `result.beats` does not exist. Task 1c
makes it pass.

### 1c — Migrate `session-tools.ts`

Add the P1 leaf import and reshape both readers. Keep functions fully typed (no `any`).

```ts
import type { BeatState } from './coaching-session-beats-db';
import { deserializeBeats } from './coaching-session-beats-db';

export async function getSessionStepTool(
  sessionId: string,
  stepNumber: number,
): Promise<{ found: boolean; stepName?: string; beats?: BeatState[]; aiResponse?: string; status?: string }> {
  const r = await p().query(
    `SELECT step_name, coach_inputs, status
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number = $2`,
    [sessionId, stepNumber],
  );
  if (!r.rows[0]) return { found: false };
  const row = r.rows[0];
  const beats = deserializeBeats(row.coach_inputs);
  const lastAi = [...beats].reverse().find((b) => b.aiResponse)?.aiResponse;
  return {
    found: true,
    stepName: row.step_name as string,
    beats,
    aiResponse: lastAi ?? undefined,
    status: row.status as string,
  };
}
```

```ts
export async function draftSessionReportTool(
  sessionId: string,
  _format: 'markdown' | 'structured',
): Promise<{ stepsText: string; error?: string }> {
  const r = await p().query(
    `SELECT step_number, step_name, coach_inputs
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number > 0 AND status IN ('accepted', 'skipped')
      ORDER BY step_number`,
    [sessionId],
  );
  if (r.rows.length === 0) {
    return { stepsText: '', error: 'Keine abgeschlossenen Schritte gefunden' };
  }
  const stepsText = r.rows
    .map((s: { step_number: number; step_name: string; coach_inputs: unknown }) => {
      const beats = deserializeBeats(s.coach_inputs);
      const protokoll = beats.filter((b) => b.captured).map((b) => b.captured).join('\n') || '—';
      const ai = [...beats].reverse().find((b) => b.aiResponse)?.aiResponse ?? '—';
      return `## Schritt ${s.step_number}: ${s.step_name}\n**Protokoll:** ${protokoll}\n**KI:** ${ai}`;
    })
    .join('\n\n');
  return { stepsText };
}
```

### 1d — Re-run the test (must pass) + confirm no stale column reads remain

```bash
cd website && pnpm vitest run session-tools --reporter verbose
cd website && ! grep -nE 'ai_response|coach_notes|coachInputs' src/lib/session-tools.ts
```

---

## Task 2 — `coaching-sim.ts`: migrate the demo to the first `ki_prompt` beat (red→green)

The public demo keeps its **one-KI-call-per-step** request/response contract (`SimBody` and the
`{ result }` response are unchanged). The frozen `POST` behavior guarded by
`openspec/specs/coaching-sessions-polish-guide.md` → **Requirement "Rate-limited Hermes Proxy"**
(kill-switch 503, 413 body cap, 400 validation, **20 req/IP/min → 429**, 200 passthrough) is not
touched — only the two lines inside the `try` block that read `stepDef.inputs` / `stepDef.userTemplate`
change.

### Model decision: simulate the step's **first `ki_prompt` beat**

The demo receives a `stepNumber` but no `beatIndex` and issues exactly one KI call per step. Under the
beat model each step is a sequence, but the demo is a lightweight single-shot taster. Decision: resolve
the step's **first `ki_prompt` beat** via a small local helper and use *that beat's* `inputs`
(client-mode field generation) and `userTemplate` (coach-mode prompt). Rationale: every step has ≥1
`ki_prompt` beat (guaranteed by P1's shape test), and the first one is always the step's substantive
generation call — steps that also carry a trailing "Ich übernehme mit folgenden Modifikationen" beat
would need the prior beat's accepted `aiResponse`, which this stateless per-call demo does not track.
The first `ki_prompt` beat is therefore the faithful single-shot analogue of the old step-level prompt.

Coach mode reuses P1's `buildUserPrompt(beat, inputs, priorCaptures)` (do **not** reimplement the
regex): it replaces both `{key}` (from `body.coachInputs`) and `{capturedFrom:INDEX}` (→ `'—'` here,
since the stateless demo has no captured context) — the old inline `/\{(\w+)\}/g` replace would leave
`{capturedFrom:INDEX}` literals leaking into the prompt, which `buildUserPrompt` cleanly avoids.

> Follow-up risk (out of P4 scope): because the demo is stateless, `{capturedFrom:INDEX}` slots and
> `ki_prompt` beats declaring `inputs: []` resolve to placeholders rather than real content, so the
> demo's coach-mode prompt is thinner than the full wizard's. This is a fidelity limitation of the
> public taster, not a broken contract (the spec freezes only rate-limiting + response shape). Enriching
> the demo to carry captured context is a separate follow-up, not a compat fix.

### 2a — Add a coach-mode test to the existing `coaching-sim.test.ts` (extend, don't create)

Add one `it` to `website/src/pages/api/demo/coaching-sim.test.ts` (the existing client-mode happy-path
test already exercises `stepDef.inputs` and becomes a second red anchor). The new test asserts coach
mode fills the beat `userTemplate` and never leaks a raw `{capturedFrom:…}` placeholder:

```ts
it('coach mode fills the first ki_prompt beat template (no raw placeholder leaks)', async () => {
  vi.mocked(getActiveProvider).mockResolvedValue({
    provider: 'local-lmstudio', apiKey: null, apiEndpoint: 'http://localhost:1234/v1',
    modelName: 'hermes-3', temperature: 0.7, maxTokens: null, systemPrompt: null,
  } as unknown as Awaited<ReturnType<typeof getActiveProvider>>);
  mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });

  const res = await call({ mode: 'coach', stepNumber: 1, stepName: 'Anliegen', coachInputs: {}, previousSteps: [] });
  expect(res.status).toBe(200);
  const sent = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
  const userMsg = sent.messages[sent.messages.length - 1].content;
  expect(userMsg).not.toContain('{capturedFrom');
});
```

### 2b — Run the coaching-sim suite against the un-migrated endpoint (must fail)

```bash
cd website && pnpm vitest run coaching-sim --reporter verbose
```

**expected: FAIL** — under P1 `getStepDef(1).inputs` is `undefined`, so the client-mode happy-path test
throws (`Cannot read properties of undefined (reading 'map')`) → caught → HTTP 500 (not 200), and the
new coach-mode test hits the same `stepDef.userTemplate` `undefined`. Task 2c makes both pass.

### 2c — Migrate `coaching-sim.ts`

Swap the `getStepDef` import line for the beat-aware imports and add the helper; reshape the two reads.

```ts
// replace the getStepDef import
import { getStepDef, isKiPromptBeat, buildUserPrompt } from '../../../lib/coaching-session-prompts';
import type { StepDefinition, KiPromptBeat } from '../../../lib/coaching-session-prompts';

// local helper (module scope): the step's first ki_prompt beat is its single-shot KI call
function firstKiPromptBeat(stepDef: StepDefinition): KiPromptBeat {
  const beat = stepDef.beats.find(isKiPromptBeat);
  if (!beat) throw new Error(`Step ${stepDef.stepNumber} has no ki_prompt beat`);
  return beat;
}
```

```ts
// client mode: field keys come from the beat's inputs
const beat = firstKiPromptBeat(getStepDef(body.stepNumber));
const fieldKeys = beat.inputs
  .map((i) => `"${i.key}": "${i.label} (kurz, authentisch)"`)
  .join(',\n  ');
```

```ts
// coach mode: reuse P1's buildUserPrompt (handles {key} + {capturedFrom:INDEX})
const beat = firstKiPromptBeat(getStepDef(body.stepNumber));
const filledPrompt = buildUserPrompt(beat, body.coachInputs, {});
```

### 2d — Re-run the coaching-sim suite (must pass)

```bash
cd website && pnpm vitest run coaching-sim --reporter verbose
```

---

## Task 3 — Verify (mandatory gate commands)

Run from the worktree root in order; every command must pass before handing off to P5:

```bash
# targeted red→green suites for both migrated modules are green
cd website && pnpm vitest run session-tools coaching-sim --reporter verbose

# regenerate the test inventory for the two added/edited tests, then the CI-equivalent gates
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
task test:inventory
task test:changed          # vitest --changed for website + domain BATS + quality
task freshness:regenerate  # regenerate generated artefacts (test-inventory, repo-index, …)
task freshness:check       # freshness + quality:check (S1–S4 ratchet + baseline key-count assertion)
```

- Commit the regenerated `website/src/data/test-inventory.json` alongside the code (CI fails on drift).
- `task freshness:check` is the load-bearing S1 gate: both source files stay far under their 600-line
  `.ts` budgets (coaching-sim.ts ≤ ~215, session-tools.ts ≤ ~125), no new import cycles are introduced
  (both only add edges to existing P1 leaves — `coaching-session-prompts` facade and
  `coaching-session-beats-db`), no hostname literals (S3), no new orphan scripts/manifests (S4).
- No new explicit `any` types are introduced (CQ02): both migrations stay fully typed.
- `task test:changed` full-green across the whole coaching test set lands with **P5** (tests last);
  P4's own two targeted suites are green here.

<!-- vitest: P4 extends the two EXISTING test files (session-tools.test.ts + coaching-sim.test.ts) with
     red→green compat assertions; the comprehensive beat-invariant + persistence suites are P5. -->
