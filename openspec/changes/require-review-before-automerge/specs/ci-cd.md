## MODIFIED Requirements

### Requirement: Squash-Auto-Merge

The system SHALL automatically enable squash-auto-merge on every eligible
non-draft PR against `main`, but GitHub SHALL merge it only after all required
status checks and at least one approving pull-request review satisfy branch
protection.

#### Scenario: Auto-merge waits for an approval

- **GIVEN** an eligible non-draft PR has auto-merge enabled and all required
  status checks pass
- **AND** branch protection requires one approving review
- **WHEN** the PR has no approval
- **THEN** GitHub SHALL keep the PR open
- **WHEN** one approving review is submitted
- **THEN** GitHub SHALL squash-merge the PR without another manual merge action
