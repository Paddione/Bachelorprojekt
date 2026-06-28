# g-dora03-cfr-policy

## Purpose

Diese Capability stellt sicher, dass die Change Failure Rate (CFR) des Projekts dauerhaft im Elite-Band (≤ 15 % breit) gehalten wird. Als Proxy dient die Rate der `fix()`-Commits am `main`-Branch der letzten 8 Wochen. Die Maßnahmen umfassen einen reproduzierbaren Mess-Command, einen CI-Gate für Typ-Regressionen sowie eine verbindliche Bug-Triage-Konvention. Zusammen senken sie die Wahrscheinlichkeit, dass Defekte ohne Ticket-Tracking als stille `fix()`-Commits landen und die Proxy-Rate künstlich erhöhen.

## Requirements

### Requirement: REQ-CFR-MEASURE-001

The measure command `bash scripts/vda.sh cfr` MUST execute without error on any checkout of `main` and return a single human-readable line containing the broad CFR percentage, absolute fix-count, total merge-count, and the target label `≤15%`. The window defaults to 8 weeks and is overridable via the `CFR_WINDOW` environment variable.

### Requirement: REQ-CFR-CI-GATE-002

The `astro check` step in `.github/workflows/ci.yml` MUST be registered as a required status check on the `main` branch. Any PR that introduces TypeScript or Astro template type errors MUST be blocked from merging until the errors are resolved.

### Requirement: REQ-CFR-TRIAGE-003

The `CLAUDE.md` development rules MUST contain a named section documenting the bug-triage convention: every post-merge defect is captured as a `type=bug` ticket before a fix commit is authored. Untracked `fix()` commits that bypass this convention are explicitly identified as a CFR anti-pattern.

### Requirement: REQ-CFR-TARGET-004

The broad CFR proxy value, measured over the most recent 8-week window on `main`, MUST be ≤ 15.0 %. This is verified by `bash scripts/health-goals-check.sh --only=G-DORA03` returning a green status.

### Requirement: REQ-CFR-ZERO-DIVIDE-005

The `cfr` subcommand in `scripts/vda.sh` MUST handle the edge case of zero total merges in the measurement window without producing a Python division-by-zero error. It MUST output a human-readable `n/a` message in that case.

## Acceptance Criteria

**GIVEN** the `main` branch has at least one merge commit in the last 8 weeks,
**WHEN** `bash scripts/vda.sh cfr` is executed,
**THEN** the output contains a percentage value of the form `X.X%` followed by absolute counts and the string `≤15%`.

**GIVEN** a Pull Request introduces a TypeScript or Astro type error,
**WHEN** the CI pipeline runs on that PR,
**THEN** the `astro check` step exits non-zero and the PR is blocked from merging.

**GIVEN** the bug-triage convention is in force,
**WHEN** a developer discovers a post-merge defect,
**THEN** `CLAUDE.md` provides the exact command to create a `type=bug` ticket before authoring any `fix()` commit.

**GIVEN** the current state of `main`,
**WHEN** `bash scripts/health-goals-check.sh --only=G-DORA03` is executed,
**THEN** the exit code is 0 and the output indicates green status for G-DORA03 (broad CFR ≤ 15.0 %).

**GIVEN** the measurement window contains zero merge commits,
**WHEN** `bash scripts/vda.sh cfr` is executed,
**THEN** the output contains `n/a` and no Python traceback is produced.
