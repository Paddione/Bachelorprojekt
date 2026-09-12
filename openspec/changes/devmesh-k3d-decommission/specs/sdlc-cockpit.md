## RENAMED Requirements

### Requirement: Dev-Deployment — SDLC-Console auf mentolder-dev-Cluster

**Renamed-to:** Dev-Deployment — SDLC-Console auf dem devmesh-Cluster

## MODIFIED Requirements

### Requirement: Dev-Deployment — SDLC-Console auf dem devmesh-Cluster

The repository SHALL provide `task devmesh:deploy` followed by `task sdlc:sdlc:up` for the development cockpit. No SDLC task SHALL create a cluster.

#### Scenario: Cluster target is documented

- **WHEN** the deployment documentation is consulted
- **THEN** it names `devmesh` and the deployment path
