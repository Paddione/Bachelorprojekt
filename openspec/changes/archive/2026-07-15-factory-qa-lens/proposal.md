# Proposal: factory-qa-lens

## Why

Die Verify-Phase der Factory (`pipeline.js:460-575`) ist ein reines Diff-Review-Panel: die Lenses (bug/security/pattern/perf/agents-md) lesen den Diff, aber kein Agent führt den neuen Code je aus. Funktionale Regressionen, die nur zur Laufzeit sichtbar sind, passieren das Gate ungehindert; `dev-flow-e2e` existiert nur als manueller Post-Merge-Skill. Brainstorming-Entscheidung (2026-07-14, Spec `docs/superpowers/specs/2026-07-14-factory-qa-sandbox-design.md`): eine ausführende qa-Lens schließt diese Lücke pre-merge.

## What

- Neue Lens `qa` im `ALL_LENSES`-Routing (`pipeline.js:480-490`), aktiv **nur im Tier `full`**; Logik ausgelagert in ein neues Modul (z. B. `scripts/factory/qa-lens.mjs`), da `pipeline.js` eine sanktionierte S1-Ausnahme ist und schlank bleiben soll.
- Ablauf:
  1. `task test:changed` im Worktree, ausgeführt über den sandbox-runner (Change 1, T001813).
  2. Staging-Lock claimen (agent-lock.sh-Muster, neuer Scope `staging`), Feature-Branch pre-merge nach `workspace-staging` deployen (`ENV=staging`; LiveKit dort deaktiviert).
  3. Playwright-Smoke der betroffenen Routen gegen Staging (testet den neuen Code; Projektzuordnung nach dev-flow-e2e-Konventionen), danach read-only Regressions-Smoke gegen Live-Prod als Baseline.
  4. Lock im finally freigeben; Ergebnisse als `REVIEW_SCHEMA`-Findings (`pipeline.js:164`) → bestehender Coordinator + Blocking-Logik (high/critical blockiert).
- Degradation: Lock-Timeout oder fehlendes Staging ⇒ qa-Lens läuft nur test:changed und meldet ein `severity: medium`-Finding statt zu blockieren.
- SSOT-Update `openspec/specs/software-factory.md`: Verify-Panel-Requirement um qa-Lens, Staging-Lock und Degradationspfad erweitert.

_Abhängig von Change 1 (`factory-sandbox-runner`, T001813)._

_Ticket: T001814_
