# exclude-latest-images

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu exclude-latest-images ergänzen._

## Requirements

### Requirement: Deployment-Listen und -Anweisungen schließen :latest-Images aus

The system SHALL exclude `:latest` images from all deployment-related lists and instructions,
and SHALL standardize deployment instructions to favor specific version tags or digests, so
that deployments are deterministic and not subject to silently changing images.

#### Scenario: CLAUDE.md nennt keine :latest-Images in Deployment-Kontexten

- **GIVEN** die Deployment-Listen und -Anweisungen in `CLAUDE.md`
- **WHEN** sie auf `:latest`-Referenzen geprüft werden
- **THEN** enthält kein Deployment-bezogener Eintrag ein `:latest`-Tag
- **AND** die Anweisungen bevorzugen spezifische Version-Tags oder Digests

#### Scenario: Deployment-Anweisungen sind deterministisch

- **GIVEN** ein Operator folgt den Deployment-Anweisungen
- **WHEN** ein Image referenziert wird
- **THEN** ist das Image über einen spezifischen Tag oder Digest gepinnt
- **AND** die Umgebung ist damit nicht von stillen Image-Änderungen abhängig

<!-- merged from change delta exclude-latest-images.md (11f90ab7926b) -->