# ticket-ops

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu ticket-ops ergänzen._

## Requirements

### Requirement: Prosa-Blocker-Erkennung in Phase 1
Die Completeness Triage MUSS Ticket-Beschreibungen auf Schlüsselwörter wie
"BLOCKIERT VON", "hängt an" scannen und gefundene Referenzen in `depends_on`
überführen. Bereits gemergte PRs werden als aufgelöster Blocker erkannt.

#### Scenario: Prosa-Blocker wird in depends_on überführt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234"
- **WHEN** die Completeness Triage läuft
- **THEN** die PR-Referenz wird in `depends_on` überführt

#### Scenario: Bereits gemergter PR wird als aufgelöst erkannt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234" und PR #1234 ist gemergt
- **WHEN** die Completeness Triage läuft
- **THEN** der Blocker wird als aufgelöst markiert und das DoR-Flag `abhaengigkeiten_klar` auf true gesetzt

<!-- merged from change delta ticket-ops.md (7053ad1339bb) -->

### Requirement: Step-1.1-Triage-Query dokumentiert den korrekten jq-Parse-Schritt

Die Prozedur in ticket-ops-procedures.md §Step 1.1 MUSS den jq-Ausdruck dokumentieren,
der das tatsächliche mcp-postgres-Ausgabeformat `[{"result":"<json-string>"}]` korrekt
verarbeitet. Der dokumentierte Ausdruck ist `jq -r '.[0].result'`, nicht
`jq -r '.result[]'`.

Der zweite Parse-Schritt (die Ausgabe von `jq -r '.[0].result'` ist ein JSON-String, der
erneut geparst werden muss) MUSS explizit benannt sein.

#### Scenario: Dokumentierter jq-Ausdruck matcht das mcp-postgres-Format

- **GIVEN** die ticket-ops-procedures.md §Step 1.1
- **WHEN** ein Agent die dokumentierte jq-Anweisung befolgt
- **THEN** der Ausdruck verarbeitet das Format `[{"result":"<json-string>"}]` ohne Fehler

<!-- merged from change delta ticket-ops.md (4690b95f6132) -->

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

<!-- merged from change delta ticket-ops.md (5fa0ed3856ae) -->