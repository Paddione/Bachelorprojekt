---
name: fix-t001949-container-cves
description: Container image CVE remediation via digest/tag refresh (G-SEC06)
---

# Capability: fix-t001949-container-cves

## Purpose

Reduce the number of CRITICAL CVEs across pinned container images referenced in `k3d/*.yaml`,
tracked as health goal G-SEC06, by bumping affected images to newer tags/digests and verifying
the fix with Trivy before merge.

## ADDED Requirements

### Requirement: Pinned Images Are Kept Free of Fixable CRITICAL CVEs Where an Upstream Fix Exists

Every pinned container image in `k3d/*.yaml` that has a newer upstream tag resolving a CRITICAL
CVE MUST be bumped to that tag/digest, verified via `trivy image --severity CRITICAL` before the
change is merged.

#### Scenario: A newer upstream tag resolves a CRITICAL CVE

```gherkin
GIVEN a pinned image has a CRITICAL CVE with a FixedVersion available in a newer upstream tag
WHEN the image pin in k3d/*.yaml is refreshed to that newer tag/digest
THEN `trivy image --severity CRITICAL` against the new digest reports fewer CRITICAL findings
  than the previous digest
```

#### Scenario: No newer upstream tag exists

```gherkin
GIVEN a pinned image is already on the newest available upstream tag
AND that tag still carries a CRITICAL CVE (e.g. vendored into the image, no fix released yet)
THEN the CVE is documented as upstream-blocked in `.claude/lib/goals.md` (G-SEC06) instead of
  being silently left unaddressed
```
