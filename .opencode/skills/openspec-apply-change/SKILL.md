---
name: openspec-apply-change
description: 'Use to work through the tasks of an existing OpenSpec change — start, continue or resume implementation. Triggers on /opsx:apply, openspec apply, task openspec:apply, "continue the change", "work through tasks", openspec/changes/<slug>/tasks.md, mark task done. Within this repo dev-flow-execute owns the full implement-verify-PR loop — invoke this directly only to advance an OpenSpec change outside that pipeline.'
compatibility: Uses the repo wrapper `scripts/openspec.sh` — the raw `openspec` CLI is NOT installed in this repo.
# FORK — nicht upstream-synchron. Stammt aus dem OpenSpec-Upstream
# (https://github.com/Fission-AI/OpenSpec), installiert mit T001263 / PR #2188, und wurde
# seitdem hier weiterentwickelt (u.a. Framework-Mapping-Tabelle, PR #2702) ohne je gegen
# Upstream re-synct zu werden. Die frueheren Felder license/metadata.author/generatedBy
# behaupteten unveraenderte Herkunft und wurden deshalb entfernt (T002303): ein Re-Sync
# auf ihrer Grundlage haette die lokalen Aenderungen still verworfen.
---

Implement tasks from an OpenSpec change.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, list the active changes directly (the raw `openspec` CLI is not
     installed in this repo) and ask the user to select:
     ```bash
     ls openspec/changes/
     ```

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx:apply <other>`; `/opsx-apply` in opencode).

2. **Read the change directory**

   Read `openspec/changes/<name>/` directly: `proposal.md`, `specs/`, `design.md`,
   `tasks.md`. The task list always lives in `tasks.md` (`- [ ]` pending,
   `- [x]` complete).

3. **Determine the state**

   - If `tasks.md` is missing: the change is not implementable yet — resolve the
     missing artifacts first (re-run openspec-propose), then re-run this skill
   - If every task is `- [x]`: congratulate, suggest archive
   - Otherwise: proceed to implementation

4. **Read context files**

   Read `proposal.md`, the `specs/` delta, `design.md`, and `tasks.md` before
   starting — those four are the full context, no CLI output needed.

5. **Show current progress**

   Display:
   - Progress: "N/M tasks complete" (count `- [x]` vs `- [ ]` in tasks.md)
   - Remaining tasks overview

6. **Implement tasks (loop until done or blocked)**

   For each pending task:
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - Mark task complete in the tasks file: `- [ ]` → `- [x]`
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

7. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest archive
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name>

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

All tasks complete! Ready to archive this change.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**
- Keep going through tasks until done or blocked
- Always read proposal/specs/design/tasks before starting
- If task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements - don't guess

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

