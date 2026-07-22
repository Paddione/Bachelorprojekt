---
title: "parallel-partial-plans — Implementation Plan"
ticket_id: T002074
domains: [factory, dev-flow, llm-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# parallel-partial-plans — Implementation Plan

_Ticket: T002074 · Design: [design.md](design.md) (approved, 8 Entscheidungen) · Intel: [intel.json](intel.json)_

Dieser Plan setzt das approved Design 1:1 um: Plan-Split in `tasks.d/`-Partials mit
disjunkten Dateilisten, Gang-Scheduling über eine `slot_count`-Spalte mit atomarem
`claim-gang`, Head-of-Line-Blocking in `schedule.sh`, Partial-Lifecycle mit
`partial-done`-Phase-Events und p3-zu-Review-Rotation, Bonsai-Provider-Registrierung
(`llamacpp @ :8093`) sowie die `design.md`-SSOT-Konvention in beiden Plan-Skills.
Hinweis zur Selbst-Referenz: dieser Plan selbst ist ein klassischer Single-Plan —
die `tasks.d/`-Maschinerie, die er einführt, existiert noch nicht.

## File Structure

### Neue Dateien

```
scripts/migrations/2026-07-22-slot-count-gang.sql   Migration: tickets.tickets + slot_count int NOT NULL DEFAULT 1
scripts/plan-intel-filter.sh                        jq-Filter: intel.json → Partial-Subset nach target_files (Limit 500)
scripts/factory/pipeline-partials.cjs               tasks.d/-Parser + Partial-Fanout + Rotation, CJS, Limit 200
scripts/factory/provider-register-bonsai.sh         idempotente provider_config/factory_model_slots-Registrierung (Limit 500)
scripts/factory/pr-babysit-ticket.sh                ticket-scoped CI-Babysit-Loop für den EIGENEN PR (Limit 500)
tests/spec/fixtures/make-partial-plan.sh            BATS-Fixture-Builder für plan-lint-Partial-Tests
.claude/skills/llama-cpp/references/bonsai-server-windows.md   Repo-Referenz Bonsai-Server (Windows, :8093)
```

### Geänderte Dateien

```
scripts/factory/slots.sh                    claim-gang + SUM(slot_count)-Accounting + release-Reset
scripts/factory/schedule.sh                 Head-of-Line-Blocking + slot_count-Lookup + claim-gang
scripts/factory/pipeline.js                 Partial-Pfad via tasks.d/, Batch-Block-Extraktion (Netto-Shrink ≤600), pr-ready-Gate im Deploy
scripts/factory/pipeline-runner.js          neue Kommandos read-partials + pr-gate (require pipeline-partials.cjs)
scripts/plan-lint.sh                        Partial-Modus (Index-Checks, STRUCT2-im-Tests-Partial, D1-Disjunktheit)
scripts/vda/ticket/stage-plan.sh            --partials N → slot_count in der Stage-Query (ticket.sh bleibt unberührt)
scripts/vda/frontmatter.sh                  design.md-Pfadkonvention im --spec-Modus
scripts/vda.sh                              Hilfetext frontmatter-Subcommand: design.md
scripts/plan-context.sh                     tasks.d/-Partials + design.md als Plan-Kontext emittieren
.claude/skills/dev-flow-plan/SKILL.md       Schritt 3.7 zweistufig, design.md-Konvention, Embed nach Stage
.opencode/skills/opencode-flow-plan/SKILL.md  symmetrische Änderungen
.claude/skills/llama-cpp/SKILL.md           Referenz-Verweis auf bonsai-server-windows.md
tests/spec/software-factory.bats            FA-SF-GANG-Testblock (Gang-Claim, HoL, plan-lint-Partial, Provider)
```

### Nicht angefasst (bewusst)

`scripts/ticket.sh` (Budget -350 — B1b: NICHT vergrößern; die Partial-Anzahl wird in
`scripts/vda/ticket/stage-plan.sh` getragen, das von `ticket.sh` nur gesourced wird
und dessen Optionsparser lokal ist — kein Diff in `ticket.sh` selbst; MCP-seitig
trägt ticket-mcp `set_plan_meta` bzw. `stage_plan` die Metadaten).
`scripts/factory/dispatcher.js` (Budget 390 — Release läuft über `ticket.sh
release-slot` → `slots.sh release`; das Nullen von `slot_count` passiert dort,
Task 3, kein dispatcher-Diff nötig). `scripts/factory/pipeline-decompose.cjs`
(Budget 63 — `validateDisjoint(subFeatures)` wird unverändert wiederverwendet:
von `pipeline-runner.js read-partials` per `require`, und seine Logik als
bash-Reimplementierung in plan-lint D1). `scripts/migrate-factory.mjs` (Budget 400 —
läuft die neue SQL-Datei aus `scripts/migrations/` automatisch, kein Code-Diff).
`scripts/openspec-embed.mjs` (Budget 259 — bestehende CLI `--slug` wird nur
aufgerufen, nicht geändert).

## Pre-flight: S1-Budgets (aus intel.json, vom Linter nachgerechnet)

| Datei | Ist | S1-Budget |
|---|---|---|
| `scripts/factory/slots.sh` | 37 | 463 |
| `scripts/factory/schedule.sh` | 75 | 425 |
| `scripts/factory/pipeline.js` | 630 | -30 |
| `scripts/factory/pipeline-decompose.cjs` | 137 | 63 |
| `scripts/factory/dispatcher.js` | 210 | 390 |
| `scripts/plan-lint.sh` | 242 | 258 |
| `scripts/ticket.sh` | 850 | -350 |
| `scripts/migrate-factory.mjs` | 100 | 400 |
| `scripts/openspec-embed.mjs` | 241 | 259 |
| `scripts/vda.sh` | 96 | 404 |
| `scripts/plan-context.sh` | 145 | 355 |
| `scripts/vda/ticket/stage-plan.sh` | 50 | 450 |
| `scripts/vda/frontmatter.sh` | 239 | 261 |
| `scripts/factory/pipeline-runner.js` | 308 | 292 |

Neue Dateien (existieren noch nicht, statisches Limit gilt):
`scripts/plan-intel-filter.sh` Limit 500 · `scripts/factory/pipeline-partials.cjs`
Limit 200 (`.cjs`) · `scripts/factory/provider-register-bonsai.sh` Limit 500 ·
`scripts/factory/pr-babysit-ticket.sh` Limit 500 ·
`tests/spec/fixtures/make-partial-plan.sh` Limit 500.
`.md`-Dateien (Skills, Referenzen) und `.bats`/`.sql` sind ungated.
Nur gelesen/wiederverwendet (kein Diff, keine Budget-Behauptung nötig):
`scripts/factory/babysit-prs.sh` (repo-weiter Scanner, bleibt bestehen),
`scripts/factory/classify-failure.sh` (`classify_failure <ci-log-file>`),
`scripts/factory/build-loop.sh`, `scripts/devflow-ci-watch.sh` und die
Polling-Konventionen aus `.claude/skills/references/ci-fix-loop.md`.

**B1b-Konsequenz `scripts/factory/pipeline.js` (Budget -30):** Der Plan enthält einen
echten Extract-Schritt (Task 8): der Batch-/Partial-Prompt-Scaffold wird nach
`scripts/factory/pipeline-partials.cjs` ausgelagert (split der Partial-Logik aus dem
Workflow-Skript), `pipeline.js` wird dadurch netto auf ≤600 Zeilen verkleinert —
kein kosmetisches Zeilen-Zusammenziehen.

---

### Task 1: DB-Migration `slot_count`

**Datei:** `scripts/migrations/2026-07-22-slot-count-gang.sql` (NEU, `.sql` ungated).
`scripts/migrate-factory.mjs` (Budget 400) bleibt unverändert — es liest
`scripts/migrations/*.sql` automatisch, sortiert und idempotent
(`ALREADY_EXISTS_SQLSTATES`-Backfill). Zusätzlich manuell auf beide Brands anwendbar
nach dem Muster des Headers von `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql`.

```sql
-- 2026-07-22-slot-count-gang.sql
-- Gang-Scheduling (T002074): Anzahl der Slots, die ein Ticket bekleiden muss.
-- Idempotent; Default 1 = heutiges Single-Slot-Verhalten.
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-slot-count-gang.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-slot-count-gang.sql'
ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS slot_count int NOT NULL DEFAULT 1;

-- Vorbedingung für ON CONFLICT (phase) in provider-register-bonsai.sh (Task 10):
CREATE UNIQUE INDEX IF NOT EXISTS factory_model_slots_phase_key
  ON tickets.factory_model_slots(phase);
```

**Akzeptanz:**
- [x] `ADD COLUMN IF NOT EXISTS` (doppelt anwendbar ohne Fehler; Spaltentyp exakt wie intel.json `db_tables`: `slot_count int NOT NULL DEFAULT 1`).
- [x] Header dokumentiert die Both-Brands-Anwendung (getrennte per-Brand-DBs).
- [x] Kein Diff an `scripts/migrate-factory.mjs`.

### Task 2: BATS-Tests zuerst — RED (Failing-Test-Step)

**Dateien:** `tests/spec/software-factory.bats` (ungated, per BATS-Konvention an die
bestehende Spec-Datei anfügen — KEINE neue Ticket-Datei) und der Fixture-Builder
`tests/spec/fixtures/make-partial-plan.sh` (NEU). Neuer Block `FA-SF-GANG` am
Dateiende, im Stil der bestehenden Offline-Assertions (FA-SF-45/FA-SF-52:
`grep`-Kontrakt-Checks + `bash -n`-Syntax-Checks; Live-DB-Tests nur hinter
`_skip_if_no_db`). Die Assertions sind bewusst deckungsgleich mit den
Implementierungs-Snippets der Tasks 3–10 (Test-Assertion-Konsistenz).

```bats
# ── FA-SF-GANG: Gang-Scheduling für Partialpläne (T002074) ───────────────────
@test "FA-SF-GANG: slots.sh usage-Kontrakt kennt claim-gang" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE= bash scripts/factory/slots.sh bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"claim-gang"* ]]
}

@test "FA-SF-GANG: claim-gang prueft SUM(slot_count) atomar gegen den Brand-Pool" {
  run grep -Fq 'SUM(slot_count)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: release setzt slot_count auf 1 zurueck" {
  run grep -Fq 'slot_count=1' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: count-Accounting summiert slot_count statt Zeilen zu zaehlen" {
  run grep -Fq 'COALESCE(SUM(slot_count),0)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: schedule.sh blockt head-of-line (break, kein Vorziehen)" {
  run grep -Fq 'head-of-line' scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'claim-gang' scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: Migration fuegt slot_count idempotent hinzu" {
  run grep -Fq 'ADD COLUMN IF NOT EXISTS slot_count' scripts/migrations/2026-07-22-slot-count-gang.sql
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: stage-plan traegt --partials in die Stage-Query (ticket.sh unberuehrt)" {
  run grep -Fq -- '--partials' scripts/vda/ticket/stage-plan.sh
  [ "$status" -eq 0 ]
  run grep -Fq -- '--partials' scripts/ticket.sh
  [ "$status" -eq 1 ]
}

@test "FA-SF-GANG: plan-lint Partial-Modus — D1 Hard-Fail bei Datei in zwei Partials" {
  chg="$BATS_TEST_TMPDIR/chg"; mkdir -p "$chg/tasks.d"
  bash "$REPO_ROOT/tests/spec/fixtures/make-partial-plan.sh" "$chg" duplicate
  run bash "$REPO_ROOT/scripts/plan-lint.sh" "$chg/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"D1"* ]]
}

@test "FA-SF-GANG: plan-lint Partial-Modus — disjunkte Partials mit Tests-Partial PASSen" {
  chg="$BATS_TEST_TMPDIR/chg-ok"; mkdir -p "$chg/tasks.d"
  bash "$REPO_ROOT/tests/spec/fixtures/make-partial-plan.sh" "$chg" ok
  run bash "$REPO_ROOT/scripts/plan-lint.sh" "$chg/tasks.md"
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: pipeline-partials.cjs ist valides CJS und wird vom Runner ge-require-t" {
  run node --check scripts/factory/pipeline-partials.cjs
  [ "$status" -eq 0 ]
  run grep -Fq "pipeline-partials.cjs" scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
  run grep -Fq 'read-partials' scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: pipeline.js emittiert partial-done-Phase-Events" {
  run grep -Fq "partial-done" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: provider-register-bonsai.sh idempotent (ON CONFLICT) auf :8093" {
  run bash -n scripts/factory/provider-register-bonsai.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'ON CONFLICT' scripts/factory/provider-register-bonsai.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'http://127.0.0.1:8093/v1' scripts/factory/provider-register-bonsai.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: plan-intel-filter.sh filtert impact_files nach target_files" {
  tmp="$BATS_TEST_TMPDIR/intel.json"
  printf '%s' '{"meta":{"slug":"x"},"impact_files":[{"path":"a.sh"},{"path":"b.sh"}],"symbols":[{"name":"s","file":"a.sh"}],"db_tables":[]}' > "$tmp"
  run bash scripts/plan-intel-filter.sh "$tmp" a.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *'"a.sh"'* ]]
  [[ "$output" != *'"b.sh"'* ]]
}
```

Der Fixture-Builder `make-partial-plan.sh` schreibt per Here-Doc einen
plan-lint-konformen Index (Frontmatter mit den vier F1-Keys, H1
Implementation-Plan-Header, File-Structure-Sektion, `## Partials`-Manifest-Tabelle,
Verify-Task mit den drei Gate-Kommandos) plus `tasks.d/p1-impl.md` und
`tasks.d/p2-tests.md` (Tests-Partial enthält die Failing-Test-Phrase und einen
bats-Aufruf); Modus `duplicate` legt dieselbe Zieldatei in beide Partials,
Modus `ok` disjunkt.

**RED-Lauf (Pflicht, vor jeder Implementierung der Tasks 3–10):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "FA-SF-GANG"
# expected: FAIL — claim-gang, Partial-Modus, pipeline-partials.cjs,
# provider-register-bonsai.sh und plan-intel-filter.sh existieren noch nicht.
```

**Akzeptanz:**
- [x] Alle FA-SF-GANG-Tests laufen und schlagen VOR den Tasks 3–10 fehl (expected: FAIL).
- [x] Kein bestehender Test verändert; neue Tests folgen dem Offline-Muster (kein Live-DB-Zwang).

### Task 3: `slots.sh` — claim-gang, SUM-Accounting, Release-Reset

**Datei:** `scripts/factory/slots.sh` (Ist 37, Budget 463). Reale Basis-Signatur
(intel.json): `BRAND=<b> slots.sh claim <ext_id> <n>` mit
`UPDATE tickets.tickets SET pipeline_slot=:slot, status='in_progress' WHERE
external_id=:id AND pipeline_slot IS NULL AND status IN
('backlog','triage','plan_staged') RETURNING pipeline_slot`.

Änderungen:

1. **`count`** wechselt von `count(*)` auf Summen-Accounting:
   `SELECT COALESCE(SUM(slot_count),0) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress';`
2. **`claim-gang <ext_id> <n>`** — EINE atomare SQL-Anweisung, all-or-nothing
   (Design §3: Start erst, wenn alle Partialpläne einen Slot bekleiden):

```bash
  claim-gang)
    ext_id="${1:?usage: claim-gang <ext_id> <n>}"; n="${2:?usage: claim-gang <ext_id> <n>}"
    # Atomar: claimt nur, wenn SUM(slot_count) der laufenden Tickets + n in den
    # Brand-Pool passt — sonst 0 rows, Exit 1, NICHTS geclaimt.
    out=$(printf '%s' "UPDATE tickets.tickets SET pipeline_slot = sub.next_slot, slot_count = :'n'::integer, status='in_progress' FROM (SELECT COALESCE(min(s.n),0) AS next_slot FROM generate_series(1,${SLOTS_PER_BRAND}) s(n) WHERE s.n NOT IN (SELECT pipeline_slot FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress')) sub WHERE external_id = :'ext_id' AND pipeline_slot IS NULL AND status IN ('backlog','triage','plan_staged') AND (SELECT COALESCE(SUM(slot_count),0) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress') + :'n'::integer <= ${SLOTS_PER_BRAND} RETURNING pipeline_slot;" \
      | factory_psql -v ext_id="$ext_id" -v n="$n")
    if [[ -z "$out" ]]; then echo "claim-gang failed (pool < n, already slotted, or wrong status): $ext_id n=$n" >&2; exit 1; fi
    echo "$out"
    ;;
```

3. **`release`** setzt zusätzlich `slot_count=1` zurück (deckt auch den
   Dispatcher-Pfad `ticket.sh release-slot` ab — `scripts/factory/dispatcher.js`
   braucht deshalb keinen Diff):
   `UPDATE tickets.tickets SET pipeline_slot=NULL, slot_count=1 WHERE external_id = :'ext_id';`
4. Usage-Kommentar + `*)`-Fehlerzweig um `claim-gang` erweitern (Task-2-Test
   greift auf den usage-String zu). Legacy-`claim` bleibt für Alt-Pfade erhalten.

**Akzeptanz:**
- [ ] `claim-gang` bei `SUM(slot_count)+n <= FACTORY_SLOTS_PER_BRAND` erfolgreich, sonst Exit 1 und keine Zeile geändert (all-or-nothing per Konstruktion — Single-Statement, kein separates BEGIN/COMMIT nötig).
- [ ] Die Literale `SUM(slot_count)`, `COALESCE(SUM(slot_count),0)`, `slot_count=1`, `claim-gang` stehen exakt so im Skript (FA-SF-GANG-Assertions aus Task 2).
- [ ] `bash -n scripts/factory/slots.sh` grün; Datei bleibt weit unter 500 Zeilen.

### Task 4: `schedule.sh` — Head-of-Line-Blocking + slot_count-Lookup

**Datei:** `scripts/factory/schedule.sh` (Ist 75, Budget 425). Reale Signatur
(intel.json): `BRAND=<b> FACTORY_GLOBAL_CAP=3 schedule.sh -> JSON
[{brand,external_id,slot}]`; heute `continue` bei vollem Brand-Pool = KEIN
Head-of-Line-Blocking.

Änderungen in der Kandidaten-Schleife (nach Dependency- und Conflict-Gate):

```bash
  # Gang-Bedarf des Kandidaten (Design §3): slot_count wird von stage-plan
  # --partials gesetzt; Default 1 = Single-Slot wie bisher.
  needed=$(printf '%s' "SELECT COALESCE(slot_count,1) FROM tickets.tickets WHERE external_id = :'ext_id';" \
    | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql -v ext_id="$ext_id")
  needed="${needed:-1}"

  used=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count)
  free=$(( ${FACTORY_SLOTS_PER_BRAND:-3} - ${used:-0} ))

  # head-of-line blocking: passt der vorderste Gang-Kandidat nicht, werden KEINE
  # nachrangigen Tickets vorgezogen (sonst Gang-Starvation) — break, kein continue.
  if [[ "$needed" -gt "$free" || $(( global_used + needed )) -gt "$GLOBAL_CAP" ]]; then
    break
  fi

  if BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim-gang "$ext_id" "$needed" >/dev/null 2>&1; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$needed" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + needed))
  fi
```

Der bisherige `slots.sh next` + `claim`-Block entfällt in der Schleife (ersetzt
durch `claim-gang`; für `needed=1` ist das Verhalten identisch zum heutigen
Single-Claim). Die `global_used`-Berechnung am Kopf bleibt und nutzt das
SUM-Accounting aus Task 3 automatisch mit.

**Akzeptanz:**
- [ ] Vorderster Kandidat mit `needed > free` → `break` (kein nachrangiges Ticket wird in diesem Tick geclaimt).
- [ ] Kommentar-Literal `head-of-line` und Aufruf `claim-gang` vorhanden (Task-2-Assertions).
- [ ] JSON-Ausgabeform `[{brand,external_id,slot}]` bleibt kompatibel (Dispatcher-Kontrakt unverändert; `slot` trägt jetzt die Gang-Größe).
- [ ] `bash -n` grün; Budget 425 weit eingehalten.

### Task 5: `stage-plan --partials N` ohne ticket.sh-Wachstum

**Datei:** `scripts/vda/ticket/stage-plan.sh` (Ist 50, Budget 450). `scripts/ticket.sh`
(Budget -350) wird NICHT angefasst — es sourced `stage-plan.sh` und reicht `"$@"`
durch; der Optionsparser lebt vollständig in `stage-plan.sh` (Design §2:
Partial-Anzahl direkt in der Stage-Query ablegen).

```bash
  local id="" branch="" plan="" partials="1"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)       id="$2"; shift 2 ;;
      --branch)   branch="$2"; shift 2 ;;
      --plan)     plan="$2"; shift 2 ;;
      --partials) partials="$2"; shift 2 ;;
      *)          echo "Unknown stage-plan option: $1" >&2; exit 2 ;;
    esac; done
  case "$partials" in 1|2|3) ;; *) echo "ERROR: --partials must be 1..3" >&2; exit 2 ;; esac
```

und in der ersten UPDATE-Query:

```sql
UPDATE tickets.tickets SET status='plan_staged', slot_count = :'partials'::integer
 WHERE external_id = :'ext_id';
```

MCP-Pfad: `ticket-mcp stage_plan` bleibt der bevorzugte Weg der Skills; wo die
Partial-Anzahl MCP-seitig noch nicht als Parameter durchgereicht werden kann,
notieren die Skills (Task 11) den Fallback `bash scripts/ticket.sh stage-plan
--id … --branch … --plan … --partials N` sowie ticket-mcp `set_plan_meta` für
weitere Plan-Metadaten (reale Tools aus intel.json `symbols`).

**Akzeptanz:**
- [ ] `--partials` validiert 1..3, Default 1 (voll rückwärtskompatibel).
- [ ] `slot_count` wird in derselben Stage-Query gesetzt (das Gang-Gating aus Task 4 liest genau dieses Feld).
- [ ] `git diff --stat` zeigt KEINE Änderung an `scripts/ticket.sh` (Task-2-Assertion: `grep -- --partials scripts/ticket.sh` bleibt leer).

### Task 6: `plan-lint.sh` — Partial-Modus mit D1-Disjunktheit

**Datei:** `scripts/plan-lint.sh` (Ist 242, Budget 258). Reale Basis
(intel.json): `effective_threshold(path)` = `max(_ext_limit, baseline.metric)`,
0 = ungated. Aktivierung: existiert `"$(dirname "$PLAN")/tasks.d"` und der
übergebene Plan ist der Index (`tasks.md`), läuft der Partial-Modus; ohne
`tasks.d/` degeneriert alles zum heutigen Single-Plan-Modus (kein Verhaltens-Diff).

Partial-Modus-Regeln (Design §1):

1. **Index-Checks auf `tasks.md`:** F1/F2/STRUCT1/STRUCT3 wie bisher, PLUS eine
   `## Partials`-Manifest-Tabelle mit Zeilen der Form
   `| <id> | tasks.d/pX-<name>.md | impl-oder-tests | <target_files, komma-separiert> |`.
   Fehlt die Tabelle oder eine referenzierte Partial-Datei → Hard-Fail.
2. **STRUCT2 im Tests-Partial:** die Failing-Test-Prüfung (Phrase + Testrunner)
   läuft gegen die LETZTE Manifest-Zeile (Rolle `tests` — Pflicht); der Index
   selbst braucht keinen eigenen Failing-Test-Step mehr.
3. **P1/B1a/B1b pro Partial-Datei:** die bestehenden Scans laufen zusätzlich
   über jede `tasks.d/*.md` (Prose-Extraktion und Budget-Scan werden dafür in
   eine Funktion `lint_body <file>` gehoben und wiederverwendet — kein
   Copy-Paste).
4. **D1 (NEU, Hard):** keine Datei in zwei Partials — die `validateDisjoint`-Logik
   aus `scripts/factory/pipeline-decompose.cjs` (`throws Error bei Datei in 2
   Sub-Features`) als Bash-Lint-Regel über die Manifest-Spalte `target_files`:

```bash
# D1: Disjunktheit der Partial-target_files (validateDisjoint-Logik, bash)
dupes=$(printf '%s\n' "${ALL_PARTIAL_FILES[@]}" | sort | uniq -d)
[[ -n "$dupes" ]] && hard "D1: file(s) assigned to multiple partials: $(echo "$dupes" | tr '\n' ' ')"
```

Nach der Erweiterung liegt die Datei bei grob 242 + ~110 ≈ 352 Zeilen — unter
80 % der 500er-Schwelle, kein weiterer Split nötig. Sollte die Implementierung
wider Erwarten größer geraten, wird der Partial-Modus als
`scripts/plan-lint-partials.sh` extrahiert und gesourced (Vorsorge-Regel, kein
Zusammenziehen).

**Akzeptanz:**
- [ ] Fixture `duplicate` (Task 2) → Exit 1 mit `D1`-Meldung; Fixture `ok` → Exit 0.
- [ ] Single-Plan ohne `tasks.d/` verhält sich identisch zu heute (dieser Plan hier PASSt weiterhin).
- [ ] Tests-Partial-Pflicht: Manifest ohne `tests`-Rolle in der letzten Zeile → Hard-Fail.

### Task 7: `plan-intel-filter.sh` — deterministischer jq-Kontext-Filter

**Datei:** `scripts/plan-intel-filter.sh` (NEU, Limit 500, Ziel < 80 Zeilen).
Hybrid-Kontext-Transfer Teil 1 (Design Entscheidung 7): typisierte Wahrheit wird
deterministisch gefiltert, NICHT per Embedding.

```bash
#!/usr/bin/env bash
# scripts/plan-intel-filter.sh <intel.json|slug> <target_file>...
# Emits the intel.json subset a partial-plan subagent needs: impact_files whose
# path is in the target list, symbols whose file matches, plus meta/db_tables/
# api_contracts/risks verbatim (small, correctness-critical).
set -euo pipefail
src="${1:?usage: plan-intel-filter.sh <intel.json|slug> <target_file>...}"; shift
[[ -f "$src" ]] || src="openspec/changes/${src}/intel.json"
[[ -f "$src" ]] || { echo "intel.json not found: $src" >&2; exit 1; }
jq --args '
  ($ARGS.positional) as $t
  | .impact_files = [.impact_files[] | select(.path as $p | $t | index($p))]
  | .symbols      = [(.symbols // [])[] | select((.file // "") as $f | $t | index($f))]
' "$src" "$@"
```

**Akzeptanz:**
- [ ] BATS-Assertion aus Task 2 grün (a.sh drin, b.sh raus).
- [ ] `db_tables`/`api_contracts`/`risks`/`meta` werden ungefiltert durchgereicht (klein + korrektheitskritisch).
- [ ] S4: referenziert aus beiden Plan-Skills (Task 11) — kein Orphan.

### Task 8: `pipeline-partials.cjs` + `pipeline.js`-Extraktion (Netto-Shrink)

**Dateien:** `scripts/factory/pipeline-partials.cjs` (NEU, CJS, Limit 200 — KEIN
ESM, Workflow-Constraint wie `pipeline-decompose.cjs`), `scripts/factory/pipeline-runner.js`
(Ist 308, Budget 292), `scripts/factory/pipeline.js` (Ist 630, Budget -30).

**8a — `pipeline-partials.cjs`:** pures CJS-Modul (S2: keine Rück-Imports auf
DB-/API-Schichten; nur `fs`/`path` und `require('./pipeline-decompose.cjs')`):

- `parsePartialsManifest(indexMd)` → `[{id, file, role, target_files: []}]` aus der
  `## Partials`-Tabelle (gleiche Tabellen-Grammatik wie plan-lint Task 6).
- `readPartials(changeDir)` → liest `tasks.md` + `tasks.d/*.md`, mappt auf die
  batch-`sub_features`-Form (reale Signatur intel.json: `args {batch_mode?,
  sub_features?}` — `{id, title, description, assignedFiles}`), ruft
  `validateDisjoint(subFeatures)` aus `pipeline-decompose.cjs` (wirft bei
  Duplikat — Laufzeit-Doppelprüfung zusätzlich zu Lint-D1).
- `buildPartialPrompt(sf, ctx)` → der Implement-Prompt-Text für ein Partial
  (aus `pipeline.js` EXTRAHIERT — siehe 8c) inkl. `partial-done`-Abschlussprotokoll.
- `rotationReady(doneEvents, partials)` → true, wenn alle `impl`-Partials ein
  `partial-done` gemeldet haben (Basis für Task 9).
- `module.exports = { parsePartialsManifest, readPartials, buildPartialPrompt, rotationReady }`.
- Eigene Testdatei nicht nötig — Abdeckung über FA-SF-GANG (`node --check` +
  Verhalten via plan-lint-Fixtures); hält die 200er-`.cjs`-Grenze frei.

**8b — `pipeline-runner.js` Kommando `read-partials`:** neuer `else if
(command === 'read-partials')`-Zweig im bestehenden Dispatch: payload
`{slug}` → `require('./pipeline-partials.cjs').readPartials(...)` auf
`openspec/changes/<slug>/` (Worktree-/Repo-Pfad wie die bestehenden Kommandos),
druckt `{"partials":true,"sub_features":[…]}` bzw. `{"partials":false}` wenn kein
`tasks.d/` existiert. Budget 292 — ca. 12 Zeilen, unkritisch.

**8c — `pipeline.js` Extract + Generalisierung (B1b-Pflicht-Schritt):** Budget -30 ⇒
die Datei MUSS netto schrumpfen (auf ≤600 Zeilen):

- Im REUSE-Pfad (`FACTORY-PLAN-REF` erkannt) zuerst `runRunner(agent,
  'read-partials', { slug: safeSlug })`: liefert der Runner `partials: true`,
  werden die `sub_features` direkt in den (verallgemeinerten) batch-Pfad
  gespeist — der Laufzeit-`plan:decompose`-Agent (Z. 279 ff.) bleibt Fallback
  für Alt-Pläne ohne Partials (Design §3).
- **Extract:** der lange Inline-Prompt-Text des batch-Implement-Agents
  (Z. 155–174) wird durch `buildPartialPrompt` aus `pipeline-partials.cjs`
  ersetzt, den der Runner pro sub_feature als fertiges Prompt-Feld mitliefert
  (`read-partials`-Payload) — `pipeline.js` behält nur den `agent(...)`-Aufruf.
  Dieser Split der Partial-/Batch-Promptlogik in das neue Modul verkleinert
  `pipeline.js` netto um mehr als die geforderten 30 Zeilen.
- Kein Verhalten des Nicht-Partial-Pfads ändert sich (Scout/Design/Plan/Verify/
  Deploy unverändert).

**Akzeptanz:**
- [ ] `node --check` grün für `pipeline-partials.cjs`, `pipeline-runner.js`, `pipeline.js`.
- [ ] `wc -l scripts/factory/pipeline.js` ≤ 600 (S1-Ratchet: Baseline darf nicht wachsen — echter Extract, kein Zusammenziehen).
- [ ] `wc -l scripts/factory/pipeline-partials.cjs` ≤ 200.
- [ ] FA-SF-GANG-Assertions (require-Kante, `read-partials`) grün.

### Task 9: Rotation + `partial-done`-Phase-Events

**Dateien:** `scripts/factory/pipeline.js` und `scripts/factory/pipeline-partials.cjs`
(im Rahmen des Task-8-Umbaus — das Netto-Budget wird gemeinsam mit Task 8
eingehalten).

- **Completion-Protokoll (Design §4):** jeder Partial-Agent endet mit strukturiertem
  Ergebnis; `pipeline.js` ruft danach `phaseEvent('implement', 'partial-done',
  JSON.stringify({partial: sf.id, files: sf.assignedFiles, tests: 'pass'}))`
  (bzw. `tests: 'fail'`) — Spalten real aus intel.json `db_tables`:
  `tickets.factory_phase_events (ticket_id, phase, state, detail, driver, at)`,
  `state='partial-done'`, `detail` = strukturiertes JSON. Sichtbar auf dem
  Factory-Floor ohne Schema-Änderung.
- **Kontext-Freigabe:** der llama.cpp-Server-Slot wird mit Request-Ende frei;
  zusätzlich läuft der bestehende `provider_health`-Release über die
  `route-provider.sh`-Mechanik (reale Signatur intel.json: `route-provider.sh
  <source> <tier> [phase] -> {provider,modelId,baseUrl,slotId,emergency}`) —
  keine neue Release-Maschinerie bauen.
- **Rotation p3 → Review:** nach `rotationReady(...)` (Task 8a) startet der
  Review-Agent als Fortsetzung des Tests-Partial-Agents: gleicher Prompt-Präfix
  wie sein Test-Lauf (llama-server Prompt-Cache-Hit — der Reviewer kennt die
  Tests wirklich) + die Diffs von p1/p2 (`git -C <WT> diff origin/main...HEAD --
  <p1/p2-target_files>`) + Abgleich gegen archivierte Changes via factory-mcp
  `openspec_find_similar` (reales MCP-Tool, intel.json `symbols`). Das Ergebnis
  fließt als zusätzliche Review-Lens in den bestehenden Verify-Fluss
  (REVIEW_SCHEMA unverändert).
- Danach unverändert: Verify → PR → Auto-Merge; `slots.sh release` (Task 3) gibt
  `slot_count` frei; Merge = Abschluss (T001092) bleibt wie es ist.

**Akzeptanz:**
- [ ] `grep -F "partial-done" scripts/factory/pipeline.js` trifft (Task-2-Assertion).
- [ ] `detail` ist parsebares JSON mit `partial`, `files`, `tests`.
- [ ] Rotation startet erst, wenn ALLE impl-Partials `partial-done` gemeldet haben; Review nutzt den p3-Kontext ohne Modellwechsel (Design Entscheidung 4).

### Task 10: `provider-register-bonsai.sh` — idempotente Registrierung

**Datei:** `scripts/factory/provider-register-bonsai.sh` (NEU, Limit 500, Ziel
< 80 Zeilen). Muster: `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql`
(ON-CONFLICT-Upsert), aber als wiederholbar aufrufbares Skript über
`factory_psql` für BEIDE Brands. Reale Spalten aus intel.json:
`tickets.provider_config (source, tier, priority, provider, model_id, base_url,
max_concurrent, enabled, …)` mit `UNIQUE(source,tier,priority)`;
`tickets.factory_model_slots (phase, provider, model_id, base_url, set_by,
updated_at)` — der Unique-Index auf `phase` kommt aus Task 1.

```bash
#!/usr/bin/env bash
# scripts/factory/provider-register-bonsai.sh — register the Bonsai llama.cpp
# server (:8093, 3 worker slots) for implement + review. Idempotent (ON CONFLICT).
#   bash scripts/factory/provider-register-bonsai.sh            # both brands
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for b in mentolder korczewski; do
  BRAND="$b" bash -c 'source "'"$HERE"'/lib.sh"; factory_resolve; factory_psql' <<'SQL'
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', 0, 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 3, true),
  ('factory-review',    'sonnet', 0, 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 3, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = true, updated_at = now();

INSERT INTO tickets.factory_model_slots (phase, provider, model_id, base_url, set_by)
VALUES
  ('implement', 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 'provider-register-bonsai'),
  ('verify',    'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 'provider-register-bonsai')
ON CONFLICT (phase) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, set_by = EXCLUDED.set_by, updated_at = now();
SQL
  echo "bonsai provider registered for $b"
done
```

Scout/Plan behalten ihr heutiges Routing (Design Entscheidung 4): das Skript
fasst nur `implement` + `verify` an. `route-provider.sh` bevorzugt
`factory_model_slots` (phase-pin) ohnehin vor `provider_config` — keine
Code-Änderung dort nötig. Slot-Budget-Konvention: `-np 4` am Server = 3 Worker
(`max_concurrent=3`) + 1 Orchestrator (Design Entscheidung 5).

**Akzeptanz:**
- [ ] Zweifacher Lauf hintereinander: identischer Endzustand, keine Duplikate (ON CONFLICT).
- [ ] `bash -n` grün; FA-SF-GANG-Assertions (`ON CONFLICT`, `http://127.0.0.1:8093/v1`) grün.
- [ ] S4: referenziert aus `.claude/skills/llama-cpp/references/bonsai-server-windows.md` (Task 13) — kein Orphan.

### Task 11: Skill-Updates — Schritt 3.7 zweistufig + design.md-Konvention

**Dateien:** `.claude/skills/dev-flow-plan/SKILL.md` (ungated, `.md`),
`.opencode/skills/opencode-flow-plan/SKILL.md` (ungated) — symmetrisch (Design §2).

1. **Schritt 3.7 wird zweistufig:**
   - **(a) Decompose:** der Orchestrator erzeugt aus `intel.json`
     (`impact_files`) das Partial-Manifest — 1–3 Partials, disjunkte
     `target_files`-Listen, LETZTES Partial = `tests` (trägt den
     STRUCT2-Failing-Test-Step). Faustregel im Skill: 1 Partial bei < 5
     impact_files oder einem einzigen Subsystem; sonst Schnitt nach Subsystem,
     Tests immer separat.
   - **(b) Fan-out:** N parallele Plan-Subagenten (Claude Code: `Task`-Tool;
     opencode: `delegate(...)`). Kontext pro Subagent NUR: `proposal.md`, sein
     Manifest-Eintrag, die Ausgabe von `bash scripts/plan-intel-filter.sh <slug>
     <target_files...>` (Task 7) und die plan-quality-gates-Referenz. Jeder
     schreibt SEINE `tasks.d/pX-<name>.md`; der Orchestrator schreibt den
     `tasks.md`-Index mit `## Partials`-Manifest und finalem Verify-Task.
2. **design.md-SSOT-Konvention (Design Entscheidung 6):** alle
   `docs/superpowers/specs/<date>-<slug>-design.md`-Pfade in beiden Skills werden
   auf `openspec/changes/<slug>/design.md` umgestellt (Spec-Schreiben in Phase A,
   der `mv`-Block in B.2 entfällt für die Spec — sie liegt schon im Change-Ordner,
   Ticket-Description-Templates, Schritt-3.7-Kontext-Injektion). Alt-Bestand
   unter `docs/superpowers/specs/` bleibt liegen.
3. **Stage + Embedding-Index:** der Stage-Schritt übergibt die Partial-Anzahl
   (`ticket-mcp stage_plan` + Fallback `bash scripts/ticket.sh stage-plan …
   --partials N`, Task 5). Direkt nach dem Stage, vor Commit/Push:
   `node scripts/openspec-embed.mjs --slug <slug>` (reale CLI aus intel.json;
   Hybrid-Kontext-Transfer Teil 2 — pgvector-Index als Transfer-Medium für die
   Execute-/Factory-Phase, Abruf via factory-mcp `openspec_find_similar`).
4. **plan-lint-Aufruf im Gate-Schritt** bleibt `bash scripts/plan-lint.sh
   openspec/changes/<slug>/tasks.md` — der Partial-Modus aktiviert sich über die
   Existenz von `tasks.d/` von selbst (Task 6).
5. Branch-/Worktree-/Commit-Konventionen unverändert (ein Branch, ein Worktree).

**Akzeptanz:**
- [ ] Beide Skills beschreiben (a)+(b) inkl. Tests-Partial-Pflicht und Disjunktheits-Regel.
- [ ] Kein `docs/superpowers/specs/`-Pfad mehr in den beiden Plan-Skills (Alt-Referenzen in anderen Skills bleiben unangetastet — Scope-Grenze).
- [ ] `openspec-embed.mjs`- und `plan-intel-filter.sh`-Aufrufe wörtlich enthalten (S4-Anker für Task 7).

### Task 12: Tooling-Nachzug — `vda frontmatter` + `plan-context.sh`

**Dateien:** `scripts/vda/frontmatter.sh` (Ist 239, Budget 261), `scripts/vda.sh`
(Ist 96, Budget 404), `scripts/plan-context.sh` (Ist 145, Budget 355).
Risiko aus design.md §Risiken: Tooling-Abhängigkeiten auf
`docs/superpowers/specs/` müssen bei der design.md-Umstellung mitgezogen werden.

- `scripts/vda/frontmatter.sh`: der `--spec`-Modus akzeptiert und dokumentiert
  die neue Pfadkonvention `openspec/changes/<slug>/design.md` (Frontmatter-Block
  identisch: `ticket_id`/`plan_ref`/`status`/`date`); der Usage-Kommentar nennt
  beide Welten (Alt-Bestand bleibt gültig).
- `scripts/vda.sh`: Hilfetext-Zeile des `frontmatter`-Subcommands erwähnt
  `design.md` (eine Zeile, Budget 404 unkritisch).
- `scripts/plan-context.sh`: beim Emittieren eines aktiven Changes werden nach
  `tasks.md` auch vorhandene `tasks.d/*.md`-Partials (als `#### Partial: pX`)
  und eine vorhandene `design.md` (als `#### Design`) angehängt;
  `_parse_yaml_domains` fällt wie bisher auf `tasks.md` zurück — Partials ohne
  eigenes Frontmatter werden toleriert (intel.json-Note: „liest Plan-Frontmatter
  — tasks.d/-Partials tolerieren").

**Akzeptanz:**
- [ ] `bash scripts/plan-context.sh orchestrator` auf einem Change mit `tasks.d/` emittiert Index + alle Partials + design.md ohne Fehler; ohne `tasks.d/` unverändertes Verhalten.
- [ ] `bash scripts/vda.sh frontmatter --spec openspec/changes/<slug>/design.md` prependet idempotent das Spec-Frontmatter.
- [ ] `bash -n` für alle drei Dateien grün.

### Task 13: llama-cpp-Skill-Referenz „Bonsai-Server (Windows)"

**Dateien:** `.claude/skills/llama-cpp/references/bonsai-server-windows.md` (NEU,
ungated), `.claude/skills/llama-cpp/SKILL.md` (Verweis ergänzen).

Inhalt der Referenz (Design §5 — das Server-Setup selbst ist bereits erledigt,
hier wird NUR dokumentiert):

- Zugriff vom WSL-Host via `powershell.exe`; Reboot-Skript
  `C:\Users\PatrickKorczewski\.lmstudio\start-bonsai-server.ps1`
  (`powershell.exe -NoProfile -File …`).
- Port `8093`, OpenAI-kompatible Base-URL `http://127.0.0.1:8093/v1`.
- Health-/Props-Checks: `curl -s http://127.0.0.1:8093/health` und
  `curl -s http://127.0.0.1:8093/props | jq '.default_generation_settings.n_ctx'`
  (erwartet: kv-unified-Pool 262144).
- Slot-Budget-Konvention: `-np 4` = 3 Factory-Worker + 1 Orchestrator
  (Factory-DB-Pool bleibt 3; Registrierung: `bash
  scripts/factory/provider-register-bonsai.sh` — S4-Anker für Task 10).
- Log-Pfade des PS1-Skripts + Risiko-Hinweis: 4 parallele Long-Context-Sequenzen
  drosseln die effektive Kontextlänge pro Slot (kv-unified-Kontention).
- `.claude/skills/llama-cpp/SKILL.md`: References-Liste um
  `references/bonsai-server-windows.md` ergänzen.

**Akzeptanz:**
- [ ] Referenz enthält Reboot-Kommando, Port, Health-Check, Slot-Budget und den `provider-register-bonsai.sh`-Verweis.
- [ ] Keine Brand-Domain-Literale (S3 betrifft `k3d/`, `prod*/`, `website/src/` ohnehin nicht — trotzdem env-neutral formulieren).

### Task 14: PR-Gate — PR erst nach lokalem Grün + abgeschlossenem Review

**Dateien:** `scripts/factory/pipeline.js` (Netto-Budget gemeinsam mit Task 8:
nach dem Extract bleibt die Datei auch mit dem Gate ≤600 Zeilen),
`scripts/factory/pipeline-partials.cjs` (Gesamtdatei bleibt ≤200),
`scripts/factory/pipeline-runner.js` (kleiner Zweig, Budget 292 unkritisch),
`tests/spec/software-factory.bats` (design.md §4b).

**Faustregel aus dem Design (verbatim umzusetzen):** Ein PR wird erst erstellt,
wenn `task test:all && task freshness:check` LOKAL grün sind UND der rotierte
p3-Review (Task 9) abgeschlossen ist. Alles davor bleibt Branch-Push ohne PR.

1. **Autorisierungssignal:** Nach grünem lokalem Verify + abgeschlossenem
   Review emittiert die Pipeline `phaseEvent('verify', 'pr-ready',
   JSON.stringify({tests: 'pass', freshness: 'pass', review: 'done'}))` —
   Spalten real aus intel.json `db_tables`: `tickets.factory_phase_events
   (ticket_id, phase, state, detail, driver, at)`. Erst dieses Event
   autorisiert die PR-Erstellung.
2. **Gate-Helper:** `pipeline-partials.cjs` erhält
   `prGateSatisfied(phaseEvents)` → true nur, wenn ein `verify`/`pr-ready`-Event
   vorliegt (pures CJS, S2-konform — Events kommen als Parameter rein, kein
   DB-Import). `pipeline-runner.js` erhält einen `else if (command ===
   'pr-gate')`-Zweig, der die Phase-Events des Tickets host-seitig liest und
   `{"pr_ready":true}` bzw. `{"pr_ready":false}` druckt.
3. **Deploy-Phase-Gate in `pipeline.js`:** Vor dem PR-Schritt ruft die
   Deploy-Phase `runRunner(agent, 'pr-gate', { ticket_id: A.ticket_id })`; bei
   `pr_ready:false` wird NUR der Branch gepusht (`git push -u origin
   <WORK_BRANCH>`, kein `gh pr create`, kein Merge-Queue) und die Pipeline
   endet mit `{ status: 'pending-pr-gate' }` — der nächste Tick prüft erneut.
   Die Zeilen dafür sind im Task-8-Extract-Budget eingepreist (Netto ≤600
   bleibt Pflicht; notfalls wandert weiterer Deploy-Prompt-Text in
   `pipeline-partials.cjs`, solange dessen 200er-Limit hält — sonst Split in
   ein zweites `.cjs`-Modul).

Neue BATS-Assertions (an den FA-SF-GANG-Block aus Task 2 anfügen, RED vor
diesem Task):

```bats
@test "FA-SF-GANG: Deploy-Phase kennt das pr-ready-Gate" {
  run grep -Fq "pr-ready" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -Fq "pending-pr-gate" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -Fq "pr-gate" scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "pr-ready"
# expected: FAIL — das Gate existiert noch nicht.
```

**Akzeptanz:**
- [ ] Ohne `verify`/`pr-ready`-Event: kein `gh pr create` — nur Branch-Push, Pipeline-Ergebnis `pending-pr-gate`.
- [ ] `pr-ready` wird NUR nach lokal grünem `task test:all && task freshness:check` UND abgeschlossenem p3-Review emittiert.
- [ ] `wc -l scripts/factory/pipeline.js` ≤ 600 und `wc -l scripts/factory/pipeline-partials.cjs` ≤ 200 bleiben eingehalten.

### Task 15: CI-Babysit-Loop (ticket-scoped) — `pr-babysit-ticket.sh`

**Dateien:** `scripts/factory/pr-babysit-ticket.sh` (NEU, Limit 500, Ziel
< 150 Zeilen), `scripts/factory/pipeline.js` (Deploy-Prompt referenziert das
Skript — S4-Anker), `tests/spec/software-factory.bats`.

**Abgrenzung (design.md §4b):** ergänzt den repo-weiten Scanner
`scripts/factory/babysit-prs.sh`, ersetzt ihn NICHT — dieses Skript überwacht
ausschließlich den EIGENEN, gerade erstellten PR des Tickets (event-getrieben
statt Repo-Scan). Wiederverwendung statt Duplikation: die Fehlerklassifikation
kommt per `source scripts/factory/classify-failure.sh` (`classify_failure
<ci-log-file>` — reale Signatur, echoes genau eine Klasse), die
Polling-Kadenz, die Check-Übersicht (`gh pr checks --json name,state,link`)
und die Job-Level-Step-Diagnose kommen aus
`.claude/skills/references/ci-fix-loop.md` (SSOT — dort nachlesen, nicht
kopieren); `scripts/devflow-ci-watch.sh` bleibt der dev-flow-Einstieg und wird
nicht angefasst. GitHub-CLI-Aufrufe laufen über den bevorzugten Wrapper
`gh-axi` (Referenz `.claude/skills/references/gh-axi.md`) mit `gh`-Fallback.

Ablauf des Skripts (`pr-babysit-ticket.sh <ticket_id> <pr_number>`):

1. **Nach** PR-Erstellung + `gh pr merge --squash --auto` (Queue) starten.
2. Poll-Schleife über die Checks des EIGENEN PR (Kadenz aus ci-fix-loop.md);
   alles grün oder Merge erfolgt → Exit 0.
3. **Roter Check:** Details einsammeln (Check-Name, `gh run view --log-failed`
   Tail, betroffene Dateien aus dem Diff), `classify_failure` auf das Log,
   dann einen Fix-Subagenten mit genau diesen Details dispatchen
   (Prompt-Vorlage aus ci-fix-loop.md §Fix-Subagent; im Factory-Kontext via
   Deploy-Phase-Agent, im Orchestrator-Kontext via Task-Tool) und auf dessen
   Rückkehr WARTEN.
4. **Re-Check vor Requeue:** danach ERNEUT ALLE Checks prüfen — inzwischen
   rot gewordene Checks zuerst fixen (zurück zu 3.). Auto-Merge wird erst
   requeued (`gh pr merge --squash --auto`), wenn KEIN bekannt-roter Check
   mehr existiert (grün oder pending sind ok).
5. Versuchslimit (`MAX_CI_ATTEMPTS`-Konvention, Default 5) → Exit 1 mit Liste
   der roten Checks; Eskalation läuft über den bestehenden Blocked-Pfad der
   Pipeline (`update-status --status blocked` + PushNotification wie gehabt).
6. Merge → Ticket `done`, `slot_count` released (Task 3) — unverändert.

In `pipeline.js` ersetzt der Aufruf `bash ${REPO}/scripts/factory/pr-babysit-ticket.sh
<ticket_id> "$PR"` den bisherigen Inline-Retry-Block (Schritt 3a–d des
Deploy-Prompts) — das ist zugleich ein weiterer Extract-Beitrag zum
Netto-Shrink aus Task 8/14 und der S4-Anker des neuen Skripts.

Neue BATS-Assertions (FA-SF-GANG-Block, RED vor diesem Task):

```bats
@test "FA-SF-GANG: pr-babysit-ticket.sh reuse statt Duplikation" {
  run bash -n scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'classify-failure.sh' scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq -- '--squash --auto' scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'pr-babysit-ticket.sh' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "pr-babysit"
# expected: FAIL — das Skript existiert noch nicht.
```

**Akzeptanz:**
- [ ] Kein Requeue mit bekannt-rotem Check: der `--auto`-Requeue-Aufruf steht NACH dem vollständigen Re-Check-Schritt (Code-Reihenfolge + Kommentar).
- [ ] Fix-Subagent-Dispatch enthält Check-Name, Log-Auszug und betroffene Dateien; das Skript wartet synchron auf die Rückkehr.
- [ ] `babysit-prs.sh`, `devflow-ci-watch.sh`, `build-loop.sh` bleiben diff-frei (Ergänzung, kein Ersatz).
- [ ] `bash -n` grün; Datei ≤ 500 Zeilen.

### Task 16: GREEN + finale Verifikation

1. **GREEN-Lauf des RED-Tests aus Task 2 (inkl. der Zusatz-Assertions aus Task 14/15):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "FA-SF-GANG"
# jetzt: PASS — alle FA-SF-GANG-Tests grün nach den Tasks 3–15
```

2. **Plan-/Spec-Gates:**

```bash
bash scripts/plan-lint.sh openspec/changes/parallel-partial-plans/tasks.md   # PASS
bash scripts/openspec.sh validate                                            # grün
```

3. **Mandatory CI-Gates (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

4. **Test-Inventar:** nach den BATS-Ergänzungen `task test:inventory` laufen
   lassen und `website/src/data/test-inventory.json` mitcommitten (CI failt sonst).
5. **Nachgelagert (nicht Teil dieses Plans, Design §6):** der E2E-Nachweis —
   synthetisches Mini-Feature durch den kompletten Durchstich (dev-flow-plan →
   3 Partials → Gang-Claim → 3 Bonsai-Subagenten → Rotation → PR) — läuft als
   separater Lauf NACH dem Merge dieses Changes; die Bonsai-27B-
   Implementierqualität ist dort der eigentliche Testgegenstand (Fallback:
   bestehendes Provider-Routing mit Circuit-Breaker).

<!-- vitest: kein neuer Test nötig, weil keine website/src-Datei geändert wird —
Testabdeckung läuft vollständig über BATS (tests/spec/software-factory.bats). -->

**Akzeptanz:**
- [ ] Alle drei STRUCT3-Kommandos grün; S1-Ratchet bestätigt `pipeline.js` ≤ 600 und keine Baseline-Neueinträge.
- [ ] `task test:inventory`-Artefakt aktuell.
