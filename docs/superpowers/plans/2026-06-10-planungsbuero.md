---
title: Planungsbüro / Feature-Backlog Implementation Plan
ticket_id: T000570
domains: [website, infra, db, test]
status: active
pr_number: null
---

# Planungsbüro / Feature-Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine voll-interaktive „Planungsbüro"-Ansicht, die ausgewählte Feature-Ideen mit planungskritischen Metadaten + Definition-of-Ready kuratiert und den nächsten Kandidaten kontextreich an `dev-flow-plan` übergibt.

**Architecture:** Neuer Ticket-Status `planning` (vor `backlog`), additive Spalten auf `tickets.tickets`, ein read/write-DAL `planning-office.ts` analog `factory-floor.ts`, vier `isAdmin()`-gated API-Routen, eine eigene Svelte-Ansicht `PlanningOffice.svelte`, sowie `ticket.sh plan-meta` für CLI/feature-intake-Seeding. Die Factory rührt `planning` nicht an — sie greift erst ab `backlog`.

**Tech Stack:** Astro 5 + Svelte (Tailwind v4), PostgreSQL (`website` DB, Schema `tickets`), Bash (`scripts/ticket.sh`), BATS, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-10-planungsbuero-design.md`

**Worktree:** `/tmp/wt-planungsbuero` (Branch `feature/planungsbuero`). Alle Pfade relativ dazu.

---

## Vorab-Befund (beim Erkunden bestätigt)

- Die `status`-CHECK-Constraint ist **inline & unbenannt** in `CREATE TABLE` (`tickets-db.ts:44-45`) → Postgres benennt sie `tickets_status_check`. Erweiterung daher per `DROP CONSTRAINT IF EXISTS tickets_status_check` + `ADD CONSTRAINT … CHECK (… 'planning' …)` (idempotent).
- **Kein bestehender Consumer nutzt `status NOT IN (...)`** für Feature-Tickets. Geprüft: `factory-floor.ts` filtert ausschließlich positiv (`status='backlog'`, `status IN ('in_progress','in_review')`, `status='done'`). `planning` taucht dort also nicht fälschlich auf. → Keine Bestands-Query bricht.
- API-Gating-Muster: `getSession(cookie)` + `isAdmin(session)` aus `../../lib/auth`, `export const prerender = false` (siehe `pages/api/factory-floor.ts`).
- DB-Zugriff im CLI: `_pgpod` (findet shared-db-Pod) + `_exec_sql "$pod" -v var=val <<'EOF' … :'var' … EOF`.

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `website/src/lib/tickets-db.ts` | Schema: `planning`-Status + 6 neue Spalten | Modify |
| `scripts/ticket.sh` | `plan-meta set/get` Subcommands | Modify |
| `website/src/lib/planning-office.ts` | DAL: list/create/update/promote | Create |
| `website/src/pages/api/planning-office/index.ts` | GET (Liste) + POST (anlegen) | Create |
| `website/src/pages/api/planning-office/[extId].ts` | PATCH (Felder/Rang/DoR) | Create |
| `website/src/pages/api/planning-office/[extId]/promote.ts` | POST (promote) | Create |
| `website/src/components/PlanningOffice.svelte` | UI (Liste + Editor + Anlegen) | Create |
| `website/src/pages/admin/planungsbuero.astro` | Seite/Tab-Host | Create |
| `website/src/components/FactoryFloor.svelte` | „N im Büro"-Zähler | Modify |
| `tests/unit/planning-office.bats` | CLI/Validierung offline | Create |
| `website/tests/e2e/planning-office.spec.ts` | Playwright CRUD/Rang/DoR/Promote | Create |
| `website/src/data/test-inventory.json` | Regeneriert | Modify |
| `.claude/skills/feature-intake/SKILL.md` | Seeding `status=planning` | Modify |

---

## Task 1: Schema — `planning`-Status + Büro-Spalten

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (nach Zeile 156, im `initTicketsSchema`-Block, vor der `fn_effective_attention_mode`-Funktion ~Zeile 158)

- [ ] **Step 1: Migration einfügen (idempotent)**

Füge direkt nach dem `attention_mode`-`ALTER` (endet Zeile 156) ein:

```ts
  // Planungsbüro [feature/planungsbuero]: neuer Status 'planning' (kuratierte
  // Vorstufe vor 'backlog'/Laderampe — die Factory rührt ihn nicht an) plus
  // planungskritische Metadaten. Constraint ist inline/unbenannt → drop+add.
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','backlog','in_progress','in_review','blocked','done','archived'))
  `);
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS value_prop    TEXT,
      ADD COLUMN IF NOT EXISTS effort        TEXT,
      ADD COLUMN IF NOT EXISTS areas         TEXT[],
      ADD COLUMN IF NOT EXISTS depends_on    TEXT[],
      ADD COLUMN IF NOT EXISTS planning_rank INTEGER,
      ADD COLUMN IF NOT EXISTS readiness     JSONB
  `);
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_effort_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_effort_check
      CHECK (effort IS NULL OR effort IN ('klein','mittel','gross'))
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_planning_idx
    ON tickets.tickets (planning_rank, created_at) WHERE status = 'planning'`);
```

- [ ] **Step 2: Typecheck**

Run: `cd website && pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: keine neuen Fehler in `tickets-db.ts` (reines SQL in Template-Strings).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): add 'planning' status + Planungsbüro columns [feature/planungsbuero]"
```

---

## Task 2: `ticket.sh plan-meta` (set/get) + BATS

Symmetrie zu `enqueue`/`get`; ermöglicht feature-intake-Seeding. Offline-safe testbar, weil die Arg-Parsing/Validierung **vor** `_pgpod` läuft (Muster wie bestehende validate-before-_pgpod, vgl. Memory CI-hardening).

**Files:**
- Modify: `scripts/ticket.sh` (neue `cmd_plan_meta`, im `case` am Ende registrieren; Doku-Kommentar oben ergänzen)
- Create: `tests/unit/planning-office.bats`

- [ ] **Step 1: Failing BATS-Test schreiben**

`tests/unit/planning-office.bats`:

```bash
#!/usr/bin/env bats
# Offline-safe: prüft nur Arg-Validierung von `ticket.sh plan-meta`, die VOR
# jedem DB-Zugriff (_pgpod) passiert. Kein Cluster nötig.

setup() { TS="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"; }

@test "plan-meta requires a subaction" {
  run bash "$TS" plan-meta
  [ "$status" -ne 0 ]
  [[ "$output" == *"set|get"* ]]
}

@test "plan-meta set rejects missing --id" {
  run bash "$TS" plan-meta set --effort klein
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id"* ]]
}

@test "plan-meta set rejects invalid effort" {
  run bash "$TS" plan-meta set --id T-1 --effort riesig
  [ "$status" -ne 0 ]
  [[ "$output" == *"effort"* ]]
}

@test "plan-meta get rejects missing --id" {
  run bash "$TS" plan-meta get
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id"* ]]
}
```

- [ ] **Step 2: Test laufen lassen → muss rot sein**

Run: `bats tests/unit/planning-office.bats`
Expected: FAIL (`plan-meta` unbekannter Subcommand → exit 2, Meldungen fehlen).

- [ ] **Step 3: `cmd_plan_meta` implementieren**

In `scripts/ticket.sh` vor dem finalen `case "$cmd"`-Dispatch einfügen:

```bash
cmd_plan_meta() {
  local action="${1:-}"; shift || true
  if [[ "$action" != "set" && "$action" != "get" ]]; then
    echo "ERROR: plan-meta requires a subaction: set|get" >&2; exit 2
  fi
  local id="" value_prop="" effort="" areas="" depends="" rank="" readiness=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)          id="$2"; shift 2 ;;
      --value-prop)  value_prop="$2"; shift 2 ;;
      --effort)      effort="$2"; shift 2 ;;
      --areas)       areas="$2"; shift 2 ;;
      --depends-on)  depends="$2"; shift 2 ;;
      --rank)        rank="$2"; shift 2 ;;
      --readiness)   readiness="$2"; shift 2 ;;
      *) echo "Unknown plan-meta option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if [[ -n "$effort" && "$effort" != "klein" && "$effort" != "mittel" && "$effort" != "gross" ]]; then
    echo "ERROR: --effort must be klein|mittel|gross." >&2; exit 2
  fi
  local pod; pod=$(_pgpod)

  if [[ "$action" == "get" ]]; then
    _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT json_build_object(
  'external_id', external_id, 'status', status, 'value_prop', value_prop,
  'effort', effort, 'areas', areas, 'depends_on', depends_on,
  'planning_rank', planning_rank, 'readiness', readiness
) FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
    return
  fi

  # set — comma-lists → Postgres array literals; readiness key=val,.. → JSON
  local areas_sql="NULL" depends_sql="NULL" rank_sql="NULL" readiness_sql="NULL"
  [[ -n "$areas" ]]   && areas_sql="ARRAY[$(_csv_to_quoted "$areas")]"
  [[ -n "$depends" ]] && depends_sql="ARRAY[$(_csv_to_quoted "$depends")]"
  [[ -n "$rank" ]]    && rank_sql="$rank"
  [[ -n "$readiness" ]] && readiness_sql="'$(_readiness_to_json "$readiness")'::jsonb"
  _exec_sql "$pod" \
    -v ext_id="$id" -v vp="$value_prop" -v eff="$effort" <<EOF >/dev/null
UPDATE tickets.tickets SET
  value_prop    = COALESCE(NULLIF(:'vp',''), value_prop),
  effort        = COALESCE(NULLIF(:'eff',''), effort),
  areas         = COALESCE($areas_sql, areas),
  depends_on    = COALESCE($depends_sql, depends_on),
  planning_rank = COALESCE($rank_sql, planning_rank),
  readiness     = COALESCE($readiness_sql, readiness),
  updated_at    = now()
WHERE external_id = :'ext_id';
EOF
  echo "plan-meta updated for $id"
}

# "a,b,c" -> "'a','b','c'"  (single-quote each, escape embedded quotes)
_csv_to_quoted() {
  local IFS=','; local out=""; local item
  for item in $1; do
    item="${item//\'/\'\'}"
    out+="${out:+,}'$item'"
  done
  echo "$out"
}

# "spec_skizziert=true,aufwand_geschaetzt=false" -> {"spec_skizziert":true,...}
_readiness_to_json() {
  local IFS=','; local out=""; local kv k v
  for kv in $1; do
    k="${kv%%=*}"; v="${kv#*=}"
    [[ "$v" == "true" ]] && v="true" || v="false"
    out+="${out:+,}\"$k\":$v"
  done
  echo "{$out}"
}
```

Registriere im Dispatch-`case` (bei den anderen Subcommands):

```bash
    plan-meta) cmd_plan_meta "$@" ;;
```

Und ergänze die Kommentar-Liste oben (nach `touch …`):
```bash
#   plan-meta set --id <external_id> [--value-prop ..] [--effort klein|mittel|gross] [--areas a,b] [--depends-on T-1,T-2] [--rank N] [--readiness k=true,..]
#   plan-meta get --id <external_id>
```

- [ ] **Step 4: BATS grün**

Run: `bats tests/unit/planning-office.bats`
Expected: 4 passing.

- [ ] **Step 5: In `task test:all` einhängen prüfen**

Run: `grep -rn "tests/unit" Taskfile.yml | head` und sicherstellen, dass `tests/unit/*.bats` vom `test:*`-Target eingesammelt wird (das bestehende Glob deckt neue Dateien automatisch ab). Falls ein explizites File-Manifest existiert, `planning-office.bats` ergänzen.
Run zur Verifikation: `task test:all 2>&1 | tail -20`
Expected: planning-office.bats erscheint, grün.

- [ ] **Step 6: Commit**

```bash
git add scripts/ticket.sh tests/unit/planning-office.bats
git commit -m "feat(ticket.sh): add plan-meta set/get for Planungsbüro [feature/planungsbuero]"
```

---

## Task 3: DAL `planning-office.ts`

**Files:**
- Create: `website/src/lib/planning-office.ts`

- [ ] **Step 1: Modul schreiben**

```ts
// Planungsbüro DAL — kuratierte Feature-Vorstufe (status='planning') vor der
// Laderampe. Read/Write, PER-BRAND pool, gespiegelt an factory-floor.ts.
import { pool } from './website-db';

export const DOR_KEYS = [
  'spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt',
] as const;
export type DorKey = (typeof DOR_KEYS)[number];
export type Readiness = Partial<Record<DorKey, boolean>>;

export interface OfficeItem {
  extId: string; title: string; valueProp: string | null; priority: string;
  effort: string | null; areas: string[]; dependsOn: string[];
  rank: number | null; readiness: Readiness; dorScore: number;
  isNextCandidate: boolean; createdAt: string; updatedAt: string;
}

export function dorScore(r: Readiness | null): number {
  if (!r) return 0;
  return DOR_KEYS.reduce((n, k) => n + (r[k] === true ? 1 : 0), 0);
}

function mapRow(row: any): OfficeItem {
  const readiness: Readiness = row.readiness ?? {};
  return {
    extId: row.external_id, title: row.title, valueProp: row.value_prop,
    priority: row.priority, effort: row.effort,
    areas: row.areas ?? [], dependsOn: row.depends_on ?? [],
    rank: row.planning_rank, readiness, dorScore: dorScore(readiness),
    isNextCandidate: (row.planning_rank ?? 99) === 0 && dorScore(readiness) === 4,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** Alle kuratierten Items, gerankt. */
export async function listOffice(): Promise<OfficeItem[]> {
  const r = await pool.query(
    `SELECT external_id, title, value_prop, priority, effort, areas, depends_on,
            planning_rank, readiness, created_at, updated_at
       FROM tickets.tickets
      WHERE type = 'feature' AND status = 'planning'
      ORDER BY COALESCE(planning_rank, 2147483647), created_at`,
  );
  return r.rows.map(mapRow);
}

export interface CreateInput {
  title: string; brand: string; valueProp?: string; priority?: string;
  effort?: string; areas?: string[];
}
/** Neue Idee als status='planning' anlegen, ans Ende der Warteschlange. */
export async function createIdea(inp: CreateInput): Promise<string> {
  const r = await pool.query(
    `INSERT INTO tickets.tickets
       (type, brand, title, status, value_prop, priority, effort, areas, planning_rank, readiness)
     VALUES ('feature', $1, $2, 'planning', $3, COALESCE($4,'mittel'), $5, $6,
       (SELECT COALESCE(MAX(planning_rank),0)+1 FROM tickets.tickets WHERE status='planning'),
       '{}'::jsonb)
     RETURNING external_id`,
    [inp.brand, inp.title, inp.valueProp ?? null, inp.priority ?? null,
     inp.effort ?? null, inp.areas ?? null],
  );
  return r.rows[0].external_id;
}

export interface PatchInput {
  valueProp?: string; priority?: string; effort?: string;
  areas?: string[]; dependsOn?: string[]; rank?: number; readiness?: Readiness;
}
/** Einzelne Felder eines planning-Items patchen (nur gesetzte Keys). */
export async function patchItem(extId: string, p: PatchInput): Promise<boolean> {
  const sets: string[] = []; const vals: any[] = []; let i = 1;
  const add = (col: string, v: any) => { sets.push(`${col} = $${i++}`); vals.push(v); };
  if (p.valueProp !== undefined) add('value_prop', p.valueProp);
  if (p.priority !== undefined) add('priority', p.priority);
  if (p.effort !== undefined) add('effort', p.effort);
  if (p.areas !== undefined) add('areas', p.areas);
  if (p.dependsOn !== undefined) add('depends_on', p.dependsOn);
  if (p.rank !== undefined) add('planning_rank', p.rank);
  if (p.readiness !== undefined) {
    const clean: Readiness = {};
    for (const k of DOR_KEYS) if (p.readiness[k] !== undefined) clean[k] = !!p.readiness[k];
    add('readiness', JSON.stringify(clean));
  }
  if (!sets.length) return false;
  vals.push(extId);
  const r = await pool.query(
    `UPDATE tickets.tickets SET ${sets.join(', ')}, updated_at = now()
      WHERE external_id = $${i} AND status = 'planning'`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

/** „Als nächstes planen": Rang 0, dev-flow-plan-Kontextblock als Kommentar ablegen. */
export async function promoteItem(extId: string, override: boolean): Promise<{ ok: boolean; reason?: string }> {
  const r = await pool.query(
    `SELECT id, title, value_prop, priority, effort, areas, depends_on, readiness
       FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const t = r.rows[0];
  if (!t) return { ok: false, reason: 'not_found' };
  if (!override && dorScore(t.readiness) < 4) return { ok: false, reason: 'dor_incomplete' };

  await pool.query(`UPDATE tickets.tickets SET planning_rank = 0, updated_at = now() WHERE id = $1`, [t.id]);
  const ctx = [
    `DEVFLOW-PLAN-CONTEXT`,
    `Titel: ${t.title}`,
    `Kern-Nutzen: ${t.value_prop ?? '—'}`,
    `Priorität: ${t.priority} · Aufwand: ${t.effort ?? '—'}`,
    `Bereiche: ${(t.areas ?? []).join(', ') || '—'}`,
    `Abhängigkeiten: ${(t.depends_on ?? []).join(', ') || '—'}`,
  ].join('\n');
  await pool.query(
    `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     VALUES ($1, 'planning-office', $2, 'internal')`,
    [t.id, ctx],
  );
  return { ok: true };
}

/** Zähler für den Werkshalle-Leitstand. */
export async function officeCount(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tickets.tickets WHERE type='feature' AND status='planning'`,
  );
  return r.rows[0]?.n ?? 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd website && pnpm exec tsc --noEmit 2>&1 | grep planning-office || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/planning-office.ts
git commit -m "feat(planning-office): DAL for list/create/patch/promote [feature/planungsbuero]"
```

---

## Task 4: API-Routen

**Files:**
- Create: `website/src/pages/api/planning-office/index.ts`
- Create: `website/src/pages/api/planning-office/[extId].ts`
- Create: `website/src/pages/api/planning-office/[extId]/promote.ts`

- [ ] **Step 1: `index.ts` (GET Liste + POST anlegen)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listOffice, createIdea } from '../../../lib/planning-office';

export const prerender = false;
const deny = () => new Response(JSON.stringify({ error: 'Unauthorized' }),
  { status: 401, headers: { 'content-type': 'application/json' } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try { return json({ items: await listOffice() }); }
  catch (e) { console.error('[api/planning-office GET]', e); return json({ error: 'fetch_failed' }, 500); }
};

export const POST: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try {
    const b = await request.json();
    if (!b?.title || !b?.brand) return json({ error: 'title_and_brand_required' }, 400);
    if (b.effort && !['klein','mittel','gross'].includes(b.effort)) return json({ error: 'bad_effort' }, 400);
    const extId = await createIdea({
      title: String(b.title), brand: String(b.brand), valueProp: b.valueProp,
      priority: b.priority, effort: b.effort, areas: Array.isArray(b.areas) ? b.areas : undefined,
    });
    return json({ extId }, 201);
  } catch (e) { console.error('[api/planning-office POST]', e); return json({ error: 'create_failed' }, 500); }
};
```

- [ ] **Step 2: `[extId].ts` (PATCH)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { patchItem, DOR_KEYS, type Readiness } from '../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const PATCH: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  const extId = params.extId!;
  try {
    const b = await request.json();
    if (b.effort && !['klein','mittel','gross'].includes(b.effort)) return json({ error: 'bad_effort' }, 400);
    let readiness: Readiness | undefined;
    if (b.readiness && typeof b.readiness === 'object') {
      readiness = {};
      for (const k of DOR_KEYS) if (k in b.readiness) readiness[k] = !!b.readiness[k];
    }
    const ok = await patchItem(extId, {
      valueProp: b.valueProp, priority: b.priority, effort: b.effort,
      areas: Array.isArray(b.areas) ? b.areas : undefined,
      dependsOn: Array.isArray(b.dependsOn) ? b.dependsOn : undefined,
      rank: typeof b.rank === 'number' ? b.rank : undefined, readiness,
    });
    return ok ? json({ ok: true }) : json({ error: 'not_found_or_noop' }, 404);
  } catch (e) { console.error('[api/planning-office PATCH]', e); return json({ error: 'patch_failed' }, 500); }
};
```

- [ ] **Step 3: `[extId]/promote.ts` (POST)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { promoteItem } from '../../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  try {
    const b = await request.json().catch(() => ({}));
    const res = await promoteItem(params.extId!, b?.override === true);
    if (!res.ok) return json({ error: res.reason }, res.reason === 'not_found' ? 404 : 409);
    return json({ ok: true });
  } catch (e) { console.error('[api/planning-office promote]', e); return json({ error: 'promote_failed' }, 500); }
};
```

> **Hinweis Import-Tiefe:** `[extId]/promote.ts` liegt eine Ebene tiefer → `../../../../lib/...` (vier `..`). `index.ts` und `[extId].ts` nutzen drei. Verifiziere die Pfade gegen die Nachbar-Routen unter `pages/api/factory-floor/`.

- [ ] **Step 4: Typecheck + Build-Smoke**

Run: `cd website && pnpm exec tsc --noEmit 2>&1 | grep planning-office || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/planning-office
git commit -m "feat(api): planning-office routes (list/create/patch/promote) [feature/planungsbuero]"
```

---

## Task 5: `PlanningOffice.svelte` + Seite

**Files:**
- Create: `website/src/components/PlanningOffice.svelte`
- Create: `website/src/pages/admin/planungsbuero.astro`

- [ ] **Step 1: Komponente schreiben**

Datenfluss: `onMount` → `GET /api/planning-office`; Aktionen rufen `PATCH`/`POST .../promote` und re-fetchen. DoR-Score = Anzahl `true` in `readiness`. Promote-Button disabled wenn `dorScore < 4` (Override-Checkbox hebt auf).

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  const DOR_KEYS = ['spec_skizziert','offene_fragen_geklaert','abhaengigkeiten_klar','aufwand_geschaetzt'];
  const DOR_LABEL: Record<string,string> = {
    spec_skizziert: 'Spec skizziert', offene_fragen_geklaert: 'Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar', aufwand_geschaetzt: 'Aufwand geschätzt',
  };
  export let brand: string = 'mentolder';
  let items: any[] = []; let selected: any = null; let loading = true; let override = false;
  let newTitle = ''; let newEffort = 'mittel';

  const dor = (r: any) => DOR_KEYS.reduce((n,k)=> n + (r?.[k]===true?1:0), 0);

  async function load() {
    loading = true;
    const r = await fetch('/api/planning-office');
    items = r.ok ? (await r.json()).items : [];
    if (selected) selected = items.find(i => i.extId === selected.extId) ?? null;
    loading = false;
  }
  async function patch(extId: string, body: any) {
    await fetch(`/api/planning-office/${extId}`, {
      method: 'PATCH', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
    await load();
  }
  async function toggleDor(it: any, key: string) {
    await patch(it.extId, { readiness: { ...it.readiness, [key]: !(it.readiness?.[key]) } });
  }
  async function move(it: any, dir: number) {
    await patch(it.extId, { rank: (it.rank ?? 0) + dir });
  }
  async function promote(it: any) {
    const r = await fetch(`/api/planning-office/${it.extId}/promote`, {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ override }) });
    if (!r.ok) alert('Promote abgelehnt: ' + (await r.json()).error);
    await load();
  }
  async function addIdea() {
    if (!newTitle.trim()) return;
    await fetch('/api/planning-office', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ title: newTitle, brand, effort: newEffort }) });
    newTitle = ''; await load();
  }
  onMount(load);
</script>

<div class="po" data-testid="office-root">
  <div class="po-list" data-testid="office-list">
    <form class="po-add" data-testid="office-add-form" on:submit|preventDefault={addIdea}>
      <input data-testid="office-add-title" placeholder="Neue Idee…" bind:value={newTitle} />
      <select data-testid="office-add-effort" bind:value={newEffort}>
        <option value="klein">klein</option><option value="mittel">mittel</option><option value="gross">groß</option>
      </select>
      <button type="submit">+ Anlegen</button>
    </form>
    {#if loading}<p>Lädt…</p>
    {:else if !items.length}<p class="muted">Büro leer.</p>
    {:else}
      {#each items as it (it.extId)}
        <div class="po-card" data-testid="office-card" class:next={it.rank===0 && dor(it.readiness)===4}
             on:click={() => selected = it}>
          <div class="po-rank">
            <button data-testid="office-rank-up" on:click|stopPropagation={() => move(it,-1)}>▲</button>
            <button data-testid="office-rank-down" on:click|stopPropagation={() => move(it,1)}>▼</button>
          </div>
          <div class="po-body">
            <strong>{it.title}</strong>
            <span class="po-badge">{it.effort ?? '—'}</span>
            {#each it.areas as a}<span class="po-chip">{a}</span>{/each}
            {#if it.rank===0 && dor(it.readiness)===4}<span class="po-next">📌 Nächster</span>{/if}
          </div>
          <div class="po-dor" data-testid="office-dor">{dor(it.readiness)}/4</div>
        </div>
      {/each}
    {/if}
  </div>

  {#if selected}
    <div class="po-editor" data-testid="office-editor">
      <h3>{selected.title}</h3>
      <label>Kern-Nutzen
        <input data-testid="office-edit-valueprop" value={selected.valueProp ?? ''}
               on:change={(e:any) => patch(selected.extId, { valueProp: e.target.value })} />
      </label>
      <fieldset>
        <legend>Definition of Ready</legend>
        {#each DOR_KEYS as k}
          <label class="po-check">
            <input type="checkbox" data-testid={`office-dor-${k}`}
                   checked={selected.readiness?.[k]===true} on:change={() => toggleDor(selected, k)} />
            {DOR_LABEL[k]}
          </label>
        {/each}
      </fieldset>
      <label class="po-check">
        <input type="checkbox" data-testid="office-override" bind:checked={override} /> Override (trotz < 4/4)
      </label>
      <button data-testid="office-promote" disabled={!override && dor(selected.readiness) < 4}
              on:click={() => promote(selected)}>Als nächstes planen</button>
    </div>
  {/if}
</div>

<style>
  .po { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
  .po-card { display:flex; gap:.5rem; align-items:center; padding:.5rem; border:1px solid #333;
             border-radius:.4rem; cursor:pointer; margin-bottom:.4rem; }
  .po-card.next { border-color:#d4af37; }
  .po-badge { font-size:.7rem; background:#33333f; border-radius:.3rem; padding:.1rem .3rem; }
  .po-chip { font-size:.7rem; background:#222; border-radius:.3rem; padding:.1rem .3rem; margin-left:.2rem; }
  .po-next { color:#d4af37; font-size:.75rem; margin-left:.4rem; }
  .po-dor { color:#5fd35f; font-weight:600; }
  .po-rank button { display:block; background:none; border:none; color:#888; cursor:pointer; }
  .po-editor { border:1px solid #333; border-radius:.4rem; padding:.75rem; }
  .po-check { display:block; }
  .muted { color:#888; }
</style>
```

> **Anmerkung:** Brand-CSS-Feinschliff (gold/emerald-Tokens aus `public/brand/<brand>/`) kann der Implementierer angleichen; obige Inline-Styles sind funktional ausreichend und testbar.

- [ ] **Step 2: Host-Seite**

`website/src/pages/admin/planungsbuero.astro` — folge dem Muster der bestehenden Admin-Factory-Seite (suche `grep -rl "FactoryFloor" website/src/pages`), gleicher Auth-Guard, dann:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro'; // exakten Layout-Import von der FactoryFloor-Seite übernehmen
import PlanningOffice from '../../components/PlanningOffice.svelte';
const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
---
<AdminLayout title="Planungsbüro">
  <h1>🏛 Planungsbüro</h1>
  <PlanningOffice client:load brand={brand} />
</AdminLayout>
```

- [ ] **Step 3: Dev-Build-Smoke**

Run: `cd website && pnpm exec astro check 2>&1 | tail -15`
Expected: keine Fehler in `PlanningOffice.svelte`/`planungsbuero.astro`.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/PlanningOffice.svelte website/src/pages/admin/planungsbuero.astro
git commit -m "feat(ui): PlanningOffice view + admin page [feature/planungsbuero]"
```

---

## Task 6: Werkshalle „N im Büro"-Zähler

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (FloorPayload + getFloor)
- Modify: `website/src/pages/api/factory-floor.ts` (nichts — Payload erweitert sich automatisch)
- Modify: `website/src/components/FactoryFloor.svelte` (Leitstand-Kachel)

- [ ] **Step 1: `officeCount` in den Floor-Payload aufnehmen**

In `factory-floor.ts`: `FloorPayload` um `officeWaiting: number` erweitern; in `getFloor` `import { officeCount } from './planning-office'` und in der `Promise.all`-Aggregation `officeWaiting: await officeCount()` ergänzen (suche `export async function getFloor` und füge das Feld dem zurückgegebenen Objekt hinzu).

- [ ] **Step 2: Kachel im Leitstand rendern**

In `FactoryFloor.svelte`, im Leitstand-Grid (suche `data-testid="floor-leitstand"`), neue Kachel:

```svelte
<a class="kpi" data-testid="floor-office" href="/admin/planungsbuero" title="Im Planungsbüro">
  🏛 {payload.control ? '' : ''}{payload.officeWaiting ?? 0} <span class="kpi-l">im Büro</span>
</a>
```
(Feld liegt am Payload-Root, nicht unter `control` — entsprechend referenzieren; an die bestehende KPI-Markup-Struktur angleichen.)

- [ ] **Step 3: Typecheck**

Run: `cd website && pnpm exec tsc --noEmit 2>&1 | grep -E "factory-floor|FactoryFloor" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): add 'N im Büro' counter linking to Planungsbüro [feature/planungsbuero]"
```

---

## Task 7: Playwright + test-inventory

**Files:**
- Create: `website/tests/e2e/planning-office.spec.ts`
- Modify: `website/src/data/test-inventory.json` (regeneriert)

- [ ] **Step 1: Playwright-Projekt zuordnen**

Konsultiere `.claude/skills/references/dev-flow-gotchas.md` (Zuordnungstabelle) für das passende Projekt (admin/website). Trage den Test im richtigen `testMatch`-Projekt der `playwright.config.ts` ein.

- [ ] **Step 2: E2E-Test schreiben**

`website/tests/e2e/planning-office.spec.ts` — Admin-Login-Fixture wie bestehende Admin-Specs (suche `grep -rl "isAdmin\|admin login" website/tests/e2e`):

```ts
import { test, expect } from '@playwright/test';
// nutzt die bestehende Admin-Auth-Fixture (storageState) wie andere /admin-Specs.

test.describe('Planungsbüro', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/admin/planungsbuero'); });

  test('legt eine Idee an und zeigt sie in der Liste', async ({ page }) => {
    await page.getByTestId('office-add-title').fill('E2E Testidee');
    await page.getByTestId('office-add-effort').selectOption('klein');
    await page.getByTestId('office-add-form').getByRole('button').click();
    await expect(page.getByTestId('office-list')).toContainText('E2E Testidee');
  });

  test('DoR-Toggle erhöht den Score und gibt Promote frei', async ({ page }) => {
    await page.getByTestId('office-card').first().click();
    const promote = page.getByTestId('office-promote');
    await expect(promote).toBeDisabled();
    for (const k of ['spec_skizziert','offene_fragen_geklaert','abhaengigkeiten_klar','aufwand_geschaetzt'])
      await page.getByTestId(`office-dor-${k}`).check();
    await expect(promote).toBeEnabled();
  });

  test('Rang ▲▼ ändert die Reihenfolge', async ({ page }) => {
    const before = await page.getByTestId('office-card').allInnerTexts();
    await page.getByTestId('office-card').nth(1).getByTestId('office-rank-up').click();
    await expect.poll(async () => (await page.getByTestId('office-card').allInnerTexts())[0])
      .not.toBe(before[0]);
  });
});
```

- [ ] **Step 3: test-inventory regenerieren**

Run: `task test:inventory` (oder den vom `grep -n "test-inventory" Taskfile.yml` ermittelten Befehl)
Expected: `website/src/data/test-inventory.json` aktualisiert; Diff zeigt die neuen Tests.

- [ ] **Step 4: Offline-Suite grün**

Run: `task test:all 2>&1 | tail -20`
Expected: alle Offline-Tests grün (Playwright läuft separat gegen Live-Env, nicht in `test:all`).

- [ ] **Step 5: Commit**

```bash
git add website/tests/e2e/planning-office.spec.ts website/src/data/test-inventory.json website/playwright.config.ts
git commit -m "test(planning-office): e2e CRUD/rank/DoR + inventory [feature/planungsbuero]"
```

---

## Task 8: feature-intake-Seeding + 5 Erst-Insassen

**Files:**
- Modify: `.claude/skills/feature-intake/SKILL.md`

- [ ] **Step 1: Seeding-Konvention dokumentieren**

In `feature-intake/SKILL.md`, Modus-A „Schritt 4 — Tickets erstellen", `ticket.sh create`-Aufruf um `--status planning` ergänzen und einen Folgeschritt hinzufügen:

```markdown
Nach dem Anlegen die Büro-Metadaten setzen (statt direkt zu `dev-flow-plan`):

    bash scripts/ticket.sh plan-meta set --id <ext-id> \
      --value-prop "<kern-nutzen>" --effort <klein|mittel|gross> --areas <Bereich>

So landet die Idee im Planungsbüro (status=planning) statt in rohem triage.
Übergabe an dev-flow-plan erfolgt später per „Als nächstes planen" im Büro-UI.
```

- [ ] **Step 2: Verifikation (Doku-only)**

Run: `grep -n "plan-meta\|status planning" .claude/skills/feature-intake/SKILL.md`
Expected: beide Stellen vorhanden.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/feature-intake/SKILL.md
git commit -m "docs(feature-intake): seed ideas as status=planning into Planungsbüro [feature/planungsbuero]"
```

> **Live-Seeding der 5 Erst-Insassen** (Board-Templates, Figuren-Gesten, Newsletter-Vorlagen, Bild-Upload, Auto-Deploy) erfolgt **nach dem Merge & Deploy** manuell via `ticket.sh create --status planning … && ticket.sh plan-meta set …` gegen die Live-DB beider Brands — nicht Teil dieses Code-Branches (kein DB-Schreibzugriff im PR-Build).

---

## Verifikation gesamt (vor PR)

- [ ] `task test:all` grün (inkl. `planning-office.bats`)
- [ ] `cd website && pnpm exec tsc --noEmit` ohne neue Fehler
- [ ] `cd website && pnpm exec astro check` ohne neue Fehler
- [ ] `task workspace:validate` (Manifeste unverändert → sollte grün bleiben)
- [ ] `bash scripts/freshness-check.sh` bzw. das Freshness-Target (test-inventory aktuell)
- [ ] Manueller Smoke gegen Dev: Idee anlegen → DoR 4/4 → promote → Kontextblock-Kommentar prüfen

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Coverage:** §1 Datenmodell→T1; §2 API→T3+T4; §3 CLI→T2; §4 promote→T3(promoteItem)+T4; §5 Frontend→T5+T6; §6 Seeding→T8; §7 Testing→T2(BATS)+T7(Playwright/inventory). Alle Spec-Abschnitte abgedeckt.
- **Placeholder-Scan:** Keine TBD/TODO; jeder Code-Step zeigt vollständigen Code. Drei bewusst als „an Bestand angleichen" markierte Stellen (AdminLayout-Import T5.2, Leitstand-KPI-Markup T6.2, Playwright-Auth-Fixture T7.2) referenzieren existierende Muster, die der Implementierer per `grep` auflöst — kein erfundenes API.
- **Typkonsistenz:** `Readiness`/`DorKey`/`DOR_KEYS`, `OfficeItem`, `dorScore()`, `officeCount()` über DAL/API/Component konsistent benannt; `readiness`-Keys (`spec_skizziert`,…) identisch in CLI (`_readiness_to_json`), DAL, API, Svelte und BATS.

## Abweichungen von der Spec

- Spec §4 ließ die Badge-Mechanik offen → Plan wählt: `planning_rank=0` + abgeleitetes `isNextCandidate` (Rang 0 **und** DoR 4/4) statt einer separaten Spalte (YAGNI, kein zusätzliches Schema). Kontextblock als `ticket_comments`-Eintrag mit Präfix `DEVFLOW-PLAN-CONTEXT`.
