## MODIFIED Requirements

### Requirement: PR-CI-Babysitter Scan und Kandidatenwahl

Der Babysitter deckt die Lücke ab, in der offene PRs außerhalb eines laufenden
Factory-Runs (abgebrochene Factory-PRs, dev-flow-PRs, Renovate, manuelle PRs) mit
roter CI liegen bleiben, weil weder Dispatcher noch Watchdog den PR-CI-Status
abfragen. Der Step läuft repo-weit **einmal pro Wakeup-Tick** (PRs sind
brand-agnostisch) und wählt **genau einen** Kandidaten pro Aufruf (Concurrency 1).

The system SHALL scan open pull requests via `gh pr list --state open --json
number,headRefName,isDraft,mergeStateStatus,statusCheckRollup,author,labels`,
treat only unambiguous `FAILURE`, `TIMED_OUT`, and `ERROR` conclusions in
`statusCheckRollup` as red (a `null`/pending conclusion SHALL NOT count as
red), and select at most one candidate per invocation ordered by ascending PR
number.

#### Scenario: Ein einziger roter PR wird gewählt
- **GIVEN** two open non-draft PRs #40 and #42 both have a `statusCheckRollup` entry with `conclusion=FAILURE`
- **WHEN** `babysit-prs.sh` runs one pass
- **THEN** it selects exactly PR #40 (smallest number) and processes no other PR in the same pass

#### Scenario: Pending Checks zählen nicht als rot
- **GIVEN** an open PR whose only `statusCheckRollup` entries have `conclusion=null` (pending)
- **WHEN** `babysit-prs.sh` evaluates the candidate set
- **THEN** the PR is skipped and the pass ends without selecting it (retried next tick)

#### Scenario: TIMED_OUT zählt als rot
- **GIVEN** an open non-draft PR whose `statusCheckRollup` has an entry with `conclusion=TIMED_OUT`
- **WHEN** `babysit-prs.sh` runs one pass
- **THEN** the PR SHALL be selected as a red candidate

#### Scenario: ERROR zählt als rot
- **GIVEN** an open non-draft PR whose `statusCheckRollup` has an entry with `conclusion=ERROR`
- **WHEN** `babysit-prs.sh` runs one pass
- **THEN** the PR SHALL be selected as a red candidate
