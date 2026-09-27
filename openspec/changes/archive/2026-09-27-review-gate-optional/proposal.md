# Proposal: review-gate-optional

## Why

`dev-flow-execute` Schritt 3.8 macht ein Code-Review zur Pflicht vor dem Auto-Merge und bricht bei bereits aktivem Auto-Merge fail-closed ab. In der Praxis greift das nicht: Der CI-Workflow „Enable Auto-Merge" schaltet Auto-Merge nach jedem grünen Push wieder ein. Bei T900655 (PR #6062) hatte der Orchestrator Auto-Merge für das Review abgeschaltet, nach dem Fix-Push war es wieder aktiv, und der PR mergte vor dem dritten Review. Der Nutzer hat am 2026-09-27 entschieden: Grüne CI reicht zum Merge. Ein Review läuft nur, wenn der Operator es in der Session ausdrücklich verlangt.

## What

- Schritt 3.8 wird zum Merge-Gate: `check-pr-automerge.sh --branch` bleibt als Zustandsabfrage, rc=1 (Auto-Merge aktiv) ist kein Abbruch mehr, Auto-Merge wird nie deaktiviert. Phase-Chain-Assert (fail-closed) und `gh pr merge --auto --squash` bleiben.
- Code-Review ist optional und läuft nur auf ausdrücklichen Zuruf des Operators. Findings, die nach dem Merge ankommen, gehen als Folge-Ticket und Folge-PR raus.
- Folgetexte angleichen: Implementer-Handoff, Lifecycle-Vertrag, OVERVIEW (Verifikations-Leiter), Querverweise in SKILL.md.
- Spec-Delta auf `agent-skills`: Requirement „erkennt extern aktivierten Auto-Merge" und Finalizer-Requirement umformulieren.
- BATS anpassen: `review-gate-before-auto-merge.bats`, `automerge-preflight-check.bats`, `dev-flow-lifecycle-contract.bats`.

Nicht enthalten: `scripts/check-pr-automerge.sh` (Verhalten unverändert), Pre-Flight 1.4.7 (Doppel-Execution-Check bleibt), der CI-Workflow „Enable Auto-Merge".

_Design-Spec: `design.md`. Ticket: T900687_
