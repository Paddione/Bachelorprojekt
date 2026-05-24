# Task Oracle — Design Spec
**Date:** 2026-05-24
**Status:** Approved

## Problem

CLAUDE.md contains ~141 lines of static `task` command documentation across 25+ sections — roughly a third of the entire file. This bloats Claude's context on every message, and is always a stale copy of information that already lives machine-readably in the 3572-line Taskfile.

## Goal

Remove all static task docs from CLAUDE.md. Replace them with a dispatcher script that Claude calls whenever it needs to run any task. The dispatcher routes to a local AI agent (Hermes or OpenClaw) that discovers the right command at call time and executes it. Claude receives the output and continues.

## Components

### 1. `scripts/task-oracle.sh` — dispatcher

Claude's only entry point for task execution. Takes a plain-English goal, tries Hermes first, falls back to OpenClaw, errors cleanly if both are unavailable.

```
bash scripts/task-oracle.sh '<goal>'
```

**Priority order:**
1. **Hermes** — free, local (`hermes3:8b` on Ollama GPU), no API cost, works offline
2. **OpenClaw** — `claude-opus-4-6`, smarter but costs tokens; used only when Hermes is down
3. **Error** — prints a hint to run `task --list` manually and exits 1

**Availability check:**
- Hermes: `hermes status 2>/dev/null | grep -q "Model:"`
- OpenClaw: `curl -sf http://localhost:18789/healthz`

**Invocation pattern for both agents:**
> "You are a task executor for the Bachelorprojekt repo at /home/patrick/Bachelorprojekt. Goal: `<goal>`. Run `task --list-all` to discover available commands, select the correct one for the goal, execute it, and return the full output."

The `--yolo` / equivalent flag is passed so the agent executes without interactive approval prompts.

### 2. Hermes — `task-runner` profile

**What changes:**
- Enable the `bash` tool in Hermes tool config
- Set working directory to `/home/patrick/Bachelorprojekt`
- Write a concise system prompt scoped to task execution (see below)

**Model:** `hermes3:8b` — already loaded on Ollama, no changes needed.

**System prompt (written to Hermes config):**
```
You are a task executor for the Bachelorprojekt Kubernetes workspace repo.
Repo root: /home/patrick/Bachelorprojekt

When given a goal:
1. Run `task --list-all` in the repo root to see all available tasks.
2. Select the single best-matching task command for the goal, including any required flags (e.g. ENV=mentolder).
3. Execute it and return the full stdout/stderr output.
4. If no task matches, say so and suggest the closest alternative.

Never ask for confirmation. Execute directly.
```

### 3. OpenClaw — `task-runner` agent

**What changes:**
- Create isolated agent: `openclaw agents add` → name `task-runner`
- Write IDENTITY.md (system prompt, same content as Hermes prompt above)
- Add exec allowlist entry for the `task` binary:
  `openclaw approvals allowlist add --agent task-runner "/usr/bin/task"`
  and the repo path pattern: `"task"` (resolved via PATH)
- Set model override: `lmstudio/qwen3-14b` (already in model registry, local, no API cost for this fallback path)

### 4. CLAUDE.md — trim

**Remove:** All 25+ task-command sections from `### Interactive task picker` through `### Testing` (lines ~47–320), including all subsection headers, command blocks, and blank lines between them.

**Replace with:**
```markdown
## Running Tasks
Never look up or hardcode task commands. Use the task oracle:
  bash scripts/task-oracle.sh '<goal in plain English>'
Examples:
  bash scripts/task-oracle.sh 'deploy website to both prod clusters'
  bash scripts/task-oracle.sh 'show pod status for mentolder'
  bash scripts/task-oracle.sh 'run all offline tests'
Routes to Hermes (local, free) → OpenClaw (fallback) → error.
```

**Keep:** agent routing table, default workflow, project overview, architecture, configuration patterns, gotchas/footguns section (lines ~320–442).

## Data flow

```
Claude
  └─ bash scripts/task-oracle.sh "deploy website to mentolder"
       ├─ hermes up?
       │    └─ hermes chat --yolo --message "Goal: deploy website... Run task --list-all..."
       │         └─ hermes3:8b → runs: task website:redeploy ENV=mentolder
       │              └─ stdout → task-oracle.sh → Claude
       └─ openclaw up?
            └─ openclaw agent --agent task-runner --message "Goal: deploy website..."
                 └─ qwen3-14b → runs: task website:redeploy ENV=mentolder
                      └─ stdout → task-oracle.sh → Claude
```

## Out of scope

- Replacing the gotchas/architecture sections of CLAUDE.md (those are not task docs)
- Changing how `dev-flow-plan` or `dev-flow-execute` skills call tasks internally (they can continue using `task` directly)
- Adding MCP wrapping for the oracle (shell call is sufficient)
- Automatic model pulling (Ollama already has `hermes3:8b`)

## Success criteria

- CLAUDE.md drops from ~442 lines to ~220 lines
- `bash scripts/task-oracle.sh 'deploy website to mentolder'` executes `task website:redeploy ENV=mentolder` end-to-end via Hermes
- `bash scripts/task-oracle.sh 'show cluster status'` works via OpenClaw when Hermes is stopped
- The script exits 1 with a helpful message when both are down
