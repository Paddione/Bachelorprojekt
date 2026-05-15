---
title: Brainstorm Tunnel Stability Fix Implementation Plan
domains: [infra, ops]
status: active
ticket_id: T000380
pr_number: null
---

# Brainstorm Tunnel Stability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `dev-flow-plan`'s brainstorm visual-companion tunnel come up reliably on the first try by fixing three independent infra defects: (1) ArgoCD reverting the `brainstorm-sish-authorized-keys` ConfigMap to its placeholder, (2) `brainstorm-sish` regenerating its SSH host key on every pod restart (forcing operators to clear `known_hosts`), and (3) the `brainstorm:_materialise-keys` task being marked `internal: true` while the skill documents direct CLI invocation.

**Architecture:** Per-resource `ignoreDifferences` on the ConfigMap (so ArgoCD treats `.data` as operator-managed); a hostPath-backed sish hostkey on `gekko-hetzner-2` (the deployment is already pinned there via `nodeSelector`, so a hostPath survives pod restarts without needing PVC/StorageClass plumbing); a public `brainstorm:setup` wrapper task that calls the existing internal materialise step. The failing test `NFA-12.bats` already exists on this branch and pins all three behaviours.

**Tech Stack:** Kubernetes (kustomize), ArgoCD ApplicationSet, antoniomika/sish v2.22.1, go-task, BATS.

**Reproducer ticket:** [T000380](https://web.mentolder.de/admin/bugs)

---

### Task 1: Verify failing test on current main

**Files:**
- Test: `tests/local/NFA-12.bats` (already created on this branch)

- [ ] **Step 1: Run NFA-12 against the live mentolder cluster**

Run from repo root:
```bash
./tests/runner.sh local NFA-12
```

Expected: T1 FAIL ("After 60s, authorized_keys is back to: # placeholder…"), T2 FAIL (no `hostkey` volume on the deployment), T3 FAIL ("task brainstorm:_materialise-keys is internal").

If any of T1/T2/T3 unexpectedly PASS, stop and reconcile — either the bug already self-healed or the test assertion does not actually reproduce the failure mode. Do not proceed.

- [ ] **Step 2: Capture the failing output for the PR description**

```bash
./tests/runner.sh local NFA-12 2>&1 | tee /tmp/NFA-12-before.log
```

Paste the relevant lines into the PR body when opening the PR (Task 5).

---

### Task 2: Make `brainstorm:_materialise-keys` invokable from the CLI

The existing task is correct in behaviour but `internal: true` blocks `task brainstorm:_materialise-keys` from being called directly. The skill `dev-flow-plan` and the README both call it that way. Fix by removing the `internal` flag and adding a public umbrella `brainstorm:setup` task that documents the full one-time setup (firewall + materialise) so operators have one entry point.

**Files:**
- Modify: `Taskfile.brainstorm.yml` (the `_materialise-keys:` block — remove `internal: true`, rename to `materialise-keys:` so the leading underscore no longer signals "internal")
- Modify: `Taskfile.brainstorm.yml` (add a new `setup:` task that orders `firewall:open` → `materialise-keys`)
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` ("Setup einmalig" section + the preflight check inside Step 2c — replace `task brainstorm:_materialise-keys` with `task brainstorm:materialise-keys`)
- Modify: `tests/local/NFA-12.bats` (T3 — switch the asserted task name from `_materialise-keys` to `materialise-keys`)

- [ ] **Step 1: Rename the task and drop the `internal` flag**

In `Taskfile.brainstorm.yml`, find this block (it currently looks like):

```yaml
  _materialise-keys:
    internal: true
    desc: "[brainstorm] Push DEV_SISH_AUTHORIZED_KEYS into the brainstorm-sish ConfigMap and roll sish"
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        ...
```

Change it to:

```yaml
  materialise-keys:
    desc: "[brainstorm] Push DEV_SISH_AUTHORIZED_KEYS into the brainstorm-sish ConfigMap and roll sish"
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        ...
```

Leave the body of `cmds:` unchanged.

- [ ] **Step 2: Add the public `setup` umbrella**

Append (still inside the `tasks:` map of `Taskfile.brainstorm.yml`):

```yaml
  setup:
    desc: "[brainstorm] One-time setup: open firewall on the sish node + materialise authorized_keys"
    cmds:
      - task: firewall:open
      - task: materialise-keys
```

- [ ] **Step 3: Update every caller**

Search the repo for `_materialise-keys` and replace the two known references (Taskfile call sites and skill instructions):

```bash
grep -rn '_materialise-keys' .
# Expected callers as of 2026-05-15:
#   .claude/skills/dev-flow-plan/SKILL.md  (Step 2c warning + "Setup einmalig" section)
#   tests/local/NFA-12.bats               (T3 assertion)
```

Replace each occurrence of `brainstorm:_materialise-keys` with `brainstorm:materialise-keys`.

- [ ] **Step 4: Re-run NFA-12 to confirm T3 now passes**

```bash
./tests/runner.sh local NFA-12
```

Expected: T1 still FAIL, T2 still FAIL, **T3 PASS**.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.brainstorm.yml .claude/skills/dev-flow-plan/SKILL.md tests/local/NFA-12.bats
git commit -m "fix(brainstorm): expose materialise-keys as public task [T000380]"
```

---

### Task 3: Stop ArgoCD from reverting `brainstorm-sish-authorized-keys`

The ConfigMap is intentionally operator-managed (its content comes from `task brainstorm:materialise-keys`, which reads `DEV_SISH_AUTHORIZED_KEYS` out of the SealedSecret). The base manifest in `k3d/brainstorm-sish.yaml` ships a placeholder, and the existing ApplicationSet has no per-resource carve-out for it, so ArgoCD reconciles `.data.authorized_keys` back to the placeholder within seconds of any sync, evicting the real key.

**Files:**
- Modify: `argocd/applicationset.yaml` (the `ignoreDifferences:` block — append a per-named-resource entry)

- [ ] **Step 1: Append the per-resource ignore rule**

Open `argocd/applicationset.yaml` and find the existing `ignoreDifferences:` block (already contains entries for Secret/Deployment/StatefulSet/HPA). Append this entry (keep the YAML list indentation matching the existing entries — two spaces per level):

```yaml
        - group: ""
          kind: ConfigMap
          name: brainstorm-sish-authorized-keys
          jsonPointers:
            - /data
```

- [ ] **Step 2: Apply the updated ApplicationSet to the hub**

```bash
kubectl --context mentolder apply -f argocd/applicationset.yaml
```

Expected: `applicationset.argoproj.io/workspace configured`.

- [ ] **Step 3: Re-materialise the keys**

```bash
task brainstorm:materialise-keys ENV=mentolder
```

Expected: ConfigMap updated, deployment rolled out within 60s.

- [ ] **Step 4: Re-run NFA-12 to confirm T1 now passes**

```bash
./tests/runner.sh local NFA-12
```

Expected: **T1 PASS**, T2 still FAIL, T3 PASS.

- [ ] **Step 5: Commit**

```bash
git add argocd/applicationset.yaml
git commit -m "fix(argocd): ignore data drift on brainstorm-sish authorized_keys CM [T000380]"
```

---

### Task 4: Persist `brainstorm-sish` SSH hostkey across pod restarts

The deployment is `nodeSelector`-pinned to `gekko-hetzner-2`. Use a `hostPath` volume at `/var/lib/brainstorm-sish/hostkeys` so the sish hostkey survives pod restarts. We do not need a PVC/StorageClass for this — we already accept that this single-replica pod cannot move off `gekko-hetzner-2` (LiveKit, TURN, sish all share that pinning).

sish writes its hostkey on first start when the directory is empty; no initContainer needed.

**Files:**
- Modify: `k3d/brainstorm-sish.yaml` (Deployment spec — add the new volume + volumeMount, add a startup args flag pointing sish at the persistent dir)

- [ ] **Step 1: Confirm sish's hostkey CLI flag**

sish v2.22.1 accepts `--private-keys-directory=<path>` (any private key file in this dir is loaded as a hostkey, generating a new ED25519 key on first start if the directory is empty). We rely on this rather than `--private-key-file=` so sish does the generation itself.

(No code change in this step — purely a check that the flag matches what's already documented in upstream sish.)

- [ ] **Step 2: Add the hostkey volume + mount + flag**

In `k3d/brainstorm-sish.yaml`, modify the Deployment's pod spec.

Find the existing `args:` list and append (keep the list flow consistent with existing entries):

```yaml
            - --private-keys-directory=/etc/sish-hostkey
```

Find the existing `volumeMounts:` list and append a second entry:

```yaml
            - name: hostkey
              mountPath: /etc/sish-hostkey
```

Find the existing `volumes:` list and append a second entry:

```yaml
        - name: hostkey
          hostPath:
            path: /var/lib/brainstorm-sish/hostkeys
            type: DirectoryOrCreate
```

The pod runs as the default sish user (UID 1000 in the antoniomika/sish image). `DirectoryOrCreate` creates the directory as root-owned 0755 on first apply, which is writable by root inside the container — sish in v2.22.1 runs as root by default unless an explicit `securityContext.runAsUser` is set, so this works without further chowning. (PodSecurity profile on the workspace namespace is `privileged`, so no additional securityContext gymnastics required.)

- [ ] **Step 3: Apply and verify**

```bash
kubectl --context mentolder -n workspace apply -f k3d/brainstorm-sish.yaml
kubectl --context mentolder -n workspace rollout status deploy/brainstorm-sish --timeout=60s
# Capture the post-restart fingerprint
ssh-keyscan -p 32223 -t ed25519 178.104.169.206 2>/dev/null | ssh-keygen -lf /dev/stdin
# Restart again and confirm the fingerprint is identical
kubectl --context mentolder -n workspace rollout restart deploy/brainstorm-sish
kubectl --context mentolder -n workspace rollout status deploy/brainstorm-sish --timeout=60s
ssh-keyscan -p 32223 -t ed25519 178.104.169.206 2>/dev/null | ssh-keygen -lf /dev/stdin
```

Expected: both `ssh-keyscan` invocations print the same SHA256 fingerprint.

- [ ] **Step 4: Re-run NFA-12 to confirm T2 now passes**

```bash
./tests/runner.sh local NFA-12
```

Expected: **T1 PASS, T2 PASS, T3 PASS** — all three green.

- [ ] **Step 5: Commit**

```bash
git add k3d/brainstorm-sish.yaml
git commit -m "fix(brainstorm): persist sish hostkey on hostPath so known_hosts survives restarts [T000380]"
```

---

### Task 5: End-to-end smoke + PR

- [ ] **Step 1: Manual end-to-end smoke**

```bash
# Clear the now-stale operator known_hosts entry one final time
ssh-keygen -f ~/.ssh/known_hosts -R '[178.104.169.206]:32223'
ssh-keyscan -p 32223 -t ed25519 178.104.169.206 2>/dev/null >> ~/.ssh/known_hosts

# Bring up a tunnel from any local port (use a throwaway nc listener)
nc -l 19999 &
NC_PID=$!
task brainstorm:publish -- 19999 &
SSH_PID=$!
sleep 5
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 5 https://brainstorm.mentolder.de/
# Expected: 200 (or 502 since nc is dumb — what matters is NOT 404)
kill $NC_PID $SSH_PID 2>/dev/null

# Restart sish, immediately re-publish, verify known_hosts NOT invalidated
kubectl --context mentolder -n workspace rollout restart deploy/brainstorm-sish
kubectl --context mentolder -n workspace rollout status deploy/brainstorm-sish --timeout=60s
nc -l 19999 &
NC_PID=$!
task brainstorm:publish -- 19999 &
SSH_PID=$!
sleep 5
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 5 https://brainstorm.mentolder.de/
# Expected: still 200/502 (NOT a Permission denied error in the publish task log)
kill $NC_PID $SSH_PID 2>/dev/null
```

- [ ] **Step 2: Run full local suite to catch regressions**

```bash
task test:all
./tests/runner.sh local NFA-12
```

Expected: `task test:all` green; NFA-12 all three tests PASS.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin fix/brainstorm-tunnel-stable
gh pr create --title "fix(brainstorm): make tunnel reliable across ArgoCD syncs and pod restarts [T000380]" \
  --body "$(cat <<'EOF'
## Summary

Three independent fixes that together make `dev-flow-plan`'s brainstorm visual-companion come up on the first try, every try:

1. **ArgoCD no longer reverts `brainstorm-sish-authorized-keys`** — added per-resource `ignoreDifferences` so the CM `.data` is treated as operator-managed (it's populated from the sealed `DEV_SISH_AUTHORIZED_KEYS`).
2. **sish hostkey persists across pod restarts** — mounted `/etc/sish-hostkey` from a `hostPath` on `gekko-hetzner-2` (the node the deployment is already `nodeSelector`-pinned to). Operators no longer have to clear `~/.ssh/known_hosts` after every rollout.
3. **`brainstorm:_materialise-keys` is no longer `internal: true`** — renamed to `brainstorm:materialise-keys` and added a `brainstorm:setup` umbrella that ties it together with `firewall:open`. The dev-flow-plan skill called the internal name and silently failed.

## Test plan

- [x] NFA-12 (failing reproducer) — was T1/T2/T3 FAIL on main, now T1/T2/T3 PASS
- [x] `task test:all` — green
- [x] Manual smoke: `nc -l 19999` + `task brainstorm:publish -- 19999` returns 200 from `https://brainstorm.mentolder.de`
- [x] Restart sish, re-publish: known_hosts entry stays valid (same SHA256)

Closes T000380.
EOF
)"
```

---

## Self-Review

**Spec coverage** — three reproducer assertions in NFA-12 → three corresponding tasks (3 = T1, 4 = T2, 2 = T3). Task 5 covers end-to-end smoke. Every assertion in the failing test maps to a fix.

**Placeholder scan** — every step has either a concrete shell command, an exact YAML fragment, or a precise file/line reference. No "TBD"/"add error handling"/"similar to Task N".

**Type consistency** — task name change from `_materialise-keys` to `materialise-keys` propagated everywhere it's referenced (Taskfile, skill, NFA-12 T3). The `setup` umbrella references `firewall:open` (which already exists in `Taskfile.brainstorm.yml`) and `materialise-keys` (renamed in Task 2).
