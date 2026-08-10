# mishap-t002718

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-t002718 ergänzen._

## Requirements

### Requirement: Coverage guard recommendations
The coverage guard MUST NOT recommend options that disable or bypass the guard.

#### Scenario: Remediation guidance
GIVEN a guard check fails
WHEN emitting error output
THEN the guard MUST suggest wiring into a test task without advocating silencing as the preferred choice.

<!-- merged from change delta mishap-t002718.md (b0f62c0fd932) -->