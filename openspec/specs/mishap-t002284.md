# mishap-t002284

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-t002284 ergänzen._

## Requirements

### Requirement: ticket get JSON projects resolution, severity, and description

`scripts/vda/ticket/get.sh` SHALL include `resolution`, `severity`, and `description` in the
`json_build_object(...)` projection of its `main` output, so that a caller checking terminal
ticket state (e.g. the `resolution=shipped|fixed` convention from T001092) sees the actual
database value instead of a field silently omitted from the JSON.

#### Scenario: A ticket with a set resolution

- **GIVEN** a ticket row in `tickets.tickets` with `resolution = 'shipped'`
- **WHEN** `./scripts/vda.sh ticket get --id <id>` runs
- **THEN** the returned JSON contains `"resolution": "shipped"`, not `"resolution": null`

### Requirement: dev-flow-execute implementer prompt forbids nested delegation

The `dev-flow-execute` skill's Schritt 2 `**Auftrag:**` block — the text that is actually sent
to the spawned implementer subagent — SHALL contain an explicit, literal instruction that the
implementer must not itself spawn further subagents, and must instead call
`superpowers:executing-plans` in-context or escalate back to the orchestrator.

#### Scenario: An implementer subagent considers delegating a sub-task

- **GIVEN** the implementer subagent was dispatched with the Schritt 2 Auftrag prompt
- **WHEN** it considers spawning its own sub-implementer for part of the plan
- **THEN** the prompt it received already tells it not to, and to escalate to the orchestrator instead

### Requirement: pre-commit warns on a neutralized staged freshness file

`.githooks/pre-commit` SHALL, after its `_FRESHNESS_FILES` auto-regenerate/auto-stage block,
detect when a file that was already staged (relative to `HEAD`) before the hook ran ends up
with no staged diff against `HEAD` afterwards, and SHALL print a visible warning to stderr in
that case. This check SHALL NOT block the commit (warn only).

#### Scenario: Regeneration reproduces the HEAD state of an already-staged file

- **GIVEN** `website/src/data/openspec-status.json` is staged with real content changes vs `HEAD`
- **WHEN** the pre-commit hook's `task freshness:regenerate` step regenerates that file back to
  a state identical to `HEAD`, and the auto-stage loop re-stages that identical content
- **THEN** the hook prints a warning that the staged change to that file was neutralized by
  regeneration, and does not exit non-zero because of it

<!-- merged from change delta mishap-t002284.md (6c122e984e4e) -->