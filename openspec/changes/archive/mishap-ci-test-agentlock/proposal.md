# Proposal: Mishap-Bundle — repo/ci, tasks/test, agent-lock (3 Einträge)

## Zweck
Behebung von 3 dokumentierten Frictions.

## Einträge

### M1: 6 of 8 open PRs haben CI-Failures oder Merge-Konflikte
**Typ:** degraded | **Datei:** `.github/workflows/quality-loop.yml`, `scripts/ci-pr-health.sh`
**Fix:** CI-Pr-Health-Skript robuster machen, Retry-Logik für Flaky-Tests.

### M2: `task test:all` im Worktree nicht ausführbar (vitest .bin fehlt)
**Typ:** process | **Datei:** `Taskfile.yml`, `scripts/worktree-create.sh`
**Fix:** `test:changed` JS-Gruppen überspringen lassen wenn vitest nicht auflösbar, mit sichtbarem Hinweis. Oder worktree-create.sh .bin-Verzeichnisse mitverlinken.

### M3: agent-lock.sh überschreitet 500-Zeilen S1-Limit (504 Zeilen)
**Typ:** drift | **Datei:** `scripts/agent-lock.sh`
**Fix:** Datei auf ≤500 Zeilen kürzen (Funktionen auslagern oder komprimieren).

## Scope
- 4 Dateien betroffen
- Keine neuen Abhängigkeiten
