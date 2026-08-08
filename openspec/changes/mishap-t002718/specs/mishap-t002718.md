# Mishap T002718 Spec Delta

## ADDED Requirements

### Requirement: Coverage guard recommendations
The coverage guard MUST NOT recommend options that disable or bypass the guard.

#### Scenario: Remediation guidance
GIVEN a guard check fails
WHEN emitting error output
THEN the guard MUST suggest wiring into a test task without advocating silencing as the preferred choice.
