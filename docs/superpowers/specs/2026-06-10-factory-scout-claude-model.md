# Design Spec: Factory Scout → Claude-backed Tool-Use Scout

**Ticket:** T000591
**Branch:** feature/factory-scout-agent-sdk
**Date:** 2026-06-10

## Problem

The Factory Scout phase (`pipeline.js:174-200`) inherits the DeepSeek model from `autopilot.env`
(no explicit `model` override on the `agent()` call). DeepSeek-Flash does not use the harness-injected
tools (Bash, Grep, Glob, Read) to explore the codebase — it guesses which files to touch from
the ticket title/description alone. Result: consistently `0 touched_files` on real tasks.

The downstream effects:
- `set-touched-files` persists an empty list → the escalation-class gate in Deploy always fires
- Complexity classification is based on pure LLM guess, not actual codebase analysis
- Design/Plan agents have no file context handed to them

## Goal

Replace the DeepSeek-derived Scout with a **Claude Sonnet 4.6** agent that uses real tools to
discover which files are touched, at Anthropic API cost (using the developer's Anthropic credits).

## Non-Goals

- No Managed Agents (persistent stateful agent with Anthropic-hosted container) — Scout is
  single-shot, no state needed between pipeline runs.
- No separate TypeScript script invoking the Anthropic SDK — the Workflow `agent()` already
  provides tool access; a `model` override is sufficient.
- No changes to Scout schema (SCOUT_SCHEMA stays as-is).
- No changes to other pipeline phases (Design, Plan, Implement, Verify, Deploy).

## Decision

**Minimal targeted fix**: add `model: 'sonnet'` to the Scout `agent()` options + rewrite the
Scout prompt to start with explicit tool-use discovery steps before returning the schema.

### Why `sonnet` not `opus`?

- Scout = file-pattern matching + grep + complexity classification: well within Sonnet's capability
- Scout runs on every Factory pipeline invocation → cost matters at scale
- `opus` is reserved for `review` and `security` roles (see `ALWAYS_OPUS_ROLES`)

### Why Workflow `agent()` model override vs. Managed Agents SDK?

The Workflow `agent()` harness already:
- Spawns a Claude session with all tools available (Bash, Read, Grep, Glob, Write)
- Handles the tool-use loop automatically
- Returns structured output via `schema: SCOUT_SCHEMA`

Managed Agents (Anthropic-hosted containers) would add:
- A persistent agent ID to create, store, and version
- Per-session container provisioning latency (~200–500ms)
- A separate API integration path

This overhead is unjustified for a single-shot file-discovery task. The Workflow model override
achieves the same result with 2 lines of change.

## Implementation

### `scripts/factory/pipeline.js` — Scout agent call

**Change 1**: Add `model: 'sonnet'` to Scout `agent()` options (line 187):
```js
{ label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, model: 'sonnet' }
```

**Change 2**: Rewrite Scout prompt to start with explicit tool-use exploration:
```
1. Touch liveness: bash ticket.sh touch
2. Grep for ticket keywords across the codebase:
   grep -r --include="*.ts" --include="*.js" --include="*.svelte" --include="*.astro" \
     -l "<keyword1> <keyword2>" ${REPO}/website/src ${REPO}/scripts ${REPO}/brett
3. Find files by name patterns suggested by the ticket title.
4. Read up to 3 of the most-likely candidate files to confirm they are in scope.
5. Run find-similar-tickets.mjs for pgvector context.
6. Classify complexity (simple/medium/complex) based on:
   - simple: ≤3 files, single subsystem, no DB migration
   - medium: 4–10 files or crosses 2 subsystems
   - complex: >10 files or DB migration or multi-brand impact
7. Return SCOUT_SCHEMA JSON.
```

### No other changes

- `SCOUT_SCHEMA` — unchanged
- `featureComplexity` / `featureTouchedFiles` hoisting — unchanged
- `scout:persist` agent call — unchanged
- All other phases — unchanged

## Test Plan

**Offline (FA-SF-20)**: Contract test already validates that Scout returns a valid `SCOUT_SCHEMA`
object. The `model` key is not in the schema, so no contract change needed.

**Integration smoke**: Run a dry-run pipeline invocation (`dry_run: true`) against a known test
ticket and confirm `touched_files.length > 0` in the Scout output.

Note: No new BATS test for the model override itself (it's a runtime property). The existing
`FA-SF-20` contract test covers schema correctness.

## Risks

- **Claude API cost increase**: Scout was free on DeepSeek; Sonnet costs ~$3/M input tokens.
  For a typical Scout prompt (~2k tokens), this is ~$0.006 per pipeline run — acceptable.
- **Latency**: Sonnet is slower than DeepSeek-Flash by ~1–3s on short tasks — acceptable.
- **Tool-use loop depth**: Scout with active grep may spawn multiple tool calls. The Workflow
  harness handles the loop; depth is bounded by the agent's task completion judgment.
