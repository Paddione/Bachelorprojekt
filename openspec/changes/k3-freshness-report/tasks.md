---
title: "K3 freshness reporting and reliable refresh receipts"
ticket_id: T900805
domains: [scripts, brain, skills, tests]
status: active
file_locks: [scripts/cbm-refresh-cron.sh, scripts/mcp/cbm-single-flight.sh, scripts/mcp/cbm-freshness.py, tests/spec/cbm-stampede-guard.bats]
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3-freshness-T900805 — Implementation Plan

## File Structure

- `scripts/mcp/cbm-freshness.py`: new Python stdlib status and receipt helper; split pure Git/JSON utilities into a sibling module if approaching 640 lines.
- `scripts/cbm-refresh-cron.sh`: consume explicit freshness decisions.
- `scripts/mcp/cbm-single-flight.sh`: retain shared flock and wrap successful indexing with atomic receipt capture.
- `tests/spec/cbm-stampede-guard.bats`: extend existing output tests with isolated Git fixtures and stub CLI.
- `docs/runbooks/cbm-index-stampede.md`: report invocation, receipt semantics and initial-refresh guidance.
- `.opencode/skills/code-graph-interpretation/`: include prepared skill, references and evaluation artifacts; evaluation agent owns their content.
- `.claude/skills/code-graph-interpretation`: prepared mirror symlink.
- `docs/agent-guide/registry/skills.yaml` and `docs/agent-guide/registry/capabilities.yaml`: include prepared skill registration.
- `openspec/changes/k3-freshness-report/`: proposal, design, tasks and delta for `brain-k3-code-graph`.
- `components/website/src/data/test-inventory.json` and freshness-generated indexes: regenerate only via repository commands.

## Zweck

Die Frische des K3-Codegraphen nachvollziehbar und konservativ melden. Ein fehlgeschlagener
Graph-Aufruf darf keinen frischen Index vortaeuschen. Ein erfolgreicher Refresh erhaelt einen
separaten, atomaren Nachweis; Git-Stand, lokale Aenderungen und Graph-Metadaten bleiben
unterscheidbar. Die vorbereitete Interpretations-Skill wird mit 20 praktischen Faellen bewertet.

## Scope and evidence

Work only in `.worktrees/k3-freshness-T900805` on `fix/k3-freshness-T900805`.
Do not pull/stash the source checkout; it contains the user's prepared skill changes.
Parent owns ticket transitions, commits, staging, PR and implementation coordination.
No live index refresh or production deployment is required.

At PRE=6d68122d3a610b0cc93ad50fcd455c6127a17b70, a stub CLI returning exit 1 makes cron
print fresh-skip with exit 0. The parent's existing RED test records this regression:

```bash
PRE=6d68122d3a610b0cc93ad50fcd455c6127a17b70
tests/unit/lib/bats-core/bin/bats --filter T900805 tests/spec/cbm-stampede-guard.bats
# expected: FAIL — failed CLI currently produces fresh-skip and exit 0
```

## Quality budgets

Measured with `wc -l`, `docs/code-quality/gates.yaml`, `docs/code-quality/baseline.json`
and `bash scripts/plan-lint.sh residual_budget <path>` before implementation.
Neither existing shell file has an S1 baseline entry; static shell limit is 800 lines.

| File | Current lines | Remaining budget |
| --- | --- | --- |
| `scripts/cbm-refresh-cron.sh` | 177 | 623 |
| `scripts/mcp/cbm-single-flight.sh` | 95 | 705 |

New Python helper is 799 lines (static limit 800, no baseline); 640-line split target
deferred as the gate passes without extraction. BATS (475 lines), runbook (109),
skill (76), skill reference (53), evals JSON (162), registry YAML (996/1211),
SSOT Markdown (73) and generated JSON have no S1 extension limit or matching
baseline; no numeric budget is claimed for them.
S2/CQ02: no application TypeScript changed. S3: no scoped brand-domain literals.
S4: shell integration and runbook reference the helper; add no orphan shell entrypoint.
Never add baseline/ignore exceptions. Generated test inventory is data, so no new Vitest test applies.

## Tasks

- [ ] **1. Reproduce and extend output coverage.** Keep the RED runner above; add stub-based
  tests in the existing BATS suite, with temporary HOME/cache/Git repositories. Cover fresh,
  HEAD drift, dirty and untracked unique paths (spaces/newlines/renames), missing receipt,
  wrong project/root/worktree, missing CLI, timeout, malformed payloads and tool errors.
  Verify no status invocation fetches or indexes. Include checkout behind local origin/main
  without repeated reindex, failed receipt preservation, unstable repository during indexing,
  dirty successful indexing, lock serialization/timeout and JSON target root differing from cwd.
  Replace old fail-open cron expectations with deterministic output fixtures.

- [ ] **2. Implement conservative status.** Expose
  `python3 scripts/mcp/cbm-freshness.py status --repo PATH --project NAME --timeout SECONDS`.
  Emit one JSON object with status fresh/stale/unknown, reasons, checkout root/HEAD,
  locally available origin/main SHA and relation, unique dirty/untracked paths/counts,
  graph metadata, successful-index receipt and refresh_allowed. Use Git NUL-delimited
  output and content-aware state fingerprints: git diff --binary HEAD plus untracked file
  contents and symlink targets, not porcelain markers alone. Probe timeouts
  are bounded. Validate CLI response schemas/error envelopes and root/project identity;
  failed/missing/malformed probes cannot yield fresh. Do not infer successful index time
  from database mtime. Missing receipt is unknown with an initial-refresh explanation.
  Index-vs-checkout and checkout-vs-local-upstream are separate comparisons; remote drift
  alone does not trigger indexing. Snapshots describe evidence, not graph completeness.

- [ ] **3. Capture receipts under the existing lock.** Parse target repo_path from wrapper
  JSON, never cwd. Keep existing lock path, successful serialization and timeout behavior.
  Run helper orchestration while shell flock is held; preserve subprocess stdout/stderr and
  nonzero exits. Only valid success (subprocess exit 0, valid result without tool error,
  stable before/after repository state, matching root/project) atomically replaces the receipt.
  Store schema version, UTC timestamp, HEAD SHA, canonical root, project, mode, tool version,
  state fingerprint and dirty state. An identical dirty snapshot may be fresh against the
  working tree, with explicit dirty=true; never claim a clean checkout or reindex unchanged
  dirtiness forever. Failed/unstable/malformed runs preserve the previous valid receipt.
  Maintain a separate atomic last-attempt marker (in_progress/failed/success plus receipt ID)
  so interrupted/failed attempts cannot leave an old receipt trusted after partial DB writes.
  Validate a graph database identity/stat fingerprint to detect external replacement/mutation.
  Store receipt outside the repository, keyed by canonical root/project. Unknown identity or
  missing tool prohibits refresh. Use no new package dependencies.

- [ ] **4. Integrate cron and document decisions.** Cron skips only explicit fresh, invokes
  the wrapper only for eligible drift or safe initial receipt establishment, and reports unknown
  with reasons and nonzero status on unavailable/invalid evidence. Dry-run never indexes.
  Resolve default repo from the script checkout, not caller cwd; explicit --repo overrides.
  A root mismatch or missing tool never starts refresh. Ensure exactly one JSON summary on
  stdout; route index output separately when cron invokes wrapper. Document exit/status
  contract, local-upstream limitations, dirty receipts and missing-receipt recovery.

- [ ] **5. Incorporate skill evaluation.** Include prepared skill/registry changes and the
  evaluation agent's 20-case prompts, results and evidence under the skill's evals directory.
  Review observed successes, failures and limitations; avoid asserting index completeness
  or language coverage from counts. Reference the status command in interpretation guidance.
  Evaluation content stays owned by the evaluation agent; parent coordinates review.

- [ ] **6. Verify and hand off for PR.** Run output tests and mandatory repository gates;
  regenerate test inventory after test edits and inspect generated diffs. Oracle currently
  returns no match for broad gate queries; use these documented mandatory commands.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats
bash scripts/plan-lint.sh .agents/plans/k3-freshness-T900805/tasks.md
bash scripts/openspec.sh validate
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

Parent stages the approved plan with one logical partial, commits with ticket scope
`fix(T900805): report K3 freshness from validated index receipts`, pushes the branch and
opens the scoped PR after required verification. Resolve actual gate failures and review
changed artifacts; source checkout stays untouched.
