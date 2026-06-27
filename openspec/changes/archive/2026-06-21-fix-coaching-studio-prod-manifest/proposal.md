---
title: Proposal: fix-coaching-studio-prod-manifest
ticket_id: T001009
plan_ref: openspec/changes/fix-coaching-studio-prod-manifest/tasks.md
status: archived
date: 2026-06-20
---

# Proposal: Coaching-Studio prod manifest fix (T001009)

## Why

PR #1966 (T001002 Coaching-Studio) merged with two latent manifest bugs that
block the prod deploy of `prod-fleet/mentolder/studio.yaml` (and by extension
`prod-fleet/korczewski/studio.yaml` once the brand overlay is added):

1. **Invalid Deployment overlay** — `prod-fleet/mentolder/studio.yaml` is
   listed under `resources:` in `prod-fleet/mentolder/kustomization.yaml`, but
   the file is a *partial* Deployment (only `spec.template.spec` is set;
   `spec.selector` and `spec.template.metadata.labels` are missing). Kustomize
   does not merge two same-named Deployments; the partial one fails the API
   validation step with:
   `The Deployment "studio-server" is invalid: spec.selector: Required value;
   spec.template.metadata.labels: Invalid value: null.`

2. **Missing envsubst var** — the overlay references
   `image: ${STUDIO_IMAGE}@${STUDIO_IMAGE_DIGEST}` but `STUDIO_IMAGE_DIGEST` is
   not in `ENVSUBST_VARS` in `Taskfile.yml` (workspace:deploy / fleet:deploy
   blocks at lines 2527 / 2648). `envsubst` leaves the literal
   `${STUDIO_IMAGE_DIGEST}` in the rendered manifest, which is then rejected by
   the kubelet as an unparseable image reference.

`task feature:deploy ENV=mentolder` (and any fleet:deploy) fails on the
`studio-server` Deployment with the two errors above. T001002 has been
reverted from `awaiting_deploy` to `planning` until this is fixed.

## What

Convert `prod-fleet/mentolder/studio.yaml` from a `resources:` entry into a
`patches:` entry targeted at the base `studio-server` Deployment, so Kustomize
applies the field-level merge correctly. Register `STUDIO_IMAGE_DIGEST` in
both `ENVSUBST_VARS` blocks and in `environments/schema.yaml`, and set the
digest in `environments/mentolder.yaml` (mentolder brand) and
`environments/korczewski.yaml` (korczewski brand). Re-stage T001002 and
re-archive the `coaching-studio` openspec proposal.

## Kern-Nutzerflow (operator-facing, not end-user)

1. Patrick runs `task feature:deploy ENV=mentolder` — succeeds, no
   `studio-server` validation error, image is pinned by digest.
2. Patrick runs `task feature:deploy ENV=korczewski` — same, brand overlay
   is now deployable.
3. The `coaching-studio` openspec proposal is archived, T001002 returns to
   `awaiting_deploy`.

## Akzeptanzkriterien

1. `kustomize build prod-fleet/mentolder | kubectl apply --dry-run=server -f -`
   succeeds with no `studio-server` errors.
2. `kustomize build prod-fleet/mentolder` shows
   `image: ghcr.io/paddione/coaching-studio@sha256:<digest>` (no
   `${STUDIO_IMAGE_DIGEST}` literal).
3. `envsubst` in `workspace:deploy` / `fleet:deploy` does not leave an
   unsubstituted variable on the studio manifest.
4. `task openspec:archive -- coaching-studio` exits 0.
5. T001002 status returns to `awaiting_deploy` after both brands deploy.

## Edge Cases

- Studio manifest referenced from both `prod-fleet/mentolder/` and
  `prod-fleet/korczewski/` — same patch file works for both brands because
  the patch is target-anchored (Deployment `studio-server`).
- `STUDIO_IMAGE_DIGEST` is empty/missing in `environments/*.yaml` — kustomize
  build still succeeds but the rendered `image:` field is incomplete; the
  deploy step must validate digest presence.

## Fehlerfall-Behandlung

- If `STUDIO_IMAGE_DIGEST` is unset when `feature:deploy` runs, the deploy
  fails fast with a clear error pointing at `environments/<brand>.yaml`.
- If the brand overlay is missing the patches entry, kustomize exits
  non-zero and the deploy is aborted before any kubectl apply.

## Out of Scope

- Changing the studio-server image or runtime config (covered by T001002).
- Adding the korczewski brand overlay file (only the patch wiring — the
  actual file in `prod-fleet/korczewski/` is created as part of T001002
  deploy).

## Datei-Mapping (Grounding)

- `prod-fleet/mentolder/kustomization.yaml` — remove `studio.yaml` from
  `resources:`, add `patches:` block targeting `studio-server` Deployment
  with the partial overlay content.
- `prod-fleet/mentolder/studio.yaml` — keep as-is (partial overlay body), or
  rename to `studio-patch.yaml` for clarity.
- `Taskfile.yml:2527` (workspace:deploy `ENVSUBST_VARS` block) — append
  `\$STUDIO_IMAGE_DIGEST`.
- `Taskfile.yml:2648` (fleet:deploy `ENVSUBST_VARS` block) — same.
- `environments/schema.yaml` — add `STUDIO_IMAGE_DIGEST` under
  `studio:` section as a required string.
- `environments/mentolder.yaml` — set `studio.imageDigest: sha256:<digest>`
  (or env-var equivalent).
- `environments/korczewski.yaml` — same.

_Ticket: T001009_
