## MODIFIED Requirements

### Requirement: The FACTORY_CTX default is visible immediately on sourcing lib.sh

`scripts/factory/lib.sh` SHALL resolve `FACTORY_CTX` to `fleet` at top level while preserving an explicit override.

#### Scenario: Sourcing exposes a context

- **WHEN** a script sources `scripts/factory/lib.sh` without `FACTORY_CTX`
- **THEN** `FACTORY_CTX` is `fleet`
