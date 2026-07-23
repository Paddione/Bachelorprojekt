---
name: fix-flux-render-envsubst
description: Make flux-render-artifact.sh fail-closed on undefined envsubst variables to prevent secret exposure
---

# Capability: fix-flux-render-envsubst

## Purpose

Prevent secret exposure risk in `scripts/flux-render-artifact.sh` by making the
dynamic envsubst extraction fail-closed: undefined variables must cause a build
failure instead of silently passing through as literal `${VAR}` placeholders in
rendered manifests.

## ADDED Requirements

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
