---
title: Bestehende Integritätsgrenzen reparieren
ticket_id: T901697
domains: [scripts-infra, tickets, knowledge, devflow]
status: proposed
plan_ref: .agents/plans/sdlc-integrity/tasks.md
---
# Design

## Verträge

F1: Der JSON-Key `relates` bleibt kompatibel; die Datenbankart ist `relates_to`. Symmetrische Relationen werden dedupliziert. `blocked_by` umfasst direkte `blocked_by`-Kanten und rückwärts gelesene `blocks`; dieselbe Ziel-ID erscheint einmal. Shell und Python implementieren denselben Vertrag.

F2: `upsertDocumentAndChunks(pool, args)` behält Ergebnis `{docId,reused}`. Ein dedizierter Client führt BEGIN, Upsert, Chunk-Ersatz und COMMIT aus; bei Fehlern ROLLBACK und release in finally. Der Unique-Upsert `(collection_id,source_uri)` hält die Dokument-Zeilensperre bis Commit, sodass gleichzeitige Ersetzungen desselben Dokuments nicht ineinander greifen. `chunks=null` darf neue Metadaten/Hash nicht still als Wiederverwendung ausgeben: tatsächlichen bisherigen Hash zuerst unter Sperre bestimmen, bei geändertem Inhalt ohne Chunks Fehler und Rollback. Keine nachträgliche Vergleichung mit dem bereits überschriebenen Hash.

Eine reine Zählerreparatur setzt kein neues `last_indexed_at`. Erfolgreicher realer Ingest darf die Indexzeit aktualisieren. Audit-Zahlen werden aus den tatsächlichen Zeilen gewonnen, auch für historische Collections. In diesem Fix erfolgt keine automatische Zähleränderung in der Live-DB.

F6: Ergänzende Batch-API `embedAllWithModel(texts,batch)` liefert `{embeddings,model}`; die bestehende `embedAll`-API bleibt als Vektor-Wrapper kompatibel. Bei BGE-Fehlern wird der vollständige Batch mit Voyage neu berechnet, kein gemischter Embedding-Raum. Alle Writer-Aufrufer übernehmen den tatsächlich verwendeten Modellnamen in `chunks.metadata.embedding_model`; dieses vorhandene JSON-Feld vermeidet eine breite Schema-Migration. Unbekannte alte Chunk-Herkunft wird nicht aus Dimension oder Collection-Default erfunden. BGE-Suche filtert Chunk-Modell `bge-m3` vor ORDER BY/LIMIT; nicht zuordenbare historische Vektoren bleiben ausgeschlossen und werden im Audit gezählt.

F2/F6: Standard-Knowledge-Suche schließt die historischen OpenSpec-Collections und OpenSpec-Quelldateien vor LIMIT aus. Ein expliziter historischer Diagnosepfad darf diese lesend untersuchen, aber nie als aktuelle Doktrin ausgeben. Ein Quell-Audit löst `file:`-URIs relativ zu explizitem Repository auf, verhindert Pfadausbruch, vergleicht tatsächliche Dateiexistenz und SHA256 und liefert current/changed/missing/unverifiable. Keine Nutzung von `last_indexed_at` als Ersatz für Quellfrische.

F5: Code liegt zentral im Dotfiles-Repo, Prozess-/Doktrinquelle liegt im explizit gewählten Bachelor-Repo. `DEVFLOW_REPO_ROOT`, `TOOLSET_HOME`, Registry-/Lock-Overrides haben Vorrang. Gemeinsam aufgelöste Konfiguration trennt diese Wurzeln; der Standort des MCP-Skripts darf nicht `/home/patrick/docs/...` als Prozessquelle erzeugen. Fehlende Quellen erzeugen ausdrückliche degraded-Ergebnisse.

Der aktuelle Hub bietet kein BGE-Tool, und dessen Manifest enthält ebenfalls den toten direkten Port. Keine Umstellung auf eine erfundene Hub-Route und keine zyklische Verbindung Devflow→Hub→Devflow. Bestehende BGE-STDIO/URL-Overrides bleiben erhalten. Wo ein vorhandener LLM-Proxy-Adapter dokumentiert Embeddings und Rerank anbietet, wird er per vorhandener Konfiguration verwendet; sonst lexical fallback für Werkzeuge und klare Embedding-Abwesenheit für semantische Suche. Modellmetadaten gelten auch dort.

`sync-db` muss ohne Cache, ohne PGURL, bei Import-/DB-/Constraintfehlern mit nonzero enden. Modulauflösung erfolgt aus dem konfigurierten Bachelor-Repo. Der Live-Constraint akzeptiert `code_graph` nicht: vor Änderungen validieren und mit handlungsfähiger Fehlermeldung abbrechen. Kein blindes neues Schema/Parallelstore. Keine Löschung vorhandener Dokumente bei fehlender oder unbewiesener Cache-Abdeckung; Delete-Loop in diesem Fix deaktivieren.

F3: Stage-Status, explizite Hold-Entscheidung, touched_files und Planreferenz bilden eine einzelne SQL-Transaktion. `--no-hold` setzt execution_released ausdrücklich true; `--hold` ausdrücklich false. Tick-Anforderung und fail-soft Embedding erfolgen nach Commit. Staging erzeugt keine scout/design-Abschlüsse. Ein Planabschluss darf nur die tatsächliche committed Planreferenz bezeugen und ersetzt keinen Ausführungsnachweis.

Die bestehende Eventtabelle hat `at`, `id`, `detail`, `driver`, aber keine Lauf-ID/Commit-Felder. Das Gate prüft zeitliche Reihenfolge anhand `(at,id)` und schließt synthetische `auto: stage-plan`-Events als Ausführungsbeweis aus. Es behauptet keine gemeinsame Lauf-/Commit-/Verify-Evidenz; JSON und Audit melden deren Status unknown. Keine globale Schema-Erfindung oder historische Backfill-Anleitung, die Belege synthetisch ergänzt.

F4/F7: Ein gemeinsamer lesender Audit erfasst Constraint-/Indexstatus, Inkonsistenzen, Collection-Zähler/Modell-/Quellfrische, Phasenlücken und GitHub-Nachweisabdeckung. Tabellen ohne Daten sind unpopulated/unknown, nicht bestandene Prüfung. Graphfrische und Parserabdeckung sind unabhängig: fehlende Metadaten unknown, Partial-/Parsefehler degraded, Commitabweichung stale. Ein leerer Graphtreffer beweist keine Integrität. Physische Integrität, Restore-Test und vollständige Suchqualität bleiben außerhalb des nachgewiesenen Fixumfangs.

## Grenzen und Konflikte

Aktive Pläne `knowledge-mcp-consol`, `llm-proxy-devflow-tools`, `llm-proxy-embed-mitte`, `spec-pipeline-lifecycle` und `workspace-staging-db-tables` berühren Nachbarbereiche. Vor jeder Schreibwelle Claims/aktuellen Branchstand prüfen und bestehende Adapter wiederverwenden; keine parallele Endpoint-/Lifecycle-Architektur einführen. Dieser Plan ist ein einheitlicher Fix ohne Partial-Fan-out.

Die Regressionen laufen ohne Netzwerk und Live-DB. Für echte PostgreSQL-Sperr-/Rollback-Semantik ist zusätzlich eine isolierte Test-DB nötig; Verfügbarkeit ehrlich ausweisen. Kein Fake kann den PostgreSQL-Concurrency-Nachweis ersetzen.
