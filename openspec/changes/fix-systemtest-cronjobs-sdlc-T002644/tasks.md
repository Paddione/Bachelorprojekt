# Tasks: fix-systemtest-cronjobs-sdlc-T002644

- [x] **Update k3d CronJob Manifests**
  - Update `k3d/cronjob-systemtest-cleanup.yaml` to change `/api/admin/systemtest/*` endpoints to `/sdlc/api/systemtest/*`.
  - target_files: [`k3d/cronjob-systemtest-cleanup.yaml`]

- [x] **Verify Manifest Syntax & Kustomize Dry-Run**
  - Run `task workspace:validate` or `task test:manifests` to confirm valid Kubernetes manifests.
  - target_files: [`k3d/cronjob-systemtest-cleanup.yaml`]
