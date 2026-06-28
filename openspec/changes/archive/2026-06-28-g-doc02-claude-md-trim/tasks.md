---
title: "G-DOC02: CLAUDE.md Zeilen kürzen (273→≤200)"
ticket_id: T001296
domains: ["docs","quality"]
status: completed
---

# g-doc02-claude-md-trim — Implementation Plan

## File Structure

| Action  | Path                                             | Notes                                           |
|---------|--------------------------------------------------|-------------------------------------------------|
| Create  | `docs/superpowers/references/gotchas-footguns.md` | Full Gotchas & Footguns section moved here      |
| Modify  | `CLAUDE.md`                                      | 109-line block replaced by ~8-line pointer block |

## Task 0: Baseline messen (RED)

Confirm the baseline before making any changes.

- [ ] Run the measure command:
  ```bash
  wc -l < CLAUDE.md
  ```
  expected: FAIL (current value: 273 lines — over target of ≤200 lines)

- [ ] Confirm the Gotchas section span:
  ```bash
  grep -n "^## Gotchas" CLAUDE.md
  ```
  expected output: `165:## Gotchas & Footguns`

## Task 1: Reference-Datei erstellen

Extract the full `## Gotchas & Footguns` section (lines 165-273 of `CLAUDE.md`) into a new standalone reference document.

- [ ] Create `docs/superpowers/references/gotchas-footguns.md` with:
  - A top-level heading `# Gotchas & Footguns Reference`
  - A brief intro paragraph explaining this file is the canonical source of non-obvious repo behaviors, extracted from `CLAUDE.md` to keep that file within its token budget.
  - A section index listing all twelve sub-sections with one-line descriptions so readers can skip to the relevant entry.
  - The verbatim content of each sub-section from CLAUDE.md lines 166-273, preserving all bold markers, code spans, and nested bullet structure.

Sub-sections to include (twelve total):
1. security-guidance plugin rewake after commits
2. Session-Koordination (parallele Agenten — Claude + Gemini)
3. Environment targeting
4. Cluster node placement (fleet)
5. Kustomize overlays
6. Scripts & env
7. Database queries
8. Cluster reset / fresh cluster bring-up order
9. Operational
10. Staging environment (ENV=staging)
11. Korczewski homepage uses the Kore design system (different from mentolder)
12. Local-first LLM pipeline
13. dev.mentolder.de stack
14. Brett (stub — currently empty, retain for future use)

- [ ] Verify the reference file is well-formed:
  ```bash
  grep -c "^###" docs/superpowers/references/gotchas-footguns.md
  ```
  expected: ≥12

## Task 2: CLAUDE.md Gotchas-Block ersetzen

Replace lines 165-273 in `CLAUDE.md` with a compact pointer block.

- [ ] Remove the existing `## Gotchas & Footguns` section (lines 165-273) from `CLAUDE.md`.

- [ ] Insert the following pointer block at the same position (after `## Development Rules` and before any trailing content):

  ```markdown
  ## Gotchas & Footguns

  Non-obvious repo behaviors are documented in full at
  [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).

  Covered sub-topics (reference file, not repeated here):
  - **security-guidance rewake** — never git-restore after a commit rewake
  - **Session-Koordination** — agent-lock.sh claim/release/reap protocol
  - **Environment targeting** — ENV= is always explicit; WORKSPACE_NAMESPACE
  - **Cluster node placement** — wg-fleet flannel-iface; LiveKit node-pin
  - **Kustomize overlays** — prod-fleet/* only; never bare prod/; $patch:delete
  - **Scripts & env** — env-resolve.sh must be sourced; envsubst lists
  - **Database queries** — never SELECT * on ticket_plans.content
  - **Cluster reset order** — sealed-secrets → fetch-cert → seal → cert → deploy
  - **Operational** — push-based; pull-first; CONFLICTING PR suppresses CI
  - **Staging (ENV=staging)** — workspace-staging ns; LiveKit disabled
  - **Kore design system** — korczewski brand uses website/src/components/kore/
  - **Local-first LLM pipeline** — GPU host; vector space isolation; LM Studio
  - **dev.mentolder.de stack** — devc decommissioned; WSL bootstrap caveats
  ```

- [ ] Verify the replacement is in place:
  ```bash
  grep -n "gotchas-footguns.md" CLAUDE.md
  ```
  expected: one matching line containing the pointer path

## Task 3: Ziel messen (GREEN)

Confirm the line count target is met.

- [ ] Run the measure command:
  ```bash
  wc -l < CLAUDE.md
  ```
  expected: ≤200

- [ ] Confirm the full reference file exists and is non-empty:
  ```bash
  wc -l < docs/superpowers/references/gotchas-footguns.md
  ```
  expected: ≥80

- [ ] Run the health-goals check:
  ```bash
  bash scripts/health-goals-check.sh --only=G-DOC02
  ```
  expected: green / exit 0

## Task 4 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-DOC02` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
