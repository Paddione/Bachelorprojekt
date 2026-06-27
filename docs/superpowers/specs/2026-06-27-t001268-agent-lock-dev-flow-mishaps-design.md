# T001268 — Agent-Lock / Dev-Flow Mishap Bundle — Design Note

**Date:** 2026-06-27
**Branch:** `fix/t001268-agent-lock-dev-flow-mishaps`
**Ticket:** [T001268](https://github.com/Paddione/Bachelorprojekt) — "Mishap-Bundle: scripts/agent-lock.sh, skills/dev-flow-plan, skills/dev-flow-execute (3 Einträge)"
**Components:** `scripts/agent-lock.sh`, `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/dev-flow-execute/SKILL.md`
**Related:** T000510 (agent-lock), T001229 (dev-flow-execute that surfaced mishap 1), T001267 (predecessor batch that surfaced mishaps 2 + 3)

---

## 1. Context

Three orthogonal mishaps surfaced during the dev-flow-execute run for T001267
(`migrate-to-upstream-openspec`) and the prior dev-flow-execute for T001229.
Each mishap points at a different file but all three stem from the same root
insight: **the dev-flow harness in Claude Code / opencode is not POSIX-stable
across bash tool invocations**. Identity, branch state, and remote state can
all silently drift between calls, and the current scripts/skills do not guard
against that drift explicitly.

## 2. Root-Cause Analysis

### 2.1 Mishap 1 — `scripts/agent-lock.sh` identity drift (component: `scripts/agent-lock.sh`)

**Symptom.** During dev-flow-execute (T001229) the Unix session ID reported by
`_my_sid()` (via `ps -o sess= -p $$`) changed between consecutive Bash tool
calls (observed: `295396 → 630156 → …`). A ticket lock claimed in call A was
treated as a "tote Session" in call B and silently reaped by the next
implicit `reap`. The advisory `agent-lock` registry therefore provided **no
real cross-call persistence** in the Claude Code harness, where every Bash
invocation runs in its own process group / session.

**Root cause.** `_my_sid()` uses the Unix `SID(2)` of the current process as
the canonical identity. That value is stable only for the lifetime of one
agent CLI process. The Claude Code / opencode harness spawns **one fresh bash
subshell per Bash tool call**, so SID is re-assigned every call. The existing
test override `AGENT_LOCK_SID` works, but nothing in the runtime harness sets
it.

**Fix idea.** Honour a **harness-stable env var** (preferred: `CLAUDE_SESSION_ID`
for Claude Code, with a Gemini/opencode fallback) **above** the `ps` lookup.
The harness already exposes such an ID for telemetry — we just have to read
it. Concrete change in `_my_sid()`:

```bash
_my_sid() {
  if [ -n "${CLAUDE_SESSION_ID:-}" ]; then printf '%s\n' "$CLAUDE_SESSION_ID"; return; fi
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  ...
}
```

Bonus: `_detect_tool()` should also honour the new env, so the lock's
`tool:` field becomes "claude" instead of "unknown" once `CLAUDE_SESSION_ID`
is set (current bash subshells do not inherit `CLAUDECODE/CLAUDE_CODE`).

### 2.2 Mishap 2 — stale plan-stage commit on `main` (component: `.claude/skills/dev-flow-plan/SKILL.md`)

**Symptom.** Before the T001229 execute run, `local main` contained commit
`33e4db52 chore(openspec): stage audit findings as batch change folder
[T001267]`, which was never pushed to `origin/main`. The
`git pull --rebase origin main` in dev-flow-execute Schritt 7.5 replayed it,
duplicating `openspec/changes/migrate-to-upstream-openspec/` content into
`openspec/changes/archive/2026-06-27-migrate-to-upstream-openspec/`. The
orchestrator had to `git reset --hard origin/main` to recover.

**Root cause.** `dev-flow-plan` Schritt 5 (Commit & Push) does the plan-stage
commit on the **same branch the worktree was created on** — but the skill
does not explicitly verify that the current branch is *not* `main`, nor that
`git status` is clean before the commit. The Feature-Pfad even allows the
proposal phase to live on `main` (Phase A.5: "auf dem `main`-Branch"), and
only the Worktree-Pfad enforcement (Schritt B.1) prevents a feature branch
from sitting on `main`. The guard is implicit; the operator (or implementer
subagent) can land a plan-stage commit on `main` and the script will not
complain.

**Fix idea.** Add an **explicit pre-commit guard** to dev-flow-plan Schritt 5:
(a) refuse to commit if `git rev-parse --abbrev-ref HEAD` is `main`, (b)
require `git status --porcelain` to be empty before `git commit`, and (c)
require the plan-stage commit to land on the **same branch as the worktree
claim** (cross-check against the agent-lock `branch` field, or the
`--branch` arg from the worktree-create invocation). Surface these as a
hard-coded checklist in the SKILL text so a subagent cannot miss them.

### 2.3 Mishap 3 — archive commits not pushed by implementer subagent (component: `.claude/skills/dev-flow-execute/SKILL.md`)

**Symptom.** During T001229 the implementer subagent committed the three
archive steps (`f1ab1117 archive + 89822b32 plan-complete + 30c716de
openspec-status regen`) **locally only** and reported "Plan archived: ja"
based on local state. `git log origin/main | grep f1ab1117` returned empty.
The orchestrator had to manually (a) correct the plan status, (b) push the
branch, (c) create `chore/plan-archive-<slug>`, (d) open PR #2191, (e)
auto-merge, (f) archive the plan in postgres.

**Root cause.** dev-flow-execute Schritt 7 (Plan & OpenSpec archivieren)
documents the push correctly (`git push -u origin "$ARCHIVE_BRANCH"` at line
555) but the surrounding language frames the step as "auto-merge nach
`gh pr merge --auto`" — there is no explicit **push-verification checkpoint**
between "commit" and "merge", and no requirement that the subagent
**prove the push happened** before returning. The implementer subagent
returns "Plan archived: ja" as soon as the local commit exists; that
sentence is technically true but the orchestrator treats it as proof of
remote presence.

**Fix idea.** Add a `Push-Verification Checklist` between commit and PR in
dev-flow-execute Schritt 7: (a) `git push -u origin "$ARCHIVE_BRANCH"` must
exit 0, (b) `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` must show
the commit SHA, (c) the subagent's final return must include
`push_verified: <sha>` alongside the "Plan archived: ja" claim. The
orchestrator should refuse to advance if `push_verified` is missing.

## 3. Fix Approach (one PR, three orthogonal sub-tasks)

Because the three mishaps touch three different files, they are best
shipped as **one PR with three sub-tasks** in a single OpenSpec change
folder `openspec/changes/agent-lock-dev-flow-mishaps/`. That keeps the
release-please / changelog footprint small and lets the orchestrator merge
them atomically.

| Sub-task | File(s) changed | Acceptance |
|---|---|---|
| ST-1 | `scripts/agent-lock.sh` | `_my_sid()` honours `CLAUDE_SESSION_ID` (and `AGENT_LOCK_SID` still works). New BATS guard proves it. |
| ST-2 | `.claude/skills/dev-flow-plan/SKILL.md` | Schritt 5 has explicit "do not commit on `main`" + "git status clean" + "branch matches agent-lock claim" rules. |
| ST-3 | `.claude/skills/dev-flow-execute/SKILL.md` | Schritt 7 has explicit "push-verified" checkpoint + subagent return contract includes `push_verified: <sha>`. |

All three are gated by **one failing BATS test** (`tests/spec/agent-lock-session-identity.bats`)
that exercises all three mishaps via three `@test` blocks. The test must
be red on the current `fix/t001268-...` branch and green after the
dev-flow-execute run lands the fix.

## 4. Out of scope

- Changing the harness or the agent-lock protocol itself (no new env vars
  beyond `CLAUDE_SESSION_ID`; the existing `AGENT_LOCK_SID` test override
  stays).
- Migrating the dev-flow skills to the upstream `superpowers:*` names —
  that's a different ticket.
- Touching `main` directly. The work happens on
  `fix/t001268-agent-lock-dev-flow-mishaps`.

## 5. Risks

1. **Harness env not always set** — if a future harness version stops
   exporting `CLAUDE_SESSION_ID`, the script falls back to `ps -o sess=` and
   the drift returns. Mitigation: the test asserts *fallback behaviour*
   (test override `AGENT_LOCK_SID` must keep working) so we never regress
   the test path.
2. **Doc-only changes are easy to bypass** — ST-2 and ST-3 are skill-text
   edits; an LLM-driven subagent may still ignore them. The BATS test
   asserts the *presence* of the rule text, not subagent compliance —
   that's the strongest deterministic check we can ship without changing
   the harness.
3. **Release-please PR scope** — three files in one PR may trigger the
   `feat:` vs `fix:` ambiguity. Use `fix(agent-lock): ... [T001268]` and
   treat all three as one fix because the underlying root cause is
   "harness drift assumed away".

## 6. Verification

After the fix lands (dev-flow-execute), the following must all be green:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats   # 3/3 pass
task test:changed                                                                # full smart test run
task freshness:regenerate && task freshness:check                                # generated-artifact sync
task test:openspec                                                               # openspec schema check
```

The release-please PR for this batch must have its `[T001268]` tag and the
`fix(agent-lock):` scope (not `feat:`) so the advisory title-check in
`ci.yml:229` logs the warning only — not a hard fail.
