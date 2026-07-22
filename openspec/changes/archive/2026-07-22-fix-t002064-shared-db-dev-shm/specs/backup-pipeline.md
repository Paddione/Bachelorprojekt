## ADDED Requirements

### Requirement: Memory-backed /dev/shm on shared-db for restorable dumps

The shared-db Deployment SHALL mount a Memory-backed emptyDir volume (`medium: Memory`, with an
explicit `sizeLimit`) at `/dev/shm` of the postgres container, so that PostgreSQL parallel
maintenance operations (notably pgvector HNSW index builds during `pg_restore`) are not capped by
the 64Mi container default. The sizeLimit SHALL stay below the smallest effective memory limit of
the postgres container across overlays (2Gi in `prod/patch-shared-db.yaml`).

#### Scenario: shared-db manifest declares the Memory-backed /dev/shm

- **GIVEN** `k3d/shared-db.yaml`
- **WHEN** `tests/spec/backup-pipeline.bats` parses the shared-db Deployment
- **THEN** a volume with `emptyDir.medium: Memory` and a non-empty `sizeLimit` exists
- **AND** the postgres container mounts that volume at `/dev/shm`

#### Scenario: Restore of the website dump completes on the deployed cluster

- **GIVEN** the fix is deployed and a current backup timestamp exists on backup-pvc
- **WHEN** `bash scripts/backup-restore.sh verify <timestamp> website --context fleet` runs
- **THEN** the verify job completes (including `CREATE INDEX chunks_embedding_hnsw`)
- **AND** the `recovery-verify-status` ConfigMap carries a fresh `last_success` stamp

### Requirement: Recovery-verify job cleans up its scratch database on failure

The recovery-verify job in `scripts/backup-restore-lib.sh` SHALL install an EXIT trap that drops
the scratch database (`<db>_verify_<pid>`) and removes the decrypted dump file even when
`pg_restore` aborts mid-run.

#### Scenario: Aborted verify leaves no scratch database behind

- **GIVEN** the verify job script block in `scripts/backup-restore-lib.sh`
- **WHEN** the block is inspected (or a verify run aborts)
- **THEN** a `trap cleanup EXIT` with `dropdb … --if-exists` guards the scratch DB
