# Delta Spec: fleet-operations (wsl-exit-internal-endpoints)

## ADDED Requirements

### Requirement: Interne SDLC-Dienste sind ohne port-forward konsumierbar

bge-embed, bge-rerank und shared-db MÜSSEN über stabile interne Endpoints aus
dem wg-Mesh erreichbar sein, sodass MCPs und Agenten nicht auf
`kubectl port-forward` angewiesen sind.

#### Scenario: MCP embeddet ohne Cluster-Zugang

- **GIVEN** ein Agent läuft außerhalb des Clusters (Windows-Desktop)
- **WHEN** er `BGE_EMBED_HOST` über wg anspricht
- **THEN** antwortet der bge-embed-Dienst ohne vorheriges kubectl port-forward

### Requirement: Der Datenbank-Endpoint ist fail-closed

Der externe Weg zu shared-db DÜRFEN nur Clients aus dem wg-Mesh/fleet-intern
nehmen; Port 5432 MUSS von öffentlichen Entrypoints aus unerreichbar bleiben.

#### Scenario: Portscan aus dem Internet

- **GIVEN** die neuen DB-Routen sind deployed
- **WHEN** ein Scan die öffentlichen Traefik-Entrypoints auf 5432 prüft
- **THEN** ist der Port geschlossen (nur wg/interner Eintrag existiert)

### Requirement: Hostnamen bleiben zentral registriert

Neue Endpoint-Manifeste MÜSSEN ihre Hostnamen aus der Domain-Registry
(`k3d/configmap-domains.yaml` + Fleet-Overlay) beziehen; hardcodierte
Hostnamen in Manifesten sind verboten.

#### Scenario: Neues Endpoint-Manifest wird geprüft

- **GIVEN** ein IngressRoute/TCP-Manifest für bge oder shared-db
- **WHEN** der BATS-Test läuft
- **THEN** referenziert das Manifest einen Registry-Key statt eines literalen
  Hostnamens
