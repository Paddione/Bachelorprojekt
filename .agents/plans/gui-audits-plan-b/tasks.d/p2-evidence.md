# p2 — D4 + Belege (Tests-Rolle)

## Rotphase-Hinweis (Baseline zuerst)
Spec aus p1 vorab schreiben und laufen lassen:
`npx playwright test mentolder-web-smoke` — auftretende Violations sind
expected FAIL candidates: Triviales im p1-Rahmen fixen, alles andere per B3
(Folge-PR, kein Scope-Creep). Diese Datei trägt D4 + Läufe + Belege zusammen.

## `docs/agent-guide/gui-audit-evidence-b.md` (neu)
- **D4**: `react.mentolder.de` live-200 statt Redirect (Stand 2026-11-01,
  Beleg: curl-Titel + Asset-Hash im PR-Body) → reduzierte Suite bis zur
  #7051-Infra-Entscheidung; Eigner-Abstimmung 2026-11-01 (Option „Reduziert").
- Tabelle: Route × (Smoke, axe) + Befehl + Commit-Stand + Ergebnis.
- Verweis auf [#7051](https://github.com/Paddione/Bachelorprojekt/issues/7051)
  als Folge-Entscheidung (Redirect einrichten oder Manifest + Registry).
- Ein-Absatz-Rückverweis in `docs/agent-guide/gui-audit-evidence-a.md`
  (Staffel-A-Doc bleibt sonst ohne B-Verweis).

## Golden/Inventory-Hygiene (Lehre #7040/#7044)
Keine neuen Tasks/pytest-Dateien → voraussichtlich kein Refresh. Fail-closed:
`git status --short` auf Golden + Inventory; nur bei Diff regenerieren
(`task test:evals:update` / `task test:inventory`, Scopes `chore(test)` /
`chore(website)`) + committen.

## Gates
- D4-Absatz + 5-Routen-Tabelle vollständig (grün oder B3 mit Folge-Aktion).
- Golden/Inventory-Diff leer oder committet.
