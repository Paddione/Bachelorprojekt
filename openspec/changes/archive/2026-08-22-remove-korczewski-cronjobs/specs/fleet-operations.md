## ADDED Requirements

### Requirement: No failing CronJobs in the korczewski overlay

The korczewski prod overlay SHALL exclude the `pvc-backup` and `error-log-retention` CronJobs from the rendered manifest, because their target Deployments (vaultwarden, nextcloud, website) are scaled to 0 replicas in korczewski and the jobs would fail on every run.

#### Scenario: Kustomize build renders no backup or retention CronJobs

- **GIVEN** the korczewski overlay with delete-patches for `pvc-backup` and `error-log-retention`
- **WHEN** the fleet manifest for korczewski is rendered (`kustomize build prod-korczewski`)
- **THEN** the output contains no `batch/v1 CronJob` named `pvc-backup` and none named `error-log-retention`
