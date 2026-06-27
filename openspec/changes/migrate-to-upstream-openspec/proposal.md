# Proposal: OpenSpec improvements batch (per 2026-06-27 audit)

_Ticket: T001267 (umbrella for T001261, T001263, T001264, T001265)_

## Why

A 2026-06-27 scan of `C:\Users\PatrickKorczewski\OpenSpec-main` (upstream OpenSpec v1.3.1, `@fission-ai/openspec`) against the Bachelorprojekt `openspec/` tree found **13 conformance and integration gaps**, grouped into **6 tickets**:

| # | Ticket | Findings | Status |
|---|--------|----------|--------|
| 1 | **T001261** (hoch) | 11 stub specs + 0/60 have `## Purpose` | ready |
| 2 | **T001262** (hoch) | raw-append merge + weak validator + missing `RENAMED` | **parked** — user said "leave as is for now" |
| 3 | **T001263** (mittel) | no `/opsx:*` workflow commands installed | ready |
| 4 | **T001264** (niedrig) | unused `openspec-mcp` + dead `project.md` | **done 2026-06-27** (commit cdc8d61f) |
| 5 | **T001265** (niedrig) | frontmatter + rules + telemetry + completions | ready |
| 6 | **T001266** (niedrig) | rewrite `openspec-workflow.md` SSOT post-migration | **parked** — depends on T001262 |

The audit report is recorded as a comment on T001261 with cross-links to all five other tickets.

This change **bundles the 4 active items** (T001261, T001263, T001265, plus the already-shipped T001264) into one staging artifact. The 2 parked items (T001262, T001266) are explicitly out of scope and re-evaluated when the upstream migration unparks.

## What

### In this batch

1. **T001261** — Backfill 11 stub specs with real Requirements/Scenarios (sourced from the archived change's `tasks.md` + delta, or delete the spec/change pair). Add `## Purpose` + `## Requirements` H2 headers to all 60 SSOT specs.

2. **T001263** — Install upstream OpenSpec workflow commands in `.opencode/commands/opsx-*.md` and `.claude/skills/openspec-*/SKILL.md` so agents can invoke `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:archive` directly. Update `dev-flow-plan` and `dev-flow-execute` skills to use these.

3. **T001265** — Lock the frontmatter convention, expand `config.yaml:rules:` to include `specs` and `design` artifacts, set `OPENSPEC_TELEMETRY=0` in CI workflows, document `openspec completion install` in `AGENTS.md`.

4. **T001264** (already done, committed `cdc8d61f`) — Remove `openspec-mcp` entries from `.opencode/opencode.jsonc` and `.mcp.json`; delete `openspec/project.md`.

### Out of scope (parked)

- **T001262** — Adopting upstream CLI as authoritative. The homegrown `scripts/openspec.sh` + `scripts/openspec-validate.ts` stay in place. T001261 is designed to make this safer when it eventually unparks (the strict upstream validator would only see conformant specs).

- **T001266** — Full rewrite of `openspec/specs/openspec-workflow.md`. Depends on T001262 (the SSOT describes the homegrown flow). The delta in this change (`specs/openspec-workflow.md`) only captures the *new* requirements being enforced — the full rewrite lands when T001262 unparks.

## Capabilities

### New Capabilities
- (none — no new SSOT capability introduced by this batch)

### Modified Capabilities
- `openspec-workflow` — receives `## ADDED Requirements` for the four conventions being enforced (Purpose required, /opsx:* installed, no openspec-mcp, CI telemetry opt-out). Full SSOT rewrite is parked under T001266.

## Impact

- **Files touched (estimate):** 60 SSOT specs (Purpose/Requirements headers), 11 SSOT specs (stub backfill), `.opencode/commands/` (4 new files), `.claude/skills/` (4 new SKILL.md files), 2 skill files (`dev-flow-plan`, `dev-flow-execute`), `openspec/config.yaml` (rules expanded), `.github/workflows/*.yml` (telemetry opt-out), `AGENTS.md` (completions note).
- **Behavior change:** none. All changes are content + config. No runtime code paths affected.
- **Risk:** low. Each sub-task is independent and can be reviewed/merged in any order.
- **Reversibility:** high. Each ticket is a self-contained change; any can be reverted without affecting the others.
