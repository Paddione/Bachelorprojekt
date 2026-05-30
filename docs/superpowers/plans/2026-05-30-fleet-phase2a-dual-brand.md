---
title: fleet Phase 2a — Dual-Brand on the 3 pk Nodes — Implementation Plan
ticket_id: T000337
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# fleet Phase 2a — Dual-Brand on the 3 pk Nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the empty `fleet` cluster (3-CP HA on pk-hetzner-4/6/8) host BOTH brands — mentolder (ns `workspace`) and korczewski (ns `workspace-korczewski`) — as self-contained per-brand stacks, with data restored from Filen and brand isolation proven by a NetworkPolicy test, on `*.korczewski.de` test hostnames.

**Architecture:** Approach 1. A one-time `prod-fleet/platform/` overlay owns the cluster-scoped singletons. The existing `prod-mentolder/` + `prod-korczewski/` overlays are reused, each wrapped by a thin `prod-fleet/<brand>/` kustomization that pulls in a shared `fleet-common` component (deletes singletons + repoints node-affinity to pk nodes). Two new `environments/fleet-<brand>.yaml` files carry per-brand env_vars (context=fleet, test domains). A new `task fleet:deploy` fans out: platform once → mentolder → korczewski. envsubst forces two separate render passes, so each brand is its own deploy.

**Tech Stack:** Kustomize (overlays + components), kubectl (server-side apply), envsubst, k3s v1.36.1, cert-manager (DNS-01/ipv64), SealedSecrets, Longhorn, BATS, Bash.

**Spec:** `docs/superpowers/specs/2026-05-30-fleet-phase2a-dual-brand-design.md`
**Ticket:** T000337 · **Branch:** `feature/fleet-phase2-cutover`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `prod-fleet/platform/kustomization.yaml` | Cluster singletons applied once: ClusterIssuer, IngressClass, tls-sync ClusterRole/Binding |
| Create | `prod-fleet/platform/cluster-issuer.yaml` | Copy of `prod/cluster-issuer.yaml` (letsencrypt-prod, ipv64 DNS-01) |
| Create | `prod-fleet/platform/ingressclass.yaml` | Copy of `prod/ingressclass.yaml` (traefik) |
| Create | `prod-fleet/components/fleet-common/kustomization.yaml` | Component: `$patch: delete` singletons + repoint node-affinity to pk-4/6/8 |
| Create | `prod-fleet/mentolder/kustomization.yaml` | Wraps `../../prod-mentolder` + `fleet-common` component, ns workspace |
| Create | `prod-fleet/korczewski/kustomization.yaml` | Wraps `../../prod-korczewski` + `fleet-common` component, ns workspace-korczewski |
| Create | `environments/fleet-mentolder.yaml` | mentolder brand env_vars, context=fleet, domain fleet-m.korczewski.de |
| Create | `environments/fleet-korczewski.yaml` | korczewski brand env_vars, context=fleet, domain fleet.korczewski.de |
| Modify | `scripts/backup-restore.sh` | Honor `--namespace` everywhere (close ns-hardcode gap) |
| Create | `tests/unit/backup-restore-namespace.bats` | BATS: every kubectl/secret ref respects `--namespace` |
| Modify | `Taskfile.yml` | Add `fleet:deploy`, `fleet:platform`, `fleet:deploy:brand` tasks |
| Create | `tests/local/SA-08.sh` | Cross-brand NetworkPolicy isolation test (negative) |
| Modify | `tests/local/SA-08.sh` registration | Register SA-08 in the runner/inventory |

---

## Task 1: Platform overlay — cluster singletons applied once

**Files:**
- Create: `prod-fleet/platform/kustomization.yaml`
- Create: `prod-fleet/platform/cluster-issuer.yaml`
- Create: `prod-fleet/platform/ingressclass.yaml`

- [ ] **Step 1: Copy the two pure cluster-scoped manifests**

```bash
cd /tmp/wt-fleet-phase2
mkdir -p prod-fleet/platform
cp prod/cluster-issuer.yaml prod-fleet/platform/cluster-issuer.yaml
cp prod/ingressclass.yaml   prod-fleet/platform/ingressclass.yaml
```

- [ ] **Step 2: Write the platform kustomization**

`prod-fleet/platform/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# fleet platform layer — cluster-scoped singletons applied ONCE to the fleet
# cluster. Per-brand overlays delete their own copies via the fleet-common
# component so only this layer owns them (avoids the SharedResourceWarning that
# reverted the 2026-05 merge). The tls-sync ClusterRole/Binding is pulled from
# prod/reflector.yaml; sealed-secrets controller + cert-manager + Longhorn are
# installed via tasks, not here.
resources:
  - cluster-issuer.yaml
  - ingressclass.yaml
  - ../../prod/reflector.yaml
```

- [ ] **Step 3: Validate the build**

Run:
```bash
cd /tmp/wt-fleet-phase2
kustomize build prod-fleet/platform/ | grep -E "^kind:|^  name:"
```
Expected: exactly `ClusterIssuer letsencrypt-prod`, `IngressClass traefik`, `ClusterRole tls-sync`, `ClusterRoleBinding tls-sync`, plus the reflector Deployment/SA in the `kube-system`/reflector ns. No error.

- [ ] **Step 4: Commit**

```bash
git add prod-fleet/platform/
git commit -m "feat(fleet): add prod-fleet/platform cluster-singleton overlay [T000337]"
```

---

## Task 2: fleet-common component — delete singletons + pin to pk nodes

The component does two jobs every brand needs on fleet: (a) `$patch: delete` the cluster-scoped objects the platform layer now owns, and (b) repoint node-affinity to `pk-hetzner-4/6/8` (the korczewski overlay already pins here, so this is idempotent for korczewski and required for mentolder).

**Files:**
- Create: `prod-fleet/components/fleet-common/kustomization.yaml`

- [ ] **Step 1: Write the component**

`prod-fleet/components/fleet-common/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component

# Shared fleet behavior for BOTH brand overlays:
#  1. Delete cluster-scoped singletons now owned by prod-fleet/platform.
#  2. Repoint node-affinity of base-pinned workloads to the fleet pk nodes.
# Namespaced ClusterRoles (${WEBSITE_NAMESPACE}-monitoring-reader) differ per
# brand and are NOT deleted. Namespace objects are handled by each brand's
# `namespace:` directive.

patches:
  # ── (1) delete singletons owned by the platform layer ──────────────
  - target: { group: cert-manager.io, version: v1, kind: ClusterIssuer, name: letsencrypt-prod }
    patch: |-
      $patch: delete
      apiVersion: cert-manager.io/v1
      kind: ClusterIssuer
      metadata:
        name: letsencrypt-prod
  - target: { group: networking.k8s.io, version: v1, kind: IngressClass, name: traefik }
    patch: |-
      $patch: delete
      apiVersion: networking.k8s.io/v1
      kind: IngressClass
      metadata:
        name: traefik
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRole, name: tls-sync }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRole
      metadata: { name: tls-sync }
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRoleBinding, name: tls-sync }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRoleBinding
      metadata: { name: tls-sync }
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRole, name: claude-code-agent }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRole
      metadata: { name: claude-code-agent }
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRoleBinding, name: claude-code-agent }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRoleBinding
      metadata: { name: claude-code-agent }
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRole, name: website-monitoring-clusterrole }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRole
      metadata: { name: website-monitoring-clusterrole }
  - target: { group: rbac.authorization.k8s.io, kind: ClusterRoleBinding, name: website-monitoring-clusterrolebinding }
    patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRoleBinding
      metadata: { name: website-monitoring-clusterrolebinding }

  # ── (2) repoint node-affinity to the fleet pk nodes ────────────────
  # website Deployment — base pins gekko-hetzner-2/3 (mentolder home nodes).
  - target: { kind: Deployment, name: website }
    patch: |-
      - op: replace
        path: /spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0/values
        value: [pk-hetzner-4, pk-hetzner-6, pk-hetzner-8]
```

> NOTE: This is the KNOWN-static collision/pin set. Task 8 runs a server-side
> dry-run that empirically surfaces any remaining cluster-scoped collisions or
> `Pending` pods; add precise delete/repoint patches here for whatever it finds.
> Do not guess beyond this list now — let the dry-run drive additions.

- [ ] **Step 2: Verify component syntax via a throwaway wrapper build (deferred)**

The component is exercised by Task 3's brand kustomizations. No standalone build (components aren't buildable alone). Proceed.

- [ ] **Step 3: Commit**

```bash
git add prod-fleet/components/fleet-common/
git commit -m "feat(fleet): add fleet-common component (delete singletons + pin pk nodes) [T000337]"
```

---

## Task 3: Per-brand fleet wrapper kustomizations

**Files:**
- Create: `prod-fleet/mentolder/kustomization.yaml`
- Create: `prod-fleet/korczewski/kustomization.yaml`

- [ ] **Step 1: mentolder wrapper**

`prod-fleet/mentolder/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# mentolder brand on fleet — reuse the existing prod-mentolder overlay, then
# apply fleet-common (delete singletons + pin pk nodes). Namespace stays
# workspace (set by prod-mentolder/k3d base).
resources:
  - ../../prod-mentolder
components:
  - ../components/fleet-common
```

- [ ] **Step 2: korczewski wrapper**

`prod-fleet/korczewski/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# korczewski brand on fleet — reuse the existing prod-korczewski overlay (already
# pins pk nodes), then apply fleet-common to delete the singletons the platform
# layer owns. Namespace stays workspace-korczewski.
resources:
  - ../../prod-korczewski
components:
  - ../components/fleet-common
```

- [ ] **Step 3: Validate both builds (no cluster-scoped singletons remain)**

Run:
```bash
cd /tmp/wt-fleet-phase2
for b in mentolder korczewski; do
  echo "== $b =="
  kustomize build --load-restrictor=LoadRestrictionsNone prod-fleet/$b/ \
    | grep -E "^kind: (ClusterIssuer|IngressClass)$|name: (letsencrypt-prod|traefik|tls-sync|claude-code-agent|website-monitoring-clusterrole)$" \
    || echo "  ✓ no platform singletons present"
done
```
Expected: `✓ no platform singletons present` for both brands.

- [ ] **Step 4: Commit**

```bash
git add prod-fleet/mentolder/ prod-fleet/korczewski/
git commit -m "feat(fleet): add per-brand fleet wrapper kustomizations [T000337]"
```

---

## Task 4: New per-brand env files (`fleet-mentolder`, `fleet-korczewski`)

Copy the live brand env files, then override context + domains + node-affinity for fleet 2a test hosts. Keep all other vars identical so `env:validate` passes against `environments/schema.yaml`.

**Files:**
- Create: `environments/fleet-mentolder.yaml`
- Create: `environments/fleet-korczewski.yaml`

- [ ] **Step 1: Generate fleet-korczewski.yaml from the live file**

```bash
cd /tmp/wt-fleet-phase2
cp environments/korczewski.yaml environments/fleet-korczewski.yaml
```
Then edit `environments/fleet-korczewski.yaml`, changing ONLY:
- `environment: fleet-korczewski`
- `context: fleet`
- `domain: fleet.korczewski.de`
- `env_vars.PROD_DOMAIN: fleet.korczewski.de`
- `env_vars.CLUSTER_ENV: fleet-korczewski`
- every `*.korczewski.de` host var (WEBSITE_HOST, AUTH_EXTERNAL_URL, DOCS_URL, VAULT_EXTERNAL_URL, NEXTCLOUD_EXTERNAL_URL, BRETT_DOMAIN, LIVEKIT_DOMAIN, STREAM_DOMAIN, MAIL_EXTERNAL_URL, TRAEFIK_EXTERNAL_URL, KEYCLOAK_FRONTEND_URL, WEBSITE_SITE_URL, ARENA_WS_URL) → prefix host with `fleet.` (e.g. `web.fleet.korczewski.de`, `auth.fleet.korczewski.de`)
- leave `WEBSITE_NODE_AFFINITY`, `WORKSPACE_NAMESPACE: workspace-korczewski`, `WEBSITE_NAMESPACE: website-korczewski` unchanged (already pk + correct ns)
- remove/blank the `DEV_*` block (dev migration is 2c)

- [ ] **Step 2: Generate fleet-mentolder.yaml from the live file**

```bash
cp environments/mentolder.yaml environments/fleet-mentolder.yaml
```
Then edit, changing ONLY:
- `environment: fleet-mentolder`, `context: fleet`, `domain: fleet-m.korczewski.de`
- `env_vars.PROD_DOMAIN: fleet-m.korczewski.de`, `CLUSTER_ENV: fleet-mentolder`
- every host var → prefix host with `fleet-` and re-root onto `korczewski.de`
  (e.g. `web.fleet-m.korczewski.de`, `auth.fleet-m.korczewski.de`)
- `WEBSITE_NODE_AFFINITY: '["pk-hetzner-4","pk-hetzner-6","pk-hetzner-8"]'`
- keep `WORKSPACE_NAMESPACE: workspace`, `WEBSITE_NAMESPACE: website`
- remove/blank the `DEV_*` block

- [ ] **Step 3: Validate both env files against the schema**

Run:
```bash
cd /tmp/wt-fleet-phase2
for e in fleet-mentolder fleet-korczewski; do
  echo "== $e =="; bash -c "source scripts/env-resolve.sh $e && echo OK: ctx=\$ENV_CONTEXT dom=\$PROD_DOMAIN ns=\$WORKSPACE_NAMESPACE"
done
```
Expected: `OK: ctx=fleet dom=fleet.korczewski.de ns=workspace-korczewski` and `OK: ctx=fleet dom=fleet-m.korczewski.de ns=workspace`. No schema error.

- [ ] **Step 4: Run env:validate if present**

Run: `task env:validate ENV=fleet-korczewski 2>&1 | tail -5 || true`
Expected: passes, or task absent (then skip). Fix any missing-var complaints.

- [ ] **Step 5: Commit**

```bash
git add environments/fleet-mentolder.yaml environments/fleet-korczewski.yaml
git commit -m "feat(fleet): add fleet-mentolder + fleet-korczewski env files [T000337]"
```

---

## Task 5: Fix the backup-restore.sh namespace hardcode (TDD)

`scripts/backup-restore.sh` defaults `NS=workspace` and accepts `--namespace`, but several spots hardcode `-n workspace` and the `workspace-secrets` Secret name. korczewski restore into `workspace-korczewski` needs every reference parameterized.

**Files:**
- Test: `tests/unit/backup-restore-namespace.bats`
- Modify: `scripts/backup-restore.sh`

- [ ] **Step 1: Write the failing test**

`tests/unit/backup-restore-namespace.bats`:

```bash
#!/usr/bin/env bats
# Verify backup-restore.sh fully honors --namespace (no workspace hardcodes leak
# into rendered kubectl args / secret refs when a non-default ns is passed).

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/backup-restore.sh"
}

@test "no hardcoded '-n workspace' remains outside the NS default assignment" {
  # Allow the single default assignment 'NS=workspace'; forbid literal '-n workspace'
  run grep -nE -- '-n workspace([^-]|$)' "$SCRIPT"
  [ "$status" -ne 0 ]
}

@test "secret references use the NS variable, not literal workspace-secrets in a fixed ns" {
  # workspace-secrets is a Secret NAME (fine); ensure its lookups pass -n "$NS"
  # Fail if a 'kubectl ... secret workspace-secrets' line lacks -n "$NS".
  run bash -c "grep -nE 'workspace-secrets' '$SCRIPT' | grep -vE 'NS|name: workspace-secrets|secretKeyRef|valueFrom' || true"
  [ -z "$output" ]
}
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `bats tests/unit/backup-restore-namespace.bats`
Expected: FAIL (literal `-n workspace` occurrences exist today).

- [ ] **Step 3: Parameterize every hardcoded namespace**

In `scripts/backup-restore.sh`, replace every literal `-n workspace` (kubectl scale/exec/get/apply/delete invocations) with `-n "$NS"`. Keep the single default `NS=workspace` assignment and the `name: workspace-secrets` references inside YAML heredocs (those are Secret NAMES, correct in any ns since the Secret is materialized per-namespace). For the example-usage comment block at the top, update `-n workspace` → `-n "$NS"` for accuracy.

Verify the scan is clean:
```bash
grep -nE -- '-n workspace([^-]|$)' scripts/backup-restore.sh
```
Expected: no output.

- [ ] **Step 4: Run the test — expect PASS**

Run: `bats tests/unit/backup-restore-namespace.bats`
Expected: 2 passing.

- [ ] **Step 5: Run the full offline suite to catch regressions**

Run: `task test:all 2>&1 | tail -15`
Expected: green (BATS + kustomize structure + Taskfile dry-run).

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-namespace.bats
git commit -m "fix(backup): honor --namespace throughout backup-restore.sh [T000337]"
```

---

## Task 6: `task fleet:deploy` orchestration

Adds tasks that (a) apply the platform layer once and (b) deploy each brand by sourcing its `fleet-<brand>.yaml`, building `prod-fleet/<brand>`, envsubst-ing, and applying to `--context fleet`. Mirror the existing prod deploy's ENVSUBST_VARS list (Taskfile.yml ~line 1552).

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add the three tasks**

In `Taskfile.yml` under the `workspace:`/`feature:` task area, add:

```yaml
  fleet:platform:
    desc: "Apply the fleet cluster-singleton platform layer (once)."
    cmds:
      - |
        set -euo pipefail
        kubectl config use-context fleet
        kustomize build prod-fleet/platform/ --load-restrictor=LoadRestrictionsNone \
          | kubectl --context fleet apply --server-side --force-conflicts -f -

  fleet:deploy:brand:
    desc: "Deploy ONE brand to fleet. Usage: task fleet:deploy:brand BRAND=fleet-korczewski"
    requires:
      vars: [BRAND]
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.BRAND}}"
        [[ "$ENV_CONTEXT" == "fleet" ]] || { echo "ENV_CONTEXT must be fleet (got $ENV_CONTEXT)"; exit 1; }
        # Reuse the SAME ENVSUBST_VARS list as the prod deploy (keep in sync).
        ENVSUBST_VARS="\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$INFRA_NAMESPACE \$TLS_SECRET_NAME"
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN"
        ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE \$BRAND_ID"
        ENVSUBST_VARS="$ENVSUBST_VARS \$KC_USER1_USERNAME \$KC_USER1_EMAIL \$KC_USER2_USERNAME \$KC_USER2_EMAIL"
        ENVSUBST_VARS="$ENVSUBST_VARS \$BRETT_DOMAIN \$LIVEKIT_DOMAIN \$STREAM_DOMAIN"
        ENVSUBST_VARS="$ENVSUBST_VARS \$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE \$SYSTEMTEST_LOOP_ENABLED"
        ENVSUBST_VARS="$ENVSUBST_VARS \$LLM_HOST_IP \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$LLM_EMBED_URL"
        ENVSUBST_VARS="$ENVSUBST_VARS \$COMFY_HOST_IP \$COMFY_PORT \$ARENA_WS_URL \$ARENA_IMAGE"
        overlay="prod-fleet/$(echo "{{.BRAND}}" | sed 's/^fleet-//')"
        echo "Deploying {{.BRAND}} via $overlay -> ns $WORKSPACE_NAMESPACE on context fleet"
        kustomize build "$overlay/" --load-restrictor=LoadRestrictionsNone \
          | envsubst "$ENVSUBST_VARS" \
          | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
          | kubectl --context fleet apply --server-side --force-conflicts -f -

  fleet:deploy:
    desc: "Full Phase 2a deploy: platform once, then both brands."
    cmds:
      - task: fleet:platform
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-mentolder }
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-korczewski }
```

- [ ] **Step 2: Dry-run the Taskfile parse**

Run: `task --list 2>&1 | grep fleet`
Expected: `fleet:platform`, `fleet:deploy:brand`, `fleet:deploy` listed. No YAML parse error.

- [ ] **Step 3: Confirm offline suite still green (Taskfile dry-run job)**

Run: `task test:all 2>&1 | tail -8`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(fleet): add fleet:deploy orchestration (platform + both brands) [T000337]"
```

---

## Task 7: Re-seal both brands' secrets against the fleet keypair

Phase 1 rotated the sealing keypair; old sealed files won't decrypt on fleet. Re-seal each brand's plaintext secrets against fleet's cert. (The plaintext `environments/.secrets/*.yaml` are gitignored and off-limits to read/echo — operate via the seal task only.)

**Files:**
- Create (committed): `environments/sealed-secrets/fleet-mentolder.yaml`
- Create (committed): `environments/sealed-secrets/fleet-korczewski.yaml`

- [ ] **Step 1: Fetch the fleet sealing cert**

Run: `task env:fetch-cert ENV=fleet`
Expected: writes `environments/certs/fleet.pem`. (Requires the fleet sealed-secrets controller — installed in Task 8 Step 1; if not yet installed, run this after that step and return here.)

- [ ] **Step 2: Seal each brand's secrets against the fleet cert**

The seal task reads `environments/.secrets/<env>.yaml`. Ensure `environments/.secrets/fleet-mentolder.yaml` and `fleet-korczewski.yaml` exist (copy from the live brand secrets — done by the operator, not committed). Then:

```bash
task env:seal ENV=fleet-mentolder
task env:seal ENV=fleet-korczewski
```
Expected: writes `environments/sealed-secrets/fleet-mentolder.yaml` + `fleet-korczewski.yaml`.

- [ ] **Step 3: Commit the sealed (encrypted) outputs only**

```bash
git add environments/sealed-secrets/fleet-mentolder.yaml environments/sealed-secrets/fleet-korczewski.yaml
git commit -m "feat(fleet): seal both brands' secrets against fleet keypair [T000337]"
```

> If `env:seal` keys off `WORKSPACE_NAMESPACE`, confirm each sealed Secret targets
> the right ns (workspace vs workspace-korczewski). A SealedSecret is namespace-scoped.

---

## Task 8: Platform bring-up + deploy both brands to fleet (runtime)

Runtime task against the live fleet cluster. Follows the mandated fresh-cluster ordering (CLAUDE.md). **Backup-verify gate first** (do not proceed until both brands' Filen snapshots are confirmed restorable — Task 9 consumes them).

- [ ] **Step 1: Install the platform stack in mandated order**

```bash
task sealed-secrets:install ENV=fleet
task env:fetch-cert ENV=fleet          # (Task 7 Step 1 if not done)
task cert:install ENV=fleet
task cert:secret -- "$IPV64_KEY" ENV=fleet   # ACME DNS-01 key, both cert-manager + ns
# Longhorn + iscsid on all 3 pk nodes:
task longhorn:install ENV=fleet   # or the documented Helm/iscsid path from cluster-deployment skill
```
Expected: sealed-secrets controller Running; cert-manager CRDs present; Longhorn `default` StorageClass present; `iscsid` active on pk-4/6/8. Verify:
```bash
kubectl --context fleet get pods -n sealed-secrets -n cert-manager -n longhorn-system 2>/dev/null
kubectl --context fleet get sc
```

- [ ] **Step 2: Apply the SealedSecrets for both brands**

```bash
kubectl --context fleet apply -f environments/sealed-secrets/fleet-mentolder.yaml
kubectl --context fleet apply -f environments/sealed-secrets/fleet-korczewski.yaml
```
Expected: SealedSecrets accepted; controller materializes `workspace-secrets` in `workspace` and `workspace-korczewski`. Verify both unsealed:
```bash
kubectl --context fleet get secret workspace-secrets -n workspace
kubectl --context fleet get secret workspace-secrets -n workspace-korczewski
```

- [ ] **Step 3: Server-side dry-run BOTH brands — surface remaining collisions**

```bash
cd /tmp/wt-fleet-phase2
task fleet:platform
for b in fleet-mentolder fleet-korczewski; do
  source scripts/env-resolve.sh "$b"
  overlay="prod-fleet/$(echo "$b" | sed 's/^fleet-//')"
  kustomize build "$overlay/" --load-restrictor=LoadRestrictionsNone \
    | envsubst | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
    | kubectl --context fleet apply --server-side --force-conflicts --dry-run=server -f - 2>&1 | tee /tmp/fleet-dryrun-$b.log
done
grep -iE "conflict|already exists|SharedResource|is forbidden" /tmp/fleet-dryrun-*.log || echo "✓ no collisions"
```
Expected: `✓ no collisions`. **If collisions appear**, add the precise `$patch: delete` (cluster-scoped) entry to `prod-fleet/components/fleet-common/kustomization.yaml`, recommit Task 2, and re-run this step until clean.

- [ ] **Step 4: Real deploy of both brands**

Run: `task fleet:deploy`
Expected: platform applied; mentolder + korczewski stacks created. Then watch rollout:
```bash
kubectl --context fleet get pods -n workspace -w
kubectl --context fleet get pods -n workspace-korczewski
```

- [ ] **Step 5: Resolve any `Pending` pods (node-affinity gaps)**

```bash
kubectl --context fleet get pods -A --field-selector=status.phase=Pending
kubectl --context fleet describe pod <pending-pod> -n <ns> | grep -A5 "Events:"
```
If a pod is Pending on an unsatisfiable nodeAffinity (a base gekko/pk-2/pk-3 pin not covered by the fleet-common website patch), add the matching repoint patch to `fleet-common` (Task 2 part 2), recommit, re-run `task fleet:deploy`. Repeat until zero Pending.

- [ ] **Step 6: Capacity sanity-check**

```bash
kubectl --context fleet top nodes
```
Expected: no node > ~85% CPU/mem with both stacks up. If pressured, note which non-essential workloads to scale down (record in the ticket; do not block).

- [ ] **Step 7: Commit any fleet-common additions from Steps 3/5**

```bash
git add prod-fleet/components/fleet-common/kustomization.yaml
git commit -m "fix(fleet): add empirically-found collision/affinity patches [T000337]" || echo "no changes"
```

---

## Task 9: Restore both brands' data from Filen + verify

**PRE-GATE:** confirmed restorable Filen snapshot timestamps for both brands (the asset). Record them in the ticket before starting.

- [ ] **Step 1: Pull both brands' backup bundles**

```bash
# mentolder bundle into workspace backup-pvc
bash scripts/backup-restore.sh filen-pull "<MENTOLDER_TS>" --namespace workspace --context fleet
# korczewski bundle into workspace-korczewski backup-pvc
bash scripts/backup-restore.sh filen-pull "<KORCZEWSKI_TS>" --namespace workspace-korczewski --context fleet
```
Expected: each `filen-pull` job completes; bundle present in the respective `backup-pvc`.

- [ ] **Step 2: Restore mentolder (DB + 4 PVCs)**

Per the backup-restore.sh restore subcommands: scale apps to 0, restore each DB + PVC, scale up. Use `--namespace workspace --context fleet`. Restore set: DB dumps + `nextcloud-data`, `vaultwarden-data`, `docuseal-data`, `livekit-recordings`.
Expected: restore jobs complete without error.

- [ ] **Step 3: Restore korczewski (DB + 4 PVCs)**

Same with `--namespace workspace-korczewski --context fleet`. This is the path the Task 5 fix unblocks — watch that every kubectl call lands in `workspace-korczewski`, not `workspace`.

- [ ] **Step 4: Verify both brands' data**

```bash
# DB rows (mentolder website DB)
PGM=$(kubectl --context fleet get pod -n workspace -l app=shared-db -o name | head -1)
kubectl --context fleet exec "$PGM" -n workspace -- psql -U website -d website -At -c \
  "SELECT count(*) FROM site_settings;"
# DB rows (korczewski)
PGK=$(kubectl --context fleet get pod -n workspace-korczewski -l app=shared-db -o name | head -1)
kubectl --context fleet exec "$PGK" -n workspace-korczewski -- psql -U website -d website -At -c \
  "SELECT count(*) FROM site_settings;"
# Nextcloud files present (both ns)
kubectl --context fleet exec deploy/nextcloud -n workspace -- ls -la /var/www/html/data | head
kubectl --context fleet exec deploy/nextcloud -n workspace-korczewski -- ls -la /var/www/html/data | head
```
Expected: non-zero row counts; Nextcloud data dirs show restored user files. Record counts in the ticket.

- [ ] **Step 5: No commit (runtime-only).** Record results in T000337.

---

## Task 10: pvc-backup green on fleet (both brands)

- [ ] **Step 1: Confirm the pvc-backup CronJob exists per brand**

```bash
kubectl --context fleet get cronjob -n workspace | grep pvc-backup
kubectl --context fleet get cronjob -n workspace-korczewski | grep pvc-backup
```
Expected: present in both (came in via the brand overlays' `patch-backup-config`).

- [ ] **Step 2: Trigger a manual backup per brand and watch Filen upload**

```bash
kubectl --context fleet create job --from=cronjob/pvc-backup pvc-backup-manual-m -n workspace
kubectl --context fleet create job --from=cronjob/pvc-backup pvc-backup-manual-k -n workspace-korczewski
kubectl --context fleet logs -f job/pvc-backup-manual-m -n workspace | tail -20
kubectl --context fleet logs -f job/pvc-backup-manual-k -n workspace-korczewski | tail -20
```
Expected: each job ends `✓ Filen upload` success (the backup-cronjob fails loud on upload error per PR #1182). Record in ticket.

- [ ] **Step 3: No commit (runtime-only).**

---

## Task 11: Cross-brand isolation NetworkPolicy test (SA-08)

**Files:**
- Create: `tests/local/SA-08.sh`
- Modify: test inventory (regenerate)

- [ ] **Step 1: Write the failing test**

`tests/local/SA-08.sh` (follow the existing `tests/local/SA-07.sh` harness conventions):

```bash
#!/usr/bin/env bash
# SA-08 — Cross-brand isolation: a pod in workspace-korczewski must NOT reach a
# mentolder (workspace) Service, and vice-versa. Proves DSGVO logical isolation.
set -uo pipefail
CTX="${FLEET_CONTEXT:-fleet}"
fail=0

probe() {  # probe <from-ns> <to-service-fqdn> <expect: blocked|open>
  local from_ns="$1" target="$2" expect="$3"
  kubectl --context "$CTX" run netcheck-$$ -n "$from_ns" --rm -i --restart=Never \
    --image=busybox:1.36 --quiet -- \
    sh -c "nc -z -w4 $target 2>/dev/null && echo OPEN || echo BLOCKED" \
    2>/dev/null | grep -qE 'OPEN|BLOCKED' || { echo "probe error"; return 2; }
}

# korczewski pod -> mentolder shared-db (5432) must be BLOCKED
res=$(kubectl --context "$CTX" run netcheck-k2m-$$ -n workspace-korczewski --rm -i --restart=Never \
  --image=busybox:1.36 --quiet -- \
  sh -c "nc -z -w4 shared-db.workspace.svc.cluster.local 5432 && echo OPEN || echo BLOCKED" 2>/dev/null)
echo "korczewski->mentolder shared-db: $res"
[[ "$res" == *BLOCKED* ]] || { echo "FAIL: cross-brand reach not blocked (k->m)"; fail=1; }

# mentolder pod -> korczewski shared-db must be BLOCKED
res=$(kubectl --context "$CTX" run netcheck-m2k-$$ -n workspace --rm -i --restart=Never \
  --image=busybox:1.36 --quiet -- \
  sh -c "nc -z -w4 shared-db.workspace-korczewski.svc.cluster.local 5432 && echo OPEN || echo BLOCKED" 2>/dev/null)
echo "mentolder->korczewski shared-db: $res"
[[ "$res" == *BLOCKED* ]] || { echo "FAIL: cross-brand reach not blocked (m->k)"; fail=1; }

[[ "$fail" -eq 0 ]] && echo "SA-08 PASS" || { echo "SA-08 FAIL"; exit 1; }
```

- [ ] **Step 2: Run it — expect FAIL (no cross-brand NetworkPolicy yet)**

Run: `FLEET_CONTEXT=fleet bash tests/local/SA-08.sh`
Expected: FAIL — cross-namespace reach is OPEN (default-allow), proving the gap.

- [ ] **Step 3: Add a default-deny-cross-brand NetworkPolicy to each brand overlay's fleet wrapper**

Create `prod-fleet/components/fleet-common/netpol-deny-cross-brand.yaml` and reference it from the component `resources:`. The policy: in each workspace ns, default-deny ingress from OTHER namespaces, allow same-ns + required system ns (kube-system DNS, ingress). Model it on the existing `prod-korczewski/netpol-cross-namespace.yaml`. Because the component is namespaced via each brand's directive, one policy definition lands correctly in both namespaces.

- [ ] **Step 4: Redeploy and re-run — expect PASS**

```bash
cd /tmp/wt-fleet-phase2 && task fleet:deploy
FLEET_CONTEXT=fleet bash tests/local/SA-08.sh
```
Expected: `SA-08 PASS` (both directions BLOCKED).

- [ ] **Step 5: Regenerate the test inventory**

Run:
```bash
task test:inventory
git diff --exit-code website/src/data/test-inventory.json || echo "inventory changed — staging"
```

- [ ] **Step 6: Commit**

```bash
git add tests/local/SA-08.sh prod-fleet/components/fleet-common/netpol-deny-cross-brand.yaml \
        prod-fleet/components/fleet-common/kustomization.yaml website/src/data/test-inventory.json
git commit -m "test(fleet): add SA-08 cross-brand isolation + deny-cross-brand netpol [T000337]"
```

---

## Task 12: DoD verification sweep

- [ ] **Step 1: Nodes + pods healthy**

```bash
kubectl --context fleet get nodes
kubectl --context fleet get pods -n workspace        | grep -v Running | grep -v Completed || echo "✓ mentolder all Running"
kubectl --context fleet get pods -n workspace-korczewski | grep -v Running | grep -v Completed || echo "✓ korczewski all Running"
```
Expected: 3 CP Ready; both namespaces all Running/Completed.

- [ ] **Step 2: Both brands load over real TLS**

```bash
for h in web.fleet.korczewski.de web.fleet-m.korczewski.de; do
  echo -n "$h -> "; curl -sS -o /dev/null -w '%{http_code} (cert: %{ssl_verify_result})\n' "https://$h/"
done
```
Expected: both `200` with `ssl_verify_result: 0` (valid LE cert). DNS records for the two test hosts must point at a fleet pk node IP first.

- [ ] **Step 3: Keycloak SSO both brands**

Browser (or document manual check): log into `https://web.fleet.korczewski.de` and `https://web.fleet-m.korczewski.de` admin via Keycloak; confirm redirect + token. Record outcome in ticket.

- [ ] **Step 4: Re-confirm restore + backup + isolation gates**

```bash
FLEET_CONTEXT=fleet bash tests/local/SA-08.sh        # PASS
# DB row counts (Task 9 Step 4) still non-zero
# pvc-backup manual jobs (Task 10) succeeded
```
Expected: SA-08 PASS; data present; backups green.

- [ ] **Step 5: Idempotency check**

Run: `cd /tmp/wt-fleet-phase2 && task fleet:deploy` (second time)
Expected: clean re-apply, no errors, no resource churn beyond server-side no-ops.

- [ ] **Step 6: Final offline suite + push**

```bash
task test:all 2>&1 | tail -10
git push
```
Expected: green; branch pushed. Ready for PR via dev-flow-execute's later steps.

---

## Self-Review Notes (coverage check vs. spec)

- Platform layer (singletons once) → Task 1. Per-brand reuse + omit/pin component → Tasks 2-3. Env files → Task 4. backup-restore ns fix → Task 5. fleet:deploy → Task 6. Re-seal → Task 7. Platform install + deploy + empirical collision/affinity resolution → Task 8. Restore + verify → Task 9. pvc-backup green → Task 10. Isolation test → Task 11. DoD sweep + idempotency → Task 12.
- Every spec acceptance criterion maps to a Task 12 step or its source task. LLM reachability + capacity are runtime checks folded into Task 8. Wildcard certs come free from the brand overlays (PROD_DOMAIN) — no separate task needed.
- Runtime tasks (8-12) are command-driven with expected output rather than TDD code, appropriate for live-cluster infra; the two genuinely code-testable units (backup-restore ns fix, SA-08 isolation) use red→green TDD.
