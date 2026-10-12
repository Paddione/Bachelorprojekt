---
title: p9 Tests erweitern und Inventar pflegen
ticket_id: T901792
role: tests
---

# p9 — Tests (Batch-Rolle)

Ziel: die portierte Spec um die Batch-Luecken erweitern, rot-gruen
belegen, Test-Inventar regenerieren. Haengt an p1–p8. Budget der
Spec-Datei: Ist 713, Restbudget 87 — die Erweiterung muss in 87 Zeilen
passen oder die Datei an anderer Stelle kuerzen.

## File Structure

- `tests/py/spec/native_ported/spec/test_neovim_dashboard.py` (Ist 713, Budget 87)
- `components/website/src/data/test-inventory.json` (S1 n/a, generiert)

## Task 1 — Rot: neue Faelle schreiben

Faelle im Stil der Datei (headless Proben, kein Source-Grep ausser
Negativ-Guards) ergaenzen:

- Editor meldet gopls und SQL-Server in checkhealth ohne error-Wort.
- SDLC-Seite listet plan-review-render.
- Repo-Knowledge ruft das echte CLI auf (Probe gegen
  `codebase-memory-mcp cli`, Skip wenn Binary fehlt).
- AI-Agents Auswahlkontext schreibt eine Kontextdatei ausserhalb des Repos.
- JS-Frontend Oracle-Fallback ist dokumentiert (Runbook-Schritt existiert).

Rotlauf (erwartetes Ergebnis: FAIL, weil p2/p4/p6–p8 noch offen sind):

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_neovim_dashboard.py -k "gopls or plan_review or cli_form or selection_context or oracle_fallback"
```

expected: FAIL — die neuen Faelle scheitern, bis ihre Partials landen.

## Task 2 — Gruen: nach den Partials wiederholen

Denselben pytest-Befehl nach p1–p8 wiederholen. Erwartung: alle Faelle
gruen. Danach die ganze Datei einmal vollstaendig laufen lassen.

## Task 3 — Inventar regenerieren

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
```

## Task 4 — Abschluss

- Commit: `feat(T901792): batch-tests erweitert`.
