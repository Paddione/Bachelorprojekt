# dev-flow Gotchas

This section aggregates known operational issues, gotchas, and workarounds for the `dev-flow` pipeline. Refer to these when executing plans, creating tickets, or deploying components.

### [T000321] Main Branch Guard (Branch Protection)
**Context**: Never commit or push directly to `main`.
**Rule**: Always create a feature, fix, or chore worktree/branch. `dev-flow-plan` and `dev-flow-execute` verify that the active branch is not `main` before commiting/pushing changes.

### [T000343] Brainstorm Port Selection
**Context**: Visual Companion server port mismatch.
**Rule**: Always derive the `$PORT` dynamically from the return value of `start-server.sh`. Hardcoding or guessing a port from a prior session will result in 502 Bad Gateway.

### [T000298] Git Auto-Merge in Worktrees
**Context**: `gh pr merge --auto` inside `/tmp/wt-*` worktrees.
**Rule**: Running `--auto` inside a worktree can silently fail or skip because Git thinks `main` is already in use by the primary worktree. Always run the merge command either with explicit `--repo` from the primary repository directory, or poll the checks sequentially (without `--auto`) before merging.

### [T000346] K8s Object verification before Planning
**Context**: Mismatch between planned k8s object name and actual name.
**Rule**: Before detailing a step to patch a deployment (e.g. `talk-hpb`), run `kubectl kustomize` or `kubectl get` to verify its actual name (e.g. `spreed-signaling`) and active configurations/affinity rules. Do not assume names.

### [T000244] JSON Patch duplicate keys in Env variables
**Context**: Using `op: add` to append env variables in Kustomize patches.
**Rule**: If the variable already exists in the base deployment, use `op: replace` instead of `op: add`. Otherwise, the duplicate key causes Kubernetes API server validation failures at dry-run time.

<a id="t000218"></a>
### [T000218] task test:all exit 128
**Context**: Intermittent exit code 128 on first run in a fresh worktree.
**Rule**: This is a transient race condition between `npm install` and BATS submodule checks. Re-running the command a second time succeeds.

### [T000245] fresh worktree node_modules missing
**Context**: Node modules are not checked in, and worktrees are clean.
**Rule**: Run `npm ci --prefix brett` before running tests or compilation within a fresh worktree.



### [T000214] openclaw approvals get JSON parsing
**Context**: `openclaw approvals get` returns tab-delimited text, not JSON.
**Rule**: Avoid passing stdout to python/jq JSON parsers. If needed, parse the raw `.openclaw/exec-approvals.json` configuration file directly from disk.

### [T000335] Commitlint body-max-line-length
**Context**: Commit lint rejects body lines exceeding 100 characters.
**Rule**: Wrap all commit message body lines to under 100 characters. For raw output or log traces, truncate them or wrap them manually.

### [T000342] gh pr checks parsing
**Context**: Parsing `gh pr checks` status.
**Rule**: Do not use `gh pr view --json state` or check status enums because the values do not reliably map to build results. Use text-based parsing of the checks list columns.

### [T000344] Database row check before file deletion
**Context**: Deleting plan markdown file before verifying database storage.
**Rule**: Always verify that the plan exists in `tickets.ticket_plans` by checking that the row count is greater than 0 before running `rm` on the plan file.

### [T000388] tickets.ticket_plans Query Timeout
**Context**: Querying the `tickets.ticket_plans` table over `kubectl exec`.
**Rule**: Never run `SELECT *` or query the `content` column on the entire `tickets.ticket_plans` table. The `content` column contains large markdown plan files which will cause connection timeouts over the `kubectl exec` tunnel. Always query metadata columns (such as `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly by a specific `ticket_id` or `slug`.

### [T000418] Playwright Project Assignment
**Context**: Assigning the correct Playwright project when writing E2E tests.
**Zuordnungstabelle**:
Use the correct project name in `playwright.config.ts` depending on the targeted service/brand:

| Projektname | Zweck / Ziel |
|-------------|--------------|
| `mentolder` | E2E-Tests für die Marke Mentolder |
| `korczewski` | E2E-Tests für die Marke Korczewski |
| `website` | Allgemeine Website E2E-Tests |
| `services` | Testen von Hintergrund-Diensten |
| `brett-mentolder` | Systembrett E2E-Tests auf Mentolder |
| `smoke` | Smoke-Tests für den Live-Cluster |
| `systemtest` | System-Integrationstests |

### [T001393] Lavish reload can discard in-flight form input
**Context**: Re-running `npx -y lavish-axi <html-file>` (e.g. to fix a layout warning) reloads the existing browser tab.
**Rule**: See `.claude/skills/lavish/SKILL.md#reload-safety` for the full lavish reload-safety protocol — never reload while a poll is outstanding, and check the last poll status before reloading.
