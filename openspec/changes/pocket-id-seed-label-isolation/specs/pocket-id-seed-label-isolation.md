## ADDED Requirements

### Requirement: Client-seed job pod label is isolated from the pocket-id service selector

The Pod template of the `pocket-id-client-seed` Job (`k3d/pocket-id-client-seed.yaml`,
`spec.template.metadata.labels`) SHALL NOT match the selector of the `pocket-id`
Service (`k3d/pocket-id.yaml`, `spec.selector`). The Pod-template `app` label SHALL be
`pocket-id-client-seed`. The Job-object-level `metadata.labels` MAY keep
`app: pocket-id`, because Job objects are never Service endpoints.

#### Scenario: Seed pod is not selected as a service endpoint

- **GIVEN** the Service `pocket-id` selects on `app: pocket-id`
- **WHEN** the `pocket-id-client-seed` Job renders its Pod template with
  `spec.template.metadata.labels.app = pocket-id-client-seed`
- **THEN** no Seed-Job pod matches the Service selector
- **AND** the `pocket-id` Service endpoints contain only Deployment pods

#### Scenario: Structural guard fails on regression

- **GIVEN** `tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats` exists
- **WHEN** someone sets the Pod-template `app` label back to the Service selector value
- **THEN** the guard test fails and names the colliding label value
