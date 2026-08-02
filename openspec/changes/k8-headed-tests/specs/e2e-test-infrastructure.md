# Spec Delta: e2e-test-infrastructure

## ADDED Requirements

### Requirement: Agentic headed Playwright run (REQ-k8-01)

A headed Playwright stage MUST exercise the live deployed application in a real
browser, so defects that only surface after rendering are caught.

#### Scenario: Headed run against the deployed application

- **GIVEN** an implementation has been deployed to the fleet cluster
- **WHEN** the agent starts a headed test run
- **THEN** the live application is exercised in a real Chrome browser

### Requirement: Not a merge gate (REQ-k8-02)

The headed stage MUST stay out of the required CI path, because it depends on a
live deployment and would otherwise block merges on environment availability.

#### Scenario: PR merge is unaffected by the headed stage

- **GIVEN** the K8 headed test exists
- **WHEN** a pull request is opened or merged
- **THEN** the K8 test is NOT executed as a merge gate

### Requirement: Integration into the dev-flow-e2e skill (REQ-k8-03)

The `dev-flow-e2e` skill MUST be able to invoke the headed stage as an optional
step after implementation is complete.

#### Scenario: Skill offers the headed stage

- **GIVEN** the `dev-flow-e2e` skill is invoked
- **WHEN** the implementation step is complete
- **THEN** the skill can run the K8 headed test as an optional stage

### Requirement: Optional vision-assisted verification (REQ-k8-04)

Where visual elements must be judged, the agent MAY delegate screenshots to the
mmproj vision server rather than asserting on the DOM alone.

#### Scenario: Screenshot is validated by the vision server

- **GIVEN** the mmproj vision server is running on port 8094
- **WHEN** the agent needs to verify a visual element
- **THEN** it can send a screenshot to the vision server and validate the answer
