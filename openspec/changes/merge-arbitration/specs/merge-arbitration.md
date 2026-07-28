## ADDED Requirements

### Requirement: N-way collision detection across open pull requests

The system SHALL determine, for every file changed in any open pull request, the set of
pull requests changing it, and SHALL report a cluster when at least three of them are
eligible. A pull request is eligible when it is not a draft and its latest check run
rollup is successful.

#### Scenario: Three eligible pull requests form a cluster

- **GIVEN** three open, non-draft pull requests with green checks change `website/src/lib/x.ts`
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit a cluster for `website/src/lib/x.ts` listing all three pull request numbers

#### Scenario: Two eligible pull requests do not form a cluster

- **GIVEN** exactly two open, non-draft pull requests with green checks change `website/src/lib/x.ts`
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit no cluster for that file

#### Scenario: Draft and red pull requests are counted but not eligible

- **GIVEN** two eligible pull requests and one draft pull request change the same file
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit no cluster
- **AND** it SHALL record the ineligible pull request in the cluster candidate log

### Requirement: Exclusion of generated artifacts

The system SHALL exclude from cluster detection every path that `.gitattributes` marks
with `merge=ours`, and SHALL derive that exclusion list from `.gitattributes` at runtime
rather than from a separate copy.

#### Scenario: Generated artifact does not form a cluster

- **GIVEN** three eligible pull requests change `docs/code-quality/repo-index.json`
- **AND** `.gitattributes` marks that path with `merge=ours`
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit no cluster for that file

#### Scenario: Non-generated file in the same pull requests still clusters

- **GIVEN** the same three eligible pull requests also change `scripts/agent-lock.sh`
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit a cluster for `scripts/agent-lock.sh`

### Requirement: Arbitration pull requests are excluded from detection

The system SHALL exclude pull requests carrying the `arbitration` label from cluster
detection, so that a synthesis pull request cannot form a cluster with the pull requests
it arbitrates.

#### Scenario: Synthesis pull request does not re-trigger arbitration

- **GIVEN** an open pull request labelled `arbitration` changes `website/src/lib/x.ts`
- **AND** two other eligible pull requests change the same file
- **WHEN** `scripts/arbitration/detect.sh` runs
- **THEN** it SHALL emit no cluster for that file

### Requirement: Idempotent arbitration per cluster state

The system SHALL compute a `cluster_key` from the sorted file paths, the pull request
numbers and their head SHAs, and SHALL skip a cluster whose key is already recorded in an
open arbitration pull request or escalation ticket.

#### Scenario: Unchanged cluster is not arbitrated twice

- **GIVEN** a cluster has already produced an arbitration pull request
- **AND** no participating pull request has pushed since
- **WHEN** `scripts/arbitration/apply.sh` runs again
- **THEN** it SHALL take no action

#### Scenario: A new push re-opens the decision

- **GIVEN** the same cluster
- **AND** one participating pull request has pushed a new head SHA
- **WHEN** `scripts/arbitration/apply.sh` runs
- **THEN** it SHALL arbitrate the cluster again under the new `cluster_key`

### Requirement: Synthesis output is validated before use

The system SHALL validate the synthesized file content with a syntax check appropriate to
the file type before opening a pull request, and SHALL fall back to escalation when the
check fails.

#### Scenario: Unparseable synthesis falls back to escalation

- **GIVEN** the language model returns content that fails the file-type syntax check
- **WHEN** `scripts/arbitration/apply.sh` processes the result
- **THEN** it SHALL NOT open a pull request
- **AND** it SHALL create an escalation ticket recording the failed check

### Requirement: Escalation for risk paths and low confidence

The system SHALL escalate to a human instead of opening a synthesis pull request when the
cluster touches a path listed in `scripts/factory/shared-state-paths.txt`, or when the
reported confidence is below 0.8.

#### Scenario: Shared-state path always escalates

- **GIVEN** a cluster on `k3d/foo.yaml`
- **AND** the reported confidence is 0.99
- **WHEN** `scripts/arbitration/apply.sh` runs
- **THEN** it SHALL create an escalation ticket and comment on each participating pull request
- **AND** it SHALL NOT open a synthesis pull request

#### Scenario: Ordinary path with high confidence produces a pull request

- **GIVEN** a cluster on `website/src/lib/x.ts`
- **AND** the reported confidence is 0.99
- **WHEN** `scripts/arbitration/apply.sh` runs
- **THEN** it SHALL open a pull request labelled `arbitration` containing only the cluster files

### Requirement: Fail-open operation

The system SHALL never block a pull request. It SHALL NOT register a required status
check, SHALL NOT force-push, and SHALL NOT push to any branch other than its own
`chore/merge-arbitration-*` branch.

#### Scenario: Unreachable language model leaves state unchanged

- **GIVEN** the llm-proxy is unreachable
- **WHEN** `scripts/arbitration/apply.sh` runs on a detected cluster
- **THEN** it SHALL exit without creating a pull request, ticket or comment
- **AND** it SHALL exit zero so the workflow does not report a failure against the pull request
