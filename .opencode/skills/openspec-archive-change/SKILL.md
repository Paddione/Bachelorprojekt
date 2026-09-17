---
name: openspec-archive-change
description: 'Use to archive a finished OpenSpec change and merge its delta into the SSOT spec. Triggers on /opsx:archive, openspec archive, task openspec:archive, scripts/openspec.sh archive, --create-new, "finalize the change", move change to openspec/changes/archive/. Run only after the change is merged — dev-flow-execute calls this in its post-merge step.'
compatibility: Uses the repo wrapper `scripts/openspec.sh` — the raw `openspec` CLI is NOT installed in this repo.
# FORK — nicht upstream-synchron. Stammt aus dem OpenSpec-Upstream
# (https://github.com/Fission-AI/OpenSpec), installiert mit T001263 / PR #2188, und wurde
# seitdem hier weiterentwickelt (u.a. Framework-Mapping-Tabelle, PR #2702) ohne je gegen
# Upstream re-synct zu werden. Die frueheren Felder license/metadata.author/generatedBy
# behaupteten unveraenderte Herkunft und wurden deshalb entfernt (T002303): ein Re-Sync
# auf ihrer Grundlage haette die lokalen Aenderungen still verworfen.
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   List the active changes directly (the raw `openspec` CLI is not installed in this repo):

   ```bash
   ls openspec/changes/
   ```

   Ask the user to select. Show only active changes (not already archived).

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Read the change directory (`openspec/changes/<name>/`: proposal.md, design.md, tasks.md, specs/).

   **If any artifacts are missing or look incomplete:**
   - Display warning listing incomplete artifacts
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without sync prompt.

   **If delta specs exist:** show a short summary of what the delta would change in
   `openspec/specs/<capability>/spec.md` (adds, modifications, removals, renames) and ask
   the user to confirm.

   Delegate the sync to a sub-agent via the repo wrapper: instruct it to run
   `bash scripts/openspec.sh archive <change-name>` (if your harness cannot delegate,
   run the wrapper inline). The legacy `openspec-sync-specs` skill does not exist in
   this repo — the wrapper performs the delta merge itself, so no separate sync skill
   is invoked. Proceed to archive regardless of the sync choice.

5. **Archive via the repo wrapper (move + SSOT delta merge in one step)**

   Do NOT do a manual `mv` into `openspec/changes/archive/` — that skips the delta merge
   into the parent SSOT spec and all guards. The repo wrapper does both:

   ```bash
   bash scripts/openspec.sh archive <change-name> [--create-new]
   ```

   Flags:
   - `--create-new`: the delta targets a NEW SSOT component. Without it, archive fails
     when the target SSOT spec does not exist yet (Delta-Spec-Konvention T001304).
   - `--no-merge`: move to archive WITHOUT delta merge (process notes like `mishap-*`
     bundles whose skeleton delta was never filled in).
   - `--allow-shrink`: merge a MODIFIED delta with FEWER scenarios than the SSOT
     requirement (deliberate consolidation; without it the archive aborts).

   The wrapper runs fail-closed: stub/target guard, `.ticket` presence guard, and the
   deliverable-presence check against `touched_files` (M10, T002506).

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Whether specs were synced (if applicable)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Use the repo wrapper `scripts/openspec.sh archive` — never a manual `mv` into `openspec/changes/archive/`
- Don't block archive on warnings - just inform and confirm
- Show clear summary of what happened
- If delta specs exist, always show the sync summary before prompting


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

