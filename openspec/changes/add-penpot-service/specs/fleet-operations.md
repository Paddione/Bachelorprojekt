# Delta Spec: fleet-operations (add-penpot-service)

## ADDED Requirements

### Requirement: Penpot-Domain in der Registry registriert

Penpot ist unter `design.<PROD_DOMAIN>` erreichbar. Der Hostname `PENPOT_DOMAIN`
MUSS zentral in `k3d/configmap-domains.yaml` (dev: `design.localhost`) definiert
und im Fleet-Overlay auf `design.<PROD_DOMAIN>` gesetzt werden. Hardcodierte
Hostnamen in Penpot-Manifesten sind verboten.

#### Scenario: Dev-Domain ist design.localhost

- **GIVEN** die Dev-Umgebung (k3d)
- **WHEN** `PENPOT_DOMAIN` aus `domain-config` gelesen wird
- **THEN** ist der Wert `design.localhost`

#### Scenario: Prod-Domain ist design.<PROD_DOMAIN>

- **GIVEN** ein Fleet-Overlay (mentolder oder korczewski)
- **WHEN** `PENPOT_DOMAIN` aus dem Domänen-Patch gelesen wird
- **THEN** ist der Wert `design.<PROD_DOMAIN>` (z.B. `design.mentolder.de`)

### Requirement: Penpot-Manifeste folgen dem Repo-Muster

Penpot wird als raw Kubernetes YAMLs bereitgestellt (kein Helm). Das Hauptmanifest
`k3d/penpot.yaml` enthält Penpot (3 Container in einem Pod) und MinIO (eigenes
Deployment mit PVC). Ingress-Routing steht in einer separaten Datei.

#### Scenario: Penpot-Hauptmanifest existiert

- **GIVEN** das Repository wird geprüft
- **WHEN** nach `k3d/penpot.yaml` gesucht wird
- **THEN** existiert die Datei mit einem Penpot-Deployment (Backend, Frontend, Gateway als Container) und einem MinIO-Deployment

#### Scenario: IngressRoute existiert

- **GIVEN** die IngressRoute-Regel für Penpot
- **WHEN** sie im Repository geprüft wird
- **THEN** referenziert sie `PENPOT_DOMAIN` aus der Domain-Registry und leitet auf `penpot-gateway:80`

### Requirement: Penpot-Datenbank auf shared-db

Penpot nutzt eine eigene PostgreSQL-Role `penpot` auf der shared-db. Die Role und
Datenbank werden vom `shared-db`-Init-Skript idempotent angelegt.

#### Scenario: Penpot-Role wird erstellt

- **GIVEN** der shared-db-Init-Job läuft
- **WHEN** die User-Liste durchgegangen wird
- **THEN** wird die Role `penpot` erstellt (falls nicht existent)
- **AND** die Datenbank `penpot` wird erstellt mit `penpot` als Owner
- **AND** das Passwort wird aus `PENPOT_DB_PASSWORD` syncen
