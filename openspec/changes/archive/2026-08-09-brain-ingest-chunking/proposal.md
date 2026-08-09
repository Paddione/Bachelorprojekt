# Proposal: brain-ingest-chunking

## Why

Der Brain-Ingest speist nur einen Bruchteil des Korpus in das LLM ein, und der
Lesepfad, der das Ergebnis wieder herausholen soll, existiert nicht.

**Befund 1 — Ingest schneidet ab, statt zu chunken.**
`scripts/brain-ingest-transform.sh:54,60` liest jede Quelle mit
`head -c "$MAX_SOURCE_CHARS"` (Vorgabe 4000) und hängt eine
`[...truncated...]`-Notiz an. Nachgemessen am 2026-08-09 gegen die reale
Worklist (`scripts/brain-ingest-worklist.sh --root . --manifest
scripts/brain/ingest-sources.yaml`):

| Größe | Wert |
|---|---|
| Quellen in der Worklist | 144 |
| Quellen über 4000 Zeichen | 81 |
| Korpus gesamt | 2.446.682 Zeichen |
| An das LLM übertragen | 433.395 Zeichen |
| **Abdeckung** | **17,7 %** |

`openspec/specs/software-factory.md` (262.570 Zeichen) erreicht das LLM zu
1,5 %. Weil abgeschnitten und nicht gechunkt wird, fehlt systematisch das
*Ende* jeder Datei — bei OpenSpec-Specs also genau die Requirements und
Scenarios, wegen derer die Spec ins Wiki soll. Der Lauf meldet dabei Erfolg:
Truncation ist kein Fehlerpfad, kein Gate misst Abdeckung.

**Befund 2 — der MCP-Server ist keiner.**
`scripts/brain-mcp-server.py` trägt MCP im Namen, ist aber eine
45-Zeilen-argparse-CLI: `--search` macht `args.search.lower() in
f.read_text().lower()` und gibt eine unsortierte Liste von Dateipfaden ohne
Ranking und ohne Snippets aus. Es gibt kein stdio-JSON-RPC, keine
`tools/list`, keine `tools/call`. Der Name steht in keiner Harness-Config
(`.mcp.json`, `.opencode/opencode.jsonc`, `docs/agent-guide/registry/mcp.yaml`)
— kein Agent kann ihn aufrufen. Das Wiki wird also aufwendig befüllt und von
niemandem gelesen.

Beides zusammen: Die Pipeline produziert verstümmelte Seiten und liefert sie an
einen Lesepfad aus, den es nicht gibt.

## What

### Ingest: chunken statt abschneiden

- **`scripts/brain-chunk.sh` (neu).** Zerlegt eine Quelldatei an der tiefsten
  stabilen Überschriftenebene und packt die Abschnitte greedy bis ~8000 Zeichen
  zu Chunks zusammen. Bei OpenSpec-Specs ist das `### Requirement:` (1738
  Vorkommen im Korpus); Quellen ohne diese Ebene fallen auf `## ` zurück, und
  ein Abschnitt, der allein die Obergrenze reißt, wird an Absatzgrenzen hart
  geteilt. Ausgabe ist ein TSV (Chunk-Datei, Chunk-Slug, Ordnungsnummer,
  Überschrift), damit die aufrufende Pipeline deterministisch weiterarbeiten
  kann. Aus 144 verstümmelten Seiten werden so ~300 vollständige.
- **`MAX_SOURCE_CHARS` wird zum fail-closed Guard.** `brain-ingest-transform.sh`
  kürzt nicht mehr still, sondern bricht bei Überlänge mit klarer Meldung ab.
  Die Kürzung war der Grund, warum 82 % des Korpus unbemerkt verschwanden;
  ein Abbruch macht denselben Zustand sichtbar.
- **Eltern-MOC je gechunkter Quelle, deterministisch aus dem Chunk-TSV.**
  Kein LLM: Wikilinks müssen exakt auf existierende Slugs zeigen, sonst greift
  der Wikilink-Lint in Phase 3 — und dessen „Fix" (`sed`-Entfernung toter
  Links, `brain-ingest.sh:444-452`) würde die Struktur wieder auflösen.
- **Coverage-Gate in Phase 3, fail-closed unter 95 %.** Eingespeiste
  Quellzeichen gegen Worklist-Quellzeichen. Das ist der Guard, der die 17,7 %
  gemeldet hätte, statt sie zwei Monate lang durchzureichen.

### Retrieval: ein echter MCP-Server

- **`scripts/brain-mcp-server.py` neu als stdio-MCP-Server.** JSON-RPC über
  stdin/stdout mit `initialize`, `tools/list`, `tools/call`. Zwei Werkzeuge:
  `brain_search(query, top_k)` mit BM25-Ranking und Ergebnis-Snippets, und
  `brain_read(slug)` für die vollständige Seite. Implementierung mit der
  Python-Standardbibliothek — das `mcp`-SDK ist auf diesem Host nicht
  installiert, und eine neue Laufzeitabhängigkeit für einen Wiki-Index wäre
  unverhältnismäßig.
- **Registrierung in `docs/agent-guide/registry/mcp.yaml`** (SSOT, `transport:
  stdio`, Harness-Blöcke für claude_code/agy/opencode) und Verteilung per
  `task mcp:sync` in `.mcp.json`, `.opencode/opencode.jsonc` und
  `scripts/llm/mcp-servers.json`. `task mcp:check` ist das Drift-Gate.
- **Ingest-Loadout in `scripts/llm/loadouts.json`.** Der Ingest läuft gegen
  einen lokalen llama-server; ~300 Aufrufe kosten dort nichts.
  `LM_STUDIO_URL`/`LM_MODEL` bleiben Pflichtvariablen (T002533) — das Loadout
  liefert den Server, nicht eine neue Vorgabe-Adresse.

### Non-Goals

Bewusst nicht in diesem Vorgang, alles nachrüstbar:

- **Semantisches Reranking via `bge_rerank`.** Es koppelte das Brain-Retrieval
  an die bge-Verfügbarkeit, ohne dass es heute einen Nutzer gibt. BM25 ist
  zustandslos und reicht für ~300 Seiten.
- **Vektorspeicher** für die Wiki-Seiten.
- **Änderungen am Quartz-Rendering** im `Paddione/brain`-Repo.
- **Retrieval über den Code-Graphen** (codebase-memory-mcp).

_Ticket: T002679_
