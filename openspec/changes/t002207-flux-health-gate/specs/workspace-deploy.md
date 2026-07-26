## ADDED Requirements

### Requirement: One-shot bootstrap Jobs never gate a brand's application stack

The system SHALL render every one-shot bootstrap/seed Job of a brand into a dedicated
Flux Kustomization (`flux-<brand>-jobs`) that is separate from the brand's application
Kustomization (`flux-<brand>`), and that Kustomization SHALL declare
`dependsOn: [flux-<brand>]`. A failure of a bootstrap Job — whether at server-side
dry-run, at apply, or at health-check time — SHALL NOT prevent the brand's application
Kustomization from reaching `Ready=True` and SHALL NOT prevent it from applying new
revisions.

#### Scenario: A seed Job fails and the application stack still reconciles

- **GIVEN** the fleet cluster reconciles `flux-mentolder` and `flux-mentolder-jobs`
- **AND** the rendered `pocket-id-client-seed` Job is invalid or fails at runtime
- **WHEN** a new OCI artifact revision is pushed
- **THEN** `flux-mentolder` applies the new revision and reports `Ready=True`
- **AND** only `flux-mentolder-jobs` reports `Ready=False`
- **AND** `flux-mentolder.status.lastAppliedRevision` equals the new artifact digest

#### Scenario: No one-shot Job remains in the brand application Kustomization

- **GIVEN** the rendered artifact tree produced by `scripts/flux-render-artifact.sh`
- **WHEN** the rendered `mentolder/` and `korczewski/` component trees are inspected
- **THEN** they contain no object of `kind: Job`
- **AND** every such Job appears in the corresponding `mentolder-jobs/` or
  `korczewski-jobs/` component tree instead

---

### Requirement: Brand Kustomizations declare explicit health checks instead of a blanket wait

The system SHALL NOT use a bare `wait: true` on the brand application Kustomizations.
Each brand Kustomization SHALL instead declare an explicit `healthChecks` list naming
only the load-bearing workloads whose readiness genuinely defines a successful brand
deployment. Workloads outside that list SHALL be able to be unhealthy without turning
the Kustomization `Ready=False`.

#### Scenario: A non-critical workload crash-loops without gating the Kustomization

- **GIVEN** `flux-korczewski` declares `healthChecks` for `shared-db`, `pocket-id` and
  the ingress-path Deployment, and does not set `wait: true`
- **WHEN** a workload that is not in the `healthChecks` list enters CrashLoopBackOff
- **THEN** `flux-korczewski` still reports `Ready=True` after a successful apply
- **AND** every downstream Kustomization with `dependsOn: [flux-korczewski]` continues
  to reconcile

#### Scenario: A load-bearing workload failure is still caught

- **GIVEN** `shared-db` is listed in the `healthChecks` of `flux-mentolder`
- **WHEN** the `shared-db` workload fails to become Ready within `spec.timeout`
- **THEN** `flux-mentolder` reports `Ready=False` with a health-check failure message
  naming `shared-db`

---

### Requirement: Immutable-field conflicts self-heal instead of freezing reconciliation

The system SHALL configure the Kustomization that owns one-shot Jobs with
`spec.force: true`, so that a resource rejected because of an immutable field is
recreated on the next reconciliation rather than blocking indefinitely.

#### Scenario: An immutable Job template change is recovered automatically

- **GIVEN** a `pocket-id-client-seed` Job exists in the cluster with a `spec.template`
  that differs from the rendered manifest in an immutable field
- **WHEN** `flux-<brand>-jobs` reconciles the new revision
- **THEN** the existing Job is deleted and recreated from the rendered manifest
- **AND** the Kustomization does not report a permanent `Invalid: field is immutable`
  reconciliation failure

---

### Requirement: The render pipeline rejects manifests that cannot be applied

The system SHALL validate the rendered artifact tree before it is pushed to
`ghcr.io/paddione/fleet-manifests`, and SHALL fail the render with a non-zero exit code
when any rendered object would be rejected by the Kubernetes API. Invalid manifests
SHALL NOT reach the OCI artifact.

#### Scenario: An invalid rendered object aborts the artifact push

- **GIVEN** a rendered component tree containing an object that fails schema validation
- **WHEN** `task flux:render` runs in CI
- **THEN** the render exits non-zero and names the offending object's kind, namespace
  and name
- **AND** the `flux push artifact` step does not execute

#### Scenario: A clean tree renders and pushes as before

- **GIVEN** every rendered object passes validation
- **WHEN** `task flux:render` runs in CI
- **THEN** the render exits zero and the artifact push proceeds unchanged

---

### Requirement: A stalled Kustomization becomes visible before it freezes deploys for days

The system SHALL surface any Flux Kustomization that has been `Ready=False`, or whose
`lastAppliedRevision` has lagged the source artifact revision, beyond a defined
threshold — rather than relying on a human running `kubectl get kustomization`.

#### Scenario: A brand Kustomization stuck beyond the threshold is reported

- **GIVEN** `flux-korczewski` has been `Ready=False` for longer than the configured
  threshold
- **WHEN** the stalled-reconciliation check runs
- **THEN** it reports `flux-korczewski` as stalled, including the failure reason and
  the duration
- **AND** it exits non-zero so an automated caller can act on it

#### Scenario: All Kustomizations healthy

- **GIVEN** every Flux Kustomization in `flux-system` is `Ready=True` and its
  `lastAppliedRevision` matches the source revision
- **WHEN** the stalled-reconciliation check runs
- **THEN** it exits zero and reports no stalled Kustomization
