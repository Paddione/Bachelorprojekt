---
title: "worktree-prune-cross-platform-fix — Implementation Plan"
ticket_id: T900046
domains: [scripts]
status: active
file_locks: []
shared_changes: false
parent_feature: null
depends_on_plans: []
---

# worktree-prune-cross-platform-fix — Implementation Plan

_Ticket: T900046_

## Problem

`git worktree prune` entregistriert Worktrees, wenn Git aus einer Inkompatiblen Plattform
aufgerufen wird. Das Repo wird von **Windows-Git** und **WSL-Git** bedient. Wenn WSL-Git
`git worktree prune` ausführt, prueft es die in `.git/worktrees/<name>/gitdir` gespeicherten
Windows-Pfade (z.B. `C:/Users/.../.git`) — aus WSL-Sicht existiert diese Datei nicht,
daher pruned es die Registration. Umgekehrt gilt das Gleiche, wenn Windows-Git WSL-Pfade
prune'd.

Betroffene Aufrufstellen: `scripts/agent-lock-reap.sh`, `scripts/factory/cleanup.sh`,
`scripts/factory/dsh-exec.sh`, `scripts/factory/opencode-exec.sh`, `scripts/factory/watchdog.sh`,
`scripts/worktree-create.sh`.

## Requirements

### Requirement: Platform-aware worktree prune

`scripts/lib/worktree-prune-safe.sh` MUSS praeventiv verhindern, dass `git worktree prune`
Worktree-Registrations entfernt, die aus einer anderen Plattform stammen.

Das Skript MUSS folgendermaessen vorgehen:

1. **Plattform-Erkennung:** Detektiere, ob das aktuelle Git aus WSL laeuft (test auf `/proc/sys/kernel/osrelease` mit `Microsoft` im Inhalt, oder `git --exec-path` die `/wsl$`/`/wsl.$` enthaelt).
2. **Bei WSL:** Fuer jeden registrierten Worktree pruefe, ob die `.git`-Datei aus WSL-Sicht lesbar ist (versuche `readlink` auf den `gitdir`-Inhalt). Wenn nicht, ueberspringe diesen Worktree beim Prune.
3. **Bei nativem Windows/Linux/macOS:** Führe `git worktree prune` normal aus.

### Requirement: Alle Aufrufstellen nutzen die sichere Variante

Jeder Aufruf von `git worktree prune` in den Skripten des Repos MUSS durch
`worktree_prune_safe` ersetzt werden.

## File Structure

```
scripts/lib/worktree-prune-safe.sh               # NEW (p1): Platform-aware wrapper
scripts/agent-lock-reap.sh                       # MODIFIED (p2): worktree_prune_safe einbinden
scripts/factory/cleanup.sh                       # MODIFIED (p2): worktree_prune_safe einbinden
scripts/factory/dsh-exec.sh                     # MODIFIED (p2): worktree_prune_safe einbinden
scripts/factory/opencode-exec.sh                # MODIFIED (p2): worktree_prune_safe einbinden
scripts/factory/watchdog.sh                     # MODIFIED (p2): worktree_prune_safe einbinden
scripts/worktree-create.sh                      # MODIFIED (p2): worktree_prune_safe einbinden
tests/spec/worktree-cross-platform.bats         # NEW (p3): Platform-detection + prune guard tests
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-implement.md | implement | scripts/lib/worktree-prune-safe.sh | |
| p2 | tasks.d/p2-callsites.md | implement | scripts/agent-lock-reap.sh, scripts/factory/cleanup.sh, scripts/factory/dsh-exec.sh, scripts/factory/opencode-exec.sh, scripts/factory/watchdog.sh, scripts/worktree-create.sh | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/worktree-cross-platform.bats | p1 |

### p1 — Library: worktree-prune-safe.sh

Erstelle `scripts/lib/worktree-prune-safe.sh` mit der Funktion `worktree_prune_safe()`.

Die Funktion MUSS:

1. Erkennen, ob Git aus WSL laeuft:
   - Primär: `git --exec-path` enthaelt `/wsl$` oder `/wsl.` (Regex: `/wsl[./]`)
   - Fallback: `/proc/sys/kernel/osrelease` liest `Microsoft` oder `WSL`
2. Wenn WSL:
   - Hole die Liste aller registrierten Worktrees mit `git worktree list --porcelain`
   - Fuer jeden Worktree: lies die `.git/worktrees/<name>/gitdir` Datei
   - Wenn die gitdir-Datei einen Windows-Pfad enthält (beginnt mit Buchstabe + `:/`):
     - Versuche, die Datei via `readlink` oder `cat` aus WSL-Sicht lesbar zu machen
     - Wenn lesbar: Worktree ist Windows-basiert aber ueber WSL-Proxy ansprechbar → prune safe
     - Wenn nicht lesbar: Worktree ist Windows-basiert und nicht aus WSL ansprechbar → skip
   - Fuer jeden Worktree: lies die `.git/worktrees/<name>/gitdir` Datei
   - Wenn die gitdir-Datei einen WSL-Pfad enthält (beginnt mit `/home/`, `/mnt/c/` etc.):
     - Wenn der Pfad lesbar ist → prune safe
     - Wenn nicht → skip
3. Wenn nicht WSL:
   - Führe `git worktree prune` direkt aus (native Plattform, kein Cross-Platform-Problem)

Die Funktion MUSS immer exit 0 zurueckgeben (non-fatal).

### p2 — Call-Site Migration

Ersetze in folgenden Dateien `git worktree prune 2>/dev/null || true` durch:

```bash
# worktree_prune_safe: platform-aware prune, non-fatal
. "$(dirname "$0")/../lib/worktree-prune-safe.sh" 2>/dev/null || true
worktree_prune_safe 2>/dev/null || true
```

Betroffene Dateien (relativ zum Repo-Root):

| Datei | Zeile (ca.) | Kontext |
|-------|-------------|---------|
| `scripts/agent-lock-reap.sh` | 163 | im `cmd_reap()` Body |
| `scripts/factory/cleanup.sh` | 58 | post-remove housekeeping |
| `scripts/factory/dsh-exec.sh` | 214 | Vor/ Nach worktree ops |
| `scripts/factory/opencode-exec.sh` | 311 | Vor/ Nach worktree ops |
| `scripts/factory/watchdog.sh` | 147 | Stale detection loop |
| `scripts/worktree-create.sh` | 327 | Idempotency prune |

Jede Aenderung MUSS die Semantik bewahren: der Aufruf bleibt non-fatal (exit 0 im Fehlerfall).

### p3 — Tests: worktree-cross-platform.bats

Erstelle `tests/spec/worktree-cross-platform.bats` mit Tests:

1. **T900046-M1: WSL-Erkennung bei vorhandenem WSL-Signal**
   - Mock `git --exec-path` mit WSL-Pfad
   - `worktree_prune_safe` MUSS WSL-Modus erkennen

2. **T900046-M2: WSL-Erkennung via osrelease**
   - Mock `/proc/sys/kernel/osrelease` mit Microsoft-String
   - `worktree_prune_safe` MUSS WSL-Modus erkennen

3. **T900046-M3: Native Plattform (kein WSL)**
   - Kein WSL-Signal gesetzt
   - `git worktree prune` wird direkt aufgerufen (nicht blocked)

4. **T900046-M4: Prune mit unerreichbarem Worktree wird uebersprungen**
   - Simuliere einen Windows-gitdir-Eintrag, der aus WSL nicht lesbar ist
   - `worktree_prune_safe` MUSS diesen Worktree vom Prune ausschliessen

5. **T900046-M5: Prune mit erreichbarnem Worktree durchlaeuft**
   - Simuliere einen WSL-gitdir-Eintrag, der aus WSL lesbar ist
   - `worktree_prune_safe` MUSS diesen Worktree prune'n

6. **T900046-M6: Non-fatal — exit code 0 bei Fehlern**
   - Alle Fehlerpfade MUSSSEN exit 0 zurueckgeben

## File Structure (verify)

Die nachfolgenden File Structure-Checks sind Teil der Plan-Qualitaet (STRUCT1/STRUCT2/STRUCT3
aus [plan-quality-gates](.claude/skills/references/plan-quality-gates.md)).

### STRUCT1: H1 mit File Structure

Die H1 ueberschrift `worktree-prune-cross-platform-fix — Implementation Plan` MUSS
unmittelbar gefolgt sein von einer `## File Structure` Sektion mit einer code-block
Darstellung aller geaenderten/Neuen Dateien.

### STRUCT2: Failing Test Step

Der finale Verify-Task MUSS einen Testrunner-Aufruf enthalten, der im Plan-Stadium
FAILT, weil der Test noch keine Pass-Signale sieht.

### STRUCT3: Verifikations-Task

Der finale Verify-Task MUSS `task test:changed` + `task freshness:check` enthalten.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der RED-Test reproduziert das Prune-Problem und muss
      gegen den unveränderten Stand scheitern. Use the phrase `expected: FAIL` in the
      step body so plan-lint STRUCT2 picks it up.

```bash
cd <worktree> && tests/unit/lib/bats-core/bin/bats tests/spec/worktree-cross-platform.bats
# expected: FAIL (git worktree prune entfernt Windows-Registrations aus WSL)
```

- [ ] **Fix-Step (GREEN).** Partials p1+p2+p3 umsetzen; danach alle Suiten grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/worktree-cross-platform.bats
bash scripts/plan-lint.sh openspec/changes/worktree-prune-cross-platform-fix/tasks.md
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
