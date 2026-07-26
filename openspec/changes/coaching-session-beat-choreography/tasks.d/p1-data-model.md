---
title: "coaching-session-beat-choreography — P1 data-model"
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan (P1: data-model)

This is Partial **P1 (data-model)** of 4: **P1 data-model → P2 wizard-ui → P3 export → P4 tests**.
P1 owns the pure data layer: the `Beat` discriminated union, all 10 `STEP_DEFINITIONS` as beat
sequences, the 4 Textbaustein constants, the beat-level prompt helpers, and the `BeatState`
persistence shape. P2/P3/P4 build on the exact exports frozen here.

## File Structure

Existing files carry their **verified effective S1 budget** (both `nicht-baselined` → budget =
`.ts` limit 600 − current lines). New files are cut small with growth reserve under the 600-line
`.ts` limit.

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/lib/coaching-session-prompts.ts` | 226 | 374 |
| `website/src/lib/coaching-session-db.ts` | 478 | 122 |
| `website/src/lib/coaching-session-prompts.test.ts` | 104 | 496 |

New files created in this partial (`.ts` limit 600 each; not yet baselined):

| `path` | est. lines | limit |
|--------|-----------|-------|
| `website/src/lib/coaching-session-beats.ts` | ~430 | 600 |
| `website/src/lib/coaching-textbausteine.ts` | ~70 | 600 |
| `website/src/lib/coaching-session-beats-db.ts` | ~55 | 600 |

### File-split decision (S1) — why three modules, not one

`coaching-session-prompts.ts` today is 226 lines with a **374-line** budget. Ten fully-authored
steps, each a 3–6 beat sequence carrying multi-line German Coach-Regie + KI-Prompt copy, plus 4
Textbaustein paragraphs, would push a single file well past the 600-line `.ts` limit. So P1 performs
a **real split** into an acyclic module graph (madge `--circular` is the S2 gate; edges below are
strictly one-directional, no back-edges even for `import type`, because `verbatimModuleSyntax: true`
is set in `website/tsconfig.json` but madge still counts type edges — the graph is acyclic regardless):

```
coaching-textbausteine.ts        (leaf: BASE_SYSTEM + 4 Textbaustein string consts, no imports)
        ▲
coaching-session-beats.ts        (Beat/StepDefinition TYPES + STEP_DEFINITIONS; imports only textbausteine)
        ▲
coaching-session-prompts.ts      (thin FACADE: re-exports types + STEP_DEFINITIONS from beats; beat helpers)
        ▲
   consumers (P2 SessionWizard.svelte, generate.ts, complete.ts, session-tools.ts, …)

coaching-session-beats-db.ts     (leaf: BeatState type + serializeBeats/deserializeBeats)
        ▲
coaching-session-db.ts           (SessionStep.beats; DB read/write; imports only beats-db helper)
```

The **types live in `coaching-session-beats.ts` next to the data** (not in the facade) so the facade
can `import`/re-export from beats without beats needing any import back — that is what keeps the graph
strictly one-directional. Consumers keep their existing import specifier
(`from '.../lib/coaching-session-prompts'`): the facade re-exports every public name, so no consumer
import path changes. `coaching-session-db.ts` sits at 478/600 (79.7 % of its threshold) — already at
the "plan the split" line — so its `BeatState` type and JSONB (de)serialization are **extracted** into
the pure `coaching-session-beats-db.ts` leaf instead of appended, keeping db.ts net-neutral.

### Cross-partial contract (what P1 freezes for P2/P3/P4)

P1 changes the exported **type shapes**. The app-layer readers of the old flat fields
(`SessionWizard.svelte`, `steps/[n]/generate.ts`, `complete.ts`, `session-tools.ts`,
`session-history.ts`) and the comprehensive test migration are **out of P1's scope** and are updated by
their owning partials (P2 wizard-ui / P3 export / P4 tests). P1 therefore touches only the 5 lib
modules above plus **one** minimal red test appended to the existing `coaching-session-prompts.test.ts`
(Task 1). The full `task test:changed` sweep across the whole coaching test set goes green at **P4**
(tests always last); P1's own new red test goes green within P1, and `task freshness:check` (S1–S4
line/cycle/hostname/orphan ratchet — no typecheck, no test run) is green at P1. This staging matches
the orchestrator's "P4 = tests" plan.

The frozen public API other partials build on:

- `type Beat = InstructionBeat | KiPromptBeat`, `StepDefinition.beats: Beat[]`,
  `KiPromptBeat.inputs: StepInput[]` with `StepInput.prefillFromPrevKiResponse?: boolean`
  (the "Ich übernehme mit folgenden Modifikationen" UI-prefill marker — P2 reads it).
- `userTemplate` placeholders: `{key}` (own inputs) and `{capturedFrom:INDEX}` (read-only injection
  of a prior `InstructionBeat.captured`).
- `getStepDef(n)`, `getBeat(n, beatIndex)`, `isKiPromptBeat(beat)`,
  `buildUserPrompt(beat, inputs, priorCaptures)`.
- `interface BeatState { beatIndex; captured?; inputs?; aiResponse?; status }` + `serializeBeats` /
  `deserializeBeats` (JSONB round-trip through the existing `coach_inputs` column).

---

## Task 1 — Red test: freeze the `Beat` / `STEP_DEFINITIONS` shape (FAIL first)

Append a new `describe` block to the **existing** `website/src/lib/coaching-session-prompts.test.ts`
(do not create a new test file — comprehensive beat-invariant + persistence tests are P4). This is the
red→green anchor for the whole partial.

```ts
// append to website/src/lib/coaching-session-prompts.test.ts
describe('Beat model (P1)', () => {
  it('step 1 exposes a non-empty beats sequence', () => {
    expect(STEP_DEFINITIONS[0].beats.length).toBeGreaterThan(0);
  });

  it('every step has at least one ki_prompt beat', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.beats.some((b) => b.kind === 'ki_prompt')).toBe(true);
    }
  });
});
```

Run it targeted (the surrounding legacy assertions in this file still reference the old flat shape and
are migrated in P4 — run only the new block here):

```bash
cd website && pnpm vitest run coaching-session-prompts -t 'Beat model' --reporter verbose
```

**expected: FAIL** — `STEP_DEFINITIONS[0].beats` is `undefined` (property does not exist yet) →
`Cannot read properties of undefined (reading 'length')`. Tasks 2–4 make it pass.

---

## Task 2 — `coaching-textbausteine.ts`: BASE_SYSTEM + 4 Textbaustein constants (new leaf)

Create `website/src/lib/coaching-textbausteine.ts` as a pure, import-free leaf module. It holds the
shared system preamble (moved out of prompts.ts) and the 4 named Methodik-Textbausteine that steps
5/6/7/10 embed into their `ki_prompt` beats' `systemPrompt`.

```ts
// website/src/lib/coaching-textbausteine.ts
// Reine String-Konstanten der Coaching-Methodik (Triadisches KI-Coaching nach Geißler).
// S2-Leaf: kein Import, keine Laufzeit-Abhängigkeit.

export const BASE_SYSTEM = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Der Coach schickt dir — im Namen des Coachee, in der Ich-Form — die protokollierten Aussagen aus der Live-Sitzung.
Antworte präzise, wertschätzend und handlungsorientiert. Sprache: Deutsch. Maximal 300 Wörter.
Kein wörtliches Buchzitat, keine allgemeinen Ratschläge — immer konkret zur geschilderten Situation.`;

export const TB_TEUFELSKREISLAUF = `TEXTBAUSTEIN „Teufelskreislauf": Ein Teufelskreislauf beschreibt, wie ein Auslöser
einen belastenden Schlüsselaffekt aktiviert, der zu einer automatischen (oft selbstschützenden) Reaktion führt,
deren Konsequenz genau den Auslöser verstärkt — das Muster hält sich selbst am Leben. Rekonstruiere ihn als
geschlossenen Kreis (Auslöser → Schlüsselaffekt → Reaktion → Konsequenz → zurück zum Auslöser) und benenne die
Stelle, an der die geringste Kraft die größte Wirkung zum Aussteigen hätte.`;

export const TB_AUSBALANCIERUNGSPROBLEME = `TEXTBAUSTEIN „Ausbalancierungsprobleme": Hinter einem Teufelskreislauf
steht meist ein unausbalanciertes Gegensatzpaar (z. B. Nähe ↔ Autonomie, Kontrolle ↔ Vertrauen, Anpassung ↔
Selbstbehauptung). Ein Pol wird überbetont, sein Komplement verkümmert. Benenne das zugrunde liegende
Gegensatzpaar, zeige den überbetonten und den vernachlässigten Pol und beschreibe die Ausbalancierungsaufgabe.`;

export const TB_KOMPLEMENTAERKRAEFTE = `TEXTBAUSTEIN „Komplementärkräfte": Komplementärkräfte sind die im Coachee
bereits angelegten, aber unterentwickelten Gegenkräfte zum überbetonten Pol. Sie sind Ressource, nicht Defizit.
Identifiziere die konkreten Komplementärkräfte, die dem Coachee zum Ausbalancieren fehlen bzw. schon in Ansätzen
vorhanden sind, und wie sie sich im Alltag zeigen würden.`;

export const TB_ERFOLGSFAKTOREN = `TEXTBAUSTEIN „Erfolgsfaktoren": Erfolgsfaktoren sind die verallgemeinerbaren
Bedingungen, unter denen dem Coachee ein Schritt tatsächlich gelungen ist (Erfolgserlebnis) — im Kontrast zu den
Bedingungen eines Misserfolgs. Extrahiere aus dem geschilderten Erfolgs- und Misserfolgserlebnis die konkreten,
übertragbaren Erfolgsfaktoren und formuliere sie als Lernpunkte für künftige Umsetzungsschritte.`;
```

---

## Task 3 — `coaching-session-beats.ts`: Beat types + all 10 STEP_DEFINITIONS (new)

Create `website/src/lib/coaching-session-beats.ts`. It **defines** the beat types and the full
`STEP_DEFINITIONS` array, importing only from `coaching-textbausteine.ts`. Author the beat sequences
exactly per design.md "Die 10 Schritte als Beat-Sequenzen" (10 rows, phases A–D). Textbausteine are
embedded into steps 5/6/7/10.

### 3a — Types

```ts
// website/src/lib/coaching-session-beats.ts
import {
  BASE_SYSTEM,
  TB_TEUFELSKREISLAUF,
  TB_AUSBALANCIERUNGSPROBLEME,
  TB_KOMPLEMENTAERKRAEFTE,
  TB_ERFOLGSFAKTOREN,
} from './coaching-textbausteine';

export type Phase = 'problem_ziel' | 'analyse' | 'loesung' | 'umsetzung';

export interface StepInput {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
  /** UI-Vorbefüllung: dieses Feld wird mit der akzeptierten aiResponse des vorigen
   *  ki_prompt-Beats vorbefüllt (aktiv editierbar) — bildet das "Ich übernehme mit
   *  folgenden Modifikationen"-Muster ab. Ausgewertet von P2 (SessionWizard). */
  prefillFromPrevKiResponse?: boolean;
}

export interface InstructionBeat {
  kind: 'instruction';
  /** Regieanweisung: was der Coach jetzt live mit dem Coachee tut (kein KI-Call). */
  regie: string;
  /** Optional: Freitext-Erfassung der Coachee-Aussage; liefert Kontext für spätere Beats. */
  capture?: { key: string; label: string };
}

export interface KiPromptBeat {
  kind: 'ki_prompt';
  /** Kurzer Kontext-Hinweis überm Prompt. */
  regie?: string;
  inputs: StepInput[];
  /** Kann Textbaustein-Konstanten einbetten. */
  systemPrompt: string;
  /** Platzhalter: {key} für eigene inputs, {capturedFrom:INDEX} für read-only-Einsetzung
   *  des captured-Texts des InstructionBeat mit Index INDEX im selben Schritt. */
  userTemplate: string;
}

export type Beat = InstructionBeat | KiPromptBeat;

export interface StepDefinition {
  stepNumber: number;
  stepName: string;
  phase: Phase;
  phaseLabel: string;
  description: string;
  beats: Beat[];
}
```

### 3b — STEP_DEFINITIONS (all 10, authored in full — no placeholders)

```ts
export const STEP_DEFINITIONS: StepDefinition[] = [
  // ── Phase A: Problem- & Zielbeschreibung ──────────────────────────────
  {
    stepNumber: 1,
    stepName: 'Erste Problem- und Zielbeschreibung',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Rahmen setzen, Ist- und Soll-Zustand vom Coachee erzählen lassen und der KI übergeben.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Begrüße den Coachee, stelle mit etwas Small Talk eine tragfähige Arbeitsbeziehung her und erkläre kurz den Ablauf des triadischen KI-Coachings (Coach ↔ Coachee ↔ KI, Bildschirm wird geteilt).',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee in Ruhe schildern, was ihn herführt: den belastenden Ist-Zustand und den gewünschten Soll-Zustand. Protokolliere die Erzählung möglichst in seinen eigenen Worten.',
        capture: { key: 'ist_soll', label: 'Ist- und Soll-Zustand (in Worten des Coachee)' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übergib die protokollierte Ist/Soll-Erzählung an die KI.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich schildere dir mein Anliegen. Ist-Zustand und gewünschter Soll-Zustand:
{capturedFrom:1}

Bitte spiegle mir in wenigen Sätzen wertschätzend zurück, was du als meinen Kern-Konflikt und mein Ziel verstehst, und stelle mir eine vertiefende Rückfrage.`,
      },
    ],
  },
  {
    stepNumber: 2,
    stepName: 'Fokussierung Schlüsselsituation / Schlüsselaffekt',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Reaktion des Coachee, Exploration der Schlüsselsituation, strukturierter 4-Aspekte-Bericht und Modifikations-Loop.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies dem Coachee die KI-Rückmeldung vor und erfasse seine Reaktion darauf (Zustimmung, Korrektur, Ergänzung).',
        capture: { key: 'reaktion_1', label: 'Reaktion des Coachee auf die KI-Spiegelung' },
      },
      {
        kind: 'instruction',
        regie: 'Exploriere gemeinsam die eine Schlüsselsituation, in der das Problem besonders deutlich wird, und den dabei auftretenden Schlüsselaffekt (das stärkste Gefühl). Protokolliere Situation und Affekt.',
        capture: { key: 'schluesselsituation', label: 'Schlüsselsituation und Schlüsselaffekt' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Fordere von der KI einen strukturierten Bericht in 4 Aspekten an.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf deine Spiegelung: {capturedFrom:0}

Hier meine Schlüsselsituation und der Schlüsselaffekt darin:
{capturedFrom:1}

Bitte fasse das strukturiert in vier Aspekten zusammen: (1) auslösende Situation, (2) Schlüsselaffekt, (3) meine automatische Reaktion, (4) die unerwünschte Konsequenz.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies den 4-Aspekte-Bericht vor und erfasse, wo der Coachee zustimmt oder etwas anders sieht.',
        capture: { key: 'reaktion_2', label: 'Reaktion auf den 4-Aspekte-Bericht' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen: das Eingabefeld ist mit dem KI-Bericht vorbefüllt und wird vom Coachee angepasst.',
        inputs: [
          { key: 'modifikationen', label: 'Übernommener/angepasster 4-Aspekte-Bericht', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank für deine Ausführungen. Ich übernehme mit folgenden Modifikationen:
{modifikationen}

Bitte bestätige den so präzisierten Kern und halte ihn als Arbeitsgrundlage fest.`,
      },
    ],
  },
  {
    stepNumber: 3,
    stepName: 'Präzisierung Schlüsselaffekt (Bildarbeit)',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Immersive Bildarbeit zum Schlüsselaffekt: Bild wählen lassen, verbal beschreiben, Querverbindung ziehen, Modifikations-Loop. Kein Bild-Upload — nur Freitext.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Zeige dem Coachee die vorbereitete Bildauswahl (geteilter Bildschirm) und lass ihn ohne Erklärung intuitiv das Bild wählen, das seinem Schlüsselaffekt am nächsten kommt. Führe eine kurze immersive Bildbetrachtung durch.',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee das gewählte Bild und was es in ihm auslöst mit eigenen Worten beschreiben. Die KI bekommt nie das Bild selbst, nur diese verbale Beschreibung.',
        capture: { key: 'bildbeschreibung', label: 'Beschreibung des gewählten Bildes und der ausgelösten Empfindung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Lass die KI eine Querverbindung zwischen Bild und Schlüsselaffekt ziehen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich habe zu meinem Schlüsselaffekt intuitiv ein Bild gewählt und beschreibe es so:
{capturedFrom:1}

Bitte ziehe die Querverbindung zwischen diesem Bild und meinem Schlüsselaffekt und formuliere den Affekt dadurch präziser.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies die präzisierte Affektbeschreibung vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die präzisierte Affektbeschreibung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommener/angepasster präzisierter Schlüsselaffekt', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich übernehme meinen präzisierten Schlüsselaffekt mit folgenden Modifikationen:
{modifikationen}

Bitte halte diesen präzisierten Schlüsselaffekt als Arbeitsgrundlage fest.`,
      },
    ],
  },
  {
    stepNumber: 4,
    stepName: 'Präzisierung Coachingziel (Bildarbeit)',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Analog zu Schritt 3, aber für ein Ziel-Bild: das gewünschte Ziel über immersive Bildarbeit präzisieren. Kein Bild-Upload — nur Freitext.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Zeige erneut die Bildauswahl und lass den Coachee intuitiv das Bild wählen, das seinem gewünschten Ziel-Zustand am nächsten kommt. Kurze immersive Bildbetrachtung.',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee das Ziel-Bild und den darin liegenden Wunsch-Zustand verbal beschreiben.',
        capture: { key: 'zielbild', label: 'Beschreibung des Ziel-Bildes und des Wunsch-Zustands' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Lass die KI die Querverbindung zwischen Ziel-Bild und Coachingziel ziehen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Zu meinem gewünschten Ziel-Zustand habe ich intuitiv dieses Bild gewählt und beschreibe es so:
{capturedFrom:1}

Bitte ziehe die Querverbindung zwischen diesem Bild und meinem Ziel und formuliere mein Coachingziel dadurch präziser und motivierender.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies das präzisierte Ziel vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf das präzisierte Coachingziel' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommenes/angepasstes präzisiertes Coachingziel', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich übernehme mein präzisiertes Coachingziel mit folgenden Modifikationen:
{modifikationen}

Bitte halte dieses präzisierte Coachingziel als Arbeitsgrundlage fest.`,
      },
    ],
  },
  // ── Phase B: Problemanalyse / Lösungsstrategie-Umriss ─────────────────
  {
    stepNumber: 5,
    stepName: 'Rekonstruktion Teufelskreislauf (Aufstellungsarbeit)',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Konzept "Inneres Team" einführen, Tiefeninterview-Transkript erfassen, Konzept "Teufelskreislauf" einführen, KI rekonstruiert den Kreislauf mit Textbaustein.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Erkläre dem Coachee das Konzept des "Inneren Teams": die widerstreitenden inneren Anteile, die in der Schlüsselsituation aktiv sind. Führe ein kurzes Tiefeninterview mit den beteiligten Anteilen.',
      },
      {
        kind: 'instruction',
        regie: 'Protokolliere das Tiefeninterview möglichst wörtlich (großes Freitextfeld): welche inneren Anteile melden sich, was sagt jeder, was befürchtet/will er.',
        capture: { key: 'tiefeninterview', label: 'Tiefeninterview-Transkript (Innere-Team-Anteile)' },
      },
      {
        kind: 'instruction',
        regie: 'Erkläre dem Coachee das Konzept "Teufelskreislauf" (Auslöser → Schlüsselaffekt → Reaktion → verstärkende Konsequenz) und kündige an, dass die KI ihn nun rekonstruiert.',
      },
      {
        kind: 'ki_prompt',
        regie: 'KI rekonstruiert den Teufelskreislauf aus dem Tiefeninterview.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_TEUFELSKREISLAUF}`,
        userTemplate: `Hier das Transkript meines inneren Tiefeninterviews zur Schlüsselsituation:
{capturedFrom:1}

Bitte rekonstruiere daraus meinen Teufelskreislauf als geschlossenen Kreis und benenne die Ausstiegsstelle mit der größten Hebelwirkung.`,
      },
    ],
  },
  {
    stepNumber: 6,
    stepName: 'Ausbalancierungsprobleme',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Reaktion/Rückfragen erfassen, KI leitet das zugrunde liegende Ausbalancierungsproblem her (mit Textbaustein).',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies dem Coachee die Teufelskreislauf-Rekonstruktion vor und erfasse seine Reaktion und Rückfragen.',
        capture: { key: 'reaktion', label: 'Reaktion und Rückfragen zum Teufelskreislauf' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI leitet das Ausbalancierungsproblem her.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_AUSBALANCIERUNGSPROBLEME}`,
        userTemplate: `Meine Reaktion auf den rekonstruierten Teufelskreislauf: {capturedFrom:0}

Bitte leite daraus das zugrunde liegende Ausbalancierungsproblem her: welches Gegensatzpaar ist bei mir unausbalanciert, welcher Pol ist überbetont, welcher vernachlässigt?`,
      },
    ],
  },
  {
    stepNumber: 7,
    stepName: 'Komplementärkräfte',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Reaktion + Bestätigung von 2–4 Kernproblemen erfassen, KI benennt die fehlenden/angelegten Komplementärkräfte (mit Textbaustein).',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies das Ausbalancierungsproblem vor und lass den Coachee 2–4 daraus abgeleitete Kernprobleme bestätigen oder anpassen.',
        capture: { key: 'kernprobleme', label: 'Reaktion und bestätigte 2–4 Kernprobleme' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI benennt die Komplementärkräfte.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_KOMPLEMENTAERKRAEFTE}`,
        userTemplate: `Meine bestätigten Kernprobleme aus dem Ausbalancierungsproblem:
{capturedFrom:0}

Bitte benenne die konkreten Komplementärkräfte, die mir zum Ausbalancieren fehlen bzw. schon in Ansätzen vorhanden sind, und wie sie sich in meinem Alltag zeigen würden.`,
      },
    ],
  },
  // ── Phase C: Konkretisierung der Lösungsstrategie ─────────────────────
  {
    stepNumber: 8,
    stepName: 'Erfolgsimagination',
    phase: 'loesung',
    phaseLabel: 'Phase C: Lösung',
    description: 'Reaktion erfassen, KI liefert Goldstücks-Satz + 2 unterschiedliche Erfolgsimaginationen, Coachee wählt Variante + Änderungswünsche, KI übernimmt Modifikationen.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies die Komplementärkräfte vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die Komplementärkräfte' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI liefert einen Goldstücks-Satz und zwei unterschiedliche Erfolgsimaginationen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf die benannten Komplementärkräfte: {capturedFrom:0}

Bitte formuliere (1) einen prägnanten "Goldstücks-Satz", der meine aktivierte Komplementärkraft auf den Punkt bringt, und (2) zwei deutlich unterschiedliche, bildhafte Erfolgsimaginationen, wie mein gelingender Ziel-Zustand konkret aussieht.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies beide Erfolgsimaginationen vor. Lass den Coachee eine Variante wählen und seine Änderungswünsche nennen.',
        capture: { key: 'variantenwahl', label: 'Gewählte Erfolgsimagination + Änderungswünsche' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI übernimmt die gewählte Variante mit Modifikationen (vorbefüllt aus der vorigen KI-Antwort).',
        inputs: [
          { key: 'modifikationen', label: 'Gewählte/angepasste Erfolgsimagination', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich wähle eine Erfolgsimagination und übernehme sie mit folgenden Modifikationen:
{modifikationen}

Bitte halte diese eine, verbindliche Erfolgsimagination als Zielbild fest.`,
      },
    ],
  },
  // ── Phase D: Umsetzungsunterstützung ──────────────────────────────────
  {
    stepNumber: 9,
    stepName: 'Nächste Aktivitäten',
    phase: 'umsetzung',
    phaseLabel: 'Phase D: Umsetzung',
    description: 'Reaktion erfassen, KI schlägt 3 konkrete Problemlösungshandlungen vor, Coachee-Planung wird ohne KI-Kommentar gespeichert.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies das verbindliche Zielbild vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf das verbindliche Zielbild' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI schlägt drei konkrete nächste Problemlösungshandlungen vor.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf mein Zielbild: {capturedFrom:0}

Bitte schlage mir drei konkrete, überschaubare nächste Problemlösungshandlungen vor, mit denen ich meine Komplementärkraft im Alltag erprobe. Jeweils eine Handlung pro Absatz.`,
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee seine eigene Umsetzungsplanung zu diesen Handlungen formulieren. Diese Planung wird ohne KI-Kommentar gespeichert.',
        capture: { key: 'coachee_planung', label: 'Umsetzungsplanung des Coachee (ohne KI-Kommentar gespeichert)' },
      },
    ],
  },
  {
    stepNumber: 10,
    stepName: 'Umsetzungsunterstützung',
    phase: 'umsetzung',
    phaseLabel: 'Phase D: Umsetzung',
    description: 'Erfolgs- und Misserfolgserlebnis erfassen, KI extrahiert Lernpunkte (Textbausteine Erfolgsfaktoren + Komplementärkräfte), Coachee reagiert, KI übernimmt Modifikationen ohne Kommentar.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Frage den Coachee (Folgesitzung) nach einem konkreten Erfolgserlebnis bei der Umsetzung und protokolliere es.',
        capture: { key: 'erfolgserlebnis', label: 'Konkretes Erfolgserlebnis bei der Umsetzung' },
      },
      {
        kind: 'instruction',
        regie: 'Frage nach einem konkreten Misserfolgserlebnis bei der Umsetzung und protokolliere es.',
        capture: { key: 'misserfolgserlebnis', label: 'Konkretes Misserfolgserlebnis bei der Umsetzung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI extrahiert übertragbare Lernpunkte aus Erfolg und Misserfolg.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_ERFOLGSFAKTOREN}\n\n${TB_KOMPLEMENTAERKRAEFTE}`,
        userTemplate: `Mein Erfolgserlebnis bei der Umsetzung: {capturedFrom:0}
Mein Misserfolgserlebnis bei der Umsetzung: {capturedFrom:1}

Bitte extrahiere daraus meine übertragbaren Erfolgsfaktoren und die dabei wirksamen Komplementärkräfte und formuliere sie als konkrete Lernpunkte für meine weiteren Umsetzungsschritte.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies die Lernpunkte vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die Lernpunkte' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI übernimmt die Modifikationen ohne weiteren Kommentar (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommene/angepasste Lernpunkte', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich übernehme meine Lernpunkte mit folgenden Modifikationen:
{modifikationen}

Bitte speichere diese Lernpunkte unkommentiert als Abschluss meiner Umsetzungsunterstützung.`,
      },
    ],
  },
];
```

> Note the two distinct reuse mechanisms, both exercised above: **Template-Platzhalter**
> `{capturedFrom:INDEX}` (read-only injection of an earlier `InstructionBeat.captured`, e.g. step 1
> beat index 1 → the final `ki_prompt`) vs. **UI-Vorbefüllung** via `prefillFromPrevKiResponse: true`
> on a `StepInput` (the editable "Ich übernehme mit folgenden Modifikationen" field — rendered by P2).

---

## Task 4 — `coaching-session-prompts.ts`: reshape into facade + beat-level helpers

Rewrite `website/src/lib/coaching-session-prompts.ts` (226 → ~55 lines) as the public facade. It
re-exports the types and `STEP_DEFINITIONS` from `coaching-session-beats.ts` (so every existing
consumer import specifier keeps resolving) and exposes the beat-level helpers. `getStepDef` keeps its
signature; `buildUserPrompt` moves to **beat level** and gains `priorCaptures`.

```ts
// website/src/lib/coaching-session-prompts.ts
// Öffentliche Fassade des Coaching-Beat-Modells: Typen + STEP_DEFINITIONS (aus
// coaching-session-beats) plus Beat-Helfer. Consumer importieren weiterhin von hier.
export type {
  Phase,
  StepInput,
  InstructionBeat,
  KiPromptBeat,
  Beat,
  StepDefinition,
} from './coaching-session-beats';

import type { StepDefinition, Beat, KiPromptBeat } from './coaching-session-beats';
import { STEP_DEFINITIONS } from './coaching-session-beats';

export { STEP_DEFINITIONS };

export function getStepDef(stepNumber: number): StepDefinition {
  const def = STEP_DEFINITIONS.find((s) => s.stepNumber === stepNumber);
  if (!def) throw new Error(`Step ${stepNumber} not found`);
  return def;
}

export function getBeat(stepNumber: number, beatIndex: number): Beat {
  const beat = getStepDef(stepNumber).beats[beatIndex];
  if (!beat) throw new Error(`Beat ${beatIndex} of step ${stepNumber} not found`);
  return beat;
}

export function isKiPromptBeat(beat: Beat): beat is KiPromptBeat {
  return beat.kind === 'ki_prompt';
}

/**
 * Baut den User-Prompt eines ki_prompt-Beats:
 *  - {capturedFrom:INDEX} → read-only-Einsetzung des captured-Texts (priorCaptures[INDEX]),
 *  - {key} → eigene inputs.
 * capturedFrom zuerst ersetzen (INDEX enthält ':' und wird von \w nicht erfasst — Reihenfolge
 * dennoch explizit, damit keine Teilstrings kollidieren).
 */
export function buildUserPrompt(
  beat: KiPromptBeat,
  inputs: Record<string, string>,
  priorCaptures: Record<number, string> = {},
): string {
  return beat.userTemplate
    .replace(/\{capturedFrom:(\d+)\}/g, (_m, idx) => priorCaptures[Number(idx)] ?? '—')
    .replace(/\{(\w+)\}/g, (_m, key) => inputs[key] ?? '—');
}
```

Now re-run Task 1's targeted test — it must go **green**:

```bash
cd website && pnpm vitest run coaching-session-prompts -t 'Beat model' --reporter verbose
```

---

## Task 5 — `coaching-session-beats-db.ts`: BeatState + JSONB (de)serialization (new leaf)

Create `website/src/lib/coaching-session-beats-db.ts` as a pure leaf so the `BeatState` persistence
logic does not push `coaching-session-db.ts` (478/600, budget 122) over its S1 threshold.

```ts
// website/src/lib/coaching-session-beats-db.ts
// Reine Serialisierungs-Helfer für die BeatState-Persistenz. BeatState[] wird in der
// bestehenden JSONB-Spalte coaching.session_steps.coach_inputs abgelegt (kein Schema-Change).
// S2-Leaf: kein Import aus db-/api-Schichten.

export interface BeatState {
  beatIndex: number;
  captured?: string;
  inputs?: Record<string, string>;
  aiResponse?: string | null;
  status: 'pending' | 'seen' | 'generated' | 'accepted' | 'skipped';
}

/** BeatState[] → JSON-String für die coach_inputs-JSONB-Spalte. */
export function serializeBeats(beats: BeatState[] | undefined): string {
  return JSON.stringify(beats ?? []);
}

/** JSONB-Wert (Array oder JSON-String) → BeatState[]; toleriert Alt-/Leerdaten. */
export function deserializeBeats(raw: unknown): BeatState[] {
  if (Array.isArray(raw)) return raw as BeatState[];
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as BeatState[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
```

---

## Task 6 — `coaching-session-db.ts`: SessionStep → `beats`, read/write functions

Rewrite the step type and every function that touches the removed flat fields. The Postgres columns
stay identical (JSONB `coach_inputs` now carries the `BeatState[]`; `ai_prompt`/`ai_response`/
`coach_notes` are written `NULL` for beat steps). No schema migration, no data migration (design.md
Out-of-Scope: no real sessions in the old format).

### 6a — imports + `SessionStep`

```ts
// add at top of coaching-session-db.ts
import type { BeatState } from './coaching-session-beats-db';
import { serializeBeats, deserializeBeats } from './coaching-session-beats-db';
```

```ts
// replace the SessionStep interface body
export interface SessionStep {
  id: string;
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  beats: BeatState[];                       // ← ersetzt coachInputs/aiPrompt/aiResponse/coachNotes
  status: 'pending' | 'generated' | 'accepted' | 'skipped';
  generatedAt: Date | null;
}
```

### 6b — `UpsertStepArgs` + `rowToStep`

```ts
interface UpsertStepArgs {
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  beats?: BeatState[];                       // ← ersetzt coachInputs/aiPrompt/aiResponse/coachNotes
  status?: 'pending' | 'generated' | 'accepted' | 'skipped';
}
```

```ts
function rowToStep(row: Record<string, unknown>): SessionStep {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    stepNumber: row.step_number as number,
    stepName: row.step_name as string,
    phase: row.phase as string,
    beats: deserializeBeats(row.coach_inputs),
    status: row.status as SessionStep['status'],
    generatedAt: (row.generated_at as Date | null) ?? null,
  };
}
```

### 6c — `upsertStep` (persist `beats` into `coach_inputs`, null out legacy text columns)

```ts
export async function upsertStep(pool: Pool, args: UpsertStepArgs): Promise<SessionStep> {
  const beats = args.beats ?? [];
  const hasAi = beats.some((b) => b.aiResponse);
  const r = await pool.query(
    `INSERT INTO coaching.session_steps
       (session_id, step_number, step_name, phase, coach_inputs, ai_prompt, ai_response, coach_notes, status, generated_at)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, $6, $7)
     ON CONFLICT (session_id, step_number) DO UPDATE SET
       coach_inputs = EXCLUDED.coach_inputs,
       status       = EXCLUDED.status,
       generated_at = CASE WHEN EXCLUDED.generated_at IS NOT NULL THEN EXCLUDED.generated_at ELSE coaching.session_steps.generated_at END
     RETURNING *`,
    [
      args.sessionId, args.stepNumber, args.stepName, args.phase,
      serializeBeats(beats),
      args.status ?? 'pending',
      hasAi ? new Date() : null,
    ],
  );
  return rowToStep(r.rows[0]);
}
```

### 6d — `completeSession` (store report as a single accepted BeatState in step 0)

The Abschlussbericht round-trips through the same beats model so `rowToStep` reads it uniformly
(step 0's `beats[0].aiResponse` holds the report markdown). P3 (export) consumes this shape.

```ts
export async function completeSession(pool: Pool, sessionId: string, reportMarkdown: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE coaching.sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
      [sessionId],
    );
    const reportBeats: BeatState[] = [
      { beatIndex: 0, aiResponse: reportMarkdown, status: 'accepted' },
    ];
    await client.query(
      `INSERT INTO coaching.session_steps
         (session_id, step_number, step_name, phase, coach_inputs, ai_prompt, ai_response, coach_notes, status, generated_at)
       VALUES ($1, 0, 'Abschlussbericht', 'umsetzung', $2, NULL, NULL, NULL, 'accepted', now())
       ON CONFLICT (session_id, step_number) DO UPDATE SET
         coach_inputs = EXCLUDED.coach_inputs,
         status       = EXCLUDED.status,
         generated_at = now()`,
      [sessionId, serializeBeats(reportBeats)],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

`getSession`, `listSessions`, `getStep`, `updateSessionFields` need **no logic change** — they route
through `rowToStep`/`rowToSession`, which now return `beats`. Confirm no other function in the file
references the removed field names after the edit:

```bash
cd website && ! grep -nE 'coachInputs|aiPrompt|aiResponse|coachNotes' src/lib/coaching-session-db.ts
```

> Cross-partial note: `session-tools.ts`, `session-history.ts`, `steps/[n]/generate.ts`,
> `complete.ts` and `SessionWizard.svelte` still read the old field names and are migrated in
> P2/P3; their tests are migrated in P4. That is expected and out of P1's scope — P1 only freezes
> the shape. (`getStepDef`/`buildUserPrompt` in `generate.ts` compile against the facade; the
> beat-level `buildUserPrompt(beat, …)` call-site change is P2's.)

<!-- vitest: P1 adds exactly one red→green shape test (Task 1) here; the comprehensive beat-invariant + BeatState-persistence suites are P4 (tests always last), per the orchestrator's staging. -->

---

## Task 7 — Verify (mandatory gate commands)

Run, in order, and confirm each passes before handing off to P2:

```bash
# 1. targeted shape test green (from Task 1/4) — proves the frozen shape
cd website && pnpm vitest run coaching-session-prompts -t 'Beat model' --reporter verbose

# 2. regenerate generated artefacts (test-inventory for the added test, repo-index, …)
cd /home/patrick/Bachelorprojekt/.worktrees/coaching-session-beat-choreography
task test:inventory
task freshness:regenerate

# 3. mandatory CI-equivalent gates
task test:changed          # website vitest --changed + domain BATS + quality
task freshness:check       # freshness + quality:check (S1–S4 ratchet incl. new split modules + baseline assertion)
```

- `task freshness:check` is the load-bearing gate for P1: it runs the S1 line ratchet (the three new
  modules must stay under 600 and `coaching-session-db.ts` must not grow past its 122 budget — it
  shrinks) and the S2 madge cycle check (the facade→beats→textbausteine and db→beats-db graph is
  acyclic). No hostname literals (S3) and no new `scripts/*`/`k3d/*` (S4) are introduced.
- Commit the regenerated `website/src/data/test-inventory.json` alongside the code (CI fails on drift).
- `task test:changed` full-green across every coaching test lands with **P4**; P1's own targeted
  shape test is green here.
