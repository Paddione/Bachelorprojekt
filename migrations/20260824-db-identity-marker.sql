-- T015168: DB-Identity-Marker der SSOT. Der Ticket-Write-Pfad probt diese Zeile
-- vor jedem Zugriff (_assert_db_identity in scripts/vda/ticket/_ticket-core.sh)
-- und bricht fail-closed ab, wenn der Marker fehlt oder abweicht — Schutz vor
-- Ghost-shared-db-Instanzen hinter identischem Context/Service.
--
-- Rollback:
-- DROP TABLE IF EXISTS tickets.db_identity;

CREATE TABLE IF NOT EXISTS tickets.db_identity (
  identity   UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tickets.db_identity (identity)
SELECT '9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00'
WHERE NOT EXISTS (SELECT 1 FROM tickets.db_identity);
