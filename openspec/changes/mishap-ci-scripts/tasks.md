---
title: mishap-ci-scripts — Freshness-Regeneration nach Auto-Rebase/Archiv + agent-lock-Durchsetzung im Ticket-Schreibpfad
ticket_id: T002282
domains: [ci-cd, scripts, ticket-system]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-ci-scripts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die drei verifizierten Einträge des Mishap-Bundles T002282 schließen: (1) `scripts/devflow-ci-watch.sh` regeneriert nach seinem Auto-Rebase keine Freshness-Artefakte und pusht einen strukturell stale Stand; (2) Schritt 4 von `.claude/skills/references/plan-archive-steps.md` staged die von `openspec.sh archive` neu geschriebene `website/src/data/openspec-status.json` nicht mit; (3) der Ticket-Schreibpfad (`scripts/vda/ticket/update-status.sh`) prüft nie einen `agent-lock.sh`-Claim, sodass jede Session den Status eines fremd gelockten Tickets überschreiben kann.

**Architecture:** Drei disjunkte, kleine Eingriffe an drei getrennten Stellen — keine gemeinsamen Module, keine Reihenfolgeabhängigkeit zwischen den Fixes. (1) Im DIRTY-Zweig von `devflow-ci-watch.sh` (Zeilen 22-35) wird zwischen `git rebase origin/main` und `git push --force-with-lease` ein `task freshness:regenerate` eingezogen; erzeugt es einen Diff, entsteht ein zusätzlicher Commit (kein `--amend`, damit der gerade rebasete Commit nicht erneut mutiert). (2) Der Copy-Paste-Bash-Block in `plan-archive-steps.md` Schritt 4 bekommt denselben Regenerationsaufruf vor `git add` und stagt zusätzlich `website/src/data/openspec-status.json` — dieselbe Datei, die `cmd_archive` (`scripts/openspec.sh:154-156`) nach dem `mv "$dir" "$dest"` bereits neu schreibt. (3) `scripts/vda/ticket/_ticket-core.sh` bekommt einen neuen Helper `_ticket_lock_guard`, der `bash scripts/agent-lock.sh check ticket <id>` aufruft; `update-status.sh` ruft ihn VOR `_pgpod`/`_exec_sql` auf und bricht bei Exit 3 (`held`) mit klarer Meldung ab.

**Tech Stack:** Bash (`scripts/devflow-ci-watch.sh`, `scripts/vda/ticket/*.sh`, `scripts/agent-lock.sh`), Markdown (`.claude/skills/references/plan-archive-steps.md`), BATS (`tests/spec/*.bats`), go-task (`task freshness:regenerate`).

## File Structure

- `scripts/devflow-ci-watch.sh` — modified: DIRTY-Rebase-Zweig regeneriert Freshness-Artefakte und committet sie bei Diff, bevor `git push --force-with-lease` läuft.
- `.claude/skills/references/plan-archive-steps.md` — modified: Schritt-4-Bash-Block ruft `task freshness:regenerate` vor `git add` und staged `website/src/data/openspec-status.json` mit.
- `scripts/vda/ticket/_ticket-core.sh` — modified: neuer Helper `_ticket_lock_guard`, der `agent-lock.sh check ticket` auswertet (Exit 3 = `held` → Ablehnung).
- `scripts/vda/ticket/update-status.sh` — modified: ruft `_ticket_lock_guard "$id"` vor `_pgpod` auf.
- `tests/spec/ci-cd.bats` — modified (bereits vorhanden, RED): `T002282-M1: devflow-ci-watch regeneriert Freshness vor dem Push nach Auto-Rebase`.
- `tests/spec/openspec-workflow.bats` — modified (bereits vorhanden, RED): die beiden `T002282-M2`-Konventions-Tests auf `plan-archive-steps.md`.
- `tests/spec/ticket-system.bats` — modified (bereits vorhanden, RED): `T002282-M3: update-status verweigert den Write bei fremdem agent-lock-Claim`.

## Global Constraints

- Reine Verhaltenskorrekturen an bestehenden Skripten — keine neuen Dateien, keine neuen Taskfile-Targets, keine Manifest-Änderungen.
- Kein Brand-Domain-Literal in Code oder Snippets (S3-Gate); alle Beispiele bleiben brandneutral.
- `scripts/devflow-ci-watch.sh` (`.sh`, S1-Limit 500, nicht baselined): Ist 123 Zeilen → effektives Budget **377**. Der Eingriff fügt ~12 Zeilen hinzu.
- `scripts/vda/ticket/_ticket-core.sh` (`.sh`, S1-Limit 500, nicht baselined): Ist 96 Zeilen → effektives Budget **404**. Der Helper fügt ~25 Zeilen hinzu.
- `scripts/vda/ticket/update-status.sh` (`.sh`, S1-Limit 500, nicht baselined): Ist 98 Zeilen → effektives Budget **402**. Der Guard-Aufruf fügt ~2 Zeilen hinzu.
- `.claude/skills/references/plan-archive-steps.md` und die drei `tests/spec/*.bats`-Dateien liegen außerhalb der S1-Extension-Tabelle (`.ts .js .jsx .py .svelte .sh .mjs .mts .astro .tsx .java .php .bash .cjs`) — für sie gilt kein Zeilenbudget.
- `task freshness:regenerate` ist idempotent (zwei Läufe aus identischem Baum erzeugen null geänderte Dateien, siehe Taskfile-Kommentar zu `freshness:check` Phase 0) — der neue Aufruf im Rebase-Zweig darf deshalb bedingungslos laufen.
- Der Lock-Guard gilt ausschließlich für `update-status`. Andere Mutationen (`set-touched-files`, `phase`, …) bleiben unangetastet; eine Ausweitung wäre ein eigenes Ticket.
- `TICKET_OFFLINE=1` überspringt den Guard implizit mit (der Offline-Zweig kehrt in `scripts/ticket.sh:65` zurück, bevor `update-status.sh` überhaupt geladen wird); `TICKET_LOCK_OVERRIDE=1` ist der explizite Escape-Hatch für Automationspfade, die bereits vor dem Dispatch per `agent-lock.sh check` gated sind.
<!-- vitest: kein neuer Test nötig, weil keine Datei unter website/src/lib/** oder website/src/pages/api/** berührt wird -->

---

### Task 1: RED bestätigen — devflow-ci-watch regeneriert Freshness nicht vor dem Push

**Files:**
- Test: `tests/spec/ci-cd.bats` (Test `T002282-M1: devflow-ci-watch regeneriert Freshness vor dem Push nach Auto-Rebase`, bereits committet)

**Interfaces:**
- Konsumiert: `scripts/devflow-ci-watch.sh` (wird mit hermetisch gemockten `gh`, `git` und `task` auf PATH ausgeführt).
- Produziert: nichts — reiner Rot-Checkpoint vor der Implementierung.

- [ ] **Step 1: Failing Test ausführen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002282-M1"
```

Expected: FAIL — `not ok 1 T002282-M1: devflow-ci-watch regeneriert Freshness vor dem Push nach Auto-Rebase` mit der Ausgabe `kein 'task freshness:regenerate' im Mock-Log:` und einem Call-Log, in dem `git rebase origin/main` direkt von `git push --force-with-lease` gefolgt wird.

### Task 2: GREEN — Freshness-Regeneration in den DIRTY-Rebase-Zweig einziehen

**Files:**
- Implementierung: `scripts/devflow-ci-watch.sh` (Zeilen 22-35, Block hinter `if git rebase origin/main; then`)

**Interfaces:**
- Konsumiert: `task freshness:regenerate` (go-task), `git status --porcelain`, `git add`, `git commit`, die bereits vorhandene Variable `TICKET_ID` (Positionsargument `$1`, Zeile 6).
- Produziert: optional einen zusätzlichen Commit auf dem Branch, bevor `git push --force-with-lease` läuft.

- [ ] **Step 1: Regeneration + optionalen Commit zwischen Rebase und Push einziehen**

Im `if git rebase origin/main; then`-Zweig, unmittelbar vor `if ! git push --force-with-lease; then`:

```bash
    # Der Rebase verschiebt HEAD auf eine neue Basis — jeder Artefakt-Snapshot
    # (test-inventory.json, openspec-status.json, repo-index.json, …) kann danach
    # gegenüber dieser Basis stale sein. `task freshness:check` regeneriert im CI
    # selbst und diff't gegen den Commit-Stand, schlägt also rot fehl, wenn hier
    # niemand regeneriert UND committet hat. Regeneration ist idempotent.
    echo "↻ Freshness-Artefakte nach Rebase regenerieren ..."
    task freshness:regenerate || echo "⚠ freshness:regenerate fehlgeschlagen — Push läuft ohne Regeneration weiter." >&2
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      git commit -m "chore(ci): regenerate freshness artifacts after auto-rebase [${TICKET_ID}]"
    fi
```

Kein `git commit --amend`: der gerade rebasete Commit darf nicht erneut mutiert werden, sonst weicht der lokale Stand ein zweites Mal von dem ab, gegen den `--force-with-lease` prüft.

- [ ] **Step 2: Test grün prüfen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002282"
```
Erwartung: grün. Zusätzlich müssen die bestehenden Nachbartests derselben Datei grün bleiben:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002186"
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002242-M1"
```

### Task 3: RED bestätigen — Archiv-Schritt staged die regenerierte Status-JSON nicht

**Files:**
- Test: `tests/spec/openspec-workflow.bats` (Tests `T002282-M2: plan-archive-steps.md Schritt 4 staged website/src/data/openspec-status.json` und `T002282-M2: plan-archive-steps.md regeneriert Freshness vor dem Archiv-Commit`, bereits committet)

**Interfaces:**
- Konsumiert: `.claude/skills/references/plan-archive-steps.md` (statischer Konventions-Check per `grep`; der Bash-Block IST die ausführbare Prozedur, es gibt kein separates Archiv-Commit-Skript).
- Produziert: nichts — reiner Rot-Checkpoint.

- [ ] **Step 1: Failing Tests ausführen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats -f "T002282-M2"
```

Expected: FAIL — beide Tests rot; der zweite meldet `kein 'task freshness:regenerate' in .../plan-archive-steps.md`.

### Task 4: GREEN — Schritt 4 regeneriert und staged die Freshness-Artefakte

**Files:**
- Implementierung: `.claude/skills/references/plan-archive-steps.md` (Bash-Block unter „4. Archivierung committen und via PR mergen")

**Interfaces:**
- Konsumiert: `task freshness:regenerate`; die Artefakt-Dateiliste aus `Taskfile.yml` → `freshness:check` Phase 1 (SSOT für „welche Dateien sind generiert", T002252-Konvention).
- Produziert: einen Archiv-Commit, der `website/src/data/openspec-status.json` mitträgt.

- [ ] **Step 1: `git add`-Block ersetzen**

Aus:
```bash
git add openspec/changes/ openspec/changes/archive/
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
```

wird:
```bash
# scripts/openspec.sh cmd_archive schreibt website/src/data/openspec-status.json
# NACH dem `mv "$dir" "$dest"` neu. Ohne die Regeneration + das explizite Staging
# bleibt die Datei unstaged, der Archiv-Commit trägt sie nie mit und CI meldet sie
# als stale. Regeneration ist idempotent; die Dateiliste folgt Taskfile
# `freshness:check` Phase 1 (T002252), damit keine zweite Quelle entsteht.
task freshness:regenerate
git add openspec/changes/ openspec/changes/archive/ website/src/data/openspec-status.json
git add -u -- website/src/data website/src/lib website/public/learning-assets docs
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
```

Das zweite `git add -u` staged ausschließlich **bereits getrackte** Dateien unter den Freshness-Ausgabepfaden — es kann keine unbeteiligten neuen Dateien aufnehmen.

- [ ] **Step 2: Tests grün prüfen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats -f "T002282-M2"
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats -f "T002243"
```
Erwartung: alle grün — der T002243-Test bewacht denselben Abschnitt und darf nicht mitkippen.

### Task 5: RED bestätigen — update-status ignoriert fremde agent-lock-Claims

**Files:**
- Test: `tests/spec/ticket-system.bats` (Test `T002282-M3: update-status verweigert den Write bei fremdem agent-lock-Claim`, bereits committet)

**Interfaces:**
- Konsumiert: `scripts/agent-lock.sh` (Test-Overrides `AGENT_LOCK_DIR` + `CLAUDE_SESSION_ID`), `scripts/ticket.sh update-status`.
- Produziert: nichts — reiner Rot-Checkpoint.

- [ ] **Step 1: Failing Test ausführen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats -f "T002282-M3"
```

Expected: FAIL — `keine agent-lock-Ablehnung: ERROR: no shared-db pod found in namespace workspace (context bats-no-cluster-t002224)`. Das belegt genau die Lücke: der Schreibpfad läuft ungebremst bis `_pgpod` durch, obwohl eine fremde Session den Ticket-Lock hält.

### Task 6: GREEN — `_ticket_lock_guard` einführen und in `update-status` verdrahten

**Files:**
- Implementierung: `scripts/vda/ticket/_ticket-core.sh` (neuer Helper, hinter `_ticket_offline_refuse_read`)
- Implementierung: `scripts/vda/ticket/update-status.sh` (Aufruf vor `pod=$(_pgpod)`, Zeile 33-34)

**Interfaces:**
- Konsumiert: `bash "$(dirname "${BASH_SOURCE[0]}")/../../agent-lock.sh" check ticket <external_id>` — Exit 0 (`free`/`mine`) = erlaubt, Exit 3 (`held`) = abgelehnt.
- Produziert: `_ticket_lock_guard <external_id>` → Return 0 bei erlaubtem Write, Return 7 bei Ablehnung; Fehlermeldung auf stderr.

- [ ] **Step 1: Helper in `_ticket-core.sh` ergänzen**

```bash
# _ticket_lock_guard <external_id> — Durchsetzung der bisher rein advisory
# agent-lock.sh-Claims im Schreibpfad. Dispatch-Gates (dispatcher-prep.sh,
# factory-prep-bridge.sh, babysit-prs.sh) fragen den Lock vor dem Dispatch ab,
# der Status-Write tat es nie — deshalb konnte eine zweite Session den Status
# eines fremd gelockten Tickets überschreiben (beobachtet bei T002270). [T002282]
#
# TICKET_LOCK_OVERRIDE=1 = expliziter Escape-Hatch für Automationspfade, die
# bereits vor dem Dispatch gated wurden und selbst keinen Claim halten.
_ticket_lock_guard() {
  local id="$1"
  [[ "${TICKET_LOCK_OVERRIDE:-0}" == "1" ]] && return 0
  local lock_sh out rc
  lock_sh="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/agent-lock.sh"
  [[ -x "$lock_sh" || -f "$lock_sh" ]] || return 0   # kein Lock-Registry vorhanden -> kein Blocker
  out="$(bash "$lock_sh" check ticket "$id" 2>/dev/null)"; rc=$?
  if [[ $rc -eq 3 ]]; then
    echo "ERROR: Ticket $id ist durch eine andere Session gesperrt (agent-lock) — Status-Schreibvorgang verweigert." >&2
    echo "       Halter: $(printf '%s' "$out" | tr '\n' ' ')" >&2
    echo "       Override nur bewusst: TICKET_LOCK_OVERRIDE=1" >&2
    return 7
  fi
  return 0
}
```

- [ ] **Step 2: Guard in `update-status.sh` aufrufen**

Direkt vor `local pod` / `pod=$(_pgpod)`:

```bash
  # [T002282] Lock-Durchsetzung VOR jedem Cluster-Zugriff — ein abgelehnter Write
  # darf _pgpod gar nicht erst erreichen.
  _ticket_lock_guard "$id" || exit 7
```

- [ ] **Step 3: Test grün prüfen und Regressionen ausschließen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
```
Erwartung: alle Tests grün, insbesondere die bestehenden `T002230`- und `T002284`-Tests (statische SQL-/JSON-Projektionschecks), die vom Guard nicht berührt werden dürfen.

### Task 7: Verifikation

**Files:**
- Alle in `## File Structure` gelisteten Dateien.

**Interfaces:**
- Konsumiert: `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory`.
- Produziert: regenerierte Freshness-Artefakte (insbesondere `website/src/data/test-inventory.json` wegen der drei neuen `@test`-Blöcke).

- [ ] **Step 1: Test-Inventar regenerieren**

```bash
task test:inventory
```
`website/src/data/test-inventory.json` muss mit den neuen `@test`-Einträgen mitcommittet werden, sonst schlägt der CI-Inventarcheck fehl.

- [ ] **Step 2: Vollständige Spec-Suiten der drei berührten Dateien**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
```
Erwartung: alle grün, keine Regression in den Nachbartests.

- [ ] **Step 3: Mandatory Verify-Commands**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Erwartung: alle drei mit Exit 0. `task freshness:check` deckt den S1–S4-Ratchet und die Baseline-Key-Count-Assertion mit ab.
