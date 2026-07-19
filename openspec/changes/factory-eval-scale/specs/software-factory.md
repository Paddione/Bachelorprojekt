## ADDED Requirements

### Requirement: Semi-automatic eval fixture generator

The system SHALL provide a semi-automatic fixture generator, invoked as
`task factory:eval:gen -- <TICKET_EXT_ID>`, that produces a curatable golden-fixture
proposal for a merged Software-Factory ticket without overwriting any existing fixture.
The generator SHALL source the ticket record from `scripts/ticket.sh get --id <ext_id>`,
resolve the linked pull request via the `tickets.ticket_links` record (`kind='pr'`,
`pr_number IS NOT NULL`), derive the changed-file list from `gh pr diff <pr> --name-only`,
and record the pull request's merge-base as `base_commit`. Threshold, `forbidden`, and
`tests` fields SHALL be emitted as an editable skeleton for human curation, never as an
authoritative final value.

#### Scenario: Generator emits a curatable fixture proposal

- **GIVEN** a merged Software-Factory ticket `T000725` with a linked PR in `tickets.ticket_links`
- **WHEN** an operator runs `task factory:eval:gen -- T000725`
- **THEN** a fixture directory `tests/factory-eval/fixtures/T000725/` is created containing
  `ticket.json` (title/type/brand/external_id from the DB record), an `expected.json`
  skeleton whose `files` come from `gh pr diff --name-only`, and a `meta.json` carrying
  `base_commit`, `pr_number`, `generated_at`, and `source: "eval-gen"`

#### Scenario: Generator never overwrites an existing fixture

- **GIVEN** an existing fixture directory `tests/factory-eval/fixtures/T000726/`
- **WHEN** an operator runs `task factory:eval:gen -- T000726`
- **THEN** the generator refuses to overwrite the existing fixture and exits non-zero
  with a message naming the existing path

### Requirement: Eval fixture meta.json with base_commit

The eval fixture schema SHALL support an optional `meta.json` file
(`{ base_commit, pr_number, generated_at, source }`) alongside the existing
`ticket.json` and `expected.json`. Fixtures without `meta.json` SHALL remain valid and
scoreable exactly as before, with the scorer falling back to the current `HEAD` when no
`base_commit` is recorded.

#### Scenario: Existing meta-less fixtures stay valid

- **GIVEN** the three pre-existing fixtures `T000725`, `T000726`, `T000925` with no `meta.json`
- **WHEN** `node scripts/factory/eval.mjs` runs without flags
- **THEN** all three fixtures are scored using the existing live-diff behaviour and no error
  is raised for the missing `meta.json`

### Requirement: Eval replay mode against the current agent setup

The eval harness SHALL provide a `--replay` mode
(`node scripts/factory/eval.mjs --replay [--fixture <id>] [--dry-run]`) that, per fixture,
creates an ephemeral git worktree at the fixture's `meta.base_commit` using the
git-crypt-safe worktree semantics of `scripts/worktree-create.sh`, invokes the existing
Factory implement machinery, scores the resulting `git diff --name-only`, and tears the
worktree down afterwards. The default invocation without `--replay` SHALL remain byte-for-byte
behaviourally unchanged (live-diff scoring). Each scorecard entry SHALL record `mode`
(`"replay"` or `"live"`) and `base_commit`.

#### Scenario: Replay dry-run builds and tears down a worktree without an LLM call

- **GIVEN** a fixture with a valid `meta.base_commit`
- **WHEN** an operator runs `node scripts/factory/eval.mjs --replay --fixture <id> --dry-run`
- **THEN** an ephemeral worktree is created at `base_commit` and removed again, no LLM/implement
  invocation is made, and the scorecard entry records `mode: "replay"` and the fixture's
  `base_commit`

#### Scenario: Default mode is unchanged

- **GIVEN** the eval harness with replay support present
- **WHEN** `node scripts/factory/eval.mjs` runs without `--replay`
- **THEN** it scores the live git diff exactly as before and every scorecard entry records
  `mode: "live"`

### Requirement: Eval score persistence via phase-event detail

When the Factory verify phase runs on a ticket for which a golden fixture exists, the
pipeline SHALL embed a compact JSON eval-context string into the `detail` column of the
`tickets.factory_phase_events` verify event. The `detail` column is `TEXT`; the score
SHALL be stored as an embedded JSON string with no schema migration. The eval-context
computation SHALL live in a pure helper module rather than inline in `pipeline.js`.

#### Scenario: Verify event carries eval context when a fixture exists

- **GIVEN** a ticket `T000726` that has a matching fixture under `tests/factory-eval/fixtures/`
- **WHEN** the Factory pipeline records its verify phase event
- **THEN** the `detail` of the `verify` `factory_phase_events` row contains a compact JSON
  eval-context string and no new database column or migration is introduced

#### Scenario: CI advisory warning on agent-setup changes

- **GIVEN** a pull request that modifies an agent-setup path (`.opencode/agent-models.jsonc`,
  `scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js`, or `AGENTS.md`)
- **WHEN** the CI Factory job runs
- **THEN** the job emits a `::warning::` advising a local `task factory:eval:replay`, and a
  pull request that touches none of those paths emits no such warning
