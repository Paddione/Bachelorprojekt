## MODIFIED Requirements

### Requirement: SF-TEST fixtures are cleaned up in teardown regardless of test outcome

Factory tests that require a dispatch-visible ticket SHALL use a fixture helper
that durably registers the created ticket for guarded teardown before any
fallible command or assertion. Tests SHALL NOT temporarily reclassify an
`SF-TEST` fixture as production data.

#### Scenario: Scheduling assertion aborts before test completion

- **GIVEN** a factory scheduling test needs an `is_test_data=false` ticket
- **WHEN** the scheduling command fails, times out, or an assertion aborts the test
- **THEN** the ticket is already registered for guarded teardown
- **AND** no `SF-TEST` row remains dispatchable in the factory queue
