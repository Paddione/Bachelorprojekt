# agentic-review

## Purpose

Der CI-seitige agentic Code-Review Pipeline — ein mehrstufiges System aus tiered
Lenses (Bug-Hunter, Security-Auditor, Pattern-Enforcer, Perf-Reviewer, AGENTS.md-Staleness),
einem deterministischen Finding-Filter, einem Konsolidierungs-Coordinator und dem
PR-Review-Posting via `gh pr review`. Die Pipeline ist advisory (kein Required Check)
und nutzt lokale/ferne LLM-Endpunkte über die Anthropic-SDK.

---

## Requirements

### Requirement: Tiered Lens Selection

The system SHALL select review lenses based on a tier classification (`trivial`, `lite`,
`full`) read from `TIER_JSON_PATH`. The tier-to-lens mapping SHALL be:
- `trivial` → `['bug']`
- `lite` → `['bug', 'security', 'pattern']`
- `full` → `['bug', 'security', 'pattern', 'perf', 'agents-md']`

#### Scenario: Full tier selects all 5 lenses

- **GIVEN** `TIER_JSON_PATH` contains `{"tier":"full"}`
- **WHEN** `ci-review.mjs` reads the tier
- **THEN** lenses `bug`, `security`, `pattern`, `perf`, and `agents-md` are selected

#### Scenario: Trivial tier selects only bug lens

- **GIVEN** `TIER_JSON_PATH` contains `{"tier":"trivial"}`
- **WHEN** `ci-review.mjs` reads the tier
- **THEN** only the `bug` lens is selected

### Requirement: Lens Prompt Files

The system SHALL maintain 6 prompt files under `scripts/factory/` — one per lens plus
a coordinator prompt:
- `review-bug-hunter.prompt.md`
- `review-security-auditor.prompt.md`
- `review-pattern-enforcer.prompt.md`
- `review-perf-reviewer.prompt.md`
- `review-agents-md-staleness.prompt.md`
- `review-coordinator.prompt.md`

#### Scenario: All 6 prompt files exist

- **GIVEN** the repository checkout
- **WHEN** listing `scripts/factory/review-*.prompt.md`
- **THEN** all 6 files exist and are non-empty

### Requirement: Finding Filter with Confidence Threshold

The system SHALL filter review findings through `review-finding-filter.mjs` which applies
three sequential filters: (1) out-of-diff suppression (findings on lines not in the
changed-line map are dropped), (2) confidence threshold (findings below
`CI_REVIEW_CONFIDENCE_THRESHOLD`, default 0.6, are dropped), (3) style-nitpick dropping
(findings matching the `STYLE_REGEX` pattern with severity `low` are dropped).

#### Scenario: Out-of-diff finding is suppressed

- **GIVEN** a finding with `file: "a.ts"` and `line: 99`
- **AND** the changed-lines map does not contain line 99 for `a.ts`
- **WHEN** `filterFindings()` processes this finding
- **THEN** the finding is in the `dropped` array with reason `out-of-diff`

#### Scenario: Low-confidence finding is suppressed

- **GIVEN** a finding with `confidence: 0.3`
- **AND** the default confidence threshold of 0.6
- **WHEN** `filterFindings()` processes this finding
- **THEN** the finding is in the `dropped` array with reason `low-confidence`

#### Scenario: Style nitpick is suppressed

- **GIVEN** a finding with `severity: "low"` and `description: "formatting issue"`
- **WHEN** `filterFindings()` processes this finding with `dropStyleNitpicks: true`
- **THEN** the finding is in the `dropped` array with reason `style-nitpick`

### Requirement: Changed-Lines Parsing

The system SHALL parse unified diffs via `parseChangedLines()` to produce a
`Map<filename, Set<lineNumber>>` of added lines, and format compact line-range hints
via `formatChangedLinesHint()` for inclusion in lens prompts.

#### Scenario: Unified diff produces correct changed-line map

- **GIVEN** a unified diff adding lines 10-12 in `a.ts` and line 5 in `b.ts`
- **WHEN** `parseChangedLines(diff)` is called
- **THEN** the returned map contains key `a.ts` with Set `{10, 11, 12}` and key `b.ts` with Set `{5}`

### Requirement: Coordinator Consolidation

For `full`-tier reviews with 2+ successful lens results, the system SHALL invoke
`review-coordinator.prompt.md` to consolidate findings into a single verdict. The
coordinator SHALL deduplicate findings across lenses, re-categorize misclassified items,
and produce a final verdict of `approved`, `minor_issues`, `requested_changes`, or
`approved_with_comments`.

#### Scenario: Full tier with multiple lenses triggers coordinator

- **GIVEN** tier is `full` and 3 lens results are available
- **WHEN** the consolidation step runs
- **THEN** the coordinator prompt is invoked and a single consolidated verdict is produced

#### Scenario: Lite tier skips coordinator

- **GIVEN** tier is `lite`
- **WHEN** lens results are available
- **THEN** `fallbackVerdict()` is used directly (no coordinator call)

### Requirement: PR Review Posting

The system SHALL post review results to GitHub via `gh pr review` with the appropriate
flag: `--request-changes` for `requested_changes`, `--comment` for `minor_issues` and
`approved_with_comments`, `--approve` for `approved`. If `PR_NUMBER` is unset, the
review body is printed to stdout instead.

#### Scenario: Requested changes posts with --request-changes flag

- **GIVEN** consolidated verdict is `requested_changes`
- **WHEN** `postReview()` is called with a PR number
- **THEN** `gh pr review <PR> --request-changes --body <body>` is executed

#### Scenario: No PR number prints to stdout

- **GIVEN** `PR_NUMBER` is unset
- **WHEN** `postReview()` is called
- **THEN** the review body is printed to stdout (no `gh` invocation)

### Requirement: Fail-Safe on Missing API Key

The system SHALL exit cleanly (code 0) when `ANTHROPIC_API_KEY` is unset, printing
a warning. This makes the review advisory — CI never fails due to a missing key.

#### Scenario: Missing API key skips review gracefully

- **GIVEN** `ANTHROPIC_API_KEY` is unset
- **WHEN** `ci-review.mjs` starts
- **THEN** it prints a warning and exits with code 0

### Requirement: Lens Failure Resilience

Individual lens failures SHALL be caught and return `null`, allowing remaining lenses
to proceed. The coordinator SHALL work with whatever lens results are available.

#### Scenario: One lens fails, others proceed

- **GIVEN** 3 lenses are selected and 1 throws an error
- **WHEN** the review runs
- **THEN** the failed lens returns `null` and the remaining 2 results are processed normally

---

## Key Files

- `scripts/factory/ci-review.mjs` — main orchestrator (152 lines)
- `scripts/factory/review-finding-filter.mjs` — filter logic (135 lines)
- `scripts/factory/review-bug-hunter.prompt.md` — bug-hunter lens
- `scripts/factory/review-security-auditor.prompt.md` — security lens
- `scripts/factory/review-pattern-enforcer.prompt.md` — pattern lens
- `scripts/factory/review-perf-reviewer.prompt.md` — perf lens
- `scripts/factory/review-agents-md-staleness.prompt.md` — AGENTS.md staleness lens
- `scripts/factory/review-coordinator.prompt.md` — coordinator consolidation

---

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-07-21 -->
