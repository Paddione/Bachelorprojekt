## MODIFIED Requirements

### Requirement: dsh is a selectable factory executor

`scripts/factory/dispatcher-bridge.sh` SHALL accept `FACTORY_EXECUTOR=dsh` and dispatch to
`scripts/factory/dsh-exec.sh`, keeping the existing `[pipeline:<ext_id>]` output prefix and the
backgrounding that the outer `wait` joins. An unknown executor value SHALL fall back to
`opencode` with a warning (fail-closed auf den neuen Default statt still zurück auf den
Legacy-Executor; ersetzt das bisherige `claude`-Fallback aus REQ-SF-EXECUTOR-001 alt).

Der `dsh`-Zweig selbst (Auswahl von `dsh-exec.sh`, kein Warning, Exit-Codes 2/6/7/8, kein
Fallback bei `dsh`-Fehlern) SHALL unverändert bleiben.

#### Scenario: the dispatcher accepts dsh

- **GIVEN** `FACTORY_EXECUTOR=dsh`
- **WHEN** the executor branch of `dispatcher-bridge.sh` is evaluated
- **THEN** it selects `dsh-exec.sh` and emits no unknown-executor warning

#### Scenario: an unknown executor falls back to opencode (fail-closed)

- **GIVEN** `FACTORY_EXECUTOR=nonsense`
- **WHEN** the same branch is evaluated
- **THEN** it warns and selects the opencode path, unchanged by the addition of dsh
