## ADDED Requirements

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
