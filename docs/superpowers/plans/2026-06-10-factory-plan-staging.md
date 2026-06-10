---
title: Kommissionierung — Implementierungsplan
ticket_id: T000579
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Kommissionierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue, read-only Fabrik-Station „Kommissionierung" (Ticket-Status `plan_staged`) zwischen Planungsbüro (`planning`) und Laderampe (`backlog`), die ausführbereite Pläne sichtbar zwischenspeichert und auf manuelle Freigabe wartet, bevor die Factory sie baut.

**Architecture:** Neuer Ticket-Status `plan_staged` (idempotente CHECK-Constraint-Migration in `tickets-db.ts`, exakt nach dem `planning`-Muster). `dev-flow-plan` flippt das Plan-Ticket nach dem Anlegen via neuem `ticket.sh stage-plan` auf `type=feature`/`status=plan_staged` und schreibt einen `FACTORY-PLAN-REF`-Kommentar (Branch+Plan). Die DAL (`factory-floor.ts`) liest diese Tickets via `getStaged()`; `FactoryFloor.svelte` rendert eine vierte, linkeste Spalte im Versand-Stil mit zwei Knöpfen. „→ Factory" ruft eine **direkte DAL-Funktion** `releaseToBacklog(extId)` (kein Shell-Out) → `status=backlog`, ab dann zieht der Dispatcher (pollt nur `backlog`). Der Dispatcher bleibt unverändert; das Gate gilt per Konstruktion.

**Tech Stack:** TypeScript / Astro / Svelte 5 (Runes), PostgreSQL 16 (Schema `tickets`), Bash (`scripts/ticket.sh`), vitest + pg-mem (DAL-Tests), BATS (`tests/local/FA-SF-*.bats`), Playwright (`tests/e2e`). Beide Brands (DB `website` in ns `workspace` und `workspace-korczewski`).

---

## Wichtige verifizierte Codeanker (gegen den echten Worktree geprüft)

- **Status-CHECK-Constraint:** `website/src/lib/tickets-db.ts:161-165` — `DROP CONSTRAINT IF EXISTS tickets_status_check` + `ADD CONSTRAINT … CHECK (status IN ('triage','planning','backlog','in_progress','in_review','blocked','done','archived'))`. **Genau hier** wird `plan_staged` eingefügt. Idempotent (drop+add).
- **Lifecycle-Trigger:** `tickets-db.ts:490-515` (`fn_lifecycle_ts`) hat **kein** `ELSE`/`RAISE` — unbekannte Status werden ignoriert. `plan_staged` braucht **keinen** Timestamp und crasht den Trigger **nicht**. Kein Eingriff nötig (nur Test, der es beweist).
- **Audit-Trigger:** `tickets-db.ts:518-555` (`fn_audit_log`) trackt `status`-Änderungen generisch über `to_jsonb` — `plan_staged` funktioniert ohne Änderung.
- **TypeScript-`TicketStatus`-Union:** existiert **zweimal** — `website/src/lib/tickets/admin.ts:16-17` UND `website/src/lib/tickets/transition.ts:6-7` (+ `VALID_STATUSES`-Set `:12-13`). Beide ergänzen.
- **`enqueue`:** `scripts/ticket.sh:330-352` — Validierung (`if [[ -z "$id" ]]`) liegt **vor** `_pgpod` (Zeile 339) = FA-SF-35-Muster. Schreibt FACTORY-PLAN-REF **unbedingt** (kein Dedup, `author_label='factory'`). Dispatch-Case: `ticket.sh:737`. `_pgpod()`: `ticket.sh:41-49`.
- **DAL `getShipped()` (Vorbild für `getStaged()`):** `factory-floor.ts:142-166` — `DISTINCT ON` + `LEFT JOIN` (pg-mem-tauglich, keine korrelierte Subquery), `LIMIT $1::int`.
- **`FloorPayload`:** `factory-floor.ts:30-38` (DAL) + `FactoryFloor.svelte:10` (Svelte-Interface, muss gespiegelt werden). `getFloor()`: `factory-floor.ts:169-178`.
- **`FactoryFloor.svelte` Layout:** Zeilen 142-227 — `flex flex-col lg:flex-row`, Laderampe `lg:w-1/5` (:144), Halle `lg:w-3/5` (:165), Versand `lg:w-1/5` (:194). Helfer: `ticketUrl` (:81), `relTime` (:84-93), `prioDot` (:99-104), `openDetail` (:40-46), `GH_REPO` (:79). Leitstand-Kachel „Büro" (:139).
- **API-Vorbild release:** `website/src/pages/api/factory-floor/[extId]/inject.ts` (POST, `isAdmin`-gated, `json()`-Helper). List-Route (`/api/factory-floor`): `website/src/pages/api/factory-floor.ts`.
- **planning-office.promote (Vorbild):** `website/src/lib/planning-office.ts:90-115` setzt NUR `planning_rank=0` + Kommentar — **flippt den Status NICHT**. `officeCount()`: `:117-122` (`status='planning'`). Bestätigt: `planning` und `plan_staged` sind disjunkt.
- **admin/tickets Status-Filter:** `website/src/pages/admin/tickets.astro:80-86` (Saved-View-Chips), `:137-147` (`<select>`-Optionen). Backend `admin.ts:189-190` macht `push('t.status = $N', f.status)` (akzeptiert jeden String). `LIST_ORDER` CASE `admin.ts:160-176` hat `ELSE 7` → kein Crash bei `plan_staged`.
- **`dev-flow-plan` SKILL.md:** Schritt 4.5 (Ticket anlegen) `:127-146`, Schritt 5 (Commit/Push/STOPP) `:150-164`.
- **vitest-Harness (Vorbild):** `website/src/lib/factory-floor.test.ts:1-50` — `vi.mock('pg', …)` mit `pg-mem`, manuelles `CREATE SCHEMA tickets` + Tabellen, `vi.mock('./tickets-db')`.
- **BATS (Vorbild):** `tests/local/FA-SF-35-factory-cli.bats` (`load 'test_helper.bash'`) + `tests/unit/planning-office.bats`. `test:factory` (`Taskfile.yml:462-466`) globt `tests/local/FA-SF-*.bats` → eine neue `FA-SF-50-*.bats` wird **automatisch** mitgelaufen.
- **Playwright-Projekt:** `tests/e2e/playwright.config.ts:124-125` listet `fa-factory-floor.spec.ts` + `fa-planning-office.spec.ts` im `mentolder`-Projekt. Neue Spec dort als `testMatch` eintragen.
- **test-inventory:** `Taskfile.yml:503-506` (`task test:inventory` → `scripts/build-test-inventory.sh`); CI vergleicht `website/src/data/test-inventory.json`.

---

## Offene Detail-Punkte — im Plan entschieden

1. **Release-Mechanik:** **Direkte DAL-Funktion `releaseToBacklog(extId)`** in `factory-floor.ts` (Default laut Spec). Kein Shell-Out aus der Web-App — `ticket.sh` ist im Web-Pod nicht garantiert verfügbar, und ein `UPDATE … SET status='backlog'` ist äquivalent zu `cmd_enqueue` (das ebenfalls nur `type='feature', status='backlog'` setzt). Der FACTORY-PLAN-REF-Kommentar existiert beim Staging bereits, muss also **nicht** erneut geschrieben werden. Begründung: weniger Angriffsfläche, kein `kubectl`/Shell im Request-Pfad, idempotent.
2. **4-Spalten-Layout / Responsive:** Aus `1/5 + 3/5 + 1/5` wird **`1/5 (Komm.) + 1/5 (Laderampe) + 2/5 (Halle) + 1/5 (Versand)`** auf `lg:`. Die Halle schrumpft von `3/5` auf `2/5` (6 Stationen passen weiterhin in `grid-cols-6`, nur enger). Auf schmal (`< lg`) bleibt `flex-col` → vertikales Stacking in der Reihenfolge Komm. → Laderampe → Halle → Versand. Keine neuen Breakpoints.

---

## File Structure (geänderte/neue Dateien)

| Datei | Aktion | Verantwortung |
|---|---|---|
| `website/src/lib/tickets-db.ts` | Modify (`:161-165`) | `plan_staged` in CHECK-Constraint (idempotente Migration, beide Brands) |
| `website/src/lib/tickets/admin.ts` | Modify (`:16-17`) | `TicketStatus`-Union um `plan_staged` |
| `website/src/lib/tickets/transition.ts` | Modify (`:6-7`, `:12-13`) | `TicketStatus`-Union + `VALID_STATUSES`-Set |
| `scripts/ticket.sh` | Modify (`+cmd_stage_plan`, Dispatch `:746`, `cmd_enqueue:330-352`) | Neuer `stage-plan`-Befehl; enqueue dedupliziert FACTORY-PLAN-REF |
| `website/src/lib/factory-floor.ts` | Modify (`:29-38`, `+getStaged`, `+releaseToBacklog`, `getFloor:169-178`) | `StagedItem`, `getStaged()`, `releaseToBacklog()`, FloorPayload erweitern |
| `website/src/pages/api/factory-floor/[extId]/release.ts` | Create | POST-Route, `isAdmin`-gated → `releaseToBacklog()` |
| `website/src/components/FactoryFloor.svelte` | Modify (`:10`, `:130-140`, `:142-227`, Script) | Vierte Spalte „Kommissionierung" + Leitstand-Kachel + 2 Knöpfe |
| `website/src/pages/admin/tickets.astro` | Modify (`:80-86`, `:137-147`) | Quick-Filter-Chip + `<select>`-Option `plan_staged` |
| `.claude/skills/dev-flow-plan/SKILL.md` | Modify (`:127-146`, `:150-164`) | `stage-plan`-Aufruf in Schritt 4.5; Hinweistext in Schritt 5 |
| `website/src/lib/factory-floor.test.ts` | Modify | `getStaged()` + `releaseToBacklog()` + FACTORY-PLAN-REF-Parsing |
| `tests/local/FA-SF-50-stage-plan.bats` | Create | Offline Arg-Validierung `ticket.sh stage-plan` |
| `tests/unit/tickets-plan-staged-migration.bats` | Create | Idempotenz der Enum-Migration (Quelltext-Assertion, offline) |
| `tests/e2e/specs/fa-kommissionierung.spec.ts` | Create | UI-Render + „→ Factory" verschiebt Item |
| `tests/e2e/playwright.config.ts` | Modify (`:124-125`) | Neue Spec im `mentolder`-Projekt registrieren |

---

## Phase A — Status-Enum `plan_staged` + idempotente Migration

**Files:**
- Modify: `website/src/lib/tickets-db.ts:161-165`
- Modify: `website/src/lib/tickets/admin.ts:16-17`
- Modify: `website/src/lib/tickets/transition.ts:6-7`, `:12-13`
- Create: `tests/unit/tickets-plan-staged-migration.bats`

### Task A1: Failing-Test für die Migration (Quelltext-Assertion, offline)

- [ ] **Step 1: BATS-Test schreiben** (prüft, dass die Migration `plan_staged` enthält und idempotent drop+add macht — offline, kein Cluster)

Create `tests/unit/tickets-plan-staged-migration.bats`:

```bash
#!/usr/bin/env bats
# Offline-safe: prüft den Migrations-Quelltext in tickets-db.ts. Stellt sicher,
# dass 'plan_staged' im Status-CHECK steht und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.

setup() { SRC="$BATS_TEST_DIRNAME/../../website/src/lib/tickets-db.ts"; }

@test "tickets-db: status CHECK enthält plan_staged" {
  run grep -F "'plan_staged'" "$SRC"
  [ "$status" -eq 0 ]
}

@test "tickets-db: status-Migration ist idempotent (DROP CONSTRAINT IF EXISTS)" {
  run grep -F "DROP CONSTRAINT IF EXISTS tickets_status_check" "$SRC"
  [ "$status" -eq 0 ]
}

@test "tickets-db: plan_staged steht zwischen planning und backlog im CHECK" {
  # Eine Zeile, die alle drei in der Reihenfolge planning,plan_staged,backlog enthält.
  run grep -E "'planning','plan_staged','backlog'" "$SRC"
  [ "$status" -eq 0 ]
}

@test "admin.ts TicketStatus-Union enthält plan_staged" {
  run grep -F "plan_staged" "$BATS_TEST_DIRNAME/../../website/src/lib/tickets/admin.ts"
  [ "$status" -eq 0 ]
}

@test "transition.ts TicketStatus-Union + VALID_STATUSES enthält plan_staged" {
  run grep -c "plan_staged" "$BATS_TEST_DIRNAME/../../website/src/lib/tickets/transition.ts"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]   # einmal in der Union, einmal im Set
}
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd /tmp/wt-factory-plan-staging && ./tests/unit/lib/bats-core/bin/bats tests/unit/tickets-plan-staged-migration.bats`
Expected: FAIL (alle 5 Tests rot — `plan_staged` existiert noch nirgends).

- [ ] **Step 3: Coverage-Guard — neuen BATS-Test verdrahten**

`tests/unit/*.bats` muss von einem Task gelaufen werden (Coverage-Guard `scripts/tests/unit-coverage-guard.sh`). Reihe in den bestehenden Single-Bats-Call in `Taskfile.yml` (Block bei `:361-376`, der `tests/unit/planning-office.bats` u.a. listet) ein.

Modify `Taskfile.yml` (im Block ab `tests/unit/admin-nav.bats`, alphabetisch sinnvoll vor `tests/unit/env-resolve.bats`):

```yaml
        tests/unit/superpowers-collab-patch.bats
        tests/unit/helper-collab-headless.bats
        tests/unit/tickets-plan-staged-migration.bats
        tests/unit/env-resolve.bats
```

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add tests/unit/tickets-plan-staged-migration.bats Taskfile.yml
git commit -m "test(tickets): failing migration assertion for plan_staged status [TICKET]"
```

### Task A2: Migration + TypeScript-Unions implementieren

- [ ] **Step 1: CHECK-Constraint erweitern**

Modify `website/src/lib/tickets-db.ts:161-165`. Aktuell:

```ts
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','backlog','in_progress','in_review','blocked','done','archived'))
  `);
```

Wird zu (`'plan_staged'` zwischen `'planning'` und `'backlog'`, Kommentar ergänzt):

```ts
  // Kommissionierung [feature/factory-plan-staging]: Status 'plan_staged' — fertige,
  // ausführbereite Pläne warten zwischen Planungsbüro ('planning') und Laderampe
  // ('backlog') auf manuelle Freigabe. Der Dispatcher pollt nur 'backlog' → die
  // Factory rührt 'plan_staged' nicht an. Constraint ist inline/unbenannt → drop+add.
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','plan_staged','backlog','in_progress','in_review','blocked','done','archived'))
  `);
```

- [ ] **Step 2: `admin.ts`-Union erweitern**

Modify `website/src/lib/tickets/admin.ts:16-17`:

```ts
export type TicketStatus =
  'triage' | 'planning' | 'plan_staged' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
```

> Hinweis: Die aktuelle Union in `admin.ts:16-17` listet `planning` NICHT (sie ist `'triage' | 'backlog' | …`). `planning` wird hier mit ergänzt, damit der Filter-Chip (`?status=planning`) typkonsistent bleibt; das ist keine Funktionsänderung, nur Typkorrektur.

- [ ] **Step 3: `transition.ts`-Union + Set erweitern**

Modify `website/src/lib/tickets/transition.ts:6-7`:

```ts
export type TicketStatus =
  'triage' | 'planning' | 'plan_staged' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
```

Modify `website/src/lib/tickets/transition.ts:12-13`:

```ts
const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set(
  ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'blocked', 'done', 'archived']);
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd /tmp/wt-factory-plan-staging && ./tests/unit/lib/bats-core/bin/bats tests/unit/tickets-plan-staged-migration.bats`
Expected: PASS (alle 5).

- [ ] **Step 5: TypeScript-Typecheck**

Run: `cd /tmp/wt-factory-plan-staging/website && npx tsc --noEmit 2>&1 | grep -E "admin.ts|transition.ts|tickets-db.ts" || echo "OK keine neuen Fehler in geänderten Dateien"`
Expected: keine neuen Fehler in den drei Dateien (Baseline-Fehler anderswo ignorieren).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/lib/tickets-db.ts website/src/lib/tickets/admin.ts website/src/lib/tickets/transition.ts
git commit -m "feat(tickets): add plan_staged status (Kommissionierung) [TICKET]"
```

> **Beide Brands:** Die Migration läuft beim nächsten Deploy automatisch via `initTicketsSchema()` (idempotenter drop+add). Sie wirkt in der DB `website` in **beiden** Namespaces (`workspace` + `workspace-korczewski`), sobald die jeweilige Website-Instanz `initTicketsSchema()` ausführt. Kein manueller DDL-Schritt nötig; verifiziert im Deploy-Abschnitt am Ende.

---

## Phase B — `ticket.sh stage-plan` + enqueue-Dedup

**Files:**
- Modify: `scripts/ticket.sh` (neuer `cmd_stage_plan`, Dispatch-Case, `cmd_enqueue:330-352`)
- Create: `tests/local/FA-SF-50-stage-plan.bats`

### Task B1: Failing-BATS für `stage-plan` (offline Arg-Validierung)

- [ ] **Step 1: BATS-Test schreiben**

Create `tests/local/FA-SF-50-stage-plan.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-50: offline arg-validation for `ticket.sh stage-plan` (Kommissionierung).
# Validierung passiert VOR _pgpod (FA-SF-35-Muster) → kein Cluster nötig.
setup() { load 'test_helper.bash'; }

@test "FA-SF-50: stage-plan requires --id" {
  run bash scripts/ticket.sh stage-plan --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-50: stage-plan requires --branch" {
  run bash scripts/ticket.sh stage-plan --id T000001 --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--branch" ]]
}
@test "FA-SF-50: stage-plan requires --plan" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--plan" ]]
}
@test "FA-SF-50: stage-plan rejects unknown option" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch b --plan p --bogus x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Unknown" ]]
}
@test "FA-SF-50: dispatch usage lists stage-plan" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "stage-plan" ]]
}
```

- [ ] **Step 2: Prüfen, dass das `test_helper.bash` existiert** (Vorbild FA-SF-35 nutzt es)

Run: `cd /tmp/wt-factory-plan-staging && ls tests/local/test_helper.bash`
Expected: Datei existiert (sonst Fallback wie `tests/unit/planning-office.bats`: `setup() { TS="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"; }` und `bash "$TS" …` verwenden).

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `cd /tmp/wt-factory-plan-staging && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-50-stage-plan.bats`
Expected: FAIL (`stage-plan` ist noch nicht im Dispatch → „Unknown command", Status 1; Usage listet es nicht).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add tests/local/FA-SF-50-stage-plan.bats
git commit -m "test(factory): failing FA-SF-50 stage-plan arg validation [TICKET]"
```

> `test:factory` (`Taskfile.yml:466`) globt `tests/local/FA-SF-*.bats` → **kein** Taskfile-Edit nötig, der Test läuft automatisch in `task test:all`.

### Task B2: `cmd_stage_plan` implementieren + Dispatch + enqueue-Dedup

- [ ] **Step 1: `cmd_stage_plan` direkt nach `cmd_enqueue` einfügen** (nach `scripts/ticket.sh:352`)

```bash
cmd_stage_plan() {
  local id="" branch="" plan=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)     id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --plan)   plan="$2"; shift 2 ;;
      *)        echo "Unknown stage-plan option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-35/50).
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Kommissionierung: type=feature, status=plan_staged (factory-unsichtbar; der
  # Dispatcher pollt nur 'backlog'). Wartet auf manuelle Freigabe in /dev-status.
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET type='feature', status='plan_staged' WHERE external_id = :'ext_id';
EOF
  # FACTORY-PLAN-REF nur schreiben, falls noch keiner existiert (idempotent →
  # kein Duplikat beim späteren Staging→Enqueue).
  _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'dev-flow-plan', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND NOT EXISTS (
     SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
   );
EOF
  echo "Ticket $id staged in Kommissionierung (type=feature, status=plan_staged)"
}
```

- [ ] **Step 2: enqueue idempotent machen** (`cmd_enqueue`, `scripts/ticket.sh:344-350`)

Damit `enqueue` von `plan_staged` ODER `triage` aus funktioniert und beim Staging→Enqueue **keinen** zweiten FACTORY-PLAN-REF schreibt, den INSERT-Block in `cmd_enqueue` durch eine `NOT EXISTS`-Variante ersetzen. Aktuell (`:344-350`):

```bash
  # Record a DDL-free plan reference for the pipeline's plan-reuse entrypoint.
  if [[ -n "$branch" || -n "$plan" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'factory', :'ref', 'internal' FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi
```

Wird zu:

```bash
  # Record a DDL-free plan reference for the pipeline's plan-reuse entrypoint.
  # Idempotent: skip if a FACTORY-PLAN-REF already exists (e.g. written by
  # `stage-plan` during Kommissionierung) to avoid duplicate refs.
  if [[ -n "$branch" || -n "$plan" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'factory', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND NOT EXISTS (
     SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
   );
EOF
  fi
```

- [ ] **Step 3: Dispatch-Case ergänzen** (`scripts/ticket.sh`, im `case "$cmd"`-Block bei `:737`, direkt nach der `enqueue)`-Zeile)

```bash
  enqueue)           cmd_enqueue "$@" ;;
  stage-plan)        cmd_stage_plan "$@" ;;
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd /tmp/wt-factory-plan-staging && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-50-stage-plan.bats`
Expected: PASS (alle 5).

- [ ] **Step 5: Regression — FA-SF-35 + bestehende Factory-BATS laufen**

Run: `cd /tmp/wt-factory-plan-staging && task test:factory`
Expected: PASS (Live-DB-Cases skippen ohne Cluster; Arg-Validierungen grün).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add scripts/ticket.sh
git commit -m "feat(ticket): add stage-plan cmd + idempotent enqueue plan-ref [TICKET]"
```

---

## Phase C — DAL: `getStaged()` + `releaseToBacklog()` + FloorPayload

**Files:**
- Modify: `website/src/lib/factory-floor.ts:29-38`, `+getStaged`, `+releaseToBacklog`, `getFloor:169-178`
- Modify: `website/src/lib/factory-floor.test.ts`

### Task C1: Failing-vitest für `getStaged()` + Parsing + `releaseToBacklog()`

- [ ] **Step 1: pg-mem-Harness in `factory-floor.test.ts` erweitern**

In `website/src/lib/factory-floor.test.ts` im `vi.mock('pg', …)`-Block (nach den bestehenden `INSERT INTO tickets.tickets …`-Zeilen, vor `INSERT INTO tickets.factory_phase_events`) zwei `plan_staged`-Tickets + ihre FACTORY-PLAN-REF-Kommentare ergänzen. Innerhalb des bestehenden `INSERT INTO tickets.tickets VALUES`-Statements zwei Zeilen anhängen (vor dem abschließenden `;`):

```sql
      ,('p1','T000490','feature','Staged mit Ref','hoch','plan_staged',NULL,0,NULL, now() - INTERVAL '5 min', now())
      ,('p2','T000491','feature','Staged ohne Ref','niedrig','plan_staged',NULL,0,NULL, now() - INTERVAL '2 min', now())
```

Und nach dem bestehenden `INSERT INTO tickets.ticket_links …` einen Kommentar-Insert ergänzen (nur p1 hat einen Ref; p2 absichtlich nicht → null-Branch/Plan testen):

```sql
    INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility) VALUES
      ('p1','dev-flow-plan','FACTORY-PLAN-REF branch=feature/staged-eins plan=docs/superpowers/plans/2026-06-10-staged-eins.md','internal');
```

- [ ] **Step 2: Import-Zeile + Tests ergänzen**

Die `import { … } from './factory-floor'`-Zeile (aktuell `factory-floor.test.ts:54`) um `getStaged, releaseToBacklog` erweitern:

```ts
import { getHall, getLoadingDock, getShipped, getMetrics, getControl,
         insertInjection, getInjections, consumeInjections, getTicketDetail,
         getStaged, releaseToBacklog } from './factory-floor';
```

Am Ende des `describe('factory-floor DAL', …)`-Blocks vor der schließenden `});` einfügen:

```ts
  it('getStaged returns only plan_staged features, newest-relevant first', async () => {
    const staged = await getStaged();
    const ids = staged.map((s) => s.extId);
    expect(ids).toContain('T000490');
    expect(ids).toContain('T000491');
    // keine non-plan_staged Tickets
    expect(ids).not.toContain('T000459'); // in_progress
    expect(ids).not.toContain('T000480'); // backlog
    expect(ids).not.toContain('T000467'); // done
  });

  it('getStaged parses branch + planPath from FACTORY-PLAN-REF', async () => {
    const staged = await getStaged();
    const p1 = staged.find((s) => s.extId === 'T000490')!;
    expect(p1.branch).toBe('feature/staged-eins');
    expect(p1.planPath).toBe('docs/superpowers/plans/2026-06-10-staged-eins.md');
  });

  it('getStaged yields null branch/planPath when no FACTORY-PLAN-REF exists', async () => {
    const staged = await getStaged();
    const p2 = staged.find((s) => s.extId === 'T000491')!;
    expect(p2.branch).toBeNull();
    expect(p2.planPath).toBeNull();
  });

  it('releaseToBacklog flips plan_staged -> backlog and returns true', async () => {
    const ok = await releaseToBacklog('T000490');
    expect(ok).toBe(true);
    const after = await getStaged();
    expect(after.map((s) => s.extId)).not.toContain('T000490');
  });

  it('releaseToBacklog returns false for an unknown / non-staged ext_id', async () => {
    expect(await releaseToBacklog('T999999')).toBe(false);
    expect(await releaseToBacklog('T000467')).toBe(false); // done, nicht plan_staged
  });
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `cd /tmp/wt-factory-plan-staging/website && npx vitest run src/lib/factory-floor.test.ts`
Expected: FAIL (`getStaged`/`releaseToBacklog` sind nicht exportiert → Import-Fehler / undefined).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/lib/factory-floor.test.ts
git commit -m "test(factory-floor): failing getStaged + releaseToBacklog specs [TICKET]"
```

### Task C2: `StagedItem`, `getStaged()`, `releaseToBacklog()` implementieren + FloorPayload

- [ ] **Step 1: `StagedItem`-Interface + FloorPayload erweitern** (`factory-floor.ts:29-38`)

Nach `export interface ShippedItem …` (`:29`) einfügen:

```ts
export interface StagedItem {
  extId: string; title: string; priority: string;
  branch: string | null; planPath: string | null; createdAt: string | null;
}
```

`FloorPayload` (`:30-38`) erweitern um `staged` + `stagedWaiting`:

```ts
export interface FloorPayload {
  control: ControlSnapshot;
  metrics: FloorMetrics;
  loadingDock: LoadingDockItem[];
  hall: HallItem[];
  shipped: ShippedItem[];
  staged: StagedItem[];
  officeWaiting: number;
  stagedWaiting: number;
  fetchedAt: string;
}
```

- [ ] **Step 2: `getStaged()` implementieren** (Vorbild `getShipped()` `:142-166` — `DISTINCT ON` + `LEFT JOIN`, pg-mem-tauglich)

Direkt nach `getShipped()` (`:166`) einfügen:

```ts
/** Plan_staged features (Kommissionierung) with branch/plan parsed from the latest
 *  FACTORY-PLAN-REF comment. Newest first. branch/planPath are null when no ref. */
export async function getStaged(limit = 12): Promise<StagedItem[]> {
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.priority, t.created_at, c.body AS ref_body
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (ticket_id) ticket_id, body
           FROM tickets.ticket_comments
          WHERE body LIKE 'FACTORY-PLAN-REF %'
          ORDER BY ticket_id, created_at DESC
       ) c ON c.ticket_id = t.id
      WHERE t.type = 'feature' AND t.status = 'plan_staged'
      ORDER BY CASE t.priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 ELSE 4 END,
               t.created_at DESC
      LIMIT $1::int`,
    [limit],
  );
  return r.rows.map((row: any) => {
    const { branch, planPath } = parsePlanRef(row.ref_body);
    return {
      extId: row.external_id,
      title: row.title,
      priority: row.priority,
      branch,
      planPath,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  });
}

/** Parse "FACTORY-PLAN-REF branch=<b> plan=<p>" → { branch, planPath }; nulls on miss. */
function parsePlanRef(body: string | null): { branch: string | null; planPath: string | null } {
  if (!body) return { branch: null, planPath: null };
  const branch = /\bbranch=(\S+)/.exec(body)?.[1] ?? null;
  const planPath = /\bplan=(\S+)/.exec(body)?.[1] ?? null;
  return { branch, planPath };
}
```

- [ ] **Step 3: `releaseToBacklog()` implementieren** (direkte DAL, kein Shell-Out)

Nach `getStaged()` einfügen:

```ts
/** Manuelle Freigabe (Kommissionierung → Laderampe): flip plan_staged -> backlog.
 *  Idempotent & guarded: nur ein aktuell plan_staged Feature wird verschoben.
 *  Der FACTORY-PLAN-REF-Kommentar besteht bereits (vom Staging) → nicht erneut schreiben.
 *  Returns true if a row was updated, false otherwise. */
export async function releaseToBacklog(extId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tickets.tickets
        SET status = 'backlog', updated_at = now()
      WHERE external_id = $1 AND type = 'feature' AND status = 'plan_staged'`,
    [extId],
  );
  return (r.rowCount ?? 0) > 0;
}
```

- [ ] **Step 4: `getFloor()` erweitern** (`:169-178`)

```ts
/** Assemble the full floor payload. slotsCap from FACTORY_GLOBAL_CAP. */
export async function getFloor(slotsCap: number): Promise<FloorPayload> {
  const control = await getControl(slotsCap);
  const [metrics, loadingDock, hall, shipped, staged, officeWaiting] = await Promise.all([
    getMetrics(),
    getLoadingDock(control.slotsUsed, control.slotsCap),
    getHall(),
    getShipped(),
    getStaged(),
    officeCount(),
  ]);
  return {
    control, metrics, loadingDock, hall, shipped, staged,
    officeWaiting, stagedWaiting: staged.length,
    fetchedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `cd /tmp/wt-factory-plan-staging/website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (alle, inkl. der 5 neuen).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/lib/factory-floor.ts
git commit -m "feat(factory-floor): getStaged + releaseToBacklog + FloorPayload.staged [TICKET]"
```

---

## Phase D — API: Release-Route

**Files:**
- Create: `website/src/pages/api/factory-floor/[extId]/release.ts`

### Task D1: Release-Route (TDD via Integration über die DAL bereits abgedeckt; hier Route + Smoke)

> Die Geschäftslogik (`releaseToBacklog`) ist in Phase C getestet. Die Route ist ein dünner, `isAdmin`-gated Wrapper — Vorbild `api/factory-floor/[extId]/inject.ts`. Kein eigener vitest nötig (kein Route-Test-Harness im Repo für diese API); die Playwright-Spec in Phase G deckt den End-to-End-Pfad ab.

- [ ] **Step 1: Route anlegen**

Create `website/src/pages/api/factory-floor/[extId]/release.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { releaseToBacklog } from '../../../../lib/factory-floor';

export const prerender = false;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const extId = params.extId ?? '';
  if (!extId) return json({ error: 'extId missing' }, 400);

  try {
    const ok = await releaseToBacklog(extId);
    // 409, wenn das Ticket nicht (mehr) plan_staged ist — z.B. Doppelklick / schon freigegeben.
    if (!ok) return json({ error: 'not_staged' }, 409);
    return json({ ok: true });
  } catch (err) {
    console.error('[api/factory-floor/[extId]/release]', err);
    return json({ error: 'release_failed' }, 500);
  }
};
```

- [ ] **Step 2: TypeScript-Typecheck der Route**

Run: `cd /tmp/wt-factory-plan-staging/website && npx tsc --noEmit 2>&1 | grep "release.ts" || echo "OK"`
Expected: `OK` (keine Fehler in `release.ts`).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/pages/api/factory-floor/\[extId\]/release.ts
git commit -m "feat(api): factory-floor release route (Kommissionierung -> Laderampe) [TICKET]"
```

---

## Phase E — UI: Spalte „Kommissionierung" + Leitstand-Kachel

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte` (`:10`, `:130-140`, `:142-227`, Script-Block)

### Task E1: Svelte-Interface + Release-Handler + Layout

- [ ] **Step 1: `StagedItem`-Interface + FloorPayload im Svelte-Script spiegeln** (`FactoryFloor.svelte:9-10`)

Nach `interface ShippedItem …` (`:9`) einfügen und `FloorPayload` (`:10`) erweitern:

```ts
  interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
  interface StagedItem { extId: string; title: string; priority: string; branch: string | null; planPath: string | null; createdAt: string | null; }
  interface FloorPayload { control: ControlSnapshot; metrics: FloorMetrics; loadingDock: LoadingDockItem[]; hall: HallItem[]; shipped: ShippedItem[]; staged: StagedItem[]; officeWaiting: number; stagedWaiting: number; fetchedAt: string; }
```

- [ ] **Step 2: Release-Handler + Plan-URL-Helfer im Script-Block ergänzen** (nach `ticketUrl` `:81`)

```ts
  const ticketUrl = (extId: string) => `/admin/tickets?q=${encodeURIComponent(extId)}`;
  const planUrl = (branch: string, planPath: string) =>
    `https://github.com/${GH_REPO}/blob/${branch}/${planPath}`;

  let releasing = $state<string | null>(null);
  let releaseErr = $state<string | null>(null);

  /** „→ Factory": plan_staged → backlog, dann optimistisch neu laden. */
  async function releaseToFactory(extId: string) {
    releasing = extId; releaseErr = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}/release`, {
        method: 'POST', credentials: 'same-origin',
      });
      if (!res.ok) { releaseErr = `Freigabe fehlgeschlagen (${res.status})`; return; }
      // Optimistisch: aus staged entfernen; nächster 4s-Poll holt die Laderampe nach.
      if (data) data = { ...data, staged: data.staged.filter((s) => s.extId !== extId),
                         stagedWaiting: Math.max(0, (data.stagedWaiting ?? 1) - 1) };
      await refresh();
    } catch { releaseErr = 'Netzwerkfehler'; }
    finally { releasing = null; }
  }

  let manualHintFor = $state<string | null>(null);
  function toggleManualHint(extId: string) {
    manualHintFor = manualHintFor === extId ? null : extId;
  }
```

> Hinweis: `GH_REPO` ist bereits bei `FactoryFloor.svelte:79` definiert (`'Paddione/Bachelorprojekt'`), `prioDot`/`relTime`/`openDetail` ebenfalls vorhanden — werden wiederverwendet.

- [ ] **Step 3: Leitstand-Kachel „Kommissionierung" ergänzen** (`:130-140`, im `floor-leitstand`-Grid neben der „Büro"-Kachel `:139`)

Das Grid ist `grid-cols-2 md:grid-cols-6`. Nach der „Büro"-Kachel (`:139`) die Kommissionierungs-Kachel einfügen (Grid wächst auf eine weitere Zelle; `md:grid-cols-6` lässt sie umbrechen — kein Layout-Bruch):

```svelte
      <a href="/admin/planungsbuero" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-office" title="Im Planungsbüro"><p class="text-muted text-xs">Büro</p><p class="text-xl font-bold">{data.officeWaiting ?? 0}</p></a>
      <a href="#floor-kommissionierung" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-komm-count" title="Zur Kommissionierung"><p class="text-muted text-xs">Kommissionierung</p><p class="text-xl font-bold">{data.stagedWaiting ?? 0}</p></a>
```

- [ ] **Step 4: Vierte Spalte als erste (linkeste) Zone + Breiten anpassen** (`:142-227`)

Den `<div class="flex flex-col lg:flex-row gap-4">`-Block umbauen: neue Kommissionierungs-Spalte **vor** der Laderampe, Halle von `lg:w-3/5` auf `lg:w-2/5`. Ersetze die öffnende `<!-- ② Laderampe -->`-Zone-Anordnung; konkret die neue Spalte **direkt nach** `<div class="flex flex-col lg:flex-row gap-4">` (`:142`) einfügen:

```svelte
    <div class="flex flex-col lg:flex-row gap-4">
      <!-- ⓪ Kommissionierung -->
      <div class="lg:w-1/5 scroll-mt-24" id="floor-kommissionierung" data-testid="floor-kommissionierung">
        <h3 class="font-semibold mb-2">Kommissionierung</h3>
        {#if data.staged.length === 0}
          <p class="text-muted text-sm">Nichts kommissioniert.</p>
        {:else}
          <ul class="space-y-1.5">
            {#each data.staged as s (s.extId)}
              <li class="rounded-lg border border-transparent bg-white/5 px-2.5 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.08]"
                  data-testid="floor-staged-item">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="h-2 w-2 shrink-0 rounded-full {prioDot(s.priority)}" title={`Priorität: ${s.priority}`}></span>
                    <a href={ticketUrl(s.extId)} class="font-mono text-xs text-gold hover:underline"
                       title="In der Ticket-Übersicht öffnen">{s.extId}</a>
                  </div>
                  {#if s.createdAt}
                    <span class="whitespace-nowrap text-[10px] text-muted"
                          title={new Date(s.createdAt).toLocaleString('de-DE')}>{relTime(s.createdAt)}</span>
                  {/if}
                </div>
                <button type="button" onclick={() => openDetail(s.extId)}
                        class="mt-0.5 block w-full text-left leading-snug transition-colors hover:text-gold"
                        title="Phasen-Timeline &amp; Details anzeigen">{s.title}</button>
                {#if s.branch && s.planPath}
                  <a href={planUrl(s.branch, s.planPath)} target="_blank" rel="noopener noreferrer"
                     data-testid="floor-staged-plan"
                     class="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-gold hover:text-dark"
                     title={`Branch ${s.branch} · Plan ansehen`}>
                    <svg viewBox="0 0 16 16" class="h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M11.75 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 11a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM3.5 6.5v3h1.5v-3H3.5Zm8.25-1.25a3.25 3.25 0 0 1-3.25 3.25H5v1.5h3.5A4.75 4.75 0 0 0 13.25 5.25h-1.5Z"/></svg>
                    {s.branch}<span class="opacity-60">↗</span>
                  </a>
                {:else}
                  <span class="mt-1 block text-[10px] text-muted">⚠ kein Plan-Ref</span>
                {/if}
                <div class="mt-1.5 flex gap-1.5">
                  <button type="button" onclick={() => releaseToFactory(s.extId)} disabled={releasing === s.extId}
                          data-testid="floor-staged-release"
                          class="rounded bg-emerald-500/80 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-emerald-400 disabled:opacity-50">
                    {releasing === s.extId ? '…' : '→ Factory'}
                  </button>
                  <button type="button" onclick={() => toggleManualHint(s.extId)}
                          data-testid="floor-staged-manual"
                          class="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white/20">
                    → Manuell
                  </button>
                </div>
                {#if manualHintFor === s.extId}
                  <p class="mt-1 rounded bg-white/5 px-2 py-1 text-[10px] text-muted" data-testid="floor-staged-manual-hint">
                    Lokal <code class="text-gold">dev-flow-execute</code> auf <code class="text-gold">{s.branch ?? 'feature/<branch>'}</code> aufrufen.
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if releaseErr}<p class="mt-2 text-xs text-red-400" data-testid="floor-staged-error">{releaseErr}</p>{/if}
      </div>

      <!-- ② Laderampe -->
      <div class="lg:w-1/5" data-testid="floor-loadingdock">
```

- [ ] **Step 5: Halle von `3/5` auf `2/5` verschmälern** (`:165`)

```svelte
      <!-- ③ Die Halle -->
      <div class="lg:w-2/5" data-testid="floor-hall">
```

> Damit ergibt sich `1/5 (Komm.) + 1/5 (Laderampe) + 2/5 (Halle) + 1/5 (Versand) = 5/5`. Auf `< lg` stapelt `flex-col` alles vertikal.

- [ ] **Step 6: Svelte-Check / Build-Smoke**

Run: `cd /tmp/wt-factory-plan-staging/website && npx svelte-check --threshold error 2>&1 | grep -i "FactoryFloor" || echo "OK keine Fehler in FactoryFloor.svelte"`
Expected: keine neuen Fehler in `FactoryFloor.svelte`.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): Kommissionierung column + Leitstand tile [TICKET]"
```

---

## Phase F — dev-flow-plan SKILL.md-Integration

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md:127-146`, `:150-164`

### Task F1: `stage-plan`-Aufruf in Schritt 4.5 + Hinweistext in Schritt 5

- [ ] **Step 1: Schritt 4.5 — nach `sed -i …`-Zeile (`:145`) den `stage-plan`-Aufruf einfügen**

In `.claude/skills/dev-flow-plan/SKILL.md` direkt nach der Zeile `sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" docs/superpowers/plans/<date>-<slug>.md` (`:145`) und vor der schließenden ``` ``` (`:146`) ergänzen:

```bash

# Plan in die Kommissionierung stellen: type=feature, status=plan_staged.
# Read-only sichtbar in /dev-status; wartet auf manuelle Freigabe (→ Factory / → Manuell).
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "docs/superpowers/plans/<date>-<slug>.md"
```

- [ ] **Step 2: Schritt 5 — Hinweistext nach STOPP erweitern** (`:157`)

Den Absatz bei `:157` (`**STOPP.** Informiere den User, dass der Plan bereit zur Implementierung ist. Er hat nun folgende Optionen:`) ergänzen um einen Kommissionierungs-Hinweis. Einfügen direkt nach der Zeile `**STOPP.** Informiere den User, …`:

```markdown
**STOPP.** Informiere den User, dass der Plan bereit zur Implementierung ist. Der Plan liegt jetzt in der **Kommissionierung** (`/dev-status`) und wartet dort auf manuelle Freigabe. Er hat nun folgende Optionen:
```

(Ersetzt die bestehende `**STOPP.** …`-Zeile.)

- [ ] **Step 3: Option-Texte präzisieren** (`:157-164`)

Die Optionsliste so anpassen, dass sie die zwei Kommissionierungs-Knöpfe spiegelt. Bestehende Punkte 1 + 2 ersetzen durch:

```markdown
1. **→ Manuell** ausführen lassen: Bitte den User, `dev-flow-execute` auf `feature/<slug>` aufzurufen (oder den „→ Manuell"-Hinweis in der Kommissionierung). 
2. **→ Factory** übergeben: In der Kommissionierung (`/dev-status`) den Knopf **→ Factory** drücken — das verschiebt das Ticket in die Laderampe (`status=backlog`); der Factory-Dispatcher arbeitet es mit **Plan-Reuse** (kein Neu-Planen) ab. Äquivalent von der CLI:
```

> Der bestehende `bash scripts/ticket.sh enqueue …`-Codeblock (`:160-163`) bleibt als CLI-Äquivalent stehen; er ist jetzt idempotent (schreibt keinen doppelten FACTORY-PLAN-REF, siehe Phase B).

- [ ] **Step 4: Skill-Orchestrator-Konsistenz prüfen** (falls eine BATS dies abdeckt)

Run: `cd /tmp/wt-factory-plan-staging && grep -rn "stage-plan\|enqueue" .claude/skills/dev-flow-plan/SKILL.md`
Expected: `stage-plan` taucht in Schritt 4.5 auf; `enqueue` weiterhin in Schritt 5.

Run: `cd /tmp/wt-factory-plan-staging && ./tests/unit/lib/bats-core/bin/bats tests/unit/skill-orchestrator.bats 2>/dev/null || echo "kein direkter SKILL-Gate-Test betroffen"`
Expected: PASS oder „nicht betroffen".

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "docs(dev-flow-plan): stage plan into Kommissionierung after ticket create [TICKET]"
```

---

## Phase G — E2E-Test + admin/tickets-Quickfilter + test-inventory

**Files:**
- Modify: `website/src/pages/admin/tickets.astro:80-86`, `:137-147`
- Create: `tests/e2e/specs/fa-kommissionierung.spec.ts`
- Modify: `tests/e2e/playwright.config.ts:124-125`

### Task G1: admin/tickets Quick-Filter-Chip + `<select>`-Option

- [ ] **Step 1: `<select>`-Option `plan_staged` ergänzen** (`tickets.astro:141-142`)

Zwischen `triage` (`:141`) und `backlog` (`:142`) einfügen (Reihenfolge spiegelt den Lifecycle):

```svelte
            <option value="triage"      selected={statusFilter === 'triage'}>Triage</option>
            <option value="planning"    selected={statusFilter === 'planning'}>Planungsbüro</option>
            <option value="plan_staged" selected={statusFilter === 'plan_staged'}>Kommissionierung</option>
            <option value="backlog"     selected={statusFilter === 'backlog'}>Backlog</option>
```

> Hinweis: `planning` fehlt aktuell auch im `<select>`; wird mit ergänzt (gleiche Lücke wie bei der Typ-Union).

- [ ] **Step 2: Saved-View-Chip ergänzen** (`tickets.astro:80-86`)

Nach dem „Triage"-Chip (`:84`) einfügen:

```svelte
  { label: 'Triage',        href: '/admin/tickets?status=triage' },
  { label: '📦 Kommissionierung', href: '/admin/tickets?status=plan_staged' },
  { label: 'In Review',     href: '/admin/tickets?status=in_review' },
```

- [ ] **Step 3: Build-Smoke**

Run: `cd /tmp/wt-factory-plan-staging/website && npx svelte-check --threshold error 2>&1 | grep -i "tickets.astro" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/pages/admin/tickets.astro
git commit -m "feat(admin/tickets): plan_staged filter chip + select option [TICKET]"
```

### Task G2: Playwright-Spec für die Kommissionierung

- [ ] **Step 1: Spec schreiben** (Vorbild `fa-planning-office.spec.ts` + `fa-factory-floor.spec.ts`; admin-gated, mentolder-Projekt)

Create `tests/e2e/specs/fa-kommissionierung.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Kommissionierung-Spalte auf /dev-status (admin-gated, läuft im mentolder-Projekt
// mit gespeichertem Admin-Auth-State). Read-only Render + „→ Factory"-Knopf.
test.describe('Kommissionierung (Factory-Floor)', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/dev-status'); });

  test('rendert die Kommissionierungs-Spalte und die Leitstand-Kachel', async ({ page }) => {
    await expect(page.getByTestId('floor-kommissionierung')).toBeVisible();
    await expect(page.getByTestId('floor-kommissionierung')).toContainText('Kommissionierung');
    await expect(page.getByTestId('floor-komm-count')).toBeVisible();
  });

  test('zeigt entweder gestagte Items oder den Leer-Zustand', async ({ page }) => {
    const col = page.getByTestId('floor-kommissionierung');
    const items = col.getByTestId('floor-staged-item');
    const count = await items.count();
    if (count === 0) {
      await expect(col).toContainText('Nichts kommissioniert.');
    } else {
      // Jedes Item hat die zwei Aktionsknöpfe.
      await expect(items.first().getByTestId('floor-staged-release')).toBeVisible();
      await expect(items.first().getByTestId('floor-staged-manual')).toBeVisible();
    }
  });

  test('„→ Manuell" blendet den dev-flow-execute-Hinweis ein', async ({ page }) => {
    const items = page.getByTestId('floor-kommissionierung').getByTestId('floor-staged-item');
    test.skip(await items.count() === 0, 'kein gestagtes Item vorhanden');
    await items.first().getByTestId('floor-staged-manual').click();
    await expect(items.first().getByTestId('floor-staged-manual-hint')).toContainText('dev-flow-execute');
  });

  test('„→ Factory" entfernt das Item aus der Kommissionierung', async ({ page }) => {
    const col = page.getByTestId('floor-kommissionierung');
    const items = col.getByTestId('floor-staged-item');
    test.skip(await items.count() === 0, 'kein gestagtes Item vorhanden');
    const firstExtId = await items.first().getByRole('link').first().innerText();
    await items.first().getByTestId('floor-staged-release').click();
    // Nach Freigabe verschwindet das Item (optimistisch + 4s-Poll); auf Verschwinden warten.
    await expect.poll(async () =>
      (await col.getByTestId('floor-staged-item').allInnerTexts()).join(' ')
    ).not.toContain(firstExtId);
  });
});
```

> **Daten-Hinweis für den Ausführenden:** Damit die Release-/Manuell-Tests echte Items prüfen (statt zu skippen), kann optional ein Seed-Ticket vor dem Run via `bash scripts/ticket.sh create … && bash scripts/ticket.sh stage-plan --id <id> --branch feature/seed-komm --plan docs/superpowers/plans/seed.md` (ENV=mentolder) angelegt werden. Ohne Seed verifiziert die Spec Render + Leer-Zustand robust (skip-on-empty), analog zu `fa-factory-floor.spec.ts`.

- [ ] **Step 2: Spec im `mentolder`-Projekt registrieren** (`playwright.config.ts:124-125`)

Nach der `fa-factory-floor.spec.ts`-Zeile (`:124`) einfügen:

```ts
        '**/fa-factory-floor.spec.ts',     // /dev-status hall render (admin-gated)
        '**/fa-kommissionierung.spec.ts',  // /dev-status Kommissionierung column (admin-gated)
        '**/fa-planning-office.spec.ts',   // /admin/planungsbuero CRUD/rank/DoR (admin-gated)
```

- [ ] **Step 3: Spec-Syntax/Typecheck (offline)**

Run: `cd /tmp/wt-factory-plan-staging/tests/e2e && npx tsc --noEmit specs/fa-kommissionierung.spec.ts 2>&1 | head || echo "OK"`
Expected: keine Typfehler (Live-Run gegen die Umgebung erfolgt erst nach Deploy via `dev-flow-e2e`).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-plan-staging
git add tests/e2e/specs/fa-kommissionierung.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(e2e): fa-kommissionierung spec + mentolder project registration [TICKET]"
```

### Task G3: test-inventory regenerieren (CI-Gate)

- [ ] **Step 1: Inventory neu bauen**

Run: `cd /tmp/wt-factory-plan-staging && task test:inventory`
Expected: `website/src/data/test-inventory.json` wird aktualisiert (enthält jetzt die neuen BATS-/E2E-Tests).

- [ ] **Step 2: Diff prüfen**

Run: `cd /tmp/wt-factory-plan-staging && git status --porcelain website/src/data/test-inventory.json`
Expected: Datei ist geändert (oder unverändert, falls das Inventory diese Testklassen nicht erfasst — dann ist nichts zu committen).

- [ ] **Step 3: Commit (falls geändert)**

```bash
cd /tmp/wt-factory-plan-staging
git add website/src/data/test-inventory.json
git commit -m "chore(test-inventory): regenerate after Kommissionierung tests [TICKET]" || echo "kein Diff"
```

---

## Phase H — Voll-Verifikation + Deploy-Hinweise (beide Brands)

### Task H1: Gesamte Offline-Suite grün

- [ ] **Step 1: Vollständige Offline-Tests (wie CI)**

Run: `cd /tmp/wt-factory-plan-staging && task test:all`
Expected: PASS. Insbesondere `test:unit` (vitest + neue BATS), `test:factory` (FA-SF-50), `test:unit:coverage-guard` (neuer `tickets-plan-staged-migration.bats` ist verdrahtet).

- [ ] **Step 2: vitest gezielt**

Run: `cd /tmp/wt-factory-plan-staging/website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (alle, inkl. der neuen Staged-/Release-Tests).

- [ ] **Step 3: Freshness/Inventory-Gate**

Run: `cd /tmp/wt-factory-plan-staging && task test:inventory && git diff --exit-code website/src/data/test-inventory.json && echo "inventory in sync"`
Expected: `inventory in sync` (oder bereits committed in G3).

### Task H2: Deploy-Hinweise (NICHT Teil der Implementierung — für dev-flow-execute/Deploy-Phase)

> Diese Schritte gehören in die Deploy-Phase nach Merge, nicht in die Code-Implementierung. Hier dokumentiert, damit der Ausführende die Brand-Abdeckung nicht vergisst.

- Die **Enum-Migration** wirkt erst, wenn die jeweilige Website-Instanz `initTicketsSchema()` ausführt. Push-basiert (kein GitOps-Reconciler auf fleet):
  - **mentolder:** Website rollt via `build-website.yml` automatisch aus (digest-Pin-Footgun beachten: ggf. `kubectl set image …:latest` statt nur `rollout restart`).
  - **korczewski:** Website via `build-website-korczewski.yml`.
- Beide Instanzen teilen sich pro Brand eine eigene `shared-db`; die Migration muss in **beiden** DBs `website` laufen (ns `workspace` + `workspace-korczewski`). Kein manueller DDL-Schritt nötig — `initTicketsSchema()` ist idempotent und läuft beim ersten Request pro Instanz.
- **Verifikation nach Deploy (pro Brand):**

```bash
# mentolder
kubectl --context fleet -n workspace exec deploy/shared-db -- \
  psql -U website -d website -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='tickets_status_check';"
# erwartet: … status IN ('triage','planning','plan_staged','backlog', …)

# korczewski
kubectl --context fleet -n workspace-korczewski exec deploy/shared-db -- \
  psql -U website -d website -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='tickets_status_check';"
```

- Falls die Migration vor dem ersten Request verifiziert werden soll, einen beliebigen Admin-Request gegen `/dev-status` (löst `getFloor` → `initTicketsSchema` aus) je Brand absetzen.

---

## Self-Review-Checkliste (gegen die Spec)

**Spec-Coverage:**
- Komponente 1 (Datenmodell, `plan_staged`-CHECK, beide Brands, Trigger-Sicherheit) → Phase A (A1/A2) + H2. ✔
- Komponente 2 (`ticket.sh stage-plan` + enqueue-Rückwärtskompat/Dedup, validate-before-`_pgpod`, Dispatch) → Phase B. ✔
- Komponente 3 (dev-flow-plan Schritt 4.5/5) → Phase F. ✔
- Komponente 4 (DAL `StagedItem`/`getStaged`/`FloorPayload`/`getFloor`) → Phase C. ✔
- Komponente 5 (UI-Spalte, Versand-Stil, Branch/Plan-Link, 2 Knöpfe, Leitstand-Kachel, 4-Spalten-Layout) → Phase E. ✔
- Komponente 6 (API release, isAdmin, direkte DAL-Default) → Phase D + offener Punkt 1 entschieden. ✔
- Komponente 7 (admin/tickets-Quickfilter) → Phase G1. ✔
- Tests (vitest/BATS offline-safe/Playwright/Enum-Idempotenz/test-inventory) → A1, B1, C1, G2, G3, H1. ✔
- Edge Cases (enqueue von plan_staged+triage; kein Code behandelt plan_staged als aktiv/done; beide Brands; Dispatcher unverändert; office/staged disjunkt) → B2, A (LIST_ORDER `ELSE 7` + Trigger ohne `RAISE` verifiziert), H2, „Dispatcher bleibt unverändert" dokumentiert, `getStaged` filtert `status='plan_staged'` vs `officeCount` `status='planning'`. ✔

**Offene Punkte entschieden:** (1) Release = direkte DAL `releaseToBacklog()` — kein Shell-Out; (2) Layout = `1/5+1/5+2/5+1/5`, `flex-col` auf schmal. ✔

**Placeholder-Scan:** keine TODO/TBD; jeder Code-Step zeigt den vollständigen Code. ✔

**Typ-Konsistenz:** `StagedItem` (DAL + Svelte identisch: extId/title/priority/branch/planPath/createdAt), `FloorPayload.staged`/`stagedWaiting` in DAL, Svelte, `getFloor`; `getStaged`/`releaseToBacklog`/`parsePlanRef` einheitlich benannt; `data-testid`s (`floor-kommissionierung`, `floor-komm-count`, `floor-staged-item`, `floor-staged-release`, `floor-staged-manual`, `floor-staged-manual-hint`, `floor-staged-plan`) konsistent zwischen Svelte und Playwright. ✔
