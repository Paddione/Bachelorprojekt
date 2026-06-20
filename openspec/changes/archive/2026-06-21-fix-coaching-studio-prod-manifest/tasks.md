# Tasks: fix-coaching-studio-prod-manifest

> _Ticket: T001009_
> _Proposal: openspec/changes/fix-coaching-studio-prod-manifest/proposal.md_

## Phase 1 — Convert studio overlay to a patch

- [ ] In `prod-fleet/mentolder/kustomization.yaml`, remove `- studio.yaml`
      from the `resources:` block.
- [ ] Add a `patches:` entry targeting the base `studio-server` Deployment:
      ```yaml
      - path: studio.yaml
        target:
          group: apps
          version: v1
          kind: Deployment
          name: studio-server
      ```
- [ ] Verify `prod-fleet/mentolder/studio.yaml` is a valid patch body (only
      fields being overridden: `spec.template.spec.nodeSelector`,
      `spec.template.spec.affinity`, `spec.template.spec.containers[0].image`).
- [ ] Add the same patches entry to `prod-fleet/korczewski/kustomization.yaml`
      once the korczewski overlay exists; for now the mentor-der overlay is
      the only one to change.

## Phase 2 — Register STUDIO_IMAGE_DIGEST in envsubst

- [ ] In `Taskfile.yml` line 2527 (`workspace:deploy` block), append
      `\$STUDIO_IMAGE_DIGEST` to the `ENVSUBST_VARS` accumulator.
- [ ] In `Taskfile.yml` line 2648 (`fleet:deploy` block), same.
- [ ] In `environments/schema.yaml`, add `STUDIO_IMAGE_DIGEST` as a required
      `string` under the `studio:` section.
- [ ] In `environments/mentolder.yaml`, set
      `studio.imageDigest: ${STUDIO_IMAGE_DIGEST}` (or the equivalent
      env-var-binding form used by other imageDigest entries).
- [ ] In `environments/korczewski.yaml`, same.

## Phase 3 — Validate

- [ ] `task workspace:validate` — kustomize build must exit 0 with no
      `studio-server` errors.
- [ ] `task feature:deploy ENV=mentolder --dry-run` (or whatever the
      dry-run equivalent is — confirm with `task --list`) — must succeed.
- [ ] Confirm `kustomize build prod-fleet/mentolder` does NOT contain the
      literal string `${STUDIO_IMAGE_DIGEST}`.

## Phase 4 — Re-stage and re-archive

- [ ] `task openspec:archive -- coaching-studio` (T001002's proposal).
- [ ] Set T001002 status back to `awaiting_deploy` in `tickets.tickets`
      (DB write: `UPDATE tickets.tickets SET status='awaiting_deploy'
      WHERE external_id='T001002';`).
- [ ] Set T001009 status to `in_progress` while implementing, then
      `done` + `fixed` after the deploy gate passes.
- [ ] Once both `feature:deploy` runs succeed, mark T001009 `done`.

## Plan-Lint

- [ ] `bash scripts/openspec.sh validate fix-coaching-studio-prod-manifest`
      exits 0.
- [ ] No hard fails in the plan output.
