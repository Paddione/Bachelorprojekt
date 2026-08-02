---
title: "coaching-session-beat-choreography — P5 tests"
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan (P5: tests)

This is Partial **P5 (tests)** of 5 and the **final** partial:
**P1 data-model → P2 wizard-ui → P3 export → P4 compat-fixups → P5 tests**. P5 depends on **all
four** and runs last (tests always last). It adds **only test code** — no P1/P2/P3/P4 production
file is touched. It brings the two coaching lib test suites in line with the beat model P1 froze
and adds the first end-to-end walkthrough of the rebuilt wizard.

Because the earlier partials deliberately deferred the *comprehensive* test migration to this
partial (P1 appended only a small "Beat model" anchor to `coaching-session-prompts.test.ts` and left
its own legacy flat-shape assertions in place; P4 migrated only `session-tools.test.ts` /
`coaching-sim.test.ts`), the two lib suites here still carry **broken legacy assertions** against the
now beat-shaped code. P5 turns them green and adds the beat-specific coverage design.md's **Testing**
section requires:

1. `coaching-session-prompts.test.ts` — beat-model structural invariants across all 10 steps + direct
   unit tests of `getBeat` / `isKiPromptBeat` / `buildUserPrompt` (both `{key}` and
   `{capturedFrom:INDEX}` resolution).
2. `coaching-session-db.test.ts` — `beats: BeatState[]` persistence round-trip through `upsertStep` /
   `rowToStep` (`serializeBeats` / `deserializeBeats`) and `completeSession` storing the report as a
   single accepted `BeatState` in step 0.
3. A full **Playwright E2E** walkthrough of Step 1 of the rebuilt `SessionWizard.svelte` — the
   greeting instruction-beat → Ist/Soll capture instruction-beat → `ki_prompt` beat → accept →
   Step 2 reached. This is the **highest-priority new test**: after P2 rebuilds
   `SessionWizard.svelte` from a one-form-per-step wizard into a beat-player, the only offline unit
   coverage of the split is P2's `InstructionBeatView` anchor; the orchestrator's step→beat flow
   (advancing beats, the `{#key}` re-mount, the last-beat→step-accepted transition) has **no**
   executable coverage until this E2E walkthrough exists.

## File Structure

All three files already exist and are `.ts` (S1 limit 600). Baseline lookup returned
`nicht-baselined` for each, so the effective S1 threshold is the static 600-line `.ts` limit and
**budget = 600 − ist**. Verified:

```bash
wc -l website/src/lib/coaching-session-prompts.test.ts website/src/lib/coaching-session-db.test.ts \
      tests/e2e/specs/fa-54-coaching-sessions.spec.ts
jq -r '."S1:website/src/lib/coaching-session-prompts.test.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:website/src/lib/coaching-session-db.test.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:tests/e2e/specs/fa-54-coaching-sessions.spec.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/lib/coaching-session-prompts.test.ts` | 104 | 496 |
| `website/src/lib/coaching-session-db.test.ts` | 328 | 272 |
| `tests/e2e/specs/fa-54-coaching-sessions.spec.ts` | 154 | 446 |

All three edits are additive/reshaping within existing files (rewrite legacy assertions, append new
`describe`/`test` blocks); every file stays far under its 600-line budget, so no split/extract is
needed in this partial.

> Cross-partial dependency (prose only, not a table row): P5 imports the frozen P1 public API from
> `website/src/lib/coaching-session-prompts` (the facade: `STEP_DEFINITIONS`, `getStepDef`,
> `getBeat`, `isKiPromptBeat`, `buildUserPrompt`, and the `Beat` / `KiPromptBeat` / `InstructionBeat`
> / `StepInput` types), the four Textbaustein constants from
> `website/src/lib/coaching-textbausteine`, and the `BeatState` type from
> `website/src/lib/coaching-session-beats-db`. It exercises P1's `upsertStep` / `rowToStep` /
> `completeSession` (reshaped in `website/src/lib/coaching-session-db.ts`) and, through the browser,
> P2's rebuilt `SessionWizard.svelte` + `InstructionBeatView.svelte` / `KiPromptBeatView.svelte` and
> the `beatIndex`-routed step API. P5 edits **none** of those modules — only the three test files
> above.

### Vitest-project placement

Both `coaching-session-prompts.test.ts` and `coaching-session-db.test.ts` glob into the vitest
**node** project (`src/**/*.{test,spec}.ts`, `environment: node` — see `website/vitest.config.ts`),
which is where their existing assertions already run; P5 keeps them there (no `@testing-library/svelte`
/ jsdom dependency is introduced — these are pure data-shape + pg-mem persistence tests).

### E2E decision — extend `fa-54-coaching-sessions.spec.ts`, do not add a new spec file

design.md calls for a "neu" (new) E2E walkthrough, and the plan-quality-gates convention is
explicit: **"Bestehende Tests erweitern statt neue Dateien anlegen (Vitest/Playwright/BATS zuerst
suchen)."** The canonical coaching-wizard E2E file already exists —
`tests/e2e/specs/fa-54-coaching-sessions.spec.ts` — and is already registered in the `website`
Playwright project (`playwright.config.ts` → `testMatch` entry
`'**/fa-54-coaching-sessions.spec.ts'`). Adding a *separate* spec file would require a
`playwright.config.ts` `testMatch` edit, which is test-runner wiring outside this tests-only
partial's three-file scope and would otherwise leave the spec unregistered (silently never run).
Extending the existing, already-wired file therefore both honours the convention and keeps P5 to
test files only.

The extension is also **necessary for correctness**: fa-54's current wizard tests (T8–T11) assert the
old flat-shape wizard (`stepName: 'Erstanamnese'`, inputs `#anlass` / `#situation`, a "KI befragen"
button directly on step 1, step 2 named "Schlüsselaffekt"). After P2 the same URL renders a
beat-player whose Step 1 opens on a greeting **instruction** beat with a "Weiter →" button and no
input fields, so those assertions break against P2's wizard. P5 migrates them to the beat model
(the E2E migration was explicitly deferred out of P2 into the tests partial) and adds the full
walkthrough. Net file size ≈ 210 lines, well under the 600 budget.

### E2E environment dependency (KI provider)

The old fa-54 suite deliberately skipped KI generation ("erfordert gültigen Anthropic-API-Key"). The
new walkthrough must exercise it (design.md: "KI befragen → wait for response → Akzeptieren"), so it
requires a **configured, reachable KI provider** in the target environment — which the nightly
`e2e.yml` run against the live fleet provides (coaching sessions run a real provider there). The
walkthrough test therefore uses an extended per-test timeout and waits for the KI-response /
"Akzeptieren →" affordance with a generous timeout; if generation errors, it fails loudly rather than
silently passing. This dependency is documented on the test itself so a local run without a provider
gives a clear signal.

---

## Task 1 — `coaching-session-prompts.test.ts`: beat-model invariants + helper unit tests (red→green)

At P5 execution time (P1–P4 already applied) this file still holds P1's un-migrated legacy
flat-shape `describe` blocks (`STEP_DEFINITIONS` "at least one required input" reads `s.inputs`;
"non-empty systemPrompt/userTemplate" reads `s.systemPrompt`/`s.userTemplate`; `getStepDef(1)`
expects `'Erstanamnese'`; `buildUserPrompt(def, …)` passes a `StepDefinition`). All of these are
invalid against P1's beat shape (`StepDefinition` no longer carries step-level
`inputs`/`systemPrompt`/`userTemplate`; `buildUserPrompt` now takes a `KiPromptBeat`;
`getStepDef(1).stepName === 'Erste Problem- und Zielbeschreibung'`).

### 1a — Run the file as-is against the beat-shaped code (must fail)

```bash
cd website && pnpm vitest run coaching-session-prompts --reporter verbose
```

**expected: FAIL** — the legacy `STEP_DEFINITIONS` block throws `Cannot read properties of undefined
(reading 'some')` on `s.inputs`, the `getStepDef` block asserts `'Erstanamnese'` (now
`'Erste Problem- und Zielbeschreibung'`), and `buildUserPrompt(def, …)` no longer type-checks / mis-
resolves. Task 1b rewrites the suite so it passes.

### 1b — Replace the legacy blocks with beat-model invariants

Rewrite the file to import the beat helpers + the Textbaustein constants and assert the invariants
design.md's Testing section names. Keep the still-valid `STEP_DEFINITIONS` shape checks (10 steps,
four phases, sequential numbers, non-empty description) and the rate-limit helper block; replace the
flat-field blocks with the following. Beats are discovered dynamically (`find(isKiPromptBeat)`,
`filter`) so the assertions do not hard-code brittle beat indices.

```ts
import { describe, it, expect } from 'vitest';
import {
  STEP_DEFINITIONS,
  getStepDef,
  getBeat,
  isKiPromptBeat,
  buildUserPrompt,
  type Phase,
  type KiPromptBeat,
} from './coaching-session-prompts';
import {
  BASE_SYSTEM,
  TB_TEUFELSKREISLAUF,
  TB_AUSBALANCIERUNGSPROBLEME,
  TB_KOMPLEMENTAERKRAEFTE,
  TB_ERFOLGSFAKTOREN,
} from './coaching-textbausteine';

describe('STEP_DEFINITIONS (beat model)', () => {
  it('contains exactly 10 steps across all four phases with sequential numbers', () => {
    expect(STEP_DEFINITIONS).toHaveLength(10);
    expect(new Set(STEP_DEFINITIONS.map((s) => s.phase))).toEqual(
      new Set<Phase>(['problem_ziel', 'analyse', 'loesung', 'umsetzung']),
    );
    expect(STEP_DEFINITIONS.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every step exposes a non-empty beats sequence with at least one ki_prompt beat', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.beats.length).toBeGreaterThan(0);
      expect(s.beats.some(isKiPromptBeat)).toBe(true);
    }
  });

  it('every ki_prompt beat has a non-empty systemPrompt and userTemplate', () => {
    for (const s of STEP_DEFINITIONS) {
      for (const beat of s.beats.filter(isKiPromptBeat)) {
        expect(beat.systemPrompt.trim().length).toBeGreaterThan(0);
        expect(beat.userTemplate.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('capture keys are unique within each step', () => {
    for (const s of STEP_DEFINITIONS) {
      const keys = s.beats
        .filter((b) => b.kind === 'instruction' && b.capture)
        .map((b) => (b as { capture: { key: string } }).capture.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every step has a non-empty description', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.description.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('Textbaustein embedding', () => {
  // Steps that reference a Textbaustein constant (per P1): 5, 6, 7, 10.
  const cases: Array<{ step: number; tb: string }> = [
    { step: 5, tb: TB_TEUFELSKREISLAUF },
    { step: 6, tb: TB_AUSBALANCIERUNGSPROBLEME },
    { step: 7, tb: TB_KOMPLEMENTAERKRAEFTE },
    { step: 10, tb: TB_ERFOLGSFAKTOREN },
  ];

  it('each referenced Textbaustein constant is non-empty', () => {
    for (const { tb } of cases) expect(tb.trim().length).toBeGreaterThan(0);
  });

  it('the referenced step embeds the Textbaustein content in a ki_prompt systemPrompt', () => {
    for (const { step, tb } of cases) {
      const kiBeats = getStepDef(step).beats.filter(isKiPromptBeat);
      expect(kiBeats.some((b) => b.systemPrompt.includes(tb))).toBe(true);
    }
  });
});

describe('getBeat / isKiPromptBeat', () => {
  it('returns the beat at a valid index and narrows the kind', () => {
    const first = getBeat(1, 0);
    expect(first.kind).toBe('instruction');
    expect(isKiPromptBeat(first)).toBe(false);
    const ki = getStepDef(1).beats.find(isKiPromptBeat)!;
    expect(isKiPromptBeat(ki)).toBe(true);
  });

  it('throws on an out-of-range beat index', () => {
    expect(() => getBeat(1, 99)).toThrow();
  });
});

describe('buildUserPrompt', () => {
  it('resolves {key} placeholders from the beat inputs', () => {
    const beat = STEP_DEFINITIONS.flatMap((s) => s.beats)
      .filter(isKiPromptBeat)
      .find((b) => b.inputs.length > 0) as KiPromptBeat;
    const key = beat.inputs[0].key;
    const out = buildUserPrompt(beat, { [key]: 'ERSATZTEXT-42' }, {});
    expect(out).toContain('ERSATZTEXT-42');
  });

  it('resolves {capturedFrom:INDEX} read-only from priorCaptures (step 1 → captured beat 1)', () => {
    const beat = getStepDef(1).beats.find(isKiPromptBeat) as KiPromptBeat;
    expect(beat.userTemplate).toContain('{capturedFrom:1}');
    const out = buildUserPrompt(beat, {}, { 1: 'MEINE-IST-SOLL-ERZAEHLUNG' });
    expect(out).toContain('MEINE-IST-SOLL-ERZAEHLUNG');
    expect(out).not.toContain('{capturedFrom:1}');
  });

  it('substitutes an em-dash for missing placeholders', () => {
    const beat = STEP_DEFINITIONS.flatMap((s) => s.beats)
      .filter(isKiPromptBeat)
      .find((b) => b.inputs.length > 0) as KiPromptBeat;
    const out = buildUserPrompt(beat, {}, {});
    expect(out).toContain('—');
  });

  it('keeps BASE_SYSTEM as the base of every ki_prompt systemPrompt', () => {
    for (const s of STEP_DEFINITIONS) {
      for (const beat of s.beats.filter(isKiPromptBeat)) {
        expect(beat.systemPrompt.startsWith(BASE_SYSTEM)).toBe(true);
      }
    }
  });
});
```

### 1c — Re-run the suite (must pass)

```bash
cd website && pnpm vitest run coaching-session-prompts --reporter verbose
```

---

## Task 2 — `coaching-session-db.test.ts`: BeatState persistence round-trip + report-in-step-0

The existing suite drives `upsertStep(pool, { …, coachInputs, aiResponse })` and asserts
`step.coachInputs` / `step.aiResponse` / step-0 `report.aiResponse` — all invalid under P1
(`UpsertStepArgs` now takes `beats: BeatState[]`; `SessionStep.beats` replaces the flat fields;
`ai_response` is written `NULL`). The pg-mem schema in `beforeAll` already declares
`coach_inputs jsonb` (where `serializeBeats` stores the array) plus the now-`NULL` `ai_prompt` /
`ai_response` / `coach_notes` columns, so **no schema change** is needed — only the calls and
assertions move to the beat shape.

### 2a — Migrate the existing flat-shape assertions to beats

- `getSession` "returns session with steps": replace `coachInputs: { anlass: 'Stress' }` with
  `beats: [{ beatIndex: 0, captured: 'Stress', status: 'accepted' }]`; assert
  `result!.steps[0].beats[0].captured === 'Stress'`.
- `upsertStep` "updates an existing step on second call": pass `beats` on both calls and assert the
  second call's `beats` win (`step!.beats.find((b) => b.beatIndex === 1)!.aiResponse === 'KI sagt...'`
  and `step!.status === 'generated'`).
- `completeSession` "sets status to completed and stores report": assert the step-0 report reads back
  as a beat — `report!.beats[0].aiResponse` contains `'Zusammenfassung'`.
- `updateSessionFields` "gibt Steps zurück": replace `coachInputs: {}` with `beats: []`.

### 2b — Add the beat round-trip and report-shape tests

Append two new `describe` blocks. Type `BeatState[]` explicitly so the JSONB round-trip is asserted
end-to-end (no `any`).

```ts
import type { BeatState } from './coaching-session-beats-db';

describe('BeatState persistence round-trip', () => {
  it('serializes a mixed BeatState[] into coach_inputs and reads it back intact', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Beat-Roundtrip', createdBy: 'coach1', mode: 'live',
    });
    const beats: BeatState[] = [
      { beatIndex: 0, captured: 'Ist/Soll-Erzählung', status: 'accepted' },
      { beatIndex: 1, inputs: { modifikationen: 'meine Anpassung' }, aiResponse: 'KI-Antwort', status: 'generated' },
      { beatIndex: 2, status: 'skipped' },
    ];
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erste Problem- und Zielbeschreibung',
      phase: 'problem_ziel', beats, status: 'generated',
    });
    const step = await getStep(pool, s.id, 1);
    expect(step!.beats).toEqual(beats);           // deep round-trip via serializeBeats/deserializeBeats
    expect(step!.beats.map((b) => b.beatIndex)).toEqual([0, 1, 2]);   // order preserved
  });

  it('defaults to an empty beats array when none are provided', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Leer', createdBy: 'coach1', mode: 'live',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 2, stepName: 'S2', phase: 'problem_ziel', status: 'pending',
    });
    const step = await getStep(pool, s.id, 2);
    expect(step!.beats).toEqual([]);
  });
});

describe('completeSession stores the report as a single accepted BeatState in step 0', () => {
  it('writes step 0 with exactly one accepted beat carrying the report markdown', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Report-Beat', createdBy: 'coach1', mode: 'live',
    });
    await completeSession(pool, s.id, '# Bericht\n## Ausgangslage\nText…');
    const result = await getSession(pool, s.id);
    const report = result!.steps.find((x) => x.stepNumber === 0)!;
    expect(report.beats).toHaveLength(1);
    expect(report.beats[0].beatIndex).toBe(0);
    expect(report.beats[0].status).toBe('accepted');
    expect(report.beats[0].aiResponse).toContain('Ausgangslage');
  });
});
```

### 2c — Run the suite (must pass)

```bash
cd website && pnpm vitest run coaching-session-db --reporter verbose
```

---

## Task 3 — `fa-54-coaching-sessions.spec.ts`: migrate wizard tests + full Step-1 beat walkthrough

Extend the existing, already-registered coaching-wizard E2E spec. The auth-gating cases (T1–T4), the
overview/new-page structure cases (T5–T6) and the 10-button progress-bar case (T7) stay unchanged
(the progress bar is still ten step buttons). Rewrite T8–T11 to the beat model and add the
walkthrough test. All URLs come from the existing env-resolved `BASE` constant already defined at the
top of the file — no host literal is introduced.

### 3a — Migrate the old-shape wizard cases (T8–T11)

- **T8** (step 1 opening): the rebuilt Step 1 opens on the greeting **instruction** beat. Assert the
  heading `Schritt 1/10 — Erste Problem- und Zielbeschreibung`, a visible "Beat 1/…" indicator, a
  visible "Weiter →" button, and **no** `#anlass` / `#situation` input on this beat.

  ```ts
  test('T8: wizard step 1 opens on the greeting instruction beat', async ({ page }) => {
    await loginAsAdmin(page, '/admin/coaching/sessions/new');
    await page.waitForURL(/\/new$/, { timeout: 20_000 });
    await page.locator('#title').fill(`FA-54 E2E T8 ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

    await expect(page.getByRole('heading', { name: /Schritt 1\/10.*Erste Problem- und Zielbeschreibung/ })).toBeVisible();
    await expect(page.getByText(/Beat 1\//)).toBeVisible();
    await expect(page.getByRole('button', { name: /Weiter/ })).toBeVisible();
    await expect(page.locator('#anlass')).toHaveCount(0);
  });
  ```

- **T10** (skip): whole-step skip advances to Step 2 under its new name. Assert
  `Schritt 2/10 — Fokussierung Schlüsselsituation`.

  ```ts
  test('T10: skip advances the wizard to step 2', async ({ page }) => {
    /* …create session as above… */
    await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
    await page.getByRole('button', { name: 'Schritt überspringen' }).click();
    await expect(page.getByRole('heading', { name: /Schritt 2\/10.*Fokussierung Schlüsselsituation/ })).toBeVisible();
  });
  ```

- **T11** (back): skip to step 2, then "← Zurück" returns to step 1 (the orchestrator's
  `goBackBeat` maps step-2 beat 0 back to step 1's last beat).

  ```ts
  test('T11: back button returns to the previous step', async ({ page }) => {
    /* …create session, skip to step 2… */
    await expect(page.getByRole('heading', { name: /Schritt 2\/10/ })).toBeVisible();
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
  });
  ```

- **T9** (old KI-button-enable via `#anlass`/`#situation`) no longer maps — Step 1's `ki_prompt`
  beat declares `inputs: []`, so "KI befragen" is enabled with no fields to fill. Drop the standalone
  T9; button-enablement and the beat sequence are covered end-to-end by the walkthrough below.

### 3b — Add the full Step-1 beat walkthrough (highest-priority new coverage)

This is the deliverable design.md's Testing section specifies and the first executable coverage of
`SessionWizard.svelte`'s beat orchestration. It needs a reachable KI provider (see the environment
note above), so it carries an extended timeout and waits for the KI response before accepting.

```ts
test('T13: full Step-1 beat walkthrough reaches Step 2 (greeting → Ist/Soll → KI → accept)', async ({ page }) => {
  test.setTimeout(120_000); // KI generation may take a while against the live provider

  await loginAsAdmin(page, '/admin/coaching/sessions/new');
  await page.waitForURL(/\/new$/, { timeout: 20_000 });
  await page.locator('#title').fill(`FA-54 E2E Walkthrough ${Date.now()}`);
  await page.locator('#submit-btn').click();
  await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

  // Beat 1 — greeting instruction beat: no capture field, just advance.
  await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
  await expect(page.getByText(/Beat 1\//)).toBeVisible();
  await page.getByRole('button', { name: /Weiter/ }).click();

  // Beat 2 — Ist/Soll capture instruction beat: fill the textarea, then advance.
  await expect(page.getByText(/Beat 2\//)).toBeVisible();
  const capture = page.getByRole('textbox');
  await expect(capture).toBeVisible();
  await capture.fill('Ist: ständig überlastet im Team. Soll: klare Delegation und Ruhe.');
  await page.getByRole('button', { name: /Weiter/ }).click();

  // Beat 3 — ki_prompt beat (inputs: []): ask the KI, wait for the response, accept.
  await expect(page.getByText(/Beat 3\//)).toBeVisible();
  const askButton = page.getByRole('button', { name: /KI befragen/ });
  await expect(askButton).toBeEnabled();
  await askButton.click();

  const acceptButton = page.getByRole('button', { name: /Akzeptieren/ });
  await expect(acceptButton).toBeVisible({ timeout: 90_000 }); // KI response arrived
  await acceptButton.click();

  // Progress advanced to Step 2.
  await expect(page.getByRole('heading', { name: /Schritt 2\/10/ })).toBeVisible({ timeout: 20_000 });
});
```

> The helper block that fabricates a session (login → `/new` → fill `#title` → submit → wait for the
> `/sessions/<uuid>` URL) is already the established pattern in T7–T12; T10/T11 reuse it verbatim.
> No new host literal is added — every navigation resolves through the file's existing `BASE`
> constant (`process.env.WEBSITE_URL ?? …`).

---

## Task 4 — Verify (final task — full-change closing sweep)

This is the **last task of the last partial**, so its verification is the closing gate for the whole
5-partial change: it must confirm that **all** coaching tests — P1's shape anchor, P2's
`InstructionBeatView` anchor, P3's `coaching-report` builder anchor, P4's `session-tools` /
`coaching-sim` migrations, **and** P5's comprehensive lib + E2E suites — are green **together for the
first time**. Run from the worktree root, in order; every command must pass:

```bash
# 1. Every coaching lib/vitest suite green together (node + components projects)
cd website && pnpm vitest run \
  coaching-session-prompts coaching-session-db coaching-report \
  session-tools coaching-sim InstructionBeatView --reporter verbose

# 2. Playwright walkthrough of the rebuilt wizard (needs a reachable KI provider; the nightly
#    e2e.yml run against the live fleet provides one — see the environment note above)
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
npx playwright test --config tests/e2e/playwright.config.ts --project=website fa-54-coaching-sessions

# 3. Regenerate the test inventory for the changed/added tests, then the CI-equivalent gates
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
task test:inventory
task test:changed          # vitest --changed (node + components) + domain BATS + quality
task freshness:regenerate  # regenerate generated artefacts (test-inventory, repo-index, …)
task freshness:check       # freshness + quality:check (S1–S4 ratchet + baseline key-count assertion)
```

- `task test:changed` is the load-bearing gate: with P1–P4 applied and P5's suites migrated, it must
  now run **green across the entire coaching test set** (the sweeps in P1–P4 each stopped short of
  this because the two lib suites still carried un-migrated legacy assertions — P5 closes that gap).
- `task freshness:check` (S1) confirms all three edited test files stay under their 600-line `.ts`
  budgets (prompts.test.ts ≤ ~230, db.test.ts ≤ ~400, fa-54 spec ≤ ~210), no new import cycle is
  introduced (the tests only add edges to existing P1 leaves — `coaching-session-prompts`,
  `coaching-textbausteine`, `coaching-session-beats-db`), no hostname literal is added (S3 — every
  E2E URL resolves through the existing `BASE`/`WEBSITE_URL` env constant), and no orphan
  script/manifest is created (S4).
- No new explicit `any` is introduced (CQ02): the `BeatState[]` round-trip and the E2E page objects
  are fully typed.
- Commit the regenerated `website/src/data/test-inventory.json` alongside the tests (CI fails on
  drift).
</content>
</invoke>
