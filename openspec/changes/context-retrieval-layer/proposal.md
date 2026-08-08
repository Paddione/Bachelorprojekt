# Proposal: context-retrieval-layer

## Why

Der Kontexttransfer zwischen Orchestrator und Subagenten läuft als Volltext-Dump nach
Regelfilter. `plan-context.sh` (186 Z.), `task-context.sh` (231 Z.), `toolset-context.sh`
(133 Z.) und `openspec-context.sh` (99 Z.) rendern alles, was per Rolle oder Pfad-Präfix
zugeordnet ist — nicht das, was zur konkreten Aufgabe relevant ist. Ein Präfix-Match liefert
eine vollständige Spec, weil eine einzige darin erwähnte Datei berührt wurde. Der Umfang wächst
mit dem Repo, nicht mit dem Bedarf, und geht direkt vom Kontextbudget jedes Dispatches ab.

Die Gegenseite existiert bereits ungenutzt: `bge-mcp` (`bge_embed`/`bge_rerank`), der
pgvector-Store `knowledge.chunks` mit Collection `specs_plans`, und `scripts/openspec-embed.mjs`
als Write-Pfad. Es fehlt der Read-Pfad in die Agent-Prompts.

Zusätzlich widersprechen sich Spec und Datenbank: `migrations/20260717-drop-unused-indexes.sql`
hat `knowledge.chunks_embedding_hnsw` als „unused index" gedroppt, während
`openspec/specs/openspec-pgvector.md` weiterhin HNSW `vector_cosine_ops` zusichert. Der Drop war
retrospektiv korrekt — ein Vektor-Index erscheint zwangsläufig unbenutzt, solange niemand
semantisch sucht — und wird prospektiv zum Blocker, sobald jeder Agent-Dispatch über diesen Pfad
läuft.

## What

Eine Retrieval-Schicht `scripts/context-retrieve.mjs` als reine Funktion von (Aufgabentext,
Rolle, Budget) auf einen budgetierten, gerankten, herkunfts-markierten Kontextblock:

- **Ein gebündelter Aufruf pro Dispatch** statt einer pro Kanal. Der Cross-Encoder-Rerank ist der
  einzige echte GPU-Kostenpunkt zur Query-Zeit und skaliert linear mit der Kandidatenzahl.
- **Query ist der Aufgabentext** des Subagenten; Rolle, Domäne und Status wirken als harte
  Metadaten-Prädikate in der SQL-Filterung statt als Text im Query-String.
- **Herkunfts-Marker** `mode=retrieval|rulefilter|truncated` samt Klartext-Hinweis im Block,
  wenn der Kontext unvollständig ist — ein leeres Retrieval-Ergebnis darf nicht wie „nichts
  Relevantes vorhanden" aussehen.
- **Pinned-Set ausserhalb des Token-Budgets** für Guardrails, weil Relevanz-Ranking und
  Sicherheitsrelevanz unkorreliert sind.
- **Wiederherstellung des HNSW-Index** als Migration, verifiziert gegen `pg_indexes`.

Nicht Teil dieses Changes: Korpus-Erweiterung (S2), Umstellung der vier Kanäle (S3), flüchtige
Korpora wie `intel.json` (S4). S1 wird gegen den heutigen `specs_plans`-Korpus gebaut; produktive
Aufrufer bekommt die Schicht erst in S3.

Design und Begründung der Einzelentscheidungen: `design.md`.

_Ticket: T002658_
