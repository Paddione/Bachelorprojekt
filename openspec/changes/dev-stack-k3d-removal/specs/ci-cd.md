## MODIFIED Requirements

### Requirement: Dev-Build-Safety — OOM-Schutz für Astro-Build
<!-- bats: dev-build-safety.bats -->

The system SHALL configure the website Dockerfile to set an explicit Node.js heap cap (`NODE_OPTIONS` with `--max-old-space-size`) of at least 2048 MB in the build stage only.

#### Scenario: Dockerfile setzt NODE_OPTIONS mit max-old-space-size *(BATS)*
- **GIVEN** `website/Dockerfile` ist vorhanden
- **WHEN** die Datei auf `NODE_OPTIONS.*max-old-space-size` durchsucht wird
- **THEN** findet `grep` die Zeile — kein implizites Node.js-Heap-Limit im Build-Stage

#### Scenario: Heap-Limit ist mindestens 2048 MB *(BATS)*
- **GIVEN** `website/Dockerfile` enthält einen `--max-old-space-size=<N>`-Eintrag
- **WHEN** der numerische Wert extrahiert wird
- **THEN** ist der Wert ≥ 2048 — kleiner Wert würde auf dem speicherbeschränkten Dev-Node zu SIGSEGV führen

#### Scenario: NODE_OPTIONS steht im Build-Stage vor dem Runtime-Stage *(BATS)*
- **GIVEN** `website/Dockerfile` hat einen Build-Stage-Marker und einen Runtime-Stage-Marker
- **WHEN** die Zeilennummern der Marker und der NODE_OPTIONS-Zeile verglichen werden
- **THEN** liegt `NODE_OPTIONS` vor dem Runtime-Stage — das Flag beeinflusst nur den Build, nicht den laufenden Container

