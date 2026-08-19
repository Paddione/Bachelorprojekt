---
title: Brain Knowledge Lifecycle — Retrieval Index
ticket_id: T012913
domains: [dev-tooling, brain]
status: draft
---

# brain-knowledge-lifecycle — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|---|---:|---:|
| `scripts/brain-index.py` | 0 (neu) | 800 |
| `scripts/brain-mcp-server.py` | 373 | 427 |

`scripts/brain-index.py` wird das standardbibliotheksbasierte Shared-Modul für Parsing,
Indexaufbau, BM25-Ranking, Metadatenfilter und Frischeklassifikation. Weil der vorgegebene
Dateiname einen Bindestrich enthält, laden Aufrufer das Modul deterministisch über
`importlib.util.spec_from_file_location`; dadurch kann der spätere Offline-Eval-Runner exakt
dieselbe Implementierung verwenden. `scripts/brain-mcp-server.py` behält ausschließlich den
JSON-RPC-/MCP-Adapter und die unveränderte Werkzeugmenge.

## Tasks

### 1. Retrieval-Vertrag zunächst gegen die bestehende Implementierung rot nachweisen

- Erweitere in diesem Partial keine Testdatei; die Test-Partial stellt die neuen Fälle im
  bestehenden BATS-Bundle bereit. Führe vor der Implementierung gezielt deren Filter-,
  Metadaten- und Kompatibilitätstests aus:

  ```bash
  bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats --filter 'optional filters|as_of|provenance|exactly brain_search and brain_read'
  ```

  `expected: FAIL`, weil `brain_search` die optionalen Eingaben noch nicht deklariert oder
  anwendet und Treffer noch keine Provenienz-, Gültigkeits- oder Frischefelder enthalten.

### 2. Gemeinsamen, deterministischen Brain-Index extrahieren

- Lege `scripts/brain-index.py` an und verschiebe `BrainIndex` samt Frontmatter-Parser,
  mtime-basierter Aktualisierung, Tokenisierung, BM25-Berechnung, Snippet-Erzeugung und
  vollständigem `read_page` aus dem Server in dieses Modul. Erhalte die bisherige
  unfiltrierte Sortierung exakt: Score absteigend, bei Gleichstand die bisher durch den
  sortierten Dateiscan bestimmte Reihenfolge; `top_k` wird erst nach dem Ranking begrenzt.
- Normalisiere beim Indexaufbau die kontrollierten Felder `type`, `tags`, `status` und
  `source_kind`, ohne das rohe Frontmatter für `brain_read` zu verändern. Implementiere eine
  einzige `search(query, top_k=5, *, page_type=None, tags=None, status=None,
  source_kind=None, as_of=None)`-Schnittstelle, die alle gesetzten Filter konjunktiv vor der
  BM25-Statistik anwendet. `tags` ist eine Liste und verlangt, dass jede angeforderte Markierung
  auf der Seite vorhanden ist; die übrigen Metadatenfilter vergleichen exakt.
- Parse `valid_from`, `valid_until`, `observed_at` und `as_of` strikt als ISO-8601-Datum oder
  Zeitpunkt, normalisiere `Z` auf UTC und vergleiche Intervalle halboffen als
  `valid_from <= as_of < valid_until`. Ein explizites `as_of` schließt Seiten mit bekannten,
  nicht passenden Intervallen aus. Legacy-Seiten ohne beide Gültigkeitsgrenzen bleiben als
  Kompatibilitätspolitik enthalten und erhalten `freshness: "unknown"`; fehlerhafte einzelne
  Datumswerte werden ebenfalls nicht als gültige Zeitbehauptung behandelt.
- Ergänze jeden Treffer um die im Frontmatter vorhandenen Felder `type`, `tags`, `status`,
  `source_kind`, `source_revision`, `observed_at`, `valid_from`, `valid_until` und
  `superseded_by`, ohne fehlende optionale Werte zu erfinden. Berechne zusätzlich stets
  `freshness` mit den stabilen Werten `current`, `stale`, `future` oder `unknown`; nutze für
  ungefilterte Suche den aktuellen UTC-Zeitpunkt und für `as_of` exakt den angeforderten
  Zeitpunkt.
- Halte das neue Modul unter 80 % seiner wirksamen S1-Schwelle (maximal 640 Zeilen), damit
  ausreichend Wachstumsreserve für den Eval-Runner bleibt. Verwende ausschließlich die
  Python-Standardbibliothek und führe keine Netzwerkzugriffe oder Schreiboperationen aus.

### 3. MCP-Adapter rückwärtskompatibel auf den Shared Index umstellen

- Entferne die lokale `BrainIndex`-Implementierung aus `scripts/brain-mcp-server.py` und lade
  `scripts/brain-index.py` relativ zu `__file__` über `importlib.util`. Der Server bleibt direkt
  mit `python3 scripts/brain-mcp-server.py` startbar und behält die bisherige
  `BRAIN_WIKI_DIR`-Auflösung sowie Fehlerantworten bei.
- Ergänze im vorhandenen `brain_search`-`inputSchema` ausschließlich optionale Properties:
  `type`, `status` und `source_kind` als Strings, `tags` als String-Array und `as_of` als
  ISO-8601-String. `query` bleibt das einzige Pflichtfeld und `top_k` behält Default und
  Mindestwert. Reiche gesetzte Argumente benannt an den gemeinsamen Index weiter; ein Aufruf
  nur mit `query` und `top_k` muss dieselbe Treffermenge, Reihenfolge und Begrenzung wie zuvor
  liefern.
- Validiere `top_k`, Filtertypen und ISO-8601-`as_of` am Adapterrand und antworte bei ungültigen
  Argumenten mit einem JSON-RPC-Fehler statt einer internen Exception. Lasse `brain_read`
  unverändert vollständiges Frontmatter, Body und Pfad zurückgeben.
- Ändere `TOOLS` nicht strukturell über das erweiterte Schema hinaus: `tools/list` muss exakt
  zwei Einträge mit den Namen `brain_search` und `brain_read` liefern; es wird insbesondere
  kein separates Filter-, Index- oder Freshness-Werkzeug registriert.
- Die Extraktion muss `scripts/brain-mcp-server.py` netto verkleinern; sein wirksames
  S1-Budget erlaubt zwar 427 Zeilen Wachstum, der Adapter soll aber deutlich unter 373 Zeilen
  enden und keine duplizierte Rankinglogik behalten.

### 4. Retrieval-Verhalten und bestehende MCP-Kompatibilität grün prüfen

- Führe das vollständige vorhandene MCP-Bundle aus, damit Toolanzahl, BM25-Reihenfolge,
  `top_k`, Trefferfelder und vollständiges Lesen gemeinsam geprüft werden:

  ```bash
  bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
  ```

- Führe anschließend die gezielten neuen Vertragsfälle erneut aus:

  ```bash
  bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats --filter 'optional filters|as_of|provenance|exactly brain_search and brain_read'
  ```

  Erwartet werden konjunktive Metadatenfilter, Ausschluss bekanntermaßen ungültiger Intervalle,
  Einschluss von Legacy-Seiten als `unknown`, zusätzliche Provenienz-/Gültigkeitsfelder und
  weiterhin exakt zwei MCP-Werkzeuge.

### 5. Verifikation und Freshness-Gates

- Prüfe den vollständigen Change mit den verbindlichen Repository-Gates:

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

- Bestätige nach der Regeneration, dass keine neue S1-Baseline-Ausnahme hinzugefügt wurde und
  `scripts/brain-index.py` höchstens 640 Zeilen umfasst; die von anderen Partials erzeugten
  Freshness-Artefakte werden dort als eigene Zielpfade geführt.
