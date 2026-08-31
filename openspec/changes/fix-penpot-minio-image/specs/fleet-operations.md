# Delta Spec: fleet-operations (fix-penpot-minio-image)

## Purpose

Der Penpot-Objektspeicher muss aus einem tatsächlich veröffentlichten Container-Image
starten, damit der gemeinsame Designdienst nicht dauerhaft im Init-Zustand blockiert.

## ADDED Requirements

### Requirement: Penpot object storage uses an available release image

The Penpot deployment SHALL reference an official MinIO release tag that is available for
the fleet cluster architecture and SHALL NOT reference the unavailable
`RELEASE.2024-11-22T13-35-48Z` tag.

#### Scenario: Penpot starts after Flux reconciliation

- **GIVEN** the Penpot manifests have been rendered for the mentolder fleet environment
- **WHEN** Flux applies the `penminio` Deployment
- **THEN** Kubernetes can pull the configured MinIO image
- **AND** the `penminio` Pod becomes Ready
- **AND** the Penpot Pod advances beyond the `wait-for-minio` init container

