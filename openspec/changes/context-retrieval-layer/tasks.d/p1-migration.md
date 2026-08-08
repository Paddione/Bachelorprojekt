# p1 — HNSW-Index wiederherstellen

**Rolle:** impl · **Dateien:** `migrations/20260804-restore-knowledge-chunks-hnsw.sql`

Legt `chunks_embedding_hnsw` auf `knowledge.chunks.embedding` mit `vector_cosine_ops` neu an und
bringt die Datenbank mit der Zusage in `openspec/specs/openspec-pgvector.md` in Einklang.

`migrations/20260717-drop-unused-indexes.sql:116` hat den Index als „unused" gedroppt; keine
spätere Migration legt ihn neu an. Der Drop war damals korrekt — ein Vektor-Index erscheint in
`pg_stat_user_indexes` zwangsläufig unbenutzt, solange niemand semantisch sucht — und wird
prospektiv zum Blocker, sobald jeder Agent-Dispatch über diesen Pfad läuft.

## Schritte

1. Bestätige den Ist-Zustand gegen die laufende Datenbank, nicht gegen die Migrationsdatei:
   ```bash
   bash scripts/psql.sh -c "SELECT indexname FROM pg_indexes WHERE schemaname='knowledge' AND tablename='chunks';"
   ```
   Erwartet: `chunks_embedding_hnsw` fehlt in der Ausgabe.

2. Schreibe `migrations/20260804-restore-knowledge-chunks-hnsw.sql`:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS chunks_embedding_hnsw
     ON knowledge.chunks USING hnsw (embedding vector_cosine_ops);
   ```
   Mit einem Kommentarkopf, der auf `migrations/20260717-drop-unused-indexes.sql:116` und
   T002658 verweist. Damit findet eine spätere Unused-Index-Aufräumung den Kontext vor und
   entfernt den Index nicht erneut aus demselben Grund.

3. Wende die Migration an und verifiziere über `pg_indexes`, dass der Index existiert.

## Vorsicht

`CREATE INDEX CONCURRENTLY` läuft **nicht** innerhalb einer Transaktion. Klammert der
Migrationsläufer die Datei in `BEGIN`/`COMMIT`, muss die Anweisung entweder in eine eigene Datei
ohne Transaktionsklammer oder ohne `CONCURRENTLY` ausgeführt werden. Prüfe das Verhalten des
Läufers an einer bestehenden Migration, **bevor** du die Datei schreibst.

## Fertig wenn

`pg_indexes` liefert `chunks_embedding_hnsw` für Schema `knowledge`, Tabelle `chunks`.
Die Verifikation liest die Datenbank, nicht den Text der Migrationsdatei.
