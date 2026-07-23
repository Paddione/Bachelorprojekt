---
title: "coaching-session-beat-choreography — P3 export"
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan (P3: export)

This is Partial **P3 (export)** of 4: **P1 data-model → P2 wizard-ui → P3 export → P4 tests**.
P3 rebuilds the **completed-session report view** on top of the shape P1 froze
(`SessionStep.beats: BeatState[]`, `StepDefinition.beats: Beat[]` with `InstructionBeat`/
`KiPromptBeat`, `STEP_DEFINITIONS`, `getStepDef`). It depends on **P1 only** — the report is a
read-only render path, fully independent of P2's live wizard. It consumes P1's public API verbatim
and adds **no** exports to P1's or P2's modules. The comprehensive report/E2E suite is **P4** (tests
always last); P3 ships exactly **one** red→green anchor (Task 1).

Three things must land (per design.md "Export (Partial 2)"): (1) the Executive-Summary Claude call in
the completion route must build its input from the full `beats` protocol across all 10 steps instead
of the removed flat fields; (2) a structured **full protocol** view — one block per step (1–10) with
the phase colour, quote-blocks for captured Coachee statements and KI-result boxes for accepted
`aiResponse`s; (3) downloads — keep "Als HTML herunterladen" (Blob of the rendered markup) and add a
browser **print view** (`window.print()` + `@media print`) so "Als PDF speichern" needs no PDF library.

## File Structure

Existing files carry their **verified effective S1 budget** (both `nicht-baselined` → budget =
extension-limit − current lines; `.astro` limit 400, `.ts` limit 600).

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/pages/admin/coaching/sessions/[id].astro` | 260 | 140 |
| `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` | 66 | 534 |

New files created in this partial (not yet baselined; `.svelte` limit 500, `.ts` limit 600):

| `path` | est. lines | limit |
|--------|-----------|-------|
| `website/src/components/admin/coaching/SessionReport.svelte` | ~195 | 500 |
| `website/src/lib/coaching-report.ts` | ~95 | 600 |
| `website/src/lib/coaching-report.test.ts` | ~50 | 600 |

## Component-extraction decision (S1) — why the protocol view cannot stay inline

`[id].astro` today is 260 lines with a **140-line** budget under the 400-line `.astro` limit. The old
report is a single `<pre>{report.aiResponse}</pre>` block. The new report is a **structured 10-step
protocol** — per step a phase-coloured header plus, per beat, either a quote-block or a KI-result box,
each with its own markup and print styling — which will not fit inline without blowing the budget and
turning the page into a mixed data-massaging + presentation file. So P3 performs a **real extraction**
(not cosmetic line-squeezing), matching the existing pattern where `[id].astro` already mounts
`SessionWizard.svelte` with `client:load`:

```
[id].astro              (page: auth/meta/audit + branch completed→report / else→wizard; mounts child)
   └─ SessionReport.svelte   (client:load leaf: Kopf + Executive-Summary + Protokoll + downloads/print)
        └─ coaching-report.ts (pure leaf: buildProtocol + buildExecutiveSummaryInput; no DB/API import)

complete.ts             (API route: Executive-Summary Claude call; imports the pure builder)
```

`coaching-report.ts` is a **pure** module (imports only P1 *types* + `STEP_DEFINITIONS`; no DB/API
back-edge → no S2 cycle) so the same protocol-extraction logic is shared by the render path
(`SessionReport.svelte`) and the summary-prompt path (`complete.ts`), and is unit-testable in
isolation without pulling in the Astro route, the Anthropic SDK, or the DB pool. `SessionReport.svelte`
lands ≈ 195 lines (< 500) and, because the heavy protocol markup moves into it, `[id].astro` **shrinks
net** (it loses the `<pre>` report block, the inline download `<script>`, and the report-only styles;
it gains a one-line child mount plus a small `@media print` block). No hardcoded hostnames (S3), no new
`scripts/*`/`k3d/*` (S4), no new `any` types (CQ02 stays flat — every prop bag and callback is typed).

## Phase-colour convention (visual parity with the wizard)

The protocol reuses the wizard's phase semantics from `SessionWizard.svelte`
(`problem_ziel`→blue, `analyse`→orange, `loesung`→green, `umsetzung`→purple; `phaseLabel` from the
`StepDefinition`). Because the report renders in scoped component CSS rather than on the progress-dot
Tailwind utilities, the same four hues are expressed as CSS custom colours on a per-step left border,
so a reader sees the identical phase mapping the wizard uses live.

## Cross-partial contract (what P3 reads from P1; what stays out of scope)

P3 reads P1's frozen shape and adds nothing to it. From P1 it consumes: `STEP_DEFINITIONS` and the
`Beat` union (`InstructionBeat.capture.label`, `InstructionBeat.regie`, `KiPromptBeat.regie`) via the
`coaching-session-prompts` facade, and `SessionStep.beats: BeatState[]` (with `BeatState.captured`,
`BeatState.aiResponse`, `BeatState.beatIndex`) via `coaching-session-db`. The completed report itself
is persisted by P1's `completeSession` as step 0's `beats[0].aiResponse` — P3 reads exactly that shape
back. `session-history.ts`/`session-tools.ts` are **not** in P3's scope (they are separate flat-field
readers; their migration and all comprehensive report/persistence/E2E tests belong to **P4**). The
full `task test:changed` sweep across the coaching test set goes green at **P4**; P3's own anchor test
(Task 1) is green within P3, and `task freshness:check` (S1–S4 ratchet, no typecheck/test-run) is
green at P3.

---

## Task 1 — Red anchor test: the protocol builder covers all 10 steps (FAIL first)

Create `website/src/lib/coaching-report.test.ts`. It lands in the vitest **node** project (glob
`src/lib/**/*.test.ts`, the same project P1's `coaching-session-prompts.test.ts` runs in). This is the
single red→green anchor for the partial; the comprehensive `SessionReport` render + download + E2E
suites are P4.

```ts
// website/src/lib/coaching-report.test.ts
import { describe, it, expect } from 'vitest';
import { buildProtocol, buildExecutiveSummaryInput } from './coaching-report';
import { STEP_DEFINITIONS } from './coaching-session-prompts';
import type { SessionStep } from './coaching-session-db';

describe('coaching-report protocol builder (P3)', () => {
  // Fabricate one persisted step per definition: every capture-InstructionBeat gets a
  // captured value, every KiPromptBeat gets an accepted aiResponse — tagged by step number.
  const steps: SessionStep[] = STEP_DEFINITIONS.map((def) => ({
    id: `s${def.stepNumber}`,
    sessionId: 'sess',
    stepNumber: def.stepNumber,
    stepName: def.stepName,
    phase: def.phase,
    status: 'accepted',
    generatedAt: null,
    beats: def.beats.map((b, i) => {
      if (b.kind === 'instruction' && b.capture) {
        return { beatIndex: i, captured: `CAP${def.stepNumber}`, status: 'accepted' as const };
      }
      if (b.kind === 'ki_prompt') {
        return { beatIndex: i, aiResponse: `KI${def.stepNumber}`, status: 'accepted' as const };
      }
      return { beatIndex: i, status: 'accepted' as const };
    }),
  }));

  it('executive-summary input includes every one of the 10 steps content', () => {
    const text = buildExecutiveSummaryInput(buildProtocol(steps, STEP_DEFINITIONS));
    for (let n = 1; n <= 10; n++) {
      expect(text).toContain(`Schritt ${n}:`);   // heading for each step present
      expect(text).toContain(`KI${n}`);          // each step's accepted KI result flows in
    }
  });

  it('a capture beat becomes a quote entry, a ki_prompt beat a ki entry', () => {
    const protocol = buildProtocol(steps, STEP_DEFINITIONS);
    expect(protocol).toHaveLength(10);
    const step1 = protocol[0];
    expect(step1.entries.some((e) => e.kind === 'quote' && e.text === 'CAP1')).toBe(true);
    expect(step1.entries.some((e) => e.kind === 'ki' && e.text === 'KI1')).toBe(true);
  });
});
```

Run it targeted:

```bash
cd website && pnpm vitest run coaching-report --reporter verbose
```

**expected: FAIL** — `coaching-report.ts` does not exist yet, so the `import` resolves to nothing and
the suite errors at collection (`Failed to resolve import "./coaching-report"`). Task 2 makes it pass.

---

## Task 2 — `coaching-report.ts`: pure protocol + summary-input builder (new leaf)

Create `website/src/lib/coaching-report.ts` as an import-only-types leaf. It pairs each persisted
`SessionStep.beats` with its `StepDefinition.beats` choreography: capture-`InstructionBeat`s with a
non-empty `captured` become **quote** entries (labelled from `capture.label`); `KiPromptBeat`s with a
non-empty accepted `aiResponse` become **ki** entries (labelled from the beat's `regie` hint). Steps
skipped/empty simply yield no entries. `buildExecutiveSummaryInput` flattens the whole protocol to the
plain-text user message the completion route feeds Claude — one `## Schritt N:` heading per step so all
10 steps' content is present.

```ts
// website/src/lib/coaching-report.ts
// Reine Aufbereitung des Beat-Protokolls für die Report-Ansicht (SessionReport.svelte) und den
// Executive-Summary-Prompt (complete.ts). S2-Leaf: importiert nur P1-Typen + STEP_DEFINITIONS,
// keine DB-/API-Schicht → kein Zyklus.
import type { SessionStep } from './coaching-session-db';
import type { StepDefinition } from './coaching-session-prompts';

export type ProtocolEntryKind = 'quote' | 'ki';

export interface ProtocolEntry {
  kind: ProtocolEntryKind;
  /** capture.label (quote) bzw. regie-Hinweis (ki). */
  label: string;
  /** protokollierte Coachee-Aussage (quote) bzw. finale akzeptierte KI-Antwort (ki). */
  text: string;
}

export interface ProtocolStep {
  stepNumber: number;
  stepName: string;
  phase: string;
  phaseLabel: string;
  entries: ProtocolEntry[];
}

/** Paart die persistierten BeatStates jedes Schritts mit der StepDefinition-Choreographie. */
export function buildProtocol(steps: SessionStep[], defs: StepDefinition[]): ProtocolStep[] {
  return defs.map((def) => {
    const states = steps.find((s) => s.stepNumber === def.stepNumber)?.beats ?? [];
    const entries: ProtocolEntry[] = [];
    def.beats.forEach((beat, i) => {
      const st = states.find((b) => b.beatIndex === i);
      if (beat.kind === 'instruction' && beat.capture) {
        const text = (st?.captured ?? '').trim();
        if (text) entries.push({ kind: 'quote', label: beat.capture.label, text });
      } else if (beat.kind === 'ki_prompt') {
        const text = (st?.aiResponse ?? '').trim();
        if (text) entries.push({ kind: 'ki', label: beat.regie ?? 'KI-Ergebnis', text });
      }
    });
    return {
      stepNumber: def.stepNumber,
      stepName: def.stepName,
      phase: def.phase,
      phaseLabel: def.phaseLabel,
      entries,
    };
  });
}

/** Flacht das Protokoll zum Eingabetext des Executive-Summary-Prompts (alle 10 Schritte). */
export function buildExecutiveSummaryInput(protocol: ProtocolStep[]): string {
  return protocol
    .map((s) => {
      const body = s.entries.length
        ? s.entries
            .map((e) => (e.kind === 'quote' ? `- ${e.label}: ${e.text}` : `- KI: ${e.text}`))
            .join('\n')
        : '- (keine protokollierten Beats)';
      return `## Schritt ${s.stepNumber}: ${s.stepName} (${s.phaseLabel})\n${body}`;
    })
    .join('\n\n');
}
```

Re-run Task 1 — both tests must go **green**:

```bash
cd website && pnpm vitest run coaching-report --reporter verbose
```

---

## Task 3 — `SessionReport.svelte`: Kopf + Executive-Summary + Protokoll + downloads (new component)

Create `website/src/components/admin/coaching/SessionReport.svelte` (Svelte 5 runes). It is mounted
with `client:load` (it needs `window` for the download + print actions). Props are the completed
session plus the display strings the page already resolves; it imports `STEP_DEFINITIONS` and
`buildProtocol` itself.

- **Kopf:** Titel, Klient, Datum, KI-Provider.
- **Executive Summary:** step 0's `beats[0].aiResponse` (the Claude 5-section summary), rendered in a
  `pre` (`white-space: pre-wrap`) — faithful to today's block.
- **Volles Protokoll:** one block per step with the phase colour on a left border and the `phaseLabel`;
  per entry a `.quote` block (captured Coachee statement, labelled) or a `.ki-box` (accepted KI result).
- **Downloads:** the buttons sit **outside** the exported `reportEl` container. "Als HTML
  herunterladen" wraps `reportEl.innerHTML` in a minimal standalone HTML document and Blob-downloads
  it; "Als PDF speichern" calls `window.print()`. A scoped `@media print` block hides the download bar
  and switches the report to print-friendly light styling with per-step page-break avoidance.

```svelte
<script lang="ts">
  import { STEP_DEFINITIONS } from '../../../lib/coaching-session-prompts';
  import { buildProtocol } from '../../../lib/coaching-report';
  import type { Session } from '../../../lib/coaching-session-db';

  let { session, clientName, providerName }:
    { session: Session; clientName: string; providerName: string } = $props();

  // Phase → hue, mirroring SessionWizard.svelte's PHASE_COLORS (blue/orange/green/purple).
  const PHASE_COLOR: Record<string, string> = {
    problem_ziel: '#3b82f6', analyse: '#f97316', loesung: '#22c55e', umsetzung: '#a855f7',
  };

  const summary = $derived(
    session.steps.find((s) => s.stepNumber === 0)?.beats?.[0]?.aiResponse ?? '',
  );
  const protocol = $derived(buildProtocol(session.steps, STEP_DEFINITIONS));
  const dateLabel = $derived(
    new Date(session.completedAt ?? session.createdAt ?? Date.now()).toLocaleDateString('de-DE'),
  );

  let reportEl: HTMLDivElement;

  function downloadHtml() {
    const inner = reportEl?.innerHTML ?? '';
    const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8">`
      + `<title>Coaching-Bericht — ${session.title}</title>`
      + `<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1.5rem;`
      + `color:#1a1a1a;line-height:1.6}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem}`
      + `.quote{border-left:3px solid #ccc;padding:.5rem 1rem;margin:.75rem 0;font-style:italic}`
      + `.ki-box{background:#f5f5f5;border-radius:8px;padding:.75rem 1rem;margin:.75rem 0}`
      + `pre{white-space:pre-wrap;font-family:inherit}</style></head><body>${inner}</body></html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'coaching-bericht.html'; a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() { window.print(); }
</script>

<div class="report">
  <div class="downloads">
    <button class="btn-secondary" onclick={downloadHtml}>Als HTML herunterladen</button>
    <button class="btn-secondary" onclick={printReport}>Als PDF speichern</button>
  </div>

  <div class="report-doc" bind:this={reportEl}>
    <header class="kopf">
      <h1>{session.title}</h1>
      <dl class="kopf-meta">
        <div><dt>Klient</dt><dd>{clientName}</dd></div>
        <div><dt>Datum</dt><dd>{dateLabel}</dd></div>
        <div><dt>KI-Provider</dt><dd>{providerName}</dd></div>
      </dl>
    </header>

    {#if summary}
      <section class="summary">
        <h2>Executive Summary</h2>
        <pre class="summary-pre">{summary}</pre>
      </section>
    {/if}

    <section class="protokoll">
      <h2>Volles Protokoll</h2>
      {#each protocol as step (step.stepNumber)}
        <div class="proto-step" style={`border-left-color:${PHASE_COLOR[step.phase] ?? '#888'}`}>
          <div class="proto-head">
            <span class="proto-phase" style={`color:${PHASE_COLOR[step.phase] ?? '#888'}`}>{step.phaseLabel}</span>
            <h3 class="proto-title">Schritt {step.stepNumber}: {step.stepName}</h3>
          </div>
          {#if step.entries.length === 0}
            <p class="proto-empty">— keine protokollierten Beats —</p>
          {:else}
            {#each step.entries as entry, i (i)}
              {#if entry.kind === 'quote'}
                <blockquote class="quote"><span class="quote-label">{entry.label}</span>{entry.text}</blockquote>
              {:else}
                <div class="ki-box"><span class="ki-label">{entry.label}</span><p class="ki-text">{entry.text}</p></div>
              {/if}
            {/each}
          {/if}
        </div>
      {/each}
    </section>
  </div>
</div>

<style>
  .report { display: flex; flex-direction: column; gap: 1.25rem; }
  .downloads { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn-secondary { padding: 0.5rem 1rem; border: 1px solid var(--line,#444); border-radius: 6px; color: var(--text-muted,#888); background: transparent; cursor: pointer; font-size: 0.85rem; }
  .report-doc { display: flex; flex-direction: column; gap: 1.5rem; }
  .kopf h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0 0 0.75rem; }
  .kopf-meta { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 0; }
  .kopf-meta dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted,#888); }
  .kopf-meta dd { margin: 0; font-size: 0.9rem; color: var(--text-light,#f0f0f0); }
  .summary h2, .protokoll h2 { font-size: 1.05rem; color: var(--text-light,#f0f0f0); margin: 0 0 0.75rem; }
  .summary-pre { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 1.25rem; color: var(--text-light,#f0f0f0); line-height: 1.7; white-space: pre-wrap; font-family: inherit; margin: 0; }
  .proto-step { border-left: 3px solid #888; padding: 0.75rem 0 0.75rem 1rem; margin-bottom: 1.25rem; }
  .proto-head { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.6rem; }
  .proto-phase { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .proto-title { font-size: 1rem; font-weight: 600; color: var(--text-light,#f0f0f0); margin: 0; }
  .quote { border-left: 3px solid var(--line,#444); margin: 0.6rem 0; padding: 0.4rem 0 0.4rem 0.9rem; font-style: italic; color: var(--text-light,#e8e8e8); }
  .quote-label { display: block; font-style: normal; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted,#888); margin-bottom: 0.25rem; }
  .ki-box { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.6rem 0; }
  .ki-label { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold,#c9a55c); margin-bottom: 0.35rem; }
  .ki-text { margin: 0; color: var(--text-light,#f0f0f0); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; }
  .proto-empty { color: var(--text-muted,#888); font-size: 0.82rem; font-style: italic; }

  @media print {
    .downloads { display: none; }
    .report-doc { color: #111; }
    .kopf h1, .kopf-meta dd, .summary h2, .protokoll h2, .proto-title, .quote, .ki-text { color: #111; }
    .summary-pre, .ki-box { background: #f5f5f5; border-color: #ccc; }
    .proto-step { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
```

<!-- vitest: SessionReport's render/download/print behaviour is covered by the comprehensive component + E2E suite in P4 (tests always last); P3 ships only the coaching-report builder anchor (Task 1). The pure logic it renders is fully unit-tested via coaching-report.test.ts. -->

---

## Task 4 — `[id].astro`: mount `SessionReport`, drop the `<pre>`, add print CSS

Rewire the completed-session branch of `website/src/pages/admin/coaching/sessions/[id].astro` from the
inline `<pre>{report.aiResponse}</pre>` to the extracted component, and delete the now-unused inline
blob-download `<script>` (it moved into `SessionReport.svelte`). The page keeps its auth/meta/audit
logic untouched.

### 4a — frontmatter: import + completion flag (replaces the old `report` lookup)

```astro
import SessionReport from '../../../../components/admin/coaching/SessionReport.svelte';
```

Replace the old `report` derivation (which read step 0's removed `aiResponse` flat field) with a plain
completion flag; the report's summary text is now read inside the component from step 0's `beats`:

```astro
const isCompleted = coachingSession.status === 'completed';
```

The already-computed `displayClient` and `displayKi` strings feed the component.

### 4b — markup: branch on `isCompleted`, mount the component

```astro
{!isCompleted && <a id="popout-link" href={`/admin/coaching/sessions/${id}/popout`} class="popout-link">Popout ↗</a>}
```

```astro
{isCompleted ? (
  <SessionReport
    session={coachingSession}
    clientName={displayClient}
    providerName={displayKi}
    client:load
  />
) : (
  <SessionWizard
    sessionId={id}
    initialSession={coachingSession}
    providerName={kiProviders.find(p => p.id === coachingSession.kiConfigId)?.provider ?? kiProviders.find(p => p.isActive)?.provider ?? 'claude'}
    client:load
  />
)}
```

### 4c — remove the inline download handler; add page-level print CSS

Delete the `download-btn` click handler from the page `<script>` (the download lives in the component
now) and remove the report-only styles (`.report`, `.report-head`, `.report-body`, `.report-pre`).
Add a scoped `@media print` block so printing shows only the report — the page-owned chrome
(breadcrumbs, the Session-Info edit box, the audit log) is hidden. Because these elements carry
`[id].astro`'s scope hash while `SessionReport`'s own root does not, scoped print rules hide the chrome
and leave the report visible:

```astro
<style>
  @media print {
    .crumbs, .meta-edit-box { display: none !important; }
    .page { max-width: none; padding: 0; }
  }
</style>
```

The audit-log block uses Tailwind utility classes; add `print:hidden` to its wrapper `div` so it is
hidden alongside the other chrome. After the edit, confirm the removed flat-field read and the old
download handler are gone and the file is under budget:

```bash
cd website && ! grep -nE 'report\.aiResponse|download-btn' src/pages/admin/coaching/sessions/'[id]'.astro
wc -l src/pages/admin/coaching/sessions/'[id]'.astro   # est. ~250, must stay < 400 (budget 140)
```

---

## Task 5 — `complete.ts`: build the Executive-Summary input from the beats protocol

Migrate `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` off P1's removed flat fields.
The system prompt (the 5-section `## Ausgangslage / ## Analyse / ## Lösungsansatz / ## Vereinbarte
Schritte / ## Bewertung` instruction) and the Claude call stay exactly as today — only the **user
message** is now assembled from the full `beats` protocol.

### 5a — imports

```ts
import { buildProtocol, buildExecutiveSummaryInput } from '../../../../../../lib/coaching-report';
import { STEP_DEFINITIONS } from '../../../../../../lib/coaching-session-prompts';
```

### 5b — idempotency branch reads step 0's beats (not the removed `aiResponse`)

The existing "already-generated report" short-circuit read `s.stepNumber === 0 && s.aiResponse`; after
P1 the report lives in step 0's `beats[0].aiResponse`:

```ts
const existingReport = coachingSession.steps.find((s) => s.stepNumber === 0);
const existingReportText = existingReport?.beats?.[0]?.aiResponse ?? null;
if (existingReportText) {
  await completeSession(pool, sessionId, existingReportText);
  return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
}
```

### 5c — user message from the protocol (replaces the old flat-field `stepsText`)

The old block mapped `s.coachInputs`/`s.aiResponse`/`s.coachNotes` per step. Replace it with the shared
builder — one line, all 10 steps, every captured statement and accepted KI result:

```ts
const stepsText = buildExecutiveSummaryInput(buildProtocol(coachingSession.steps, STEP_DEFINITIONS));
```

`stepsText` is then passed unchanged as the Claude user message (`messages: [{ role: 'user', content:
stepsText }]`). The `system` prompt, model resolution, `max_tokens`, the `TextBlock` filter, and the
final `completeSession(pool, sessionId, report)` write are all untouched. Confirm no removed flat-field
name survives:

```bash
cd website && ! grep -nE 'coachInputs|coachNotes|\.aiResponse|s\.aiResponse' src/pages/api/admin/coaching/sessions/'[id]'/complete.ts
```

---

## Task 6 — Verify (mandatory gates)

Run, in order, and confirm each passes before handing off to P4:

```bash
# 1. anchor test green (Task 1/2) — proves the protocol builder covers all 10 steps
cd website && pnpm vitest run coaching-report --reporter verbose

# 2. no new explicit any in the touched website/src files (CQ02 ≤ 200 global)
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"

# 3. regenerate generated artefacts (test-inventory for the new test, repo-index, …)
task test:inventory
task freshness:regenerate

# 4. mandatory CI-equivalent gates
task test:changed          # website vitest --changed (node + components) + domain BATS + quality
task freshness:check       # freshness + quality:check (S1–S4 ratchet)
```

- `task freshness:check` is the load-bearing S1 gate for P3: the new `SessionReport.svelte` must stay
  under its 500-line `.svelte` limit (est. ~195), `coaching-report.ts` under 600, and the rewritten
  `[id].astro` must stay under its 400-line limit (it shrinks net after the extraction). S2 stays clean
  because `coaching-report.ts` imports only P1 types + `STEP_DEFINITIONS` (no back-edge to DB/API
  layers). No `*.mentolder.de`/`*.korczewski.de` literal (S3), no new `scripts/*`/`k3d/*` (S4).
- Commit the regenerated `website/src/data/test-inventory.json` alongside the code (CI fails on drift).
- The full `task test:changed` green across every coaching test (report render, download/print, E2E,
  `session-history` migration) lands with **P4**; P3's own `coaching-report` anchor is green here.
