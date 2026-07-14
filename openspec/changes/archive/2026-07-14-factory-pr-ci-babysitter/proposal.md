# Proposal: factory-pr-ci-babysitter

_Ticket: T001805 · Design-Spec: docs/superpowers/specs/2026-07-14-factory-pr-ci-babysitter-design.md_

## Why

Die Factory hat einen CI-Fix-Loop nur für den **eigenen, gerade laufenden** PR
(`pipeline.js` Deploy-Phase: two-gated Self-Healing, ≤2 Retries). Sobald ein Run endet oder
ein PR aus anderer Quelle stammt (dev-flow, Renovate, manuell), bleibt rote CI liegen:
Der Dispatcher kennt nur die Ticket-Queue als Work-Source, Watchdog und Wakeup-Reconcile
fragen den PR-CI-Status nie ab. Aktuell hängen z. B. approved PRs mit ungelösten Checks offen,
bis jemand manuell eingreift.

## What

- **Neues Script `scripts/factory/babysit-prs.sh`** — ticket-loser Babysitter-Step:
  scannt offene PRs (`gh pr list --json … statusCheckRollup`), wählt **genau einen**
  Kandidaten pro Tick (D3) und wendet den bestehenden two-gated Fix-Mechanismus an —
  wiederverwendet über `build_loop_decide` aus `scripts/factory/build-loop.sh` (D5, keine
  Logik-Duplikate).
- **Filter/Guards:** Kill-Switch, Dry-Run; kein Draft, kein `ci-babysitter-gave-up`-Label,
  Renovate nur mit `FACTORY_BABYSIT_RENOVATE=true` (C4), `CONFLICTING` → einmalig Notify +
  Label, nie fixen (D7), Dedup gegen aktive Runs via agent-lock-Claim + `in_progress`-Ticket
  (D4).
- **Retry-State am PR** (D1/D2): Kommentar-Marker `<!-- ci-babysitter attempt=N -->`,
  max. 2 Versuche, danach Label `ci-babysitter-gave-up` + Notify — kein Ticket, kein Slot.
- **Hybrid-Fix:** Klasse `freshness` deterministisch im Script (Temp-Worktree,
  `task freshness:regenerate`); Klassen `ci|test|lint` via eng gescopetem Agent-Dispatch
  (`${CLAUDE_BIN} -p`, analog Wakeup-Dispatcher-Muster).
- **Einhängung in `scripts/factory/wakeup.sh`** als best-effort-Step (repo-weit einmal pro
  Tick, außerhalb der Brand-Schleife, D8).
- **BATS-Tests** in `tests/spec/software-factory.bats` (gh-Stub-Muster) für Filter-,
  Marker- und Abbruchpfade; neues Requirement als Delta zur SSOT
  `openspec/specs/software-factory.md`.

**Abgrenzung:** Der Babysitter merged nie, rebased nie und fasst Escalate-Pfade
(Secrets/Realm/SQL/Manifeste) nie an — Gate 2 bleibt hart. Er ersetzt nicht den
pipeline-eigenen Fix-Loop, sondern deckt die Zeit **nach** bzw. **außerhalb** eines Runs ab.
