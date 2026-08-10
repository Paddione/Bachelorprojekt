---
title: "mishap-t002424 — Implementation Plan"
ticket_id: T002424
domains: [scripts,ticket-ops,repo]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002424 — Implementation Plan

_Ticket: T002424_

Mishap-Bundle: scripts/agent-lock.sh, skills/ticket-ops, repo/chore/mishap-T002382 (3 Einträge)

## File Structure

```
# CHANGED
scripts/vda/ticket/_ticket-core.sh                           # M1: Diagnose + gehärteter SID-Vergleich
.agents/skills/references/ticket-ops-procedures.md           # M2: Pre-Check früher, LOCK-KONFLIKT in Masterplan
# NEW
scripts/pr-scope-check.sh                                    # M3: Scope-Drift-Guard
tests/spec/mishap-t002424.bats                               # M1/M2/M3: Failing-Test-Suite
```

## Tasks

### Task 1: Diagnose — `_ticket_lock_guard` loggt SID-Mismatch

**Files:** `scripts/vda/ticket/_ticket-core.sh`

In `_ticket_lock_guard`: Wenn `agent-lock.sh check ticket <id>` exit 3 zurückgibt, die Lock-Datei (erkennbar über den bekannten Pfad `$(_lock_file ticket "$id")` — abgeleitet aus `_lock_dir`-Logik) direkt parsen, owner_sid extrahieren, und die aktuelle `CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID` sowie den Shell-PID (`$$`) auf stderr ausgeben.

```
Diagnose: _ticket_lock_guard SID mismatch
  Lock owner_sid: <extrahierter Wert>
  Current CLAUDE_CODE_SESSION_ID: <Wert oder "(leer)">
  Current CLAUDE_SESSION_ID: <Wert oder "(leer)">
  Shell PID: $$
```

Der Diagnose-Block darf den Exit-Code nicht ändern (weiterhin `return 7`).

### Task 2: Härtung — Direkter SID-Vergleich statt Subshell-Env

**Files:** `scripts/vda/ticket/_ticket-core.sh`

Ersetze die aktuelle Subshell-Env-Passthrough-Strategie in `_ticket_lock_guard` durch:

1. Lock-Datei-Pfad ermitteln (gleiche Logik wie `_lock_file` in agent-lock.sh, aber ohne Sourcing — stattdessen feste Pfadregel: `$COMMON_DIR/agent-locks/ticket__<id>.json`).
2. owner_sid per `sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$lock_file"` extrahieren.
3. Die aktuelle SID aus der Umgebung ermitteln (zuerst `CLAUDE_CODE_SESSION_ID`, dann `CLAUDE_SESSION_ID`, dann `$PPID`-basierten Fallback).
4. Bei Mismatch: same-tool-Fallback wie `cmd_refresh` (tool class aus `CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID`/`GEMINI_CLI` usw.).

Die `T002422`-Kommentarzeilen in der Funktion aktualisieren, um den neuen Mechanismus zu dokumentieren.

### Task 3: Pre-Check in Step 3.3 — Lock-Prüfung vor Masterplan

**Files:** `.agents/skills/references/ticket-ops-procedures.md`

Verschiebe den Pre-Check-Invarianten-Block [T002422] von Step 3.5 nach Step 3.3:

- Aus Step 3.5 den Block entfernen.
- In Step 3.3 einen neuen Schritt "Pre-Check: Lock-Status der Wave-1-Tickets prüfen" einfügen.
- Der Schritt ruft `agent-lock.sh check ticket <id>` für jedes Wave-1-Ticket und sammelt `held`-Ergebnisse.
- Tickets mit Konflikt werden aus der Wave entfernt und in einer "LOCK-KONFLIKTE"-Liste festgehalten.

### Task 4: LOCK-KONFLIKT in Masterplan-Template (Step 3.4)

**Files:** `.agents/skills/references/ticket-ops-procedures.md`

Ergänze das Masterplan-Template in Step 3.4 (aktuell das Code-Beispiel in Step 3.4) um eine optionale "LOCK-KONFLIKTE"-Sektion. Die Sektion listet Tickets, die in Task 3 als `held` identifiziert wurden, mit Halter-Info. Erscheint nur, wenn es Konflikte gibt.

```
LOCK-KONFLIKTE:
  T002XXX bereits gehalten von claude (sid …, label …, seit …)
  T002YYY bereits gehalten von gemini (sid …, label …, seit …)
```

Setze die Sektion in das existierende `WELLE 1`-Beispiel nach der `DEFERRED`-Zeile (oder ersetze die DEFERRED-Zeile — je nach Kontext). Hinterlege einen `[T002424]`-Referenzkommentar.

### Task 5: Scope-Contamination-Guard `scripts/pr-scope-check.sh`

**Files:** `scripts/pr-scope-check.sh`

Erstelle `scripts/pr-scope-check.sh` mit folgender Funktionalität:

1. Nimmt `--ticket <id>` und optional `--branch <branch>` (default: HEAD).
2. Holt `touched_files` des Tickets per `bash scripts/vda/ticket.sh get --id <id> --json | jq '.touched_files // []'`.
3. Ermittelt den Diff `git diff main...<branch> --name-only`.
4. Vergleicht die geänderten Dateien mit den `touched_files`:
   - Dateien, die nicht in `touched_files` stehen, werden als "UNSCOPED" gewarnt.
   - Exit 0 bei keiner Warnung, Exit 1 bei mindestens einer Warnung (opt-out mit `--allow-drift`).
5. Usage und Help-Text.

Der Guard ist advisory (nicht fail-closed im CI) — er dient als Pre-PR-Check für den Entwickler. Die verified-Prüfung läuft über eine `--strict`-Option.

### Task 6: Failing-Test-Suite für alle drei Mishaps

**Files:** `tests/spec/mishap-t002424.bats`

Schreibe BATs-Tests für jede der drei Mishap-Komponenten. Mindestens ein Test pro Mishap — insgesamt 4 Tests.

#### Mishap 1: SID-Mismatch-Diagnose in `_ticket_lock_guard`

Test 1: `_ticket_lock_guard` gibt owner_sid + aktuelle SID auf stderr aus, wenn `agent-lock.sh check` exit 3 zurückgäbe.
Da der echte agent-lock.sh-Aufruf im Test nicht einfach exit 3 provozieren kann (er erfordert einen Fremd-Lock), prüft der Test stattdessen, dass die Diagnose-Logik im Quelltext vorhanden ist:
- grep nach `owner_sid` in `_ticket-core.sh` in der `_ticket_lock_guard`-Funktion.
- grep nach `CLAUDE_CODE_SESSION_ID` in derselben Funktion.

Test 2: `_ticket_lock_guard` hat same-tool-Fallback.
- grep nach `_detect_tool` oder `tool.*claude` in `_ticket-core.sh`.

#### Mishap 2: Pre-Check-Reihenfolge

Test 3: Pre-Check-Invariante steht in Step 3.3 (vor dem masterplan template).
- `grep` nach `Pre-Check-Invariante \[T002422\]` und prüfen, dass die Zeilennummer VOR `### Step 3.4` liegt.
- `grep` nach `LOCK-KONFLIKT` im masterplan-template-Bereich (Step 3.4).

#### Mishap 3: pr-scope-check.sh existiert und warnt

Test 4: `scripts/pr-scope-check.sh` existiert und hat `--ticket`-Flag, `UNSCOPED`-Warnung und `--allow-drift`-Opt-out.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-t002424.bats
# expected: FAIL (rot — mindestens ein Test prüft neue Funktionalität, die erst in Task 1-5 implementiert wird)
```

### Task 7: Final Verification (GRÜN)

Nach Implementierung aller Tasks:

1. `task test:changed` — alle Tests in `tests/spec/mishap-t002424.bats` müssen GRÜN sein.
2. `task freshness:regenerate` — generierte Artefakte aktualisieren.
3. `task freshness:check` — Prüfung auf uncommittete Generates.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Task 6 enthält die Tests, die vor der Implementierung fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-t002424.bats
# expected: FAIL (rot — Tests prüfen neue Code-Struktur vor Task 1-5)
```

- [ ] **Fix-Step (GREEN).** Tasks 1-5 implementieren, dann Task 6 korrigieren falls nötig.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
