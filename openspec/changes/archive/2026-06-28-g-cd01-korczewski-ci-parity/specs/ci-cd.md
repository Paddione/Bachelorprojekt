## MODIFIED Requirements

### Requirement: Website-Auto-Deploy bei main-Push

The system SHALL automatically build a Docker image and deploy it to the fleet cluster
for both brands (mentolder, korczewski) whenever `website/**` changes reach `main`,
using three independent CI jobs: one shared build job and two parallel, independent brand deploy jobs.

#### Scenario: Website-Änderung löst Build und parallele Rollouts aus

- **GIVEN** ein Commit auf `main` ändert `website/src/pages/index.astro`
- **WHEN** der `build-website`-Workflow getriggert wird
- **THEN** startet zuerst der `build-image`-Job (baut Image mit `SHA_TAG` + `:latest`, pusht nach GHCR, exportiert `image` + `sha_tag` als Job-Outputs), danach laufen `deploy-mentolder` und `deploy-korczewski` parallel — je mit `kubectl set image` + `rollout status --timeout=120s`

#### Scenario: Deployment schlägt back bei Rollout-Timeout fehl

- **GIVEN** das neue Website-Image startet nicht innerhalb von 120 Sekunden in einem der Namespaces
- **WHEN** `kubectl rollout status deployment/website --timeout=120s` im betroffenen Deploy-Job läuft
- **THEN** gibt kubectl Exit-Code 1 zurück und nur der betroffene Deploy-Job schlägt fehl — der andere Brand-Deploy-Job ist davon nicht betroffen

#### Scenario: korczewski Deploy bleibt unabhängig von mentolder Fehler

- **GIVEN** der `deploy-mentolder`-Job schlägt fehl (z.B. Rollout-Timeout, Secret-Check-Fail)
- **WHEN** der Workflow-Status ermittelt wird
- **THEN** läuft der `deploy-korczewski`-Job weiter und berichtet seinen eigenen Status — er wird NICHT übersprungen

## REMOVED Requirements

### Requirement: build-website-korczewski.yml Deploy-Coverage

**Reason:** `build-website-korczewski.yml` wurde durch T001229 gelöscht und in `build-website.yml` konsolidiert. Die korczewski Deploy-Scenarios in dieser Requirement bezogen sich auf die standalone Workflow-Datei, die nicht mehr existiert. Die Abdeckung ist jetzt in "Website-Auto-Deploy bei main-Push" und "korczewski-deploy-parity" enthalten.

**Migration:** Tests in `tests/unit/website-ci-deploy.bats` wurden auf `build-website.yml` umgezeigt (T001229). Keine weitere Migration nötig.
