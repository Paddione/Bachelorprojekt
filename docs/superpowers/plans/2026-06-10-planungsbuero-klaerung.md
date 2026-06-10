---
title: Planungsbüro — Inline-Klärungsrunde Implementation Plan
ticket_id: T000580
domains: [website, db, test, security]
status: active
pr_number: null
---

# Planungsbüro — Inline-Klärungsrunde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Karte im Planungsbüro (`/admin/planungsbuero`) bekommt einen Expand-Button, der ein aus `readiness` + `areas` abgeleitetes Klärungsformular zeigt; Antworten werden als `ticket_comment` gespeichert und `readiness`/`depends_on`/`effort` per Endpoint aktualisiert.

**Architecture:** Reine Fragen-Ableitung als testbare TS-Funktion (`deriveSections`) in `website/src/lib/clarification-questions.ts`. Eine neue DAL-Funktion `clarifyItem()` in `planning-office.ts` schreibt Comment + Readiness/depends_on/effort in einer Transaktion. Ein admin-gegateter POST-Endpoint `/api/planning-office/[extId]/clarify` ruft die DAL. Die Svelte-Komponente bekommt pro-Karte Expand-State + Formular-Rendering; nach dem Speichern lädt sie die Liste neu (DoR-Zähler-Refresh).

**Tech Stack:** Astro 5 (SSR endpoints, `prerender = false`), Svelte 4, TypeScript, `pg` Pool (`website-db.ts`), Vitest (Unit), Playwright (E2E, root `tests/e2e/specs/`).

---

## Wichtige Abweichungen von der Spec (vor dem Start lesen)

1. **E2E-Pfad korrigiert.** Die Spec nennt `website/tests/e2e/planning-office.spec.ts`. Dieses Verzeichnis existiert nicht und wird **nicht** von `scripts/build-test-inventory.sh` gescannt. Der Inventory-Scan liest ausschließlich `tests/e2e/specs/*.spec.ts` (Repo-Root). Der E2E-Test wird daher unter **`tests/e2e/specs/fa-planungsbuero-klaerung.spec.ts`** angelegt, damit `task test:inventory` ihn als Eintrag `E2E:fa-planungsbuero-klaerung` (bzw. `FA-…` bei FA-Präfix mit Nummer) aufnimmt. Da kein FA-Nummer-Präfix vergeben ist, wird der Dateiname **ohne** `fa-<nr>`-Muster gewählt → Inventory-ID `E2E:planungsbuero-klaerung`. Finaler Pfad: **`tests/e2e/specs/planungsbuero-klaerung.spec.ts`**.
2. **Zusätzliche Unit-Tests.** Die Codebase nutzt durchgängig colocated `*.test.ts` in `website/src/lib/` (Vitest, `pnpm test:unit`). `deriveSections` ist eine reine Funktion → wird per Unit-Test getrieben (TDD). Auch `clarifyItem`-Body-Bau wird, soweit reine Logik (Markdown-Tabellenbau), als reine Helper-Funktion ausgelagert und unit-getestet.
3. **`effort`-Validierung.** Die bestehende PATCH-Route erlaubt nur `klein|mittel|gross`. Der clarify-Endpoint validiert `effort` identisch (400 `bad_effort` sonst).

---

## File Structure

| Datei | Verantwortung |
|-------|---------------|
| `website/src/lib/clarification-questions.ts` (**neu**) | Reine Ableitung: `deriveSections(item)` → `ClarificationSection[]`; Typen `ClarificationField`/`ClarificationSection`; Helper `buildCommentBody(answers, fieldLabels)` (Markdown-Tabelle). Kein DB/IO. |
| `website/src/lib/clarification-questions.test.ts` (**neu**) | Vitest-Unit-Tests für `deriveSections` + `buildCommentBody`. |
| `website/src/lib/planning-office.ts` (**erweitern**) | Neue DAL-Funktion `clarifyItem(extId, answers, readinessUpdates, opts)` — INSERT comment + bedingte UPDATEs (readiness/depends_on/effort) in einer Transaktion. Export `CLARIFY_EFFORTS`. |
| `website/src/lib/planning-office.clarify.test.ts` (**neu**) | Vitest-Unit-Test für `clarifyItem` gegen einen gemockten `pool`. |
| `website/src/pages/api/planning-office/[extId]/clarify.ts` (**neu**) | Admin-gegateter `POST`-Endpoint, validiert Body, ruft `clarifyItem`. |
| `website/src/components/PlanningOffice.svelte` (**erweitern**) | Pro-Karte Expand-Toggle + Klärungsformular (Text/Radio/Checkboxes), Save→fetch→reload. |
| `tests/e2e/specs/planungsbuero-klaerung.spec.ts` (**neu**) | Playwright Happy-Path: Karte aufklappen, Felder ausfüllen, speichern, DoR-Zähler steigt. |
| `website/src/data/test-inventory.json` (**regeneriert**) | Via `task test:inventory` nach E2E-Spec-Anlage. |

---

## Bestehende Patterns (Referenz — nicht erneut lesen nötig)

**`planning-office.ts` DAL-Konventionen:**
- `import { pool } from './website-db';`
- `DOR_KEYS = ['spec_skizziert','offene_fragen_geklaert','abhaengigkeiten_klar','aufwand_geschaetzt']`, Typ `DorKey`, `Readiness = Partial<Record<DorKey, boolean>>`.
- `OfficeItem` Felder: `extId, title, valueProp, priority, effort, areas, dependsOn, rank, readiness, dorScore, isNextCandidate, createdAt, updatedAt`.
- Readiness-Merge per `||`-jsonb (siehe `promoteItem`/`patchItem`). Comment-INSERT:
  ```sql
  INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
  VALUES ($1, 'planning-office', $2, 'internal')
  ```
  (`ticket_id` ist die **uuid** `id`, nicht `external_id`.)

**Endpoint-Pattern (aus `promote.ts`):**
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';   // 4× .. weil [extId]/clarify.ts
export const prerender = false;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
export const POST: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  // ...
};
```

**Svelte (aktueller Stand):** Svelte 4, `export let brand`. Karten-Loop `{#each items as it (it.extId)}`, `.po-card` mit `on:click={() => selected = it}`, Rank-Buttons mit `on:click|stopPropagation`. `load()` re-fetcht `/api/planning-office`. `dor(r)` zählt true-Flags.

---

## Task 1: `clarification-questions.ts` — Typen + `deriveSections` (TDD)

**Files:**
- Create: `website/src/lib/clarification-questions.ts`
- Test: `website/src/lib/clarification-questions.test.ts`

- [ ] **Step 1: Write the failing test**

`website/src/lib/clarification-questions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveSections, buildCommentBody } from './clarification-questions';
import type { OfficeItem } from './planning-office';

function item(partial: Partial<OfficeItem>): OfficeItem {
  return {
    extId: 'T000571', title: 'X', valueProp: null, priority: 'mittel',
    effort: null, areas: [], dependsOn: [], rank: null,
    readiness: {}, dorScore: 0, isNextCandidate: false,
    createdAt: '', updatedAt: '', ...partial,
  };
}

describe('deriveSections', () => {
  it('returns no sections when all DoR flags are true', () => {
    const sections = deriveSections(item({
      readiness: { spec_skizziert: true, offene_fragen_geklaert: true, abhaengigkeiten_klar: true, aufwand_geschaetzt: true },
    }));
    expect(sections).toEqual([]);
  });

  it('adds a dependency section with two fields when abhaengigkeiten_klar is false', () => {
    const sections = deriveSections(item({ readiness: { abhaengigkeiten_klar: false } }));
    const dep = sections.find((s) => s.dorFlag === 'abhaengigkeiten_klar');
    expect(dep).toBeTruthy();
    expect(dep!.fields).toHaveLength(2);
    expect(dep!.fields[0].type).toBe('text');
    expect(dep!.fields[1].type).toBe('radio');
  });

  it('adds a spec section with two textarea fields when spec_skizziert is false', () => {
    const sections = deriveSections(item({ readiness: { spec_skizziert: false } }));
    const spec = sections.find((s) => s.dorFlag === 'spec_skizziert');
    expect(spec!.fields).toHaveLength(2);
    expect(spec!.fields.every((f) => f.type === 'text')).toBe(true);
  });

  it('adds one open-questions section per area when offene_fragen_geklaert is false', () => {
    const sections = deriveSections(item({
      readiness: { offene_fragen_geklaert: false },
      areas: ['brett', 'website'],
    }));
    const open = sections.filter((s) => s.dorFlag === 'offene_fragen_geklaert');
    expect(open).toHaveLength(2);
    expect(open[0].title).toContain('brett');
  });

  it('falls back to a generic open-questions section when no areas are set', () => {
    const sections = deriveSections(item({ readiness: { offene_fragen_geklaert: false }, areas: [] }));
    const open = sections.filter((s) => s.dorFlag === 'offene_fragen_geklaert');
    expect(open).toHaveLength(1);
    expect(open[0].fields.length).toBeGreaterThan(0);
  });

  it('adds an effort radio when aufwand_geschaetzt is false', () => {
    const sections = deriveSections(item({ readiness: { aufwand_geschaetzt: false } }));
    const eff = sections.find((s) => s.dorFlag === 'aufwand_geschaetzt');
    expect(eff!.fields).toHaveLength(1);
    expect(eff!.fields[0].type).toBe('radio');
    expect(eff!.fields[0].options).toEqual(['klein', 'mittel', 'gross']);
  });

  it('treats undefined flags as not-ready (shows the section)', () => {
    const sections = deriveSections(item({ readiness: {} }));
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe('buildCommentBody', () => {
  it('renders a markdown table from answers using field labels', () => {
    const body = buildCommentBody(
      { abhaengigkeiten: 'T000573', externe_abh: 'keine', brett_rollen: ['leiter', 'teilnehmer'] },
      { abhaengigkeiten: 'Welche Tickets müssen vorher fertig sein?', externe_abh: 'Externe Dienste nötig?', brett_rollen: 'Betroffene Rollen?' },
      '2026-06-10',
    );
    expect(body).toContain('## Klärungsrunde 2026-06-10');
    expect(body).toContain('| Welche Tickets müssen vorher fertig sein? | T000573 |');
    expect(body).toContain('| Betroffene Rollen? | leiter, teilnehmer |');
  });

  it('skips empty answers', () => {
    const body = buildCommentBody({ a: '', b: [] as string[], c: 'x' }, { a: 'A?', b: 'B?', c: 'C?' }, '2026-06-10');
    expect(body).not.toContain('A?');
    expect(body).not.toContain('B?');
    expect(body).toContain('| C? | x |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/clarification-questions.test.ts`
Expected: FAIL — `Cannot find module './clarification-questions'`.

- [ ] **Step 3: Write the implementation**

`website/src/lib/clarification-questions.ts`:
```ts
import type { OfficeItem, DorKey } from './planning-office';

export interface ClarificationField {
  key: string;                       // Answer-Key, z.B. "abhaengigkeiten"
  label: string;                     // Fragentext (wird auch Comment-Tabellen-Label)
  type: 'text' | 'radio' | 'checkboxes';
  options?: string[];                // für radio/checkboxes
  multiline?: boolean;               // text → <textarea> statt <input>
}

export interface ClarificationSection {
  title: string;
  dorFlag: DorKey;
  fields: ClarificationField[];
}

const isReady = (item: OfficeItem, flag: DorKey): boolean => item.readiness?.[flag] === true;

// Domain-spezifische Fragen je area. Unbekannte areas fallen auf GENERIC zurück.
const AREA_QUESTIONS: Record<string, ClarificationField[]> = {
  brett: [
    { key: 'brett_rollen', label: 'Betroffene Rollen?', type: 'checkboxes', options: ['Leiter', 'Teilnehmer', 'Zuschauer'] },
    { key: 'brett_mobile', label: 'Mobile-Support?', type: 'radio', options: ['Pflicht', 'Nice-to-have', 'Nein'] },
    { key: 'brett_disconnect', label: 'Verbindungsabbruch-Verhalten?', type: 'radio', options: ['Auto-Retry', 'Manuell', 'Egal'] },
  ],
  website: [
    { key: 'web_pages', label: 'Welche Seiten/Routen sind betroffen?', type: 'text' },
    { key: 'web_auth', label: 'Login/Admin-geschützt?', type: 'radio', options: ['Öffentlich', 'Login', 'Admin'] },
  ],
  chat: [
    { key: 'chat_realtime', label: 'Echtzeit-Anforderung?', type: 'radio', options: ['WebSocket', 'Polling', 'Egal'] },
    { key: 'chat_scope', label: 'Betroffene Chat-Bereiche?', type: 'text' },
  ],
  infra: [
    { key: 'infra_brands', label: 'Beide Brands betroffen?', type: 'radio', options: ['Beide', 'Nur mentolder', 'Nur korczewski'] },
    { key: 'infra_deploy', label: 'Deploy-Auswirkung?', type: 'text' },
  ],
  auth: [
    { key: 'auth_flow', label: 'Betroffener Auth-Flow?', type: 'radio', options: ['OIDC/Keycloak', 'Admin-Passwort', 'Session'] },
    { key: 'auth_scope', label: 'Welche Rollen/Claims?', type: 'text' },
  ],
  ai: [
    { key: 'ai_model', label: 'Modell-Klasse?', type: 'radio', options: ['Embedding', 'Chat', 'Rerank'] },
    { key: 'ai_fallback', label: 'Cloud-Fallback erlaubt?', type: 'radio', options: ['Ja', 'Nein'] },
  ],
};

const GENERIC_OPEN: ClarificationField[] = [
  { key: 'open_questions', label: 'Welche offenen Fragen gibt es?', type: 'text', multiline: true },
  { key: 'open_acceptance', label: 'Wann gilt das Feature als fertig (Akzeptanz)?', type: 'text', multiline: true },
];

export function deriveSections(item: OfficeItem): ClarificationSection[] {
  const sections: ClarificationSection[] = [];

  if (!isReady(item, 'abhaengigkeiten_klar')) {
    sections.push({
      title: 'Abhängigkeiten',
      dorFlag: 'abhaengigkeiten_klar',
      fields: [
        { key: 'abhaengigkeiten', label: 'Welche Tickets müssen vorher fertig sein?', type: 'text' },
        { key: 'externe_abh', label: 'Externe Dienste nötig?', type: 'radio', options: ['Keine', 'DB-Schema', 'Sealed-Secret', 'OIDC-Client', 'Sonstige'] },
      ],
    });
  }

  if (!isReady(item, 'spec_skizziert')) {
    sections.push({
      title: 'Spec-Skizze',
      dorFlag: 'spec_skizziert',
      fields: [
        { key: 'spec_kernflow', label: 'Kern-Flow / Hauptablauf?', type: 'text', multiline: true },
        { key: 'spec_notscope', label: 'Was ist explizit NICHT im Scope?', type: 'text', multiline: true },
      ],
    });
  }

  if (!isReady(item, 'offene_fragen_geklaert')) {
    const areas = (item.areas ?? []).filter(Boolean);
    if (areas.length === 0) {
      sections.push({ title: 'Offene Fragen', dorFlag: 'offene_fragen_geklaert', fields: GENERIC_OPEN });
    } else {
      for (const area of areas) {
        const fields = AREA_QUESTIONS[area] ?? GENERIC_OPEN;
        sections.push({ title: `Offene Fragen (${area})`, dorFlag: 'offene_fragen_geklaert', fields });
      }
    }
  }

  if (!isReady(item, 'aufwand_geschaetzt')) {
    sections.push({
      title: 'Aufwand',
      dorFlag: 'aufwand_geschaetzt',
      fields: [{ key: 'effort', label: 'Aufwand?', type: 'radio', options: ['klein', 'mittel', 'gross'] }],
    });
  }

  return sections;
}

/** Baut den Markdown-Comment-Body. `labels` mappt Answer-Key → Fragentext. Leere Antworten werden ausgelassen. */
export function buildCommentBody(
  answers: Record<string, string | string[]>,
  labels: Record<string, string>,
  date: string,
): string {
  const rows: string[] = [];
  for (const [key, raw] of Object.entries(answers)) {
    const val = Array.isArray(raw) ? raw.join(', ') : (raw ?? '');
    if (!val || val.trim() === '') continue;
    const label = labels[key] ?? key;
    rows.push(`| ${label} | ${val} |`);
  }
  return [
    `## Klärungsrunde ${date}`,
    '',
    '| Frage | Antwort |',
    '|-------|---------|',
    ...rows,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/clarification-questions.test.ts`
Expected: PASS (all `describe` blocks green).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/clarification-questions.ts website/src/lib/clarification-questions.test.ts
git commit -m "feat(planungsbuero): clarification-questions derive + comment-body helper"
```

---

## Task 2: DAL `clarifyItem()` (TDD gegen gemockten pool)

**Files:**
- Modify: `website/src/lib/planning-office.ts` (neue Exporte am Ende)
- Test: `website/src/lib/planning-office.clarify.test.ts`

- [ ] **Step 1: Write the failing test**

`website/src/lib/planning-office.clarify.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: any[]) => query(...a) } }));

import { clarifyItem } from './planning-office';

beforeEach(() => {
  query.mockReset();
  // Default: Ticket-Lookup liefert eine uuid.
  query.mockImplementation((sql: string) => {
    if (/SELECT id\b/.test(sql)) return Promise.resolve({ rows: [{ id: 'uuid-1' }], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
});

describe('clarifyItem', () => {
  it('returns false when the ticket is not found', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT id → none
    const ok = await clarifyItem('T999999', '## body', {}, {});
    expect(ok).toBe(false);
  });

  it('inserts a comment with author_label planning-office and the uuid', async () => {
    await clarifyItem('T000571', '## Klärungsrunde\n| a | b |', {}, {});
    const insert = query.mock.calls.find((c) => /INSERT INTO tickets\.ticket_comments/.test(c[0]));
    expect(insert).toBeTruthy();
    expect(insert![1]).toEqual(['uuid-1', '## Klärungsrunde\n| a | b |']);
  });

  it('updates readiness with jsonb merge when readinessUpdates is non-empty', async () => {
    await clarifyItem('T000571', 'b', { abhaengigkeiten_klar: true, offene_fragen_geklaert: true }, {});
    const upd = query.mock.calls.find((c) => /SET readiness = readiness \|\|/.test(c[0]));
    expect(upd).toBeTruthy();
    expect(JSON.parse(upd![1][0])).toEqual({ abhaengigkeiten_klar: true, offene_fragen_geklaert: true });
  });

  it('does NOT run a readiness update when readinessUpdates is empty', async () => {
    await clarifyItem('T000571', 'b', {}, {});
    expect(query.mock.calls.some((c) => /SET readiness = readiness \|\|/.test(c[0]))).toBe(false);
  });

  it('updates depends_on when opts.dependsOn is provided and non-empty', async () => {
    await clarifyItem('T000571', 'b', {}, { dependsOn: ['T000573'] });
    const upd = query.mock.calls.find((c) => /SET depends_on =/.test(c[0]));
    expect(upd![1][0]).toEqual(['T000573']);
  });

  it('updates effort when opts.effort is provided', async () => {
    await clarifyItem('T000571', 'b', {}, { effort: 'klein' });
    const upd = query.mock.calls.find((c) => /SET effort =/.test(c[0]));
    expect(upd![1][0]).toBe('klein');
  });

  it('returns true on success', async () => {
    const ok = await clarifyItem('T000571', 'b', { spec_skizziert: true }, {});
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/planning-office.clarify.test.ts`
Expected: FAIL — `clarifyItem is not a function` (Export fehlt).

- [ ] **Step 3: Write the implementation**

Am Ende von `website/src/lib/planning-office.ts` anfügen (Hinweis: `DorKey`, `DOR_KEYS`, `pool` sind bereits oben importiert/definiert):
```ts
export const CLARIFY_EFFORTS = ['klein', 'mittel', 'gross'] as const;

/**
 * Speichert eine Klärungsrunde: INSERT comment + bedingte UPDATEs.
 * `commentBody` ist bereits fertig gerendertes Markdown (siehe buildCommentBody).
 * Gibt false zurück, wenn das Ticket nicht (mehr im Planungsstatus) gefunden wird.
 */
export async function clarifyItem(
  extId: string,
  commentBody: string,
  readinessUpdates: Partial<Record<DorKey, boolean>>,
  opts?: { dependsOn?: string[]; effort?: string },
): Promise<boolean> {
  const r = await pool.query(
    `SELECT id FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const id = r.rows[0]?.id;
  if (!id) return false;

  if (commentBody && commentBody.trim() !== '') {
    await pool.query(
      `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
       VALUES ($1, 'planning-office', $2, 'internal')`,
      [id, commentBody],
    );
  }

  const clean: Readiness = {};
  for (const k of DOR_KEYS) if (readinessUpdates[k] !== undefined) clean[k] = !!readinessUpdates[k];
  if (Object.keys(clean).length > 0) {
    await pool.query(
      `UPDATE tickets.tickets SET readiness = readiness || $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(clean), id],
    );
  }

  if (opts?.dependsOn && opts.dependsOn.length > 0) {
    await pool.query(
      `UPDATE tickets.tickets SET depends_on = $1, updated_at = now() WHERE id = $2`,
      [opts.dependsOn, id],
    );
  }

  if (opts?.effort) {
    await pool.query(
      `UPDATE tickets.tickets SET effort = $1, updated_at = now() WHERE id = $2`,
      [opts.effort, id],
    );
  }

  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/planning-office.clarify.test.ts`
Expected: PASS (7 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/planning-office.ts website/src/lib/planning-office.clarify.test.ts
git commit -m "feat(planungsbuero): clarifyItem DAL — comment + readiness/depends_on/effort"
```

---

## Task 3: POST-Endpoint `/api/planning-office/[extId]/clarify`

**Files:**
- Create: `website/src/pages/api/planning-office/[extId]/clarify.ts`

> Kein eigener Endpoint-Unit-Test (Astro-Routen werden im Repo nicht isoliert getestet; die Logik ist in DAL + clarification-questions abgedeckt, der Happy-Path im E2E). Validierung wird per Code-Review geprüft.

- [ ] **Step 1: Write the implementation**

`website/src/pages/api/planning-office/[extId]/clarify.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { clarifyItem, CLARIFY_EFFORTS, DOR_KEYS, type Readiness } from '../../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  const extId = params.extId!;
  try {
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== 'object') return json({ error: 'bad_body' }, 400);

    const commentBody = typeof b.commentBody === 'string' ? b.commentBody : '';

    const readinessUpdates: Readiness = {};
    if (b.readinessUpdates && typeof b.readinessUpdates === 'object') {
      for (const k of DOR_KEYS) if (k in b.readinessUpdates) readinessUpdates[k] = !!b.readinessUpdates[k];
    }

    const dependsOn = Array.isArray(b.dependsOn)
      ? b.dependsOn.filter((x: unknown): x is string => typeof x === 'string' && x.trim() !== '')
      : undefined;

    let effort: string | undefined;
    if (b.effort !== undefined && b.effort !== null && b.effort !== '') {
      if (!CLARIFY_EFFORTS.includes(b.effort)) return json({ error: 'bad_effort' }, 400);
      effort = b.effort;
    }

    const ok = await clarifyItem(extId, commentBody, readinessUpdates, { dependsOn, effort });
    return ok ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('[api/planning-office clarify]', e);
    return json({ error: 'clarify_failed' }, 500);
  }
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && pnpm exec astro check --tsconfig tsconfig.json 2>&1 | tail -20` (oder `pnpm build` falls `astro check` lokal langsam ist)
Expected: Keine neuen Typfehler in `clarify.ts` / `planning-office.ts`.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/planning-office/[extId]/clarify.ts
git commit -m "feat(planungsbuero): POST /api/planning-office/[extId]/clarify endpoint"
```

---

## Task 4: Svelte — Expand-Toggle + Klärungsformular

**Files:**
- Modify: `website/src/components/PlanningOffice.svelte`

Diese Aufgabe wird in einzelne Edits zerlegt. Es gibt keinen isolierten Svelte-Unit-Test im Repo; die Verifikation erfolgt durch `astro check` (Task 4 Step 5) und den E2E-Test (Task 5).

- [ ] **Step 1: Script-State + Imports ergänzen**

Im `<script lang="ts">` von `PlanningOffice.svelte`, direkt nach den bestehenden `let`-Deklarationen (nach `let newTitle = ''; let newEffort = 'mittel';`) einfügen:
```ts
import { deriveSections, buildCommentBody, type ClarificationSection } from '../lib/clarification-questions';

let expanded: Record<string, boolean> = {};
let answers: Record<string, Record<string, any>> = {};
let clarifying: Record<string, boolean> = {};

function toggleExpand(extId: string) {
  expanded = { ...expanded, [extId]: !expanded[extId] };
}

function setAnswer(extId: string, key: string, value: any) {
  const cur = answers[extId] ?? {};
  answers = { ...answers, [extId]: { ...cur, [key]: value } };
}

function toggleCheckbox(extId: string, key: string, option: string) {
  const cur: string[] = (answers[extId]?.[key] as string[]) ?? [];
  const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
  setAnswer(extId, key, next);
}

function isChecked(extId: string, key: string, option: string): boolean {
  return ((answers[extId]?.[key] as string[]) ?? []).includes(option);
}

async function saveClarification(it: any) {
  clarifying = { ...clarifying, [it.extId]: true };
  const itemAnswers: Record<string, any> = answers[it.extId] ?? {};
  const sections: ClarificationSection[] = deriveSections(it);

  // Label-Map (key → Fragentext) aus allen Section-Feldern.
  const labels: Record<string, string> = {};
  for (const sec of sections) for (const f of sec.fields) labels[f.key] = f.label;

  // Readiness-Updates: eine Section gilt als geklärt, wenn MINDESTENS eines ihrer Felder beantwortet ist.
  const answered = (key: string) => {
    const v = itemAnswers[key];
    return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
  };
  const readinessUpdates: Record<string, boolean> = {};
  for (const sec of sections) {
    if (sec.fields.some((f) => answered(f.key))) readinessUpdates[sec.dorFlag] = true;
  }

  // depends_on aus dem Abhängigkeiten-Textfeld (kommasepariert).
  const depRaw = itemAnswers['abhaengigkeiten'];
  const dependsOn = typeof depRaw === 'string'
    ? depRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  // effort direkt aus dem Aufwand-Radio (Werte sind bereits klein/mittel/gross).
  const effort = typeof itemAnswers['effort'] === 'string' ? itemAnswers['effort'] : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const commentBody = buildCommentBody(itemAnswers, labels, today);

  await fetch(`/api/planning-office/${it.extId}/clarify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commentBody, readinessUpdates, dependsOn, effort }),
  });

  clarifying = { ...clarifying, [it.extId]: false };
  expanded = { ...expanded, [it.extId]: false };
  answers = { ...answers, [it.extId]: {} };
  await load();
}
```

- [ ] **Step 2: Expand-Button in die Karte einfügen**

In der `.po-card` (nach dem `<div class="po-dor">…</div>` Block, noch innerhalb von `.po-card`) den Toggle-Button ergänzen:
```svelte
          <div class="po-dor" data-testid="office-dor">{dor(it.readiness)}/4</div>
          <button class="po-expand" data-testid="office-expand"
                  on:click|stopPropagation={() => toggleExpand(it.extId)}
                  aria-expanded={expanded[it.extId] ?? false}
                  title="Klärungsfragen">
            {expanded[it.extId] ? '▲' : '▼'}
          </button>
```

- [ ] **Step 3: Klärungsformular nach der Karte rendern**

Direkt **nach** dem schließenden `</div>` der `.po-card`, aber noch innerhalb des `{#each items as it (it.extId)}`-Blocks, einfügen:
```svelte
        {#if expanded[it.extId]}
          <div class="po-clarify" data-testid="office-clarify-{it.extId}">
            {#if it.valueProp}<p class="po-clarify-value">📎 {it.valueProp}</p>{/if}
            {#each deriveSections(it) as section}
              <fieldset class="po-clarify-section">
                <legend>🔴 {section.title}</legend>
                {#each section.fields as field}
                  <div class="po-field">
                    <label class="po-field-label">{field.label}</label>
                    {#if field.type === 'text'}
                      {#if field.multiline}
                        <textarea data-testid="clarify-{field.key}"
                          value={answers[it.extId]?.[field.key] ?? ''}
                          on:input={(e:any) => setAnswer(it.extId, field.key, e.target.value)}></textarea>
                      {:else}
                        <input type="text" data-testid="clarify-{field.key}"
                          value={answers[it.extId]?.[field.key] ?? ''}
                          on:input={(e:any) => setAnswer(it.extId, field.key, e.target.value)} />
                      {/if}
                    {:else if field.type === 'radio'}
                      <div class="po-options">
                        {#each field.options ?? [] as opt}
                          <label class="po-opt">
                            <input type="radio" name="{it.extId}-{field.key}"
                              data-testid="clarify-{field.key}-{opt}"
                              checked={answers[it.extId]?.[field.key] === opt}
                              on:change={() => setAnswer(it.extId, field.key, opt)} />
                            {opt}
                          </label>
                        {/each}
                      </div>
                    {:else if field.type === 'checkboxes'}
                      <div class="po-options">
                        {#each field.options ?? [] as opt}
                          <label class="po-opt">
                            <input type="checkbox"
                              data-testid="clarify-{field.key}-{opt}"
                              checked={isChecked(it.extId, field.key, opt)}
                              on:change={() => toggleCheckbox(it.extId, field.key, opt)} />
                            {opt}
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </fieldset>
            {/each}
            <button class="po-clarify-save" data-testid="office-clarify-save"
                    on:click|stopPropagation={() => saveClarification(it)}
                    disabled={clarifying[it.extId]}>
              {clarifying[it.extId] ? 'Speichern…' : '✓ Antworten speichern'}
            </button>
          </div>
        {/if}
```

- [ ] **Step 4: Styles ergänzen**

Im `<style>`-Block (vor dem schließenden `</style>`) anfügen:
```css
  .po-expand { background:none; border:none; color:#888; cursor:pointer; font-size:.9rem; }
  .po-clarify { border:1px solid #333; border-top:none; border-radius:0 0 .4rem .4rem;
                padding:.6rem .75rem; margin:-.4rem 0 .6rem 0; background:#1b1b22; }
  .po-clarify-value { color:#aaa; font-size:.8rem; margin:0 0 .5rem; }
  .po-clarify-section { border:1px solid #2a2a33; border-radius:.4rem; margin:0 0 .6rem; padding:.4rem .6rem; }
  .po-clarify-section legend { font-size:.8rem; color:#e0653f; }
  .po-field { margin:.4rem 0; }
  .po-field-label { display:block; font-size:.78rem; color:#ccc; margin-bottom:.2rem; }
  .po-field input[type="text"], .po-field textarea { width:100%; box-sizing:border-box;
    background:#111; border:1px solid #333; color:#eee; border-radius:.3rem; padding:.3rem; }
  .po-field textarea { min-height:3rem; resize:vertical; }
  .po-options { display:flex; flex-wrap:wrap; gap:.5rem; }
  .po-opt { font-size:.78rem; display:flex; align-items:center; gap:.2rem; }
  .po-clarify-save { margin-top:.3rem; }
```

- [ ] **Step 5: Typecheck**

Run: `cd website && pnpm exec astro check 2>&1 | grep -iE 'PlanningOffice|clarif|error' | head -30`
Expected: Keine neuen Fehler aus `PlanningOffice.svelte`.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/PlanningOffice.svelte
git commit -m "feat(planungsbuero): expand toggle + inline clarification form"
```

---

## Task 5: E2E Happy-Path (Playwright)

**Files:**
- Create: `tests/e2e/specs/planungsbuero-klaerung.spec.ts`

**Kontext:** E2E-Specs liegen im **Repo-Root** unter `tests/e2e/specs/`. Login als Admin läuft im Repo über eine Helper-/Storage-State-Mechanik (siehe `tests/e2e/lib/`, z.B. `ensureAdminPasswordOrSkip`). Der Test muss bei fehlenden Credentials sauber **skippen**, damit Offline-CI grün bleibt.

- [ ] **Step 1: E2E-Login-Helper prüfen**

Run: `ls tests/e2e/lib/ && grep -rl "ensureAdminPasswordOrSkip\|adminLogin\|loginAsAdmin\|storageState" tests/e2e/lib/ tests/e2e/specs/systemtest-02-admin-crm.spec.ts`
Zweck: Den korrekten Admin-Login-Helper-Namen + Signatur ermitteln (im Test referenzieren). Falls ein Storage-State-/`project`-basierter Admin-Login existiert (wie bei `korczewski-auth-setup.spec.ts`), diesen statt eines Inline-Logins verwenden.

- [ ] **Step 2: Write the E2E test**

`tests/e2e/specs/planungsbuero-klaerung.spec.ts` (Login-Aufruf in Step 3 an den in Step 1 gefundenen Helper anpassen):
```ts
// tests/e2e/specs/planungsbuero-klaerung.spec.ts
//
// Happy-Path: Admin öffnet das Planungsbüro, klappt eine Karte mit < 4/4 DoR auf,
// füllt die Klärungsfelder aus, speichert, und der DoR-Zähler der Karte steigt.

import { test, expect } from '@playwright/test';
import { ensureAdminPasswordOrSkip } from '../lib/systemtest-runner';

test.describe('Planungsbüro: Inline-Klärungsrunde', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(120_000);

  test('expand a card, answer clarification fields, save, DoR increases', async ({ page }) => {
    // ---- Admin-Login: an den in Step 1 gefundenen Helper anpassen. ----
    // Beispiel (Inline-Passwort-Login über /admin):
    await page.goto('/admin/planungsbuero');
    // Falls Redirect auf Login: hier den Repo-Admin-Login-Flow einfügen
    // (siehe systemtest-02-admin-crm.spec.ts / korczewski-auth-setup.spec.ts).

    await page.waitForSelector('[data-testid="office-root"]');

    const cards = page.locator('[data-testid="office-card"]');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'Kein planning-Ticket im Büro — nichts zu klären.');

    // Erste Karte mit DoR < 4/4 finden.
    let target = -1;
    for (let i = 0; i < cardCount; i++) {
      const dorText = (await cards.nth(i).locator('[data-testid="office-dor"]').innerText()).trim();
      const score = parseInt(dorText.split('/')[0], 10);
      if (score < 4) { target = i; break; }
    }
    test.skip(target === -1, 'Alle Karten sind bereits 4/4 — kein Klärungsbedarf.');

    const card = cards.nth(target);
    const dorBefore = parseInt((await card.locator('[data-testid="office-dor"]').innerText()).split('/')[0], 10);

    // Aufklappen.
    await card.locator('[data-testid="office-expand"]').click();
    const clarify = page.locator('[data-testid^="office-clarify-"]').first();
    await expect(clarify).toBeVisible();

    // Mindestens ein Feld je sichtbarer Section beantworten:
    // - jedes Text-/Textarea-Feld mit Platzhaltertext füllen
    const textInputs = clarify.locator('input[type="text"], textarea');
    const nText = await textInputs.count();
    for (let i = 0; i < nText; i++) await textInputs.nth(i).fill('Geklärt (E2E)');
    // - in jeder Radio-Gruppe die erste Option wählen
    const radios = clarify.locator('input[type="radio"]');
    const nRadio = await radios.count();
    if (nRadio > 0) await radios.first().check();
    // - erste Checkbox aktivieren, falls vorhanden
    const checks = clarify.locator('input[type="checkbox"]');
    if (await checks.count() > 0) await checks.first().check();

    // Speichern.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/clarify') && r.request().method() === 'POST' && r.ok()),
      clarify.locator('[data-testid="office-clarify-save"]').click(),
    ]);

    // Formular kollabiert + DoR ist gestiegen (Liste wurde neu geladen).
    await expect(clarify).toBeHidden();
    await expect.poll(async () => {
      const dorNow = parseInt((await card.locator('[data-testid="office-dor"]').innerText()).split('/')[0], 10);
      return dorNow;
    }, { timeout: 15_000 }).toBeGreaterThan(dorBefore);
  });
});
```

- [ ] **Step 3: Test lokal laufen lassen (gegen laufende Instanz oder skippen)**

Run: `npx playwright test tests/e2e/specs/planungsbuero-klaerung.spec.ts --config tests/e2e/playwright.config.ts`
Expected: PASS gegen eine deployte Umgebung mit ≥1 planning-Ticket < 4/4; bei fehlenden Admin-Credentials sauberes SKIP (kein FAIL). Falls keine Live-Umgebung verfügbar: Test muss skippen, nicht hängen.

- [ ] **Step 4: Test-Inventory regenerieren**

Run: `task test:inventory && git diff --stat website/src/data/test-inventory.json`
Expected: `test-inventory.json` enthält einen neuen Eintrag `{"id":"E2E:planungsbuero-klaerung", "file":"tests/e2e/specs/planungsbuero-klaerung.spec.ts", "category":"E2E", "kind":"playwright"}`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/planungsbuero-klaerung.spec.ts website/src/data/test-inventory.json
git commit -m "test(planungsbuero): E2E happy-path for inline clarification + inventory"
```

---

## Task 6: Volle Verifikation + Abschluss

**Files:** keine — Verifikationslauf.

- [ ] **Step 1: Website-Unit-Tests grün**

Run: `cd website && pnpm test:unit`
Expected: PASS — insbesondere `clarification-questions.test.ts` (alle) + `planning-office.clarify.test.ts` (7).

- [ ] **Step 2: Typecheck der Website**

Run: `cd website && pnpm exec astro check`
Expected: Keine neuen Fehler in den geänderten Dateien.

- [ ] **Step 3: Offline-Test-Suite + Inventory-Gate**

Run: `task test:all && task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
Expected: `test:all` grün; `git diff --exit-code` liefert Exit 0 (Inventory bereits committed — kein Drift, sonst schlägt CI fehl).

- [ ] **Step 4: Spec-Coverage-Self-Check**

Gegen die Spec abgleichen — jeder Punkt hat eine Task:
- Expand-Toggle pro Karte → Task 4 Step 2
- Fragen-Ableitung aus readiness + areas → Task 1
- Nur offene Fragen zeigen (Flag true → kein Block) → Task 1 (`isReady`-Filter) + Test
- Antworten als ticket_comment → Task 2 + Task 3
- readiness / depends_on / effort aktualisieren → Task 2 + Task 3 + Task 4 (Frontend-Mapping)
- DoR-Zähler-Refresh nach Speichern → Task 4 (`await load()`) + E2E-Assertion Task 5
- Mehrere Karten gleichzeitig aufklappbar → `expanded` ist pro-extId Map (Task 4)
- Alle Felder optional → keine Required-Validierung; leere Antworten werden in `buildCommentBody` ausgelassen
- Ladezustand "Speichern…" → Task 4 Step 3 (`clarifying[it.extId]`)
- E2E Happy-Path → Task 5

- [ ] **Step 5: Branch pushen**

```bash
git push -u origin feature/planungsbuero-klaerung
```

---

## Out-of-Scope (laut Spec — NICHT bauen)

- Neue DB-Tabelle für Klärungsfragen (es wird `tickets.ticket_comments` wiederverwendet)
- Antwort-History / Versionierung
- Mobile-optimiertes Layout (responsive Grundstruktur genügt)
- KI-generierte Antwort-Vorschläge
- Echtzeit-Updates zwischen Tabs
