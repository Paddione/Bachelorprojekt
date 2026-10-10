# SDLC- und Knowledge-Integritäts-Audit (T901697)

Dieses Runbook beschreibt das Verfahren zur Überprüfung der Konsistenz, Modell-Lineage,
Phasen-Evidenz und Quellfrische für Wissens- und SDLC-Datenbankbestände.

## 1. Zweck und Prinzipien

Der Integritäts-Audit (`scripts/knowledge/audit-integrity.mjs`) dient der rein lesenden
Diagnose des Datenbestands in `knowledge.*` und `tickets.*`.

Wichtigste Grundsätze:
- **Keine stillen Reparaturen:** Keine synthetischen Backfills, keine Fake-Events, keine automatischen Datenbereinigungen.
- **Read-Only-Garantie:** Ausführung erfolgt in einer expliziten `BEGIN TRANSACTION READ ONLY`-Transaktion mit anschließendem `ROLLBACK`.
- **Ehrliche Evidenzgrenzen:** Fehlende Datenquellen oder Metadaten werden als `unknown`, `unpopulated` oder `degraded` ausgewiesen. Leere Ergebnisse belegen keine Korrektheit.

## 2. Bedienung des Audit-CLI

### Voraussetzungen & Umgebungsvariablen

- `PGURL` oder `TRACKING_DB_URL`: PostgreSQL-Verbindungsstring (z. B. `postgres://...`).
- `REPO_ROOT` (optional, Default `process.cwd()`): Wurzelverzeichnis des Zielprojekts zur Prüfung lokaler Quellfrische (`file:`-URIs).
- `DEVFLOW_CACHE_DIR` (optional, Default `~/.cache/devflow-mcp`): Verzeichnis für lokale Graph-Index-Caches.

### Aufruf

```bash
# Direkte Ausführung gegen Tracking-/Shared-DB:
PGURL="postgres://postgres:password@127.0.0.1:5432/shared_db" \
REPO_ROOT="/home/patrick/repo" \
node scripts/knowledge/audit-integrity.mjs
```

Die Ausgabe ist maschinenlesbares JSON auf `stdout`:

```json
{
  "constraints_and_indexes": { "status": "ok", "issues": [] },
  "collections": [ ... ],
  "model_lineage": { "models": { "bge-m3": 120, "unknown": 15 }, "missing_model_chunks": 15 },
  "source_freshness": { "current": 45, "changed": 2, "missing": 1, "unverifiable": 0 },
  "phase_events": { "order_violations": 0, "gaps": 1, "tickets_inspected": 25 },
  "github_coverage": { "status": "unpopulated", "rows": 0 },
  "open_resolutions": 0,
  "graph_status": { "status": "ok", "freshness": "fresh", "coverage": "complete", "count": 42 }
}
```

## 3. Historische Collections vs. Aktuelle Doktrinquelle

- **Historische Bestände:** Collections und Dokumente mit OpenSpec-Herkunft (`col.source ILIKE '%openspec%'` oder `d.source_uri ILIKE '%openspec%'`) verbleiben zu Archivzwecken in der Datenbank, sind jedoch aus dem Standard-Retrieval (`searchKnowledge`) vor `ORDER BY` und `LIMIT` ausgeschlossen.
- **Doktrinquelle:** Die autoritative Quelle für Spezifikationen, Pläne und Architektur ist das Bachelorprojekt (bzw. das über `DEVFLOW_REPO_ROOT` konfigurierte Repository).
- **Zählerkonsistenz:** Der Audit vergleicht `chunk_count` aus `knowledge.collections` mit den tatsächlichen Zeilen in `knowledge.chunks`. Abweichungen werden als Diskrepanz gemeldet, aber im Live-Betrieb nicht still überschrieben.

## 4. Root- und Endpoint-Konfiguration

- **Code vs. Datenwurzel:** Der Devflow-MCP-Server-Code liegt zentral im Dotfiles-Repository (`mcp-servers/devflow`). Die Arbeits- und Doktrinquelle ist strikt an `REPO` / `DEVFLOW_REPO_ROOT` gebunden. Das Skriptverzeichnis darf nicht fälschlich als Wissenswurzel herangezogen werden.
- **Vektor-Modell-Lineage:** Neue Chunks werden mit `embedding_model = 'bge-m3'` in ihren Metadaten abgelegt. Standardabfragen über BGE-M3 filtern Chunks ohne oder mit abweichendem Modell heraus, um Mischräume und Verzerrungen zu verhindern.
- **Cache-Pfade:** `sync-db.mjs` und `server.mjs` validieren das Vorhandensein des Graph-Caches vor Schreib- oder Sync-Operationen. Ein fehlender Cache führt zum kontrollierten Fehlerabbruch (`exit != 0`).

## 5. Nachweis- und Evidenzgrenzen

1. **GitHub-Tabellen (`github_objects`, `github_snapshots`):**
   - Ein Leerstand (`rows == 0`) meldet `status: "unpopulated"`.
   - Das Vorhandensein von Zeilen ist ein Positivanker für Datenbestände, belegt aber für sich allein noch keine lückenlose Ticket→PR→Verify→Deploy-Nachweiskette.
2. **Phasen-Events (`tickets.factory_phase_events`):**
   - Die Reihenfolge wird strikt anhand `(at, id)` ausgewertet.
   - Synthetische Events mit `detail = 'auto: stage-plan'` werden ignoriert und beweisen keine reale Ausführung.
   - Das Phasen-Gate meldet `order_error` oder fehlende Evidenz (`run_evidence: "unknown"`), wenn echte Nachweise fehlen.
3. **Code-Graph-Integrität:**
   - Freshness (`fresh` vs. `stale` bezüglich HEAD-Commit) ist strikt getrennt von Coverage (`complete`, `partial`, `degraded` bei Parse- oder Schemafehlern).
   - Ein leeres Suchergebnis ist kein Beleg für einen intakten Index.
4. **Out of Scope:**
   - Physische Block-Integrität der Datenbank, Restore-Validierung aus Backup-Snapshots und kontinuierliche Modellqualitäts-Benchmarks müssen separat über Recovery- und Eval-Pipelines abgedeckt werden.
