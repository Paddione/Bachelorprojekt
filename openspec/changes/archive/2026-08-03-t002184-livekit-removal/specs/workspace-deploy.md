## ADDED Requirements

### Requirement: Post-Deploy-Schritte nach dem Kustomize-Apply

The system SHALL run the documented post-deploy steps after the Kustomize apply, and SHALL NOT
invoke any LiveKit DNS pinning task, because the LiveKit stack has been removed from both
brands (T002184).

#### Scenario: Deploy runs without a LiveKit DNS pin step

- **GIVEN** `ENV=mentolder` and the LiveKit removal from T002184 is merged
- **WHEN** `task workspace:deploy ENV=mentolder` finishes the Kustomize apply
- **THEN** no `livekit:dns-pin` task is invoked and the task does not exist in `Taskfile.yml`
- **AND** the deploy completes without requiring `LIVEKIT_DOMAIN`, `LIVEKIT_PIN_IP` or
  `STREAM_DOMAIN`

#### Scenario: envsubst variable lists contain no LiveKit or stream variables

- **GIVEN** the rendered manifests produced by `task workspace:deploy`
- **WHEN** the leftover-placeholder guard in `tests/spec/workspace-deploy.bats` scans them
- **THEN** neither `${LIVEKIT_DOMAIN}` nor `${STREAM_DOMAIN}` appears in the guard's regex
  or in the rendered output

### Requirement: LiveKit-Rückstände sind weder im Repo noch im Cluster erlaubt

The system SHALL keep the repository and both production namespaces free of LiveKit resources
and references, so that no unhealthy orphan workload can freeze a Flux Kustomization
(see T002207).

#### Scenario: Repository guard fails on any LiveKit reference

- **GIVEN** the guard test `G-LK01` in `tests/spec/workspace-deploy.bats`
- **WHEN** any tracked file outside the archive and history paths contains the string
  `livekit` (case-insensitive)
- **THEN** the test fails with the offending file paths listed

#### Scenario: Cluster is free of LiveKit workloads

- **GIVEN** the `fleet` cluster after the T002184 rollback
- **WHEN** `kubectl -n workspace get all,pvc,cm,ingress` and the same command for
  `workspace-korczewski` are executed
- **THEN** no Deployment, Service, PersistentVolumeClaim, ConfigMap or Ingress whose name
  contains `livekit` is returned
