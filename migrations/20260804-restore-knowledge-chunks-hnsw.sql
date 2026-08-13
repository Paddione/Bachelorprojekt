-- T002658: Restore knowledge.chunks_embedding_hnsw.
--
-- Der Index wurde von migrations/20260717-drop-unused-indexes.sql (Zeile 116) als
-- "unused" gedroppt. Der Drop war damals korrekt — ein Vektor-Index erscheint in
-- pg_stat_user_indexes zwangslaeufig unbenutzt, solange niemand semantisch sucht —
-- und wird prospektiv zum Blocker, sobald jeder Agent-Dispatch ueber die
-- Retrieval-Schicht (scripts/context-retrieve.mjs, S1 von T002658) laeuft.
-- Ohne HNSW ist jede Vektorsuche ein Sequential Scan; openspec/specs/openspec-pgvector.md
-- sichert den Index seit dem Drop faelschlich zu. Dieser Kommentarkopf hält eine spaetere
-- Unused-Index-Aufraeumung davon ab, denselben Fehler aus demselben Grund zu wiederholen.
--
-- Bewusst OHNE CREATE INDEX CONCURRENTLY: der Migrationslaeufer
-- (scripts/migrate-factory.mjs, task factory:migrate) klammer jede Datei in
-- BEGIN/COMMIT, und CONCURRENTLY laeuft nicht innerhalb einer Transaktion
-- ("cannot run inside a transaction block"). Auf der kleinen knowledge.chunks-Tabelle
-- ist der Table-Lock des einfachen Builds unkritisch.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON knowledge.chunks USING hnsw (embedding vector_cosine_ops);
