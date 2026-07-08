---
title: "harness-workflow-split — Implementation Plan"
ticket_id: T001611
domains: [skills, agents, opencode, dev-tooling, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# harness-workflow-split — Implementation Plan

_Ticket: T001611 · Design-SSOT: `docs/superpowers/specs/2026-07-04-harness-workflow-split-design.md`_

Two coding harnesses share this repo: Claude Code (full toolset) and opencode
(second harness, own orchestration plugins). The planning/orchestration skills
(`dev-flow-plan`/`-execute`/`-chore`, `git-workflow`) exist only Claude-side, and the
four shared `openspec-*` skills carry Claude-only tool syntax opencode cannot execute.
This change gives opencode its own workflow skills built on its own primitives,
cleans the shared skills to be harness-neutral, rewrites the `AGENTS.md` dispatch
protocol to be opencode-native, and adds a durable generated `harness` map.

## Plan-time verification of the two `warn`-risks from `intel.json`

Both unverified-API risks were resolved by reading the real sources before authoring:

- **`background-agents.ts` API** (`.opencode/skills/dev-flow/background-agents.ts`, 1983 lines):
  exposes `delegate(prompt, agent)` for **read-only** sub-agents (edit/write/bash denied)
  — returns an id immediately, async; result retrieved with `delegation_read(id)`; list via
  `delegation_list()` (never poll). **Write-capable** sub-agents use opencode's native
  write-capable delegation (the plugin blocks read-only agents from it and blocks
  write-capable agents from `delegate`). The `delegate` tool's args are `prompt` (English)
  and `agent` (agent name). Injected `DELEGATION_RULES` document the routing.
- **`worktree.ts` API + git-crypt gap** (`.opencode/skills/dev-flow/worktree.ts`, 1215 lines;
  helpers in `.opencode/skills/dev-flow/plugins/worktree/`): exposes tools `worktree_create` and
  `worktree_delete`. `createWorktree()` runs `git worktree add <path> <branch>` (existing)
  or `git worktree add -b <branch> <path> <base>` (new) **with checkout and NO git-crypt
  handling**. `grep -rniE 'git.?crypt|smudge' .opencode/skills/dev-flow/worktree.ts .opencode/skills/dev-flow/plugins/worktree/`
  returns **nothing**. By contrast `scripts/worktree-create.sh` copies the git-crypt key
  and neutralizes the `smudge`/`clean`/`required` filters (T000426/T001331/T001332). So on
  this git-crypt-managed repo a bare `worktree_create` would fail checkout (exit 128) on
  encrypted paths or leave `environments/.secrets/**` encrypted-at-rest with a stale smudge
  filter. **Resolution (design-sanctioned, "Wrapper-Skript statt direktem Plugin-Aufruf"):**
  the opencode skills create worktrees via `scripts/worktree-create.sh` and document the
  `worktree.ts` limitation as a known constraint; `worktree_create` is referenced only as
  an opencode-native convenience for git-crypt-free branches.
- **opencode MCP-call syntax** (bonus finding): `.opencode/commands/opsx-*.md` drive
  OpenSpec through the `openspec` **bash CLI**, and `.opencode/opencode.jsonc`'s
  `/feature-intake` template calls `mcp__mcp-postgres__query` — i.e. opencode uses the
  **same** `mcp__server__tool` syntax as Claude. The opencode skills therefore prefer bash
  CLI (`openspec`, `task`, `scripts/*.sh`, `gh-axi`) and use `mcp__mcp-postgres__query`
  (identical to Claude) with a kubectl fallback where a DB read is unavoidable.

## Forbidden-token contract (single definition, reused by every BATS guard)

The Claude-only tokens the guards forbid are exactly: `AskUserQuestion`, `TodoWrite`,
`subagent_type`, `Task tool`. Rationale: these four are unambiguous Claude/dispatch-tool
signatures. Bare `task`/`Task` is **deliberately excluded** — it collides with the go-task
command (`task test:changed`), the OpenSpec noun "task" ("Task list", "✓ Task complete" in
`openspec-apply-change`), and the `worktree_create`/write-capable native tool — matching on
it would false-positive. `subagent_type` is the precise marker of a Claude `Task`-tool call,
so banning it (plus the `Task tool` phrase) bans the primitive without the false positives.
The BATS regex is `AskUserQuestion|TodoWrite|subagent_type|Task tool` everywhere below.

## File Structure

```
NEW  .opencode/skills/opencode-flow-plan/SKILL.md        markdown — not S1-gated
NEW  .opencode/skills/opencode-flow-execute/SKILL.md     markdown — not S1-gated
NEW  .opencode/skills/opencode-flow-chore/SKILL.md       markdown — not S1-gated
NEW  .opencode/skills/opencode-git-workflow/SKILL.md     markdown — not S1-gated
NEW  tests/spec/harness-workflow-split.bats              bats     — not S1-gated
NEW  scripts/agent-guide/fixtures/bad-harness/*.yaml     yaml     — not S1-gated (5 files, copy of good/)
EDIT .claude/skills/openspec-propose/SKILL.md            markdown — not S1-gated (Ist 119)
EDIT .claude/skills/openspec-apply-change/SKILL.md       markdown — not S1-gated (Ist 156)
EDIT .claude/skills/openspec-archive-change/SKILL.md     markdown — not S1-gated (Ist 114)
     .claude/skills/openspec-explore/SKILL.md            VERIFY-ONLY (already token-free, Ist 288)
EDIT AGENTS.md                                           markdown — not S1-gated (Ist 237)
EDIT docs/agent-guide/registry/tools.yaml                yaml     — not S1-gated (Ist 240; +harness on 16, +4 opencode entries)
EDIT scripts/agent-guide/validate.mjs                    .mjs Ist 142 · limit 500 · not baselined → Budget 358 (adds ~4 lines)
EDIT scripts/agent-guide/emit-maps.mjs                   .mjs Ist 291 · limit 500 · not baselined → Budget 209 (adds ~2 lines)
EDIT scripts/agent-guide/emit-maps.test.mjs              .mjs Ist 344 · limit 500 · not baselined → Budget 156 (header assert + fixture harness)
EDIT scripts/agent-guide/validate.test.mjs              .mjs Ist  67 · limit 500 · not baselined → Budget 433 (adds one harness test)
EDIT scripts/agent-guide/fixtures/good/tools.yaml        yaml     — not S1-gated (add harness to the one tool)
REGEN docs/agent-guide/maps/tools-map.md                 generated (Harness column)
REGEN docs/agent-guide/maps/danger-map.md                generated (4 new caution-tier skills listed)
REGEN docs/agent-guide/20-werkzeuge.md                   generated (4 new skill rows)
REGEN website/src/lib/agent-guide.generated.json         generated (4 new tool objects; `harness` intentionally NOT emitted here)
REGEN website/src/data/test-inventory.json               generated (new BATS file)
```

S1 note: only `validate.mjs` and `emit-maps.mjs` (+ their test files) are S1-gated `.mjs`
files; all carry ≥156 lines of headroom under the 500-line limit for the tiny additions
here — no split needed. Every other touched file is markdown / yaml / bats and not S1-gated.
No baseline entries are added. No explicit any-types are introduced (no `website/src/**`
runtime code changes; `agent-guide.generated.json` is regenerated data, not hand-written).

<!-- vitest: kein neuer Vitest-Test nötig — es werden keine website/src/lib- oder
     website/src/pages/api-Dateien angelegt/geändert; die neue Logik (harness-Validierung,
     Harness-Spalte) ist mit node:test in scripts/agent-guide/*.test.mjs abgedeckt. -->

---

## Task 1 — BATS guard contract (RED anchor)

**Goal:** create `tests/spec/harness-workflow-split.bats` holding the full structural
contract for every subsystem below. It must FAIL now (nothing is implemented yet). This is
the plan's RED step. The file is auto-discovered by the `tests/spec/*.bats` glob
(`Taskfile.yml` `test:factory-offline`, line 738).

**Files:** `tests/spec/harness-workflow-split.bats` (new); `website/src/data/test-inventory.json` (regen).

Write these `@test`s (grep/`run`-based, FA-SF-7x style from `tests/spec/software-factory.bats`):

```bash
#!/usr/bin/env bats
# T001611 harness-workflow-split — one file per OpenSpec SSOT spec (harness-workflow-split).
# Forbidden Claude-only tokens (see plan "Forbidden-token contract"):
FORBIDDEN='AskUserQuestion|TodoWrite|subagent_type|Task tool'
OPENSPEC_SKILLS='openspec-propose openspec-apply-change openspec-archive-change openspec-explore'
OC_SKILLS='opencode-flow-plan opencode-flow-execute opencode-flow-chore opencode-git-workflow'

@test "HWS-1: the four opencode-flow/-git-workflow skills exist" {
  for s in $OC_SKILLS; do [ -f ".opencode/skills/$s/SKILL.md" ]; done
}

@test "HWS-2: opencode skills carry no Claude-only tool syntax" {
  for s in $OC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".opencode/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-3: opencode skills reference both opencode primitives (collectively)" {
  grep -rqF 'background-agents.ts' .opencode/skills/opencode-flow-plan .opencode/skills/opencode-flow-execute
  grep -rqF 'worktree.ts' .opencode/skills
}

@test "HWS-4: opencode-git-workflow uses the git-crypt-safe worktree wrapper" {
  grep -qF 'scripts/worktree-create.sh' .opencode/skills/opencode-git-workflow/SKILL.md
}

@test "HWS-5: opencode-flow-execute/-chore call the opencode-git-workflow skill" {
  grep -qF 'opencode-git-workflow' .opencode/skills/opencode-flow-execute/SKILL.md
  grep -qF 'opencode-git-workflow' .opencode/skills/opencode-flow-chore/SKILL.md
}

@test "HWS-6: shared openspec-* skills are free of Claude-only tool syntax" {
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-7: openspec-archive-change retains its delegation instruction" {
  grep -qF 'openspec-sync-specs' .claude/skills/openspec-archive-change/SKILL.md
}

@test "HWS-8: AGENTS.md Skill Dispatch Protocol is opencode-native" {
  # extract the '## Skill Dispatch Protocol' section body (up to the next H2)
  local awkp='/^## Skill Dispatch Protocol/{f=1;next} f&&/^## /{f=0} f'
  run bash -c "awk '$awkp' AGENTS.md | grep -nE '$FORBIDDEN'"
  [ "$status" -ne 0 ]   # no Claude-only tokens in the section
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'background-agents.ts'"
  [ "$status" -eq 0 ]
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'delegate'"
  [ "$status" -eq 0 ]
}

@test "HWS-9: tools.yaml has a harness field on every entry" {
  local ids harnesses
  ids="$(grep -cE '^- id:' docs/agent-guide/registry/tools.yaml)"
  harnesses="$(grep -cE '^  harness:' docs/agent-guide/registry/tools.yaml)"
  [ "$ids" -eq "$harnesses" ]
}

@test "HWS-10: tools.yaml carries at least one opencode-tagged entry" {
  grep -qE '^  harness:[[:space:]]*opencode' docs/agent-guide/registry/tools.yaml
}

@test "HWS-11: tools-map.md renders a Harness column" {
  grep -qF '| Harness |' docs/agent-guide/maps/tools-map.md
}

@test "HWS-12: agent-guide registry validates (harness schema included)" {
  run node scripts/agent-guide/validate.mjs
  [ "$status" -eq 0 ]
}

# ── Antigravity guard (home-dir state, skip-when-absent — mcp-tooling.bats pattern) ──
@test "HWS-13: Antigravity inherits the cleaned openspec-* skills (repo is the source)" {
  # Antigravity (~/.gemini/antigravity-cli/) is a Claude-Code instance that reads the repo
  # .claude/skills/ directly, so the cleanup applies to it automatically.
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-14: host antigravity-cli carries no shadowing dirty openspec-* copy" {
  local ag="$HOME/.gemini/antigravity-cli"
  [ -d "$ag" ] || skip "antigravity-cli not installed on this machine"
  run bash -c "find \"$ag\" -path '*openspec-*/SKILL.md' -exec grep -lE \"$FORBIDDEN\" {} + 2>/dev/null"
  [ -z "$output" ]
}
```

- [ ] **RED step.** Add the file, regenerate the inventory, then run it:

```bash
task test:inventory   # regenerate website/src/data/test-inventory.json (new BATS file)
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats
# expected: FAIL (red — skills/cleanup/registry not yet implemented; only HWS-13/14 may pass)
```

**Assertion-consistency note:** every regex above matches the exact strings produced by the
later tasks — `FORBIDDEN` matches the tokens each cleanup removes (Task 6/7), `| Harness |`
matches the header emitted in Task 8, `scripts/worktree-create.sh` matches Task 2's snippet,
`background-agents.ts`/`delegate` match Task 7's rewrite.

---

## Task 2 — `opencode-git-workflow` skill (the hard dependency, built first)

**Goal:** port `.claude/skills/git-workflow/SKILL.md` to
`.opencode/skills/opencode-git-workflow/SKILL.md`. `git-workflow` is already almost
harness-neutral (pure bash: `git`/`gh`/`gh-axi`/`task`/`scripts/*.sh`), so the commit →
push → PR-preflight → CI-fix-loop → `gh pr merge --auto --squash --delete-branch` →
worktree-cleanup steps are copied verbatim. Only the two harness-specific pieces change:

- Frontmatter: `name: opencode-git-workflow`, `description:` mirroring git-workflow's.
- Worktree creation/cleanup: reference `scripts/worktree-create.sh` (git-crypt-safe) as the
  canonical creator, and add a **Known limitation** note: `worktree.ts`'s `worktree_create`
  opens an isolated terminal but runs `git worktree add` with checkout and no git-crypt
  filter neutralization, so it is unsafe for branches touching `environments/.secrets/**` —
  use `scripts/worktree-create.sh` there. Keep the git-crypt staging guard (never
  `git add -A`; the `^environments/.secrets/` index guard) and the `HEAD_SHA != BASE_SHA`
  commit-verification block verbatim (both are bash, harness-agnostic).
- Replace the two `superpowers:*` "Verwandte Skills" rows (`using-git-worktrees`,
  `finishing-a-development-branch`) with references to `worktree.ts` / `scripts/worktree-create.sh`.

The skill body MUST reference both `worktree.ts` (as the opencode-native primitive, with its
limitation) and `scripts/worktree-create.sh` (the git-crypt-safe path it actually uses). It
MUST contain none of `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`.

- [ ] **GREEN step.** After writing the file, HWS-1/-2/-3/-4 turn green:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-1|HWS-2|HWS-3|HWS-4'
# expected: PASS for opencode-git-workflow's contribution (HWS-1 still needs the other 3 files)
```

---

## Task 3 — `opencode-flow-plan` skill

**Goal:** port `.claude/skills/dev-flow-plan/SKILL.md` to
`.opencode/skills/opencode-flow-plan/SKILL.md`, keeping the structure (path choice
feature/fix/chore → brainstorming → worktree → spec/plan → commit+push+stop) and swapping
primitives:

- Worktree setup: `bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>`
  (git-crypt-safe; reference `worktree.ts` as the opencode-native alternative with its
  git-crypt limitation).
- Plan-writing delegation: since plan-authoring is read-only research/meta-work, delegate it
  via `background-agents.ts` — `delegate(prompt: "<plan-writing task>", agent: "explore")`
  or an equivalent read-only sub-agent; retrieve with `delegation_read(id)`. If
  `background-agents.ts` is unavailable, write the plan inline in the main session (the
  Lavish-review-gate fallback pattern from the design's Fehlerbehandlung).
- Structured questions (`AskUserQuestion` in the Claude original) → plain-text questions in
  the chat. Progress tracking (`TodoWrite`) → a plain-text checklist in the reply.
- Reuse the shared, cleaned `openspec-*` skills for the OpenSpec lifecycle (via
  `.opencode/skills/openspec-*` symlinks) and the `openspec` bash CLI (as `opsx-*.md` do).
- The final plan-write directive keeps the repo's plan-quality contract: reference
  `.claude/skills/references/plan-quality-gates.md`, require the three mandatory verify
  commands in the plan's last task, and run `bash scripts/openspec.sh validate` before commit.

MUST reference `background-agents.ts` and `worktree.ts`/`scripts/worktree-create.sh`; MUST
contain none of the forbidden tokens.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-2|HWS-3'
# expected: PASS (opencode-flow-plan is token-free and references background-agents.ts)
```

---

## Task 4 — `opencode-flow-execute` skill

**Goal:** port `.claude/skills/dev-flow-execute/SKILL.md` to
`.opencode/skills/opencode-flow-execute/SKILL.md`:

- Pick the staged plan; when several are staged, **ask the user in plain text** for the
  ticket id (the `AskUserQuestion` line in the original becomes a text question).
- Worktree: `bash scripts/worktree-create.sh "$CURRENT_BRANCH" /tmp/wt-<slug>` (verbatim
  bash, git-crypt-safe).
- Implementer delegation: mirror the original's single-implementer rule (no per-task
  fan-out). For opencode this is a **write-capable** sub-agent → opencode's native
  write-capable delegation (NOT `delegate`, which is read-only-only, per
  `background-agents.ts`); reference `background-agents.ts` for the routing rule. Inline
  fallback if delegation is unavailable.
- Commit → Push → PR → Merge: delegate to **`opencode-git-workflow` Steps 2–6** (SSOT),
  exactly as the Claude original defers to `git-workflow`.

MUST reference `background-agents.ts`, `worktree.ts`/`scripts/worktree-create.sh`, and
`opencode-git-workflow`; MUST contain none of the forbidden tokens.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-2|HWS-3|HWS-5'
# expected: PASS (references opencode-git-workflow; token-free; primitives present)
```

---

## Task 5 — `opencode-flow-chore` skill

**Goal:** port `.claude/skills/dev-flow-chore/SKILL.md` to
`.opencode/skills/opencode-flow-chore/SKILL.md`. Chores execute + merge inline (no plan
handoff, no subagent fan-out), so:

- Worktree: `bash scripts/worktree-create.sh chore/<slug> /tmp/wt-<slug>` (git-crypt-safe;
  reference `worktree.ts` with its limitation to satisfy the collective primitive contract).
- Commit → Push → CI-fix-loop → Merge: defer to **`opencode-git-workflow` Steps 2–6/7**
  (SSOT), mirroring the Claude original's deferral to `git-workflow`.
- No structured-question / todo-tool usage — plain text throughout.

MUST reference `worktree.ts`/`scripts/worktree-create.sh` and `opencode-git-workflow`; MUST
contain none of the forbidden tokens.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-1|HWS-2|HWS-3|HWS-5'
# expected: PASS (all four opencode SKILL.md files now exist and are token-free)
```

---

## Task 6 — Clean the shared `openspec-*` skills (harness-neutral)

**Goal:** remove Claude-only tool syntax from the three affected shared skills while keeping
each mechanical and keeping the sole delegation instruction. `openspec-explore/SKILL.md` is
**already token-free** (verified: `grep -nE 'AskUserQuestion|TodoWrite|subagent_type|Task tool'`
returns nothing) — verify only, no edit. Exact edits:

`.claude/skills/openspec-propose/SKILL.md`
- L29 `Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:`
  → `Ask the user directly (open-ended, no preset options):`
- L52 `Use the **TodoWrite tool** to track progress through the artifacts.`
  → `Track progress through the artifacts (a short checklist in your reply is enough).`
- L88 `- Use **AskUserQuestion tool** to clarify`
  → `- Ask the user to clarify`

`.claude/skills/openspec-apply-change/SKILL.md`
- L23 `... and use the **AskUserQuestion tool** to let the user select`
  → `... and ask the user to select`
  (the generic word "Task" on L44/77/97/101/114/115 is the OpenSpec noun — leave untouched;
  the `Task tool` regex does not match "Task list"/"Task complete").

`.claude/skills/openspec-archive-change/SKILL.md`
- L20 `Use the **AskUserQuestion tool** to let the user select.` → `Ask the user to select.`
- L37 `- Use **AskUserQuestion tool** to confirm user wants to proceed`
  → `- Ask the user to confirm they want to proceed`
- L48 (same text as L37) → `- Ask the user to confirm they want to proceed`
- L66 `If user chooses sync, use Task tool (subagent_type: "general-purpose", prompt: "Use Skill tool to invoke openspec-sync-specs for change '<name>'. Delta spec analysis: <include the analyzed delta spec summary>"). Proceed to archive regardless of choice.`
  → `If the user chooses sync, delegate the spec-sync to a general sub-agent: invoke the `openspec-sync-specs` skill with the analyzed delta-spec summary (if your harness cannot delegate, perform the sync inline). Proceed to archive regardless of choice.`
  This keeps `openspec-sync-specs` (the delegation instruction stays — not dropped) while
  removing `Task tool`, `subagent_type`, and `Skill tool`.

Out of scope: `.opencode/commands/opsx-*.md` still reference Claude tokens, but they are
opencode's own command wrappers (not the shared `.claude/skills/openspec-*` files) and are
explicitly not part of this cleanup.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-6|HWS-7|HWS-13'
# expected: PASS (four openspec-* skills token-free; archive still has openspec-sync-specs)
```

---

## Task 7 — Rewrite the `AGENTS.md` Skill Dispatch Protocol (opencode-native)

**Goal:** replace the dispatch mechanism in the `## Skill Dispatch Protocol` section
(`AGENTS.md`, currently lines ~144–159) with an opencode-native description via
`background-agents.ts`. Keep the frontmatter example block (~135–142), the intro, the
`### Current skill → agent map` table (~161–171), and everything else unchanged. The
agent-routing table at the top of the file is not touched.

Replacement content for the two dispatch bullets + the `### Dispatch recipe` block:

```markdown
- **Skill HAS `agent:`** → dispatch it as a sub-agent through the `background-agents.ts`
  plugin. Read-only sub-agents (edit/write/bash denied) run via the `delegate(prompt, agent)`
  tool (async background session; retrieve the result with `delegation_read(id)`).
  Write-capable sub-agents run via opencode's native write-capable delegation (preserves
  undo/branching). The agent body (`.agents/agents/<role>.md` → `.claude/agents/<role>.md`)
  becomes the sub-agent's system prompt; the skill body + the user's request its task.
- **Skill has NO `agent:`** → workflow/orchestrator skill, loaded inline in the main session.

### Dispatch recipe (opencode)

1. Read the agent body: `.agents/agents/bachelorprojekt-<role>.md` (strip frontmatter).
2. Read the skill body: `.claude/skills/<name>/SKILL.md` (strip frontmatter).
3. For a read-only sub-agent: `delegate(prompt: "<skill body>\n\n---\n\n<request>", agent: "<role>")`.
   For a write-capable sub-agent: opencode's native write-capable delegation, selecting the
   agent by name. If `background-agents.ts` is unavailable, run the sub-step inline.
```

This uses `background-agents.ts`, `delegate`, `delegation_read`, and the `agent` parameter —
none of `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-8'
# expected: PASS (dispatch section references background-agents.ts + delegate, token-free)
```

---

## Task 8 — Registry `harness` field + tools-map Harness column + validator + tests

**Goal:** add the durable harness map. Sub-steps:

1. `docs/agent-guide/registry/tools.yaml` — add `harness:` to all 16 existing entries:
   `claude` for the 7 Claude skills (`superpowers`, `brainstorming`, `dev-flow-plan`,
   `dev-flow-chore`, `dev-flow-execute`, `dev-flow-iterate`, `dev-flow-e2e`); `both` for the
   3 tasks (`task-oracle`, `factory`, `factory-dispatch`) and the 6 routing agents
   (`agent-*`). Then add 4 new `kind: skill` entries with `harness: opencode`:
   `opencode-flow-plan`, `opencode-flow-execute`, `opencode-flow-chore`,
   `opencode-git-workflow` — each with the required fields (`name_de`, `summary_de`,
   `what_for_de`, `how_to_start_de`, `what_could_go_wrong_de`, `danger: caution`,
   `guardrails: [G-PULL-FIRST]` for plan/execute/chore, `[]` for git-workflow,
   `related: []`), `theme: entwickeln`, and no `init_prompt_de` (opencode-native, no Claude
   slash-command). This makes all three enum values (`claude`/`opencode`/`both`) live.

2. `scripts/agent-guide/validate.mjs` — make `harness` a validated required field. Add near
   the top constant `const HARNESS_VALUES = ['claude', 'opencode', 'both'];` and, inside the
   `for (const t of tools)` loop, one line:
   ```js
   req(HARNESS_VALUES.includes(t?.harness), `tools[${t?.id}]: harness '${t?.harness}' not in ${HARNESS_VALUES}`);
   ```
   (`validateRegistry(dir, repoRoot) -> { ok, errors }` — the `req(cond, msg)` helper already
   pushes to `errors`; presence + enum are both enforced by the array membership test.)

3. `scripts/agent-guide/emit-maps.mjs` — in `renderToolsMap(reg)` add the Harness column
   after `Art`:
   ```js
   out.push(row(['Id', 'Name', 'Art', 'Harness', 'Tier', 'Wofür', 'Guardrails', 'Init']));
   out.push(row(['---', '---', '---', '---', '---', '---', '---', '---']));
   ```
   and add `escapeCell(t.harness),` to the data row directly after `escapeCell(t.kind),`.
   (`escapeCell(undefined)` yields the em-dash placeholder, so the render never throws.)

4. `scripts/agent-guide/emit-maps.test.mjs` — update the tools-map header assertion (the
   `assert.ok(md.includes('| Id | Name | Art | Tier | Wofür | Guardrails | Init |'), ...)`
   line) to `'| Id | Name | Art | Harness | Tier | Wofür | Guardrails | Init |'`, and add a
   `harness` value to the in-memory `FIX_TOOLS` / per-test tool fixtures so rendered rows
   carry a real value; add an assertion `assert.ok(out.includes('opencode') || out.includes('claude'))`
   in the "three sections" test.

5. `scripts/agent-guide/validate.test.mjs` + fixtures — add `harness: claude` to
   `scripts/agent-guide/fixtures/good/tools.yaml`'s single tool (else the "good fixture
   validates with no errors" test, which asserts `res.errors.length === 0`, breaks). Add
   `harness: claude` to each `fixtures/bad-*/tools.yaml` tool so only the intended error
   fires. Create `scripts/agent-guide/fixtures/bad-harness/` (copy of `fixtures/good/*`) with
   its tool set to `harness: bogus`, and add:
   ```js
   test('missing/invalid harness is rejected', () => {
     const res = validateRegistry(join(here, 'fixtures', 'bad-harness'));
     assert.equal(res.ok, false);
     assert.ok(res.errors.some((e) => e.includes('harness')),
       `expected a harness error, got: ${JSON.stringify(res.errors)}`);
   });
   ```

6. Regenerate the maps/docs/webapp and commit them:
   ```bash
   task agent-guide:emit   # emit-maps + emit-webapp + emit-docs
   node --test scripts/agent-guide/*.test.mjs   # unit tests green
   node scripts/agent-guide/validate.mjs        # registry valid
   ```
   Note: `emit-webapp.mjs` picks named fields (no spread), so `harness` does **not** leak into
   `website/src/lib/agent-guide.generated.json`; that file changes only because of the 4 new
   tool objects, not a new column. `emit-webapp.test.mjs`/`emit-docs.test.mjs`/`load.test.mjs`
   use their own temp fixtures and are unaffected by the required-field change.

- [ ] **GREEN step.**

```bash
node --test scripts/agent-guide/validate.test.mjs scripts/agent-guide/emit-maps.test.mjs
node scripts/agent-guide/validate.mjs
task agent-guide:emit
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-9|HWS-10|HWS-11|HWS-12'
# expected: PASS (harness on every entry incl. ≥1 opencode; tools-map Harness column; validate ok)
```

**Assertion-consistency note:** HWS-11's `grep -qF '| Harness |'` matches the exact header
string emitted in sub-step 3; HWS-9 counts `^  harness:` lines against `^- id:` lines, which
sub-step 1 makes equal (20 of each); the `bad-harness` fixture's `harness: bogus` is exactly
what the validator's `HARNESS_VALUES.includes()` rejects with a message containing `harness`.

---

## Task 9 — Antigravity guard verification pass

**Goal:** the Antigravity home-dir guards (HWS-13, HWS-14) already live in the Task 1
contract (following the `tests/spec/mcp-tooling.bats` skip-when-absent pattern proven in the
archived `2026-06-28-antigravity-cli-gh-sandbox` change). This task confirms they behave:
HWS-13 asserts the repo's cleaned `.claude/skills/openspec-*` (which Antigravity reads
directly, per archived T001274) are token-free; HWS-14 skips when
`~/.gemini/antigravity-cli/` is absent (CI-safe) and otherwise asserts no shadowing dirty
`openspec-*/SKILL.md` copy exists under it. No new production files — this task edits nothing
except (if needed) tightening the two `@test`s so both are green/ skip cleanly.

- [ ] **GREEN step.**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats -f 'HWS-13|HWS-14'
# expected: PASS (HWS-13 passes after Task 6; HWS-14 passes-or-skips depending on host)
```

---

## Task 10 — Final verification (all gates)

**Goal:** prove the whole contract is green and the plan/spec/CI gates pass.

- [ ] Full BATS guard green:

```bash
task test:inventory   # ensure test-inventory.json reflects the new BATS file, then commit it
./tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats
# expected: PASS (all HWS-* green; HWS-14 skips if antigravity-cli absent)
```

- [ ] Plan + spec gates:

```bash
bash scripts/plan-lint.sh openspec/changes/harness-workflow-split/tasks.md   # F1/F2/STRUCT1-3/P1
bash scripts/openspec.sh validate                                            # delta spec well-formed
task test:openspec                                                           # vitest OpenSpec gate
```

- [ ] The three mandatory CI gates (STRUCT3):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Commit all regenerated artifacts alongside the source edits: `docs/agent-guide/maps/tools-map.md`,
`docs/agent-guide/maps/danger-map.md`, `docs/agent-guide/20-werkzeuge.md`,
`website/src/lib/agent-guide.generated.json`, `website/src/data/test-inventory.json`. Then
run the commit → push → PR flow via `git-workflow` (this repo is Claude-side for the actual
merge). Do not add any `docs/code-quality/baseline.json` entries.
