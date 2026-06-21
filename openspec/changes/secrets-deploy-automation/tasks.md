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

**Architecture:** Four independent deliverables land in one PR: (1) a new GitHub Action that auto-deploys `sealed-secrets/fleet-*.yaml` after merge to main, (2) a `legacy_only: true` annotation in `environments/schema.yaml` plus a BATS test that verifies fleet files are a superset of legacy files (minus legacy-only keys), (3) a new reference document documenting the secrets file topology, and (4) a paragraph addition to the `bachelorprojekt-security` agent pointing at that document.

**Tech Stack:** Bash, BATS, yq (already in CI), python3 + PyYAML (schema parsing), kubectl, GitHub Actions YAML.

Source spec: `(historisch archiviert: docs/superpowers/specs/2026-06-21-secrets-deploy-automation-design.md)`.

## Global Constraints

- No brand-domain literals (`mentolder.de`, `korczewski.de`) in any code or YAML — use file paths and abstract names only.
- `scripts/check-fleet-completeness.py` must NOT be created — inline `yq` + `python3` inside the BATS test only.
- `continue-on-error: true` must appear at **job level** on the `notify` job (not inside a step).
- BATS test reads only `environments/sealed-secrets/*.yaml` — never `.secrets/*.yaml` (gitignored, absent in CI).
- `yq` for key extraction; `python3` only for YAML schema parsing.
- All new files referenced in this plan — no orphaned artefacts.
- S1 size: all five new/modified files are non-baselined. Keep each file focused.

---

## File Structure

```
.github/workflows/deploy-sealed-secrets.yml          ← NEW: GitHub Action (validate → deploy → notify)
environments/schema.yaml                              ← MODIFY: legacy_only: true on 12 WG-mesh keys; add 3 MCP_KEYCLOAK_* entries
tests/spec/fleet-operations.bats                      ← NEW: BATS fleet-completeness guard (~75 lines)
.claude/skills/references/secrets-architecture.md   ← NEW: Reference doc (topology, lifecycle, sync rule)
.claude/agents/bachelorprojekt-security.md            ← MODIFY: add §Secrets-Dateiarchitektur section
website/src/data/test-inventory.json                  ← MODIFY: regenerated after new BATS tests
```

S1 pre-flight (non-baselined):
- `.github/workflows/deploy-sealed-secrets.yml` → new, target ~100 lines
- `environments/schema.yaml` → 1315 lines, non-baselined; adding ~15 lines is safe
- `tests/spec/fleet-operations.bats` → new, target ~75 lines
- `.claude/skills/references/secrets-architecture.md` → new, target ~100 lines
- `.claude/agents/bachelorprojekt-security.md` → 70 lines, non-baselined; adding ~14 lines

---

## Task 1: Schema — `legacy_only: true` Annotation

**Files:**
- Modify: `environments/schema.yaml` (WG GEKKO/K3S entries at lines ~1188–1231; MCP_KEYCLOAK entries near other Keycloak secrets)

**Interfaces:**
- Produces: `legacy_only: true` flag on keys in `environments/schema.yaml`; consumed by Task 2 BATS test via `python3 -c "import yaml ..."`.

- [ ] **Step 1: Identify all legacy-only keys by diffing sealed-secrets files**

  ```bash
  cd /home/patrick/Bachelorprojekt
  yq '.spec.encryptedData | keys | .[]' environments/sealed-secrets/mentolder.yaml | sort > /tmp/legacy-m.txt
  yq '.spec.encryptedData | keys | .[]' environments/sealed-secrets/fleet-mentolder.yaml | sort > /tmp/fleet-m.txt
  echo "=== Keys in mentolder.yaml but NOT in fleet-mentolder.yaml ===" && comm -23 /tmp/legacy-m.txt /tmp/fleet-m.txt
  yq '.spec.encryptedData | keys | .[]' environments/sealed-secrets/korczewski.yaml | sort > /tmp/legacy-k.txt
  yq '.spec.encryptedData | keys | .[]' environments/sealed-secrets/fleet-korczewski.yaml | sort > /tmp/fleet-k.txt
  echo "=== Keys in korczewski.yaml but NOT in fleet-korczewski.yaml ===" && comm -23 /tmp/legacy-k.txt /tmp/fleet-k.txt
  ```

  The output should match these two groups:
  - **WG Mesh (12 keys):** `WG_MESH_GEKKO2_PRIVATE_KEY`, `WG_MESH_GEKKO2_PUBLIC_KEY`, `WG_MESH_GEKKO3_PRIVATE_KEY`, `WG_MESH_GEKKO3_PUBLIC_KEY`, `WG_MESH_GEKKO4_PRIVATE_KEY`, `WG_MESH_GEKKO4_PUBLIC_KEY`, `WG_MESH_K3S1_PRIVATE_KEY`, `WG_MESH_K3S1_PUBLIC_KEY`, `WG_MESH_K3S2_PRIVATE_KEY`, `WG_MESH_K3S2_PUBLIC_KEY`, `WG_MESH_K3S3_PRIVATE_KEY`, `WG_MESH_K3S3_PUBLIC_KEY`
  - **MCP Keycloak (3 keys, korczewski-legacy):** `MCP_KEYCLOAK_CLIENT_ID`, `MCP_KEYCLOAK_CLIENT_SECRET`, `MCP_KEYCLOAK_REALM_URL`

  If the diff shows additional keys NOT in these two groups, those keys must be re-sealed into fleet files — do NOT mark them `legacy_only`.

- [ ] **Step 2: Add `legacy_only: true` to the 12 WG Mesh GEKKO/K3S entries**

  For each entry at lines ~1188–1231, add `legacy_only: true` after `required: false`. Example for GEKKO2 (apply same pattern to GEKKO3, GEKKO4, K3S1, K3S2, K3S3 — both `_PRIVATE_KEY` and `_PUBLIC_KEY`):

  ```yaml
  # BEFORE:
    - name: WG_MESH_GEKKO2_PRIVATE_KEY
      required: false
      sealed: true
      description: "wg-mesh private key for gekko-hetzner-2"

  # AFTER:
    - name: WG_MESH_GEKKO2_PRIVATE_KEY
      required: false
      legacy_only: true
      sealed: true
      description: "wg-mesh private key for gekko-hetzner-2 (decommissioned standalone cluster node)"
  ```

- [ ] **Step 3: Add MCP_KEYCLOAK_* entries to schema**

  Check: `grep -n "MCP_KEYCLOAK" environments/schema.yaml`

  If no results, locate `grep -n "KEYCLOAK_ADMIN_PASSWORD" environments/schema.yaml` and insert after that block:

  ```yaml
  # MCP Keycloak (korczewski-legacy — replaced by Pocket ID, T001068)
  - name: MCP_KEYCLOAK_CLIENT_ID
    required: false
    legacy_only: true
    description: "DECOMMISSIONED — MCP Keycloak OIDC client ID, replaced by Pocket ID (T001068)"
  - name: MCP_KEYCLOAK_CLIENT_SECRET
    required: false
    legacy_only: true
    sealed: true
    description: "DECOMMISSIONED — MCP Keycloak OIDC client secret, replaced by Pocket ID (T001068)"
  - name: MCP_KEYCLOAK_REALM_URL
    required: false
    legacy_only: true
    description: "DECOMMISSIONED — MCP Keycloak realm URL, replaced by Pocket ID (T001068)"
  ```

  If `MCP_KEYCLOAK_*` did NOT appear in the `comm` diff from Step 1, skip this step.

- [ ] **Step 4: Verify schema parses cleanly**

  ```bash
  cd /home/patrick/Bachelorprojekt
  python3 -c "
  import yaml
  schema = yaml.safe_load(open('environments/schema.yaml'))
  legacy = [s['name'] for s in schema.get('secrets', []) if s.get('legacy_only', False)]
  print(f'legacy_only keys found: {len(legacy)}')
  for k in sorted(legacy): print(' ', k)
  "
  ```

  Expected: prints all 12 WG-mesh keys minimum. No `yaml.scanner.ScannerError`.

- [ ] **Step 5: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add environments/schema.yaml
  git commit -m "feat(secrets): annotate decommissioned WG-mesh + MCP_KEYCLOAK keys as legacy_only"
  ```

---

## Task 2: BATS Guard — Fleet-Vollständigkeits-Test

**Files:**
- Create: `tests/spec/fleet-operations.bats`

**Interfaces:**
- Consumes: `environments/sealed-secrets/{mentolder,korczewski,fleet-mentolder,fleet-korczewski}.yaml` (committed, CI-safe); `environments/schema.yaml` via `python3`.
- Produces: 3 BATS tests registered in `task test:all` and `test-inventory.json`.

- [ ] **Step 1: Write the test first, then run it to verify it fails (TDD red phase — before Task 1 schema annotation)**

  Create the file as described in Step 2, then run:

  ```bash
  cd /home/patrick/Bachelorprojekt
  tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
  ```

  Expected: FAIL — completeness tests report WG-mesh / MCP_KEYCLOAK keys missing from fleet. This proves the guard catches the gap before the schema annotation is in place. If tests pass immediately (fleet files already complete), proceed — the schema annotation is still needed for ongoing guard correctness.

- [ ] **Step 2: Create `tests/spec/fleet-operations.bats`**

  Write the file with this exact content:

  ```bash
  #!/usr/bin/env bats
  # tests/spec/fleet-operations.bats
  # SSOT: openspec/changes/secrets-deploy-automation/tasks.md
  #
  # Guards fleet sealed-secret completeness:
  # every key in a legacy sealed-secrets file must appear in the corresponding
  # fleet file, UNLESS the key has legacy_only: true in environments/schema.yaml.
  #
  # CI-safe: reads only committed environments/sealed-secrets/*.yaml
  # (never .secrets/* — gitignored, absent in CI).
  # spec.encryptedData key names are plaintext in SealedSecret YAML; encrypted
  # values are never read — no plaintext secrets exposed.
  #
  # Prerequisites: yq >= 4.x, python3 + PyYAML (both available in CI).
  #
  # Run: tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
  # or:  task test:unit SPEC=fleet-operations

  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
  SEALED="${REPO_ROOT}/environments/sealed-secrets"
  SCHEMA="${REPO_ROOT}/environments/schema.yaml"

  setup() {
    load 'test_helper'
  }

  @test "fleet-mentolder: sealed secrets contain all non-legacy keys from mentolder (legacy)" {
    _assert_fleet_complete "mentolder" "fleet-mentolder"
  }

  @test "fleet-korczewski: sealed secrets contain all non-legacy keys from korczewski (legacy)" {
    _assert_fleet_complete "korczewski" "fleet-korczewski"
  }

  @test "schema.yaml: all legacy_only keys have required: false" {
    local violations
    violations=$(python3 -c "
  import yaml, sys
  schema = yaml.safe_load(open('${SCHEMA}'))
  bad = [s['name'] for s in schema.get('secrets', [])
         if s.get('legacy_only') and s.get('required', False)]
  if bad:
      print('\n'.join(bad))
      sys.exit(1)
  " 2>&1) || fail "legacy_only keys must not have required: true:\n${violations}"
  }

  _assert_fleet_complete() {
    local legacy="$1" fleet="$2"
    local legacy_file="${SEALED}/${legacy}.yaml"
    local fleet_file="${SEALED}/${fleet}.yaml"

    command -v yq      >/dev/null || skip "yq not available"
    command -v python3 >/dev/null || skip "python3 not available"

    [ -f "$legacy_file" ] || skip "Legacy file ${legacy}.yaml not present"
    [ -f "$fleet_file"  ] || skip "Fleet file ${fleet}.yaml not present"

    local legacy_only_keys
    legacy_only_keys=$(python3 -c "
  import yaml
  schema = yaml.safe_load(open('${SCHEMA}'))
  print('\n'.join(s['name'] for s in schema.get('secrets', []) if s.get('legacy_only', False)))
  ")

    local legacy_keys fleet_keys
    legacy_keys=$(yq '.spec.encryptedData | keys | .[]' "$legacy_file" | sort)
    fleet_keys=$(yq  '.spec.encryptedData | keys | .[]' "$fleet_file"  | sort)

    local missing=""
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      echo "$legacy_only_keys" | grep -qxF "$key" && continue
      echo "$fleet_keys"       | grep -qxF "$key" && continue
      missing="${missing} ${key}"
    done <<< "$legacy_keys"

    [[ -z "$missing" ]] \
      || fail "Keys in sealed-secrets/${legacy}.yaml missing from sealed-secrets/${fleet}.yaml (not marked legacy_only):${missing}"
  }
  ```

- [ ] **Step 3: Run tests after Task 1 is complete (green phase)**

  ```bash
  cd /home/patrick/Bachelorprojekt
  tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
  ```

  Expected: all 3 tests pass. If still failing, the fleet file has a genuine gap — re-seal (`task env:seal ENV=fleet-mentolder` / `fleet-korczewski`) and commit. Do NOT add `legacy_only: true` to hide a real gap.

- [ ] **Step 4: Verify `task test:all` includes the new tests**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:all 2>&1 | grep -E "fleet-operations|PASSED|FAILED" | head -20
  ```

  Expected: all 3 `fleet-operations` tests appear and show `PASSED`.

- [ ] **Step 5: Regenerate test inventory**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:inventory
  git diff --stat website/src/data/test-inventory.json
  ```

  Expected: 3 new fleet-operations test IDs in `test-inventory.json`.

- [ ] **Step 6: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add tests/spec/fleet-operations.bats website/src/data/test-inventory.json
  git commit -m "test(secrets): BATS guard for fleet sealed-secret completeness"
  ```

---

## Task 3: Referenzdokument `.claude/skills/references/secrets-architecture.md`

**Files:**
- Create: `.claude/skills/references/secrets-architecture.md`

**Interfaces:**
- Produces: human- and agent-readable reference; consumed by Task 4 (Security Agent).
- No code interfaces — documentation only.

- [ ] **Step 1: Create the reference document**

  Write `.claude/skills/references/secrets-architecture.md` with these sections:

  **Section: Datei-Topologie** — a 4-row table (columns: Datei · Status · Produziert · Referenziert von) with:
  - `environments/.secrets/fleet-mentolder.yaml` → Aktiv (Prod) → `sealed-secrets/fleet-mentolder.yaml` → `environments/fleet-mentolder.yaml` (secrets_ref)
  - `environments/.secrets/fleet-korczewski.yaml` → Aktiv (Prod) → `sealed-secrets/fleet-korczewski.yaml` → `environments/fleet-korczewski.yaml` (secrets_ref)
  - `environments/.secrets/mentolder.yaml` → Legacy (decommissioned standalone cluster) → `sealed-secrets/mentolder.yaml` → `environments/mentolder.yaml` (nicht mehr deployed)
  - `environments/.secrets/korczewski.yaml` → Legacy (decommissioned standalone cluster) → `sealed-secrets/korczewski.yaml` → `environments/korczewski.yaml` (nicht mehr deployed)

  **Section: Fleet-Sync-Regel** — the rule that any new secret block must land in fleet files unless `legacy_only: true`; note the BATS guard in `tests/spec/fleet-operations.bats` enforces it automatically.

  **Section: `legacy_only: true` — was es bedeutet** — explains the two current cases:
  - WG-Mesh-Keys for decommissioned nodes (GEKKO2/3/4, K3S1/2/3): joined fleet cluster 2026-05-31 as workers; WG config managed via `wireguard/wg-mesh-nodes.yaml`
  - MCP Keycloak secrets: replaced by Pocket ID (T001068)

  **Section: Sealed-Secrets-Lifecycle** — ASCII diagram:
  ```
  .secrets/fleet-*.yaml  →  task env:seal ENV=fleet-*  →  sealed-secrets/fleet-*.yaml
         ↓                                                          ↓
    (gitignored)                                            git commit + push
                                                                    ↓
                                                          PR merge → GitHub Action
                                                  (.github/workflows/deploy-sealed-secrets.yml)
                                                                    ↓
                                                      kubectl apply auf fleet-Cluster (idempotent)
  ```

  **Section: Kanonische Sektionsstruktur (15 Abschnitte)** — the ordered 15-item list from the spec (spec heading says "14" but enumerates 15; use 15):
  1. Externe API-Keys, 2. Backup & Speicher, 3. E-Mail (SMTP), 4. Datenbankpasswörter, 5. Admin-Zugangsdaten, 6. Session- & Signing-Secrets, 7. Pocket ID OIDC-Secrets (T001068), 8. Keycloak OIDC-Secrets (legacy), 9. LiveKit, 10. Brett, 11. Arena (korczewski only), 12. DB Connection Strings, 13. SSH-Schlüssel, 14. WireGuard-Mesh, 15. Dev-only Overrides

  **Section: Auto-Deploy via GitHub Action** — describes the three-job workflow (validate / deploy / notify), only `FLEET_KUBECONFIG` required.

- [ ] **Step 2: Verify the file**

  ```bash
  wc -l /home/patrick/Bachelorprojekt/.claude/skills/references/secrets-architecture.md
  head -3 /home/patrick/Bachelorprojekt/.claude/skills/references/secrets-architecture.md
  ```

  Expected: ~90–115 lines, starts with `# Secrets-Architektur`.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add .claude/skills/references/secrets-architecture.md
  git commit -m "docs(secrets): add secrets-architecture reference (topology, fleet-sync rule, lifecycle)"
  ```

---

## Task 4: Security-Agent — `## Secrets-Dateiarchitektur` Section

**Files:**
- Modify: `.claude/agents/bachelorprojekt-security.md` (currently 70 lines → ~84 lines)

**Interfaces:**
- Consumes: `.claude/skills/references/secrets-architecture.md` (Task 3).
- Produces: Updated agent file routing security agents to the architecture reference.

- [ ] **Step 1: Insert section after the `## SealedSecrets lifecycle` code block**

  Locate the closing triple-backtick of the `## SealedSecrets lifecycle` code block (the ` ``` ` after `task workspace:deploy ENV=<env>`). Insert the following immediately after that closing backtick, before `## Critical rules`:

  ```markdown
  ## Secrets-Dateiarchitektur

  Die vollständige Dokumentation der `.secrets/`-Datei-Topologie, der Fleet-Sync-Regel
  und der kanonischen Sektionsstruktur steht in:
  → `.claude/skills/references/secrets-architecture.md`

  **Wichtigste Regel:** `fleet-mentolder.yaml` und `fleet-korczewski.yaml` sind die
  einzigen aktiven Prod-Dateien. Legacy-Dateien (`mentolder.yaml`, `korczewski.yaml`)
  existieren nur als Referenz für den decommissionten Standalone-Cluster.
  Jeder neue Secret-Block muss in die fleet-Dateien, **nicht** in die Legacy-Dateien.

  Der CI-Guard (`tests/spec/fleet-operations.bats`) erzwingt diese Regel automatisch.
  Schlägt er fehl, fleet-Dateien neu sealen und pushen.
  ```

- [ ] **Step 2: Verify frontmatter is intact**

  ```bash
  head -8 /home/patrick/Bachelorprojekt/.claude/agents/bachelorprojekt-security.md
  ```

  Expected: `---`, `name: bachelorprojekt-security`, `description:` block, closing `---` all present.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add .claude/agents/bachelorprojekt-security.md
  git commit -m "chore(agents): add secrets-architecture reference to bachelorprojekt-security"
  ```

---

## Task 5: GitHub Action `deploy-sealed-secrets.yml`

**Files:**
- Create: `.github/workflows/deploy-sealed-secrets.yml`

**Interfaces:**
- Triggers: push to `main` when `environments/sealed-secrets/fleet-mentolder.yaml` or `fleet-korczewski.yaml` changes; also `workflow_dispatch`.
- Consumes: GitHub secret `FLEET_KUBECONFIG` (already present — used identically by `build-website.yml` and `post-merge.yml`).
- Produces: Applied SealedSecrets on fleet cluster + ticket comment.

**Pattern source:** `build-website.yml` and `post-merge.yml` for kubeconfig setup (`base64 -d` into `~/.kube/config`). This workflow does NOT build images, NOT run kustomize, NOT envsubst — it only verifies and applies two committed SealedSecret YAMLs.

- [ ] **Step 1: Create `.github/workflows/deploy-sealed-secrets.yml`**

  Write with this exact content:

  ```yaml
  name: Deploy SealedSecrets (fleet)

  on:
    push:
      branches: [main]
      paths:
        - 'environments/sealed-secrets/fleet-mentolder.yaml'
        - 'environments/sealed-secrets/fleet-korczewski.yaml'
        - '.github/workflows/deploy-sealed-secrets.yml'
    workflow_dispatch:
      inputs:
        reason:
          description: 'Manual trigger reason'
          required: false

  permissions:
    contents: read

  jobs:
    validate:
      name: Validate SealedSecrets against live cluster cert
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - name: Install kubectl and kubeseal
          run: |
            curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
              -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
            KUBESEAL_VERSION="0.27.0"
            curl -sSL "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz" \
              | tar -xz -C /usr/local/bin kubeseal && chmod +x /usr/local/bin/kubeseal

        - name: Set up kubeconfig
          env:
            KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
          run: |
            mkdir -p "$HOME/.kube"
            echo "$KUBECONFIG_DATA" | base64 -d > "$HOME/.kube/config"
            chmod 600 "$HOME/.kube/config"
            echo "KUBECONFIG=$HOME/.kube/config" >> "$GITHUB_ENV"

        - name: Verify fleet-mentolder SealedSecret against cluster cert
          run: |
            kubeseal --verify \
              --controller-name=sealed-secrets \
              --controller-namespace=sealed-secrets \
              -f environments/sealed-secrets/fleet-mentolder.yaml

        - name: Verify fleet-korczewski SealedSecret against cluster cert
          run: |
            kubeseal --verify \
              --controller-name=sealed-secrets \
              --controller-namespace=sealed-secrets \
              -f environments/sealed-secrets/fleet-korczewski.yaml

    deploy:
      name: Apply SealedSecrets to fleet cluster
      runs-on: ubuntu-latest
      needs: validate
      steps:
        - uses: actions/checkout@v4

        - name: Install kubectl
          run: |
            curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
              -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl

        - name: Set up kubeconfig
          env:
            KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
          run: |
            mkdir -p "$HOME/.kube"
            echo "$KUBECONFIG_DATA" | base64 -d > "$HOME/.kube/config"
            chmod 600 "$HOME/.kube/config"
            echo "KUBECONFIG=$HOME/.kube/config" >> "$GITHUB_ENV"

        - name: Apply fleet-mentolder SealedSecret
          run: kubectl apply -f environments/sealed-secrets/fleet-mentolder.yaml

        - name: Apply fleet-korczewski SealedSecret
          run: kubectl apply -f environments/sealed-secrets/fleet-korczewski.yaml

    notify:
      name: Post deploy comment to ticket
      runs-on: ubuntu-latest
      needs: deploy
      continue-on-error: true
      steps:
        - uses: actions/checkout@v4

        - name: Install kubectl
          run: |
            curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
              -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl

        - name: Set up kubeconfig
          env:
            KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
          run: |
            mkdir -p "$HOME/.kube"
            echo "$KUBECONFIG_DATA" | base64 -d > "$HOME/.kube/config"
            chmod 600 "$HOME/.kube/config"
            echo "KUBECONFIG=$HOME/.kube/config" >> "$GITHUB_ENV"

        - name: Post deploy comment to awaiting_deploy ticket
          run: |
            TICKET_ID="$(git log -1 --pretty=%B | grep -oE 'T[0-9]{6}' | head -1 || true)"
            SHA="$(git rev-parse --short HEAD)"
            TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"
            if [[ -z "$TICKET_ID" ]]; then
              echo "No T###### in merge commit — skipping ticket comment."
              exit 0
            fi
            export TICKET_CTX=fleet BRAND=mentolder
            bash scripts/ticket.sh add-comment \
              --id "$TICKET_ID" \
              --body "SealedSecrets deployed [${SHA}] at ${TIMESTAMP} (fleet-mentolder + fleet-korczewski)" \
              --author "deploy-bot" \
              || echo "WARNING: ticket comment failed (non-fatal — workflow succeeds via continue-on-error)"
  ```

- [ ] **Step 2: Verify YAML syntax**

  ```bash
  python3 -c "
  import yaml
  yaml.safe_load(open('/home/patrick/Bachelorprojekt/.github/workflows/deploy-sealed-secrets.yml'))
  print('YAML OK')
  "
  ```

  Expected: `YAML OK`.

- [ ] **Step 3: Verify `continue-on-error: true` is at job level**

  ```bash
  grep -n "continue-on-error" /home/patrick/Bachelorprojekt/.github/workflows/deploy-sealed-secrets.yml
  ```

  Expected: one match under `notify:` job (between `needs: deploy` and `steps:`), not inside any `run:` block.

- [ ] **Step 4: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add .github/workflows/deploy-sealed-secrets.yml
  git commit -m "feat(ci): auto-deploy fleet SealedSecrets after merge to main"
  ```

---

## Task 6: Final Verification

**Files:**
- Modify: `website/src/data/test-inventory.json` (if not already committed in Task 2)

**Interfaces:**
- Consumes: all prior tasks completed.
- Produces: green `task test:all`, up-to-date inventory, passing freshness, valid openspec tree.

- [ ] **Step 1: Run changed tests**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:changed
  ```

  Expected: all 3 new `fleet-operations` BATS tests pass.

- [ ] **Step 2: Ensure test inventory is current**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:inventory
  git diff --stat website/src/data/test-inventory.json
  ```

  If diff is non-empty:

  ```bash
  git add website/src/data/test-inventory.json
  git commit -m "chore: update test-inventory after fleet-operations BATS tests"
  ```

- [ ] **Step 3: Regenerate freshness artifacts**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task freshness:regenerate
  ```

  Expected: completes without error.

- [ ] **Step 4: Check freshness**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task freshness:check
  ```

  Expected: green. If conflict on generated artifact, resolve with `git checkout --ours <file>` per CLAUDE.md.

- [ ] **Step 5: Validate OpenSpec change tree**

  ```bash
  cd /home/patrick/Bachelorprojekt
  task openspec:validate 2>/dev/null || bash scripts/openspec.sh validate
  ```

  Expected: `secrets-deploy-automation` change passes validation.

- [ ] **Step 6: Commit freshness artifacts if changed**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git status
  git add docs/generated/ k3d/docs-content-built/architecture/index.html 2>/dev/null || true
  git diff --cached --stat
  git commit -m "chore: regenerate freshness artifacts" \
    || echo "No freshness changes to commit"
  ```

---

## Self-Review

### Spec coverage

| Spec requirement | Plan task |
|---|---|
| GitHub Action: auto-deploy SealedSecrets after merge | Task 5 |
| Job sequence: validate → deploy → notify | Task 5 (three separate jobs with `needs:`) |
| `kubeseal --verify` against live cert in validate job | Task 5 Step 1 |
| `notify` job: `continue-on-error: true` at job level | Task 5 Step 1 (YAML) + Step 3 (verified by grep) |
| `notify` uses `scripts/ticket.sh add-comment` via kubeconfig | Task 5 Step 1 |
| Schema: `legacy_only: true` on 12 WG GEKKO/K3S keys | Task 1 Step 2 |
| Schema: add MCP_KEYCLOAK_* entries with `legacy_only: true` | Task 1 Step 3 |
| BATS guard reads only `sealed-secrets/*.yaml`, never `.secrets/` | Task 2 Step 2 (code comment + implementation) |
| BATS reads `spec.encryptedData` key names via `yq` | Task 2 Step 2 |
| BATS uses `python3` only for schema parsing | Task 2 Step 2 |
| TDD: write failing test before schema annotation | Task 2 Step 1 |
| No separate helper script | Task 2 (inline `_assert_fleet_complete` BATS function) |
| Reference doc: topology table | Task 3 Step 1 |
| Reference doc: Fleet-Sync-Regel | Task 3 Step 1 |
| Reference doc: 15-section canonical structure | Task 3 Step 1 |
| Reference doc: lifecycle diagram | Task 3 Step 1 |
| Reference doc: auto-deploy section | Task 3 Step 1 |
| Security-Agent: new `## Secrets-Dateiarchitektur` section | Task 4 Step 1 |
| Final: `task test:all` | Task 6 Step 1 |
| Final: `task test:inventory` + commit | Task 6 Step 2 |
| Final: `task freshness:regenerate` + `task freshness:check` | Task 6 Steps 3–4 |
| Final: `task openspec:validate` | Task 6 Step 5 |
| No brand-domain literals in code | All tasks confirmed |
| S1 budget: all non-baselined | File Structure section |

### Placeholder scan

All steps contain complete, runnable content. No open placeholders remain.

### Type/name consistency

BATS helper `_assert_fleet_complete` is defined and called within the same file (Task 2). `scripts/ticket.sh add-comment` interface verified against `scripts/ticket.sh` header line 7: `add-comment --id <external_id> --body <body> [--author <author_label>]`. No cross-task type mismatches.
