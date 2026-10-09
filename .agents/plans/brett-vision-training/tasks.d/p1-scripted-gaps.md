# Partial p1 — scripted-gaps (T901676, impl)

Scripted Lückenschluss: `tests/e2e/specs/brett-replay.spec.ts` neu,
`tests/e2e/specs/fa-24-whiteboard.spec.ts` funktional erweitern,
Brett-Audit mit Erweiterung bestehender Specs, danach
`task test:inventory` für
`components/website/src/data/test-inventory.json`.

Budgets: `tests/e2e/specs/fa-24-whiteboard.spec.ts` Ist 18,
nicht-baselined, `.ts`-Limit 900 aus `docs/code-quality/gates.yaml`
→ Budget 882. Neue Replay-Spec: volles Limit 900, angepeilt unter
150 Zeilen. Audit-Edits an bestehenden `brett-*.spec.ts` nur nach
`bash scripts/plan-lint.sh residual_budget <datei>` mit positivem
Rest; `.json`-Inventar ist generiert (kein S1-Claim).

## Task 1: Replay-Spec RED anlegen

Steps:
1. `tests/e2e/specs/brett-replay.spec.ts` neu anlegen: liest
   `window.__brettFeatures['replay']`, assertet bei gesetztem Flag die
   Timeline-/Replay-UI (sichtbarer Marker, kein harter Selektor-Rat),
   sonst `test.skip`.
2. Strikte Erstfassung ohne Skip-Toleranz laufen lassen, Rotlauf als
   Nachweis sichern (siehe Verify).

Verify:
- `cd tests/e2e && BRETT_URL="$BRETT_URL" npx playwright test brett-replay` — expected: FAIL

## Task 2: Replay-Spec GREEN finalisieren

Steps:
1. Flag-sensitives Verhalten finalisieren: Skip-Pfad bei Flag aus,
   Assertions bei Flag an, keine Brand-Literale (nur `BRETT_URL`).
2. Grünlauf gegen erreichbares Env; bei unerreichbarem Env Lauf als
   Lücke notieren, nicht als Erfolg werten.

Verify:
- `cd tests/e2e && BRETT_URL="$BRETT_URL" npx playwright test brett-replay` (grün oder dokumentierte Lücke)

## Task 3: Whiteboard-Spec funktional erweitern

Steps:
1. `tests/e2e/specs/fa-24-whiteboard.spec.ts` um funktionale Checks
   erweitern: kein Auth-Konfigurationsfehler-Text, HTTP-Status unter
   500, App-Shell-Marker vorhanden. Basis nur aus `BOARD_URL`.
2. Budget einhalten (siehe Kopf): Erweiterung bleibt deutlich unter
   Restbudget 882, kein Split nötig.

Verify:
- `cd tests/e2e && BOARD_URL="$BOARD_URL" npx playwright test fa-24-whiteboard`

## Task 4: Brett-Audit und Spec-Erweiterung

Steps:
1. Audit lesen: `components/brett/README.md` (Flags), alle
   `tests/e2e/specs/brett-*.spec.ts`, Server-Routen in
   `components/brett/src/server/index.ts`. Lückenliste als
   Commit-Message-Anhang festhalten (keine neue Datei).
2. Jede Lücke in die passendste bestehende `brett-*.spec.ts` einbauen;
   neue Spec-Datei verboten. Vor jedem Edit
   `bash scripts/plan-lint.sh residual_budget <datei>` prüfen.
3. Auswahl-Lauf der geänderten Specs grün.

Verify:
- `cd tests/e2e && BRETT_URL="$BRETT_URL" npx playwright test brett-` (Auswahl grün)

## Task 5: Test-Inventar regenerieren

Steps:
1. `task test:inventory` aus Repo-Root laufen lassen.
2. `components/website/src/data/test-inventory.json` ins Staged-Set
   aufnehmen (Staged-Set-Ausnahme für genau diese Datei).

Verify:
- `git -C "$WT" status --short components/website/src/data/test-inventory.json`
