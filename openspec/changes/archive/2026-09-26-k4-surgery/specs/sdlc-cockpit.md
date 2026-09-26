## REMOVED Requirements

### Requirement: Brain references are derived deterministically from source paths

`brain-links.ts` and the ingest rule it mirrors are deleted.

### Requirement: The website reaches Brain through an explicit ingress policy

The brain pod and its service wiring are removed.

## ADDED Requirements

### Requirement: Cockpit ohne Brain-Verweise

The cockpit SHALL NOT link or probe Brain wiki pages: no library
SHALL derive wiki slugs from source paths and no route SHALL probe a
brain service.

#### Scenario: No brain wiring in the cockpit

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** `components/website/src/lib/sdlc/brain-links.ts` does not exist
- **AND** no API route references `BRAIN_INTERNAL_URL`
