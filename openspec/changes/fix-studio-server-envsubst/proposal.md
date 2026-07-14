---
title: "Proposal: fix studio-server envsubst for prod manifest"
ticket_id: T001799
status: planning
---

# Proposal: studio-server ${STUDIO_IMAGE} envsubst not applied

## Why

The `studio-server` Deployment (`k3d/studio.yaml`) uses `image: ${STUDIO_IMAGE}` as an envsubst placeholder. The dev deploy path in `Taskfile.yml` (workspace:deploy, line 2596) has a hardcoded `envsubst` variable list that does **not** include `$STUDIO_IMAGE`. As a result, envsubst leaves the literal string `${STUDIO_IMAGE}` in the rendered manifest, causing an `InvalidImageName` error on the pod.

The prod path (`ENVSUBST_VARS` at line 2710) correctly includes `$STUDIO_IMAGE`, so the prod overlay deploy works. The bug is confined to the dev path.

## What

Add `$STUDIO_IMAGE` to the dev `envsubst` variable list in `Taskfile.yml:2596`. Also add a BATS regression test in `tests/spec/workspace-deploy.bats` that asserts `$STUDIO_IMAGE` is present in the dev envsubst list.

## Akzeptanzkriterien

1. The dev envsubst list in `workspace:deploy` includes `$STUDIO_IMAGE`.
2. `kustomize build k3d/ | sed ... | envsubst ...` renders `image: "studio-server:latest"` (no literal `${STUDIO_IMAGE}`).
3. BATS test in `tests/spec/workspace-deploy.bats` passes.
4. Prod paths remain unchanged (already correct).

_Ticket: T001799_
