---
title: "hermes-agent-mcp-access — Implementation Plan"
ticket_id: T001609
domains: [infra, tooling, tests]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# hermes-agent-mcp-access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the local Hermes Tier-0 delegate a deliberate, versioned MCP scope: a declarative server registry (`scripts/hermes-mcp-servers.yaml`) with a per-server `tools.exclude` denylist for destructive/mutating tools, an idempotent provisioning script that writes the `mcp_servers` section of `~/.hermes/config.yaml`, and an opt-in flag on `scripts/hermes-delegate.sh` — while the default invocation stays tool-free (`-t ""`).

**Architecture:** Data (`scripts/hermes-mcp-servers.yaml`) is split from logic (`scripts/hermes-mcp-provision.sh`) per design D3. The provisioning script uses `yq` v4 (mikefarah, `/usr/local/bin/yq`, already used by `scripts/lib/seal-extra-namespaces.sh`) to merge only the registry keys into `mcp_servers`, leaving foreign top-level keys and foreign `mcp_servers` entries untouched (design D1). `mcp-postgres` carries no denylist (design D4 — server-side read-only). The delegate opt-in mechanism is resolved by a mandatory research step first, because `hermes` has no per-invocation MCP-server-selection flag (`hermes -h` shows only `-t/--toolsets` and `--safe-mode`; MCP servers are gated by `enabled: true/false` in `config.yaml`).

**Tech Stack:** Bash, `yq` v4 (mikefarah), BATS, `hermes` CLI.

**Design SSOT:** `docs/superpowers/specs/2026-07-08-hermes-agent-mcp-access-design.md` and `openspec/changes/hermes-agent-mcp-access/design.md` — decisions D1–D4 there are final; the denylist table in the design doc (section "Denylist pro Server") is the authoritative source for the exact tool names — copy them verbatim.

## Global Constraints

- **Never touch the real `~/.hermes/config.yaml` from tests.** All BATS scenarios operate exclusively against fixture files under `tests/fixtures/hermes/` copied into `$BATS_TEST_TMPDIR`. The real config is only mutated by the operator running the provisioning script manually after merge (Migration Plan step 2) — not by CI, not by tests.
- New BATS tests go into `tests/spec/hermes-mcp-access.bats` (one file per SSOT spec `openspec/specs/hermes-mcp-access.md`, template style `tests/spec/software-factory.bats`). Never create ticket-numbered test files.
- After adding tests: regenerate `website/src/data/test-inventory.json` via `task test:inventory` and commit it.
- Baseline must not grow: no new entries in `docs/code-quality/baseline.json`.
- S4 orphan gate: `scripts/hermes-mcp-provision.sh` must be reachable from docs/another script — it is referenced by `subagent-provisioning.md` (Task 5) and exercised by the BATS suite (Task 2), which satisfies S4.
- Budget note (S1): `scripts/hermes-delegate.sh` is the only gated file being modified; Ist 26 · `.sh` limit 500 · not baselined → budget large. Keep the new provisioning script under the 500-line `.sh` limit (target ≤ 180 lines).

## File Structure

```
Create: scripts/hermes-mcp-servers.yaml                          (~55 lines; .yaml ungated by S1)
Create: scripts/hermes-mcp-provision.sh                          (~170 lines; .sh limit 500, new)
Create: tests/spec/hermes-mcp-access.bats                        (~150 lines; .bats no S1 limit)
Create: tests/fixtures/hermes/config-empty.yaml                  (~4 lines; fixture, ungated)
Create: tests/fixtures/hermes/config-foreign.yaml                (~10 lines; fixture, ungated)
Modify: scripts/hermes-delegate.sh                               (26 lines → ~42; see budget table)
Modify: .claude/skills/references/subagent-provisioning.md       (85 lines; .md ungated; +~6 lines)
Modify: docs/superpowers/references/gotchas-footguns.md          (129 lines; .md ungated; +~5 lines)
```

Per-file budget (gated files only):

| Path | Ist | Budget |
|---|---|---|
| `scripts/hermes-delegate.sh` | 26 | 474 |

## Task 1: Declarative MCP server registry

**File:** `scripts/hermes-mcp-servers.yaml`

Satisfies spec Requirement "Declarative MCP server registry for Hermes" (Scenarios: registry lists all catalog servers, denylist covers known destructive tools, mcp-postgres has no denylist).

- [ ] Create `scripts/hermes-mcp-servers.yaml` with one top-level key per catalog server from `.opencode/opencode.jsonc`, each carrying its transport verbatim from that catalog (`url` for the remote HTTP servers, `command` array for the stdio servers) plus a `tools.exclude` list copied verbatim from the design doc's denylist table. Structure:

```yaml
# SSOT for Hermes' MCP access — mirrors .opencode/opencode.jsonc catalog + a
# per-server tools.exclude denylist of destructive/mutating tools (design D2/D4).
# When a server gains a NEW destructive tool, add it here (see gotchas-footguns.md).
mcp-postgres:              # remote — server-side read-only, no denylist (design D4)
  url: http://localhost:13001/mcp
mcp-kubernetes:
  url: http://localhost:18080/mcp
  tools:
    exclude: [pods_delete, pods_exec, pods_run, resources_delete, resources_create_or_update, resources_scale]
factory-mcp:
  url: http://localhost:13003/mcp
  tools:
    exclude: [factory_enqueue, factory_trigger]
codebase-memory-mcp:
  command: [/home/patrick/.local/bin/codebase-memory-mcp]
  tools:
    exclude: [delete_project, index_repository, ingest_traces, manage_adr]
mcp-task-runner:
  command: [mcp-task-runner, --otel-endpoint, localhost:4317, --taskfile, /home/patrick/Bachelorprojekt/Taskfile.yml]
  tools:
    exclude: [execute_plan, run_task, run_task_async, cancel_task]
ticket-mcp:
  command: [/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go]
  tools:
    exclude: [create_ticket, enqueue_ticket, transition_status, triage_ticket, update_fields, set_readiness_flag, set_touched_files, set_plan_meta, stage_plan, archive_plan, link_tickets, record_grill_answers, record_phase_event, report_mishap, flush_mishap_buffer, add_comment, add_pr_link, backfill_ticket_id]
```

- [ ] Verify all six catalog server names are present and `mcp-postgres` has no `tools` key: `yq 'keys' scripts/hermes-mcp-servers.yaml` lists exactly the six, and `yq '.mcp-postgres.tools' scripts/hermes-mcp-servers.yaml` prints `null`.

## Task 2: Failing BATS suite + fixtures (red step)

**File:** `tests/spec/hermes-mcp-access.bats` (plus fixtures under `tests/fixtures/hermes/`)

Write the full test suite BEFORE the provisioning script and delegate change exist, so it fails first. The six scenario tests mirror 1:1 the Scenarios in `openspec/specs/hermes-mcp-access.md`.

- [ ] Create fixtures:
  - `tests/fixtures/hermes/config-empty.yaml` — a minimal config with no `mcp_servers` key (e.g. only `model: google/gemma-4-12b-qat`).
  - `tests/fixtures/hermes/config-foreign.yaml` — a config with an unrelated top-level key (`model:`) AND a foreign `mcp_servers` entry not in the registry (e.g. `mcp_servers: { some-other-server: { url: http://localhost:9999/mcp } }`).
- [ ] Create `tests/spec/hermes-mcp-access.bats` with a header block (`#!/usr/bin/env bats`, `# SSOT: openspec/specs/hermes-mcp-access.md`) and a `setup()` that copies the chosen fixture into `$BATS_TEST_TMPDIR/config.yaml`, plus these `@test` cases (all pointing `--config` at the temp copy — never `$HOME/.hermes`):
  - `registry lists all catalog servers` — assert `yq 'keys | .[]' scripts/hermes-mcp-servers.yaml` equals the six names from `.opencode/opencode.jsonc` (parse the catalog with `yq` too, filtering out `task-master-ai`, which is opencode-only and out of scope) and each has exactly one of `url` XOR `command`.
  - `denylist covers known destructive tools` — a hard-coded reference associative array (per the design table) asserts every listed tool appears in the matching server's `tools.exclude` (fails if any known destructive tool is missing → Denylist-Drift guard).
  - `mcp-postgres has no denylist` — `yq '.mcp-postgres.tools.exclude' scripts/hermes-mcp-servers.yaml` is `null`.
  - `dry-run does not modify the target config` — snapshot `sha256sum` of the temp `config-empty.yaml`, run `scripts/hermes-mcp-provision.sh --dry-run --config <tmp>`, assert the checksum is unchanged AND stdout contains `mcp_servers`.
  - `provisioning is idempotent` — run the provisioning script twice against the temp `config-empty.yaml`; assert `yq '.mcp_servers' <tmp>` output of run 1 and run 2 are byte-for-byte identical.
  - `provisioning preserves unrelated keys` — run against temp `config-foreign.yaml`; assert `yq '.model' <tmp>` still resolves AND the foreign `mcp_servers.some-other-server` entry is still present after provisioning.
  - Two delegate cases (spec Requirement "hermes-delegate.sh defaults to no tool access"): stub the `hermes` binary via a temp script that echoes its argv, point `HERMES=<stub>`; assert `scripts/hermes-delegate.sh "hi"` argv contains `-t ` followed by an empty string, and `scripts/hermes-delegate.sh "hi" --with-project-mcp` argv does NOT force `-t ""` (asserts the opt-in path per Task 4's resolved mechanism).
- [ ] Run the suite and confirm it is red because the provisioning script and the delegate flag do not exist yet:
  ```bash
  bats tests/spec/hermes-mcp-access.bats
  # expected: FAIL — scripts/hermes-mcp-provision.sh missing, --with-project-mcp not handled
  ```

## Task 3: Idempotent provisioning script

**File:** `scripts/hermes-mcp-provision.sh`

Satisfies spec Requirement "Idempotent provisioning of Hermes MCP config" (Scenarios: dry-run no-op, idempotent, preserves unrelated keys). Turns the Task 2 provisioning/registry tests green.

- [ ] Create `scripts/hermes-mcp-provision.sh` (`set -euo pipefail`) that:
  - Accepts `--config <path>` (default `$HOME/.hermes/config.yaml`) and `--dry-run`.
  - Reads `scripts/hermes-mcp-servers.yaml` (resolve path relative to the script dir so it works from any CWD).
  - Preconditions: fail closed if `yq` (v4 mikefarah) is missing, printing an install hint; create the target config's parent dir if absent; treat a missing target config as an empty document.
  - Merges each registry server under `.mcp_servers.<name>` using a `yq` load-and-merge (`yq eval-all '... *+ ...'` / `yq '.mcp_servers.<name> = load(...)'` pattern) so ONLY the registry keys are written/overwritten; foreign top-level keys and foreign `mcp_servers` entries are left untouched.
  - Sets `enabled` per the mechanism resolved in Task 4 (see that task — either `enabled: false` written here and flipped by the delegate opt-in, or `enabled: true` written here with the delegate default suppressing MCP). Wire the value chosen in Task 4; do not hard-code before that research step.
  - `--dry-run`: prints the resulting `mcp_servers` YAML to stdout and writes nothing (no temp-file rename onto the target).
  - Non-dry-run: writes atomically (temp file + `mv`) and logs that a re-run overwrites registry-managed keys in place (design trade-off note).
- [ ] Run `bats tests/spec/hermes-mcp-access.bats` and confirm the four provisioning/registry scenarios (`dry-run`, `idempotent`, `preserves unrelated keys`, plus the three registry-shape tests) are now green; the two delegate cases stay red until Task 4.

## Task 4: Research hermes MCP mechanism, then extend the delegate

**File:** `scripts/hermes-delegate.sh`

Satisfies spec Requirement "hermes-delegate.sh defaults to no tool access" (Scenarios: default stays tool-free, opt-in enables provisioned MCP servers). Research MUST complete before any code is written.

- [ ] **Research step (before editing):** Verify empirically how a single `hermes -z` invocation enables/disables MCP servers, since `hermes -h` exposes no per-invocation MCP-server-selection flag:
  ```bash
  hermes -h | grep -iE 'mcp|toolset|safe-mode|ignore-user'
  hermes mcp list --help
  # Determine: does `-t ""` also suppress config-enabled MCP servers, or are MCP
  # servers gated ONLY by `enabled: true/false` in config.yaml (and globally by
  # --safe-mode)? Record the finding as a comment in the script header.
  ```
  Record which of two designs the finding dictates:
  - **(A)** If MCP servers activate independently of `-t` whenever `enabled: true`: the provisioning script (Task 3) writes `enabled: false`; the delegate default leaves them disabled, and `--with-project-mcp` flips the registry servers to `enabled: true` for the run (e.g. via a per-invocation override config passed through `hermes` or a documented `hermes mcp configure` pre-step).
  - **(B)** If `-t ""` already suppresses MCP tool exposure: the provisioning script writes `enabled: true`; the delegate default keeps `-t ""` (MCP suppressed), and `--with-project-mcp` invokes `hermes` without the `-t ""` suppression so the provisioned servers become reachable.
- [ ] Implement the opt-in in `scripts/hermes-delegate.sh` per the resolved design: add optional trailing arg `--with-project-mcp` (parsed positionally so existing 1- and 2-arg callers are unaffected). Default path keeps the exact current `-t ""` behavior verbatim. The opt-in path applies the mechanism from the research step. Update the usage comment and the `Usage:` line. Keep the file well under the 474-line budget.
- [ ] Run `bats tests/spec/hermes-mcp-access.bats` and confirm ALL cases (including the two delegate cases) are now green.

## Task 5: Documentation edits

**Files:** `.claude/skills/references/subagent-provisioning.md`, `docs/superpowers/references/gotchas-footguns.md`

Small, targeted edits only — do not rewrite either file.

- [ ] In `subagent-provisioning.md`, extend the existing **Tier 0 — `hermes-delegate`** blockquote with one sentence: reads-only project MCP access is available via `scripts/hermes-delegate.sh "<prompt>" --with-project-mcp` after a one-time `bash scripts/hermes-mcp-provision.sh`; it is strictly opt-in, and even then results stay unverified per Tier-0 policy. Reference the registry file `scripts/hermes-mcp-servers.yaml` as the denylist SSOT.
- [ ] In `gotchas-footguns.md`, add a short entry under the existing "Local-first LLM pipeline" section (and a matching line in the `## Section Index` at the top) stating: the Hermes MCP denylist in `scripts/hermes-mcp-servers.yaml` is the ONLY safety boundary; when any project MCP server gains a new destructive/mutating tool, the denylist MUST be extended, and the `tests/spec/hermes-mcp-access.bats` reference list updated (it only catches known tool names, not novel ones).

## Task 6: Verify

**Files:** repository-wide verification.

- [ ] Regenerate and commit the test inventory (new BATS file added):
  ```bash
  task test:inventory
  git add website/src/data/test-inventory.json
  ```
- [ ] Run the mandatory gate commands and confirm each is green:
  ```bash
  task test:changed          # runs the new tests/spec/hermes-mcp-access.bats + quality ratchet
  task freshness:regenerate  # refresh generated artifacts (test-inventory, repo-index, …)
  task freshness:check       # CI equivalent: freshness + quality:check (S1–S4) + baseline assertion
  ```
- [ ] Validate the OpenSpec change and lint the plan; both must exit 0:
  ```bash
  task test:openspec         # equivalent: bash scripts/openspec.sh validate
  bash scripts/plan-lint.sh openspec/changes/hermes-agent-mcp-access/tasks.md
  ```
- [ ] Confirm no gated-file line-limit regression: `bash scripts/plan-lint.sh` shows no B1a/B1b hard fail, and `scripts/hermes-mcp-provision.sh` stays under the 500-line `.sh` limit (`wc -l scripts/hermes-mcp-provision.sh`).
