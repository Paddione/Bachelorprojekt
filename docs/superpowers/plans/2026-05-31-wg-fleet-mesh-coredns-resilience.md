---
title: wg-fleet Full-Mesh + CoreDNS Resilience Implementation Plan
ticket_id: T000371
domains: [infra, ops, test]
status: active
pr_number: null
---

# wg-fleet Full-Mesh + CoreDNS Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the repo-side regression that caused the 2026-05-31 docs blank-page SSO outage — make the WireGuard config generator emit a genuine full mesh (every fleet node peers with every other) and make CoreDNS survive a single node reboot.

**Architecture:** Two independent phases. **Phase A** fixes `scripts/hetzner/generate-wg-conf.sh` so its peer-generation includes the `fleet` env's `workers:` and the `mentolder` env's `devc_servers:` node categories (currently silently dropped), turned green by an already-committed BATS test. **Phase B** adds a committed CoreDNS replica/spread manifest plus a `coredns:scale` Taskfile task, applied during cluster bring-up, with the k3s addon-reconcile caveat documented.

**Tech Stack:** Bash + embedded Python (PyYAML), BATS unit tests, go-task (`Taskfile.yml`), Kubernetes manifests (Deployment patch / PodDisruptionBudget / topologySpreadConstraints), k3s.

**Ticket:** T000371 · **Branch:** `fix/wg-fleet-mesh-coredns-resilience` · **Worktree:** `/tmp/wt-wg-fleet-mesh`

**Context (already done, do NOT redo):** The live nodes are already fixed — worker↔worker `wg-fleet` peers were added via `wg set` and persisted to `/etc/wireguard/wg-fleet.conf` on gekko-hetzner-2/3/4 (5 peers each, `wg-quick strip` validated). This plan is **purely repo-side** so a reprovision or future reboot cannot reintroduce the bug. The failing test `tests/unit/wg-mesh-fullmesh.bats` is already written and committed (wired into `task test:unit`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `scripts/hetzner/generate-wg-conf.sh` | Generates per-node full-mesh wg config from the registry | Modify (lines 61 & 81: category tuple) |
| `tests/unit/wg-mesh-fullmesh.bats` | Asserts full-mesh peer generation for `fleet` env | Already committed (RED) — must go GREEN |
| `prod/coredns-scale.yaml` | CoreDNS replicas:2 + topology spread + PDB | Create |
| `Taskfile.yml` | `coredns:scale ENV=<env>` task (mirrors `cert:install`) | Modify (add task) |
| `.claude/skills/cluster-deployment/SKILL.md` | Cluster bring-up ordering + k3s reconcile caveat | Modify (insert step) |

---

## Phase A — wg-fleet full-mesh generator fix

The root cause. `scripts/hetzner/generate-wg-conf.sh` embeds Python that iterates the
category tuple `('nodes', 'gpu_hosts', 'home_workers')` in **two** places:
- **line 61** — locating the *self* node (so a fleet worker isn't even found → hard error),
- **line 81** — emitting `[Peer]` blocks (so workers are dropped from every peer list).

The `fleet:` env stores its three gekko workers under a `workers:` key, and the
`mentolder:` env stores dev containers under `devc_servers:`. Both keys are absent
from the tuple, so they vanish from generated configs.

### Task A1: Confirm the committed test is RED

**Files:**
- Test: `tests/unit/wg-mesh-fullmesh.bats` (already present)

- [x] **Step 1: Run the test and confirm it fails for the right reason**

Run: `cd /tmp/wt-wg-fleet-mesh && ./tests/unit/lib/bats-core/bin/bats tests/unit/wg-mesh-fullmesh.bats`

Expected: FAIL. Specifically:
- `fleet worker config peers with the OTHER fleet workers` → fails (no `# gekko-hetzner-2` / `# gekko-hetzner-3` peers)
- `fleet control-plane config peers with the fleet workers` → fails (no worker peers)
- `fleet mesh is symmetric…` → fails with `ERROR: node 'gekko-hetzner-2' not found in env 'fleet'`

(If it already passes, STOP — the fix may have leaked in; re-read the script before proceeding.)

### Task A2: Make the generator emit a full mesh

**Files:**
- Modify: `scripts/hetzner/generate-wg-conf.sh:61` and `scripts/hetzner/generate-wg-conf.sh:81`

- [x] **Step 1: Fix the self-node lookup tuple (line ~61)**

Replace:

```python
# Locate self node across all categories
self_node = None
for cat in ('nodes', 'gpu_hosts', 'home_workers'):
```

with:

```python
# Locate self node across all categories.
# NOTE: every node category present in any env MUST be listed here and in the
# peer-emission loop below, or that category's nodes silently drop out of the
# mesh (regression T000371: 'workers' [fleet] + 'devc_servers' [mentolder]).
MESH_CATEGORIES = ('nodes', 'gpu_hosts', 'home_workers', 'workers', 'devc_servers')
self_node = None
for cat in MESH_CATEGORIES:
```

- [x] **Step 2: Fix the peer-emission tuple (line ~81)**

Replace:

```python
# Emit one [Peer] block per node in the mesh, skipping self
for cat in ('nodes', 'gpu_hosts', 'home_workers'):
```

with:

```python
# Emit one [Peer] block per node in the mesh, skipping self
for cat in MESH_CATEGORIES:
```

- [x] **Step 3: Run the targeted test — expect GREEN**

Run: `cd /tmp/wt-wg-fleet-mesh && ./tests/unit/lib/bats-core/bin/bats tests/unit/wg-mesh-fullmesh.bats`
Expected: PASS — all 3 tests ok.

- [x] **Step 4: Spot-check a generated worker config by hand**

Run:
```bash
cd /tmp/wt-wg-fleet-mesh
bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name gekko-hetzner-4 \
  --private-key 0000000000000000000000000000000000000000000= | grep -E '^\[Peer\]|^# '
```
Expected: 5 `[Peer]` blocks — `# pk-hetzner-4/6/8`, `# gekko-hetzner-2`, `# gekko-hetzner-3` (NOT `# gekko-hetzner-4`).

- [x] **Step 5: Run the full unit suite for regressions**

Run: `cd /tmp/wt-wg-fleet-mesh && task test:unit`
Expected: PASS (all bats tasks, including `test:unit:render-cloud-init` which exercises the sibling provisioning script, and the new `test:unit:wg-mesh-fullmesh`).

- [x] **Step 6: Commit**

```bash
cd /tmp/wt-wg-fleet-mesh
git add scripts/hetzner/generate-wg-conf.sh
git commit -m "fix(infra): wg config generator emits full mesh (workers + devc_servers) [T000371]"
```

---

## Phase B — CoreDNS resilience

k3s deploys CoreDNS as an auto-deploy addon at
`/var/lib/rancher/k3s/server/manifests/coredns.yaml` with `replicas: 1`, and
**re-applies that manifest on k3s restart/upgrade** — which is exactly what
reverted a prior scale-up and put the sole replica on one worker today. We cannot
durably win by editing the live Deployment alone; instead we commit the desired
state and (re)apply it via a task during bring-up and after k3s upgrades.

### Task B1: Commit the CoreDNS scale/spread manifest

**Files:**
- Create: `prod/coredns-scale.yaml`

- [x] **Step 1: Create the manifest**

```yaml
# prod/coredns-scale.yaml
# Makes cluster DNS survive a single node reboot (T000371). k3s ships CoreDNS
# as a replicas:1 addon and REVERTS live edits on restart/upgrade, so this is
# (re)applied by `task coredns:scale` during bring-up and after every k3s upgrade.
# Strategic-merge friendly: only the fields we own are listed; k3s manages the rest.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coredns
  namespace: kube-system
spec:
  replicas: 2
  template:
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          # ScheduleAnyway (not DoNotSchedule): never block DNS from scheduling
          # on a small/cordoned cluster; spread is best-effort.
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              k8s-app: kube-dns
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: coredns
  namespace: kube-system
spec:
  minAvailable: 1
  selector:
    matchLabels:
      k8s-app: kube-dns
```

- [x] **Step 2: Validate the manifest parses**

Run:
```bash
cd /tmp/wt-wg-fleet-mesh
kubectl apply --dry-run=client -f prod/coredns-scale.yaml
```
Expected: `deployment.apps/coredns configured (dry run)` and `poddisruptionbudget.policy/coredns created (dry run)` — no schema errors.

- [x] **Step 3: Commit**

```bash
cd /tmp/wt-wg-fleet-mesh
git add prod/coredns-scale.yaml
git commit -m "feat(infra): CoreDNS replicas:2 + topology spread + PDB manifest [T000371]"
```

### Task B2: Add the `coredns:scale` task

**Files:**
- Modify: `Taskfile.yml` (add `coredns:scale` task; mirror `cert:install` at line ~3162)

- [x] **Step 1: Add the task**

Insert this task adjacent to the other cluster bring-up tasks (e.g. just before `cert:install:` at line ~3162). Use 2-space indentation to match `Taskfile.yml`:

```yaml
  coredns:scale:
    desc: "Scale CoreDNS to 2 replicas + topology spread + PDB (ENV=dev|mentolder|korczewski). Re-run after k3s upgrades (k3s reverts its addon)."
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        if ! kubectl --context "$ENV_CONTEXT" cluster-info >/dev/null 2>&1; then
          echo "No cluster reachable for ENV={{.ENV}} context $ENV_CONTEXT" >&2; exit 1
        fi
        kubectl --context "$ENV_CONTEXT" apply -f prod/coredns-scale.yaml
        kubectl --context "$ENV_CONTEXT" -n kube-system rollout status deploy/coredns --timeout=120s
        echo "✓ CoreDNS scaled to 2 replicas with topology spread (ENV={{.ENV}})"
```

- [x] **Step 2: Verify the task is recognised and dry-runs cleanly**

Run:
```bash
cd /tmp/wt-wg-fleet-mesh
task --list 2>/dev/null | grep coredns:scale
task --dry coredns:scale ENV=dev 2>&1 | tail -5
```
Expected: the task is listed; the dry-run prints the commands without executing (no cluster contact required for `--dry`).

- [x] **Step 3: Commit**

```bash
cd /tmp/wt-wg-fleet-mesh
git add Taskfile.yml
git commit -m "feat(infra): add coredns:scale task to apply DNS resilience manifest [T000371]"
```

### Task B3: Document bring-up ordering + reconcile caveat

**Files:**
- Modify: `.claude/skills/cluster-deployment/SKILL.md`

- [x] **Step 1: Find the mandatory bring-up ordering block**

Run:
```bash
cd /tmp/wt-wg-fleet-mesh
grep -n -iE 'cert:install|workspace:deploy|sealed-secrets:install|mandatory|order' .claude/skills/cluster-deployment/SKILL.md | head -20
```
Identify the numbered cluster bring-up sequence that lists `task cert:install` before `task workspace:deploy`.

- [x] **Step 2: Insert the CoreDNS step**

After the `task cert:install ENV=<env>` step and before `task workspace:deploy ENV=<env>`, add a step (renumber the trailing items if the list is numbered):

```markdown
- `task coredns:scale ENV=<env>` — CoreDNS to 2 replicas + topology spread so a
  single node reboot can't take out cluster DNS (T000371).
  **Caveat:** k3s ships CoreDNS as a `replicas: 1` auto-deploy addon and re-applies
  it on every k3s restart/upgrade, reverting this. **Re-run `task coredns:scale`
  after any k3s version upgrade** (and confirm `kubectl -n kube-system get deploy
  coredns` shows `2/2`).
```

- [x] **Step 3: Commit**

```bash
cd /tmp/wt-wg-fleet-mesh
git add .claude/skills/cluster-deployment/SKILL.md
git commit -m "docs(infra): document coredns:scale bring-up step + k3s reconcile caveat [T000371]"
```

### Task B4 (optional, live): Apply CoreDNS scale to the fleet now

Only if the operator wants the resilience live immediately (the cluster is currently
back to `replicas: 1`). This is the single live action in the plan; skip if deferring.

- [ ] **Step 1: Apply to fleet (both brands share the one `kube-system`)**

Run:
```bash
cd /tmp/wt-wg-fleet-mesh
task coredns:scale ENV=mentolder
```
Expected: `deployment.apps/coredns configured`, rollout reaches `2/2`, `✓ CoreDNS scaled…`.
(`ENV=mentolder` and `ENV=korczewski` both resolve to the `fleet` context; `kube-system` is shared, so run once.)

- [ ] **Step 2: Verify 2 replicas land on different nodes**

Run:
```bash
kubectl --context fleet -n kube-system get pods -l k8s-app=kube-dns -o wide
```
Expected: 2 Running pods on two distinct nodes.

---

## Verification (whole-plan)

- [x] `cd /tmp/wt-wg-fleet-mesh && task test:unit` → all green (includes `test:unit:wg-mesh-fullmesh`).
- [x] `bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name gekko-hetzner-3 --private-key 0000000000000000000000000000000000000000000= | grep -c '^\[Peer\]'` → `5`.
- [x] `bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name gekko-hetzner-2 --private-key 0000000000000000000000000000000000000000000= >/dev/null` → exit 0 (no "node not found"; confirms `devc_servers` no longer breaks the mentolder env).
- [x] `kubectl apply --dry-run=client -f prod/coredns-scale.yaml` → no errors.
- [x] `task --dry coredns:scale ENV=mentolder` → prints commands, no error.
- [ ] CI offline suite passes: open PR, confirm `task test:all` job green.

## PR & merge

- [ ] Open PR against `main` (`gh pr create`), title `fix(infra): wg-fleet full mesh + CoreDNS resilience [T000371]`, body referencing the outage and T000371.
- [ ] CI green → **squash-and-merge**, delete branch.
- [ ] Close T000371 (link the PR).
- [ ] Remove worktree: `git worktree remove /tmp/wt-wg-fleet-mesh`.

---

## Self-Review Notes

- **Spec coverage:** Part A (generator full-mesh, both tuples, both extra categories, test green, no regressions) → Tasks A1–A2. Part B (manifest replicas:2 + ScheduleAnyway spread + PDB, `coredns:scale` task mirroring `cert:install`, bring-up ordering + reconcile caveat doc, ScheduleAnyway rationale) → Tasks B1–B4. All covered.
- **No placeholders:** every code/YAML/command step is concrete.
- **Consistency:** `MESH_CATEGORIES` defined in A2/Step 1 is reused in A2/Step 2; `prod/coredns-scale.yaml` created in B1 is referenced verbatim by the B2 task and B4 apply; `k8s-app: kube-dns` selector is identical across Deployment spread, PDB, and verification `kubectl get pods -l`.
