# backup-pipeline — Delta (pvc-backup-escaping-T014535)

## ADDED Requirements

### Requirement: Render-sichere Runtime-Variablen im PVC-Backup-Skript

The PVC backup CronJob SHALL escape runtime variables in the generated
mounter Job so that BOTH render paths — the Flux artifact renderer
(`scripts/flux-render-artifact.sh`) and the push-based Taskfile path
(`task workspace:deploy`) — leave them untouched, and the resulting
mounter script SHALL pass `bash -n` after heredoc expansion.

Runtime variables in the mounter script (values the mounter pod sets
itself, e.g. `STAMP`, `BACKUP_DIR`, `SRC`, `OUT`, `LABEL`, `FAILED`,
`FILEN_*`, `RETENTION`) SHALL be written as `\$${VAR}` so the renderer's
`$${VAR}` runtime-marker filter protects them and the backslash quotes
them against heredoc expansion in the orchestrator pod. Command and
arithmetic substitutions SHALL be written as `\$$(...)` and
`\$$((...))` respectively. Orchestrator-side variables that must expand
during heredoc expansion (e.g. `MOUNTER`, `VW_AFFINITY`, `VW_CLAIM`)
SHALL be written as `$${VAR}`.

The Taskfile push-path unwrap regex SHALL unwrap `$$(` so the
`\$$(...)` escaping stays valid on the push/dev path (parity with the
Flux renderer unwrap, T012503).

#### Scenario: Flux render produces a syntactically valid mounter script

- **GIVEN** the workspace overlay is rendered with the Flux renderer logic
  (dynamic var extraction, `$${VAR}` runtime filter, `$$` unwrap)
- **WHEN** the rendered orchestrator script's MJOB heredoc is expanded
  with orchestrator-side variables set
- **THEN** the resulting mounter script passes `bash -n`
- **AND** no `\ `-style empty substitution remnants (e.g. from `LABEL`,
  `OUT`, `FAILED`) are present in the mounter script

#### Scenario: Mounter runtime variables survive the render untouched

- **GIVEN** the render pipeline from the previous scenario
- **WHEN** the rendered mounter script is inspected
- **THEN** runtime references such as `${STAMP}`, `${BACKUP_DIR}`,
  `${SRC}` are present verbatim (not substituted empty)

#### Scenario: Push-path unwrap handles command substitution escapes

- **GIVEN** the unwrap sed rule declared in `Taskfile.yml` for the
  `workspace:deploy` pipeline
- **WHEN** the rule is applied to a string containing `$$(date +%s)`
- **THEN** the output contains `$(date +%s)` (single dollar)
