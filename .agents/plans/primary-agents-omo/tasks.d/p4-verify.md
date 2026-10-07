# p4 — Verify (tests role)

Mechanical verification of the whole change. No file changes in this partial.

## Tasks

- [x] Red-green evidence: the new roster guard failed on base with
  expected: FAIL (legacy six-agent roster still present, no `bp-*`
  primaries). After p1–p3 it must be green — run
  `tests/unit/lib/bats-core/bin/bats tests/spec/primary-agents-omo.bats`
  and confirm pass.
- [x] Run the touched guard files:
  `tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/single-static-model.bats`
- [x] Run `task test:changed` for the changed domains.
- [x] Run `task freshness:regenerate`, then `task freshness:check`.
- [x] Run `task workspace:validate` (Jisoo dry-run).

## Acceptance

- [x] All four commands green; inventory artifacts regenerated if the test
  run created new entries.
