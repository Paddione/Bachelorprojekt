## ADDED Requirements

### Requirement: Base Ingresses Deleted in the Prod Overlay

The system SHALL delete every `k3d/`-base Ingress that a prod overlay replaces with its own
brand-domain variant, so that no two manifests contribute the same Ingress resource id after
variable substitution.

Rationale: the base and the overlay Ingress can carry the same `metadata.name` and still build
cleanly on a developer machine, because the overlay's `namespace: ${WORKSPACE_NAMESPACE}` stays
an unsubstituted literal and keeps the ids distinct. Flux applies `envsubst` before the build,
which collapses both onto the same id and fails the whole Kustomization — including every
unrelated resource in that brand.

#### Scenario: Penpot-Basis-Ingress wird im Prod-Overlay entfernt

- **GIVEN** `k3d/penpot-ingress.yaml` definiert ein Ingress `workspace-ingress-penpot` mit Host `design.localhost`
- **AND** `prod-fleet/<brand>/penpot-ingress-route.yaml` definiert ein Ingress gleichen Namens mit Host `design.${PROD_DOMAIN}`
- **WHEN** `prod/kustomization.yaml` einen `$patch: delete`-Eintrag für `workspace-ingress-penpot` enthält
- **THEN** enthält der mit ersetzten Variablen gerenderte Prod-Stand genau ein Ingress `workspace-ingress-penpot`
- **AND** dieses Ingress trägt den Host `design.<PROD_DOMAIN>` und NICHT `design.localhost`

#### Scenario: Konflikt wird unter envsubst erkannt, nicht nur roh

- **GIVEN** ein Prod-Overlay, in dem Basis- und Overlay-Ingress denselben Namen tragen
- **WHEN** der Render mit ersetztem `${WORKSPACE_NAMESPACE}` ausgeführt wird
- **THEN** schlägt der Build mit `may not add resource with an already registered id` fehl, solange der `$patch: delete` fehlt
- **AND** derselbe Render ohne Variablenersetzung läuft fehlerfrei durch — ein roher Kustomize-Build ist daher kein Nachweis

### Requirement: Multi-Port Services Declare Port Names

The system SHALL assign a `name` to every port of a Service that exposes more than one port,
because the Kubernetes API rejects such Services otherwise and a single invalid Service fails
the entire Flux Kustomization it belongs to.

#### Scenario: penminio deklariert benannte Ports

- **GIVEN** der Service `penminio` in `k3d/penpot.yaml` exponiert die Ports 9000 und 9001
- **WHEN** die Manifeste server-seitig validiert werden
- **THEN** trägt jeder der beiden Ports ein nicht-leeres `name`-Feld
- **AND** die Validierung meldet keinen `spec.ports[*].name: Required value`-Fehler

### Requirement: Single Patches Block per Kustomization

The system SHALL declare at most one `patches:` key per `kustomization.yaml`, so that no patch
list is silently discarded by YAML key overriding.

#### Scenario: mentolder-Overlay wendet alle deklarierten Patches an

- **GIVEN** `prod-fleet/mentolder/kustomization.yaml` deklariert Patches für `bge-hosts-patch.yaml`, `studio-patch.yaml` und `brett-patch.yaml`
- **WHEN** die Datei geparst wird
- **THEN** existiert genau ein `patches:`-Schlüssel
- **AND** der gerenderte Stand zeigt die Wirkung aller drei Patches

### Requirement: Penpot Reachable Under the Brand Design Domain with OIDC

The system SHALL serve Penpot under `design.<PROD_DOMAIN>` behind TLS and SHALL gate access
through Pocket ID OIDC, so that the design service is never publicly reachable without
authentication.

#### Scenario: design.mentolder.de liefert Penpot statt Traefik-404

- **GIVEN** die Penpot-Manifeste sind ausgerollt und `flux-mentolder` meldet `READY=True`
- **WHEN** `https://design.mentolder.de/` abgerufen wird
- **THEN** antwortet der Penpot-Gateway und nicht Traefiks 404-Seite
- **AND** das ausgelieferte Zertifikat deckt `design.mentolder.de` ab

#### Scenario: Anmeldung läuft über Pocket ID

- **GIVEN** der `pocket-id-client-seed`-Job hat den Penpot-Client provisioniert
- **WHEN** ein nicht angemeldeter Nutzer die Penpot-Oberfläche aufruft und den OIDC-Login startet
- **THEN** leitet Penpot auf Pocket ID weiter und akzeptiert den Rücksprung auf `https://design.mentolder.de/api/external-auth`
- **AND** nach erfolgreicher Anmeldung existiert eine Penpot-Session für den Pocket-ID-Benutzer
