# database

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Beschreibt den Integrationsvertrag der PostgreSQL-Datenbankschicht: eine einzelne
`pgvector/pgvector:0.8.0-pg16`-Instanz (`shared-db`) mit logisch getrennten Datenbanken
pro Service, die im Kubernetes-Namespace `workspace` (bzw. `workspace-korczewski`)
betrieben wird.

---

### Requirement: Service Isolation via Separate Databases

The system SHALL provide a dedicated PostgreSQL database and role per service (keycloak,
nextcloud, vaultwarden, website, videovault) so that no service can read or write another
service's data through normal DB connections.

#### Scenario: Service connects to own database only

- **GIVEN** the shared-db pod is running
- **WHEN** a service authenticates with its own role credentials (e.g. `website`/`WEBSITE_DB_PASSWORD`)
- **THEN** it is connected to its own database (`website`) and has no access to `keycloak`, `nextcloud`, or `vaultwarden` databases

#### Scenario: Idempotent initialization on re-deploy

- **GIVEN** shared-db is restarted or re-deployed on an existing cluster
- **WHEN** the `postStart` lifecycle hook runs
- **THEN** it creates missing roles and databases without failing on already-existing ones, and syncs all role passwords from current Kubernetes Secrets

---

### Requirement: Self-Healing Schema on Pod Restart

The system SHALL re-apply all role provisioning and database creation on every pod startup
via the `postStart` lifecycle hook, so that partial initdb failures (missing databases
after role creation) self-heal on the next pod restart without manual intervention.

#### Scenario: Partial initdb failure recovery

- **GIVEN** a fresh cluster where `docker-entrypoint-initdb.d` ran but failed after role creation before database creation
- **WHEN** the shared-db pod restarts
- **THEN** the `postStart` hook creates the missing databases and the website application connects successfully on the next request

#### Scenario: Schema ensure scripts run each startup

- **GIVEN** shared-db starts
- **WHEN** `postStart` completes
- **THEN** `ensure-knowledge-schema.sh`, `ensure-meetings-schema.sh`, and `ensure-bachelorprojekt-schema.sh` have been invoked (errors are tolerated via `|| true` to not block startup)

---

### Requirement: TLS Encryption for All Connections

The system SHALL enable TLS on the PostgreSQL server using a self-signed certificate
generated at each pod startup, so that all client connections benefit from in-transit
encryption within the cluster network.

#### Scenario: Server starts with TLS enabled

- **GIVEN** the `generate-tls-cert` initContainer ran successfully
- **WHEN** the postgres process starts
- **THEN** it is launched with `ssl=on`, `ssl_cert_file`, and `ssl_key_file` flags pointing to the emptyDir-mounted certificate

#### Scenario: Certificate regenerated on restart

- **GIVEN** the shared-db pod is restarted
- **WHEN** the initContainer completes
- **THEN** a fresh self-signed certificate is generated with CN `shared-db.workspace.svc.cluster.local` valid for 825 days, replacing the previous one

---

### Requirement: Lazy-Once Schema Initialization per Process

The website application SHALL initialize each schema exactly once per process lifetime
via the `ensureSchemaOnce` memoization pattern, so that concurrent requests do not race
on DDL statements and cause `tuple concurrently updated` errors on the PostgreSQL system
catalog.

#### Scenario: Concurrent first requests share one init promise

- **GIVEN** the website pod just started and `initTicketsSchema` has not been called yet
- **WHEN** multiple concurrent requests arrive that each try to call `initTicketsSchema`
- **THEN** only one DDL transaction is issued against PostgreSQL; all callers await the same cached promise

#### Scenario: Failed init is retried on next request

- **GIVEN** `initTicketsSchema` was called but the database was not yet ready (connection refused)
- **WHEN** the promise is rejected
- **THEN** the entry is removed from `_schemaInitOnce` so the next request can retry initialization

---

### Requirement: Eager Boot-Time Schema Migration

The website application SHALL trigger `initTicketsSchema` as a fire-and-forget at module
load time so that the `tickets` schema migrations apply during pod rollout rather than on
the first user request.

#### Scenario: Schema ready before first user hit

- **GIVEN** the website pod is starting up
- **WHEN** `website-db.ts` is imported
- **THEN** `initTicketsSchema()` is called immediately; if the DB is ready, the schema is prepared before any request is served; if not, it is retried on the first access

---

### Requirement: pgvector Extension for Semantic Search

The system SHALL provide the pgvector extension (`pgvector/pgvector:0.8.0-pg16`) so that
the knowledge base can store document chunk embeddings and perform cosine-similarity
(`<=>`) nearest-neighbour queries within the database.

#### Scenario: Knowledge chunk indexed and queried

- **GIVEN** a document chunk with an embedding vector is stored in `knowledge.chunks`
- **WHEN** the knowledge API receives a semantic search query
- **THEN** the database returns ranked results ordered by `embedding <=> $queryVector` (cosine distance), without leaving the PostgreSQL connection

#### Scenario: Mixed embedding model rejected

- **GIVEN** two collections that used different embedding models (e.g. `bge-m3` and `voyage-multilingual-2`)
- **WHEN** a query spans both collections in a single call
- **THEN** the application raises `MixedEmbeddingModelError` and does NOT issue the cross-space query to PostgreSQL

---

### Requirement: Encrypted Daily Backup with Integrity Verification

The system SHALL run a Kubernetes CronJob daily at 02:00 UTC that dumps all service
databases with `pg_dump -Fc`, encrypts each dump with AES-256-CBC (PBKDF2) using
`BACKUP_PASSPHRASE` from Kubernetes Secrets, verifies dump integrity before encrypting,
and uploads the encrypted archives to Filen cloud storage.

#### Scenario: Successful nightly backup run

- **GIVEN** shared-db is reachable and `BACKUP_PASSPHRASE` is set
- **WHEN** the `db-backup` CronJob runs
- **THEN** four encrypted `.dump.enc` files (keycloak, nextcloud, vaultwarden, website) are uploaded to Filen; plaintext dumps are deleted from disk before upload

#### Scenario: Corrupt or empty dump aborts backup

- **GIVEN** `pg_dump` produces output smaller than 200 bytes or missing the `PGDMP` magic header
- **WHEN** the backup script validates the dump file
- **THEN** the job exits with a non-zero code and no encrypted file is created for that database, marking the CronJob run as Failed

---

### Requirement: Per-Brand Database Isolation in Fleet Cluster

The system SHALL provide separate `shared-db` instances per brand namespace
(`workspace` for mentolder, `workspace-korczewski` for korczewski) so that each brand's
application data is contained within its own namespace and cross-namespace DB access is
not possible from normal pod networking.

#### Scenario: Korczewski website writes to korczewski namespace DB

- **GIVEN** the korczewski website pod runs in `workspace-korczewski`
- **WHEN** it resolves `shared-db.workspace-korczewski.svc.cluster.local`
- **THEN** it connects to the korczewski-local shared-db, not to the mentolder `workspace` shared-db (which would be ECONNREFUSED across namespaces)

#### Scenario: Backup-read grants cover all schemas

- **GIVEN** `pg_dump -U website -d website` is invoked during backup
- **WHEN** multiple schemas (`arena`, `audit`, `platform`, `knowledge`, `tickets`) exist in the website database owned by different roles
- **THEN** the `website` role has been granted `SELECT` on all tables in all listed schemas via `GRANT SELECT ON ALL TABLES IN SCHEMA`, and the dump completes without `permission denied` errors
