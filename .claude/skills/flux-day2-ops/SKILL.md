---
name: flux-day2-ops
description: Use when reconciling Flux GitOps after a PR merge, debugging Flux suspension/ImageUpdateAutomation, or when manifests are drifting and you need to force a cluster sync without a full workspace:deploy.
---

# flux-day2-ops — Flux GitOps Day-2 Operations

## Overview

Flux watches the `main` branch and reconciles both prod clusters automatically — but it polls on its own schedule. Day-2 ops means forcing reconciliation, debugging drift, and handling the subtleties that catch people off-guard.

**Both clusters run Flux independently.** Any Flux operation must be run against **each cluster separately** (or in both terminal windows simultaneously).

---

## Forced Reconcile After PR Merge

Always prime the GitRepository before reconciling the kustomization. Skipping the first step silently applies the previous revision.

```bash
# Step 1: prime the git source (fetches latest main)
flux reconcile source git flux-system --context mentolder
flux reconcile source git flux-system --context korczewski

# Step 2: reconcile the kustomization
flux reconcile kustomization workspace --context mentolder
flux reconcile kustomization workspace-korczewski --context korczewski
```

> **Why source first?** `flux reconcile kustomization` re-applies whatever revision the GitRepository last fetched. If that's 5 minutes old, the kustomization gets the wrong commit.

---

## Check Flux Status

```bash
# Overall health
flux get all --context mentolder
flux get all --context korczewski

# Just kustomizations (most common drift point)
flux get kustomizations --context mentolder
flux get kustomizations --context korczewski

# Source status (is Flux seeing latest main?)
flux get sources git --context mentolder
```

---

## Suspend / Resume Reconciliation

Suspend before manual emergency changes to prevent Flux from immediately reverting them:

```bash
# Suspend
flux suspend kustomization workspace --context mentolder

# Do your manual kubectl apply / patch here...

# Resume — Flux takes over again
flux resume kustomization workspace --context mentolder
```

> **Don't forget to resume.** A suspended kustomization silently stops tracking main.

---

## `$$`-Escaping in substituteFrom

Flux's `substituteFrom` treats `${VAR}` in YAML values as variable references. To emit a literal `$` in a manifest that passes through Flux, use `$$`:

```yaml
# ❌ Sends ${PROD_DOMAIN} to Flux substituteFrom — variable substitution fires
value: "https://${PROD_DOMAIN}/path"

# ✅ Literal dollar sign in the rendered manifest
value: "https://$${PROD_DOMAIN}/path"
```

This bites most often in Ingress annotations, env vars, and shell-script ConfigMaps.

---

## ImageUpdateAutomation Debug

Image auto-update is not used for `website`, `brett`, or `docs` (they use `task feature:*` with `:latest`). For other images:

```bash
# Check if IUA is running
flux get image update --context mentolder

# Force a scan
flux reconcile image repository <name> --context mentolder
flux reconcile image update <name> --context mentolder

# What did Flux try to write back?
flux logs --kind=ImageUpdateAutomation --context mentolder
```

---

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Kustomization applies old commit | Didn't reconcile source first | `flux reconcile source git flux-system` then kustomization |
| `health check failed` | Pod not Ready within timeout | `kubectl describe pod` — usually image pull or CrashLoop |
| `$$` becomes empty string | Forgot double-dollar in substituteFrom manifest | Replace `${VAR}` with `$${VAR}` in the YAML |
| Kustomization stuck Suspended | Manual suspend never resumed | `flux resume kustomization workspace` |
| `secrets/xxx not found` | SealedSecret not yet decrypted | `kubectl get sealedsecret -n workspace` — controller may be behind |
