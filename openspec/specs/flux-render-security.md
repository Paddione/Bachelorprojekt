# flux-render-security

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu flux-render-security ergänzen._

## Requirements

### Requirement: Fail-Closed on Undefined Envsubst Variables

After substitution, the rendered output MUST be scanned for any remaining
`${VAR}` patterns. If any are found, the script MUST exit with status 1 and
list the undefined variables.

#### Scenario: Undefined variable causes build failure

```gherkin
GIVEN a kustomize overlay references ${UNDEFINED_VAR}
WHEN `scripts/flux-render-artifact.sh` runs
THEN the script exits with status 1
  AND the error message lists UNDEFINED_VAR as undefined
```

#### Scenario: All variables defined succeeds

```gherkin
GIVEN all referenced env vars are set in the environment
WHEN `scripts/flux-render-artifact.sh` runs
THEN the script exits with status 0
  AND the rendered output contains no literal ${VAR} patterns
```

<!-- merged from change delta flux-render-security.md (402efd65299c) -->