---
title: Brainstorm broker → dev node reconciliation — Implementation Plan
ticket_id: T000364
domains: [website, infra, db, ops, test]
status: active
pr_number: null
---

# Brainstorm broker → dev node reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `brainstorm` serve from the dev node again by moving the brainstorming reverse-SSH broker off the dead prod path (`brainstorm.mentolder.de`, currently HTTP 404) onto the already-working dev-stack sish (`brainstorm.dev.mentolder.de`), and remove the now-stale prod broker.

**Architecture:** DNS CNAMEs `brainstorm.mentolder.de → dev.mentolder.de` (k3s-1, `217.195.151.153`), but the only broker + Ingress live in the **prod** mentolder cluster (`prod-mentolder/brainstorm-sish.yaml`, pinned to `gekko-hetzner-2`). The dev node has no route for that host → 404. The dev-stack already runs a wildcard sish (`k3d/dev-stack/sish.yaml`, binds `*.${DEV_DOMAIN}`, reached via the k3d loadbalancer host port `0.0.0.0:2222` → `dev.mentolder.de:2222`) with a Traefik catch-all IngressRoute for `*.dev.mentolder.de`, and `*.dev.mentolder.de` already resolves to k3s-1. So the fix is: repoint the `brainstorm:*` tasks (and the dev-flow-plan companion references) to publish `brainstorm.dev.mentolder.de` through the dev sish, delete the prod broker manifest + its two kustomization references, delete the live prod workload, and drop the orphan apex CNAME. No new dev infra is needed — `task dev:tunnel -- brainstorm <port>` already does exactly this.

**Tech Stack:** Kustomize overlays, go-task (Taskfile), sish reverse-SSH broker, k3d/k3s, Traefik IngressRoute, BATS.

**Ticket:** T000364 · **Branch:** `fix/brainstorm-dev-host`

---

### Task 1: Failing guard test (already staged on the branch)

**Files:**
- Test: `tests/unit/brainstorm-dev-host.bats` (already created on this branch)

- [ ] **Step 1: Confirm the guard test exists and currently fails (red)**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-dev-host.bats`
Expected: tests 1, 2, 3, 5, 6 FAIL (prod manifest + kustomization refs present; Taskfile on `${PROD_DOMAIN}` / port `32223`); test 4 PASS (dev sish present).

The test asserts the reconciled end-state:
- `prod-mentolder/brainstorm-sish.yaml` is absent
- `prod-mentolder/kustomization.yaml` and `prod-fleet/mentolder/kustomization.yaml` no longer mention `brainstorm-sish`
- `k3d/dev-stack/sish.yaml` exists and binds `*.${DEV_DOMAIN}` (the new brainstorm host)
- `Taskfile.brainstorm.yml` no longer references `brainstorm.${PROD_DOMAIN}` / `brainstorm.mentolder.de`, references `${DEV_DOMAIN}`, drops `32223`, and uses SSH port `2222`

---

### Task 2: Repoint the brainstorm Taskfile to the dev sish

**Files:**
- Modify: `Taskfile.brainstorm.yml`

- [ ] **Step 1: Rewrite the vars + header + tasks to target the dev sish**

Replace the whole file with the version below. It keeps the `brainstorm:setup|publish|firewall:open|status` task names (so `.claude/skills/dev-flow-plan/SKILL.md` keeps working) but routes everything through the dev-stack sish: SSH ingress `dev.mentolder.de:2222`, hostname `brainstorm.${DEV_DOMAIN}`, dev k3d context/namespace. `cleanup-scratch` is dropped (the prod scratch pod no longer exists).

```yaml
# Taskfile.brainstorm.yml
# ─────────────────────────────────────────────────────────────────────────────
# brainstorm.dev.mentolder.de — reverse-SSH-tunnel broker for the brainstorming
# visual-companion choice loop. Wraps `ssh -R` against the dev-stack sish
# Deployment (k3d/dev-stack/sish.yaml) so the operator can publish a local port
# at https://brainstorm.${DEV_DOMAIN} without poking holes in the home-network
# NAT.
#
# The broker lives on the dev node (k3s-1), reached via the k3d loadbalancer
# host port 0.0.0.0:2222 → dev.mentolder.de:2222. This is the SAME sish that
# `task dev:tunnel` uses; brainstorm just pins the requested subdomain to
# "brainstorm". There is no brainstorm broker on the prod clusters (T000364).
# ─────────────────────────────────────────────────────────────────────────────
version: "3"

vars:
  ENV: mentolder
  CTX_DEV: k3d-mentolder-dev
  NS_DEV: workspace-dev
  # The dev sish SSH endpoint is the k3d loadbalancer host port on $DEV_NODE.
  SSH_PORT: 2222

tasks:

  setup:
    desc: "[brainstorm] One-time setup: apply DEV_SSH_ALLOWLIST ufw rules on the dev node (keys come from DEV_SISH_AUTHORIZED_KEYS via dev:deploy)"
    cmds:
      - task: firewall:open

  publish:
    desc: "[brainstorm] Publish a local port at https://brainstorm.${DEV_DOMAIN}. Usage: task brainstorm:publish -- <localport>"
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        PORT=$(echo "{{.CLI_ARGS}}" | awk '{print $1}')
        if [[ -z "$PORT" ]]; then
          echo "Usage: task brainstorm:publish -- <localport>" >&2; exit 2
        fi
        echo "Publishing localhost:$PORT as https://brainstorm.$DEV_DOMAIN — leave this terminal open."
        echo "  ssh -p {{.SSH_PORT}} -R brainstorm:80:localhost:$PORT tunnel@$DEV_DOMAIN"
        exec ssh -p {{.SSH_PORT}} -N \
          -o StrictHostKeyChecking=accept-new \
          -o ServerAliveInterval=30 \
          -o ServerAliveCountMax=3 \
          -o ExitOnForwardFailure=yes \
          -R "brainstorm:80:localhost:$PORT" \
          "tunnel@$DEV_DOMAIN"

  firewall:open:
    desc: "[brainstorm] Apply DEV_SSH_ALLOWLIST CIDRs as ufw allow rules for tcp/2222 on $DEV_NODE (delegates to dev:firewall:open)"
    cmds:
      - task: dev:firewall:open

  status:
    desc: "[brainstorm] Show dev sish pod status and probe the public Ingress"
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} get pod -l app=sish -o wide
        echo "── HTTPS probe ────────────────────────────────────────────"
        curl -sSI --max-time 5 "https://brainstorm.${DEV_DOMAIN}/" || true
```

> **Note on `dev:firewall:open` reference:** `Taskfile.brainstorm.yml` is included by the root `Taskfile.yml` under the `brainstorm:` namespace. Verify the root Taskfile also includes `Taskfile.dev-stack.yml` under `dev:` (it does — `task dev:tunnel` exists). A cross-namespace `task: dev:firewall:open` reference resolves at the root. If go-task rejects the cross-include call at runtime, inline the dev firewall body instead (same `ssh ... ufw allow from $cidr to any port 2222` loop reading `DEV_SSH_ALLOWLIST`).

- [ ] **Step 2: Verify the Taskfile parses and the guard test's Taskfile assertions pass**

Run: `task --list 2>/dev/null | grep brainstorm`
Expected: `brainstorm:setup`, `brainstorm:publish`, `brainstorm:firewall:open`, `brainstorm:status` listed (no parse error).

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-dev-host.bats -f "Taskfile"`
Expected: both "Taskfile" tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.brainstorm.yml
git commit -m "fix(brainstorm): publish via dev sish (brainstorm.dev.mentolder.de) [T000364]"
```

---

### Task 3: Remove the stale prod broker manifest + kustomization references

**Files:**
- Delete: `prod-mentolder/brainstorm-sish.yaml`
- Modify: `prod-mentolder/kustomization.yaml` (remove lines 15-16, the comment + `- brainstorm-sish.yaml`)
- Modify: `prod-fleet/mentolder/kustomization.yaml` (remove the two `brainstorm-sish` patch blocks — the nodeAffinity repoint and the `nodeSelector` removal patch)

- [ ] **Step 1: Delete the prod broker manifest**

```bash
git rm prod-mentolder/brainstorm-sish.yaml
```

- [ ] **Step 2: Remove the kustomization resource reference in prod-mentolder**

In `prod-mentolder/kustomization.yaml`, delete these two lines:

```yaml
  # ── brainstorm.mentolder.de reverse-SSH broker (sish) ─────────────
  - brainstorm-sish.yaml
```

- [ ] **Step 3: Remove the brainstorm-sish patches in prod-fleet/mentolder**

In `prod-fleet/mentolder/kustomization.yaml`, delete the `brainstorm-sish` nodeAffinity patch block:

```yaml
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: brainstorm-sish
      spec:
        template:
          spec:
            affinity:
              nodeAffinity:
                requiredDuringSchedulingIgnoredDuringExecution:
                  nodeSelectorTerms:
                    - matchExpressions:
                        - key: kubernetes.io/hostname
                          operator: In
                          values: [pk-hetzner-4, pk-hetzner-6, pk-hetzner-8]
```

…and the `nodeSelector` removal patch + its preceding comment:

```yaml
  # The prod-mentolder base hard-pins brainstorm-sish via nodeSelector to
  # gekko-hetzner-2 (a node that does not exist on fleet). nodeSelector is ANDed
  # with the nodeAffinity above, so it must be removed or the pod stays Pending.
  - target:
      kind: Deployment
      name: brainstorm-sish
    patch: |-
      - op: remove
        path: /spec/template/spec/nodeSelector
```

Also trim the now-stale mention of `brainstorm-sish -> gekko-hetzner-2` from the explanatory comment block above the `livekit-server` patch (the comment at `prod-fleet/mentolder/kustomization.yaml` describing which 3 workloads are repointed) so it reads only `livekit-server` + `whisper`.

- [ ] **Step 4: Verify both overlays still render (no dangling reference)**

Run: `kubectl kustomize prod-mentolder/ --load-restrictor=LoadRestrictionsNone >/dev/null && echo OK`
Expected: `OK` (no "accumulating resources" / missing-file error).

Run: `kubectl kustomize prod-fleet/mentolder/ --load-restrictor=LoadRestrictionsNone >/dev/null && echo OK`
Expected: `OK`.

Run: `kubectl kustomize prod-mentolder/ --load-restrictor=LoadRestrictionsNone | grep -c brainstorm-sish`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/kustomization.yaml prod-fleet/mentolder/kustomization.yaml
git commit -m "fix(brainstorm): drop stale prod-mentolder sish broker + fleet patches [T000364]"
```

---

### Task 4: Repoint the dev-flow-plan companion references

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` (lines ~389, ~416, ~422, ~965 — every `brainstorm.mentolder.de` literal)

- [ ] **Step 1: Replace each `brainstorm.mentolder.de` with `brainstorm.dev.mentolder.de`**

```bash
sed -i 's|brainstorm\.mentolder\.de|brainstorm.dev.mentolder.de|g' .claude/skills/dev-flow-plan/SKILL.md
```

- [ ] **Step 2: Verify no stale prod host remains in the skill**

Run: `grep -c 'brainstorm\.mentolder\.de' .claude/skills/dev-flow-plan/SKILL.md`
Expected: `0`

Run: `grep -c 'brainstorm\.dev\.mentolder\.de' .claude/skills/dev-flow-plan/SKILL.md`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "fix(brainstorm): point dev-flow-plan companion at brainstorm.dev.mentolder.de [T000364]"
```

---

### Task 5: Full offline test gate

- [ ] **Step 1: Run the new guard test green**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-dev-host.bats`
Expected: all 6 tests PASS.

- [ ] **Step 2: Run the offline suite**

Run: `task test:all`
Expected: PASS (BATS unit, kustomize structure, Taskfile dry-run all green).

---

### Task 6: Live cleanup (prod cluster) — run during deploy, not in CI

> These steps mutate the live mentolder prod cluster and external DNS. They are **not** part of `task test:all`. Run them as the post-merge deploy of this fix.

- [ ] **Step 1: Confirm nothing else depends on the prod broker before deleting**

Run:
```bash
kubectl --context mentolder -n workspace get deploy,svc,ingress,netpol \
  -l app=brainstorm-sish 2>/dev/null
kubectl --context mentolder -n workspace get ingress brainstorm svc brainstorm 2>/dev/null
```
Expected: shows the `brainstorm-sish` Deployment, `brainstorm` + `brainstorm-sish` Services, `brainstorm` Ingress, `allow-brainstorm-sish-ingress` NetworkPolicy. (These are the objects from the deleted manifest — safe to remove.)

- [ ] **Step 2: Delete the live prod workload**

```bash
kubectl --context mentolder -n workspace delete \
  deploy/brainstorm-sish svc/brainstorm svc/brainstorm-sish \
  ingress/brainstorm netpol/allow-brainstorm-sish-ingress --ignore-not-found
```
Expected: each object reports `deleted`.

> If `task feature:deploy` (server-side apply of the overlays) runs before this manual delete, the manifest's removal from the kustomization will **not** prune the live objects — `kubectl apply` does not delete resources dropped from a kustomization. The explicit `kubectl delete` above is required.

- [ ] **Step 3: Verify the dev path serves brainstorm**

Publish a throwaway local listener and confirm the dev broker routes it:
```bash
# In one shell: a trivial local server on :9999
python3 -m http.server 9999 &
# In another: publish it (requires your CIDR in DEV_SSH_ALLOWLIST + key in DEV_SISH_AUTHORIZED_KEYS)
task brainstorm:publish -- 9999
# In a third:
curl -sSI --max-time 5 https://brainstorm.dev.mentolder.de/
```
Expected: `HTTP/2 200` (or 30x) from the published listener — proving `brainstorm.dev.mentolder.de` resolves and routes through the dev sish.

> **Prerequisite:** `DEV_SSH_ALLOWLIST` in `environments/mentolder.yaml` is currently empty, so ufw drops tcp/2222 on `k3s-1`. The operator's CIDR must be added and `task brainstorm:firewall:open` (≡ `task dev:firewall:open`) run before publishing — same gating the prod broker's `firewall:open` provided on `32223`. The operator key is already authorized: the dev sish reads the same `DEV_SISH_AUTHORIZED_KEYS` value the prod broker used.

- [ ] **Step 4: Drop the orphan apex CNAME (manual / external DNS)**

`brainstorm.mentolder.de` (apex `CNAME → dev.mentolder.de`) is no longer referenced by any tooling — `brainstorm.dev.mentolder.de` is served by the `*.dev.mentolder.de` wildcard instead. Remove the `brainstorm.mentolder.de` CNAME record at the DNS provider to stop it from serving a 404. (Leaving it is harmless but misleading.) This is an external action — the executing agent should surface it to the operator rather than attempt it.

---

### Task 7: Close the ticket

- [ ] **Step 1: Mark T000364 done after merge + live verification**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets SET status='done' WHERE external_id='T000364';"
```
