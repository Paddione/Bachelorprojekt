## ADDED Requirements

### Requirement: Plan-QA Reachability Probe Uses Liveness, Not Readiness

`scripts/plan-qa-check.sh` SHALL determine whether the llm-proxy gateway is reachable by
probing its liveness endpoint `/livez`, and SHALL NOT use the readiness endpoint `/health` for
that decision.

Rationale: `/health` beantwortet die Frage „ist ein Prio-1-Backend geladen", nicht „läuft der
Proxy". Ein degradierter, aber laufender Proxy antwortet dort mit 503; zusammen mit `curl -f`
ergibt das die Meldung „not reachable" für einen Dienst, der antwortet. Dieselbe Verwechslung
wurde in `taskfiles/Taskfile.llm.yml` unter T002336 bereits korrigiert.

Der `-f`-Schalter bleibt erhalten: gegen `/livez` trennt er weiterhin „Prozess antwortet" von
„niemand da", ohne die Readiness eines einzelnen Backends einzubeziehen.

#### Scenario: A live but degraded proxy is not reported as unreachable

- **GIVEN** the llm-proxy answers `/livez` with 200 and `/health` with 503
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** it does not print "not reachable"
- **AND** it does not skip on the reachability check

#### Scenario: A stopped proxy is still reported as unreachable

- **GIVEN** no process listens on the gateway port
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** it reports the gateway as not reachable
- **AND** it exits 0, because the QA stage is advisory and must never break a planning run

#### Scenario: A blocked model surfaces as its own diagnosis

- **GIVEN** the proxy is live but the QA model is blocked by an exclusive_conflict
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** the reported reason is the gateway's HTTP status and response body
- **AND** the reason is not "not reachable"
