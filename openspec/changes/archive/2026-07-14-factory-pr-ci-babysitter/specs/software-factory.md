## ADDED Requirements

### Requirement: PR-CI-Babysitter Scan und Kandidatenwahl

Der Babysitter deckt die Lücke ab, in der offene PRs außerhalb eines laufenden
Factory-Runs (abgebrochene Factory-PRs, dev-flow-PRs, Renovate, manuelle PRs) mit
roter CI liegen bleiben, weil weder Dispatcher noch Watchdog den PR-CI-Status
abfragen. Der Step läuft repo-weit **einmal pro Wakeup-Tick** (PRs sind
brand-agnostisch) und wählt **genau einen** Kandidaten pro Aufruf (Concurrency 1).

The system SHALL scan open pull requests via `gh pr list --state open --json
number,headRefName,isDraft,mergeStateStatus,statusCheckRollup,author,labels`,
treat only unambiguous `FAILURE` conclusions in `statusCheckRollup` as red (a
`null`/pending conclusion SHALL NOT count as red), and select at most one
candidate per invocation ordered by ascending PR number.

#### Scenario: Ein einziger roter PR wird gewählt
- **GIVEN** two open non-draft PRs #40 and #42 both have a `statusCheckRollup` entry with `conclusion=FAILURE`
- **WHEN** `babysit-prs.sh` runs one pass
- **THEN** it selects exactly PR #40 (smallest number) and processes no other PR in the same pass

#### Scenario: Pending Checks zählen nicht als rot
- **GIVEN** an open PR whose only `statusCheckRollup` entries have `conclusion=null` (pending)
- **WHEN** `babysit-prs.sh` evaluates the candidate set
- **THEN** the PR is skipped and the pass ends without selecting it (retried next tick)

### Requirement: PR-CI-Babysitter Filter- und Guard-Kette

The system SHALL exclude a PR from selection when ANY of the following holds:
the PR is a draft; it carries the label `ci-babysitter-gave-up`; its author is
the Renovate bot and `FACTORY_BABYSIT_RENOVATE` is not `true`; its head branch
has a live `agent-lock` branch claim (`.git/agent-locks/branch__<name>.json`) or
a `[TNNNNNN]`-tagged ticket in status `in_progress`. When
`mergeStateStatus == CONFLICTING`, the system SHALL NOT attempt a fix, SHALL add
the label `ci-babysitter-conflict` at most once, and SHALL emit a notify payload.

#### Scenario: Draft und gave-up werden übersprungen
- **GIVEN** the only red PRs are one draft PR and one PR labelled `ci-babysitter-gave-up`
- **WHEN** `babysit-prs.sh` runs
- **THEN** neither PR is selected and no fix is attempted

#### Scenario: Renovate nur mit Opt-in
- **GIVEN** the only red PR is authored by the Renovate bot
- **WHEN** `babysit-prs.sh` runs with `FACTORY_BABYSIT_RENOVATE` unset
- **THEN** the PR is skipped; **AND** when the same pass runs with `FACTORY_BABYSIT_RENOVATE=true` the PR becomes eligible

#### Scenario: CONFLICTING wird gemeldet, nie gefixt
- **GIVEN** a red PR with `mergeStateStatus=CONFLICTING` and no `ci-babysitter-conflict` label
- **WHEN** `babysit-prs.sh` processes it
- **THEN** it adds the `ci-babysitter-conflict` label once, emits a `QA_NOTIFY_PAYLOAD` line, and performs no fix, rebase, or merge

#### Scenario: Dedup gegen laufende Pipeline
- **GIVEN** a red PR whose head branch has a live `agent-lock` branch claim
- **WHEN** `babysit-prs.sh` evaluates it
- **THEN** the PR is skipped to avoid racing the active session/pipeline

### Requirement: PR-CI-Babysitter Fix-Loop mit zwei Gates und Versuchslimit

Retry-State lebt am PR (kein Ticket, kein Slot): ein Kommentar-Marker
`<!-- ci-babysitter attempt=N -->` zählt die lebenslangen Versuche. Der Fix-Pfad
verwendet ausschließlich die bestehenden Bausteine `classify_failure` (Klasse)
und `build_loop_decide` (Gate 1 Klasse ∈ ci|test|lint|freshness, Gate 2
Escalate-Pfade via `paths_are_escalate_class`, No-Progress-Hash, Iterationslimit).

The system SHALL count existing `<!-- ci-babysitter attempt=N -->` markers on the
PR and, when the count is `>= 2`, add the label `ci-babysitter-gave-up`, emit a
notify payload, and stop without a further fix. Otherwise the system SHALL fetch
the failed CI log (`gh run view --log-failed`, fallback `--log`), derive the class
via `classify_failure`, and consult `build_loop_decide`; on `continue` it SHALL
apply a class-scoped fix in a temporary worktree of the PR branch — deterministic
`task freshness:regenerate` for class `freshness`, an agent dispatch
(`${CLAUDE_BIN} -p`, narrowly scoped `allowedTools`) for classes `ci|test|lint`,
push through the branch worktree — and SHALL never merge, rebase, or force-push.
On any `abort:*` decision the system SHALL emit a notify payload and add a marker
comment instead of fixing.

#### Scenario: Zweiter Versuch überschritten → gave-up
- **GIVEN** a red PR that already carries two `<!-- ci-babysitter attempt=N -->` markers
- **WHEN** `babysit-prs.sh` selects it
- **THEN** it adds the `ci-babysitter-gave-up` label, emits a `QA_NOTIFY_PAYLOAD` line, and attempts no further fix

#### Scenario: Freshness-Klasse wird deterministisch behoben
- **GIVEN** a red PR whose failed CI log classifies as `freshness` and `build_loop_decide` returns `continue`
- **WHEN** `babysit-prs.sh` applies the fix
- **THEN** it regenerates artifacts in a temporary worktree of the PR branch, commits `chore: refresh (ci-babysitter)`, pushes, and never merges or force-pushes

#### Scenario: Escalate-Klasse wird hart abgebrochen
- **GIVEN** a red PR whose failed CI log classifies as `secret`, `realm`, `sql`, or `manifest`
- **WHEN** `build_loop_decide` returns `abort:escalate-gate`
- **THEN** `babysit-prs.sh` emits a notify payload and a marker comment and applies no fix

#### Scenario: Marker-Kommentar nach jedem Versuch
- **GIVEN** a fix attempt just ran on a PR
- **WHEN** `babysit-prs.sh` records the outcome
- **THEN** it posts a `<!-- ci-babysitter attempt=N -->` comment carrying the attempt number, class, decision, and a log tail

### Requirement: PR-CI-Babysitter Guards und Wakeup-Einhängung

The system SHALL skip the entire babysitter pass when the global kill-switch is on
(`guard_killswitch_on`, fail-closed) and, under `FACTORY_DRY_RUN` or the
`--dry-run` flag, SHALL only scan and log without mutating any PR. `wakeup.sh`
SHALL invoke the babysitter once per tick as a best-effort step outside the
per-brand loop (after the brand chain, before the Claude dispatcher call), with
its output prefixed and failures non-fatal.

#### Scenario: Kill-Switch pausiert den Babysitter
- **GIVEN** the global kill-switch is on
- **WHEN** `babysit-prs.sh` runs
- **THEN** it exits early without listing or mutating any PR

#### Scenario: Dry-Run scannt nur
- **GIVEN** a red eligible PR exists
- **WHEN** `babysit-prs.sh` runs with `--dry-run`
- **THEN** it logs the candidate and intended action but posts no comment, adds no label, and pushes nothing

#### Scenario: Wakeup ruft den Babysitter best-effort auf
- **GIVEN** `wakeup.sh` runs one tick
- **WHEN** the pre-dispatcher steps execute
- **THEN** it invokes `scripts/factory/babysit-prs.sh` exactly once outside the per-brand loop, prefixes its output, and continues the tick even if the step fails
