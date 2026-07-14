## ADDED Requirements

### Requirement: Website reaches Pocket-ID via FQDN

The website pods SHALL resolve `pocket-id` via the fully-qualified cluster DNS name
`<pocket-id-service>.<workspace-namespace>.svc.cluster.local`, not via the short service
name. The `POCKET_ID_URL` env var in the fleet overlay configs SHALL contain the FQDN.

#### Scenario: fleet-mentolder uses FQDN

- **GIVEN** the fleet-mentolder env file (`environments/fleet-mentolder.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value is `http://pocket-id.workspace.svc.cluster.local:1411`
- **AND** DNS resolution of `pocket-id.workspace.svc.cluster.local` succeeds from the `website` namespace

#### Scenario: fleet-korczewski uses FQDN

- **GIVEN** the fleet-korczewski env file (`environments/fleet-korczewski.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value is `http://pocket-id.workspace-korczewski.svc.cluster.local:1411`
- **AND** DNS resolution of `pocket-id.workspace-korczewski.svc.cluster.local` succeeds from the `website` namespace

### Requirement: Short name stays valid in dev

The dev environment SHALL continue to use the short service name `http://pocket-id:1411`
because both the website and pocket-id pods run in the same `workspace` namespace there.
No change to `environments/dev.yaml` is required.

#### Scenario: dev unchanged

- **GIVEN** the dev env file (`environments/dev.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value remains `http://pocket-id:1411` (short name, same namespace)

### Requirement: pocket-id.yaml comment is accurate

The comment in `k3d/pocket-id.yaml` that states "POCKET_ID_URL stays
http://pocket-id:1411 in both dev and prod" SHALL be corrected to reflect the FQDN
requirement for prod.

#### Scenario: Comment reflects actual behavior

- **GIVEN** a developer reads the pocket-id.yaml comment block
- **WHEN** they look at the POCKET_ID_URL documentation
- **THEN** the comment explains that dev uses the short name (same namespace) and prod uses the FQDN (cross-namespace)
