---
title: "G-CD02: post-merge.yml Race-Guard härten (93% → ≥95%)"
ticket_id: T001203
domains: [cd, ci, workflow]
status: plan_staged
file_locks: [.github/workflows/post-merge.yml, tests/spec/ci-cd.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: g-cd02-post-merge-race-guard (T001203)

- [ ] Task 0: Failing-Test schreiben — `tests/spec/ci-cd.bats` (RED: noch keine concurrency/retry)
- [ ] Task 1: Concurrency-Group in `.github/workflows/post-merge.yml` (serialisiert Runs, `cancel-in-progress: false`)
- [ ] Task 2: Retry-mit-Exponential-Backoff um beide `scripts/ticket.sh update-status`-Aufrufe
- [ ] Task 3: Verifikation — `task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task workspace:validate` + `bash scripts/openspec.sh validate`

---

# G-CD02 — post-merge.yml Race-Guard: Concurrency + Retry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Die G-CD02-Erfolgsquote von 93 % auf ≥ 95 % heben, indem `post-merge.yml`-Runs
**serialisiert** werden (eine GitHub-Actions `concurrency`-Group) und die Ticket-Status-Updates
gegen transiente kubectl-/API-Timeouts mit **Exponential-Backoff-Retry** abgesichert werden.

**Architecture:** Zwei orthogonale Härtungen am selben Workflow-File plus ein cluster-freier
BATS-Guard. (1) Ein top-level `concurrency:`-Block verhindert, dass zwei Post-Merge-Runs gleichzeitig
`task workspace:deploy` gegen den Fleet-Cluster fahren (Wurzel der Race-Condition: konkurrierende
`kubectl apply --server-side` am selben Namespace). `cancel-in-progress: false` queued neue Runs,
statt einen laufenden Deploy mittendrin abzuschießen. (2) Eine kleine inline-`retry()`-bash-Funktion
wrappt die zwei `scripts/ticket.sh update-status`-Aufrufe; sie bleibt non-fatal (return 0 nach
Erschöpfung), schluckt aber einen einzelnen transienten Fehlschlag. (3) `tests/spec/ci-cd.bats`
verankert beides statisch, damit der Guard nicht versehentlich wieder verschwindet.

## File Structure

**Geänderte/neue Dateien:**

- `tests/spec/ci-cd.bats` (NEU, ~40 Zeilen) — cluster-freier Drift-Guard (BATS, reines `grep`).
- `.github/workflows/post-merge.yml` (MODIFY, +~15 Zeilen) — `concurrency:`-Block + `retry()`-Funktion in beiden Status-Steps.
- `openspec/changes/g-cd02-post-merge-race-guard/specs/ci-cd.md` (NEU, Spec-Delta) — ergänzt das Concurrency-/Retry-Szenario.
- `website/src/data/test-inventory.json` — wird ggf. von `task freshness:regenerate` aktualisiert (automatisch, falls das Inventory `tests/spec/` erfasst).

**Unverändert (nur lesend in diesem Change):**

- `scripts/ticket.sh` — Status-Update-CLI, unverändert; wird lediglich durch `retry` aufgerufen.
- `scripts/changed-manifests.sh`, `scripts/factory/scout-drift.sh` — Logik unverändert.
- `openspec/specs/ci-cd.md` — SSOT-Spec, Quelle der BATS-Konvention (`tests/spec/ci-cd.bats`).

**S1-Budget-Notiz:** Die einzige modifizierte Quell-Datei ist `.github/workflows/post-merge.yml` —
Extension `.yml` ist im S1-Linter **ungated** (kein statisches Zeilen-Limit), daher kein Budget-Eintrag
und keine S1-Tabelle nötig. Es werden **keine neuen Shell-Skripte** angelegt (die `retry()`-Funktion
lebt inline im Workflow). `tests/spec/ci-cd.bats` (`.bats`) ist ebenfalls ungated.

## Task 0 — Failing-Test schreiben (RED)

Neue Datei `tests/spec/ci-cd.bats` (BATS-Konvention: ein Spec-File pro OpenSpec-SSOT-Spec
`openspec/specs/ci-cd.md`). Drei Checks, alle rein statisch gegen die Workflow-Datei (kein Cluster nötig):

```bash
#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# G-CD02: post-merge.yml muss konkurrierende Runs serialisieren (concurrency)
# und transiente Ticket-Status-Updates mit Backoff wiederholen (retry).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/post-merge.yml"
}

@test "G-CD02: post-merge.yml deklariert eine top-level concurrency-Group" {
  grep -qE '^concurrency:' "$WF"
}

@test "G-CD02: concurrency bricht laufende Deploys NICHT ab" {
  grep -qE 'cancel-in-progress:[[:space:]]*false' "$WF"
}

@test "G-CD02: beide Ticket-Status-Updates laufen durch retry()" {
  run grep -cE 'retry[[:space:]]+bash[[:space:]]+scripts/ticket.sh[[:space:]]+update-status' "$WF"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}
```

**Failing-Test-Schritt (RED, reproduzierbar):**

```bash
cd /tmp/wt-post-merge-race-guard
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
```

**Expected: FAIL** — vor Task 1+2 hat `post-merge.yml` keine `concurrency:`-Zeile, kein
`cancel-in-progress: false` und keinen `retry`-Wrapper. Erwartete Ausgabe:

```
not ok 1 G-CD02: post-merge.yml deklariert eine top-level concurrency-Group
not ok 2 G-CD02: concurrency bricht laufende Deploys NICHT ab
not ok 3 G-CD02: beide Ticket-Status-Updates laufen durch retry()
```

Dies ist die **expected: fail**-Phase. Nach Task 1+2 sind alle drei grün (RED → GREEN).

**Akzeptanz:** Der BATS-Lauf zeigt `not ok 1..3` (alle drei rot) gegen den unveränderten Workflow.

## Task 1 — Concurrency-Group in post-merge.yml

In `.github/workflows/post-merge.yml` unmittelbar nach dem `on:`-Block (vor `permissions:`)
einen top-level `concurrency:`-Block einfügen:

```yaml
on:
  push:
    branches: [main]

concurrency:
  # Serialisiert alle Post-Merge-Runs auf main: ein Deploy läuft zu Ende,
  # bevor der nächste startet. Verhindert konkurrierende kubectl-apply-Races.
  group: post-merge-${{ github.ref }}
  cancel-in-progress: false
```

**Design-Begründung:**
- Statischer Group-Key (`github.ref` ist auf `main` immer `refs/heads/main`) → **eine** globale Queue
  für alle Post-Merge-Runs. Genau das serialisiert die Deploys.
- `cancel-in-progress: false` ist **bewusst** (nicht `true`): ein laufender `task workspace:deploy`
  darf nie mid-apply abgebrochen werden — das hinterließe einen halb-deployten Cluster-Stand. Neue
  Runs warten in der Queue, bis der laufende fertig ist.

**Akzeptanz:** `grep -E '^concurrency:' .github/workflows/post-merge.yml` trifft;
`grep -E 'cancel-in-progress:[[:space:]]*false'` trifft. BATS-Checks 1+2 aus Task 0 werden grün.

## Task 2 — Retry-mit-Exponential-Backoff für Status-Updates

Beide Status-Update-Steps (`mark-awaiting` in Job `mark-awaiting`, `Mark ticket done` in Job
`deploy-manifests`) bekommen vor dem `update-status`-Aufruf eine inline-`retry()`-Funktion und rufen
`scripts/ticket.sh update-status` durch sie auf. Die Funktion ersetzt das bisherige
`|| echo WARNING (non-fatal)`-Muster, behält aber die **non-fatale** Semantik bei:

```bash
          set -euo pipefail
          # retry <cmd...> — bis zu 5 Versuche, Exponential-Backoff 2/4/8/16 s.
          # Non-fatal: gibt nach Erschöpfung 0 zurück (wie das bisherige || echo WARNING).
          retry() {
            local max=5 delay=2 attempt=1
            until "$@"; do
              if (( attempt >= max )); then
                echo "WARNING: '$*' failed after ${max} attempts (non-fatal)."
                return 0
              fi
              echo "attempt ${attempt}/${max} failed; retry in ${delay}s"
              sleep "${delay}"
              delay=$(( delay * 2 ))
              attempt=$(( attempt + 1 ))
            done
          }
          # ... TICKET_ID-Ermittlung + kubeconfig-Setup wie bisher ...
          retry bash scripts/ticket.sh update-status --id "$TICKET_ID" --status awaiting_deploy
```

Analog im `Mark ticket done`-Step:

```bash
          retry bash scripts/ticket.sh update-status --id "$TICKET_ID" --status done
```

**Design-Begründung:**
- Backoff 2→4→8→16 s deckt typische transiente kube-apiserver-/Netz-Hänger ab, ohne den Job
  nennenswert zu verlängern (Worst Case ~30 s zusätzlich, nur im Fehlerfall).
- `return 0` nach Erschöpfung erhält die bestehende non-fatale Zusicherung — ein dauerhaft kaputtes
  Status-Update blockiert den Deploy nicht (Merge = Abschluss ist die Status-Quelle der Wahrheit).
- `set -euo pipefail` bleibt erhalten; `retry` schluckt nur den gewrappten Befehl, nicht das Setup.

**Akzeptanz:** `grep -cE 'retry[[:space:]]+bash[[:space:]]+scripts/ticket.sh[[:space:]]+update-status'
.github/workflows/post-merge.yml` ≥ 2. BATS-Check 3 aus Task 0 wird grün.

## Task 3 — Verifikation (CI-äquivalent)

```bash
cd /tmp/wt-post-merge-race-guard

# 1. BATS-Guard ist jetzt grün (RED → GREEN)
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# Erwartung: ok 1..3

# 2. Geänderte Tests (inkl. ci-cd.bats) + Test-Inventory-Gate
task test:changed

# 3. Freshness-Gate (test-inventory, route-manifest, generierte Artefakte)
task freshness:regenerate
task freshness:check

# 4. Kustomize-Manifest-Validierung (Sanity, obwohl keine Manifeste geändert)
task workspace:validate

# 5. OpenSpec-Validate
bash scripts/openspec.sh validate
```

**Akzeptanz:** Alle Schritte grün. `tests/spec/ci-cd.bats` zeigt `ok 1..3`. Falls eine Warnung/Fehler
auftaucht: fixen und erneut laufen lassen.

## Risk & Concurrency-Semantik

- **Low-risk:** Nur `post-merge.yml` (Workflow) + additiver cluster-freier BATS-Guard. Kein Manifest-,
  Secret- oder Anwendungscode-Change.
- **Bei `cancel-in-progress: false`** hält GitHub pro Group genau **einen** pending Run. Bei einer Welle
  von ≥ 3 schnellen Merges überschreibt der neueste *pending* Run den vorherigen *pending* (dieser wird
  als pending verworfen), während der *laufende* unangetastet zu Ende läuft. Konsequenz: der **letzte**
  Merge der Welle deployt garantiert; ein zwischenliegender Deploy kann übersprungen werden. Das ist
  unkritisch, weil `task workspace:deploy` idempotent ist (server-side apply appliziert den finalen
  Stand) und weil **Merge = Abschluss** (CLAUDE.md / T001092) das Ticket bereits beim Merge schließt —
  der post-merge-`done`-Übergang ist redundante Absicherung.
- **Rollback:** Revert des einen Workflow-Commits stellt das alte Verhalten her. Der BATS-Guard würde
  dann rot und macht den Revert sichtbar (gewünscht).

## Verwandte Specs

- `openspec/specs/ci-cd.md` — Requirement "Post-Merge Ticket-Lifecycle und Manifest-Deploy"; das
  Spec-Delta unter `openspec/changes/g-cd02-post-merge-race-guard/specs/ci-cd.md` ergänzt das
  Concurrency-/Retry-Szenario.
- `openspec/changes/dora-delivery-pipeline` — G-CD02 als Goal; Erfolgsquote auf `/admin/dora` sichtbar.
