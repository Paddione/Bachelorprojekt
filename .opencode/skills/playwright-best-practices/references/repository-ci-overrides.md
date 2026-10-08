# Repository CI overrides

Upstream snippets illustrate patterns, not current pinned dependencies. Resolve current stable package versions for new setup; evaluate an existing suite against its actual lockfile. Match the Playwright Docker image/browser binaries to the installed Playwright release. Do not copy old `v1.40.0` image examples or cache advice blindly.

A retry may help classify an intermittent failure, but both attempts must remain visible. A stable final run alone does not prove the first failure was harmless. Quarantined tests keep running in a report-only lane with a named owner, tracked cause and expiry. Never permanently hide flakes through `--grep-invert @flaky` or remove required checks just to turn CI green.

Shared behavior-first assertions, meaningful negative paths, deterministic clocks/data, boundary mocks, isolated fixtures and risk-based coverage are owned by [sota-testing](../../sota-testing/SKILL.md). Its [audit workflow](../../sota-testing/references/repository-audit.md) links the matching Vitest, pytest and BATS practices. Preserve framework-specific lifecycle differences rather than translating one runner's API literally into another.

Official sources: https://playwright.dev/docs/ci and https://playwright.dev/docs/best-practices
