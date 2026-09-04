---
title: "Per-role tool restrictions for factory agents"
ticket_id: "T900074"
domains: ["config", "llm-local-dev"]
status: "draft"
---

# p2 — Per-Role Tool Restrictions (per-role-tools)

## File Structure

```
.opencode/agent-models.jsonc          # per-agent permission blocks (4 roles)
scripts/opencode-sync-agents.sh       # unchanged — sync stays compatible
docs/agent-guide/registry/agents.yaml # new factory_roles section
```

> Orchestrator correction (2026-09-04): subagent draft had no F1 frontmatter
> (added above) and gave the reviewer role `edit: allow`, contradicting its
> own AC2 and the spec ("Reviewer: read, diff, tests; preferably no write
> access"). Reviewer permission is `edit: deny` — diff review happens via
> read/grep; the orchestrator applies reviewer-suggested edits.

## Implementation Steps

### Step 1 — Per-agent permission blocks in `agent-models.jsonc`

Every agent under `agent.` gets a `permission` object with exactly the tools
its role needs (new field inside each agent object, after `note`).

**Implementer** — read, edit, grep, glob, list, bash, task, todowrite,
question, webfetch, external_directory, skill, lsp:

```jsonc
"permission": {
  "read": "allow", "edit": "allow", "glob": "allow", "grep": "allow",
  "list": "allow", "bash": "allow", "task": "allow", "todowrite": "allow",
  "question": "allow", "webfetch": "allow", "external_directory": "allow",
  "skill": "allow", "lsp": "allow"
}
```

**Planner** — read, grep, glob, list, bash (git only), todowrite, question,
external_directory, skill, lsp; **no edit**:

```jsonc
"permission": {
  "read": "allow", "glob": "allow", "grep": "allow", "list": "allow",
  "bash": "allow", "todowrite": "allow", "question": "allow",
  "external_directory": "allow", "skill": "allow", "lsp": "allow"
}
```

(Note: planner bash is git-only by convention, documented in the agent `note`;
if opencode V2 does not support glob-scoped bash permissions, fall back to
`bash: deny` — see risks.)

**Reviewer** — read, glob, grep, list, todowrite, question, skill, lsp;
**no edit, no bash, no task, no webfetch** (orchestrator-corrected):

```jsonc
"permission": {
  "read": "allow", "glob": "allow", "grep": "allow", "list": "allow",
  "todowrite": "allow", "question": "allow", "skill": "allow",
  "lsp": "allow"
}
```

**Dispatcher** — todowrite, question, skill, external_directory, lsp;
**no read, edit, bash, task, grep, glob, list, webfetch**:

```jsonc
"permission": {
  "todowrite": "allow", "question": "allow", "skill": "allow",
  "external_directory": "allow", "lsp": "allow"
}
```

**Role assignment** (verify against the live `agent-models.jsonc`; adjust if
the agent roster drifted): implementer = all write-capable agents
(orchestrator, gptoss/devstral/gemma/gemma12, qwen-cloud, freetoken-*,
big-pickle, ox-alpha*, deepseek-*); planner = `qwen38` (text-only);
reviewer/dispatcher roles defined with empty agent lists until
reviewer-/dispatcher-specific agents exist.

### Step 2 — Sync guard

`scripts/opencode-sync-agents.sh` does a `jq` merge of the `agent` key; new
`permission` fields sit *inside* agent objects, so the merge stays correct
and idempotent. Script itself unchanged — but the plan MUST run it and
confirm green.

### Step 3 — `factory_roles` in `agents.yaml`

New top-level `factory_roles` section (planner/implementer/reviewer/
dispatcher with permission tables + agent lists). New top-level key does not
disturb the sync script (it only touches `agent`/`provider`/`mcp`).

## Acceptance Criteria

- [ ] Every `agent.*` entry parses with a `permission` object (node check).
- [ ] Reviewer permission has no `edit`/`bash` (spec scenario "no write access").
- [ ] `bash scripts/opencode-sync-agents.sh` runs without error after the change.
- [ ] `tests/spec/agent-roster.bats` (P4.3/P4.3b) green — no model drift, no
      renames; `task agent-guide:maps` diff clean (P4.5) or map updated.

## Risks

- **Per-agent `permission` unsupported by opencode V2** → blocks ignored;
  fallback: global MCP reduction + skill denies + prompt convention.
  Document as `risks[]` entry, do not silently skip.
- **MCP servers are global, not per-agent filterable** → dispatcher reach
  documented via prompt convention ("no MCP tools").
- **`agents-map.md` drift (P4.5)** → run `task agent-guide:maps` and fix diff.

## Verification

```bash
wc -l .opencode/agent-models.jsonc scripts/opencode-sync-agents.sh docs/agent-guide/registry/agents.yaml
node -e "JSON.parse(require('fs').readFileSync('.opencode/agent-models.jsonc','utf8')); console.log('JSONC-parse-check: use json5-aware loader')"
bash scripts/opencode-sync-agents.sh
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
```

## Not in Scope

- **Tests** — p6 owns the test steps. This partial has **no** Failing-Test-Step
  by design.
- Global `permission` block in `opencode.jsonc`, prompts, AGENTS.md — other partials.
