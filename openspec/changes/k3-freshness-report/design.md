# Design: K3 freshness evidence

## Reporting contract

`python3 scripts/mcp/cbm-freshness.py status --repo PATH --project NAME --timeout SECONDS`
emits a JSON object with status, reason codes, refresh_allowed, checkout, upstream, graph
and receipt sections. Unknown evidence produces unknown, including missing/malformed
receipts, missing tools, probe timeout, error envelopes and project/root mismatch.
Fresh requires validated matching evidence for the indexed working-tree snapshot. An identical
dirty snapshot may be fresh with explicit dirty=true; freshness never implies a clean checkout.
Changed contents produce stale. Resolve default repo from the script checkout, not caller cwd.
The status command never writes, fetches or indexes. Its timeout bounds external probes.

Canonical Git root and graph project/root must match, including distinct worktrees of one
repository. Parse NUL-delimited Git status; deduplicate paths across staged/worktree/untracked
states without breaking spaces/newlines/renames. Fingerprint state with git diff --binary HEAD plus untracked file contents
and symlink targets; identical porcelain markers are insufficient. Capture checkout HEAD and locally available origin/main independently;
ahead/behind/diverged/unknown upstream is informational, never by itself a reason to reindex.
Graph timestamps/counts are metadata. Neither those nor a receipt proves semantic completeness.

## Receipt lifecycle

The existing wrapper acquires the shared flock before helper orchestration. It derives the
index target from JSON repo_path rather than the caller's cwd. A valid successful CLI result
(exit 0 and no tool error), matching project identity and stable before/after state permit
atomic replacement of a receipt outside the repository, keyed by canonical root/project.
Receipt fields: schema version, UTC success time, HEAD SHA, canonical root, project, mode,
tool version, state fingerprint and dirty state. Dirty success is recorded without claiming
cleanliness. Failed, malformed, interrupted or unstable runs preserve the previous receipt.
A separate atomic last-attempt marker (in_progress/failed/success and receipt ID) prevents
trusting the previous receipt after a failed index partially modified the graph. Record and
validate database identity/stat evidence to catch external replacement/mutation conservatively.
Keep lock path, timeout and successful serialization behavior; use stdlib JSON/subprocess/Git.

## Cron policy

Only fresh yields fresh-skip. Known eligible drift uses the wrapper. Unknown never silently
skips: emit reasons and nonzero status when the evidence is unavailable or invalid. An absent
receipt explains the initial refresh; it can be established only with valid target identity and
available working tool probes. Root mismatch/missing tool forbid refresh. Dry-run reports the
same eligibility but never indexes. Keep cron stdout one JSON object by separating index output.

## Verification and scope

The existing T900805 RED BATS test demonstrates the failure; extend it with stub binaries and
temporary Git repositories, including malformed/timeout/error probes, worktrees, unusual paths,
receipt preservation, concurrent indexing, dirty/unstable states and local upstream divergence.
Include the evaluation agent's 20 cases and prepared skill registry changes. Main checkout,
live graph index and production require no mutations for this fix. See the implementation plan
for budgets, task gates and parent-owned commit/PR coordination.
