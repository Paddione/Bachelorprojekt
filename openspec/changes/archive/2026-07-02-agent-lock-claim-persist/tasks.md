---
title: "agent-lock.sh claim persistiert Lock-Datei zuverlässig"
ticket_id: T001384
plan_ref: openspec/changes/agent-lock-claim-persist/tasks.md
status: plan_staged
date: 2026-07-01
domains: [dev-tooling, agent-lock]
spec_ref: docs/superpowers/specs/2026-07-01-agent-lock-claim-persist-design.md
openspec_ref: openspec/changes/agent-lock-claim-persist/
file_locks: ["scripts/agent-lock.sh", "tests/spec/agent-lock-claim-persist.bats"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# T001384 — agent-lock.sh claim persistiert Lock-Datei zuverlässig — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Ticket:** T001384 · **Spec:** `docs/superpowers/specs/2026-07-01-agent-lock-claim-persist-design.md` · **Branch:** `fix/t001384-agent-lock-claim-persist` · **Tests:** `tests/spec/agent-lock-claim-persist.bats` (RED on this branch)
>
> **Scope:** Drei chirurgische Korrekturen in `scripts/agent-lock.sh` (Reihenfolge in `_reapable`, Lock-Akquisition in `cmd_reap`, harter Anker in `_lock_dir`) plus eine neue BATS-Regressions-Suite. Keine API-Änderung, keine Schema-Änderung, keine neuen Module.

**Goal:** `bash scripts/agent-lock.sh claim …` schreibt eine Lock-Datei, die einen nachfolgenden `reap`-Lauf in derselben oder einer parallelen Session **zuverlässig** überlebt — auch wenn der referenzierte Worktree-Pfad (noch) nicht existiert und auch wenn `cmd_reap` parallel zu `cmd_claim` läuft.

**Architecture:** Reine Skript-Korrektur, drei lokal begrenzte Änderungen in `scripts/agent-lock.sh`. Alle drei Defekte sind in derselben Datei und beeinflussen sich gegenseitig (Defekt 1 schützt davor, dass Defekt 2 Schaden anrichtet; Defekt 3 stellt sicher, dass beide Schritte das richtige Verzeichnis treffen). Tests als neue BATS-Suite `tests/spec/agent-lock-claim-persist.bats`, eigenständig RED → GREEN.

**Tech Stack:** Bash 5, BATS 1.13 (`tests/unit/lib/bats-core/bin/bats`).

## Global Constraints

- **TDD-Gate.** Vor jeder Code-Änderung läuft die neue BATS-Suite (RED). Nach
  jeder Task läuft sie erneut (Teilmenge GREEN). Am Ende müssen alle 6 Tests
  grün sein, der bestehende `tests/spec/agent-lock-session-identity.bats`
  unverändert grün bleiben.
- **S1 — Zeilen-Ratchet.**
  - `scripts/agent-lock.sh`: aktuell 317 Zeilen, Limit 500 für `.sh` (kein
    Baseline-Eintrag → wirksame Schwelle 500). Restbudget 183. Die drei
    Fixes zusammen werden netto < 30 Zeilen hinzufügen, also weit unter dem
    Limit. Konkret geplant: _reapable-Reorder -2/+6, cmd_reap-Lock +3,
    _lock_dir-Anker -2/+4 → Netto ca. +9 Zeilen.
  - `tests/spec/agent-lock-claim-persist.bats`: neue Datei, aktuell 134
    Zeilen, `.bash`-Limit 300. Restbudget 166. Die endgültige Datei wird
    ~ 140–150 Zeilen haben (kein signifikantes Wachstum über die RED-Phase
    hinaus). Plan bleibt klar unter dem Limit.
  - `docs/superpowers/specs/2026-07-01-agent-lock-claim-persist-design.md`:
    Doku, kein S1-Limit.
- **S2 — keine Import-Zyklen.** N/A (reine Bash-Datei, keine Modul-Importe).
- **S3 — keine Brand-Domain-Literale.** N/A (keine Website-/K8s-Manifeste).
- **S4 — keine Orphans.** Die neue BATS-Datei `tests/spec/agent-lock-claim-persist.bats` ist via `tests/spec/` bereits durch den BATS-Runner abgedeckt (siehe `Taskfile.yml` Block `test:unit:bats-spec`). Kein neuer Eintrag in `Taskfile.yml` nötig; der Pfad `tests/spec/agent-lock-*.bats` wird per Glob aufgegriffen.
- **Keine** Schema-Änderung an Lock-JSONs, kein CLI-Argument-Change, keine
  Konfigurationsdatei-Anpassung. Reine Skript-Korrektur.
- **Cross-Reference T001268 / T001408:** die existierenden
  Harness-Stable-Session-Identity-Annahmen und der Reap-Grace bleiben
  erhalten — Defekt 1 ist ein **Zusatz** oberhalb von T001408's
  `sid-dead`-Grace-Pfad.
- **Nicht-Ziele:** kein Wechsel auf SQLite/etcd/Consul, kein Wechsel auf
  Lease-basierte Locks, kein automatisches Recovery beim Reap (Owner
  bleibt für `cmd_refresh`/`cmd_claim` selbst verantwortlich).

| Datei | Ist | Schwelle | Restbudget |
|---|---|---|---|
| `scripts/agent-lock.sh` | 317 | 500 (kein Baseline-Eintrag) | 183 |
| `tests/spec/agent-lock-claim-persist.bats` | 134 (RED) → ~ 150 (GREEN) | 300 (`.bash`) | 150 |

## File Structure

Geänderte Dateien:

- `scripts/agent-lock.sh` — drei chirurgische Korrekturen (Defekte 1, 2, 3).
- `tests/spec/agent-lock-claim-persist.bats` — neu, BATS-Regressions-Suite
  (RED ist bereits committed in Schritt 0 dieser PR).
- `openspec/specs/active-sessions-hub.md` — neue Requirement
  `Claim-Persistenz gegen reap-Race` (siehe
  `openspec/changes/agent-lock-claim-persist/specs/active-sessions-hub.md`).

Neu erstellte Dateien:

- `docs/superpowers/specs/2026-07-01-agent-lock-claim-persist-design.md`
  (Spec, bereits in der Branch enthalten).
- `openspec/changes/agent-lock-claim-persist/proposal.md` (Proposal).
- `openspec/changes/agent-lock-claim-persist/specs/active-sessions-hub.md`
  (Delta Spec).
- `tests/spec/agent-lock-claim-persist.bats` (RED tests).

Unverändert (Konsumenten von `agent-lock.sh`):

- `.githooks/pre-commit`, `.githooks/post-checkout`,
  `scripts/agent-collision.sh`, `scripts/agent-msg.sh`,
  `scripts/agent-collision.sh:7-10`, `scripts/factory/*`,
  `scripts/vda/factory-prep.sh` — profitieren automatisch von der Korrektur,
  keine Änderung nötig.

---

## Task 0: Preflight — Failing-Tests bestätigen (TDD-Kontrakt)

**Files:** keine (nur Verifikation)

**Interfaces:**
- Consumes: die existierende (rote) BATS-Datei `tests/spec/agent-lock-claim-persist.bats`.
- Produces: bestätigtes RED, das die Tasks 1.1, 2.1, 3.1 rechtfertigt.

- [ ] **Step 1: BATS-Suite ausführen und Rot bestätigen**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats
  ```

  Expected: FAIL — Tests 1–5 sind rot, Test 6 (Regression-Schutz für
  T001268) ist grün. Falls ein Test 1–5 bereits grün ist: STOPP — die
  Vorbedingung dieses Plans ist verletzt; investigate, ob ein vorheriger
  Fix die Datei bereits korrigiert hat (in dem Fall: Plan anpassen statt
  erneut implementieren).

- [ ] **Step 2: Bestehende agent-lock-Tests laufen weiter grün**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
  ```

  Expected: PASS (alle 6 Tests aus T001268 unverändert grün). Bestätigt,
  dass die neue BATS-Datei kein Kollateral-Schaden an der bestehenden
  Test-Suite verursacht.

---

## Task 1: Defekt 1 fixen — `_reapable` prüft `sid-alive` zuerst

**Files:** `scripts/agent-lock.sh`

**Interfaces:**
- Consumes: `_reapable` (aktuell Zeilen 87–105), Aufrufer in `cmd_claim`
  (Zeile 181), `cmd_reap` (Zeile 253), `cmd_check` (Zeile 211).
- Produces: gleiche Rückgabe-Semantik (0 = reapable, 1 = nicht), aber
  `sid-alive` schützt **immer** vor den anderen Reapability-Checks.

- [ ] **Step 1.1: `_reapable` umsortieren**

  Aktuelle Reihenfolge in `scripts/agent-lock.sh:87-105`:

  ```bash
  _reapable() {
    local f="$1" sid wt hb ct now age
    [ -f "$f" ] || return 0
    sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
    hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
    if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then _reap_log "$f" worktree-missing; return 0; fi   # ← trippt ZUERST
    if [ -n "$sid" ]; then
      if _sid_alive "$sid"; then return 1; fi
      age=$(( now - ${ct:-0} ))
      if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
        _reap_log "$f" sid-dead; return 0
      fi
    fi
    if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
    return 1
  }
  ```

  Ersetze die Reihenfolge so, dass `_sid_alive` als **erstes** geprüft wird.
  Konkret: der `if [ -n "$wt" ] && [ ! -d "$wt" ]`-Block wird **nach** dem
  `if [ -n "$sid" ]; then if _sid_alive "$sid"; then return 1; fi …`-Block
  verschoben. Die `return`-Werte und Reap-Log-Einträge bleiben
  semantisch identisch für die Fälle, in denen der SID **tot** ist
  (dann greift weiterhin `worktree-missing`, `sid-dead` oder
  `heartbeat-ttl`).

  Erwartete neue Struktur (semantisch — exakte Formatierung an die
  bestehende 2-space-indent anpassen):

  ```bash
  _reapable() {
    local f="$1" sid wt hb ct now age
    [ -f "$f" ] || return 0
    sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
    hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
    # 0) A CONFIRMED-ALIVE SID ALWAYS WINS — even if the worktree path is stale
    #    or missing, a live session owns the claim. Reapability only kicks in
    #    when the SID is dead (or, as a last resort, when no SID is recorded). [T001384]
    if [ -n "$sid" ] && _sid_alive "$sid"; then return 1; fi
    if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then _reap_log "$f" worktree-missing; return 0; fi
    if [ -n "$sid" ]; then
      # Dead numeric SID: a young claim (< AGENT_LOCK_GRACE) is protected from a
      # reap on the SID check alone — a transient session-id mismatch between tool
      # calls must not drop a fresh claim. Fall through to the heartbeat-TTL check.
      age=$(( now - ${ct:-0} ))
      if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
        _reap_log "$f" sid-dead; return 0
      fi
    fi
    if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
    return 1
  }
  ```

  Wichtig: das `if [ -n "$sid" ] && _sid_alive "$sid"; then return 1; fi`
  ersetzt den vorherigen Inner-Block `if _sid_alive "$sid"; then return 1; fi`,
  der innerhalb des äußeren `if [ -n "$sid" ]` stand. Beide Versionen
  liefern für die existierenden Test-Pfade dasselbe Ergebnis, aber die
  neue Reihenfolge schützt **zusätzlich** vor `worktree-missing`, wenn der
  SID lebt.

- [ ] **Step 1.2: Tests 1 + 2 grün bestätigen (Defekt 1 isoliert)**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats --filter 'T001384-D1'
  ```

  Expected: PASS für beide `T001384-D1`-Tests. Tests 3–5 dürfen weiter rot
  sein (Defekte 2 + 3 noch offen). Falls Test 1 oder 2 weiter rot:
  Re-Read der `if`-Verschachtelung, sicherstellen dass `_sid_alive` VOR
  `worktree-missing` greift.

---

## Task 2: Defekt 2 fixen — `cmd_reap` hält den Registry-Lock

**Files:** `scripts/agent-lock.sh`

**Interfaces:**
- Consumes: `cmd_reap` (aktuell Zeilen 229–256), `_with_lock` (Zeilen 107–117).
- Produces: identische Public-Surface (`cmd_reap` Aufruf-Signatur
  unverändert), aber Schritt 3 (das `for f in "$d"/*.json; … rm -f` ist
  jetzt unter `_with_lock` serialisiert mit `cmd_claim`/`cmd_refresh`/
  `cmd_release`.

- [ ] **Step 2.1: `_with_lock` VOR dem File-Sweep aufrufen**

  In `cmd_reap` (Zeilen 229–256), füge **vor** dem Block

  ```bash
  if [ -d "$d" ]; then
    local f
    for f in "$d"/*.json; do [ -e "$f" ] || continue; _reapable "$f" && rm -f "$f"; done
  fi
  ```

  einen Aufruf von `_with_lock` ein. Schritte 1–2c (kill orphan processes,
  `git worktree prune`, remote-tracking-ref prune, branch cleanup) bleiben
  **außerhalb** des Locks, weil sie keine `agent-locks/*.json` berühren.

  Erwartete neue Form (genau an existierender Codebase-Indentierung
  anpassen — 2-space, lowercase local, `then` auf gleicher Zeile):

  ```bash
  cmd_reap() {
    local d; d="$(_lock_dir)"
    # 1) kill orphan processes whose cwd is a DELETED worktree
    ...
    # 2b) prune stale remote-tracking refs
    ...
    # 2c) delete local branches that were squash-merged into main
    ...
    # 3) drop reapable (clearly dead) locks — hold the registry lock so this
    #    sweep is serialised against cmd_claim / cmd_refresh / cmd_release.
    #    Without the lock, a concurrent claim can write a fresh lock file
    #    and have it immediately deleted here. [T001384]
    _with_lock
    if [ -d "$d" ]; then
      local f
      for f in "$d"/*.json; do [ -e "$f" ] || continue; _reapable "$f" && rm -f "$f"; done
    fi
    return 0
  }
  ```

- [ ] **Step 2.2: Tests 3 + 4 grün bestätigen (Defekt 2 isoliert)**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats --filter 'T001384-D2'
  ```

  Expected: PASS für beide `T001384-D2`-Tests.

  **Test 3 verlangt ≥ 800 ms Reap-Dauer, wenn der Lock-Holder 1,2 s
  schläft.** Falls der Reap schneller zurückkommt, ist `_with_lock` nicht
  im Reap-Pfad — die `flock 9`-Zeile wurde vermutlich versehentlich in
  einen Conditional-Block verschoben. Re-Read `cmd_reap`, sicherstellen
  dass `_with_lock` direkt vor dem `for f in` läuft.

  **Test 4 (parallel claim+reap, 30 Rounds mit worktree-Pfad) muss
  fehlerfrei durchlaufen.** Falls ein Round fehlschlägt, hat entweder
  Defekt 1 (Task 1) nicht gegriffen oder Defekt 2 nicht. Beide
  Abhängigkeiten prüfen.

---

## Task 3: Defekt 3 fixen — `_lock_dir` Anker auf `--show-toplevel`

**Files:** `scripts/agent-lock.sh`

**Interfaces:**
- Consumes: `_lock_dir` (aktuell Zeilen 61–66), Aufrufer in
  `_lock_file`/`_with_lock`/`_reap_log`/`cmd_list`/`cmd_reap`.
- Produces: gleiche Rückgabe-Semantik (Pfad zum `agent-locks`-Verzeichnis
  im git-common-dir), aber unabhängig vom `cwd` des rufenden Skripts.

- [ ] **Step 3.1: `--show-toplevel` als Anker davor**

  Aktuelle Implementation (Zeilen 61–66):

  ```bash
  _lock_dir() {
    if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
    local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
    case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
    printf '%s/agent-locks\n' "$cd"
  }
  ```

  Ersetze durch eine Implementation, die `git rev-parse --show-toplevel`
  als Anker nutzt (der Pfad ist immer absolut und liegt außerhalb der
  Worktree-Hierarchie):

  ```bash
  _lock_dir() {
    if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
    # Always anchor on the toplevel of the main checkout so the path is
    # independent of the caller's cwd (worktrees, subshell captures, etc.).
    # Falls back to /tmp/agent-locks only if `git rev-parse` itself fails —
    # never to a cwd-relative resolution, which can be silently wrong when
    # invoked from a worktree whose `.git` is a file, not a directory. [T001384]
    local toplevel common
    toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
    common="$(cd "$toplevel" && git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
    case "$common" in /*) : ;; *) common="$(cd "$toplevel/$common" && pwd)";; esac
    printf '%s/agent-locks\n' "$common"
  }
  ```

  Semantik: identisch zum alten Verhalten, wenn der Aufrufer im
  Main-Checkout sitzt; **korrekt**, wenn der Aufrufer in einer Worktree-
  Shell sitzt (der alte Code konnte in seltenen Pfaden — z. B.
  Worktree-Shell mit `cd $WT_PATH` und nachfolgendem `cd ..` — auf einen
  falschen relativen `.git`-Pfad resolven).

- [ ] **Step 3.2: Test 5 grün bestätigen (Defekt 3 isoliert)**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats --filter 'T001384-D3'
  ```

  Expected: PASS für `T001384-D3` (statischer Check auf den Quellcode:
  `_lock_dir` MUSS `git rev-parse --show-toplevel` referenzieren).

  Falls Test 5 weiter rot: grep im Skript nach `show-toplevel`, sicherstellen
  dass der String 1:1 im Source steht (kein Tippfehler wie
  `show-toplevel-absolute`).

---

## Task 4: Full Suite grün + keine Regressionen

**Files:** keine (Verifikation)

**Interfaces:**
- Consumes: alle drei vorherigen Tasks.
- Produces: vollständige Test-Suite grün.

- [ ] **Step 4.1: Komplette neue BATS-Suite grün**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats
  ```

  Expected: PASS für alle 6 Tests (5 T001384-Tests + 1 Regression-Schutz
  für T001268).

- [ ] **Step 4.2: Bestehende agent-lock-Tests unverändert grün**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
  ```

  Expected: PASS für alle 6 T001268-Tests. Bestätigt, dass die
  `_reapable`-Umordnung die bestehende Semantik für tote SIDs +
  `AGENT_LOCK_GRACE` nicht gebrochen hat.

- [ ] **Step 4.3: Smoke-Test im echten Repo**

  ```bash
  cd "$(git rev-parse --show-toplevel)"
  bash scripts/agent-lock.sh claim branch manual-smoke --worktree /tmp/wt-manual-missing --label smoke
  ls .git/agent-locks/branch__manual-smoke.json
  bash scripts/agent-lock.sh reap
  ls .git/agent-locks/branch__manual-smoke.json
  bash scripts/agent-lock.sh release branch manual-smoke
  ```

  Expected: nach `claim` und nach `reap` existiert die Datei
  (lebender SID schützt). Nach `release` ist sie weg.

---

## Task 5: Verify — CI-Gates

**Files:** keine (Verifikation)

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: bestätigte Gate-Konformität für die PR.

- [ ] **Step 5.1: `task test:changed` (gezielte Tests für geänderte Domains)**

  ```bash
  task test:changed
  ```

  Expected: PASS — die geänderten Dateien sind `scripts/agent-lock.sh`
  (Domain: dev-tooling) und `tests/spec/agent-lock-claim-persist.bats`
  (Domain: tests). Beide werden selektiert, die agent-lock-BATS-Suite
  läuft, der Vitest-Pfad bleibt unangetastet.

- [ ] **Step 5.2: `task freshness:regenerate`**

  ```bash
  task freshness:regenerate
  ```

  Expected: PASS — generierte Artefakte (test-inventory, route-manifest,
  learning-assets, quality-index) werden regeneriert. Falls `test-inventory.json`
  durch die neue BATS-Datei wächst: das ist OK und gewollt.

- [ ] **Step 5.3: `task freshness:check` (CI-Äquivalent)**

  ```bash
  task freshness:check
  ```

  Expected: PASS — S1–S4-Ratchet, Baseline-Key-Count-Assertion, alle
  Lint-Checks. Insbesondere:
  - S1: `scripts/agent-lock.sh` ist nicht baselined → Schwelle 500, Ist
    ~ 326 nach den drei Fixes → Restbudget 174, klar positiv.
  - S2: keine Import-Zyklen (reine Bash-Datei, N/A).
  - S3: keine Brand-Domain-Literale (N/A).
  - S4: keine Orphans — die neue BATS-Datei wird durch
    `tests/spec/agent-lock-*.bats` im BATS-Runner automatisch aufgegriffen.

- [ ] **Step 5.4: `task test:openspec` (OpenSpec-Validierung)**

  ```bash
  bash scripts/openspec.sh validate
  ```

  Expected: PASS — Proposal + Delta Spec + Tasks konsistent, Requirements
  in `specs/active-sessions-hub.md` haben GIVEN/WHEN/THEN-Scenarios.
