# p4 — Website-Belege + Evidenz-Doc (Tests-Rolle)

## Rotphase-Hinweis (Baseline zuerst)
Vor p1–p3 den Ist-Stand messen: `npx playwright test a11y-axe --config
playwright.local.config.ts` (lokal) bzw. Nightly-Stand aus CI lesen —
auftretende Violations sind expected FAIL candidates: Triviales sofort im
zugehörigen Partial fixen, alles andere per B3 in den PR-Body (kein
Scope-Creep). Diese Datei trägt die Läufe + Belege zusammen; sie ändert
keinen Produktionscode.

## Website-Belegläufe (B2: live, öffentlich, kein Auth)
1. `WEBSITE_URL=https://web.mentolder.de npx playwright test a11y-axe
   --config tests/e2e/playwright.config.ts` (oder Nightly-Alias) → 0
   critical/serious je Route.
2. Website-Projekt-Suite (Smoke-Anteil) grün — Scope: exakt das, was
   `test:changed` bei Website-Touch ohnehin fährt; kein Volllauf-Zwang.
3. Lighthouse (öffentliche Kernrouten, `lighthouserc.json`-Assertions):
   Performance ≥ 90, Accessibility ≥ 90 — per `lhci`/Lighthouse-CLI lokal
   gegen live (read-only). CI-Job ist advisory; der lokale Lauf ist der Beleg.

## Evidenz-Doc `docs/agent-guide/gui-audit-evidence-a.md` (neu)
Tabelle je Frontend (website, sdlc, brett, docs): Suite + Befehl + Commit-Stand
+ Ergebnis (grün/Befund) + Beleg-Ort (PR-Body-Auszug / CI-Run-URL). Vorbild:
`docs/agent-board/messung.md` (agent-board-Goal). Keine Screenshots ins Repo
(Screenshots → PR-Body-Anhang, Repo bleibt schlank).

## Golden/Inventory-Hygiene (Lehre #7040)
Keine neuen Tasks, keine pytest-Dateien → voraussichtlich KEIN Refresh nötig.
Trotzdem fail-closed prüfen: `task test:evals:update --dry-run`? Gibt es nicht —
stattdessen nach allen Partials `git status --short` auf
`tests/evals/golden/task-list-all.txt` + `test-inventory.json` prüfen und nur
bei Diff regenerieren + committen (Scopes: `chore(test)`/`chore(website)`).

## Gates
- Alle vier Evidenz-Zeilen vorhanden (grün oder B3-Befund mit Folge-Aktion).
- `git diff --exit-code` auf Golden/Inventory ist leer oder committet.
