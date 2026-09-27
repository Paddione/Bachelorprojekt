---
name: openspec-propose
description: 'Use to create a new OpenSpec change proposal with design, delta specs and tasks in one step. Triggers on /opsx:propose, openspec propose, "new change proposal", openspec/changes/, task openspec:propose, scripts/openspec.sh propose, --target-spec, delta spec skeleton. Within this repo dev-flow-plan calls this as part of its Phase A — invoke it directly only for a standalone proposal.'
compatibility: Uses the repo wrapper `scripts/openspec.sh` — the raw `openspec` CLI is NOT installed in this repo.
# FORK — nicht upstream-synchron. Stammt aus dem OpenSpec-Upstream
# (https://github.com/Fission-AI/OpenSpec), installiert mit T001263 / PR #2188, und wurde
# seitdem hier weiterentwickelt (u.a. Framework-Mapping-Tabelle, PR #2702) ohne je gegen
# Upstream re-synct zu werden. Die frueheren Felder license/metadata.author/generatedBy
# behaupteten unveraenderte Herkunft und wurden deshalb entfernt (T002303): ein Re-Sync
# auf ihrer Grundlage haette die lokalen Aenderungen still verworfen.
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx:apply (`/opsx-apply` in opencode)

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Ask the user directly (open-ended, no preset options):
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   bash scripts/openspec.sh propose "<name>" --ticket "<TICKET_ID>"
   ```
   This scaffolds `openspec/changes/<name>/` (proposal.md + tasks.md skeleton, `.ticket`
   file so the CI guard can verify that every change is tracked, T002836).

3. **Check which artifacts exist**
   ```bash
   ls openspec/changes/<name>/
   ```
   Read the directory directly (there is no `status --json` — the raw `openspec` CLI
   is not installed in this repo). The apply-ready set is:
   - `proposal.md`, `design.md`, `tasks.md`
   - plus a `specs/` delta when the change touches an SSOT spec

4. **Create artifacts in sequence until apply-ready**

   Track progress through the artifacts (a short checklist in your reply is enough).

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each missing artifact, write it directly** (order: proposal → design →
      specs delta → tasks), reading the already completed artifacts for context.
      There are no CLI-provided templates — follow the repo conventions (see the
      Spec-Directory Pflicht-Inhalt box below and CLAUDE.md "Delta-Spec-Konvention
      (T001304)").
- **For the `specs` artifact specifically**: before writing the file, check whether
  this change is a sub-feature of an existing capability (consult
  `openspec/component-map.yaml` for a matching file-path prefix, or ask the user if
  ambiguous). If it is a sub-feature of an existing capability with SSOT spec
  `openspec/specs/<parent-slug>.md`, write the Delta-Spec to
  `openspec/changes/<name>/specs/<parent-slug>.md` (Parent-SSOT-Slug). If this is a
  genuinely new capability with no existing SSOT spec, use
  `openspec/changes/<name>/specs/<name>.md` and archive later with `--create-new`.
  See CLAUDE.md "Delta-Spec-Konvention (T001304)".

> **Spec-Directory Pflicht-Inhalt (T001974 Mishap 3 + T002772).** Jeder Change-Ordner
> unter `openspec/changes/<slug>/specs/` muss mindestens **eine** `.md`-Datei
> mit gültigem Delta-Spec-Format enthalten. Der Abschnitts-Header MUSS exakt
> `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`
> oder `## RENAMED Requirements` lauten (nicht `## ADDED:` / `## MODIFIED:` ohne
> "Requirements"). Jeder `### Requirement:`-Block MUSS mindestens einen
> `#### Scenario:`-Block im GIVEN/WHEN/THEN-Format enthalten.
> `openspec:validate` schlägt fehl, wenn das Verzeichnis leer ist oder nur
> Löschungen (`## REMOVED Requirements`) ohne Hinzufügungen enthält. Löschen
> einer ungültigen Spec-Datei ohne Ersatz erzeugt einen leeren `specs/`-Ordner
> — das schlägt ebenfalls fehl. Vor dem Commit:
> `bash scripts/openspec.sh validate` (oder `task openspec:validate`) ausführen.
      - Create the artifact file, keeping it focused on its own concern
        (proposal: what & why; design: how; tasks: implementation steps)
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until the apply-ready set is complete**
      - After creating each artifact, re-check the change directory
        (`ls openspec/changes/<name>/`, read the new file back)
      - Stop when proposal.md, design.md, tasks.md (and the specs delta, if any) exist

   c. **If an artifact requires user input** (unclear context):
      - Ask the user to clarify
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
- Prompt: "Run `/opsx:apply` (`/opsx-apply` in opencode) or ask me to implement to start working on the tasks."

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


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

