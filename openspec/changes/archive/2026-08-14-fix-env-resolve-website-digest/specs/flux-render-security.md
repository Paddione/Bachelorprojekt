## MODIFIED Requirements

### Requirement: Immutable Image References in Rendered Prod Overlays

#### Change

Die Requirement gilt unverändert mit einer Präzisierung: Die Digest-Werte, die
der Caller des Renderers bereitstellt (z.B. `WEBSITE_IMAGE_DIGEST` aus
`render-fleet-artifact.yml`), MÜSSEN unverändert in das gerenderte Artefakt
gelangen. `scripts/env-resolve.sh` MUSS Caller-gesetzte Variablen respektieren
und sie nicht mit Werten aus `environments/*.yaml` überschreiben. Der in
`environments/fleet-*.yaml` committete Placeholder (`sha256:1111…` für Website,
`sha256:2222…` für Brett) darf ausschließlich als Offline-Fallback wirken, wenn
der Caller KEINEN Digest gesetzt hat — er darf nie ein Caller-gesetztes,
echtes Digest ersetzen.

#### Scenario: Caller-gesetzter Website-Digest überlebt die Environment-Auflösung

- **GIVEN** `WEBSITE_IMAGE_DIGEST` ist im Caller auf einen echten sha256-Digest gesetzt
- **WHEN** `scripts/env-resolve.sh fleet-mentolder` gesourct wird
- **THEN** bleibt `WEBSITE_IMAGE_DIGEST` auf dem Caller-Wert
- **AND** der committete Placeholder `sha256:1111…` ersetzt ihn nicht

#### Scenario: Caller-gesetzter Digest erreicht das gerenderte Artefakt

- **GIVEN** `WEBSITE_IMAGE_DIGEST` ist im Caller auf einen echten sha256-Digest gesetzt
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** referenziert das Website-Deployment unter `<dir>/website-mentolder`
  genau diesen Digest
- **AND** kein `sha256:1111…`-Placeholder kommt in einer Datei unter `<dir>` vor

## ADDED Requirements

### Requirement: Placeholder-Digests erreichen nie ein Artefakt (fail-closed)

Das gerenderte Artefakt MUSS frei von den bekannten Placeholder-Digests sein:
`sha256:1111111111111111111111111111111111111111111111111111111111111111`
(Website) und `sha256:2222222222222222222222222222222222222222222222222222222222222222`
(Brett). Findet der Renderer einen dieser Werte in seiner Ausgabe, MUSS er mit
Exit-Status 1 abbrechen und die Fundstellen nennen — unabhängig davon, ob der
Placeholder aus `environments/*.yaml` oder vom Caller stammt. Ein Artefakt mit
Placeholder-Digest pinnt ein nicht existierendes Image und versetzt jede Brand
in ImagePullBackOff.

#### Scenario: Placeholder-Digest in der Render-Ausgabe bricht den Render ab

- **GIVEN** `WEBSITE_IMAGE_DIGEST` trägt den Placeholder-Wert `sha256:1111…`
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** bricht das Skript mit Exit-Status 1 ab
- **AND** die Fehlermeldung nennt die Fundstelle des Placeholders

#### Scenario: Gesunder CI-Render läuft unverändert durch

- **GIVEN** der Caller setzt echte Digests für Website und Brett
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** endet das Skript mit Exit-Status 0
- **AND** die Ausgabe unter `<dir>` enthält keinen der beiden Placeholder-Digests
