---
title: MCP Consolidate-on-Monolith Implementation Plan
ticket_id: T000289
domains: [infra]
status: active
pr_number: null
---

# MCP Consolidate-on-Monolith Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop prod from running the MCP servers twice — exclude the k3d-base split MCP pods (`claude-code-mcp-ops`, `claude-code-mcp-auth`) from the prod overlay so prod serves MCP only via the `claude-code-mcp-monolith` (default ns), then clean up the idle/orphaned split pods on the live clusters.

**Architecture:** `mcp.mentolder.de` is served by the `mcp-gateway` Traefik IngressRoute (default ns) → `mcp-auth-proxy` → `claude-code-mcp-monolith` (default ns) for every path (`/kubernetes`, `/postgres`, `/keycloak`, `/browser`, `/github`). The `k3d/` base also defines split MCP pods for the **dev** cluster. The shared `prod/` overlay already `$patch: delete`s `mcp-browser` + `mcp-github` (PR #246); this plan extends that to `claude-code-mcp-ops` + `claude-code-mcp-auth`. Dev (k3d base, applied directly) keeps all split pods unchanged.

**Tech Stack:** Kustomize (`$patch: delete` strategic-merge), Flux GitOps (prune=true), Traefik IngressRoute, BATS.

**Ticket:** T000289

---

## Background facts (verified, do not re-investigate)

- `mcp-gateway` IngressRoute routes **all** `mcp.mentolder.de/*` → `claude-code-mcp-monolith:{8080,3001,8081,3000,3002}`. The split pods in `workspace` ns have **no IngressRoute and no in-cluster consumer** (no claude-code agent pod runs in-cluster).
- Live (mentolder/`workspace`): `claude-code-mcp-ops`, `claude-code-mcp-auth` carry Flux labels `kustomize.toolkit.fluxcd.io/name=workspace` → **Flux will prune them** when removed from the overlay. `mcp-browser`, `mcp-github` have **no Flux labels** (manually applied, 5d22h old) → Flux will **not** prune them; they need explicit `kubectl delete`.
- Live (korczewski/`workspace-korczewski`): only `claude-code-mcp-ops` + `claude-code-mcp-auth` (both Flux-managed). No orphan browser/github there.
- T000285 (`DATABASE_URL` → `/website`) is already merged (#1128) and live on the monolith and split pods.
- The split ops pod uniquely exposes `mcp-meetings` (website app-user postgres on `:3002`); the monolith's `:3002` is github. `mcp-meetings` has no route/consumer, and the monolith's superuser postgres MCP already reaches the `website` DB — **no real capability loss**.

**Resource names (exact):**
| File (k3d base) | Deployment | Service |
|---|---|---|
| `k3d/claude-code-mcp-ops.yaml` | `claude-code-mcp-ops` | `claude-code-mcp-ops` |
| `k3d/claude-code-mcp-auth.yaml` | `claude-code-mcp-auth` | `claude-code-mcp-auth` |
| `k3d/claude-code-mcp-browser.yaml` | `mcp-browser` | `mcp-browser` (already deleted in prod/) |
| `k3d/claude-code-mcp-github.yaml` | `mcp-github` | `mcp-github` (already deleted in prod/) |

---

## File Structure

- **Modify:** `prod/kustomization.yaml` — add four `$patch: delete` blocks (Deployment+Service for ops, Deployment+Service for auth) immediately after the existing `mcp-browser` Service delete block.
- **Already done (RED):** `tests/unit/manifests.bats` — test `"prod overlays exclude split MCP pods (consolidated on monolith) [T000289]"` asserts no split MCP Deployment/Service renders in `prod-*` overlays. Currently FAILS on ops/auth.

No other files change. `k3d/kustomization.yaml` and the four `k3d/claude-code-mcp-*.yaml` manifests are **left untouched** (dev needs them).

---

## Task 1: Exclude split ops/auth pods from the prod overlay

**Files:**
- Modify: `prod/kustomization.yaml` (insert after the `mcp-browser` Service `$patch: delete` block, before the `# Override domains` line)
- Test: `tests/unit/manifests.bats` (test already written + RED)

- [ ] **Step 1: Verify the test is RED**

Run:
```bash
cd /tmp/wt-mcp-consolidate-monolith
tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats -f "consolidated on monolith"
```
Expected: `not ok 1 ... [T000289]` with output listing `prod-mentolder`/`prod-korczewski` Deployment+Service `claude-code-mcp-ops` and `claude-code-mcp-auth`.

- [ ] **Step 2: Add the four `$patch: delete` blocks**

In `prod/kustomization.yaml`, find the existing block ending with the `mcp-browser` Service delete:
```yaml
  - target:
      kind: Service
      name: mcp-browser
    patch: |
      apiVersion: v1
      kind: Service
      metadata:
        name: mcp-browser
      $patch: delete
```
Immediately **after** it (before `# Override domains`), insert:
```yaml
  # Split in-cluster MCP pods (ops = k8s+postgres+meetings, auth = keycloak).
  # Prod serves all MCP via claude-code-mcp-monolith (default ns) behind the
  # mcp-gateway IngressRoute, so these dev-only split pods must not reach prod —
  # else they run idle in the workspace ns duplicating the monolith. [T000289]
  - target:
      kind: Deployment
      name: claude-code-mcp-ops
    patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: claude-code-mcp-ops
      $patch: delete
  - target:
      kind: Service
      name: claude-code-mcp-ops
    patch: |
      apiVersion: v1
      kind: Service
      metadata:
        name: claude-code-mcp-ops
      $patch: delete
  - target:
      kind: Deployment
      name: claude-code-mcp-auth
    patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: claude-code-mcp-auth
      $patch: delete
  - target:
      kind: Service
      name: claude-code-mcp-auth
    patch: |
      apiVersion: v1
      kind: Service
      metadata:
        name: claude-code-mcp-auth
      $patch: delete
```

- [ ] **Step 3: Verify the test is GREEN**

Run:
```bash
cd /tmp/wt-mcp-consolidate-monolith
tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats -f "consolidated on monolith"
```
Expected: `ok 1 ... [T000289]`, output `OK: prod overlays render no split MCP ops/auth/browser/github resources`.

- [ ] **Step 4: Confirm dev (k3d base) is unaffected**

Run:
```bash
cd /tmp/wt-mcp-consolidate-monolith
kubectl kustomize k3d --load-restrictor=LoadRestrictionsNone | grep -E 'name: (claude-code-mcp-ops|claude-code-mcp-auth)$'
```
Expected: both names still present (dev keeps the split pods).

- [ ] **Step 5: Full offline validation**

Run:
```bash
cd /tmp/wt-mcp-consolidate-monolith
task workspace:validate
task test:all
```
Expected: both green. (`task test:all` includes `manifests.bats`.)

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-mcp-consolidate-monolith
git add prod/kustomization.yaml tests/unit/manifests.bats
git commit -m "fix(mcp): drop idle split ops/auth pods from prod overlay [T000289]"
```

---

## Task 2: Open the PR

- [ ] **Step 1: Push + PR**

```bash
cd /tmp/wt-mcp-consolidate-monolith
git push -u origin fix/mcp-consolidate-monolith
gh pr create --title "fix(mcp): consolidate prod MCP on the monolith [T000289]" \
  --body "$(cat <<'EOF'
## Summary
- Prod ran the MCP servers twice: `mcp-gateway` routes all `mcp.mentolder.de` paths to `claude-code-mcp-monolith` (default ns), but Flux also applied the k3d-base split pods (`claude-code-mcp-ops`, `claude-code-mcp-auth`) into the `workspace` ns where nothing consumes them.
- Adds `$patch: delete` for ops/auth Deployment+Service to `prod/kustomization.yaml`, matching the existing `mcp-browser`/`mcp-github` exclusion (PR #246). Dev (k3d base) keeps all split pods.
- Flux (prune=true) removes ops/auth from both clusters after merge; the non-Flux orphans `mcp-browser`/`mcp-github` on mentolder are cleaned up manually post-merge (see Task 3).

## Test plan
- New `manifests.bats` test asserts `prod-*` overlays render no split MCP pods (RED → GREEN).
- `task workspace:validate` + `task test:all` green.

Resolves T000289.
EOF
)"
```

- [ ] **Step 2: Wait for green CI, then squash-merge**

```bash
gh pr merge --squash --delete-branch --auto
```

---

## Task 3: Post-merge runtime cleanup + verification (run from main, after merge)

> Do these only after the PR is merged. `kubectl delete` on prod is the irreversible step — confirm the PR is merged first.

- [ ] **Step 1: Prime + reconcile Flux on both clusters**

```bash
for ctx in mentolder korczewski; do
  flux reconcile source git flux-system --context "$ctx"
  flux reconcile kustomization workspace --context "$ctx"
done
```

- [ ] **Step 2: Confirm Flux pruned ops/auth from both clusters**

```bash
kubectl --context mentolder   -n workspace            get deploy -l '' 2>/dev/null | grep -E 'claude-code-mcp-(ops|auth)' || echo "mentolder: ops/auth gone ✓"
kubectl --context korczewski  -n workspace-korczewski get deploy 2>/dev/null | grep -E 'claude-code-mcp-(ops|auth)' || echo "korczewski: ops/auth gone ✓"
```
Expected: both print the "gone ✓" line.

- [ ] **Step 3: Manually delete the non-Flux orphans on mentolder**

Flux will NOT remove these (no inventory labels). They only exist on mentolder/`workspace`.
```bash
kubectl --context mentolder -n workspace delete deployment mcp-browser mcp-github --ignore-not-found
kubectl --context mentolder -n workspace delete service    mcp-browser mcp-github --ignore-not-found
```

- [ ] **Step 4: Confirm workspace ns is monolith-free of split pods**

```bash
kubectl --context mentolder -n workspace get deploy | grep -iE 'mcp' || echo "mentolder workspace: no MCP split pods ✓"
```
Expected: "no MCP split pods ✓" (the monolith lives in `default` ns, untouched).

- [ ] **Step 5: Confirm the serving path is intact**

```bash
# monolith still present + on /website
kubectl --context mentolder -n default get deploy claude-code-mcp-monolith
kubectl --context mentolder -n default get deploy claude-code-mcp-monolith \
  -o jsonpath='{range .spec.template.spec.containers[*].env[?(@.name=="DATABASE_URL")]}{.value}{"\n"}{end}'
# external client still connected
claude mcp list | grep -i 'postgres mentolder'
```
Expected: monolith `1/1`, `DATABASE_URL` ends `/website`, `claude.ai postgres mentolder ... ✓ Connected`.

- [ ] **Step 6: Update ticket T000289 → done**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets SET status='done', updated_at=now() WHERE external_id='T000289';"
```

---

## Out of scope (file a follow-up)

korczewski has **no** `mcp-gateway` IngressRoute and no monolith — MCP is effectively dormant there (the split pods that were running had no external route either). After this cleanup, korczewski will have no MCP backend at all. If korczewski MCP exposure is desired, that is a separate ticket: deploy `deploy/mcp-korczewski/` (monolith + gateway) — do **not** address it in this PR.

## Rollback

`git revert` the `prod/kustomization.yaml` commit and reconcile Flux → `claude-code-mcp-ops` + `claude-code-mcp-auth` are re-applied by Flux. (The manually-deleted `mcp-browser`/`mcp-github` will NOT return automatically — they were never Flux-managed; re-apply by hand only if actually needed, which they are not.)
