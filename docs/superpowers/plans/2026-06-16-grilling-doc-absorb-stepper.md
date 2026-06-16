---
title: Grilling-Doc-Absorption, Frage-für-Frage-Stepper & Dismiss — Implementation Plan
ticket_id: T000893
domains: [website, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Grilling-Doc-Absorption, Frage-für-Frage-Stepper & Dismiss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tickets können Grilling-Docs (Markdown mit Fragen + ggf. Teil-Antworten) tolerant absorbieren, offene Fragen einzeln im Stepper im Admin-Cockpit beantworten und einzelne Fragen persistent verwerfen (dismiss).

**Architecture:** Eine neue JSONB-Spalte `grilling_meta` hält absorbierte Fragebogen-Definitionen + verworfene Frage-IDs. Pure, DB-freie Parser-/Merge-/Status-Funktionen leben in `website/src/lib/tickets/grilling.ts`. Der CLI-Absorb (`scripts/ticket.sh grill --grilling-doc`) lebt vollständig in der lib `scripts/lib/ticket-grill.sh`. Eine neue dünne `GrillingStepper.svelte` konsumiert die pure Logik und schreibt via bestehender PATCH-API.

**Tech Stack:** Bash + jq + psql (CLI), TypeScript pure module (Vitest), Svelte 5 (Komponente), Astro (Ticket-Detail), PostgreSQL JSONB.

---

## Quality-Gate-Budgets (S1 — pro Datei, gegen die WIRKSAME Schwelle)

Ermittelt mit `wc -l` + `jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json` (Stand 2026-06-16):

| Datei | Ist | Baseline | Limit | Wirksame Schwelle | Budget | Strategie |
|---|---|---|---|---|---|---|
| `scripts/ticket.sh` | 637 | **795** | 500(.sh) | 795 | **+158** | nur 1 Dispatch-Zeile (`--grilling-doc` läuft in derselben `cmd_grill`); kein Risiko |
| `scripts/lib/ticket-grill.sh` | 111 | nicht-baselined | 500 | 500 | **+389** | Absorb-Logik hier; reichlich Reserve |
| `website/src/lib/tickets/grilling.ts` | 95 | nicht-baselined | 600 | 600 | **+505** | gesamte pure Logik hier; reichlich Reserve |
| `website/src/lib/tickets/admin.ts` | 677 | **677** | 600(.ts) | 677 | **0** | **NET-ZERO Pflicht** — alle Edits auf bestehende Zeilen anhängen (Muster L482/L508) |
| `website/src/lib/tickets-db.ts` | 1096 | **1096** | 600(.ts) | 1096 | **0** | **NET-ZERO Pflicht** — bestehende ALTER-Zeile L230 erweitern, keine neue Zeile |
| `website/src/components/admin/GrillingAnswersPanel.svelte` | 114 | nicht-baselined | 500 | 500 | +386 | unverändert (bleibt) |
| `website/src/components/admin/GrillingStepper.svelte` | 0 (neu) | — | 500 | 500 | <500 | neue Komponente, dünn halten (~200 Z.) |
| `website/src/pages/admin/tickets/[id].astro` | 392 | nicht-baselined | 400(.astro) | 400 | **+8** | **SEHR ENG** — exakt 1 Import + 1 Embed-Block; bei Überlauf Embed via bestehender Zeile zusammenziehen |
| `website/src/pages/api/admin/tickets/[id].ts` | 66 | nicht-baselined | 400 | 400 | +334 | 1 Whitelist-Eintrag, anhängend |
| `tests/unit/ticket-grill.bats` | 76 | nicht-baselined | 300(.bash→bats) | 300 | (BATS, kein .sh-Limit) | erweitern |

**Harte Regeln aus den Budgets:**
- `admin.ts` und `tickets-db.ts` haben **Budget 0**. Jede Änderung MUSS netto zeilenneutral sein. Die Codebasis nutzt bereits Mehr-Statement-Zeilen (`aiQuestion?: string \| null; humanAnswer?: string \| null;` = admin.ts:482; `if (...) push(...); if (...) push(...)` = admin.ts:508). Wir hängen `grillingMeta` an genau diese bestehenden Zeilen an statt neuer Zeilen.
- `[id].astro` hat Budget **+8**. Import (1 Z.) + Embed-Block knapp halten.
- Keine Brand-Domain-Literale in Snippets (S3). Pure Module ohne Rück-Import auf DB/API (S2). `grilling.ts` importiert NICHTS aus `admin.ts`/`tickets-db.ts`.
- Keine neue Baseline-/Ignore-Ausnahme (Baseline-Key-Count-Assertion in `freshness:check` failt sonst).

---

## File Structure (Decomposition)

| Einheit | Zweck | Abhängigkeiten | S1-Disziplin |
|---|---|---|---|
| `website/src/lib/tickets/grilling.ts` (erweitert) | Pure Parser + Split + Merge + Status (DB-frei) | keine | viel Reserve |
| `scripts/lib/ticket-grill.sh` (erweitert) | CLI-Absorb `--grilling-doc` (Parse→Split→2 Merges→Kommentar) | psql, jq | viel Reserve |
| `scripts/ticket.sh` (Dispatch) | unverändert außer evtl. Help-Text | sourct lib | viel Reserve |
| `website/src/lib/tickets-db.ts` (erweitert) | `grilling_meta`-Spalte idempotent | DB | **NET-ZERO** |
| `website/src/lib/tickets/admin.ts` (erweitert) | `grillingMeta` lesen + whitelisten | grilling.ts (type) | **NET-ZERO** |
| `website/src/pages/api/admin/tickets/[id].ts` (erweitert) | `grillingMeta` PATCH-Whitelist | admin.ts | Reserve |
| `website/src/components/admin/GrillingStepper.svelte` (neu) | Ein-Frage-Modus + Dismiss | grilling.ts, PATCH-API | neu, dünn |
| `website/src/pages/admin/tickets/[id].astro` (erweitert) | Stepper einbinden | Stepper-Komponente | **+8 eng** |
| `website/src/lib/tickets/grilling.test.ts` (neu) | Vitest pure Funktionen | grilling.ts | neu |
| `website/src/components/admin/GrillingStepper.test.ts` (neu) | Vitest Komponente | Stepper | neu |
| `tests/unit/ticket-grill.bats` (erweitert) | bats CLI/Parser/Split | ticket.sh | erweitern |

**Datenmodell (verbindlich, alle Tasks referenzieren diese Shapes):**

```jsonc
// grilling_answers (BESTEHEND, unverändert): Antworten
{ "<questionnaireId>": { "<questionId>": "<answer text>" } }

// grilling_meta (NEU): Definitionen + Dismiss
{
  "<questionnaireId>": {
    "title": "Coaching Follow-up",          // optional
    "questions": [ { "id": "q1", "prompt": "…", "section": "optional" } ],
    "dismissed": ["q3", "q7"]
  }
}
```

**Pure-Funktions-Signaturen (verbindlich, einheitlich über alle Tasks):**

```ts
export interface ParsedQuestion { id: string; prompt: string; section?: string; answer?: string }
export interface ParsedGrillingDoc { questionnaireId: string; title: string; questions: ParsedQuestion[] }
export interface GrillingMetaEntry { title?: string; questions: { id: string; prompt: string; section?: string }[]; dismissed: string[] }
export type GrillingMeta = Record<string, GrillingMetaEntry>;
export interface ResolvedQuestion { id: string; prompt: string; section?: string }

export function parseGrillingDoc(content: string, fallbackId: string): ParsedGrillingDoc;
export function splitAnswered(questions: ParsedQuestion[]): { answered: ParsedQuestion[]; unanswered: ParsedQuestion[] };
export function resolveQuestions(qnId: string, registry: Record<string, GrillingQuestionnaire>, meta: GrillingMeta | null): ResolvedQuestion[];
export function questionStatus(qId: string, qnId: string, answers: GrillingAnswers | null, meta: GrillingMeta | null): 'answered' | 'dismissed' | 'open';
export function grillingProgress(qnId: string, registry: Record<string, GrillingQuestionnaire>, answers: GrillingAnswers | null, meta: GrillingMeta | null): { total: number; answered: number; dismissed: number; open: number };
export function isBlankAnswer(value: string | null | undefined): boolean;
```

---

## Task 1: Pure-Logik — `isBlankAnswer` + `splitAnswered` (grilling.ts)

**Files:**
- Modify: `website/src/lib/tickets/grilling.ts` (append after line 95)
- Test: `website/src/lib/tickets/grilling.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/tickets/grilling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isBlankAnswer, splitAnswered, type ParsedQuestion } from './grilling';

describe('isBlankAnswer', () => {
  it('treats empty/whitespace/placeholders as blank', () => {
    for (const v of ['', '   ', '\n', '—', '-', 'tbd', 'TBD', '(offen)', 'n/a', 'N/A', null, undefined]) {
      expect(isBlankAnswer(v as string)).toBe(true);
    }
  });
  it('treats real text as not blank', () => {
    expect(isBlankAnswer('Alle zwei Wochen.')).toBe(false);
    expect(isBlankAnswer('no')).toBe(false); // real short answer, not a placeholder
  });
});

describe('splitAnswered', () => {
  it('splits by answer presence using isBlankAnswer', () => {
    const qs: ParsedQuestion[] = [
      { id: 'q1', prompt: 'A?', answer: 'Ja' },
      { id: 'q2', prompt: 'B?' },
      { id: 'q3', prompt: 'C?', answer: '  ' },
      { id: 'q4', prompt: 'D?', answer: 'tbd' },
    ];
    const { answered, unanswered } = splitAnswered(qs);
    expect(answered.map((q) => q.id)).toEqual(['q1']);
    expect(unanswered.map((q) => q.id)).toEqual(['q2', 'q3', 'q4']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts`
Expected: FAIL — `isBlankAnswer`/`splitAnswered`/`ParsedQuestion` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `website/src/lib/tickets/grilling.ts` (after line 95, before EOF):

```ts

// --- Grilling-Doc absorption: pure parsing/split/status helpers (no DB, no cycles) ---

export interface ParsedQuestion { id: string; prompt: string; section?: string; answer?: string }

const PLACEHOLDER_ANSWERS = new Set(['—', '-', 'tbd', '(offen)', 'n/a']);

/** Empty, whitespace-only, or known placeholder tokens count as "no answer". */
export function isBlankAnswer(value: string | null | undefined): boolean {
  if (value == null) return true;
  const t = value.trim();
  if (t === '') return true;
  return PLACEHOLDER_ANSWERS.has(t.toLowerCase());
}

/** Partition questions into answered (non-blank answer) and unanswered. */
export function splitAnswered(questions: ParsedQuestion[]): {
  answered: ParsedQuestion[];
  unanswered: ParsedQuestion[];
} {
  const answered: ParsedQuestion[] = [];
  const unanswered: ParsedQuestion[] = [];
  for (const q of questions) (isBlankAnswer(q.answer) ? unanswered : answered).push(q);
  return { answered, unanswered };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/grilling.ts website/src/lib/tickets/grilling.test.ts
git commit -m "feat(grilling): add isBlankAnswer + splitAnswered pure helpers"
```

---

## Task 2: Pure-Logik — `parseGrillingDoc` (tolerant parser)

**Files:**
- Modify: `website/src/lib/tickets/grilling.ts` (append)
- Test: `website/src/lib/tickets/grilling.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `website/src/lib/tickets/grilling.test.ts`:

```ts
import { parseGrillingDoc } from './grilling';

describe('parseGrillingDoc', () => {
  it('parses ## headings with Antwort: markers and frontmatter', () => {
    const doc = [
      '---',
      'questionnaire: gekko-coaching-followup',
      'title: Coaching Follow-up',
      '---',
      '',
      '## Wie oft treffen?',
      'Antwort: Alle zwei Wochen.',
      '',
      '## Welche Themen?',
      '',
      '## Video oder Präsenz? {#format-pref}',
      'A: Video.',
    ].join('\n');
    const r = parseGrillingDoc(doc, 'fallback');
    expect(r.questionnaireId).toBe('gekko-coaching-followup');
    expect(r.title).toBe('Coaching Follow-up');
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0]).toMatchObject({ id: 'q1', prompt: 'Wie oft treffen?', answer: 'Alle zwei Wochen.' });
    expect(r.questions[1]).toMatchObject({ id: 'q2', prompt: 'Welche Themen?' });
    expect(r.questions[1].answer).toBeUndefined();
    expect(r.questions[2]).toMatchObject({ id: 'format-pref', prompt: 'Video oder Präsenz?', answer: 'Video.' });
  });

  it('falls back to fallbackId when frontmatter is absent', () => {
    const r = parseGrillingDoc('## Nur eine Frage?', 'my-file');
    expect(r.questionnaireId).toBe('my-file');
    expect(r.title).toBe('my-file');
    expect(r.questions).toEqual([{ id: 'q1', prompt: 'Nur eine Frage?' }]);
  });

  it('accepts numbered list markers and explicit qN tokens', () => {
    const doc = ['1. Erste Frage?', 'Antwort: Eins.', '2) Zweite Frage?', 'q5. Fünfte Frage?'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q5']);
    expect(r.questions[0].answer).toBe('Eins.');
  });

  it('treats blockquote and following-paragraph as answers; merges multi-line', () => {
    const doc = ['## Frage A?', '> Zeile eins', '> Zeile zwei', '', '## Frage B?', 'Ein Folgeabsatz', 'noch eine Zeile'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions[0].answer).toBe('Zeile eins\nZeile zwei');
    expect(r.questions[1].answer).toBe('Ein Folgeabsatz\nnoch eine Zeile');
  });

  it('treats placeholder answer values as no answer', () => {
    const doc = ['## Frage?', 'Antwort: —'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions[0].answer === undefined || r.questions[0].answer === '—').toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts -t parseGrillingDoc`
Expected: FAIL — `parseGrillingDoc` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `website/src/lib/tickets/grilling.ts`:

```ts

export interface ParsedGrillingDoc { questionnaireId: string; title: string; questions: ParsedQuestion[] }

const FRONT_RE = /^---\s*$/;
const HEADING_RE = /^#{2,3}\s+(.*?)\s*$/;
const NUMBERED_RE = /^\s*(?:q(\d+)[.)]|(\d+)[.)])\s+(.*?)\s*$/i;
const BOLD_Q_RE = /^\s*\*\*(.+\?)\*\*\s*$/;
const ID_SUFFIX_RE = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;
const ANSWER_PREFIX_RE = /^\s*(?:antwort|a)\s*:\s*(.*)$/i;
const BLOCKQUOTE_RE = /^\s*>\s?(.*)$/;

interface RawQuestion { explicitId?: string; prompt: string; answerLines: string[] }

/** Tolerant Markdown grilling-doc parser. Never throws; best-effort question extraction. */
export function parseGrillingDoc(content: string, fallbackId: string): ParsedGrillingDoc {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let frontId = '';
  let frontTitle = '';

  // Optional YAML-ish frontmatter (only `questionnaire:` and `title:` are read).
  if (lines[0] !== undefined && FRONT_RE.test(lines[0])) {
    i = 1;
    while (i < lines.length && !FRONT_RE.test(lines[i])) {
      const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(lines[i]);
      if (m) {
        if (m[1] === 'questionnaire') frontId = m[2].trim();
        else if (m[1] === 'title') frontTitle = m[2].trim();
      }
      i++;
    }
    if (i < lines.length) i++; // consume closing ---
  }

  const raws: RawQuestion[] = [];
  let current: RawQuestion | null = null;
  const pushAnswer = (text: string) => { if (current) current.answerLines.push(text); };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const startQuestion = (rawPrompt: string, explicitId?: string) => {
      let prompt = rawPrompt;
      const idm = ID_SUFFIX_RE.exec(prompt);
      let id = explicitId;
      if (idm) { id = idm[1]; prompt = prompt.replace(ID_SUFFIX_RE, '').trim(); }
      current = { explicitId: id, prompt: prompt.trim(), answerLines: [] };
      raws.push(current);
    };

    const heading = HEADING_RE.exec(line);
    const numbered = NUMBERED_RE.exec(line);
    const bold = BOLD_Q_RE.exec(line);
    if (heading) { startQuestion(heading[1]); continue; }
    if (numbered) { startQuestion(numbered[3], numbered[1] ? `q${numbered[1]}` : undefined); continue; }
    if (bold) { startQuestion(bold[1]); continue; }

    if (!current) continue; // preamble before first question
    const ans = ANSWER_PREFIX_RE.exec(line);
    if (ans) { pushAnswer(ans[1].trim()); continue; }
    const bq = BLOCKQUOTE_RE.exec(line);
    if (bq) { pushAnswer(bq[1].trim()); continue; }
    if (line.trim() === '') continue;
    pushAnswer(line.trim()); // following paragraph = answer continuation
  }

  let auto = 0;
  const questions: ParsedQuestion[] = raws.map((r) => {
    auto += 1;
    const id = r.explicitId ?? `q${auto}`;
    const answerText = r.answerLines.join('\n').trim();
    const q: ParsedQuestion = { id, prompt: r.prompt };
    if (!isBlankAnswer(answerText)) q.answer = answerText;
    return q;
  });

  return {
    questionnaireId: frontId || fallbackId,
    title: frontTitle || frontId || fallbackId,
    questions,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts -t parseGrillingDoc`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/grilling.ts website/src/lib/tickets/grilling.test.ts
git commit -m "feat(grilling): add tolerant parseGrillingDoc parser"
```

---

## Task 3: Pure-Logik — `resolveQuestions`, `questionStatus`, `grillingProgress`

**Files:**
- Modify: `website/src/lib/tickets/grilling.ts` (append)
- Test: `website/src/lib/tickets/grilling.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `website/src/lib/tickets/grilling.test.ts`:

```ts
import {
  resolveQuestions, questionStatus, grillingProgress,
  type GrillingMeta,
} from './grilling';
import { QUESTIONNAIRES } from './grilling';

const QN = 'coaching-sessions-v1';

describe('resolveQuestions', () => {
  it('returns registry questions flattened when no meta', () => {
    const r = resolveQuestions(QN, QUESTIONNAIRES, null);
    expect(r).toHaveLength(23);
    expect(r[0]).toMatchObject({ id: 'q1', section: '1. Die Coaching-Beziehung' });
  });
  it('unions absorbed meta questions (new ids appended, existing ids kept registry-first)', () => {
    const meta: GrillingMeta = {
      [QN]: { questions: [{ id: 'q1', prompt: 'override?' }, { id: 'qX', prompt: 'absorbed?' }], dismissed: [] },
    };
    const r = resolveQuestions(QN, QUESTIONNAIRES, meta);
    expect(r.find((q) => q.id === 'qX')).toMatchObject({ id: 'qX', prompt: 'absorbed?' });
    // registry wins for duplicate id (no double entry)
    expect(r.filter((q) => q.id === 'q1')).toHaveLength(1);
  });
  it('returns absorbed-only questions for a questionnaire not in the registry', () => {
    const meta: GrillingMeta = { 'doc-x': { questions: [{ id: 'a', prompt: 'A?' }], dismissed: [] } };
    expect(resolveQuestions('doc-x', QUESTIONNAIRES, meta)).toEqual([{ id: 'a', prompt: 'A?' }]);
  });
});

describe('questionStatus', () => {
  const answers = { [QN]: { q1: 'Ja' } };
  const meta: GrillingMeta = { [QN]: { questions: [], dismissed: ['q2'] } };
  it('answered when non-blank answer present', () => {
    expect(questionStatus('q1', QN, answers, meta)).toBe('answered');
  });
  it('dismissed when in meta.dismissed and not answered', () => {
    expect(questionStatus('q2', QN, answers, meta)).toBe('dismissed');
  });
  it('open otherwise', () => {
    expect(questionStatus('q3', QN, answers, meta)).toBe('open');
  });
  it('answered beats dismissed', () => {
    const a2 = { [QN]: { q2: 'spät beantwortet' } };
    expect(questionStatus('q2', QN, a2, meta)).toBe('answered');
  });
});

describe('grillingProgress', () => {
  it('counts total/answered/dismissed/open over registry ∪ meta', () => {
    const answers = { [QN]: { q1: 'Ja', q2: 'Auch' } };
    const meta: GrillingMeta = { [QN]: { questions: [{ id: 'qX', prompt: 'extra?' }], dismissed: ['q3'] } };
    const p = grillingProgress(QN, QUESTIONNAIRES, answers, meta);
    expect(p.total).toBe(24); // 23 registry + 1 absorbed
    expect(p.answered).toBe(2);
    expect(p.dismissed).toBe(1);
    expect(p.open).toBe(21);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts -t resolveQuestions`
Expected: FAIL — `resolveQuestions`/`questionStatus`/`grillingProgress`/`GrillingMeta` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `website/src/lib/tickets/grilling.ts`:

```ts

export interface GrillingMetaEntry {
  title?: string;
  questions: { id: string; prompt: string; section?: string }[];
  dismissed: string[];
}
export type GrillingMeta = Record<string, GrillingMetaEntry>;
export interface ResolvedQuestion { id: string; prompt: string; section?: string }

/** Registry questions (flattened, section title as `section`) ∪ absorbed meta questions.
 *  Registry wins on duplicate id; absorbed-only ids are appended in meta order. */
export function resolveQuestions(
  qnId: string,
  registry: Record<string, GrillingQuestionnaire>,
  meta: GrillingMeta | null,
): ResolvedQuestion[] {
  const out: ResolvedQuestion[] = [];
  const seen = new Set<string>();
  const qn = registry[qnId];
  if (qn) {
    for (const s of qn.sections) {
      for (const q of s.questions) {
        out.push({ id: q.id, prompt: q.label, section: s.title });
        seen.add(q.id);
      }
    }
  }
  for (const q of meta?.[qnId]?.questions ?? []) {
    if (seen.has(q.id)) continue;
    out.push({ id: q.id, prompt: q.prompt, section: q.section });
    seen.add(q.id);
  }
  return out;
}

/** answered (non-blank answer) | dismissed (in meta.dismissed) | open. answered wins over dismissed. */
export function questionStatus(
  qId: string,
  qnId: string,
  answers: GrillingAnswers | null,
  meta: GrillingMeta | null,
): 'answered' | 'dismissed' | 'open' {
  if (!isBlankAnswer(answers?.[qnId]?.[qId])) return 'answered';
  if ((meta?.[qnId]?.dismissed ?? []).includes(qId)) return 'dismissed';
  return 'open';
}

/** Aggregate counts over the resolved (registry ∪ absorbed) question set. */
export function grillingProgress(
  qnId: string,
  registry: Record<string, GrillingQuestionnaire>,
  answers: GrillingAnswers | null,
  meta: GrillingMeta | null,
): { total: number; answered: number; dismissed: number; open: number } {
  const qs = resolveQuestions(qnId, registry, meta);
  let answered = 0, dismissed = 0, open = 0;
  for (const q of qs) {
    const st = questionStatus(q.id, qnId, answers, meta);
    if (st === 'answered') answered++; else if (st === 'dismissed') dismissed++; else open++;
  }
  return { total: qs.length, answered, dismissed, open };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts`
Expected: PASS (entire file: Tasks 1–3).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/grilling.ts website/src/lib/tickets/grilling.test.ts
git commit -m "feat(grilling): add resolveQuestions, questionStatus, grillingProgress"
```

---

## Task 4: DB-Spalte `grilling_meta` (NET-ZERO in tickets-db.ts)

**Files:**
- Modify: `website/src/lib/tickets-db.ts:230` (replace the existing single ALTER line — NO new line)

> **S1 Budget 0** auf `tickets-db.ts`. Wir ersetzen die bestehende einzeilige ALTER-Anweisung durch eine, die BEIDE Spalten in einem `ALTER TABLE` anlegt — Zeilenzahl bleibt 1096.

- [ ] **Step 1: Inspect current line**

Run: `sed -n '230p' website/src/lib/tickets-db.ts`
Expected exactly:
```
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB`);
```

- [ ] **Step 2: Replace it NET-ZERO (one line stays one line)**

Replace line 230 with (still a single physical line):

```ts
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB, ADD COLUMN IF NOT EXISTS grilling_meta JSONB`);
```

- [ ] **Step 3: Verify line count unchanged**

Run: `wc -l website/src/lib/tickets-db.ts`
Expected: `1096` (unchanged).

- [ ] **Step 4: Verify migration parses (typecheck)**

Run: `cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep tickets-db || echo OK`
Expected: `OK` (no tickets-db errors).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(grilling): add grilling_meta JSONB column (net-zero ALTER)"
```

---

## Task 5: Read + whitelist `grillingMeta` (NET-ZERO in admin.ts)

**Files:**
- Modify: `website/src/lib/tickets/admin.ts` — lines 12, 70, 152, 483, 509 (all appended to EXISTING lines; net-zero)

> **S1 Budget 0** auf `admin.ts`. Jede Änderung hängt an eine BESTEHENDE Zeile an. Verifiziere am Ende `wc -l` == 677.

- [ ] **Step 1: Import the type (net-zero — extend existing import line 12)**

Line 12 is `import type { GrillingAnswers } from './grilling';`. Replace with:

```ts
import type { GrillingAnswers, GrillingMeta } from './grilling';
```

- [ ] **Step 2: Add to `TicketDetail` interface (net-zero — append to line 70)**

Line 70 is `  grillingAnswers: GrillingAnswers | null;`. Replace with:

```ts
  grillingAnswers: GrillingAnswers | null; grillingMeta: GrillingMeta | null;
```

- [ ] **Step 3: Add to SELECT projection (net-zero — extend line 152)**

Line 152 ends with `t.grilling_answers AS "grillingAnswers"`. Replace that line with:

```ts
    t.ai_question AS "aiQuestion", t.human_answer AS "humanAnswer", t.grilling_answers AS "grillingAnswers", t.grilling_meta AS "grillingMeta"
```

- [ ] **Step 4: Add to the `patchAdminTicket` param type (net-zero — append to line 483)**

Line 483 is `  grillingAnswers?: GrillingAnswers | null;`. Replace with:

```ts
  grillingAnswers?: GrillingAnswers | null; grillingMeta?: GrillingMeta | null;
```

- [ ] **Step 5: Add to the UPDATE set-builder (net-zero — append to line 509)**

Line 509 is `  if (p.grillingAnswers !== undefined) push('grilling_answers', p.grillingAnswers);`. Replace with:

```ts
  if (p.grillingAnswers !== undefined) push('grilling_answers', p.grillingAnswers); if (p.grillingMeta !== undefined) push('grilling_meta', p.grillingMeta);
```

- [ ] **Step 6: Verify net-zero + typecheck**

Run: `wc -l website/src/lib/tickets/admin.ts`
Expected: `677` (unchanged).
Run: `cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "tickets/admin" || echo OK`
Expected: `OK`.

- [ ] **Step 7: Verify S1 ratchet does not trip on admin.ts**

Run: `node scripts/code-quality/check.mjs 2>&1 | grep "tickets/admin.ts" || echo "admin.ts OK"`
Expected: `admin.ts OK` (no worsened-line violation).

- [ ] **Step 8: Commit**

```bash
git add website/src/lib/tickets/admin.ts
git commit -m "feat(grilling): read + whitelist grillingMeta (net-zero admin.ts)"
```

---

## Task 6: PATCH-API whitelist `grillingMeta`

**Files:**
- Modify: `website/src/pages/api/admin/tickets/[id].ts:44-47` (extend the `allowed` array)

- [ ] **Step 1: Inspect current whitelist**

Run: `sed -n '44,47p' website/src/pages/api/admin/tickets/[id].ts`
Expected the `allowed` tuple ending with `'aiQuestion','humanAnswer','grillingAnswers'] as const;`.

- [ ] **Step 2: Add `grillingMeta` to the tuple**

Replace `'aiQuestion','humanAnswer','grillingAnswers'] as const;` with:

```ts
                   'aiQuestion','humanAnswer','grillingAnswers','grillingMeta'] as const;
```

- [ ] **Step 3: Typecheck**

Run: `cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "api/admin/tickets" || echo OK`
Expected: `OK` (patchAdminTicket already accepts grillingMeta from Task 5).

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/tickets/[id].ts
git commit -m "feat(grilling): accept grillingMeta in PATCH whitelist"
```

---

## Task 7: CLI absorb `--grilling-doc` (bats first — arg validation)

**Files:**
- Modify: `tests/unit/ticket-grill.bats` (extend)
- Modify: `scripts/lib/ticket-grill.sh` (extend `cmd_grill`)

> The absorb logic lives entirely in the lib (`scripts/lib/ticket-grill.sh`), NOT in `scripts/ticket.sh`. Validation runs BEFORE `_pgpod` so bats can assert without a cluster (pattern already used at lib lines 40–69).

- [ ] **Step 1: Write the failing bats tests (arg validation, offline)**

Append to `tests/unit/ticket-grill.bats`:

```bash
@test "grill --grilling-doc rejects a missing file" {
  run bash "$TICKET_SH" grill --id T000999 --grilling-doc /no/such/file.md
  [ "$status" -eq 2 ]
  [[ "$output" == *"grilling doc missing or empty"* ]]
}

@test "grill --grilling-doc conflicts with --json (exactly one source)" {
  doc="$BATS_TEST_TMPDIR/g.md"; printf '## Q?\n' > "$doc"
  run bash "$TICKET_SH" grill --id T000999 --grilling-doc "$doc" --json '{"q1":"x"}'
  [ "$status" -eq 2 ]
  [[ "$output" == *"exactly one of"* ]]
}
```

> `TICKET_SH` and `BATS_TEST_TMPDIR` follow the existing setup in this bats file. If `TICKET_SH` is not yet defined in `setup()`, add `TICKET_SH="${BATS_TEST_DIRNAME}/../../scripts/ticket.sh"` to the existing `setup()` — check first with `grep -n TICKET_SH tests/unit/ticket-grill.bats`.

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-grilling-absorb && bats tests/unit/ticket-grill.bats -f grilling-doc`
Expected: FAIL — `--grilling-doc` unknown option.

- [ ] **Step 3: Add the flag + validation to `cmd_grill` (offline portion)**

In `scripts/lib/ticket-grill.sh`, in the `while`/`case` arg loop (lib lines 29–38), add a case after `--answer`:

```bash
      --grilling-doc)  grilling_doc="$2"; shift 2 ;;
```

Declare `grilling_doc=""` in the `local` line at lib line 27. Then in the source-count block (lib lines 43–54), count it as a source:

```bash
  [[ -n "$grilling_doc" ]] && sources=$((sources+1))
```

And add a file-existence check right after the `sources` validation (before `_pgpod`):

```bash
  if [[ -n "$grilling_doc" && ! -s "$grilling_doc" ]]; then
    echo "ERROR: grilling doc missing or empty: $grilling_doc" >&2; exit 2
  fi
```

- [ ] **Step 4: Run to verify the validation tests pass**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-grilling-absorb && bats tests/unit/ticket-grill.bats -f grilling-doc`
Expected: PASS (2 validation tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticket-grill.sh tests/unit/ticket-grill.bats
git commit -m "feat(grill): add --grilling-doc flag + offline arg validation"
```

---

## Task 8: CLI absorb — doc parse + split + dual JSONB merge

**Files:**
- Modify: `scripts/lib/ticket-grill.sh` (parse/split helpers + SQL merges)
- Modify: `tests/unit/ticket-grill.bats` (parser/split assertions on emitted JSON)

> **S2/determinism:** the bash parser MUST mirror the `parseGrillingDoc` contract from Task 2 (same markers, same `isBlankAnswer` placeholders, same auto-id scheme). It emits two JSON blobs via `jq`: an answers object `{qId:answer}` (answered only) and a meta-questions array `[{id,prompt,section}]` (all). bats tests assert on a `--dry-run-json` debug emit so no cluster is needed.

- [ ] **Step 1: Write the failing bats test (parser/split via dry-run JSON)**

Append to `tests/unit/ticket-grill.bats`:

```bash
@test "grill --grilling-doc --dry-run-json splits answered vs unanswered" {
  doc="$BATS_TEST_TMPDIR/g.md"
  cat > "$doc" <<'MD'
---
questionnaire: gekko-x
title: Gekko X
---
## Frage eins?
Antwort: Antwort eins.
## Frage zwei?
## Frage drei? {#drei}
A: —
MD
  run bash "$TICKET_SH" grill --id T000999 --grilling-doc "$doc" --dry-run-json
  [ "$status" -eq 0 ]
  # questionnaire id resolved from frontmatter
  [[ "$output" == *'"questionnaireId":"gekko-x"'* ]]
  # answered map carries only q1
  echo "$output" | grep -q '"answers":{"q1":"Antwort eins."}'
  # meta questions array has 3 entries incl explicit id "drei"
  echo "$output" | grep -q '"id":"drei"'
  # placeholder "—" did NOT become an answer (q3/drei not in answers)
  ! echo "$output" | grep -q '"drei":'
}

@test "grill --grilling-doc auto-assigns q1..qN and accepts numbered markers" {
  doc="$BATS_TEST_TMPDIR/n.md"
  printf '1. Erste?\nAntwort: A.\n2) Zweite?\n' > "$doc"
  run bash "$TICKET_SH" grill --id T000999 --grilling-doc "$doc" --dry-run-json
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"answers":{"q1":"A."}'
  echo "$output" | grep -q '"id":"q2"'
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-grilling-absorb && bats tests/unit/ticket-grill.bats -f dry-run-json`
Expected: FAIL — `--dry-run-json` unknown / no parser.

- [ ] **Step 3: Implement the bash parser + dry-run emit in `cmd_grill`**

Add `--dry-run-json) dry_run_json="true"; shift ;;` to the case loop and `dry_run_json=""` to the `local` line. After the file-existence check, when `grilling_doc` is set, parse it with this helper added near `_grill_answers_json` (top of lib). The parser mirrors Task 2:

```bash
# Parse a tolerant grilling doc into two JSON values printed on stdout as a single object:
#   {"questionnaireId":"…","title":"…","answers":{qId:answer,…},"questions":[{id,prompt,section?},…]}
# Mirrors website/src/lib/tickets/grilling.ts parseGrillingDoc (same markers/placeholders/auto-ids).
_grill_parse_doc() {
  local file="$1" fallback="$2"
  awk -v fallback="$fallback" '
    function flush(  a) {
      if (have) {
        ids[n]=(curid!="" ? curid : "q" (n+1)); prompts[n]=curprompt; secs[n]=cursec;
        # join answer lines with \n
        ans[n]=curans; n++;
      }
      have=0; curid=""; curprompt=""; cursec=""; curans="";
    }
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/,"",s); return s }
    function isblank(s,  t){ t=tolower(trim(s));
      return (t==""||t=="—"||t=="-"||t=="tbd"||t=="(offen)"||t=="n/a") }
    BEGIN{ fm=0; n=0; have=0; qid=fallback; title="" }
    NR==1 && $0 ~ /^---[ \t]*$/ { fm=1; next }
    fm==1 {
      if ($0 ~ /^---[ \t]*$/) { fm=0; next }
      if ($0 ~ /^questionnaire[ \t]*:/) { sub(/^questionnaire[ \t]*:[ \t]*/,""); qid=trim($0); next }
      if ($0 ~ /^title[ \t]*:/) { sub(/^title[ \t]*:[ \t]*/,""); title=trim($0); next }
      next
    }
    {
      line=$0
      # heading ##/###
      if (line ~ /^#{2,3}[ \t]+/) { flush(); p=line; sub(/^#{2,3}[ \t]+/,"",p); split_id(p); have=1; next }
      # numbered qN. / N. / N)
      if (line ~ /^[ \t]*(q?[0-9]+[.)])[ \t]+/) {
        flush(); m=line; eid=m; sub(/^[ \t]*/,"",eid); 
        if (eid ~ /^q[0-9]+/) { num=eid; sub(/[.)].*/,"",num); sub(/^q/,"",num); curid_pre="q" num } else { curid_pre="" }
        p=line; sub(/^[ \t]*q?[0-9]+[.)][ \t]+/,"",p); split_id(p); if (curid_pre!="") curid=curid_pre; have=1; next
      }
      # bold **... ?**
      if (line ~ /^[ \t]*\*\*.+\?\*\*[ \t]*$/) { flush(); p=line; gsub(/^[ \t]*\*\*|\*\*[ \t]*$/,"",p); split_id(p); have=1; next }
      if (!have) next
      # answer markers
      if (line ~ /^[ \t]*(antwort|a)[ \t]*:/) { sub(/^[ \t]*(antwort|a|Antwort|A)[ \t]*:[ \t]*/,"",line); addans(trim(line)); next }
      if (line ~ /^[ \t]*>/) { sub(/^[ \t]*>[ \t]?/,"",line); addans(trim(line)); next }
      if (trim(line)=="") next
      addans(trim(line))
    }
    function split_id(p,  idm){ curprompt=p; if (match(p,/\{#[A-Za-z0-9_-]+\}[ \t]*$/)) {
        idm=substr(p,RSTART+2,RLENGTH-3); sub(/[ \t]*\{#[A-Za-z0-9_-]+\}[ \t]*$/,"",curprompt); curid=trim(idm) }
        curprompt=trim(curprompt) }
    function addans(s){ curans=(curans=="" ? s : curans "\n" s) }
    END{
      flush();
      if (title=="") title=qid;
      printf("%s\t%s\t%d\n", qid, title, n);
      for (k=0;k<n;k++) {
        a=ans[k]; if (isblank(a)) a="";
        printf("%s\t%s\t%s\t%s\n", ids[k], prompts[k], secs[k], a);
      }
    }
  ' "$file"
}
```

Then in `cmd_grill`, when `grilling_doc` is set, turn the awk TSV into JSON with `jq` and either print (dry-run) or run the two merges:

```bash
  if [[ -n "$grilling_doc" ]]; then
    local base; base=$(basename "$grilling_doc"); base="${base%.*}"
    local tsv; tsv=$(_grill_parse_doc "$grilling_doc" "$base")
    # First TSV line = header: qid \t title \t count
    local header; header=$(head -n1 <<<"$tsv")
    questionnaire=$(cut -f1 <<<"$header")
    local doc_title; doc_title=$(cut -f2 <<<"$header")
    # Build answers object + questions array from remaining lines via jq.
    local parsed
    parsed=$(tail -n +2 <<<"$tsv" | jq -R -s --arg qn "$questionnaire" --arg title "$doc_title" '
      ( split("\n") | map(select(length>0) | split("\t"))
        | { questionnaireId:$qn, title:$title,
            answers: ( map(select(.[3] != "")) | map({ (.[0]): .[3] }) | add // {} ),
            questions: ( map({ id:.[0], prompt:.[1] } + (if .[2]=="" then {} else {section:.[2]} end)) ) } )')
    if [[ "$dry_run_json" == "true" ]]; then printf '%s\n' "$(jq -c . <<<"$parsed")"; exit 0; fi
    answers_json=$(jq -c '.answers' <<<"$parsed")
    meta_questions=$(jq -c '.questions' <<<"$parsed")
  fi
```

(Place this block before the `_pgpod` call; when `grilling_doc` is empty the existing `answers_json` resolution at lib lines 56–69 runs unchanged.)

- [ ] **Step 4: Run to verify the parser/split tests pass**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-grilling-absorb && bats tests/unit/ticket-grill.bats -f dry-run-json`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticket-grill.sh tests/unit/ticket-grill.bats
git commit -m "feat(grill): parse grilling doc, split answered/unanswered (dry-run JSON)"
```

---

## Task 9: CLI absorb — write grilling_meta + grilling_answers + summary comment

**Files:**
- Modify: `scripts/lib/ticket-grill.sh` (SQL: meta column ALTER + meta merge; reuse answers merge)

> The answers merge (lib lines 80–91) is reused for `answers_json`. We add the `grilling_meta` ALTER + a meta merge that idempotently upserts `questions` (by id) and keeps `dismissed`. The summary comment switches to "N absorbiert (M beantwortet, K offen)" when a doc was absorbed.

- [ ] **Step 1: Add meta-column ALTER (idempotent self-protection)**

Extend the existing self-protection block (lib lines 74–76) to also ensure `grilling_meta`:

```bash
  _exec_sql "$pod" <<'EOF' >/dev/null
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_meta JSONB;
EOF
```

- [ ] **Step 2: Add the meta merge (after the existing answers merge)**

After the answers `UPDATE … RETURNING 1` block, when `grilling_doc` was used, merge definitions. This upserts each absorbed question by id and preserves any existing `dismissed` array:

```bash
  if [[ -n "$grilling_doc" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v qid="$questionnaire" -v title="$doc_title" -v questions="$meta_questions" <<'EOF' >/dev/null
UPDATE tickets.tickets t
   SET grilling_meta =
       COALESCE(t.grilling_meta, '{}'::jsonb)
       || jsonb_build_object(:'qid', (
            jsonb_build_object('title', :'title')
            || jsonb_build_object('questions', :'questions'::jsonb)
            || jsonb_build_object('dismissed',
                 COALESCE(t.grilling_meta -> :'qid' -> 'dismissed', '[]'::jsonb))
          ))
 WHERE t.external_id = :'ext_id';
EOF
  fi
```

> Note: the answers merge only runs when `answers_json` is non-`{}`. For a doc with zero answered questions, `answers_json` is `{}`; the existing answers `UPDATE` is harmless (`COALESCE … || {}` is a no-op) but its `RETURNING 1` is still the not-found guard. Keep the answers `UPDATE` running for the not-found check.

- [ ] **Step 3: Doc-aware summary comment**

Replace the comment-summary block (lib lines 98–108) so that when a doc was absorbed it reports the split:

```bash
  if [[ "$no_comment" != "true" ]]; then
    local summary
    if [[ -n "$grilling_doc" ]]; then
      local n_total n_ans n_open
      n_total=$(jq 'length' <<<"$meta_questions")
      n_ans=$(jq 'keys|length' <<<"$answers_json")
      n_open=$(( n_total - n_ans ))
      summary="Grilling-Doc absorbiert ($questionnaire): $n_total Fragen ($n_ans beantwortet, $n_open offen)."
    else
      summary=$(jq -r --arg q "$questionnaire" \
        '"Grilling-Session (\($q)):\n" + (to_entries | map("- \(.key): \(.value)") | join("\n"))' \
        <<<"$answers_json")
    fi
    _exec_sql "$pod" -v ext_id="$id" -v body="$summary" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'grilling', :'body', 'internal'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi
```

- [ ] **Step 4: Final echo (doc-aware)**

Replace the final echo (lib line 110) with:

```bash
  if [[ -n "$grilling_doc" ]]; then
    echo "Grilling-Doc ($questionnaire) absorbed into ticket $id"
  else
    echo "Grilling session ($questionnaire) saved to ticket $id"
  fi
```

- [ ] **Step 5: Verify S1 on the lib + syntax check**

Run: `wc -l scripts/lib/ticket-grill.sh`
Expected: well under 500 (budget +389; confirm < 400 actual).
Run: `bash -n scripts/lib/ticket-grill.sh && echo "syntax OK"`
Expected: `syntax OK`.

- [ ] **Step 6: Re-run the full bats file (offline validation + parser tests)**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-grilling-absorb && bats tests/unit/ticket-grill.bats`
Expected: PASS (cluster-touching merges are not exercised offline; validation + dry-run tests pass).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/ticket-grill.sh
git commit -m "feat(grill): write grilling_meta + answers + split summary comment"
```

---

## Task 10: `GrillingStepper.svelte` — render + status + navigation (component test first)

**Files:**
- Create: `website/src/components/admin/GrillingStepper.svelte`
- Create: `website/src/components/admin/GrillingStepper.test.ts`

> The component is THIN: it consumes the pure helpers from `grilling.ts` (`resolveQuestions`, `questionStatus`, `grillingProgress`). No parsing/business logic in the component. Target ~200 lines (limit 500).

- [ ] **Step 1: Write the failing component test**

Create `website/src/components/admin/GrillingStepper.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import GrillingStepper from './GrillingStepper.svelte';
import { QUESTIONNAIRES } from '../../lib/tickets/grilling';

const QN = 'coaching-sessions-v1';

function setup(answers: any = null, meta: any = null) {
  return render(GrillingStepper, {
    props: { ticketId: 't1', questionnaireId: QN, grillingAnswers: answers, grillingMeta: meta },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
});

describe('GrillingStepper', () => {
  it('shows the first OPEN question and a progress counter', () => {
    setup({ [QN]: { q1: 'beantwortet' } }, null);
    // q1 answered → first open is q2
    expect(screen.getByText(QUESTIONNAIRES[QN].sections[0].questions[1].label)).toBeTruthy();
    expect(screen.getByTestId('grilling-progress').textContent).toMatch(/1 beantwortet/);
  });

  it('navigates with Weiter/Zurück', async () => {
    setup(null, null);
    const first = QUESTIONNAIRES[QN].sections[0].questions[0].label;
    const second = QUESTIONNAIRES[QN].sections[0].questions[1].label;
    expect(screen.getByText(first)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText(second)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Zurück/ }));
    expect(screen.getByText(first)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component (render + nav, no save yet)**

Create `website/src/components/admin/GrillingStepper.svelte`:

```svelte
<script lang="ts">
  import {
    QUESTIONNAIRES, resolveQuestions, questionStatus, grillingProgress,
    type GrillingAnswers, type GrillingMeta,
  } from '../../lib/tickets/grilling';

  let {
    ticketId,
    questionnaireId,
    grillingAnswers = null,
    grillingMeta = null,
  }: {
    ticketId: string;
    questionnaireId: string;
    grillingAnswers: GrillingAnswers | null;
    grillingMeta: GrillingMeta | null;
  } = $props();

  let answers = $state<GrillingAnswers>(grillingAnswers ?? {});
  let meta = $state<GrillingMeta>(grillingMeta ?? {});

  const all = $derived(resolveQuestions(questionnaireId, QUESTIONNAIRES, meta));
  // Open questions first, then the rest — stable order for navigation.
  const ordered = $derived([
    ...all.filter((q) => questionStatus(q.id, questionnaireId, answers, meta) === 'open'),
    ...all.filter((q) => questionStatus(q.id, questionnaireId, answers, meta) !== 'open'),
  ]);
  const progress = $derived(grillingProgress(questionnaireId, QUESTIONNAIRES, answers, meta));

  let idx = $state(0);
  const current = $derived(ordered[Math.min(idx, Math.max(0, ordered.length - 1))]);
  const answerText = $derived(current ? (answers[questionnaireId]?.[current.id] ?? '') : '');

  function prev() { if (idx > 0) idx -= 1; }
  function next() { if (idx < ordered.length - 1) idx += 1; }
</script>

<section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 space-y-4">
  <header class="flex items-center justify-between">
    <h3 class="font-semibold">Grilling — Schritt für Schritt</h3>
    <span data-testid="grilling-progress" class="text-sm text-muted">
      Frage {Math.min(idx + 1, ordered.length)}/{ordered.length} ·
      {progress.answered} beantwortet · {progress.dismissed} verworfen
    </span>
  </header>

  {#if current}
    {#if current.section}<p class="text-xs uppercase text-muted">{current.section}</p>{/if}
    <p class="font-medium">{current.prompt}</p>
    <textarea class="w-full rounded-lg bg-dark border border-dark-lighter p-3" rows="4"
      value={answerText} aria-label="Antwort"></textarea>
    <div class="flex gap-2">
      <button type="button" onclick={prev} disabled={idx === 0}>Zurück</button>
      <button type="button" onclick={next} disabled={idx >= ordered.length - 1}>Weiter</button>
    </div>
  {:else}
    <p class="text-muted">Keine Fragen.</p>
  {/if}
</section>
```

- [ ] **Step 4: Run nav/render tests**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: PASS (render + nav).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/GrillingStepper.svelte website/src/components/admin/GrillingStepper.test.ts
git commit -m "feat(grilling): add GrillingStepper component (render + navigation)"
```

---

## Task 11: `GrillingStepper.svelte` — auto-save answer (debounced PATCH)

**Files:**
- Modify: `website/src/components/admin/GrillingStepper.svelte`
- Modify: `website/src/components/admin/GrillingStepper.test.ts`

> Reuse the SAME PATCH mechanic as `GrillingAnswersPanel` (`PATCH /api/admin/tickets/<id>` with `{ grillingAnswers }`, 800ms debounce). Cross-check the exact fetch shape in `GrillingAnswersPanel.svelte` before implementing, to keep payload identical.

- [ ] **Step 1: Write the failing test (debounced save sends merged grillingAnswers)**

Append to `GrillingStepper.test.ts`:

```ts
it('debounce-saves the typed answer via PATCH with merged grillingAnswers', async () => {
  vi.useFakeTimers();
  setup(null, null);
  const ta = screen.getByLabelText('Antwort') as HTMLTextAreaElement;
  await fireEvent.input(ta, { target: { value: 'Meine Antwort' } });
  vi.advanceTimersByTime(900);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, opts] = (global.fetch as any).mock.calls.at(-1);
  expect(url).toBe('/api/admin/tickets/t1');
  expect(opts.method).toBe('PATCH');
  const body = JSON.parse(opts.body);
  expect(body.grillingAnswers[QN].q1).toBe('Meine Antwort');
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts -t debounce-saves`
Expected: FAIL — no fetch on input.

- [ ] **Step 3: Implement auto-save**

In `GrillingStepper.svelte` `<script>`, add a debounced save and wire it to the textarea `oninput`:

```ts
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/admin/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function onInput(e: Event) {
    if (!current) return;
    const value = (e.target as HTMLTextAreaElement).value;
    const qn = answers[questionnaireId] ?? {};
    answers = { ...answers, [questionnaireId]: { ...qn, [current.id]: value } };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void patch({ grillingAnswers: answers }); }, 800);
  }
```

Change the textarea to `oninput={onInput}`.

- [ ] **Step 4: Run the save test**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: PASS (render + nav + save).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/GrillingStepper.svelte website/src/components/admin/GrillingStepper.test.ts
git commit -m "feat(grilling): debounced auto-save in GrillingStepper"
```

---

## Task 12: `GrillingStepper.svelte` — Verwerfen (dismiss) + Modus-Toggle

**Files:**
- Modify: `website/src/components/admin/GrillingStepper.svelte`
- Modify: `website/src/components/admin/GrillingStepper.test.ts`

- [ ] **Step 1: Write the failing test (dismiss PATCHes grillingMeta and drops from open queue)**

Append to `GrillingStepper.test.ts`:

```ts
it('Verwerfen adds the question to grillingMeta.dismissed and advances the queue', async () => {
  setup(null, null);
  const first = QUESTIONNAIRES[QN].sections[0].questions[0].label;
  expect(screen.getByText(first)).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: /Verwerfen/ }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [, opts] = (global.fetch as any).mock.calls.at(-1);
  const body = JSON.parse(opts.body);
  expect(body.grillingMeta[QN].dismissed).toContain('q1');
  // q1 left the open queue → first visible is now q2
  expect(screen.getByText(QUESTIONNAIRES[QN].sections[0].questions[1].label)).toBeTruthy();
});

it('mode toggle switches to the full panel hint', async () => {
  setup(null, null);
  await fireEvent.click(screen.getByRole('button', { name: /Alle anzeigen/ }));
  expect(screen.getByTestId('grilling-mode').textContent).toMatch(/Alle/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts -t Verwerfen`
Expected: FAIL — no Verwerfen button.

- [ ] **Step 3: Implement dismiss + toggle**

Add to `<script>`:

```ts
  let mode = $state<'step' | 'all'>('step');

  function dismiss() {
    if (!current) return;
    const entry = meta[questionnaireId] ?? { questions: [], dismissed: [] };
    if (!entry.dismissed.includes(current.id)) {
      meta = { ...meta, [questionnaireId]: { ...entry, dismissed: [...entry.dismissed, current.id] } };
    }
    if (idx >= ordered.length - 1 && idx > 0) idx -= 1;
    void patch({ grillingMeta: meta });
  }
```

Add buttons to the markup (within the `{#if current}` block, in the button row):

```svelte
      <button type="button" onclick={dismiss}>Verwerfen</button>
```

Add the mode toggle to the header:

```svelte
    <button type="button" data-testid="grilling-mode" onclick={() => (mode = mode === 'step' ? 'all' : 'step')}>
      {mode === 'step' ? 'Alle anzeigen' : 'Schritt für Schritt'}
    </button>
```

> `mode === 'all'` renders the existing `GrillingAnswersPanel` (passed down) — see Task 13 for wiring. In this task the toggle only flips the label/testid; the panel mount is added in Task 13.

- [ ] **Step 4: Run the dismiss/toggle tests**

Run: `cd website && pnpm vitest run src/components/admin/GrillingStepper.test.ts`
Expected: PASS (all 5 component tests).

- [ ] **Step 5: Verify S1 on the component**

Run: `wc -l website/src/components/admin/GrillingStepper.svelte`
Expected: < 500 (target ~230).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/GrillingStepper.svelte website/src/components/admin/GrillingStepper.test.ts
git commit -m "feat(grilling): dismiss + step/all mode toggle in GrillingStepper"
```

---

## Task 13: Wire the Stepper into the ticket detail (`[id].astro`, +8 budget)

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro` (1 import line + 1 embed block)

> **S1 budget +8** on `[id].astro` (392 → ≤400). Keep the addition to exactly: 1 import + a compact embed. If it would exceed 400, collapse the embed onto fewer lines (props on one line).

- [ ] **Step 1: Add the import (line 15 area, alongside the existing GrillingAnswersPanel import)**

After line 15 (`import GrillingAnswersPanel ...`), add:

```astro
import GrillingStepper from '../../../components/admin/GrillingStepper.svelte';
```

- [ ] **Step 2: Mount the Stepper above the existing panel (compact, ≤5 lines)**

Before the existing `<GrillingAnswersPanel ... />` block (line 154), insert:

```astro
          <GrillingStepper client:load ticketId={ticket.id} questionnaireId="coaching-sessions-v1" grillingAnswers={ticket.grillingAnswers ?? null} grillingMeta={ticket.grillingMeta ?? null} />
```

> `questionnaireId="coaching-sessions-v1"` is the current single registry questionnaire. No brand-domain literal (S3 safe). Absorbed-only questionnaires are reachable in a follow-up; v1 wires the registry questionnaire.

- [ ] **Step 3: Verify the +8 budget holds**

Run: `wc -l website/src/pages/admin/tickets/[id].astro`
Expected: ≤ 400. If > 400, collapse the embed further (it is already one logical line).

- [ ] **Step 4: Verify S1 ratchet does not trip**

Run: `node scripts/code-quality/check.mjs 2>&1 | grep "tickets/\[id\].astro" || echo "astro OK"`
Expected: `astro OK`.

- [ ] **Step 5: Commit**

```bash
git add "website/src/pages/admin/tickets/[id].astro"
git commit -m "feat(grilling): mount GrillingStepper in ticket detail"
```

---

## Task 14: Final verification (CI-equivalent — REQUIRED)

**Files:** none (verification only)

- [ ] **Step 1: Targeted tests for changed domains**

Run: `task test:changed`
Expected: vitest (grilling.test.ts + GrillingStepper.test.ts) + BATS (ticket-grill.bats) + quality all PASS.

- [ ] **Step 2: Full website vitest (confirm no regressions)**

Run: `cd website && pnpm vitest run src/lib/tickets/grilling.test.ts src/components/admin/GrillingStepper.test.ts`
Expected: PASS.

- [ ] **Step 3: Regenerate freshness artifacts (incl. test-inventory, repo-index)**

Run: `task freshness:regenerate`
Expected: regenerates `website/src/data/test-inventory.json` and friends; commit any changes.

- [ ] **Step 4: Regenerate + commit the test inventory (tests were added)**

Run: `task test:inventory`
Then: `git add website/src/data/test-inventory.json && git commit -m "chore: regen test inventory for grilling stepper" || echo "no inventory change"`
Expected: inventory committed if changed (CI fails otherwise).

- [ ] **Step 5: CI-equivalent freshness + quality ratchet (S1–S4 + baseline assertion)**

Run: `task freshness:check`
Expected: PASS. Specifically:
- S1: no worsened lines — `admin.ts`==677, `tickets-db.ts`==1096, `[id].astro`≤400.
- S2: no new import cycles (`grilling.ts` imports nothing from admin/db).
- S3: no brand-domain literals in `website/src/`.
- S4: no orphan scripts (no new `scripts/*.sh`; lib was extended, already referenced).
- Baseline key-count unchanged vs main (no new baseline entries).

- [ ] **Step 6: Commit any freshness regen output**

```bash
git add -A && git commit -m "chore: regen freshness artifacts for grilling absorb stepper" || echo "nothing to commit"
```

---

## Self-Review (against spec)

**Spec coverage:**
- Doc-Semantik gemischt + Split → Task 1 (`splitAnswered`), Task 2 (parser), Task 8 (CLI split). ✓
- Abfrage-Ort Admin-Cockpit (Stepper neben Panel) → Task 10–13. ✓
- Dismiss persistent (DB) → Task 4 (column), Task 12 (UI), Task 6 (PATCH whitelist). ✓
- Format-Toleranz (markers/ids/answer-markers/placeholders/frontmatter) → Task 2 + Task 8 (mirrored awk). ✓
- `grilling_meta` JSONB column → Task 4. ✓
- Import-Split write to answers + meta + summary comment → Task 8–9. ✓
- `--grilling-doc` as additional source + exactly-one validation → Task 7. ✓
- PATCH whitelist `grillingMeta` → Task 6; read path admin.ts → Task 5. ✓
- Pure functions parseGrillingDoc/splitAnswered/resolveQuestions/questionStatus/grillingProgress → Task 1–3. ✓
- GrillingStepper (toggle, single-question, debounce save, back/next, dismiss, counter) → Task 10–12. ✓
- Tests: bats (Task 7–9), vitest pure (Task 1–3), component (Task 10–12); inventory (Task 14). ✓
- YAGNI non-goals respected (no browser upload, no dedicated un-dismiss button, flat queue). ✓

**Gate risks (carry into execution):**
- `admin.ts` (budget 0) and `tickets-db.ts` (budget 0): every edit MUST be net-zero (append to existing lines). `wc -l` checks built into Tasks 4 & 5.
- `[id].astro` budget +8: Task 13 keeps the embed to one logical line; `wc -l` gate in-step.
- The bash awk parser (Task 8) must stay behaviorally aligned with `parseGrillingDoc` (Task 2) — same markers/placeholders/auto-ids — or absorb and stepper disagree.

**Placeholder scan:** no TBD/TODO; every code step shows full code. **Type consistency:** `GrillingMeta`/`ParsedQuestion`/`questionStatus(qId,qnId,answers,meta)` signatures identical across Tasks 1–12. ✓
