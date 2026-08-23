## ADDED Requirements

### Requirement: Bewusste korczewski-Brand-Pause und hängende Admin-Jobs sind nachvollziehbar

The operational documentation SHALL record that the korczewski brand remains
intentionally paused, that the Flux Kustomizations for the brand and its jobs
remain suspended, and that the GitLab OCI mirror is outside the scope of this
change. The operational cleanup SHALL suspend only the `admin-actions-cleanup`
and `admin-actions-prune` CronJobs in the `workspace-korczewski` namespace and
remove only verified, active Job objects owned by those CronJobs.

#### Scenario: Brand-Pause bleibt unverändert

- **GIVEN** the korczewski brand is intentionally paused
- **WHEN** the change is applied
- **THEN** `flux-korczewski`, `flux-korczewski-jobs`, and
  `flux-website-korczewski` remain suspended
- **AND** `fleet-manifests-gitlab` is neither repaired nor removed
- **AND** the `admin-actions-cleanup` and `admin-actions-prune` CronJobs in
  `workspace-korczewski` are suspended during the pause

#### Scenario: Hängende Admin-Jobs werden gezielt bereinigt

- **GIVEN** the `workspace-korczewski` namespace contains active Jobs whose
  CronJob owners are `admin-actions-cleanup` or `admin-actions-prune`
- **WHEN** the cleanup procedure runs
- **THEN** it rechecks the namespace, owner, and active status before deletion
- **AND** only those verified Job objects are deleted
- **AND** both allowed CronJobs remain suspended after cleanup
- **AND** no Flux Kustomization, OCIRepository, or unrelated Job is changed
