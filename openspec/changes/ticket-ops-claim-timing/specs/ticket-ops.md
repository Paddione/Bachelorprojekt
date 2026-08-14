# ticket-ops Delta — Ticket-Ops-Claim-Timing

## ADDED Requirements

### Requirement: Claim-Timing in Step 3.6 ist dokumentiert

The ticket-ops procedures SHALL document that the branch-scoped agent-lock claim for a
dispatch happens only AFTER the dev-flow-plan proposal phase (Phase A) which runs in the
main checkout. For unplanned tickets the documented sequence SHALL be: proposal phase in
the main checkout without any branch lock, then branch claim plus worktree creation
(Phase B), then the plan/execute dispatch inside the worktree. The SKILL.md invariant
section SHALL reference this timing rule.

#### Scenario: Unplanned ticket dispatch sequence is unambiguous

- **GIVEN** ein `ai_ready`-Ticket ohne Plan, das durch dev-flow-plan muss
- **WHEN** ein Agent die Prozedur Step 3.6 liest
- **THEN** die Prozedur benennt Phase A (Haupt-Checkout, ohne Branch-Lock) als Schritt VOR dem Claim; der Claim steht nach der Proposal-Phase

#### Scenario: SKILL.md trägt den Timing-Verweis

- **GIVEN** ein Agent liest nur die ticket-ops SKILL.md (nicht die Referenz)
- **WHEN** die Invarianten-Sektion geprüft wird
- **THEN** sie verweist auf die Claim-Timing-Regel (Claim erst nach Phase A) in procedures Step 3.6
