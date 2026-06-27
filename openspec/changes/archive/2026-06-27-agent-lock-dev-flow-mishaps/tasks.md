---
title: "agent-lock + dev-flow mishap bundle (T001268): harness-stable identity, pre-commit guards, push verification"
ticket_id: T001268
domains: [tooling, agent-coordination, skills]
status: completed
file_locks: [scripts/agent-lock.sh, .claude/skills/dev-flow-plan/SKILL.md, .claude/skills/dev-flow-execute/SKILL.md]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
spec_ref: docs/superpowers/specs/2026-06-27-t001268-agent-lock-dev-flow-mishaps-design.md
---

# Tasks: agent-lock-dev-flow-mishaps (T001268)

- [ ] Task 0: Verify the failing BATS test is RED on `fix/t001268-agent-lock-dev-flow-mishaps` BEFORE any code change
- [ ] Task 1 (ST-1): Patch `scripts/agent-lock.sh` `_my_sid()` to honour `CLAUDE_SESSION_ID` and update `_detect_tool()` to recognise the new env
- [ ] Task 2 (ST-1): Run the BATS test from Task 0 — expected: 2/6 still fail (M1 OK, M2 + M3 still red) after Task 1
- [ ] Task 3 (ST-2): Add explicit "do not commit on main + clean git status + branch matches agent-lock claim" guard block to `.claude/skills/dev-flow-plan/SKILL.md` Schritt 5
- [ ] Task 4 (ST-2): Run the BATS test — expected: 4/6 fail (M1 + M2 OK, M3 still red) after Task 3
- [ ] Task 5 (ST-3): Add explicit "push-verification checkpoint" block (ls-remote + push_verified:\<sha\> in subagent return) to `.claude/skills/dev-flow-execute/SKILL.md` Schritt 7
- [ ] Task 6 (ST-3): Run the BATS test — expected: 6/6 GREEN after Task 5
- [ ] Task 7: Run the full verify gate (`task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task test:openspec`) — all must be green
- [ ] Task 8: Open PR `fix(agent-lock): harness-stable identity + pre-commit guards + push verification [T001268]`, wait for CI, auto-merge squash

---

# agent-lock + dev-flow Mishap Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Fix three orthogonal mishaps in one PR:
- Mishap 1 (drift, `scripts/agent-lock.sh`): Unix session ID drifts between Bash tool calls → advisory locks disappear across call boundaries. Bind identity to harness-stable `CLAUDE_SESSION_ID` env var.
- Mishap 2 (drift, `skills/dev-flow-plan`): plan-stage commit landed on `main` and was never pushed. Add explicit pre-commit guard ("not on main" + "git status clean" + "branch matches agent-lock claim").
- Mishap 3 (drift, `skills/dev-flow-execute`): implementer subagent commits archive steps locally and reports "Plan archived: ja" without pushing. Add explicit push-verification checkpoint (`git ls-remote origin` + `push_verified:<sha>` in subagent return contract).

**Architecture:** All three changes are localized — one source file, two skill text files. No new scripts, no new dependencies, no new tests beyond the BATS guard that is already in place as the RED phase. The RED → GREEN cycle is testable in three sub-steps (M1 → M2 → M3), so the executor can verify the fix lands progressively.

**Complexity:** low. Three small text edits + one tiny shell function change. Total diff: ~50 lines net add across 3 files.

**Risks (Kurz):**
1. **`CLAUDE_SESSION_ID` not set in all harnesses** — current code falls back to `ps -o sess=` if env unset. After the fix, the test override `AGENT_LOCK_SID` and the new `CLAUDE_SESSION_ID` override both win; the ps fallback only triggers when neither is set. Test must keep the fallback-path test (already exists as `AGENT-LOCK-01a..g`) to prevent regression.
2. **Doc-only changes (ST-2, ST-3) are easy to bypass by an LLM-driven subagent** — the BATS test asserts the *presence* of the rule text, not subagent compliance. That's the strongest deterministic check we can ship without changing the harness.
3. **`fix:` vs `feat:` scope in PR title** — three files in one PR may confuse release-please. Use `fix(agent-lock): ... [T001268]` (singular scope, all three sub-tasks behind it). The advisory `[T000XXX]` title-check in `ci.yml:229` will log a warning only.

**Quality-Gate-Vorabprüfung:**
- S1 (Zeilenlimits): `scripts/agent-lock.sh` is **baselined** at 236 lines — net +~10 lines (CLAUDE_SESSION_ID block + _detect_tool fix). Need to check baseline.
- `docs/superpowers/specs/2026-06-27-t001268-agent-lock-dev-flow-mishaps-design.md` is new (ungated).
- `openspec/changes/agent-lock-dev-flow-mishaps/tasks.md` is new (ungated).
- `tests/spec/agent-lock-session-identity.bats` is new (ungated).
- `.claude/skills/dev-flow-plan/SKILL.md` — modify, +~15 lines (one explicit guard block). Check baseline.
- `.claude/skills/dev-flow-execute/SKILL.md` — modify, +~12 lines (one explicit checkpoint block). Check baseline.

## File Structure

```
openspec/changes/agent-lock-dev-flow-mishaps/
  tasks.md                        # this file (new)
  proposal.md                     # why + what (new)
docs/superpowers/specs/
  2026-06-27-t001268-agent-lock-dev-flow-mishaps-design.md   # design note (new)
tests/spec/
  agent-lock-session-identity.bats                            # 6 @test guards (new)
scripts/
  agent-lock.sh                    # ST-1: _my_sid() + _detect_tool() (modify, +~10 lines)
.claude/skills/dev-flow-plan/
  SKILL.md                         # ST-2: pre-commit guard block in Schritt 5 (modify, +~15 lines)
.claude/skills/dev-flow-execute/
  SKILL.md                         # ST-3: push-verification checkpoint in Schritt 7 (modify, +~12 lines)
```

---

## Task 0 — Verify the failing BATS test is RED

Run the test alone (no other changes) and confirm 6/6 fail. **Expected: fail** on all 6 @test blocks (this is the RED phase — no source changes have landed yet).

```bash
cd /tmp/wt-t001268-agent-lock-dev-flow-mishaps
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
# Expected output:
#   not ok 1 T001268-M1: agent-lock uses CLAUDE_SESSION_ID as the owner_sid when set
#   not ok 2 T001268-M1: agent-lock treats different CLAUDE_SESSION_ID values as different owners
#   not ok 3 T001268-M2: dev-flow-plan SKILL.md explicitly forbids plan-stage commit on main
#   not ok 4 T001268-M2: dev-flow-plan SKILL.md requires clean git status before plan-stage commit
#   not ok 5 T001268-M3: dev-flow-execute SKILL.md requires push verification via git ls-remote
#   not ok 6 T001268-M3: dev-flow-execute SKILL.md mandates push_verified:<sha> in subagent return contract
```

If any test passes before the fix, the executor has misread the bug — STOP and re-investigate.

## Task 1 — ST-1: Patch `scripts/agent-lock.sh`

### Requirement
The function `_my_sid()` in `scripts/agent-lock.sh` MUST consult the `CLAUDE_SESSION_ID` environment variable (Claude Code / opencode harness) **above** the `ps -o sess=` lookup. The existing test override `AGENT_LOCK_SID` must keep working (test override precedence: harness env → test override → ps fallback). The function `_detect_tool()` MUST also recognise `CLAUDE_SESSION_ID` and report `tool: claude` instead of `unknown`.

### target_files
- `scripts/agent-lock.sh` (modify, +~10 lines net)

### Implementation sketch

```bash
# In scripts/agent-lock.sh — _my_sid() — add a CLAUDE_SESSION_ID check at the top:
_my_sid() {
  if [ -n "${CLAUDE_SESSION_ID:-}" ]; then printf '%s\n' "$CLAUDE_SESSION_ID"; return; fi
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  ...
}

# In _detect_tool() — add CLAUDE_SESSION_ID to the claude-tool detection:
_detect_tool() {
  if [ -n "${CLAUDE_SESSION_ID:-}${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}
```

### Acceptance
- `tests/local/AGENT-LOCK-01-*.bats` (existing) — all 7 tests still pass (regression).
- `tests/spec/agent-lock-session-identity.bats` — tests 1 + 2 (M1) GREEN; tests 3-6 (M2 + M3) still RED.

Commit: `fix(agent-lock): honour CLAUDE_SESSION_ID for harness-stable identity [T001268]`.

## Task 2 — ST-1 BATS check

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
# Expected: 2/6 GREEN (M1), 4/6 still RED (M2 + M3)
```

If test 1 or 2 still fails: re-check `_my_sid()` precedence (CLAUDE_SESSION_ID must be checked first, before `ps`).

## Task 3 — ST-2: Pre-commit guard block in dev-flow-plan

### Requirement
`.claude/skills/dev-flow-plan/SKILL.md` Schritt 5 ("Commit & Push") MUST include an explicit guard block that:
- Refuses to commit when `git rev-parse --abbrev-ref HEAD` returns `main`.
- Requires `git status --porcelain` to be empty before the plan-stage commit.
- Cross-checks the commit branch against the `--branch` argument recorded in the agent-lock claim.

### target_files
- `.claude/skills/dev-flow-plan/SKILL.md` (modify, +~15 lines)

### Implementation sketch (insert after the existing "git commit -m chore(plans): stage …" line in Schritt 5)

```markdown
**Pre-Commit Guard (PFLICHT — Schritt 5):**

Bevor der plan-stage Commit läuft, MUSS der Operator verifizieren:

1. **Nicht auf main:**
   ```bash
   CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
   [ "$CURRENT_BRANCH" != "main" ] || { echo "FATAL: plan-stage commit auf main ist verboten — nutze einen Worktree-Branch." >&2; exit 1; }
   ```

2. **Sauberer git status:**
   ```bash
   [ -z "$(git status --porcelain)" ] || { echo "FATAL: working tree ist nicht sauber — stash oder commit zuerst." >&2; exit 1; }
   ```

3. **Branch stimmt mit agent-lock claim überein:**
   ```bash
   CLAIMED_BRANCH="$(jq -r '.branch' .git/agent-locks/ticket__"$TICKET_EXT_ID".json 2>/dev/null)"
   [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch — agent-lock claim = $CLAIMED_BRANCH, HEAD = $CURRENT_BRANCH." >&2; exit 1; }
   ```

Erst nach diesen drei Checks darf `git commit` und `git push -u origin "$CURRENT_BRANCH"` laufen.
```

### Acceptance
- `tests/spec/agent-lock-session-identity.bats` — tests 3 + 4 (M2) GREEN; test 5 + 6 (M3) still RED.

Commit: `fix(dev-flow-plan): pre-commit guard against stale-commit-on-main [T001268]`.

## Task 4 — ST-2 BATS check

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
# Expected: 4/6 GREEN (M1 + M2), 2/6 still RED (M3)
```

If test 3 or 4 still fails: re-check the German + English phrases — the test uses both languages to be robust.

## Task 5 — ST-3: Push-verification checkpoint in dev-flow-execute

### Requirement
`.claude/skills/dev-flow-execute/SKILL.md` Schritt 7 ("Plan & OpenSpec archivieren") MUST include an explicit push-verification block that:
- Runs `git push -u origin "$ARCHIVE_BRANCH"` and asserts exit 0.
- Runs `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` and asserts the pushed SHA matches the local HEAD.
- Requires the subagent return contract to include `push_verified:<sha>` alongside "Plan archived: ja".
- Refuses to advance to merge / ticket-archive if `push_verified` is missing.

### target_files
- `.claude/skills/dev-flow-execute/SKILL.md` (modify, +~12 lines)

### Implementation sketch (insert between "git add openspec/changes/..." and "git commit -m chore(plans): archive..." in Schritt 7)

```markdown
**Push-Verification Checkpoint (PFLICHT — Schritt 7):**

Bevor der archive commit als "erledigt" gilt, MUSS der Subagent beweisen, dass der Commit auf origin ist:

```bash
# 1. Push muss exit 0 liefern
git push -u origin "$ARCHIVE_BRANCH" || { echo "FATAL: archive push fehlgeschlagen" >&2; exit 1; }

# 2. ls-remote muss den lokalen HEAD-SHA zeigen
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$ARCHIVE_BRANCH" | awk '{print $1}')"
[ "$LOCAL_SHA" = "$REMOTE_SHA" ] || { echo "FATAL: local=$LOCAL_SHA remote=$REMOTE_SHA" >&2; exit 1; }
```

**Subagent Return Contract (Pflicht-Felder):**
- `push_verified:<sha>` (== `LOCAL_SHA` oben)
- `plan_archived: ja`
- `pr_url: <URL>` (nach `gh pr create`)

Der Orchestrator darf Schritt 6.4 / 6.5 / 7 nicht starten, wenn `push_verified:` fehlt.
```

### Acceptance
- `tests/spec/agent-lock-session-identity.bats` — all 6/6 GREEN.

Commit: `fix(dev-flow-execute): push-verification checkpoint + subagent return contract [T001268]`.

## Task 6 — ST-3 BATS check

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
# Expected: 6/6 GREEN
```

If any test still fails: re-check the test grep patterns and the skill text — the test uses both English and German patterns to be robust.

## Task 7 — Full verify gate

```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:openspec
```

All four must exit 0. If `freshness:check` reports missing artifacts, run `task freshness:regenerate` and commit the regenerated artifacts as a separate chore commit on the same branch.

## Task 8 — Open PR + auto-merge

```bash
git push origin fix/t001268-agent-lock-dev-flow-mishaps
gh pr create \
  --title "fix(agent-lock): harness-stable identity + pre-commit guards + push verification [T001268]" \
  --body "$(cat openspec/changes/agent-lock-dev-flow-mishaps/tasks.md | head -60)" \
  --base main
gh pr merge --auto --squash --delete-branch
```

Wait for CI green (Offline Tests + Security Scan + Conventional Commits — the E2E PR check is informational, see `ci.yml`). After merge:

```bash
# Cleanup local worktree (run from main repo, NOT the worktree):
git worktree remove /tmp/wt-t001268-agent-lock-dev-flow-mishaps --force
git branch -D fix/t001268-agent-lock-dev-flow-mishaps
# Release agent-lock claims:
bash scripts/agent-lock.sh release ticket T001268
bash scripts/agent-lock.sh release branch fix/t001268-agent-lock-dev-flow-mishaps
```

---

## File-Size Budgets (S1 ratchet — pre-flight)

Before starting, verify each file's growth budget against the baseline. Run:

```bash
for f in scripts/agent-lock.sh .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md; do
  echo "=== $f ==="
  wc -l "$f"
  jq -r --arg p "$f" '."S1:\($p)".metric // "nicht-baselined"' docs/code-quality/baseline.json 2>/dev/null
done
```

For each file: if `nicht-baselined` → use the static extension limit (`.sh` = 600, `.md` = ungated). If baselined, the budget = (static_limit − baseline_metric); the per-file estimates above (10/15/12 lines) are well within any reasonable budget. If a file is >80 % of its effective limit, the executor must plan a real module split instead of just appending.

---

## Stop Conditions

- If Task 0 shows a GREEN test before the fix: STOP. The bug doesn't reproduce; re-investigate the mishap description.
- If Task 2 / Task 4 / Task 6 shows a regression (a previously GREEN test goes RED): STOP. The fix broke a non-target invariant.
- If `task test:changed` reports >50 changed files in the verify run: STOP. The fix touched unrelated files; revert and re-apply surgically.

---

## Notes for dev-flow-execute subagent

- All three sub-tasks touch separate files. Land them as three commits on the same branch so the PR diff is reviewable.
- The pre-commit guard in ST-2 is *documentation*, not enforced by a script. The BATS test asserts the *text exists*; it does not assert a subagent will follow the rule. The orchestrator is the enforcement layer.
- The `push_verified:` field in the subagent return contract (ST-3) is a **new field** that does not yet exist in any orchestrator parsing code. ST-3 just adds the rule to the skill text. A follow-up orchestrator-side enforcement is a separate ticket (T00xxxx).
- The `CLAUDE_SESSION_ID` env var is harness-provided. If the harness version changes, the fallback to `AGENT_LOCK_SID` and then `ps -o sess=` keeps the script working — the test override `AGENT_LOCK_SID` is the long-term safety net.
