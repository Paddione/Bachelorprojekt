---
title: "devflow-phase-telemetry — Implementation Plan"
ticket_id: T001444
domains: [software-factory, dev-tooling, website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: devflow-phase-telemetry (T001444)

- [ ] Task 1: Auto-Emission in `scripts/vda/ticket/update-status.sh` (Status → Phase-Event, Dedup, `TICKET_PHASE_DRIVER`)
- [ ] Task 2: Auto-Emission in `scripts/vda/ticket/stage-plan.sh` (scout/design/plan done)
- [ ] Task 3: `scripts/factory/pipeline.js` exportiert `TICKET_PHASE_DRIVER=factory`
- [ ] Task 4: Neues Gate-Modul `scripts/vda/ticket/assert-phase-chain.sh` + Dispatcher in `scripts/ticket.sh`
- [ ] Task 5: `.claude/skills/dev-flow-execute/SKILL.md` — Pflicht-Gate vor `gh pr merge`, verify von best-effort auf Pflicht
- [ ] Task 6: Versand-Lane — Label-SSOT `pipeline-order.ts` + `ShippedColumn.svelte` Import & Untertitel
- [ ] Task 7: Finale Verifikation (Gates + Inventar + OpenSpec-Validate)

---

# devflow-phase-telemetry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dev-flow-execute-Läufe werden ohne Agent-Disziplin vollständig auf dem Factory Floor sichtbar, ein fail-closed Gate erzwingt die Phase-Kette vor dem Merge, und die Versand-Lane erklärt ihre entkoppelte-Deploy-Semantik.

**Architecture:** Phase-Events entstehen deterministisch als SQL-Seiteneffekt der Status-Transitions in den zwei sourced Ticket-Modulen (deckt CLI und MCP `transition_status` ab), idempotent per `NOT EXISTS`-Dedup. Ein neues sourced Modul `assert-phase-chain.sh` prüft die Kette maschinell; das dev-flow-execute-Skill ruft es fail-closed vor `gh pr merge`. Das Versand-Lane-Label wird auf einen SSOT (`pipeline-order.ts`) reduziert.

**Tech Stack:** Bash (`psql -qtA -v ON_ERROR_STOP=1` via `kubectl exec`), Postgres 16 (`tickets.factory_phase_events`), BATS (offline, PATH-Stub für `kubectl`), TypeScript/Svelte (Vitest).

## Global Constraints

- Phase-Werte ∈ `{scout,design,plan,implement,verify,deploy}`, State ∈ `{entered,done,blocked}`, Driver ∈ `{factory,devflow}` — die DB-`CHECK`-Constraints auf `tickets.factory_phase_events` (SSOT-DDL: `website/src/lib/tickets/tables/factory-control.ts`).
- Telemetrie darf einen Statuswechsel NIE fatal machen: die UPDATE-Anweisung läuft im psql-Autocommit VOR dem Event-INSERT (die gemappten `(phase,state)`-Werte sind stets CHECK-gültig).
- Auto-Events tragen `detail` mit dem Präfix `auto:` zur Unterscheidung von hand-emittierten Events.
- Arg-Validierung IMMER vor `_pgpod` (FA-SF-48-Konvention), damit Fehlbedienung offline deterministisch Exit 2 gibt.
- `scripts/ticket.sh` und `scripts/factory/pipeline.js` stehen in `docs/code-quality/gates.yaml → s1.ignore`; Zeilenwachstum dort ist S1-neutral. `ticket.sh` wird nur um Dispatcher-Zeilen erweitert, die Logik bleibt in das sourced Modul extrahiert (kein weiterer Extract der Datei nötig).
- Keine Brand-Domain-Literale (`*.mentolder.de` / `*.korczewski.de`) in Code oder Snippets (S3).

---

## File Structure

```
scripts/vda/ticket/update-status.sh    ← MODIFY: Status→Phase-Event-Mapping + Dedup-INSERT
scripts/vda/ticket/stage-plan.sh       ← MODIFY: scout/design/plan done Auto-Emission
scripts/vda/ticket/assert-phase-chain.sh ← CREATE: fail-closed Phase-Chain-Gate (sourced Modul)
scripts/ticket.sh                      ← MODIFY: Dispatcher-Zeilen für assert-phase-chain (s1.ignore)
scripts/factory/pipeline.js            ← MODIFY: TICKET_PHASE_DRIVER=factory export (s1.ignore)
.claude/skills/dev-flow-execute/SKILL.md ← MODIFY: Gate vor gh pr merge, verify Pflicht
website/src/lib/tickets/pipeline-order.ts ← MODIFY: shipped-Label 'Fertig' → 'Versand'
website/src/components/factory/ShippedColumn.svelte ← MODIFY: Label aus SSOT + Untertitel
website/src/lib/tickets/pipeline-order.test.ts ← MODIFY: Label-Assertion (Vitest)
tests/spec/software-factory.bats       ← MODIFY: neue @test-Blöcke (Auto-Emission, Gate)
```

### Pre-flight — S1-Schwellen (wirksame Grenze pro Datei)

| Datei | Ext / Limit | Ist | Nach Änderung | Reserve |
|---|---|---|---|---|
| `scripts/vda/ticket/update-status.sh` | .sh / 500 | 44 | ~74 | ~426 |
| `scripts/vda/ticket/stage-plan.sh` | .sh / 500 | 36 | ~50 | ~450 |
| `scripts/vda/ticket/assert-phase-chain.sh` | .sh / 500 | 0 (neu) | ~58 | ~442 |
| `scripts/ticket.sh` | s1.ignore | 852 | ~857 | n/a (ignored) |
| `scripts/factory/pipeline.js` | s1.ignore | 709 | ~710 | n/a (ignored) |
| `website/src/lib/tickets/pipeline-order.ts` | .ts / 600 | 45 | 45 | 555 |
| `website/src/components/factory/ShippedColumn.svelte` | .svelte / 500 | 58 | ~63 | ~437 |
| `.claude/skills/dev-flow-execute/SKILL.md` | ungated | 569 | ~575 | n/a |
| `tests/spec/software-factory.bats` | ungated | 2966 | ~3080 | n/a |

<!-- vitest: pipeline-order.test.ts wird um eine Label-Assertion erweitert; ShippedColumn.svelte hat keinen eigenen Unit-Test (e2e nutzt data-testid), die Label-Ableitung wird über die SSOT-Assertion abgedeckt. -->

---

## Task 1: Auto-Emission in `update-status.sh`

**Files:**
- Modify: `scripts/vda/ticket/update-status.sh`
- Test: `tests/spec/software-factory.bats`

**Interfaces:**
- Consumes: `_pgpod`, `_exec_sql` aus `scripts/vda/ticket/_ticket-core.sh`; DB-Tabelle `tickets.factory_phase_events (ticket_id uuid, phase text, state text, detail text, driver text, at timestamptz)`.
- Produces: Als Seiteneffekt eines `update-status --id <ext_id> --status <status>`-Aufrufs wird für gemappte Status genau ein Phase-Event emittiert (`detail='auto: update-status <status>'`, `driver=$TICKET_PHASE_DRIVER`). Kein neues Bash-Symbol nach außen.

- [ ] **Step 1: Failing-Test-Step (RED).** Füge oben in `tests/spec/software-factory.bats` (nach den vorhandenen Test-Blöcken, z. B. am Dateiende vor einer evtl. bestehenden Sektion) einen Kapselblock mit einem `kubectl`-Capture-Stub und den Mapping-Tests hinzu:

```bash
# ── T001444-phase-telemetry ─────────────────────────────────────#
# Auto-Emission + fail-closed Gate. Offline, CI-safe: ein PATH-Stub ersetzt
# `kubectl` — `get` liefert einen Fake-Pod, `exec` schreibt -v-Args + SQL-Heredoc
# in eine Capture-Datei. Reads/Writes erreichen so nie einen echten Cluster.
_pt_capture_stub() {   # $CAP_FILE muss vor dem Aufruf exportiert sein
  local dir; dir="$(mktemp -d)"
  cat > "$dir/kubectl" <<'STUB'
#!/usr/bin/env bash
mode=""
for a in "$@"; do case "$a" in get) mode=get;; exec) mode=exec;; esac; done
if [[ "$mode" == get ]]; then echo "pod/shared-db-0"; exit 0; fi
printf '%s\n' "$@" >> "$CAP_FILE"
cat >> "$CAP_FILE"
exit 0
STUB
  chmod +x "$dir/kubectl"
  PATH="$dir:$PATH"
}

@test "T001444: update-status done auto-emits deploy/done" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_PHASE_DRIVER=devflow bash scripts/ticket.sh update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  grep -q "auto_phase=deploy"          "$CAP_FILE"
  grep -q "auto_state=done"            "$CAP_FILE"
  grep -q "driver=devflow"             "$CAP_FILE"
  grep -q "NOT EXISTS"                 "$CAP_FILE"
  grep -q "auto: update-status done"   "$CAP_FILE"
}

@test "T001444: update-status in_progress→implement/entered, in_review→implement/done, qa_review→verify/entered" {
  for pair in "in_progress implement entered" "in_review implement done" "qa_review verify entered"; do
    set -- $pair
    CAP_FILE="$(mktemp)"; export CAP_FILE
    _pt_capture_stub
    run bash scripts/ticket.sh update-status --id T000001 --status "$1"
    [ "$status" -eq 0 ]
    grep -q "auto_phase=$2"  "$CAP_FILE"
    grep -q "auto_state=$3"  "$CAP_FILE"
  done
}

@test "T001444: update-status defaults driver to devflow, factory via env" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_PHASE_DRIVER=factory bash scripts/ticket.sh update-status --id T000001 --status in_progress
  [ "$status" -eq 0 ]
  grep -q "driver=factory" "$CAP_FILE"
}

@test "T001444: update-status honors TICKET_OFFLINE (no emission)" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_OFFLINE=1 bash scripts/ticket.sh update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  [[ "$output" =~ "OFFLINE" ]]
  [ ! -s "$CAP_FILE" ]
}
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: update-status"`
Expected: FAIL (die Capture-Datei enthält weder `auto_phase=` noch `NOT EXISTS`, weil die Emission fehlt).

- [ ] **Step 3: Implement — Mapping + Dedup-INSERT.** Ersetze den Body von `main()` in `scripts/vda/ticket/update-status.sh` (ab der Pflichtprüfung) durch:

```bash
  if [[ -z "$id" || -z "$status" ]]; then
    echo "ERROR: --id and --status are required." >&2
    exit 2
  fi

  # Status → auto-emitted phase event (T001444). Leere auto_phase = keine Emission.
  local auto_phase="" auto_state=""
  case "$status" in
    in_progress) auto_phase="implement"; auto_state="entered" ;;
    in_review)   auto_phase="implement"; auto_state="done" ;;
    qa_review)   auto_phase="verify";    auto_state="entered" ;;
    done)        auto_phase="deploy";    auto_state="done" ;;
    blocked)     auto_phase="__last__";  auto_state="blocked" ;;
  esac
  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac

  local pod
  pod=$(_pgpod)

  # UPDATE (autocommit) läuft VOR dem Event-INSERT — Telemetrie kann den
  # Statuswechsel nicht zurückrollen. blocked löst die letzte Phase per Lookup auf
  # (Fallback implement). Dedup: kein Insert bei vorhandenem (ticket,phase,state).
  _exec_sql "$pod" \
    -v ext_id="$id" \
    -v status="$status" \
    -v res="$resolution" \
    -v notes="$notes" \
    -v auto_phase="$auto_phase" \
    -v auto_state="$auto_state" \
    -v driver="$driver" \
    -v detail="auto: update-status $status" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  status = :'status',
  resolution = NULLIF(:'res', ''),
  done_at = CASE WHEN :'status' = 'done' THEN now() ELSE done_at END,
  -- Release the pipeline slot on a terminal transition so the ledger never leaks (T000525).
  pipeline_slot = CASE WHEN :'status' IN ('done','archived') THEN NULL ELSE pipeline_slot END,
  notes = CASE WHEN :'notes' <> '' THEN COALESCE(notes || E'\n\n', '') || :'notes' ELSE notes END
WHERE external_id = :'ext_id';

INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, r.phase, :'auto_state', :'detail', :'driver'
FROM tickets.tickets t
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN :'auto_phase' = '__last__'
      THEN COALESCE(
        (SELECT e.phase FROM tickets.factory_phase_events e
          WHERE e.ticket_id = t.id ORDER BY e.at DESC LIMIT 1),
        'implement')
    ELSE :'auto_phase'
  END AS phase
) r
WHERE t.external_id = :'ext_id'
  AND :'auto_phase' <> ''
  AND NOT EXISTS (
    SELECT 1 FROM tickets.factory_phase_events e2
     WHERE e2.ticket_id = t.id AND e2.phase = r.phase AND e2.state = :'auto_state'
  );
EOF

  echo "Ticket $id status updated to $status"
```

- [ ] **Step 4: Run GREEN, verify it passes.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: update-status"`
Expected: PASS (alle vier update-status-Tests grün).

- [ ] **Step 5: Commit.**

```bash
git add scripts/vda/ticket/update-status.sh tests/spec/software-factory.bats
git commit -m "feat(factory): auto-emit phase events from update-status transitions [T001444]"
```

---

## Task 2: Auto-Emission in `stage-plan.sh`

**Files:**
- Modify: `scripts/vda/ticket/stage-plan.sh`
- Test: `tests/spec/software-factory.bats`

**Interfaces:**
- Consumes: `_pgpod`, `_exec_sql`; `$TICKET_PHASE_DRIVER` env.
- Produces: Ein `stage-plan`-Aufruf emittiert zusätzlich `scout done`, `design done`, `plan done` (`detail='auto: stage-plan'`), idempotent per `NOT EXISTS`.

- [ ] **Step 1: Failing-Test-Step (RED).** Ergänze im T001444-Block in `tests/spec/software-factory.bats`:

```bash
@test "T001444: stage-plan auto-emits scout/design/plan done" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x --plan openspec/changes/x/tasks.md
  [ "$status" -eq 0 ]
  grep -qF "VALUES ('scout'),('design'),('plan')" "$CAP_FILE"
  grep -q  "auto: stage-plan"                     "$CAP_FILE"
  grep -q  "NOT EXISTS"                           "$CAP_FILE"
}
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: stage-plan"`
Expected: FAIL (kein `VALUES ('scout')...` in der Capture-Datei).

- [ ] **Step 3: Implement.** Füge in `scripts/vda/ticket/stage-plan.sh` unmittelbar vor der Abschlusszeile `echo "Ticket $id staged in Kommissionierung (status=plan_staged)"` ein:

```bash
  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac
  _exec_sql "$pod" -v ext_id="$id" -v driver="$driver" -v detail="auto: stage-plan" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, p.phase, 'done', :'detail', :'driver'
FROM tickets.tickets t
CROSS JOIN (VALUES ('scout'),('design'),('plan')) AS p(phase)
WHERE t.external_id = :'ext_id'
  AND NOT EXISTS (
    SELECT 1 FROM tickets.factory_phase_events e
     WHERE e.ticket_id = t.id AND e.phase = p.phase AND e.state = 'done'
  );
EOF
```

- [ ] **Step 4: Run GREEN, verify it passes.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: stage-plan"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/vda/ticket/stage-plan.sh tests/spec/software-factory.bats
git commit -m "feat(factory): auto-emit scout/design/plan done on stage-plan [T001444]"
```

---

## Task 3: `pipeline.js` exportiert `TICKET_PHASE_DRIVER=factory`

**Files:**
- Modify: `scripts/factory/pipeline.js`
- Test: `tests/spec/software-factory.bats`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `process.env.TICKET_PHASE_DRIVER === 'factory'` für alle vom Pipeline-Prozess aus geshellten `ticket.sh`-Aufrufe (Sicherheitsnetz für die Driver-Attribution, falls Dedup nicht greift).

- [ ] **Step 1: Failing-Test-Step (RED).** Ergänze im T001444-Block:

```bash
@test "T001444: pipeline.js exports TICKET_PHASE_DRIVER=factory" {
  run grep -Eq "TICKET_PHASE_DRIVER['\"]?[[:space:]]*=[[:space:]]*['\"]factory['\"]" "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: pipeline.js exports"`
Expected: FAIL (`TICKET_PHASE_DRIVER` fehlt in `pipeline.js`).

- [ ] **Step 3: Implement.** Füge in `scripts/factory/pipeline.js` direkt nach dem `require`-Block am Modulkopf (nach der `const path = require('path')`-Gruppe) ein:

```javascript
// Attribute all phase events emitted by shelled-out ticket.sh calls to the factory
// driver. The auto-emission dedup makes double-emission harmless; this is the
// safety net for driver attribution when dedup does not apply (T001444).
process.env.TICKET_PHASE_DRIVER = process.env.TICKET_PHASE_DRIVER || 'factory'
```

- [ ] **Step 4: Run GREEN + Offline-Syntaxcheck.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: pipeline.js exports" && node --check scripts/factory/pipeline.js`
Expected: PASS und keine Syntaxfehler.

- [ ] **Step 5: Commit.**

```bash
git add scripts/factory/pipeline.js tests/spec/software-factory.bats
git commit -m "feat(factory): pipeline.js pins TICKET_PHASE_DRIVER=factory [T001444]"
```

---

## Task 4: Gate-Modul `assert-phase-chain.sh` + Dispatcher

**Files:**
- Create: `scripts/vda/ticket/assert-phase-chain.sh`
- Modify: `scripts/ticket.sh` (Dispatcher-Zeilen; `s1.ignore`)
- Test: `tests/spec/software-factory.bats`

**Interfaces:**
- Consumes: `_pgpod`, `_exec_sql`.
- Produces: `ticket.sh assert-phase-chain --id <ext_id> [--json]` — Exit 0 wenn `plan:done` + `implement:entered` + `verify:done` vorhanden, sonst Exit 1 mit Backfill-Kommandos; `--json` ⇒ `{"ok":<bool>,"missing":[…]}`; fehlendes `--id` ⇒ Exit 2 vor `_pgpod`.

- [ ] **Step 1: Failing-Test-Step (RED).** Ergänze im T001444-Block einen Row-Stub (liefert kontrollierte Query-Zeilen) und die Gate-Tests:

```bash
_pt_rows_stub() {   # $1 = phase:state-Zeilen, die der exec-Call zurückgibt
  local rows="$1" dir; dir="$(mktemp -d)"
  cat > "$dir/kubectl" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in get) echo "pod/shared-db-0"; exit 0;; esac; done
printf '%s' "$rows"
exit 0
STUB
  chmod +x "$dir/kubectl"
  PATH="$dir:$PATH"
}

@test "T001444: assert-phase-chain requires --id before cluster" {
  run bash scripts/ticket.sh assert-phase-chain
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id is required" ]]
}

@test "T001444: assert-phase-chain passes on complete chain" {
  _pt_rows_stub $'plan:done\nimplement:entered\nverify:done\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001
  [ "$status" -eq 0 ]
}

@test "T001444: assert-phase-chain fails with backfill hint on gap" {
  _pt_rows_stub $'plan:done\nimplement:entered\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001
  [ "$status" -eq 1 ]
  [[ "$output" =~ "phase T000001 verify done" ]]
}

@test "T001444: assert-phase-chain --json emits ok/missing shape" {
  _pt_rows_stub $'plan:done\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001 --json
  [ "$status" -eq 1 ]
  [[ "$output" == *'{"ok":false,"missing":["implement:entered","verify:done"]}'* ]]
}

@test "T001444: assert-phase-chain listed in dispatch usage" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "assert-phase-chain" ]]
}
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: assert-phase-chain"`
Expected: FAIL (`Unknown command: assert-phase-chain`).

- [ ] **Step 3a: Create the gate module.** Schreibe `scripts/vda/ticket/assert-phase-chain.sh`:

```bash
# scripts/vda/ticket/assert-phase-chain.sh — fail-closed phase-chain gate (T001444).
# Sourced by ticket.sh. Verifies plan:done, implement:entered, verify:done exist
# for a ticket (any driver). Exit 0 = complete, 1 = gap, 2 = bad args.
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" json=false
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)   id="$2"; shift 2 ;;
      --json) json=true; shift ;;
      *)      echo "Unknown assert-phase-chain option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-48).
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi

  local pod; pod=$(_pgpod)
  local present
  present=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT DISTINCT e.phase || ':' || e.state
FROM tickets.factory_phase_events e
JOIN tickets.tickets t ON t.id = e.ticket_id
WHERE t.external_id = :'ext_id'
  AND (e.phase, e.state) IN (('plan','done'),('implement','entered'),('verify','done'));
EOF
)
  local required=(plan:done implement:entered verify:done)
  local missing=() r
  for r in "${required[@]}"; do
    grep -qxF "$r" <<<"$present" || missing+=("$r")
  done

  if [[ "$json" == true ]]; then
    local ok="true" arr="" first=1 m
    [[ ${#missing[@]} -gt 0 ]] && ok="false"
    for m in "${missing[@]:-}"; do
      [[ -z "$m" ]] && continue
      [[ $first -eq 1 ]] || arr+=","
      arr+="\"$m\""; first=0
    done
    echo "{\"ok\":$ok,\"missing\":[$arr]}"
    [[ ${#missing[@]} -eq 0 ]]; exit $?
  fi

  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "OK: phase chain complete for $id (plan:done, implement:entered, verify:done)"
    exit 0
  fi

  echo "FAIL: phase chain incomplete for $id — missing: ${missing[*]}" >&2
  echo "Backfill with:" >&2
  for m in "${missing[@]}"; do
    echo "  ./scripts/ticket.sh phase $id ${m%%:*} ${m##*:} --driver devflow --detail \"backfill: assert-phase-chain\"" >&2
  done
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

- [ ] **Step 3b: Wire the dispatcher.** Füge in `scripts/ticket.sh` neben den anderen `cmd_*`-Funktionen (z. B. direkt nach `cmd_stage_plan()`) ein:

```bash
cmd_assert_phase_chain() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/assert-phase-chain.sh"
  main "$@"
}
```

Ergänze im `case "$cmd"`-Block (neben `phase)`):

```bash
  assert-phase-chain) cmd_assert_phase_chain "$@" ;;
```

Und hänge `assert-phase-chain` an die Usage-Kommandoliste im `if [[ $# -lt 1 ]]`-Zweig an (nach `phase,`).

- [ ] **Step 4: Run GREEN, verify it passes.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: assert-phase-chain"`
Expected: PASS (alle fünf Gate-Tests grün).

- [ ] **Step 5: Commit.**

```bash
git add scripts/vda/ticket/assert-phase-chain.sh scripts/ticket.sh tests/spec/software-factory.bats
git commit -m "feat(factory): fail-closed assert-phase-chain gate [T001444]"
```

---

## Task 5: dev-flow-execute Skill — Pflicht-Gate + verify Pflicht

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`
- Test: `tests/spec/software-factory.bats`

**Interfaces:**
- Consumes: `ticket.sh assert-phase-chain` (Task 4).
- Produces: Doku-Kontrakt — Gate-Aufruf vor `gh pr merge` ohne `|| true`; verify-Emission als Pflicht.

- [ ] **Step 1: Failing-Test-Step (RED).** Ergänze im T001444-Block (`$SKILL` ist in dieser Datei bereits definiert):

```bash
@test "T001444: SKILL gates merge on assert-phase-chain without || true" {
  run grep -q "assert-phase-chain" "$SKILL"
  [ "$status" -eq 0 ]
  # keine || true Suppression auf der Gate-Zeile
  run bash -c "grep 'assert-phase-chain' '$SKILL' | grep -q '|| true'"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: SKILL gates"`
Expected: FAIL (`assert-phase-chain` steht noch nicht im Skill).

- [ ] **Step 3: Implement.** In `.claude/skills/dev-flow-execute/SKILL.md`, in „Schritt 6: Auto-Merge wenn CI grün", direkt VOR dem `(cd "$MAIN_REPO" && gh pr merge …)`-Codeblock einfügen:

```markdown
**Fail-closed Phase-Chain-Gate (T001444) — PFLICHT vor dem Merge, KEIN `|| true`:**
Prüft, dass `plan:done`, `implement:entered` und `verify:done` vorliegen. Bei FAIL
zuerst backfillen (insb. `verify done` nach grünem `task test:changed`), dann mergen.

​```bash
./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
​```
```

Ändere zusätzlich die verify-Telemetrie in „Schritt 3: Lokale Verifikation" und „Schritt 6.5: Ticket abschließen": ersetze die einleitende Formulierung `Phasen-Telemetrie (best-effort)` / `best-effort und darf den Flow nie stoppen` für die `verify entered`/`verify done`-Events durch `Phasen-Telemetrie (PFLICHT für verify — das Gate erzwingt sie)`. Ergänze am Ende der Telemetrie-Blöcke von Schritt 1.5/2/6.5 den Hinweissatz: „`plan`/`implement`/`deploy`-Events entstehen jetzt automatisch aus den Statuswechseln (`update-status`/`stage-plan`); Doppel-Emission ist dank Dedup harmlos." Die `|| true`-Fallback-Zeilen für `verify` bleiben als Fallback erhalten, aber der Fließtext benennt verify als Pflicht.

- [ ] **Step 4: Run GREEN, verify it passes.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T001444: SKILL gates"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md tests/spec/software-factory.bats
git commit -m "docs(dev-flow): gate merge on assert-phase-chain, verify mandatory [T001444]"
```

---

## Task 6: Versand-Lane — SSOT-Label + Untertitel

**Files:**
- Modify: `website/src/lib/tickets/pipeline-order.ts`
- Modify: `website/src/components/factory/ShippedColumn.svelte`
- Test: `website/src/lib/tickets/pipeline-order.test.ts`

**Interfaces:**
- Consumes: `PIPELINE_LANES` (readonly Liste `{ key, label, statuses, side }`) aus `pipeline-order.ts`.
- Produces: `shipped`-Lane-`label === 'Versand'`; `ShippedColumn.svelte` rendert dieses Label aus der SSOT plus den Untertitel „Gemergt nach main · Prod-Deploy entkoppelt".

- [ ] **Step 1: Failing-Test-Step (RED).** Erweitere `website/src/lib/tickets/pipeline-order.test.ts` um die Import-Zeile `PIPELINE_LANES` (falls nicht vorhanden) und einen Test:

```typescript
it('labels the shipped lane Versand (SSOT)', () => {
  const shipped = PIPELINE_LANES.find((l) => l.key === 'shipped');
  expect(shipped?.label).toBe('Versand');
});
```

- [ ] **Step 2: Run RED, verify it fails.**

Run: `npx --prefix website vitest run src/lib/tickets/pipeline-order.test.ts -t "Versand"`
Expected: FAIL (Label ist noch `'Fertig'`).

- [ ] **Step 3a: Change the SSOT label.** In `website/src/lib/tickets/pipeline-order.ts`, in `PIPELINE_LANES`, die `shipped`-Zeile:

```typescript
  { key: 'shipped',        label: 'Versand',         statuses: ['done'],                    side: false },
```

- [ ] **Step 3b: Consume the label in the component.** In `website/src/components/factory/ShippedColumn.svelte` im `<script lang="ts">`-Block (vor dem `$props()`-Aufruf) ergänzen:

```svelte
  import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
  const shippedLabel = PIPELINE_LANES.find((l) => l.key === 'shipped')?.label ?? 'Versand';
```

Ersetze im Markup `<h3 class="font-semibold mb-2">Versand</h3>` durch:

```svelte
  <h3 class="font-semibold mb-1">{shippedLabel}</h3>
  <p class="text-muted text-[11px] mb-2">Gemergt nach main · Prod-Deploy entkoppelt</p>
```

- [ ] **Step 4: Run GREEN + Typecheck.**

Run: `npx --prefix website vitest run src/lib/tickets/pipeline-order.test.ts && npx --prefix website tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 5: Commit.**

```bash
git add website/src/lib/tickets/pipeline-order.ts website/src/components/factory/ShippedColumn.svelte website/src/lib/tickets/pipeline-order.test.ts
git commit -m "feat(factory-floor): Versand lane SSOT label + decoupled-deploy subtitle [T001444]"
```

---

## Task 7: Finale Verifikation

**Files:** keine Code-Änderung — nur Gates ausführen und generierte Artefakte committen.

- [ ] **Step 1: Test-Inventar regenerieren.** Da neue `@test`-Blöcke hinzugefügt wurden:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **Step 2: OpenSpec validieren (muss grün sein).**

```bash
task test:openspec
# Fallback ohne OpenSpec-CLI:
bash scripts/openspec.sh validate
```
Expected: `devflow-phase-telemetry` validiert ohne Fehler.

- [ ] **Step 3: Gezielte Tests + Freshness-Ratchet (die drei Pflicht-Gates).**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: alle grün; `freshness:check` meldet keine neuen/verschlechterten S1–S4-Violations (die berührten `ticket.sh`/`pipeline.js` stehen in `s1.ignore`).

- [ ] **Step 4: Inventar-/Artefakt-Commit (falls `freshness:regenerate` etwas geändert hat).**

```bash
git add -A
git commit -m "chore(factory): regenerate freshness artifacts + test inventory [T001444]"
```
