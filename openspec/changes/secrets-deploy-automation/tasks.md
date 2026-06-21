---
title: "Secrets Deploy Automation — Fleet-Vollständigkeits-Guard + Auto-Deploy"
ticket_id: null
domains: [security, infra, ops]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Secrets Deploy Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a repeat of the 2026-06-21 incident where 18 `POCKET_ID_*` secrets were sealed into legacy files instead of the active fleet files, by adding a CI guard, an auto-deploy GitHub Action, a reference document, and an updated Security Agent.

**Architecture:** Four independent deliverables land in one PR: (1) a new GitHub Action that auto-deploys `sealed-secrets/fleet-*.yaml` after merge to main, (2) a `legacy_only: true` annotation in `environments/schema.yaml` plus a BATS test that verifies fleet files are a superset of legacy files (minus legacy-only keys), (3) a new reference document documenting the secrets file topology, and (4) a one-paragraph addition to the `bachelorprojekt-security` agent pointing at that document.

**Tech Stack:** Bash, BATS, yq (already in CI), python3 + PyYAML (schema parsing), kubectl, GitHub Actions YAML.

Source spec: `docs/superpowers/specs/2026-06-21-secrets-deploy-automation-design.md`.

## Global Constraints

- No brand-domain literals (`mentolder.de`, `korczewski.de`) in any code or YAML — use file paths and abstract names only.
- `scripts/check-fleet-completeness.py` must NOT be created — inline `yq` + `python3` inside the BATS test only.
- `continue-on-error: true` must appear at **job level** on the `notify` job (not inside a step).
- BATS test reads only `environments/sealed-secrets/*.yaml` — never `.secrets/*.yaml` (gitignored, absent in CI).
- `yq` used for key extraction; `python3` only for YAML schema parsing.
- All new files referenced in this plan — no orphaned artefacts.
- S1 size: all five new/modified files are non-baselined. Keep each file focused.

## File Structure

New files:

| File | Purpose | Ext / S1 budget |
|---|---|---|
| `.github/workflows/deploy-sealed-secrets.yml` | Auto-deploy fleet SealedSecrets on merge | `.yml` — ungated (S1 limit 0), new file |
| `tests/spec/fleet-operations.bats` | Offline fleet-completeness guard | `.bats` — limit 300, new file, ~70 lines |
| `docs/superpowers/references/secrets-architecture.md` | Secrets file-topology reference | `.md` — ungated, new file |

Changed files:

| File | Change | Ext / S1 budget |
|---|---|---|
| `environments/schema.yaml` | Add `legacy_only: true` to decommissioned keys; add 3 new `MCP_KEYCLOAK_*` legacy entries | `.yaml` — ungated (S1 limit 0), no budget concern |
| `.claude/agents/bachelorprojekt-security.md` | Add `## Secrets-Dateiarchitektur` section | `.md` — ungated, no budget concern |

S1 pre-flight: `.yml`, `.yaml`, `.md`, `.bats` are all **ungated** extensions
(`_ext_limit` returns 0; none appear in `docs/code-quality/baseline.json`). The
only line-budgeted file is `tests/spec/fleet-operations.bats` (`.bats`, static
limit 300) — the test is ~70 lines, far under budget. No split/shrink needed.

---

## Task 1: GitHub Action `deploy-sealed-secrets.yml`

**Dateien:** `.github/workflows/deploy-sealed-secrets.yml`

**Pattern source:** `build-website.yml` (kubeconfig base64-decode into `~/.kube/config`,
`curl` kubectl install). This workflow does NOT build images, NOT run kustomize, NOT
run envsubst — it only verifies and applies two committed SealedSecret YAMLs.

**Steps:**
- [ ] Create `.github/workflows/deploy-sealed-secrets.yml` with `name: Deploy Sealed Secrets`.
- [ ] Trigger block:
  ```yaml
  on:
    push:
      branches: [main]
      paths:
        - 'environments/sealed-secrets/fleet-mentolder.yaml'
        - 'environments/sealed-secrets/fleet-korczewski.yaml'
        - '.github/workflows/deploy-sealed-secrets.yml'
    workflow_dispatch:
  ```
- [ ] Job `validate` (runs-on `ubuntu-latest`, `permissions: { contents: read }`):
  - [ ] `actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5`.
  - [ ] Install kubectl + kubeseal via pinned `curl` downloads into `/usr/local/bin`
    (kubectl pin `v1.31.0` mirrors `build-website.yml`; kubeseal from the
    `bitnami-labs/sealed-secrets` GitHub release tarball, e.g. `v0.27.x`, `chmod +x`).
  - [ ] Decode kubeconfig:
    ```bash
    mkdir -p ~/.kube
    echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
    chmod 600 ~/.kube/config
    ```
    with `env: { KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }} }`.
  - [ ] Verify both files against the live controller cert (fail-fast on drift):
    ```bash
    kubeseal --verify -f environments/sealed-secrets/fleet-mentolder.yaml
    kubeseal --verify -f environments/sealed-secrets/fleet-korczewski.yaml
    ```
    `--verify` reads the live cert via the active kubeconfig context; a cert-drift
    non-zero exit blocks the `deploy` job from running.
- [ ] Job `deploy` (`needs: validate`, same kubeconfig setup, same kubectl install):
  - [ ] Idempotent apply of both brands:
    ```bash
    kubectl apply -f environments/sealed-secrets/fleet-mentolder.yaml
    kubectl apply -f environments/sealed-secrets/fleet-korczewski.yaml
    ```
  - [ ] No `--server-side` (SealedSecrets are single CRs, not kustomize overlays).
  - [ ] Export the merge SHA for the notify job:
    ```bash
    echo "DEPLOY_SHA=$(git rev-parse --short HEAD)" >> "$GITHUB_ENV"
    ```
- [ ] Job `notify` (`needs: deploy`, **`continue-on-error: true` at job level**, same
  kubeconfig setup — `scripts/ticket.sh` uses `kubectl exec` on the postgres pod):
  - [ ] Find the open `awaiting_deploy` ticket and post a deploy comment via
    `bash scripts/ticket.sh comment <ticket-id> "..."`. Confirm the exact
    `scripts/ticket.sh` subcommand + argument order during implementation
    (`scripts/ticket.sh --help`); if a query-by-status subcommand is unavailable,
    fall back to the ticket-mcp `list_tickets` status filter via `kubectl exec`.
  - [ ] Comment body: `"✅ SealedSecrets deployed ${DEPLOY_SHA} at $(date -u +%FT%TZ) (mentolder + korczewski)"`.
  - [ ] If no `awaiting_deploy` ticket is found: log a warning, exit 0 (job stays green).
  - [ ] Rationale comment in the YAML: `continue-on-error` keeps the workflow green if
    the postgres pod is mid-restart so the deploy is not falsely reported as failed.
- [ ] **Secrets used:** only `${{ secrets.FLEET_KUBECONFIG }}` (already configured for
  `build-website.yml`). No separate ticket token — kubeconfig covers deploy + comment.
- [ ] S4 note: workflow files are not subject to the kustomization/Taskfile orphan check
  (only `k3d/*.yaml` and `scripts/*`). The `workflow_dispatch` trigger gives a manual
  re-run path.

---

## Task 2: Schema `legacy_only` flag + offline BATS guard

**Dateien:** `environments/schema.yaml`, `tests/spec/fleet-operations.bats`

**Steps (schema):**
- [ ] In `environments/schema.yaml`, add `legacy_only: true` to every decommissioned
  WireGuard-mesh key already present in the `secrets:` block (preserve existing
  `required`/`sealed`/`description` fields, only append the new flag):
  - [ ] `WG_MESH_GEKKO2_PRIVATE_KEY`, `WG_MESH_GEKKO2_PUBLIC_KEY`
  - [ ] `WG_MESH_GEKKO3_PRIVATE_KEY`, `WG_MESH_GEKKO3_PUBLIC_KEY`
  - [ ] `WG_MESH_GEKKO4_PRIVATE_KEY`, `WG_MESH_GEKKO4_PUBLIC_KEY`
  - [ ] `WG_MESH_K3S1_PRIVATE_KEY`, `WG_MESH_K3S1_PUBLIC_KEY`
  - [ ] `WG_MESH_K3S2_PRIVATE_KEY`, `WG_MESH_K3S2_PUBLIC_KEY`
  - [ ] `WG_MESH_K3S3_PRIVATE_KEY`, `WG_MESH_K3S3_PUBLIC_KEY`
- [ ] Add 3 **new** `MCP_KEYCLOAK_*` secret entries (they are NOT yet in schema.yaml but
  exist in `sealed-secrets/korczewski.yaml`; without a schema entry the new guard cannot
  classify them as legacy). Place them near a logically related secrets section with a
  comment `# MCP Keycloak (korczewski-legacy — replaced by Pocket ID, T001068)`:
  ```yaml
  - name: MCP_KEYCLOAK_CLIENT_ID
    required: false
    legacy_only: true
    description: "DECOMMISSIONED — replaced by Pocket ID (T001068)"
  - name: MCP_KEYCLOAK_CLIENT_SECRET
    required: false
    sealed: true
    legacy_only: true
    description: "DECOMMISSIONED — replaced by Pocket ID (T001068)"
  - name: MCP_KEYCLOAK_REALM_URL
    required: false
    legacy_only: true
    description: "DECOMMISSIONED — replaced by Pocket ID (T001068)"
  ```
- [ ] Verify the new `legacy_only` optional field does not break consumers:
  `task env:validate` should still pass (verify in the final task). `scripts/env-resolve.sh`
  consumers are unaffected — `legacy_only` is purely additive metadata.

**Steps (BATS guard) — write the failing test FIRST (TDD):**
- [ ] Create `tests/spec/fleet-operations.bats` with the standard header
  (`#!/usr/bin/env bats`, `# tests/spec/fleet-operations.bats`, SSOT comment pointing at
  a fleet-operations spec, and `load test_helper` per the `tests/spec/test_helper.bash`
  convention so the shared `fail` helper is available).
- [ ] Add `@test "fleet-* sealed secrets contain all non-legacy keys from their legacy counterparts"`:
  - [ ] Collect `legacy_only` keys from the schema (CI-safe, reads only committed files):
    ```bash
    legacy_only_keys=$(python3 -c "
    import yaml
    schema = yaml.safe_load(open('environments/schema.yaml'))
    print('\n'.join(
      s['name'] for s in schema.get('secrets', [])
      if s.get('legacy_only', False)
    ))")
    ```
  - [ ] For each `legacy:fleet` pair, diff `.spec.encryptedData` key sets with `yq`
    (key names are plaintext in the SealedSecret YAML; values stay encrypted):
    ```bash
    for pair in "mentolder:fleet-mentolder" "korczewski:fleet-korczewski"; do
      legacy="${pair%%:*}"; fleet="${pair##*:}"
      legacy_keys=$(yq '.spec.encryptedData | keys | .[]' "environments/sealed-secrets/${legacy}.yaml" | sort)
      fleet_keys=$(yq '.spec.encryptedData | keys | .[]'  "environments/sealed-secrets/${fleet}.yaml"  | sort)
      missing=""
      while IFS= read -r key; do
        [[ -z "$key" ]] && continue
        echo "$legacy_only_keys" | grep -qxF "$key" && continue
        echo "$fleet_keys"       | grep -qxF "$key" && continue
        missing="${missing} ${key}"
      done <<< "$legacy_keys"
      [[ -z "$missing" ]] || fail "Keys missing in sealed-secrets/${fleet}.yaml:${missing}"
    done
    ```
  - [ ] No helper script — `yq` and `python3` are available in the CI image (already used
    by other BATS tests). Add a `command -v yq` / `command -v python3` guard that `skip`s
    cleanly if either is absent, so the suite degrades rather than erroring.
- [ ] **Failing-test checkpoint:** before applying any schema `legacy_only` flags, run
  `bats tests/spec/fleet-operations.bats` — **expected: fail** (because the legacy files
  currently hold `MCP_KEYCLOAK_*` / decommissioned keys not present in fleet and not yet
  flagged `legacy_only`). This proves the guard actually catches the gap. Then complete
  the schema flagging in this task and re-run — **expected: pass**. If it still fails,
  the reported `missing` keys reveal a genuine fleet-sync gap to either seal into fleet
  or flag `legacy_only` (a real finding, not a test bug).
- [ ] S4 note: BATS files in `tests/spec/` are auto-discovered by `runner.sh` / `task
  test:all`; no manual registration needed. Regenerate the test inventory (final task).

---

## Task 3: Secrets-architecture reference document

**Dateien:** `docs/superpowers/references/secrets-architecture.md`

**Steps:**
- [ ] Create `docs/superpowers/references/secrets-architecture.md`.
- [ ] Section "Datei-Topologie": a table with columns *Datei · Status · Produziert ·
  Referenziert von* covering the four `.secrets/` files — fleet-mentolder /
  fleet-korczewski marked **Aktiv (Prod)**, mentolder / korczewski marked **Legacy
  (decommissioned standalone cluster)**. Use the `secrets_ref` chain
  (`.secrets/fleet-*.yaml` → `sealed-secrets/fleet-*.yaml` ← `environments/fleet-*.yaml`)
  exactly as in the spec table. No brand-domain literals (use file paths / placeholders).
- [ ] Section "Fleet-Sync-Regel": the rule that any new secret block added to a legacy
  file MUST be mirrored into its fleet counterpart unless the key carries
  `legacy_only: true` in `environments/schema.yaml`; note the CI guard
  (`tests/spec/fleet-operations.bats`) enforces it automatically.
- [ ] Section "Kanonische Sektionsstruktur (15 Abschnitte)": the ordered list of the 15
  canonical sections all four `.secrets/` files follow (the spec lists them 1–15 — note
  the spec heading says "14" but enumerates 15; use the enumerated 15-item list and title
  the section "15 Abschnitte" for accuracy).
- [ ] Section "Sealed-Secrets-Lifecycle": the ASCII lifecycle diagram
  (`.secrets/fleet-*` → `task env:seal` → `sealed-secrets/fleet-*` → commit/push → PR
  merge → GitHub Action → `kubectl apply` on fleet) from the spec.
- [ ] Aim for the 15-section canonical structure + topology + sync rule + lifecycle =
  the "15 Abschnitte" referenced in the spec; keep it a reference doc (no executable
  snippets that hardcode hostnames).

---

## Task 4: Security-agent reference section

**Dateien:** `.claude/agents/bachelorprojekt-security.md`

**Steps:**
- [ ] Insert a new `## Secrets-Dateiarchitektur` section into
  `.claude/agents/bachelorprojekt-security.md` (place it after the existing
  `## SealedSecrets lifecycle` / `## Critical rules` area, before `## Keycloak realm files`,
  so it sits with the other secrets guidance).
- [ ] Content: a pointer to `docs/superpowers/references/secrets-architecture.md` plus the
  single most important rule — `fleet-mentolder.yaml` and `fleet-korczewski.yaml` are the
  only active Prod files; legacy files (`mentolder.yaml`, `korczewski.yaml`) exist only as
  reference for the decommissioned standalone cluster; every new secret block must land in
  the fleet files (unless `legacy_only: true`).
- [ ] No brand-domain literals; refer to files/paths only (S3-safe — `.md` agent files are
  outside the S3 scope `k3d/ prod*/ website/src/` anyway, but keep it clean).

---

## Task 5: Verification & gates

**Dateien:** (no production code — runs the CI-equivalent gate suite)

**Steps:**
- [ ] `task env:validate` — confirm the new `legacy_only` flag + `MCP_KEYCLOAK_*` entries
  don't break schema validation.
- [ ] `bats tests/spec/fleet-operations.bats` — **expected: pass** now that the schema is
  flagged (the earlier checkpoint in Task 2 expected: fail before flagging).
- [ ] `task test:changed` — targeted tests for the changed domains (BATS selection + quality).
- [ ] `task test:all` — full offline suite incl. the new fleet-operations guard (it must
  run offline; confirm no live-cluster dependency).
- [ ] `task test:inventory` — regenerate `website/src/data/test-inventory.json` after the
  BATS addition and commit it (CI fails on drift).
- [ ] `task freshness:regenerate` — refresh generated artefacts.
- [ ] `task freshness:check` — CI-equivalent freshness + `quality:check` (S1–S4 ratchet) +
  baseline key-count assertion. Resolve generated-artifact conflicts with
  `git checkout --ours` per CLAUDE.md if a freshness regen collides.
- [ ] `bash scripts/openspec.sh validate` — validate the `openspec/` change tree.
- [ ] Confirm the new workflow YAML parses (`actionlint .github/workflows/deploy-sealed-secrets.yml`
  if available, otherwise `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/deploy-sealed-secrets.yml`).
