---
title: Fleet Phase 2b — Full Service Stacks for Both Brands Implementation Plan
ticket_id: T000345
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# Fleet Phase 2b — Full Service Stacks for Both Brands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `task fleet:deploy` bring up the *complete* service stack for both brands on the unified `fleet` cluster (pk-hetzner-4/6/8) — including Collabora office and CoTURN/Janus video backend — so mentolder and korczewski Talk/office/streaming work, not just the core workspace MVP.

**Architecture:** Per the operator decision, Collabora and CoTURN/Janus run as a **single shared stack** serving both brands (one `workspace-office` ns, one `coturn` ns), deployed once against the `fleet` context. The shared Collabora Ingress carries both brands' hostnames; the shared coturn/Janus uses one TURN/signaling secret that both brands' sealed secrets are standardized to. The per-brand workspace stacks (ns `workspace` / `workspace-korczewski`) stay isolated as in Phase 2a — only the stateless office/video relays are shared. `fleet:deploy` is restructured into a correct ordering: platform → per-brand core+post-setup → shared office/coturn → per-brand talk-setup.

**Tech Stack:** Kustomize (overlays + components), kubectl (server-side apply), envsubst, Taskfile (go-task), k3s v1.36.1, cert-manager (DNS-01/ipv64), SealedSecrets, Longhorn, BATS, Bash.

**Spec / context:** Fleet Phase 2a design (`docs/superpowers/specs/2026-05-30-fleet-phase2a-dual-brand-design.md`), `docs/fleet-stage2-cutover-runbook.md`, CLAUDE.md Fleet topology section.
**Ticket:** T000345 (filled by dev-flow-plan)  ·  **Branch:** `feature/fleet-phase2b-full-stacks`

---

## Key facts established during investigation

These are verified against the codebase at `18b33192` — do not re-derive:

- `fleet:deploy:brand` (Taskfile.yml ~1459) currently runs **only** `workspace:deploy` (bare manifest apply). It skips `office:deploy`, coturn apply, `mcp:deploy`, `post-setup`, `talk-setup`, `recording-setup`, `transcriber-setup` — the whole post-deploy chain that `workspace:setup` (Taskfile.yml:501) runs.
- `TURN_NODE` is **already** correctly repointed to fleet pk nodes: `fleet-mentolder.yaml:40` → `pk-hetzner-4`, `fleet-korczewski.yaml:40` → `pk-hetzner-6`. The "gekko-pin" symptom is a *consequence* of coturn never deploying, not a stale env var. (One real stale pin remains: `talk-hpb` colocation — see Task 5.)
- `k3d/office-stack/*.yaml` hardcodes ns `workspace-office`; `k3d/coturn-stack/kustomization.yaml` hardcodes ns `coturn`. Neither is brand-suffixed. → shared single stack (operator decision).
- `scripts/talk-hpb-setup.sh:55-61` aborts `exit 1` if `SIGNALING_SECRET` or `TURN_SECRET` is unset/`MANAGED_EXTERNALLY` in `workspace-secrets`. These are populated by `workspace:coturn:sync-secret` (Taskfile.yml ~758), which requires the coturn stack + the brand's `workspace-secrets` to already exist.
- `coturn:sync-secret` reads `workspace-secrets` in `${WORKSPACE_NAMESPACE}` (per brand) and writes `coturn-secrets` in ns `coturn`, then restarts `deploy/coturn` + `deploy/janus`. With a shared stack, this must run from **one canonical brand** whose secret both brands match.
- `office:deploy` envsubst vars: `$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_ALIASGROUP1 $COLLABORA_SERVER_NAME $COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES` (Taskfile.yml ~912). `coturn:deploy` envsubst vars: `$TURN_NODE $TURN_PUBLIC_IP $PROD_DOMAIN $TLS_SECRET_NAME` (Taskfile.yml ~770).
- korczewski is already wired into `fleet:deploy` (Taskfile.yml ~1477); its ns is empty only because the prior run aborted at talk-setup before completing.

---

## File Structure

**New / modified files:**

- Modify `k3d/office-stack/ingress.yaml` — add a second host rule so one Collabora Ingress answers both `${COLLABORA_HOST}` and `${COLLABORA_HOST_2}`.
- Modify `k3d/office-stack/collabora.yaml` — add `${COLLABORA_ALIASGROUP2}` to the WOPI `aliasgroup` env so korczewski's Nextcloud may embed Collabora.
- Modify `Taskfile.yml`:
  - New task `fleet:shared-services` — deploy office-stack + coturn-stack **once** against `fleet`, with both brands' hosts/aliasgroups, sourcing canonical TURN vars.
  - New task `fleet:talk-setup:brand` — run `talk-setup` + `recording-setup` + `transcriber-setup` for one brand against the shared coturn.
  - Restructure `fleet:deploy:brand` — add `mcp:deploy` + `post-setup` (NOT talk-setup) after `workspace:deploy`.
  - Restructure `fleet:deploy` — new ordering (see Task 6).
- Modify `prod-fleet/components/fleet-common/kustomization.yaml` — add a `talk-hpb` node-affinity repoint patch (pin to the fleet TURN node) and a cross-ns `namespaces:[coturn]` fix for its Janus colocation, OR replace colocation with nodeAffinity (Task 5).
- Modify `environments/.secrets/fleet-mentolder.yaml` + `environments/.secrets/fleet-korczewski.yaml` — standardize `TURN_SECRET`, `SIGNALING_SECRET` (+ any `JANUS_*` shared secret) to identical values; then reseal both. **(Sensitive files — operator edits/confirms; see Task 4.)**
- Create `tests/unit/fleet-phase2b.bats` — assert the new Taskfile tasks exist, are wired in the correct order, and that `fleet:shared-services` deploys office+coturn exactly once (not in the per-brand loop).

**Verification note (infra plan, not classic TDD):** Cluster-apply ordering can't be unit-tested in the classic red-green sense. "Tests" here = (1) BATS assertions on Taskfile structure, (2) `kustomize build` validation of modified overlays, (3) `task --dry` of `fleet:deploy` to prove fan-out order, then (4) live `task fleet:deploy` against the `fleet` context with curl/rollout verification. Each task below states which applies.

---

## Task 1: BATS guard for the new fleet task structure (write first)

**Files:**
- Create: `tests/unit/fleet-phase2b.bats`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bats
# Structural guards for Fleet Phase 2b full-stack deploy wiring.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

@test "fleet:shared-services task exists" {
  run grep -qE '^\s+fleet:shared-services:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:talk-setup:brand task exists" {
  run grep -qE '^\s+fleet:talk-setup:brand:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:deploy:brand runs mcp:deploy and post-setup but NOT talk-setup" {
  # Extract the fleet:deploy:brand block (until the next top-level task at same indent)
  block="$(awk '/^  fleet:deploy:brand:/{f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:brand:/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  echo "$block" | grep -q 'workspace:deploy'
  echo "$block" | grep -q 'mcp:deploy'
  echo "$block" | grep -q 'workspace:post-setup'
  ! echo "$block" | grep -q 'talk-setup'
}

@test "fleet:deploy deploys shared-services exactly once (not per brand)" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  count="$(echo "$block" | grep -c 'fleet:shared-services')"
  [ "$count" -eq 1 ]
}

@test "fleet:deploy orders shared-services after both brand deploys, before talk-setup" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  shared_line="$(echo "$block" | grep -n 'fleet:shared-services' | head -1 | cut -d: -f1)"
  talk_line="$(echo "$block" | grep -n 'fleet:talk-setup:brand' | head -1 | cut -d: -f1)"
  brand_line="$(echo "$block" | grep -n 'fleet:deploy:brand' | tail -1 | cut -d: -f1)"
  [ "$brand_line" -lt "$shared_line" ]
  [ "$shared_line" -lt "$talk_line" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/runner.sh local fleet-phase2b` (or `bats tests/unit/fleet-phase2b.bats`)
Expected: FAIL — the new tasks don't exist yet and `fleet:deploy:brand` lacks `mcp:deploy`/`post-setup`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/fleet-phase2b.bats
git commit -m "test(fleet): add Phase 2b full-stack wiring guards [T000345]"
```

---

## Task 2: Dual-host the shared Collabora Ingress + WOPI aliasgroup

**Files:**
- Modify: `k3d/office-stack/ingress.yaml`
- Modify: `k3d/office-stack/collabora.yaml`

- [ ] **Step 1: Add the second host rule to the Collabora Ingress**

In `k3d/office-stack/ingress.yaml`, duplicate the existing `${COLLABORA_HOST}` host rule block under `spec.rules` to add a `${COLLABORA_HOST_2}` rule pointing at the same `collabora` Service/port, and add `${COLLABORA_HOST_2}` to the `spec.tls[0].hosts` list (or a second `tls` entry referencing `${COLLABORA_TLS_SECRET_2}` if a separate cert is wanted — default: reuse a SAN cert covering both, single `tls` entry with both hosts).

Concretely, the `rules:` list gains a second entry identical to the first except `host: ${COLLABORA_HOST_2}`, and `tls:` lists both hosts under one `secretName: ${COLLABORA_TLS_SECRET}`.

- [ ] **Step 2: Add the second WOPI aliasgroup to Collabora**

In `k3d/office-stack/collabora.yaml`, locate the `aliasgroup1=${COLLABORA_ALIASGROUP1}` env value (the WOPI host allowlist). Append a second alias group so both brands' Nextcloud hosts may embed Collabora. Collabora reads aliasgroups from the `aliasgroup1`, `aliasgroup2`, … env vars; add:

```yaml
        - name: aliasgroup2
          value: ${COLLABORA_ALIASGROUP2}
```

placed immediately after the existing `aliasgroup1` env entry, matching its indentation.

- [ ] **Step 3: Validate kustomize build with both vars substituted**

Run:
```bash
COLLABORA_HOST=collabora.mentolder.de COLLABORA_HOST_2=collabora.korczewski.de \
COLLABORA_ALIASGROUP1='https://cloud\.mentolder\.de:443' \
COLLABORA_ALIASGROUP2='https://cloud\.korczewski\.de:443' \
COLLABORA_SERVER_NAME=collabora.mentolder.de COLLABORA_SSL_TERMINATION=true \
COLLABORA_TLS_SECRET=collabora-tls PROD_DOMAIN=mentolder.de \
COLLABORA_INGRESS_MIDDLEWARES=workspace-redirect-https@kubernetescrd \
bash -c 'kustomize build k3d/office-stack | envsubst | kubectl apply --dry-run=client -f - >/dev/null && echo OK'
```
Expected: `OK` (no literal `${...}` left, both hosts present in the rendered Ingress).

- [ ] **Step 4: Commit**

```bash
git add k3d/office-stack/ingress.yaml k3d/office-stack/collabora.yaml
git commit -m "feat(office): dual-host shared Collabora ingress + WOPI aliasgroup for fleet [T000345]"
```

---

## Task 3: `fleet:shared-services` — deploy office + coturn once

**Files:**
- Modify: `Taskfile.yml` (add task near the other `fleet:*` tasks, ~line 1450)

- [ ] **Step 1: Add the task**

Add under the `fleet:` task group:

```yaml
  fleet:shared-services:
    desc: "Deploy the SHARED Collabora (office-stack) + CoTURN/Janus (coturn-stack) ONCE on the fleet cluster, serving both brands. Run AFTER both brand workspace:deploy passes (needs workspace-secrets to exist for coturn sync)."
    cmds:
      - |
        set -euo pipefail
        kubectl config use-context fleet
        # --- Collabora (shared, dual-host) ---
        # Primary host vars from fleet-mentolder; second host from fleet-korczewski.
        source scripts/env-resolve.sh fleet-mentolder
        export COLLABORA_HOST="collabora.${PROD_DOMAIN}"
        export COLLABORA_SERVER_NAME="collabora.${PROD_DOMAIN}"
        export COLLABORA_ALIASGROUP1="https://cloud\\.${PROD_DOMAIN}:443"
        export COLLABORA_SSL_TERMINATION="true"
        export COLLABORA_TLS_SECRET="collabora-tls"
        export COLLABORA_INGRESS_MIDDLEWARES="workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd"
        # Capture mentolder TURN vars BEFORE re-sourcing korczewski.
        MENTOLDER_TURN_NODE="$TURN_NODE"; MENTOLDER_TURN_PUBLIC_IP="${TURN_PUBLIC_IP:-$LIVEKIT_PIN_IP}"
        MENTOLDER_TLS_SECRET_NAME="${TLS_SECRET_NAME:-workspace-tls}"; MENTOLDER_PROD_DOMAIN="$PROD_DOMAIN"
        ( source scripts/env-resolve.sh fleet-korczewski; echo "collabora.${PROD_DOMAIN}|https://cloud\\.${PROD_DOMAIN}:443" ) > /tmp/_kore_collabora.txt
        export COLLABORA_HOST_2="$(cut -d'|' -f1 /tmp/_kore_collabora.txt)"
        export COLLABORA_ALIASGROUP2="$(cut -d'|' -f2 /tmp/_kore_collabora.txt)"
        kustomize build k3d/office-stack \
          | envsubst '$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_HOST_2 $COLLABORA_ALIASGROUP1 $COLLABORA_ALIASGROUP2 $COLLABORA_SERVER_NAME $COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES' \
          | kubectl --context fleet apply -f -
        kubectl --context fleet rollout status deploy/collabora -n workspace-office --timeout=300s
        # --- CoTURN/Janus (shared) ---
        export TURN_NODE="$MENTOLDER_TURN_NODE"; export TURN_PUBLIC_IP="$MENTOLDER_TURN_PUBLIC_IP"
        export PROD_DOMAIN="$MENTOLDER_PROD_DOMAIN"; export TLS_SECRET_NAME="$MENTOLDER_TLS_SECRET_NAME"
        kustomize build k3d/coturn-stack \
          | envsubst '$TURN_NODE $TURN_PUBLIC_IP $PROD_DOMAIN $TLS_SECRET_NAME' \
          | kubectl --context fleet apply -f -
        kubectl --context fleet rollout status deploy/coturn -n coturn --timeout=180s
        kubectl --context fleet rollout status deploy/janus  -n coturn --timeout=180s
```

> NOTE on TURN_PUBLIC_IP: the shared coturn binds one public IP. `fleet-mentolder.yaml` pins `TURN_NODE=pk-hetzner-4` with `LIVEKIT_PIN_IP=204.168.244.104`. Confirm at execution that `TURN_PUBLIC_IP` resolves to that node's public IP (the env file may expose it as `TURN_PUBLIC_IP` or only `LIVEKIT_PIN_IP` — the fallback `${TURN_PUBLIC_IP:-$LIVEKIT_PIN_IP}` above handles both; verify the rendered coturn manifest carries the pk-hetzner-4 IP).

- [ ] **Step 2: Validate the task parses and renders (dry)**

Run:
```bash
task --dry fleet:shared-services 2>&1 | head -40
```
Expected: the rendered command block prints with no Taskfile parse error. (It will `use-context fleet`; if the context isn't present locally this dry-run still prints the cmd without executing apply.)

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(fleet): add fleet:shared-services for once-only office+coturn deploy [T000345]"
```

---

## Task 4: Standardize the shared TURN/signaling secret across brands

**Files:**
- Modify: `environments/.secrets/fleet-mentolder.yaml` *(sensitive — operator)*
- Modify: `environments/.secrets/fleet-korczewski.yaml` *(sensitive — operator)*
- Regenerate: `environments/sealed-secrets/fleet-mentolder.yaml`, `environments/sealed-secrets/fleet-korczewski.yaml`

> **Sensitive-path gate:** `environments/.secrets/*.yaml` is off-limits to the agent without explicit operator action. The executor MUST pause here and have the operator perform Steps 1–2, or be explicitly authorized to edit these files. Do not read or echo their contents.

- [ ] **Step 1: Set identical shared-relay secrets in both plaintext secret files**

Because one shared coturn/Janus authenticates clients from both brands, both brands' `workspace-secrets` must present the SAME `TURN_SECRET` and `SIGNALING_SECRET` (and any `JANUS_API_SECRET`/HPB shared secret). Choose mentolder's current values as canonical and copy them into `fleet-korczewski.yaml`'s corresponding keys (or generate fresh values and set both identically).

- [ ] **Step 2: Reseal both brands**

Run:
```bash
task env:seal ENV=fleet-mentolder
task env:seal ENV=fleet-korczewski
```
Expected: updated `environments/sealed-secrets/fleet-*.yaml` committed-ready, encrypted against the fleet sealing cert.

- [ ] **Step 3: Commit (sealed files only — never the plaintext)**

```bash
git add environments/sealed-secrets/fleet-mentolder.yaml environments/sealed-secrets/fleet-korczewski.yaml
git commit -m "chore(secrets): standardize shared TURN/signaling secret across fleet brands [T000345]"
```

Verify no plaintext leaked:
```bash
git diff --cached --name-only | grep -q '\.secrets/' && echo "ABORT: plaintext staged" || echo "clean"
```
Expected: `clean`.

---

## Task 5: Repoint `talk-hpb` (spreed signaling) to the fleet TURN node

**Files:**
- Modify: `prod-fleet/components/fleet-common/kustomization.yaml`

**Why:** `k3d/talk-hpb.yaml` colocates spreed-signaling with Janus via same-namespace `podAffinity`. On fleet, Janus lives in ns `coturn` while talk-hpb lives in `workspace`/`workspace-korczewski`, so same-ns podAffinity can't find Janus and the pod may go Pending or land off-node from the shared Janus. Replace the colocation with a direct nodeAffinity pin to the shared TURN node (same node Janus is pinned to via `TURN_NODE`).

- [ ] **Step 1: Add a talk-hpb node-affinity patch to fleet-common**

In `prod-fleet/components/fleet-common/kustomization.yaml`, add a strategic-merge or JSON patch targeting the `talk-hpb` Deployment that sets `spec.template.spec.affinity.nodeAffinity` to require `kubernetes.io/hostname` ∈ the fleet TURN node, and removes the existing `podAffinity` block. Because the TURN node differs per brand (pk-hetzner-4 vs pk-hetzner-6), express it via the envsubst var already in scope — pin to `${TURN_NODE}` so each brand's render resolves to its own node:

```yaml
patches:
  - target:
      kind: Deployment
      name: talk-hpb
    patch: |
      - op: remove
        path: /spec/template/spec/affinity/podAffinity
      - op: add
        path: /spec/template/spec/affinity/nodeAffinity
        value:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: ["${TURN_NODE}"]
```

> If `talk-hpb`'s `affinity` has no `podAffinity` at apply time the `remove` op fails — confirm the base path with `kustomize build prod-fleet/mentolder | yq 'select(.metadata.name=="talk-hpb").spec.template.spec.affinity'` and adjust to `op: replace /spec/template/spec/affinity` with a full object if needed.

- [ ] **Step 2: Validate both brand overlays still build with TURN_NODE substituted**

Run:
```bash
for brand in mentolder korczewski; do
  source scripts/env-resolve.sh fleet-$brand
  kustomize build prod-fleet/$brand --load-restrictor=LoadRestrictionsNone \
    | envsubst | kubectl apply --dry-run=client -f - >/dev/null \
    && echo "$brand OK"
done
```
Expected: `mentolder OK` and `korczewski OK`; rendered talk-hpb shows nodeAffinity to the brand's pk TURN node and no podAffinity.

- [ ] **Step 3: Commit**

```bash
git add prod-fleet/components/fleet-common/kustomization.yaml
git commit -m "fix(fleet): pin talk-hpb to shared TURN node instead of cross-ns Janus colocation [T000345]"
```

---

## Task 6: Restructure `fleet:deploy:brand`, add `fleet:talk-setup:brand`, rewire `fleet:deploy`

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Extend `fleet:deploy:brand` with mcp + post-setup (NOT talk-setup)**

Replace the `cmds:` of `fleet:deploy:brand` so it runs the core chain that is safe without coturn:

```yaml
  fleet:deploy:brand:
    desc: "Deploy ONE brand's core stack to fleet: workspace:deploy + mcp:deploy + post-setup. Talk/office come from fleet:shared-services + fleet:talk-setup:brand. Usage: task fleet:deploy:brand BRAND=fleet-korczewski"
    requires:
      vars: [BRAND]
    cmds:
      - task: workspace:deploy
        vars: { ENV: "{{.BRAND}}" }
      - task: mcp:deploy
        vars: { ENV: "{{.BRAND}}" }
      - task: workspace:post-setup
        vars: { ENV: "{{.BRAND}}" }
```

- [ ] **Step 2: Add `fleet:talk-setup:brand`**

```yaml
  fleet:talk-setup:brand:
    desc: "Wire ONE brand to the shared coturn/Janus: sync coturn secret from this brand, run talk-setup + recording-setup + transcriber-setup. Run AFTER fleet:shared-services. Usage: task fleet:talk-setup:brand BRAND=fleet-mentolder"
    requires:
      vars: [BRAND]
    cmds:
      - task: workspace:talk-setup
        vars: { ENV: "{{.BRAND}}" }
      - task: workspace:recording-setup
        vars: { ENV: "{{.BRAND}}" }
      - task: workspace:transcriber-setup
        vars: { ENV: "{{.BRAND}}" }
```

> `workspace:talk-setup` triggers `coturn:sync-secret` for the brand (Taskfile.yml ~1672). Since Task 4 made both brands' secrets identical, syncing from either yields a consistent shared `coturn-secrets`. The second brand's talk-setup re-syncs the same values (idempotent) and restarts its own talk-hpb to authenticate against the shared Janus.

- [ ] **Step 3: Rewire `fleet:deploy` to the correct ordering**

```yaml
  fleet:deploy:
    desc: "Full Phase 2b deploy: platform → both brands' core → shared office/coturn → both brands' talk-setup. Brings up the COMPLETE stack for both brands on the fleet cluster."
    cmds:
      - task: fleet:platform
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-mentolder }
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-korczewski }
      - task: fleet:shared-services
      - task: fleet:talk-setup:brand
        vars: { BRAND: fleet-mentolder }
      - task: fleet:talk-setup:brand
        vars: { BRAND: fleet-korczewski }
```

- [ ] **Step 4: Run the BATS guard from Task 1 — now green**

Run: `bats tests/unit/fleet-phase2b.bats`
Expected: all 5 tests PASS.

- [ ] **Step 5: Prove fan-out order with a dry run**

Run: `task --dry fleet:deploy 2>&1 | grep -nE 'fleet:(platform|deploy:brand|shared-services|talk-setup)'`
Expected ordering: platform → deploy:brand (mentolder) → deploy:brand (korczewski) → shared-services → talk-setup (mentolder) → talk-setup (korczewski).

- [ ] **Step 6: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(fleet): rewire fleet:deploy to full per-brand+shared ordering [T000345]"
```

---

## Task 7: Offline test suite + manifest validation gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline suite**

Run: `task test:all`
Expected: green, including the new `fleet-phase2b.bats`.

- [ ] **Step 2: Validate manifests**

Run: `task workspace:validate`
Expected: green (office-stack + coturn-stack + prod-fleet overlays build).

- [ ] **Step 3: Regenerate test inventory if test count changed**

Run:
```bash
task test:inventory && git diff --exit-code website/src/data/test-inventory.json || {
  git add website/src/data/test-inventory.json
  git commit -m "chore(tests): regen inventory for fleet-phase2b [T000345]"
}
```
Expected: inventory matches committed state (CI gate).

---

## Task 8: Live fleet deploy + per-brand verification (execution-time, against `fleet` context)

**Files:** none (live operation — runs during dev-flow-execute, NOT in CI)

> This is the cluster-mutating step. It runs only after Tasks 1–7 merge. Operator/ops-agent executes against the live `fleet` context. Capture output as evidence.

- [ ] **Step 1: Full deploy**

Run: `task fleet:deploy`
Expected: completes without the talk-setup abort; both brands' core pods + shared collabora/coturn/janus reach Ready.

- [ ] **Step 2: Verify per-brand workspace pods**

Run:
```bash
kubectl --context fleet get pods -n workspace --field-selector=status.phase!=Running
kubectl --context fleet get pods -n workspace-korczewski --field-selector=status.phase!=Running
```
Expected: no rows (everything Running) — or only known-acceptable jobs Completed.

- [ ] **Step 3: Verify shared office + coturn**

Run:
```bash
kubectl --context fleet get pods -n workspace-office
kubectl --context fleet get pods -n coturn -o wide
```
Expected: `collabora` Running; `coturn` + `janus` Running and pinned to the fleet TURN node (`pk-hetzner-4`).

- [ ] **Step 4: Verify both Collabora hostnames answer**

Run:
```bash
for h in collabora.mentolder.de collabora.korczewski.de; do
  echo -n "$h -> "; curl -sS -o /dev/null -w '%{http_code}\n' "https://$h/hosting/discovery" || true
done
```
Expected: HTTP 200 from the shared Collabora for both hosts. *(Hostnames resolve to fleet only after DNS cutover — until then, test with `--resolve $h:443:<fleet-node-ip>`.)*

- [ ] **Step 5: Verify talk-hpb authenticated against shared Janus (both brands)**

Run:
```bash
kubectl --context fleet -n workspace        logs deploy/talk-hpb --tail=30 | grep -iE 'janus|connected|signaling' | tail
kubectl --context fleet -n workspace-korczewski logs deploy/talk-hpb --tail=30 | grep -iE 'janus|connected|signaling' | tail
```
Expected: both show successful signaling/Janus connection, no auth/secret-mismatch errors.

- [ ] **Step 6: Record evidence on the ticket**

Append the pod-status + curl output to ticket T000345 and mark the live-verification checklist complete.

---

## Self-Review

- **Spec coverage** — the four Phase 2b blockers from the Fleet Stage 2 memory: (1) office/coturn not deployed → Tasks 2,3,6; (2) janus/spreed gekko-pin → Task 5 (talk-hpb repoint; TURN_NODE already correct, documented in Key Facts); (3) post-setup abort on missing office-stack → resolved by ordering (Task 6 splits talk-setup after shared coturn) + Task 4 shared secret; (4) korczewski not deployed → Task 6 ordering brings it up + Task 8 verifies its ns. ✓
- **Placeholder scan** — `T000345` is intentional (dev-flow-plan replaces it with the real ticket id). No "TODO/TBD/handle edge cases" left; every code step shows concrete YAML/bash. The two NOTE blocks (TURN_PUBLIC_IP resolution, talk-hpb base affinity path) flag execution-time confirmations, not deferred design. ✓
- **Type/name consistency** — task names used consistently: `fleet:platform`, `fleet:deploy:brand`, `fleet:shared-services`, `fleet:talk-setup:brand`, `fleet:deploy`. Env var names match the env files (`TURN_NODE`, `TURN_PUBLIC_IP`/`LIVEKIT_PIN_IP`, `PROD_DOMAIN`, `WORKSPACE_NAMESPACE`). New envsubst vars `COLLABORA_HOST_2`/`COLLABORA_ALIASGROUP2` introduced in Task 2 and consumed in Task 3. ✓
- **Sensitive-path safety** — Task 4 gates `environments/.secrets/*` behind operator action; sealed-only commits; leak check. ✓
