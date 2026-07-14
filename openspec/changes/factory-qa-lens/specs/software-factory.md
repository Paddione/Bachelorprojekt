## ADDED Requirements

### Requirement: Executing QA-Lens in der Verify-Phase

The system SHALL, only at risk-tier `full`, run an executing `qa`-lens during the Verify phase in addition to the diff-reading review lenses. The qa-lens is implemented as a standalone CLI (`scripts/factory/qa-lens.mjs`) that pipeline.js spawns as a subprocess and whose stdout is a `REVIEW_SCHEMA`-shaped `{ findings, summary }` object. The qa-lens SHALL execute `task test:changed` for the feature worktree through the sandbox runner (`scripts/factory/sandbox-run.sh`), and — when staging is available — deploy the feature branch pre-merge to the shared `workspace-staging` namespace (`ENV=staging`) and run a Playwright smoke against staging plus a read-only regression smoke against live prod. Its findings SHALL be appended to the existing `reviews` array before the blocking decision, so that `high`/`critical` qa-findings block the merge through the unchanged rawBlocking/coordinator logic. The lens SHALL be disableable via `FACTORY_QA_LENS=off`. Smoke base URLs SHALL be resolved from environment configuration (`WEBSITE_SITE_URL`, `PROD_DOMAIN`) and never contain a hardcoded brand-domain literal.

#### Scenario: Full-tier diff with a runtime regression
- **GIVEN** risk-tier `full` and a feature branch whose new code fails a Playwright smoke against staging
- **WHEN** the qa-lens deploys the branch to `workspace-staging` and runs the staging smoke
- **THEN** the qa-lens returns a finding with `severity=high`, that finding is merged into `reviews`, and the pipeline sets the ticket to `blocked`

#### Scenario: Lower tier skips the qa-lens
- **GIVEN** risk-tier `trivial` or `lite`
- **WHEN** the Verify phase selects its lenses
- **THEN** the qa-lens is not executed and no staging deploy occurs

#### Scenario: qa-lens is disabled by flag
- **GIVEN** risk-tier `full` and `FACTORY_QA_LENS=off`
- **WHEN** the Verify phase runs
- **THEN** the qa-lens subprocess is not spawned and the remaining review lenses run unchanged

---

### Requirement: Staging-Lock serialisiert das geteilte workspace-staging

The system SHALL serialize concurrent qa-lens staging deploys through a new `agent-lock.sh` scope `staging`, because `workspace-staging` is a single shared namespace and only one feature branch may occupy it at a time. The qa-lens SHALL claim the lock with `agent-lock.sh claim staging <ticket> --branch <branch> --worktree <worktree> --label qa-lens` before deploying, and SHALL release it with `agent-lock.sh release staging <ticket>` in a `finally` block so the lock is freed even when the deploy or smoke throws.

#### Scenario: Second full-tier ticket waits for the lock
- **GIVEN** ticket A holds the `staging` lock and ticket B (also tier `full`) reaches its qa-lens
- **WHEN** ticket B attempts `agent-lock.sh claim staging`
- **THEN** the claim does not succeed while A holds it, and B does not deploy to `workspace-staging` concurrently

#### Scenario: Lock is released after a failing smoke
- **GIVEN** the qa-lens holds the `staging` lock and the Playwright smoke throws
- **WHEN** the qa-lens exits
- **THEN** the `finally` block releases the `staging` lock so the next ticket can claim it

---

### Requirement: Degradationspfad ohne Staging

The system SHALL degrade gracefully when the staging lock cannot be acquired within `FACTORY_QA_STAGING_LOCK_TIMEOUT` (default 900 s), when `FACTORY_QA_SKIP_STAGING=1` is set, or when the staging deploy fails. In that case the qa-lens SHALL still run `task test:changed`, skip the staging and prod smoke, and return exactly one `severity=medium` finding describing the degradation instead of a blocking `high` finding. A degraded run SHALL NOT block the merge on the missing staging coverage alone.

#### Scenario: Staging lock times out
- **GIVEN** the `staging` lock is held by another ticket for the entire `FACTORY_QA_STAGING_LOCK_TIMEOUT`
- **WHEN** the qa-lens gives up claiming the lock
- **THEN** it runs `task test:changed` only and returns a single `severity=medium` finding, and the merge is not blocked by the qa-lens

#### Scenario: test:changed still gates a degraded run
- **GIVEN** a degraded qa-lens run where `task test:changed` fails
- **WHEN** the qa-lens reports its findings
- **THEN** it returns a `severity=high` finding for the failing tests in addition to the `medium` degradation finding, and the pipeline blocks the merge
