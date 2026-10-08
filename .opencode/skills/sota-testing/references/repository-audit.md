# One audit across all test environments

## Scope and inventory

A request to audit all testing environments triggers one consolidated audit, not separate unrelated reviews. Record the revision and working-tree state. Discover package manifests and lockfiles, runner configs, task definitions, Python environments, test directories and CI workflows. Include nested packages: the root npm project and pnpm website are distinct lanes. Discover BATS and other runner types instead of assuming the three named frameworks are exhaustive. Use the repository task oracle to resolve commands; do not invent task names.

Create a lane inventory with: framework and package/path, installed version, newest stable version (source and lookup date), execution environment, command, collected-test count, skips/xfails, CI trigger, blocking/report-only status, dependencies and evidence. Distinguish installed versions from manifest ranges. A missing tool, blocked service or absent config becomes an explicit unverified item, never an implicit pass. Registry/API failure means latest stable is unknown; prereleases are not stable.

## Routing without duplication

| Concern | Owner |
| --- | --- |
| Strategy, assertion value, risk coverage, deterministic tests, doubles and data | this skill's rules/01 through rules/04 |
| Vitest runner, jsdom vs real browser, projects, coverage inclusion, cleanup, worker lifecycle | [vitest-testing](../../vitest-testing/SKILL.md) and [vitest](../../vitest/SKILL.md) |
| pytest fixtures, scope, parametrization, mocking, async review | [pytest-patterns](../../pytest-patterns/SKILL.md), especially its review-gates reference |
| Playwright fixtures, locators, auto-waiting, auth, traces, sharding | [playwright-best-practices](../../playwright-best-practices/SKILL.md) |
| CI health, quarantine, population-specific coverage, timing and merge coverage | rules/07 plus discovered workflow definitions |
| Failed GitHub Actions PR check logs | [gh-fix-ci](../../gh-fix-ci/SKILL.md); use only when relevant |
| Post-deploy Playwright test delivery | [dev-flow-e2e](../../dev-flow-e2e/SKILL.md); not a full-audit prerequisite |

## Evidence collection and execution

1. Inspect configuration and actual test discovery before trusting a green result. Check include/exclude/filter/project patterns, pass-with-no-tests behavior, focused tests and conditional skips. Compare counts within the same lane and revision; do not pool unrelated denominators.
2. Review representative high-risk behavior and uncovered branches, not just aggregate percentages. Identify tests that only exercise a mock, never assert an outcome, swallow failures, or use snapshots nobody can meaningfully review.
3. Resolve and run the appropriate existing non-interactive commands when test execution is in scope. Record counts, outcomes and durations. A docs-only/static audit remains static and is labelled as such.
4. Inspect fixture/setup/teardown code before running suites that may delete or purge data. Use isolated test services and explicit test identities. Never run destructive cleanup against live/shared data because an upstream example suggests it.
5. Independent unit lanes may run concurrently. Suites sharing a database, broker, port, storage or deployment run sequentially or with proven isolation. Concurrent independent full runs against one service are not a valid flakiness probe.
6. Use shuffled/repeated runs only to investigate a concrete isolation/flake concern. Mutation or egress-blocked probes require a controlled environment and rollback verification, not changes in the user's working tree.
7. Inspect CI triggers/path filters, required checks, full-suite coverage after merge, runtime/browser/container compatibility, services readiness, lockfile installs, caches, shard/report merging, failure artifacts and cancellation. Track retry outcomes and quarantined tests with owner, issue, expiry and a running report-only lane.
8. For BATS/shell tests, assert status and meaningful command output. Check pipeline/subprocess exit propagation, temporary path/port isolation, command availability and unexpected skips. Do not infer success from matching a source-code string.

## One consolidated result

Return one coverage matrix for every discovered lane: inspected, executed, passed/failed/unverified, counts/skips and evidence. Deduplicate shared root causes while naming every affected framework. Findings include file:line (or job/test id), severity, observed evidence, practical impact and concrete remediation. Distinguish observed failures from hypotheses, version drift from behavior defects, and static review from executed verification.

Finish with the three largest risks and a prioritized fix list. Use the user's communication contract rather than mandatory decorative headings. No claim that all environments passed when any lane is unverified. A single audit can cover all lanes; it does not mean one runner command or an exhaustive proof of every behavior.

## Official reference map

- Vitest: https://vitest.dev/guide/ and https://vitest.dev/guide/migration/
- pytest: https://docs.pytest.org/en/stable/ and https://pytest-asyncio.readthedocs.io/en/stable/concepts.html
- Playwright: https://playwright.dev/docs/best-practices and https://playwright.dev/docs/ci
- BATS: https://bats-core.readthedocs.io/en/stable/writing-tests.html
- GitHub Actions: https://docs.github.com/en/actions
