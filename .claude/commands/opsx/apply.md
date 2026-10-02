---
name: "OPSX: Apply"
description: Implement tasks from a change (Experimental)
category: Workflow
tags: [workflow, artifacts, experimental]
---

Implement tasks from a change.

**Input**: Optionally specify a change name (e.g., `/change:apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, list the active changes directly (the raw `openspec` CLI is not
     installed in this repo — use `ls changes/`) and use the
     **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `/change:apply <other>`).

2. **Read the change directory**

   Read `changes/<name>/` directly: `proposal.md`, `specs/`, `design.md`,
   `tasks.md`. The task list always lives in `tasks.md` (`- [ ]` pending,
   `- [x]` complete).

3. **Determine the state**

   - If `tasks.md` is missing: the change is not implementable yet — resolve the
     missing artifacts first (re-run `/opsx:propose`), then re-run `/change:apply`
   - If every task is `- [x]`: congratulate, suggest archive (`/opsx:archive`)
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

All tasks complete! You can archive this change with `/opsx:archive`.
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
