## ADDED Requirements

### Requirement: Der Archiv-Flow verifiziert die Status-Map vor dem Push

The archive step reference (`.claude/skills/references/plan-archive-steps.md`, step 7) SHALL
prescribe a `task freshness:check` verification between the cherry-pick of the archive commit
onto the archive branch and the push of that branch, so that a stale committed
`website/src/data/openspec-status.json` (regenerated before the archive move was fully
visible in the working tree) is detected locally before CI fails the archive PR. When the
check reports drift, the reference SHALL prescribe regenerating, staging the regenerated
artifacts and amending the archive commit (`git commit --amend`), followed by a re-run of
the check, before the branch is pushed.

#### Scenario: Pre-Push-Check erkennt eine stale Status-Map vor dem Push

- **GIVEN** an archive commit whose `website/src/data/openspec-status.json` was regenerated
  before the archive move was visible in the working tree (observed at T006369, PR #4552)
- **WHEN** an agent follows `plan-archive-steps.md` to archive a change and reaches the
  verification step between cherry-pick and push
- **THEN** `task freshness:check` reports drift and the reference prescribes amending the
  archive commit with the regenerated artifacts before pushing

#### Scenario: Frischer Archiv-Commit passiert die Pre-Push-Verifikation unverändert

- **GIVEN** an archive commit whose committed artifacts match a fresh regeneration
- **WHEN** `task freshness:check` runs between cherry-pick and push per the reference
- **THEN** the check passes and the archive branch is pushed unchanged

#### Scenario: Der Drift-Fix-Loop amends statt einen Follow-up-Commit zu erzeugen

- **GIVEN** a drift reported by the pre-push `task freshness:check` run
- **WHEN** the agent follows the reference's drift path
- **THEN** the regenerated artifacts are staged and the archive commit is amended with
  `git commit --amend` before the branch is pushed
