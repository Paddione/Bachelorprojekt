## ADDED Requirements

### Requirement: Runtime health measurements fail closed

Runtime-backed health measurements SHALL return one integer when their complete positive
measurement basis is available and `-` when the source is unavailable, incomplete, empty where
data is expected, or malformed. They SHALL NOT translate inability to measure into zero.

#### Scenario: An unavailable runtime source is not reported healthy

- **GIVEN** a runtime health-goal source cannot be reached or parsed
- **WHEN** `scripts/health-goals-check.sh` evaluates the affected goal
- **THEN** the goal is reported as `n/a`
- **AND** no zero measurement is written to the health-goal values file

### Requirement: G-FLUX01 measures Flux reconciliation health

The health-goal suite SHALL define G-FLUX01 as the number of active production Flux resources
whose current Ready condition is not true or whose observed generation is stale, with target
zero.

#### Scenario: A stalled Kustomization violates G-FLUX01

- **GIVEN** the Fleet cluster contains an active production Flux Kustomization with `Ready=False`
- **WHEN** G-FLUX01 is measured
- **THEN** the reported count is at least one

#### Scenario: All expected Flux resources are reconciled

- **GIVEN** the expected Flux resource set is non-empty
- **AND** every selected resource is current and Ready
- **WHEN** G-FLUX01 is measured
- **THEN** the reported value is zero

### Requirement: G-OBS01 measures Prometheus scrape health

The health-goal suite SHALL define G-OBS01 as the number of selected active Prometheus scrape
targets whose `up` value is zero, with target zero. The measurement SHALL require a non-empty
selected target set.

#### Scenario: A configured target is down

- **GIVEN** Prometheus returns at least one selected `up == 0` series
- **WHEN** G-OBS01 is measured
- **THEN** each returned down target contributes one to the reported count

#### Scenario: Prometheus returns no selected target series

- **GIVEN** the Prometheus query succeeds but the selected target set is empty
- **WHEN** G-OBS01 is measured
- **THEN** the measurement returns `-` rather than zero

### Requirement: G-CAP01 measures persistent storage headroom

The health-goal suite SHALL define G-CAP01 as the number of mounted persistent volumes in the
production Brand namespaces with less than 20 percent free capacity, with target zero.

#### Scenario: A production volume has low free space

- **GIVEN** a mounted production PVC has valid available- and capacity-byte metrics
- **AND** its available capacity is below 20 percent
- **WHEN** G-CAP01 is measured
- **THEN** that volume contributes one to the reported count

#### Scenario: Volume metrics are absent

- **GIVEN** no valid capacity metric exists for any expected production PVC
- **WHEN** G-CAP01 is measured
- **THEN** the measurement returns `-` rather than zero

### Requirement: G-A11Y01 measures severe accessibility regressions

The health-goal suite SHALL define G-A11Y01 as the total number of axe violations with impact
`critical` or `serious` across the canonical public routes of both Brands, with target zero.

#### Scenario: A serious axe finding violates G-A11Y01

- **GIVEN** axe reports one serious violation on a canonical Brand route
- **WHEN** G-A11Y01 is measured
- **THEN** the reported value is at least one

#### Scenario: Browser execution fails

- **GIVEN** one Brand route cannot be audited because browser execution or navigation fails
- **WHEN** G-A11Y01 is measured
- **THEN** the measurement returns `-` and does not report the other routes as a complete result

### Requirement: G-SLO01 measures seven-day public endpoint availability

The health-goal suite SHALL define G-SLO01 from continuous Prometheus `probe_success` samples for
both public Brand health endpoints over a rolling seven-day window. It SHALL use the worse Brand
value and require at least 99.5 percent availability.

#### Scenario: One Brand falls below the availability objective

- **GIVEN** both expected Brand series have a complete seven-day measurement basis
- **AND** the lower Brand availability is below 99.5 percent
- **WHEN** G-SLO01 is measured
- **THEN** the goal is reported below target

#### Scenario: A Brand series is missing

- **GIVEN** only one of the two expected Brand probe series is available
- **WHEN** G-SLO01 is measured
- **THEN** the measurement returns `-` rather than treating the present Brand as complete

## ADDED Requirements

### Requirement: G-FE05 uses machine-readable Lighthouse results

G-FE05 SHALL measure both public Brands from Lighthouse JSON, use the lower integer performance
score, and require a score of at least 90. Console-output parsing SHALL NOT be the measurement
source.

#### Scenario: Both Lighthouse reports are valid

- **GIVEN** Lighthouse produces valid reports with performance scores for both Brands
- **WHEN** G-FE05 is measured
- **THEN** the lower score multiplied by 100 and converted to an integer is reported

#### Scenario: A Lighthouse report is incomplete

- **GIVEN** either Brand report lacks `categories.performance.score`
- **WHEN** G-FE05 is measured
- **THEN** the measurement returns `-` rather than a partial or zero score
