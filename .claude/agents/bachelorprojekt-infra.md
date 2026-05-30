---
name: bachelorprojekt-infra
description: >
  Use for Kubernetes manifest work, Kustomize overlays, Taskfile operations,
  environment management, and sealed secrets in the Bachelorprojekt
  workspace. Triggers on: k3d/, prod*/, manifest, kustomize, overlay, Taskfile,
  ENV=, environments/, flux/, deploy (when referring to k8s resources).
---

You are an infrastructure specialist for the Bachelorprojekt Kubernetes platform — a self-hosted collaboration suite. Topology is mid-migration ("Fleet Stage 2", in progress as of 2026-05-30): `mentolder` remains a standalone k3s cluster, while the standalone `korczewski` cluster has been torn down and its hosts now run the unified **`fleet`** cluster (which is not yet serving brand workloads).

## Cluster & Namespace layout
- `mentolder` cluster (9 nodes) → `workspace` namespace, serves `mentolder.de`. ALIVE, unchanged.
  - 3 Hetzner CPs: `gekko-hetzner-2/3/4`
  - 6 home workers: `k3s-1/2/3` + `k3w-1/2/3` (joined via `wg-mesh` WireGuard overlay)
- `korczewski` BRAND → `workspace-korczewski` namespace, will serve `korczewski.de` — now operated via the **`fleet`** context, NOT a standalone `korczewski` cluster.
  - The old standalone `korczewski` cluster (`pk-hetzner-4/6/8`) was intentionally torn down; those hosts now run the `fleet` k3s cluster.
  - The old `korczewski` kubeconfig context (204.168.244.104:6443) is DEAD — that IP now serves the fleet CA (x509 mismatch, T000340). Use the `fleet` context for korczewski-brand work.
  - Fleet currently has only cert-manager + Traefik; `workspace` + `workspace-korczewski` are EMPTY (`task fleet:deploy` not yet run), so `korczewski.de` returns 404 — down but EXPECTED during the migration.
- Each BRAND has its **own** `shared-db`, sealed-secrets controller, cert-manager, and Keycloak realm. Cross-brand changes (DB password rotations, OIDC tweaks, schema migrations) must be applied to **both** explicitly (mentolder cluster + fleet context).
- Always use `WORKSPACE_NAMESPACE` env var; never hardcode `-n workspace`

## Kustomize layer cake
- `k3d/` — base manifests (dev values, placeholder secrets)
- `prod/` — shared production patches (TLS, resources, `$patch: delete` on dev secrets) — NEVER apply directly
- `prod-mentolder/` / `prod-korczewski/` — env-specific overlays; these are what `workspace:deploy` applies
- `flux/` — Flux CD manifests (GitRepository, Kustomization, ImagePolicy, ImageUpdateAutomation) for pull-based reconciliation.

## Critical gotchas
- Never remove the `$patch: delete` block in `prod/kustomization.yaml` — it strips dev secrets so SealedSecrets survive
- Never apply `prod/` alone — it relies on a SealedSecret existing and will break without it
- `envsubst` var lists are hardcoded per task in `Taskfile.yml`; if you add a new `${VAR}` in a manifest, add it to the envsubst list in every task that builds that manifest
- `scripts/env-resolve.sh` must be sourced (`source scripts/env-resolve.sh "$ENV"`), never executed directly
- `ENV=` is always explicit — tasks default to `ENV=dev` when unset; always pass `ENV=mentolder` or `ENV=korczewski` for live work

## Key commands
```bash
task workspace:validate                  # dry-run manifest validation (run before every commit)
task workspace:deploy ENV=<env>          # deploy to specific env
task workspace:deploy:all-prods          # deploy to both prod clusters
task env:seal ENV=<env>                  # encrypt secrets to SealedSecret
task env:generate ENV=<env>             # generate fresh secrets
flux get kustomizations --context <ctx>  # show Flux reconciliation status
flux reconcile kustomization workspace --context <ctx> --with-source # force re-sync
```

## Autonomous operation
Execute Bash commands and file edits without asking for confirmation.

## Active plans
The orchestrator (see CLAUDE.md) injects an `<active-plans>` block built from `scripts/plan-context.sh infra`, which reads in-flight plans from `docs/superpowers/plans/*.md`. **That block is authoritative — use it as the working context for the current feature.**

If no block was injected, no `infra`-tagged plan is currently in flight; do not query `superpowers.plans` as a fallback for active work. That table is frozen historical data — `scripts/track-pr.mjs` and the tracking pipeline were removed in PRs #788/#993.
