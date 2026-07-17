---
ticket: T001841
health_goal: G-CI03
---

# Tasks: G-CI03 CI Pipeline p95 Duration

## Task 1: CI-Dauer-Logging in health-goals-check.sh

**Datei:** `scripts/health-goals-check.sh`

Neuer Block für CI-Dauer-Messung:
- `gh run list --branch main --limit 20 --json databaseId,conclusion,updatedAt` (oder `workflowRunTiming`)
- Dauer berechnen via `gh run view <id> --json databaseId,createdAt,updatedAt`
- p95 berechnen: Sortiere Dauern, nehme Wert an Position ceil(0.95 * n)
- Ergebnis in `.claude/lib/goals.md` bei G-CI03 eintragen

**Verify:**
1. `bash scripts/health-goals-check.sh --only=G-CI03` zeigt Messwert
2. Wert ist numerisch (Sekunden oder Minuten)

## Task 2: Zieldaten in goals.md pflegen

**Datei:** `.claude/lib/goals.md`

G-CI03 Eintrag aktualisieren:
- Current Value: p95 der letzten 20 Runs
- Target: ≤ 12 min
- Measurement: `gh run list` + Dauer-Berechnung

**Verify:**
1. `grep -A5 'G-CI03' .claude/lib/goals.md` zeigt korrekten Eintrag

## Task 3: Erste Baseline erfassen

**Aktion:** `bash scripts/health-goals-check.sh --only=G-CI03` ausführen und Ergebnis dokumentieren.

**Verify:**
1. Ausgabe zeigt p95-Wert (oder "insufficient data" wenn <20 Runs)
2. goals.md ist aktuell
