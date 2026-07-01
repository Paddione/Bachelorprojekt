---
title: "devflow-plan-ticket-claim — Implementation Plan"
ticket_id: T001386
domains: [dev-flow, skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-plan-ticket-claim — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where `dev-flow-plan`'s Feature-Pfad never creates the
ticket-scoped `agent-lock.sh` claim that its own Schritt 5 Pre-Commit-Guard reads,
which currently produces a false-negative `FATAL: branch mismatch` failure.

**Architecture:** Skill-text-only fix inside `.claude/skills/dev-flow-plan/SKILL.md`.
No script or runtime logic changes — `agent-lock.sh claim ticket` already exists and
is idempotent for repeat claims by the same session (used correctly by the Fix-Pfad's
Schritt 2.5 today). We add the missing invocation of that existing command at the two
points in the Feature-Pfad where the ticket ID becomes known, and harden the Schritt 5
guard to fail loudly (not silently) when the claim is still missing.

**Tech Stack:** Bash (`scripts/agent-lock.sh`), Markdown (SKILL.md), BATS (test).

## Global Constraints

- Only `.claude/skills/dev-flow-plan/SKILL.md` is a code-adjacent target file for the
  fix itself; `tests/spec/agent-lock-session-identity.bats` carries the RED→GREEN test.
- No changes to `scripts/agent-lock.sh` — its `claim` subcommand is idempotent for
  repeat claims by the same session already (see T001268 ST-1, `_sid_alive`), so no new
  script behavior is required.
- Fix-Pfad text in the same SKILL.md file is out of scope (already correct — Schritt 2.5
  claims both `ticket` and `branch`).

---

## File Structure

```
tests/spec/agent-lock-session-identity.bats   # MODIFY — 3 new @test blocks (already added, RED-confirmed)
.claude/skills/dev-flow-plan/SKILL.md         # MODIFY — Feature-Pfad Schritt B.1, Schritt 4.5, Schritt 5
openspec/changes/devflow-plan-ticket-claim/   # this change folder (proposal.md, tasks.md, specs/dev-flow-plan.md)
```

---

### Task 1: Failing test for the missing ticket-claim step (RED — already staged)

**Files:**
- Modify: `tests/spec/agent-lock-session-identity.bats` (already modified on this branch — 3 new `@test` blocks appended after the existing T001268-M3 tests, lines 96-133)

**Interfaces:**
- Consumes: `$PLAN_SKILL` (`setup()` var, already defined in the file: `"$REPO/.claude/skills/dev-flow-plan/SKILL.md"`)
- Produces: nothing consumed by later tasks — this is a static text-contract check.

- [ ] **Step 1: Confirm the failing tests are present and RED on the current branch**

The three `@test` blocks below are already appended to
`tests/spec/agent-lock-session-identity.bats` (verify with `git diff` / `git status` —
they should show as unstaged additions on `fix/t001386-devflow-plan-ticket-claim`):

```bash
@test "T001386: dev-flow-plan Feature-Pfad Schritt B.1 claims ticket when TICKET_EXT_ID is already known" {
  [ -f "$PLAN_SKILL" ]
  awk '/^#### Schritt B\.1:/{flag=1} /^#### Schritt B\.2:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Feature-Pfad Schritt 4.5 claims ticket after ticket creation, before Schritt 5" {
  [ -f "$PLAN_SKILL" ]
  awk '/^### Schritt 4\.5:/{flag=1} /^### Schritt 5:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Schritt 5 Pre-Commit-Guard checks lock-file existence before reading it" {
  [ -f "$PLAN_SKILL" ]
  awk '/^### Schritt 5:/{flag=1} /^### Schritt 6:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eqi '\-f[[:space:]]+"?\$LOCK_FILE"?|kein[[:space:]]+ticket-scoped[[:space:]]+agent-lock'
}
```

If this file does not yet contain these three blocks on your checkout, add them now at
the end of the file (after the existing `T001268-M3` tests), matching indentation and
style of the surrounding blocks.

- [ ] **Step 2: Run the test file and confirm all three new tests FAIL**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
```

expected: FAIL — tests 7, 8, 9 (the three `T001386:` blocks) must print `not ok`,
while tests 1-6 (`T001268-*`) stay `ok` (they must not regress). Confirmed on this
branch prior to the fix: exit status 1, tests 7/8/9 failing with
`` `| grep -Eq …' failed ``.

- [ ] **Step 3: Stage the test file (commit happens together with the plan in Task 3)**

```bash
git add tests/spec/agent-lock-session-identity.bats
```

---

### Task 2: Add the missing `claim ticket` steps + harden the Schritt 5 guard

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`
  - Schritt B.1 (`#### Schritt B.1: Worktree anlegen`)
  - Schritt 4.5 (`### Schritt 4.5: Ticket anlegen oder wiederverwenden`)
  - Schritt 5 (`### Schritt 5: Commit & Push — dann STOPP`, Pre-Commit Guard check 3)

**Interfaces:**
- Consumes: existing `bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <w> --label <l>` CLI contract (unchanged, defined in `scripts/agent-lock.sh`; already used correctly by the Fix-Pfad's Schritt 2.5 in the same file).
- Produces: `.git/agent-locks/ticket__$TICKET_EXT_ID.json` now exists on the Feature-Pfad by the time Schritt 5 runs — this is what Task 1's tests assert textually, and what makes the Schritt 5 guard's `jq -r '.branch'` read meaningful instead of reading a non-existent file.

- [ ] **Step 1: Edit Schritt B.1 — add conditional ticket claim next to the existing branch claim**

In `.claude/skills/dev-flow-plan/SKILL.md`, locate the `#### Schritt B.1: Worktree anlegen`
section (Feature-Pfad, Phase B). Its current content is:

```markdown
#### Schritt B.1: Worktree anlegen
Erstelle den Worktree NACH dem Propose (niemals `.claude/worktrees/` verwenden!):
\`\`\`bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>

# Doppelarbeit verhindern: Branch claimen (Session-Koordination [T000510]).
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
  || { echo "🛑 Branch wird bereits von einer anderen Session bearbeitet — koordinieren oder anderen slug wählen."; exit 1; }
\`\`\`
```

Replace it with (adds the conditional ticket-claim block right after the branch claim):

```markdown
#### Schritt B.1: Worktree anlegen
Erstelle den Worktree NACH dem Propose (niemals `.claude/worktrees/` verwenden!):
\`\`\`bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>

# Doppelarbeit verhindern: Branch claimen (Session-Koordination [T000510]).
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
  || { echo "🛑 Branch wird bereits von einer anderen Session bearbeitet — koordinieren oder anderen slug wählen."; exit 1; }

# Ticket-Claim (Session-Koordination [T000510]) — nur falls die Ticket-ID schon bekannt
# ist (z. B. von feature-intake übergeben). Ist noch keine Ticket-ID bekannt, holt
# Schritt 4.5 den Claim nach, sobald das Ticket dort angelegt/wiederverwendet wird. [T001386]
if [[ -n "${TICKET_EXT_ID:-}" ]]; then
  bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
    --branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
    || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
fi
\`\`\`
```

- [ ] **Step 2: Edit Schritt 4.5 — add the ticket claim right after ticket creation/reuse, before Schritt 5**

Locate `### Schritt 4.5: Ticket anlegen oder wiederverwenden`. After the existing
`stage_plan`/`stage-plan` block (both the MCP-first line and the bash fallback block)
and the `ticket-attach.sh`-Hinweis at the end of the section, append a new paragraph +
code block (still inside Schritt 4.5, before the `### Schritt 5:` heading):

```markdown
Hänge gesammelte Assets mit `bash scripts/ticket-attach.sh "$TICKET_UUID" <pfade>` an.

Ticket-Claim jetzt nachholen (Session-Koordination [T000510]) — der Feature-Pfad kennt
die Ticket-ID erst ab hier; Schritt 5's Pre-Commit-Guard prüft ticket-scoped und braucht
diesen Claim VOR dem Commit. Falls Schritt B.1 den Claim bereits gesetzt hat (Ticket-ID
war vorab bekannt), ist ein erneuter Claim durch dieselbe Session ein no-op-Refresh
(kein Fehler):
\`\`\`bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "$(git branch --show-current)" --worktree "$(pwd)" --label dev-flow-plan \
  || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
\`\`\`
```

- [ ] **Step 3: Harden the Schritt 5 Pre-Commit-Guard check 3 (explicit lock-file existence check)**

Locate `### Schritt 5: Commit & Push — dann STOPP`, "Pre-Commit Guard" block, check 3
("Branch stimmt mit agent-lock claim überein"). Current content:

```markdown
3. **Branch stimmt mit agent-lock claim überein:**
   \`\`\`bash
   CLAIMED_BRANCH="$(jq -r '.branch' .git/agent-locks/ticket__"$TICKET_EXT_ID".json 2>/dev/null)"
   [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch — agent-lock claim = $CLAIMED_BRANCH, HEAD = $CURRENT_BRANCH." >&2; exit 1; }
   \`\`\`
```

Replace it with (adds an explicit existence check before the `jq` read, so a missing
claim fails loudly and distinctly from a real branch mismatch):

```markdown
3. **Branch stimmt mit agent-lock claim überein:**
   \`\`\`bash
   LOCK_FILE=".git/agent-locks/ticket__${TICKET_EXT_ID}.json"
   [ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock-Claim für $TICKET_EXT_ID gefunden ($LOCK_FILE fehlt) — claim zuerst mit agent-lock.sh claim ticket (siehe Schritt B.1 / Schritt 4.5)." >&2; exit 1; }
   CLAIMED_BRANCH="$(jq -r '.branch' "$LOCK_FILE" 2>/dev/null)"
   [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch — agent-lock claim = $CLAIMED_BRANCH, HEAD = $CURRENT_BRANCH." >&2; exit 1; }
   \`\`\`
```

- [ ] **Step 4: Run the test file and confirm all tests now PASS**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
```

Expected: PASS — all 9 tests `ok` (the 6 pre-existing `T001268-*` tests unchanged plus
the 3 new `T001386:` tests now green).

- [ ] **Step 5: Commit the SKILL.md fix together with the test file**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md tests/spec/agent-lock-session-identity.bats
git commit -m "fix(dev-flow-plan): add explicit ticket-claim step before pre-commit guard [T001386]"
```

---

### Task 3: Stage the plan and push (dev-flow-plan Schritt 4.5 / Fix-Pfad Schritt 4.5 + 5 handoff)

**Files:**
- No new files — this task performs the ticket-staging + push handoff that dev-flow-plan's
  own Fix-Pfad Schritt 4.5/5 documents for every fix ticket, applied to this ticket itself.

**Interfaces:**
- Consumes: `TICKET_EXT_ID=T001386`, branch `fix/t001386-devflow-plan-ticket-claim`, plan path `openspec/changes/devflow-plan-ticket-claim/tasks.md`.
- Produces: ticket `T001386` status `plan_staged` in the tickets DB (SSOT for `dev-flow-execute`).

- [ ] **Step 1: Stage the plan against the ticket**

```bash
# MCP-first
# mcp__ticket-mcp__stage_plan({ id: "T001386", branch: "fix/t001386-devflow-plan-ticket-claim", plan: "openspec/changes/devflow-plan-ticket-claim/tasks.md" })

# Fallback:
./scripts/ticket.sh stage-plan \
  --id "T001386" \
  --branch "fix/t001386-devflow-plan-ticket-claim" \
  --plan "openspec/changes/devflow-plan-ticket-claim/tasks.md"
```

- [ ] **Step 2: Final Verification — the three mandatory CI-equivalent gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

All three must exit 0. `task test:changed` picks up the modified
`tests/spec/agent-lock-session-identity.bats` via its smart-diff test selection and
must report all 9 `@test` blocks passing. `task freshness:regenerate` +
`task freshness:check` must show no drift (this change only touches a skill Markdown
file, a BATS test file, and its own `openspec/changes/` folder — no generated-artifact
inputs).

- [ ] **Step 3: Commit and push the OpenSpec change folder + plan staging**

```bash
git add openspec/changes/devflow-plan-ticket-claim/
git commit -m "chore(plans): stage devflow-plan-ticket-claim for execution [T001386]"
git push -u origin fix/t001386-devflow-plan-ticket-claim
```

**STOP after this task.** Do not open a PR here — `dev-flow-execute` picks up the staged
plan from the ticket DB and drives implementation, verification, PR creation, and merge.
