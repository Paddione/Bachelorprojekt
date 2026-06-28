# ci-cd — Delta Spec (astro-check-quality)

## ADDED Requirements

### Requirement: Astro TypeScript Check Job

**ID:** REQ-CICD-ASTRO-001
**Status:** Required

Ein neuer GitHub-Actions-Job `astro-check` prüft bei jedem PR die TypeScript-Typen des Website-Projekts via `astro check`.

**Scenarios:**

```
GIVEN a pull request to main
WHEN the CI pipeline runs
THEN a job named "Astro TypeScript Check" appears in the PR status checks
AND the job runs `pnpm exec astro check` in the `website/` directory
AND a job failure is visible but does NOT block auto-merge (not a required check)
```

```
GIVEN the astro-check job has been stable for 2 weeks
WHEN the job is promoted to a required check
THEN auto-merge waits for "Astro TypeScript Check" to pass
```
