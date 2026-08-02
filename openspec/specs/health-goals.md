# health-goals

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu health-goals ergänzen._

## Requirements

### Requirement: REQ-HEALTH-GOALS-001 — Single Source of Truth in goals.md

`.claude/lib/goals.md` SHALL be the sole authored source of truth for repository health goals. Every
consumer of goal data — the website dashboard (Homepage `#health` section, `/admin/repohealth`) and the
brain wiki — SHALL derive its content from `.claude/lib/goals.md`, either directly (brain ingest) or via
a generated artifact (website), never from a second hand-maintained copy of goal definitions.

#### Scenario: The website never hand-maintains a duplicate goal list

- **GIVEN** `website/src/lib/goals-data.ts`
- **WHEN** its source is inspected
- **THEN** it imports goal data from a generated JSON artifact rather than declaring goal entries as a
  literal in-source array

### Requirement: REQ-HEALTH-GOALS-002 — Generated Website Artifact

A generator script (`scripts/gen-goals-data.mjs`) SHALL parse `.claude/lib/goals.md` and emit
`website/src/lib/goals-data.generated.json`, an array of objects matching the `HealthGoal` TypeScript
interface (`id`, `title`, `category`, `priority`, `direction`, `baseline`, `current`, `target`, `unit`,
`status`, `measurement`, `source`, `measured_at`, optional `note`). The generator SHALL parse both goal
representations present in `goals.md`: individual `## G-<id> — <title>` sections carrying a
`**<priority> · Baseline:** … · **Target:** …` meta blockquote line (Priority A/B), and Markdown table
rows in the Green-Gates section (Priority C). Every emitted entry's `source` field SHALL read
`.claude/lib/goals.md · <id>`.

#### Scenario: An H2-section goal is parsed into the HealthGoal shape

- **GIVEN** a `## G-<id> — <title>` section in `.claude/lib/goals.md` with a well-formed meta
  blockquote line
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that `id`, correctly parsed `baseline`, `current`,
  and `target` numbers, and a `source` of `.claude/lib/goals.md · <id>`

#### Scenario: A Green-Gates table row is parsed into the HealthGoal shape

- **GIVEN** a Markdown table row in the Priority-C Green-Gates section of `.claude/lib/goals.md`
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that row's `id`, `priority: "C"`, and a `null`
  `baseline` (the table has no baseline column)

### Requirement: REQ-HEALTH-GOALS-003 — Freshness Gate

`website/src/lib/goals-data.generated.json` SHALL be a freshness-gated generated artifact: a
`health:goals:emit` Taskfile target SHALL run the generator, `task freshness:regenerate` SHALL include
that target, and `task freshness:check` SHALL fail if the committed
`website/src/lib/goals-data.generated.json` differs from a fresh regeneration.

#### Scenario: A stale generated goals JSON fails freshness:check

- **GIVEN** `.claude/lib/goals.md` was edited but `website/src/lib/goals-data.generated.json` was not
  regenerated and committed
- **WHEN** `task freshness:check` runs
- **THEN** it fails and names `website/src/lib/goals-data.generated.json` as stale

### Requirement: REQ-HEALTH-GOALS-004 — Fail-Loud Parsing

`scripts/gen-goals-data.mjs` SHALL exit non-zero and name the offending goal ID on stderr when it
encounters a structurally broken entry: a `## G-<id> — …` heading with no following meta blockquote
line before the next heading, a meta blockquote line whose `Baseline:` or `Target:` field contains no
digits and is not the literal token `n/a`, or a Green-Gates table row whose ID column does not match
`G-[A-Z0-9-]+`. Free-text baseline/target annotations that still contain extractable numbers (e.g.
`"3 (dev-flow-execute 662, infra-ops 595, …) → 1 (dev-flow-plan 508)"`) SHALL be tolerated via
first-number/last-number extraction rather than rejected.

#### Scenario: A goal section missing its meta-line fails the generator

- **GIVEN** a `## G-<id> — …` heading under a Priority A/B section with no meta blockquote line before
  the next heading
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits non-zero
- **AND** its stderr output names the offending `<id>`

#### Scenario: A messy but numeric baseline annotation is tolerated

- **GIVEN** a meta blockquote line whose `Baseline:` field is free text containing at least one number
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits `0` and extracts the first number found as the `baseline` value

<!-- merged from change delta health-goals.md (a840a7f1cb8b) -->

### Requirement: Maximum file size cap for VideoVault

The system SHALL enforce that VideoVault source files outside gate scope do not exceed 600 lines for more than 8 files.

#### Scenario: Verify VideoVault file size limit

- **GIVEN** the VideoVault codebase and tests/spec/g-size02-large-files.bats
- **WHEN** BATS runs the file size verification test
- **THEN** the number of files exceeding 600 lines MUST be less than or equal to 8.

<!-- merged from change delta health-goals.md (818aa74cfa1d) -->

### Requirement: G-OPS01-STATIC-001 — Brand-Secrets-Dateien enthalten alle vom Deployment referenzierten workspace-secrets-Keys

Jeder `secretKeyRef.key` mit `name: workspace-secrets`, der in einem `k3d/*.yaml`
Deployment referenziert wird, muss in der plaintext-Secrets-Datei JEDES Brands
vorhanden sein, für das dieses Deployment ausgerollt wird (nicht nur im Brand,
in dem der Key ursprünglich angelegt wurde).

#### Scenario: oauth2-proxy-terminal erfordert POCKET_ID_TERMINAL_SECRET in beiden Brands
GIVEN `k3d/oauth2-proxy-terminal.yaml` referenziert `POCKET_ID_TERMINAL_SECRET`
  über `secretKeyRef` gegen `workspace-secrets`
WHEN `environments/.secrets/korczewski.yaml` und
  `environments/.secrets/fleet-korczewski.yaml` gelesen werden
THEN enthalten beide Dateien den Key `POCKET_ID_TERMINAL_SECRET`

### Requirement: G-OPS01-STATIC-002 — Deployments mit ReadWriteOnce-PVC-Mount nutzen keine RollingUpdate-Strategie

Jedes in `k3d/` getrackte Deployment, das ein `PersistentVolumeClaim`-Volume
mountet, deklariert `spec.strategy.type: Recreate`, damit ein Rollout nicht
versucht, einen zweiten Pod auf einem anderen Node zu starten, während der alte
Pod die ReadWriteOnce-PVC noch hält (das führt zu endlosem `ContainerCreating`
des neuen Pods).

#### Scenario: livekit-egress ist als Kustomize-Manifest getrackt und nutzt Recreate
GIVEN `k3d/livekit-egress.yaml` existiert und ist als Resource in
  `k3d/kustomization.yaml` registriert
WHEN das Deployment `livekit-egress` daraus geparst wird
THEN ist `spec.strategy.type` gleich `Recreate`

<!-- merged from change delta health-goals.md (54f97d6a4e04) -->

### Requirement: G-DB09 measurement SHALL exclude one-time CREATE INDEX DDL statements from the slow-query count

The G-DB09 measurement query in `scripts/health-goals-check.sh` SHALL exclude `pg_stat_statements`
rows whose `query` text begins with `CREATE INDEX` (`query NOT ILIKE 'CREATE INDEX%'`), in addition
to the existing `COPY %` backup exclusion (T001926), because DDL maintenance statements — such as
one-time vector-index builds (`CREATE INDEX ... USING hnsw`) — are not repeated application queries
and their execution time is not a signal of application query performance.

#### Scenario: a one-time CREATE INDEX DDL statement with mean_exec_time > 1s is not counted as a "slow query"

- **GIVEN** `pg_stat_statements` contains a row for `CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops)` with `calls = 1` and `mean_exec_time > 1000`
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is excluded from the reported slow-query count

#### Scenario: a repeated application SELECT/DML statement with mean_exec_time > 1s is still counted

- **GIVEN** `pg_stat_statements` contains a row for an application `SELECT`/`INSERT`/`UPDATE`/`DELETE` statement with `mean_exec_time > 1000` and it is neither a `COPY` backup statement nor a `CREATE INDEX` DDL statement
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is still included in the reported slow-query count (the exclusion is narrowly scoped, not a broad DDL blocklist)

<!-- merged from change delta health-goals.md (2a82551a34a2) -->

### Requirement: REQ-HEALTH-GOALS-005 — Format-preserving cell-parser whitelist

`scripts/health-goals-update.sh` SHALL recognise, in addition to the bare-integer cell format
(`bare_int_re`), a whitelist of structured "Aktuell"-cell formats in the Priority-C Green-Gates table
and rewrite each in place while preserving its surrounding format — only the measured number is
replaced, the unit/prefix/suffix is retained, and the `✓`/`⚠` marker continues to be derived from the
existing `le`/`ge`/`eq` comparison. The whitelist SHALL cover: percent (`95 %`), exit-code (`Exit 0`),
unit-suffixed values (`22 h`, `6 Tage`, `~3587 Tage` — a leading `~` is dropped on rewrite), fractions
(`0/34`, where only the numerator is updated and the denominator is retained verbatim), and the
placeholder `n/a` (backfilled with the measured value once a measurement exists). Any cell that matches
none of these whitelist formats SHALL remain fail-safe in the `skipped_format` list, exactly as today.

#### Scenario: A percent cell is rewritten preserving its `%` suffix

- **GIVEN** a Priority-C row whose Aktuell cell reads `90 % ✓` and a measured value of `95` for that ID
- **WHEN** `scripts/health-goals-update.sh` runs with that measurement in `HG_VALUES_FILE`
- **THEN** the Aktuell cell is rewritten to `95 % <marker>` (the `%` suffix retained, marker derived
  from the comparison)

#### Scenario: A fraction cell updates only the numerator

- **GIVEN** a Priority-C row whose Aktuell cell reads `0/34 ✓` and a measured numerator of `3`
- **WHEN** `scripts/health-goals-update.sh` runs
- **THEN** the Aktuell cell is rewritten to `3/34 <marker>` (denominator `34` retained verbatim)

#### Scenario: A non-whitelisted cell stays fail-safe in skipped_format

- **GIVEN** a Priority-C row whose Aktuell cell reads free text such as `Elite`
- **WHEN** `scripts/health-goals-update.sh` runs
- **THEN** the cell is left unchanged and the ID is reported under "Übersprungen" (skipped_format)

### Requirement: REQ-HEALTH-GOALS-006 — Read-only drift report mode

`scripts/health-goals-update.sh --drift` SHALL emit a read-only report that joins the documented
`current` value of every goal (all priorities) from `website/src/lib/goals-data.generated.json` against
the freshly measured values in `HG_VALUES_FILE`, joined by goal ID, grouped by priority, marking each
divergence with a `DRIFT` label. The `--drift` mode SHALL always exit `0` and SHALL never write to
`.claude/lib/goals.md` — the Priority-A/B "human redaction" policy stays intact; the report only
surfaces the drift. When `website/src/lib/goals-data.generated.json` is older (mtime) than
`.claude/lib/goals.md`, the report SHALL print a staleness warning rather than silently joining against
stale documented values. The generated JSON remains the single parser SSOT (`gen-goals-data.mjs`,
REQ-HEALTH-GOALS-002); `--drift` SHALL NOT introduce a second `goals.md` parser.

#### Scenario: A documented value diverging from the measured value is flagged

- **GIVEN** a goal whose `current` in `goals-data.generated.json` is `5` and whose freshly measured
  value is `8`
- **WHEN** `scripts/health-goals-update.sh --drift` runs
- **THEN** the report lists that goal with both values and a `DRIFT` marker
- **AND** the process exits `0` and `.claude/lib/goals.md` is byte-for-byte unchanged

#### Scenario: A stale generated JSON produces a warning instead of a silent join

- **GIVEN** `goals-data.generated.json` whose mtime is older than `.claude/lib/goals.md`
- **WHEN** `scripts/health-goals-update.sh --drift` runs
- **THEN** the report prints a staleness warning naming `goals-data.generated.json`

### Requirement: REQ-HEALTH-GOALS-007 — LLM-assisted candidate fill via unified gateway

A new script `scripts/health-goals-llm-fill.sh` SHALL determine candidate goals as the set of IDs
present in `website/src/lib/goals-data.generated.json` but absent from the measurement run's
`HG_VALUES_FILE` (i.e. the deterministically uncovered goals), optionally narrowed by `--only=ID,ID`.
For each candidate it SHALL POST one OpenAI-compatible request to
`${HG_LLM_URL:-http://localhost:18235/v1}/chat/completions` (model `${HG_LLM_MODEL:-bonsai}`, the
unified LLM gateway from T002102, which serialises requests itself) expecting a strict JSON object
`{id, value, unit, confidence, evidence, reproducible_cmd_suggestion}`; a parse failure SHALL list the
goal as `unfillable` without a retry loop. The script SHALL default to report-only, writing the report
to stdout and to `tmp/claude-scratch/health-goals-llm-fill-<date>.md`. Under `--apply` it SHALL write
only Priority-C "Aktuell" cells, marking each written value with an `(LLM)` provenance marker, and SHALL
NEVER write Priority-A/B free text and NEVER apply a value whose `confidence` is below `0.7`. If the
gateway is unreachable the script SHALL exit `0` with a warning (cron-friendly), or exit `1` under
`--strict`.

#### Scenario: Candidate set is generated-IDs minus measured-IDs

- **GIVEN** `goals-data.generated.json` containing IDs `{G-A, G-B, G-C}` and an `HG_VALUES_FILE` that
  measured only `G-A`
- **WHEN** `scripts/health-goals-llm-fill.sh` runs
- **THEN** the candidate set is exactly `{G-B, G-C}`

#### Scenario: Report-only default never edits goals.md

- **GIVEN** a reachable mock gateway returning a valid JSON object with `confidence` `0.9`
- **WHEN** `scripts/health-goals-llm-fill.sh` runs without `--apply`
- **THEN** `.claude/lib/goals.md` is unchanged and a report file is written under `tmp/claude-scratch/`

#### Scenario: A low-confidence answer is never applied

- **GIVEN** a mock gateway returning `confidence` `0.4` for a candidate
- **WHEN** `scripts/health-goals-llm-fill.sh --apply` runs
- **THEN** that candidate's Priority-C cell is NOT written and the value is reported as report-only

#### Scenario: An unreachable gateway exits 0 by default and 1 under --strict

- **GIVEN** `HG_LLM_URL` pointing at a closed port
- **WHEN** `scripts/health-goals-llm-fill.sh` runs
- **THEN** it exits `0` and prints a warning
- **AND** WHEN run with `--strict` it exits `1`

<!-- merged from change delta health-goals.md (10c126152d2d) -->