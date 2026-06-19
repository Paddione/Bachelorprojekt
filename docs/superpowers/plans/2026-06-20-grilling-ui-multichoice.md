---
title: Grilling UI: Multiple-Choice-Chips und Daten-Reset — Implementation Plan
ticket_id: T000737
domains: [website, db, ops, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Grilling UI: Multiple-Choice-Chips und Daten-Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quick-select choice chips and a working "show all" mode to the in-ticket `GrillingStepper`, make the questionnaire selection in `[id].astro` dynamic instead of hardcoded, and reset garbage grilling data on ticket T000737.

**Architecture:** Pure-data layer (`grilling.ts`) gains an optional `choices?: string[]` field on `GrillingQuestion` plus curated choice lists for selected questions of both questionnaires. The Svelte `GrillingStepper` renders chip buttons above the textarea (click replaces the answer text) and gains a real list rendering for `mode === 'all'`. The Astro page computes the questionnaire id from existing answer keys (excluding the stale `coaching-sessions-v1`) instead of hardcoding it. The DB reset is a one-off operational SQL step (Step 0), not a code change.

**Tech Stack:** TypeScript, Svelte 5 (runes: `$props`, `$state`, `$derived`, `$effect`), Astro, Vitest + `@testing-library/svelte`, Tailwind CSS, PostgreSQL (via `kubectl exec`), go-task.

## Global Constraints

- **TDD:** every code change is preceded by a failing test, then minimal implementation, then green test. Existing tests MUST stay green.
- **S1 line-count budget (`task freshness:check` ratchet):** `grilling.ts` ≤ ~500 (currently 327), `GrillingStepper.svelte` ≤ ~500 (currently 116), `[id].astro` ≤ ~500 (currently 398 — keep additions ≈ line-neutral: one `const` block + one prop change). Run `wc -l` after touching these.
- **No brand-domain literals in code** (S3 secret/brand-domain gate). No hostnames, no `*.de` literals in any source file.
- **No new DB column.** `questionnaire_id` stays out of the schema. Questionnaire selection is derived from existing `grillingAnswers` keys.
- **Out of scope:** multi-select (multiple chips active at once), new DB field, `GrillingAnswersPanel.svelte` (legacy, not mounted in `[id].astro`).
- **Choices replace (not append to) the textarea content** — simplest UX, single source of truth per question.
- **Verification gates (PFLICHT, Task 7):** `task test:changed`, `task test:openspec` (= `bash scripts/openspec.sh validate`), `task freshness:regenerate`, `task freshness:check`, `task test:inventory` (+ commit `test-inventory.json` if it changed).

---

## File Structure

- `website/src/lib/tickets/grilling.ts` (modify) — add `choices?: string[]` to `GrillingQuestion`; add curated `choices` arrays to selected questions in both questionnaires. Pure data, no behavior change to existing functions.
- `website/src/lib/tickets/grilling.test.ts` (modify) — assert `choices` is read from `QUESTIONNAIRES` and surfaced by `resolveQuestions`.
- `website/src/components/admin/GrillingStepper.svelte` (modify) — render choice chips above the textarea; implement the `all`-mode list; add a `choices` field to `ResolvedQuestion` consumption.
- `website/src/components/admin/GrillingStepper.test.ts` (modify) — chip render, chip click sets textarea, all-mode list rendering. Existing tests untouched.
- `website/src/pages/admin/tickets/[id].astro` (modify) — replace hardcoded `questionnaireId="coaching-sessions-v1"` with a derived `grillingQnId`.
- `openspec/changes/grilling-ui-multichoice/{proposal.md,tasks.md,specs/grilling-ui-multichoice.md}` (fill in) — OpenSpec artefacts validated by `scripts/openspec.sh validate`.

**Important data contract:** `resolveQuestions(...)` currently returns `ResolvedQuestion = { id; prompt; section? }`. To render chips in the stepper, `choices` must flow through. The plan extends `ResolvedQuestion` with `choices?: string[]` and copies `q.choices` into the resolved object in `resolveQuestions` (registry branch only — absorbed meta questions have no choices). This keeps the stepper reading from the single `all` derived list.

---

## Step 0: T000737 Data Reset (operational, no code change)

This is a one-off DB write. It is NOT committed and NOT part of the diff. Run it before/independently of the code change so that after the dynamic-selection fix lands, T000737 resolves to `final-grilling-v1` (the stale `coaching-sessions-v1` answer key is gone, so the blacklist-filter falls through to the default).

- [ ] **Step 0.1: Verify current state (read-only)**

```bash
kubectl --context fleet exec -n workspace deploy/shared-db -- \
  psql -U postgres -d website -tc \
  "SELECT external_id, grilling_answers IS NOT NULL AS has_answers, grilling_meta IS NOT NULL AS has_meta FROM tickets.tickets WHERE external_id = 'T000737';"
```
Expected: one row for `T000737`, likely `has_answers = t`, `has_meta = t`.

- [ ] **Step 0.2: Reset the garbage data**

```bash
kubectl --context fleet exec -n workspace deploy/shared-db -- \
  psql -U postgres -d website -c \
  "UPDATE tickets.tickets SET grilling_answers = NULL, grilling_meta = NULL WHERE external_id = 'T000737';"
```
Expected: `UPDATE 1`.

- [ ] **Step 0.3: Confirm**

```bash
kubectl --context fleet exec -n workspace deploy/shared-db -- \
  psql -U postgres -d website -tc \
  "SELECT external_id, grilling_answers, grilling_meta FROM tickets.tickets WHERE external_id = 'T000737';"
```
Expected: both columns `NULL` (empty) for `T000737`.

> Note: This SQL is brand-namespace-specific. T000737 lives in the mentolder brand (`workspace`/`-n workspace`). If the ticket also exists in `workspace-korczewski`, repeat the UPDATE with `-n workspace-korczewski`. Verify with the Step 0.1 SELECT in each namespace before writing.

---

## Task 1: `grilling.ts` — `choices?` field + curated choice lists

**Files:**
- Modify: `website/src/lib/tickets/grilling.ts` (interface at lines 5-8; `QUESTIONNAIRES` final-grilling-v1 lines 26-90; coaching-sessions-v1 lines 91-155; `resolveQuestions` lines 277-299; `ResolvedQuestion` line 273)
- Test: `website/src/lib/tickets/grilling.test.ts`

**Interfaces:**
- Produces: `GrillingQuestion.choices?: string[]`; `ResolvedQuestion.choices?: string[]`. `resolveQuestions` copies `q.choices` into resolved objects for registry questions. Consumed by Task 3 (the Svelte component) and asserted by Task 2.

- [ ] **Step 1: Write the failing test (choices read from registry)**

Append to `website/src/lib/tickets/grilling.test.ts` (inside a new `describe`):

```ts
import { getQuestionnaire } from './grilling';

describe('GrillingQuestion.choices', () => {
  it('final-grilling-v1 q13 (Test-Typen) exposes choices', () => {
    const qn = getQuestionnaire('final-grilling-v1')!;
    const q13 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q13')!;
    expect(q13.choices).toEqual(['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei']);
  });
  it('coaching-sessions-v1 q4 (Rhythmus) exposes choices', () => {
    const qn = getQuestionnaire('coaching-sessions-v1')!;
    const q4 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q4')!;
    expect(q4.choices).toEqual(['Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Bedarfsgesteuert']);
  });
  it('a question without choices has choices === undefined', () => {
    const qn = getQuestionnaire('final-grilling-v1')!;
    const q1 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q1')!;
    expect(q1.choices).toBeUndefined();
  });
  it('resolveQuestions surfaces choices for registry questions that have them', () => {
    const resolved = resolveQuestions('final-grilling-v1', QUESTIONNAIRES, null);
    const q13 = resolved.find((q) => q.id === 'q13')!;
    expect(q13.choices).toEqual(['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei']);
    const q1 = resolved.find((q) => q.id === 'q1')!;
    expect(q1.choices).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts`
Expected: FAIL — `q13.choices` is `undefined` (field not yet added) and/or `resolveQuestions` result has no `choices`.

- [ ] **Step 3: Add the `choices` field to the interfaces**

In `website/src/lib/tickets/grilling.ts`, replace the `GrillingQuestion` interface (lines 5-8):

```ts
export interface GrillingQuestion {
  id: string;       // e.g. "q1"
  label: string;    // question text
  choices?: string[]; // quick-select chips for common answers
}
```

And replace `ResolvedQuestion` (line 273):

```ts
export interface ResolvedQuestion { id: string; prompt: string; section?: string; choices?: string[] }
```

- [ ] **Step 4: Add curated choices to `final-grilling-v1`**

In the `final-grilling-v1` block, add a `choices` array to these exact questions (replace each line in place):

```ts
          { id: 'q8', label: 'Sind Breaking Changes zu erwarten?', choices: ['Nein, rückwärtskompatibel', 'Ja, aber kontrolliert', 'Ja, koordinierter Rollout nötig'] },
```
```ts
          { id: 'q13', label: 'Welche Test-Typen sind nötig? (Unit, Integration, E2E?)', choices: ['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei'] },
```
```ts
          { id: 'q17', label: 'Welche Umgebungen sind betroffen? (dev, beide Brands?)', choices: ['Nur dev', 'dev + mentolder', 'dev + korczewski', 'Alle Envs (dev + beide Brands)'] },
```
```ts
          { id: 'q18', label: 'Gibt es einen Rollback-Plan?', choices: ['Ja, reversibel', 'Nein, Forward-only-Migration', 'Nicht nötig (Feature-Flag)'] },
```
```ts
          { id: 'q19', label: 'Sind DB-Migrationen, Secrets oder Config-Änderungen nötig?', choices: ['Nein', 'Ja, DB-Migration', 'Ja, neue Secrets', 'Ja, Config-Änderungen', 'Mehreres davon'] },
```
```ts
          { id: 'q20', label: 'Wer reviewt und deployed?', choices: ['Patrick (Self-Review)', 'Factory-Autopass', 'Manuell deployen nötig'] },
```

- [ ] **Step 5: Add curated choices to `coaching-sessions-v1`**

In the `coaching-sessions-v1` block, add a `choices` array to these exact questions (replace each line in place):

```ts
          { id: 'q3', label: 'Wie viele Sessions umfasst ein typisches Coaching bei dir? (feste Anzahl oder offen?)', choices: ['3-5 Sessions (kompakt)', '8-10 Sessions (standard)', '12+ Sessions (intensiv)', 'Offen je nach Bedarf'] },
```
```ts
          { id: 'q4', label: 'In welchem Rhythmus sollen Sessions stattfinden? (wöchentlich, 14-tägig, bedarfsgesteuert?)', choices: ['Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Bedarfsgesteuert'] },
```
```ts
          { id: 'q17', label: 'Wie lang sollten Sessions sein? (45 Min, 60 Min, 90 Min?)', choices: ['45 Minuten', '60 Minuten', '90 Minuten', '120 Minuten'] },
```
```ts
          { id: 'q18', label: 'Gibt es Unterschiede zwischen Erst-, Folge- und Abschlusssession?', choices: ['Ja, Erst-/Folge-/Abschluss-Session verschieden', 'Nein, gleiche Struktur immer', 'Nur Abschluss-Session anders'] },
```
```ts
          { id: 'q19', label: 'Wie flexibel darf der Ablauf sein? (vom Coachee steuerbar oder strukturiert vorgegeben?)', choices: ['Sehr strukturiert (vorgegebener Ablauf)', 'Hybrid (Rahmen + Coachee-Steuerung)', 'Offen (Coachee bestimmt)'] },
```

- [ ] **Step 6: Surface `choices` in `resolveQuestions`**

In `resolveQuestions` (lines 285-292), the registry branch builds resolved objects. Replace the inner push so the registry question's `choices` is carried through:

```ts
  if (qn) {
    for (const s of qn.sections) {
      for (const q of s.questions) {
        out.push({ id: q.id, prompt: q.label, section: s.title, ...(q.choices ? { choices: q.choices } : {}) });
        seen.add(q.id);
      }
    }
  }
```

(The absorbed-meta branch below stays unchanged — meta questions never have choices.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts`
Expected: PASS — all new assertions plus all pre-existing `grilling.test.ts` describes (`isBlankAnswer`, `parseGrillingDoc`, `resolveQuestions`, `questionStatus`, `grillingProgress`, `splitAnswered`) stay green.

- [ ] **Step 8: Verify line budget**

Run: `wc -l website/src/lib/tickets/grilling.ts`
Expected: well under ~500 (≈ 327 + interface lines; adding `choices:` inline does not add lines).

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/tickets/grilling.ts website/src/lib/tickets/grilling.test.ts
git commit -m "feat(grilling): add choices field to GrillingQuestion + curated choice lists [T000737]"
```

---

## Task 2: `GrillingStepper.svelte` — choice chips above the textarea

**Files:**
- Modify: `website/src/components/admin/GrillingStepper.svelte` (script + the `{#if current}` template block, lines 104-112)
- Test: `website/src/components/admin/GrillingStepper.test.ts`

**Interfaces:**
- Consumes: `ResolvedQuestion.choices?: string[]` from Task 1 (`current.choices`).
- Produces: chip buttons with `data-testid="grilling-choice-{choice.replace(/\s/g,'-')}"`; clicking a chip sets the answer text for `current` to the choice (replacing prior input) and triggers the same debounced PATCH as `onInput`. Active chip (when `answerText === choice`) carries a gold border.

- [ ] **Step 1: Write the failing tests (chips render + click sets textarea)**

Append to `website/src/components/admin/GrillingStepper.test.ts` (the existing `QN` is `coaching-sessions-v1`; its q1 has no choices, but we navigate to a question that does — q3 is the 3rd question, reachable via two `Weiter` clicks from the first open question). To keep it robust, use `final-grilling-v1` for the chip tests via a dedicated setup:

```ts
import { QUESTIONNAIRES as QNS } from '../../lib/tickets/grilling';

function setupFinal(answers: any = null, meta: any = null) {
  return render(GrillingStepper, {
    props: { ticketId: 't1', questionnaireId: 'final-grilling-v1', grillingAnswers: answers, grillingMeta: meta },
  });
}

describe('GrillingStepper choice chips', () => {
  it('renders chips for a question that has choices', async () => {
    setupFinal(null, null);
    // q1..q7 have no choices; q8 (Breaking Changes) is the first with choices.
    // Navigate forward until the q8 chips appear.
    for (let i = 0; i < 7; i++) {
      await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    }
    expect(screen.getByTestId('grilling-choice-Nein,-rückwärtskompatibel')).toBeTruthy();
  });

  it('clicking a chip fills the textarea with the choice text', async () => {
    setupFinal(null, null);
    for (let i = 0; i < 7; i++) {
      await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    }
    const chip = screen.getByTestId('grilling-choice-Ja,-aber-kontrolliert');
    await fireEvent.click(chip);
    const ta = screen.getByLabelText('Antwort') as HTMLTextAreaElement;
    expect(ta.value).toBe('Ja, aber kontrolliert');
  });

  it('a question without choices renders no chip buttons', () => {
    setupFinal(null, null);
    // First open question is q1 (no choices).
    expect(screen.queryByTestId(/^grilling-choice-/)).toBeNull();
  });
});
```

(Keep the existing top-of-file imports; only add the `QNS` import and the `setupFinal` helper if they are not already present.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: FAIL — `getByTestId('grilling-choice-...')` finds nothing (chips not yet rendered).

- [ ] **Step 3: Add the chip-select handler to the `<script>`**

In `GrillingStepper.svelte`, after the `onInput` function (after line 66), add:

```ts
  function selectChoice(value: string) {
    if (!current) return;
    const qn = answers[questionnaireId] ?? {};
    answers = { ...answers, [questionnaireId]: { ...qn, [current.id]: value } };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void patch({ grillingAnswers: answers }); }, 800);
  }
```

- [ ] **Step 4: Render the chips in the `{#if current}` block**

In the template, insert the chip row between the prompt (`<p class="font-medium">…`, line 106) and the `<textarea>` (line 107):

```svelte
    <p class="font-medium">{current.prompt}</p>
    {#if current.choices && current.choices.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each current.choices as choice}
          <button
            type="button"
            data-testid={`grilling-choice-${choice.replace(/\s/g, '-')}`}
            onclick={() => selectChoice(choice)}
            class="rounded-full border px-3 py-1 text-sm transition-colors {answerText === choice ? 'border-gold text-gold' : 'border-dark-lighter text-muted hover:border-gold/60'}"
          >{choice}</button>
        {/each}
      </div>
    {/if}
    <textarea class="w-full rounded-lg bg-dark border border-dark-lighter p-3" rows="4" aria-label="Antwort" oninput={onInput}>{answerText}</textarea>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: PASS — the three new chip tests pass; all six pre-existing `GrillingStepper` tests stay green (chips do not interfere with the `coaching-sessions-v1` q1 first-open-question, which has no choices).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/GrillingStepper.svelte website/src/components/admin/GrillingStepper.test.ts
git commit -m "feat(grilling): render quick-select choice chips above the answer textarea [T000737]"
```

---

## Task 3: `GrillingStepper.svelte` — implement the "all" mode list

**Files:**
- Modify: `website/src/components/admin/GrillingStepper.svelte` (the `{#if current}` block region, lines 104-115 — wrap it in a `mode` branch)
- Test: `website/src/components/admin/GrillingStepper.test.ts`

**Interfaces:**
- Consumes: `mode` (`$state<'step'|'all'>`), `all` (`$derived` resolved questions), `answers`, `meta`, `questionStatus`, `onInput`, `selectChoice` from Task 2.
- Produces: in `mode === 'all'`, one row per question in `all`; answered/dismissed rows visually distinct; `data-testid="grilling-all-list"` on the container so the test can assert the list shows ALL questions, not just the current one.

- [ ] **Step 1: Write the failing test (all-mode shows every question)**

Append to `website/src/components/admin/GrillingStepper.test.ts`:

```ts
describe('GrillingStepper all mode', () => {
  it('shows all questions as a list when mode is "all"', async () => {
    setup(null, null); // coaching-sessions-v1, 23 questions
    await fireEvent.click(screen.getByTestId('grilling-mode')); // step -> all
    const list = screen.getByTestId('grilling-all-list');
    expect(list).toBeTruthy();
    // every registry question label is present in all-mode
    const labels = QUESTIONNAIRES[QN].sections.flatMap((s) => s.questions).map((q) => q.label);
    for (const label of labels) {
      expect(within(list).getByText(label)).toBeTruthy();
    }
  });

  it('answered questions show their answer preview in all mode', async () => {
    setup({ [QN]: { q1: 'Meine erste Antwort' } }, null);
    await fireEvent.click(screen.getByTestId('grilling-mode'));
    const list = screen.getByTestId('grilling-all-list');
    expect(within(list).getByText(/Meine erste Antwort/)).toBeTruthy();
  });
});
```

Add `within` to the top-level testing-library import:

```ts
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: FAIL — `getByTestId('grilling-all-list')` finds nothing (all-mode still renders the single-question template).

- [ ] **Step 3: Wrap the template in a `mode` branch and add the all-mode list**

Replace the `{#if current} … {:else} … {/if}` template region (lines 104-115) with:

```svelte
  {#if mode === 'all'}
    <ul data-testid="grilling-all-list" class="space-y-2">
      {#each all as q}
        {@const st = questionStatus(q.id, questionnaireId, answers, meta)}
        <li class="rounded-lg border p-3 {st === 'answered' ? 'border-gold/50 bg-dark' : st === 'dismissed' ? 'border-dark-lighter opacity-60' : 'border-dark-lighter'}">
          <p class="text-sm font-medium">{q.prompt}</p>
          {#if st === 'answered'}
            <p class="mt-1 text-xs text-muted truncate">{answers[questionnaireId]?.[q.id]}</p>
          {:else if st === 'dismissed'}
            <p class="mt-1 text-xs text-muted italic">verworfen</p>
          {:else}
            <input
              class="mt-2 w-full rounded bg-dark border border-dark-lighter p-2 text-sm"
              aria-label={`Antwort ${q.id}`}
              value={answers[questionnaireId]?.[q.id] ?? ''}
              oninput={(e) => { currentId = q.id; onInput(e); }}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {:else if current}
    {#if current.section}<p class="text-xs uppercase text-muted">{current.section}</p>{/if}
    <p class="font-medium">{current.prompt}</p>
    {#if current.choices && current.choices.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each current.choices as choice}
          <button
            type="button"
            data-testid={`grilling-choice-${choice.replace(/\s/g, '-')}`}
            onclick={() => selectChoice(choice)}
            class="rounded-full border px-3 py-1 text-sm transition-colors {answerText === choice ? 'border-gold text-gold' : 'border-dark-lighter text-muted hover:border-gold/60'}"
          >{choice}</button>
        {/each}
      </div>
    {/if}
    <textarea class="w-full rounded-lg bg-dark border border-dark-lighter p-3" rows="4" aria-label="Antwort" oninput={onInput}>{answerText}</textarea>
    <div class="flex gap-2">
      <button type="button" onclick={prev} disabled={currentIdx <= 0}>Zurück</button>
      <button type="button" onclick={dismiss}>Verwerfen</button>
      <button type="button" onclick={next} disabled={currentIdx >= ordered.length - 1}>Weiter</button>
    </div>
  {:else}
    <p class="text-muted">Keine Fragen.</p>
  {/if}
```

> Note: the all-mode `<input>`'s `oninput` sets `currentId = q.id` first so `onInput` (which reads `current`) writes to the correct question. The `$effect` re-init guard only fires when `currentId` is empty or not in `all`, so this assignment is safe (q.id is always in `all`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: PASS — all-mode tests pass; the existing `mode toggle switches between step and all mode` test (which only asserts the button label flips) still passes; all chip and navigation tests stay green.

- [ ] **Step 5: Verify line budget**

Run: `wc -l website/src/components/admin/GrillingStepper.svelte`
Expected: well under ~500 (≈ 116 + ~40 lines).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/GrillingStepper.svelte website/src/components/admin/GrillingStepper.test.ts
git commit -m "feat(grilling): implement all-mode question list in GrillingStepper [T000737]"
```

---

## Task 4: `[id].astro` — dynamic questionnaire selection

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro` (frontmatter: add `grillingQnId` const near the other ticket-derived consts; template line 185: replace the hardcoded prop)
- Test: none directly (Astro page is not unit-tested here). Covered by the `grilling.ts`/stepper unit tests and by manual/E2E later. The selection logic is a 4-line pure expression.

**Interfaces:**
- Consumes: `ticket.grillingAnswers` (type `GrillingAnswers | null`). Produces: `grillingQnId` passed as `questionnaireId` to `GrillingStepper`.

- [ ] **Step 1: Add the derived questionnaire id to the frontmatter**

In the `[id].astro` frontmatter (the `---` script block at the top), add this const alongside the other `ticket`-derived locals (e.g. near where `isContainer`/`containerDor` are computed):

```astro
const grillingQnId = (() => {
  const existing = Object.keys(ticket.grillingAnswers ?? {}).filter((k) => k !== 'coaching-sessions-v1');
  return existing[0] ?? 'final-grilling-v1';
})();
```

- [ ] **Step 2: Use it in the GrillingStepper props**

Replace line 185:

```astro
            questionnaireId="coaching-sessions-v1"
```
with:
```astro
            questionnaireId={grillingQnId}
```

- [ ] **Step 3: Verify the build compiles + line budget**

Run: `cd website && pnpm astro check 2>&1 | tail -20` (or `pnpm build` if `astro check` is unavailable)
Expected: no new type errors referencing `[id].astro` / `grillingQnId`.

Run: `wc -l website/src/pages/admin/tickets/[id].astro`
Expected: ≈ 398 + 4 lines = ~402, comfortably under ~500. (If the project's S1 limit for this file is a hard 400, hoist the IIFE into the existing const block to stay line-neutral — but the documented headroom is ~500.)

- [ ] **Step 4: Commit**

```bash
git add "website/src/pages/admin/tickets/[id].astro"
git commit -m "fix(grilling): derive questionnaire id dynamically instead of hardcoding coaching-sessions-v1 [T000737]"
```

---

## Task 5: Full website test suite green

**Files:** none (verification task).

- [ ] **Step 1: Run the website vitest suite**

Run: `cd website && pnpm vitest run`
Expected: PASS — entire suite green, in particular `src/lib/tickets/grilling.test.ts` and `src/components/admin/GrillingStepper.test.ts`.

- [ ] **Step 2: If any pre-existing test broke, fix forward**

Do NOT weaken assertions to make them pass. If a chip/all-mode change broke an existing stepper test, the rendering changed in a way the test legitimately catches — adjust the implementation, not the test, unless the test asserted now-obsolete markup. Re-run until green.

---

## Task 6: OpenSpec artefacts

**Files:**
- Modify: `openspec/changes/grilling-ui-multichoice/proposal.md`
- Modify: `openspec/changes/grilling-ui-multichoice/tasks.md` (mirror of this plan — see separate deliverable)
- Modify: `openspec/changes/grilling-ui-multichoice/specs/grilling-ui-multichoice.md`

- [ ] **Step 1: Fill proposal.md** — Why (the 4 problems from the spec) + What (the 5 solution points), keep the `_Ticket: T000737_` footer.

- [ ] **Step 2: Fill the spec delta** with real ADDED Requirements + Scenarios (replace the TODO scaffold). At minimum: a "Quick-select choices" requirement and a "Dynamic questionnaire selection" requirement, each with GIVEN/WHEN/THEN scenarios.

- [ ] **Step 3: Validate**

Run: `bash scripts/openspec.sh validate`
Expected: PASS (no `TODO` placeholders remain; format-conformant).

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/grilling-ui-multichoice/
git commit -m "docs(openspec): fill grilling-ui-multichoice proposal/spec/tasks [T000737]"
```

---

## Task 7: Final verification (PFLICHT)

**Files:** possibly `website/src/data/test-inventory.json` (regenerated).

- [ ] **Step 1: Test inventory**

Run: `task test:inventory`
If `website/src/data/test-inventory.json` changed, commit it:
```bash
git add website/src/data/test-inventory.json && git commit -m "chore: regenerate test inventory [T000737]"
```

- [ ] **Step 2: Changed-scope tests**

Run: `task test:changed`
Expected: PASS.

- [ ] **Step 3: OpenSpec gate**

Run: `task test:openspec` (≡ `bash scripts/openspec.sh validate`)
Expected: PASS.

- [ ] **Step 4: Freshness regen + check**

Run: `task freshness:regenerate` then `task freshness:check`
Expected: S1–S4 ratchet + baseline assertions green. If `freshness:regenerate` produced artefact changes, commit them (resolve any `docs/generated/**` conflicts with `git checkout --ours` per CLAUDE.md).

- [ ] **Step 5: Final commit (if regen produced changes)**

```bash
git add -A && git commit -m "chore: regenerate freshness artifacts [T000737]"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- Problem 1 (hardcoded questionnaire) → Task 4. ✓
- Problem 2 (no multiple-choice) → Task 1 (`choices` field + lists) + Task 2 (chips). ✓
- Problem 3 (garbage data in T000737) → Step 0 (DB reset). ✓
- Problem 4 (all-mode not implemented) → Task 3. ✓
- Acceptance criteria: reset (Step 0), `choices?` compiles (Task 1), chips render (Task 2), chip click fills textarea (Task 2), all-mode list (Task 3), no hardcoded id (Task 4), existing tests green (Task 5), new tests for chips/all-mode/selection (Tasks 1-3). ✓
- Not-in-scope (multi-select, DB column, `GrillingAnswersPanel`) → respected; no task touches them. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases" in code steps; every code step shows real code. Task 6 Steps 1-2 describe content to author (proposal/spec prose) rather than verbatim text — acceptable, as the source prose lives in the spec and is mirrored in `tasks.md`/`proposal.md` deliverables.

**Type consistency:** `GrillingQuestion.choices?: string[]` (Task 1) → `ResolvedQuestion.choices?: string[]` (Task 1) → `current.choices` / `q.choices` (Tasks 2-3). `selectChoice(value: string)` defined Task 2, reused Task 3. `grillingQnId` defined and consumed in Task 4. `data-testid` naming `grilling-choice-{…}` consistent across plan and tests. All consistent.

---

## Execution Handoff

Plan complete. STOP after plan — do not implement (per the dev-flow-plan contract: plan is committed and pushed to the branch; implementation is a separate `dev-flow-execute` session).
