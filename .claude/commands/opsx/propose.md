---
name: "OPSX: Propose"
description: Propose a new change - create it and generate all artifacts in one step
category: Workflow
tags: [workflow, artifacts, experimental]
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx:apply

---

**Input**: The argument after `/opsx:propose` is the change name (kebab-case), OR a description of what the user wants to build.

**Steps**

1. **If no input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   bash scripts/openspec.sh propose "<name>" --ticket "<TICKET_ID>"
   ```
   This scaffolds `openspec/changes/<name>/` (proposal.md + tasks.md skeleton, `.ticket`
   file so the CI guard can verify that every change is tracked, T002836). The raw
   `openspec` CLI is NOT installed in this repo — always use the wrapper.

3. **Check which artifacts exist**
   ```bash
   ls openspec/changes/<name>/
   ```
   Read the directory directly (there is no `status --json`). The apply-ready set is:
   - `proposal.md`, `design.md`, `tasks.md`
   - plus a `specs/` delta when the change touches an SSOT spec

4. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each missing artifact, write it directly** (order: proposal → design →
      specs delta → tasks), reading the already completed artifacts for context.
      There are no CLI-provided templates — follow the repo conventions
      (CLAUDE.md "Delta-Spec-Konvention (T001304)"; delta specs use ADDED/MODIFIED/
      REMOVED/RENAMED Requirements + GIVEN/WHEN/THEN scenarios).
      - **For the `specs` artifact specifically**: before writing the file, check whether
        this change is a sub-feature of an existing capability (consult
        `openspec/component-map.yaml` for a matching file-path prefix, or ask the user if
        ambiguous). If it is a sub-feature of an existing capability with SSOT spec
        `openspec/specs/<parent-slug>.md`, write the Delta-Spec to
        `openspec/changes/<name>/specs/<parent-slug>.md` (Parent-SSOT-Slug). If this is a
        genuinely new capability with no existing SSOT spec, use
        `openspec/changes/<name>/specs/<name>.md` and archive later with `--create-new`.
        See CLAUDE.md "Delta-Spec-Konvention (T001304)".
      - Create the artifact file, keeping it focused on its own concern
        (proposal: what & why; design: how; tasks: implementation steps)
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until the apply-ready set is complete**
      - After creating each artifact, re-check the change directory
        (`ls openspec/changes/<name>/`, read the new file back)
      - Stop when proposal.md, design.md, tasks.md (and the specs delta, if any) exist

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify
      - Then continue with creation

5. **Show final status**
   ```bash
   ls openspec/changes/<name>/ openspec/changes/<name>/specs/
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx:apply` to start implementing."

**Artifact Creation Guidelines**

- Each artifact has one concern: proposal (what & why), design (how), tasks (steps)
- Read the already completed artifacts for context before creating new ones
- Keep the repo delta-spec format (ADDED/MODIFIED/REMOVED/RENAMED Requirements +
  GIVEN/WHEN/THEN scenarios) for everything under `specs/`

**Guardrails**
- Create ALL artifacts of the apply-ready set (proposal, design, tasks + specs delta)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
