# p6 — Verify: RED-Nachweis + Grün-Nachweis + Repo-Gates

## Ziel
`.agents/plans/fix-e2e-mentolder-nightly-11/verify.log` (neu): lückenloser Nachweis rot→grün für alle 11 Specs
plus Repo-Gates. Diese Partial ist die tests-Rolle des Manifests und enthält den STRUCT2-Failing-Test-Step.

## RED-Nachweis (vor p2/p3-Grün, belegt rot)
- `npx playwright test fa-21-billing` → `expected: FAIL` (3 rote Tests: T3 + 2× PR-A, Stand Nightly 04.11., Run 41815883961).
- `npx playwright test fa-16-booking -g "T6"` → `expected: FAIL` (400 statt 409, Stand Nightly 04.11.).
- p4/p5 brauchen keinen lokalen RED-Lauf: ihre Specs sind nightly-rot belegt und werden retiren/ausgenommen, nicht repariert.
- Ausgaben der RED-Läufe nach `verify.log` sichern (Kopf + Summary-Zeilen genügen).

## Grün-Nachweis (nach p2–p5)
- `npx playwright test fa-21-billing fa-16-booking fa-24-whiteboard` → 0 failed (T-axe skipped).
- `npx playwright test --project=smoke --list` → `mentolder-web-smoke` nicht aufgeführt.
- Ausgaben nach `verify.log` anhängen.

## Repo-Gates (letzter Task, im Worktree)
- `task test:changed` Exit 0.
- `task freshness:regenerate` + `task freshness:check` Exit 0 (`generated_artifacts: true`).
- `plan done $(date -u +%FT%TZ) plan-gestagt` in `phase-events.log` — danach STOPP, Übergabe an `dev-flow-execute`.
- Gate-Kontrolle außerhalb des Plans: nächste Nightly muss G-E2E01 heben (Eigentümer: CI-Watchdog, nicht dieser Plan).

## Randbedingungen
- NUR `verify.log` + `phase-events.log` schreiben. Keine Spec-/Config-Edits (das war p1–p5).
- Live-Schreib-Calls nur im Rahmen der etablierten Spec-Läufe (nightly-Muster, keine zusätzlichen Prod-Schreib-Calls).
