---
title: "fix studio-server envsubst for prod manifest"
ticket_id: T001799
domains: [infra, deployment]
status: active
---

# Implementation Plan: fix-studio-server-envsubst (T001799)

**Ticket:** T001799
**Branch:** `fix/t001799-studio-server-envsubst`

## Root Cause

`k3d/studio.yaml:34` uses `image: ${STUDIO_IMAGE}`. The dev envsubst call in `Taskfile.yml:2596` does not include `$STUDIO_IMAGE` in its variable list. envsubst leaves the literal `${STUDIO_IMAGE}` in the rendered manifest → pod gets `InvalidImageName`.

The prod path (`ENVSUBST_VARS` at line 2710) already includes `$STUDIO_IMAGE` — only the dev path is broken.

## Vorgehen

- [ ] **Task 1: Add `$STUDIO_IMAGE` to dev envsubst list**
  - File: `Taskfile.yml:2596`
  - The envsubst call after `kustomize build k3d/` must include `\$STUDIO_IMAGE` alongside the existing `$LLM_ROUTER_URL`, `$WHISPER_URL`, etc.
  - Insert `\$STUDIO_IMAGE` into the envsubst argument string, e.g. after `\$BRAND_ID`.

- [ ] **Task 2: Add BATS regression test**
  - File: `tests/spec/workspace-deploy.bats`
  - Add a test that asserts the dev envsubst list (the inline envsubst call between `kustomize build k3d/` and `kubectl apply`) includes `$STUDIO_IMAGE`.
  - Pattern: same approach as the existing `$SMTP_USER` test at line 63-70.

- [ ] **Task 3: Verify**
  - Run `task test:changed` to confirm BATS passes.
  - Run `kustomize build k3d/ | sed ... | STUDIO_IMAGE=studio-server:latest envsubst '$STUDIO_IMAGE'` to verify the image is substituted (no literal `${STUDIO_IMAGE}`).

## Verification

```bash
# BATS test
cd /home/patrick/Bachelorprojekt/.worktrees/t001799-studio-server-envsubst
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats

# Manual pipeline test
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
  | STUDIO_IMAGE=studio-server:latest envsubst '$STUDIO_IMAGE' \
  | grep 'image:.*studio'
# Expected: image: "studio-server:latest" (no literal ${STUDIO_IMAGE})
```
