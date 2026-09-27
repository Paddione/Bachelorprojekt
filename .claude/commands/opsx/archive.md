---
name: "OPSX: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   List the active changes directly (the raw `openspec` CLI is not installed in
   this repo):
   ```bash
   ls openspec/changes/
   ```
   Use the **AskUserQuestion tool** to let the user select.

   Show only active changes (not already archived).

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Read the change directory (`openspec/changes/<name>/`: proposal.md, design.md,
   tasks.md, specs/).

   **If any artifacts are missing or look incomplete:**
   - Display warning listing incomplete artifacts
   - Prompt user for confirmation to continue
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Prompt user for confirmation to continue
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   The sync itself is performed by the repo wrapper in step 5 — the legacy
   `openspec-sync-specs` skill does not exist in this repo. Proceed to archive
   regardless of the sync choice.

5. **Archive via the repo wrapper (move + SSOT delta merge in one step)**

   Do NOT do a manual `mv` into `openspec/changes/archive/` — that skips the delta
   merge into the parent SSOT spec and all guards. The repo wrapper does both:

   ```bash
   bash scripts/openspec.sh archive <name> [--create-new]
   ```

   Flags:
   - `--create-new`: the delta targets a NEW SSOT component. Without it, archive fails
     when the target SSOT spec does not exist yet (Delta-Spec-Konvention T001304).
   - `--no-merge`: move to archive WITHOUT delta merge (process notes like `mishap-*`
     bundles whose skeleton delta was never filled in).
   - `--allow-shrink`: merge a MODIFIED delta with FEWER scenarios than the SSOT
     requirement (deliberate consolidation; without it the archive aborts).

   The wrapper runs fail-closed: stub/target guard, `.ticket` presence guard, and the
   deliverable-presence check against `touched_files` (M10, T002506). If the dated
   target already exists, it refuses — rename the existing archive first.

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Archive location
   - Spec sync status (synced / sync skipped / no delta specs)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs

All artifacts complete. All tasks complete.
```

**Output On Success (No Delta Specs)**

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** No delta specs

All artifacts complete. All tasks complete.
```

**Output On Success With Warnings**

```
## Archive Complete (with warnings)

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** Sync skipped (user chose to skip)

**Warnings:**
- Archived with 2 incomplete artifacts
- Archived with 3 incomplete tasks
- Delta spec sync was skipped (user chose to skip)

Review the archive if this was not intentional.
```

**Output On Error (Archive Exists)**

```
## Archive Failed

**Change:** <change-name>
**Target:** openspec/changes/archive/YYYY-MM-DD-<name>/

Target archive directory already exists.

**Options:**
1. Rename the existing archive
2. Delete the existing archive if it's a duplicate
3. Wait until a different date to archive
```

**Guardrails**
- Always prompt for change selection if not provided
- Use the repo wrapper `scripts/openspec.sh archive` — never a manual `mv` into `openspec/changes/archive/`
- Don't block archive on warnings - just inform and confirm
- Show clear summary of what happened
- The wrapper performs the delta merge itself — no separate sync skill is invoked
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
