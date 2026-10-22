"""FK-Index-Abdeckung fuer customers-Children (F1 aus dem Dev-DB-Audit).

Der Audit-Detector meldete 17 fehlende volle B-Tree-Abdeckungen; selektiert
wurden die 6 mit belegtem Parent-Delete-Pfad (`DELETE FROM customers` in
`components/website/src/lib/tickets/purge-fn.ts:517` u. a.). Je ein B-Tree
auf der FK-Spalte, Konvention aus `20260717_add_missing_fk_indexes.sql`
(`to_regclass`-Guard + `CREATE INDEX IF NOT EXISTS`).

RED: Migrationsdatei fehlt oder unvollständig. GREEN: alle 6 Indizes
deklariert.
"""

from pathlib import Path

MIGRATION = "components/website/src/db/migrations/20261022_fk_indexes_customer_children.sql"

ERWARTETE_INDEXE = [
    "idx_chat_message_reads_customer_id",
    "idx_chat_messages_sender_customer_id",
    "idx_chat_room_members_customer_id",
    "idx_chat_rooms_direct_customer_id",
    "idx_messages_sender_customer_id",
    "idx_message_threads_customer_id",
]


def test_fk_index_migration_vollstaendig(repo_root: Path):
    text = (repo_root / MIGRATION).read_text()
    fehlend = [name for name in ERWARTETE_INDEXE if name not in text]
    assert not fehlend, f"FK-Index-Migration unvollständig, fehlt: {fehlend}"
