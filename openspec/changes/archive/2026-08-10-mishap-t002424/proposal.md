# Proposal: mishap-t002424

## Why

Drei Mishaps aus unterschiedlichen Komponenten wurden gebündelt, da sie alle die Session-Koordination und Ticket-Scope-Integrität betreffen.

1. **agent-lock SID-Mismatch:** `agent-lock.sh claim ticket <id>` kehrt mit exit 0 zurück, aber `vda.sh ticket update-status --id <id>` schlägt fehl mit "Ticket ist durch eine andere Session gesperrt (agent-lock)". Die `_ticket_lock_guard`-Funktion in `_ticket-core.sh` delegiert `agent-lock.sh check` in eine Subshell mit explizitem Env-Passthrough — die SID-Erkennung in der Subshell weicht von der des ursprünglichen Claims ab.

2. **ticket-ops Pre-Check zu spät:** T002422 führte eine Pre-Check-Invariante in Step 3.5 ein (vor dem `claim`-Aufruf). Die Lock-Prüfung kommt aber erst nach der Masterplan-Präsentation — ein Konflikt wird dem Nutzer erst sichtbar, nachdem er den Plan freigegeben hat.

3. **Branch-Kontamination in mishap-t002382:** Der Branch `chore/mishap-T002382` enthielt durch Rebase-Kontamination Änderungen aus T002407 (agent-models.jsonc, Tests). Die Kontamination wurde bereits per Revert bereinigt, es fehlt ein Guard, der künftige Scope-Drift erkennt.

## What

### Mishap 1: `_ticket_lock_guard` diagnostisch härten

- **Diagnose:** `_ticket_lock_guard` loggt bei exit 3 die owner_sid aus der Lock-Datei sowie die aktuelle SID/Env-Variablen auf stderr, damit die Root Cause sichtbar wird.
- **Härtung:** Statt einer Subshell mit env-Passthrough liest der Guard die Lock-Datei direkt, extrahiert die owner_sid per `sed`, und vergleicht sie mit `CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID` aus der aktuellen Shell. Zusätzlich same-tool-Fallback wie `cmd_refresh`.

### Mishap 2: Pre-Check in Step 3.3 verschieben

- Die Pre-Check-Invariante [T002422] wandert von Step 3.5 nach Step 3.3 (vor der Masterplan-Präsentation).
- Step 3.4 erhält eine "LOCK-KONFLIKTE"-Sektion im Masterplan-Template.

### Mishap 3: Scope-Contamination-Guard

- `scripts/pr-scope-check.sh` vergleicht den Diff eines Branches gegen `touched_files` aus dem Ticket und warnt bei Scope-Drift.
- Integration als optionaler Schritt in PR-Vorbereitung (git-workflow/opencode-git-workflow).

## Komponenten-Abgrenzung

| Komponente | Mishap | Dateien |
|------------|--------|---------|
| scripts/agent-lock.sh | M1 | `scripts/vda/ticket/_ticket-core.sh` |
| skills/ticket-ops | M2 | `.agents/skills/references/ticket-ops-procedures.md` |
| repo/chore/mishap-T002382 | M3 | `scripts/pr-scope-check.sh` (NEW) |
| test | M1/M2/M3 | `tests/spec/mishap-t002424.bats` (NEW) |

