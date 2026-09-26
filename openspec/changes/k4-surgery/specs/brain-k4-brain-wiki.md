## REMOVED Requirements

### Requirement: Diagramm der Ingest-Pipeline (REQ-k4-01)

The pipeline it diagrams no longer exists.

### Requirement: Quellgruppen-Erhebung (REQ-k4-02)

The manifest it surveys is deleted.

### Requirement: Lesepfad-Integration (REQ-k4-03)

The integration question is settled by removal: no unconnected island remains.

### Requirement: Fail-closed Prompt-Obergrenze (REQ-k4-05)

`scripts/brain-ingest-transform.sh` is deleted.

### Requirement: Deterministische Eltern-MOC (REQ-k4-06)

`scripts/brain-ingest-moc.sh` is deleted.

### Requirement: Coverage-Gate im Ingest (REQ-k4-07)

`scripts/brain-ingest-coverage.sh` is deleted.

### Requirement: Brain-Retrieval als MCP-Server (REQ-k4-08)

Retired (E1): both implementations deleted, recall served by K1/K3.

### Requirement: Registrierung in der MCP-Registry (REQ-k4-09)

No brain server remains to distribute.

### Requirement: Brain MCP retrieval tools

`brain_search` and `brain_read` are retired with the server.

### Requirement: Brain-Ingest-Delivery-Integrität

No delivery runs anymore.

### Requirement: Dokumentierter Dry-Run-Einstieg ist ausführbar

`task brain:ingest:dry` and the script behind it are deleted.

## ADDED Requirements

### Requirement: K4-Spiegel ist entfernt (REQ-k4-10)

No ingest job SHALL write to the external Brain wiki anymore: the
ingest manifest, the pipeline scripts, the merge-hook workflow and the
ingest skill SHALL be absent, and recall over specs and docs SHALL be
served by the K1 embeddings and the K3 code graph instead.

#### Scenario: No ingest entry points remain

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** `scripts/brain-ingest.sh`, `scripts/brain/ingest-sources.yaml`
  and `.github/workflows/brain-merge-hook.yml` do not exist
- **AND** no Taskfile task name starts with `brain:ingest`

#### Scenario: No MCP recall path on the wiki remains

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** neither `scripts/brain-mcp-server.py` nor
  `scripts/brain-mcp-node/server.mjs` exists
- **AND** no MCP registry or harness config advertises `brain_search`
  or `brain_read`
