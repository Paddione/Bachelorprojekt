## ADDED Requirements

### Requirement: Port-Forward identity is verified before use

`scripts/openspec-embed-local.sh` SHALL verify, after starting its own `kubectl port-forward`
for `svc/shared-db`, that the process actually listening on `127.0.0.1:$PF_PORT` is the process
it just started (or a child of it) — not merely that some process is listening on that port. On
mismatch the script SHALL abort with a non-zero exit and a remediation message naming the
foreign process, instead of silently using a pre-existing, unrelated port-forward.

#### Scenario: Own port-forward is confirmed

- **GIVEN** `openspec-embed-local.sh` starts its own port-forward on `$PF_PORT`
- **WHEN** the port-forward's listener PID is checked
- **THEN** it matches the PID of the process the script just started
- **AND** the script proceeds to use the DB connection

#### Scenario: Colliding foreign listener is rejected

- **GIVEN** a foreign process already listens on `$PF_PORT` (e.g. an orphaned unrelated
  `kubectl port-forward`) before or instead of the script's own forward binding successfully
- **WHEN** `openspec-embed-local.sh` checks the port-forward's listener identity
- **THEN** the script exits non-zero
- **AND** it does NOT proceed to query through that port

### Requirement: Wrapper success check fails on a completeness-gate warning

`scripts/openspec-embed-local.sh` SHALL treat `openspec-embed.mjs` output as a failure (exit
non-zero) whenever the output contains a `WARN: completeness gate` line, even if the same
output also contains an `indexed slug='` success marker. `.githooks/post-commit-embed` remains
unaffected (still non-fatal on wrapper failure — safety-net semantics unchanged); the explicit
`dev-flow-plan` C.4 invocation of the wrapper (no `|| true`) becomes the effective escalation
point.

#### Scenario: Completeness-gate warning is escalated

- **GIVEN** `openspec-embed.mjs` output contains both `indexed slug='<slug>'` and a
  `WARN: completeness gate` line
- **WHEN** `openspec-embed-local.sh` evaluates the output
- **THEN** the wrapper exits non-zero

#### Scenario: Clean success stays a success

- **GIVEN** `openspec-embed.mjs` output contains `indexed slug='<slug>'` and no
  `WARN: completeness gate` line
- **WHEN** `openspec-embed-local.sh` evaluates the output
- **THEN** the wrapper exits zero

### Requirement: post-commit-embed hook skips during an active rebase

`.githooks/post-commit-embed` SHALL detect an in-progress `git rebase` (presence of
`rebase-merge` or `rebase-apply` under the git directory) and exit immediately without invoking
`openspec-embed-local.sh`, so replayed commits during a rebase do not each pay the embedding
cost. A regular commit made after the rebase completes (no rebase markers present) SHALL trigger
the hook normally.

#### Scenario: Hook is skipped while a rebase is in progress

- **GIVEN** a `rebase-merge` or `rebase-apply` directory exists under the git directory
- **WHEN** a commit is made and `post-commit-embed` runs
- **THEN** the hook exits without invoking `openspec-embed-local.sh`

#### Scenario: Hook runs normally outside a rebase

- **GIVEN** no rebase is in progress
- **WHEN** a commit touching `openspec/changes/<slug>/` is made and `post-commit-embed` runs
- **THEN** the hook invokes `openspec-embed-local.sh` for the touched slug(s)
