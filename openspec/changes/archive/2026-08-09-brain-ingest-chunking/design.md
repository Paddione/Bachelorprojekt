---
ticket_id: T002679
plan_ref: openspec/changes/brain-ingest-chunking/tasks.md
status: active
date: 2026-08-09
---

# Design: brain-ingest-chunking

_Ticket: T002679 · SSOT-Spec: `openspec/specs/brain-k4-brain-wiki.md`_

## Goals

1. Die an das LLM übertragene Korpus-Abdeckung von gemessenen 17,7 % auf ≥ 95 %
   heben, ohne die Prompt-Größe pro Aufruf zu sprengen.
2. Jede Kürzung sichtbar machen — kein stiller Datenverlust mehr.
3. Das entstandene Wiki durch einen Agenten lesbar machen: ein aufrufbarer
   MCP-Server mit gerankter Suche und Snippets.

## Non-Goals

- Semantisches Reranking (`bge_rerank`), Vektorspeicher, Quartz-Rendering,
  Retrieval über den Code-Graphen. Begründung siehe `proposal.md`.
- Änderung der Quellen-Auswahl (`scripts/brain/ingest-sources.yaml`) oder der
  Gruppen-/Typ-Zuordnung.

## Messung (Ausgangslage, 2026-08-09 reproduziert)

```
sources=144  total_chars=2446682  over_4000=81  sent=433395  coverage=17%
```

Reproduzierbar über `scripts/brain-ingest-worklist.sh` plus `wc -c` je Zeile.
Die Zahl 4000 stammt aus `MAX_SOURCE_CHARS="${MAX_SOURCE_CHARS:-4000}"`
(`brain-ingest-transform.sh:54`).

## Entscheidungen

### D1 — Split an der tiefsten stabilen Überschriftenebene, greedy gepackt

Ein Chunk ist eine Folge vollständiger Abschnitte, nicht ein Byte-Fenster.
Primäre Grenze ist `### Requirement:` (1738 Vorkommen im Korpus), weil sie in
OpenSpec-Specs semantisch abgeschlossene Einheiten trennt. Fallback-Kette:

1. `^### Requirement:` — wenn ≥ 2 Vorkommen,
2. sonst `^## ` — die stabile H2-Ebene, die jede SSOT-Spec und jedes Runbook hat,
3. sonst harter Split an Absatzgrenzen (`\n\n`).

**Trade-off:** Ein reiner Byte-Split wäre einfacher und käme ohne Fallback-Kette
aus, zerschnitte aber Requirements mitten im Scenario — genau der Schaden, den
das Abschneiden heute anrichtet, nur gleichmäßiger verteilt. Die Chunk-Grenze
muss inhaltlich sein, sonst ist die Abdeckungszahl kosmetisch.

Zielgröße ~8000 Zeichen, greedy: Abschnitte werden angehängt, bis der nächste
die Grenze reißen würde. Ein einzelner Abschnitt über der Grenze wird an
Absatzgrenzen geteilt statt verworfen. Das ergibt aus 144 Quellen ~300 Seiten.

`docs/diagrams/architecture.md` (146.719 Zeichen) hat **keine**
`### Requirement:`-Ebene — dieser Fall ist der Grund für Stufe 2 der Kette und
muss von den Tests abgedeckt sein.

### D2 — TSV als Schnittstelle zwischen Chunker und Pipeline

`brain-chunk.sh` schreibt die Chunk-Dateien in ein Ausgabeverzeichnis und
emittiert auf stdout ein TAB-getrenntes Manifest:

```
<chunk-file>\t<chunk-slug>\t<index>\t<heading>
```

Damit bleibt die Zuständigkeit sauber: der Chunker kennt kein LLM, das
Wiki-Repo und keinen Zustand; `brain-ingest.sh` kennt keine Markdown-Struktur.
Dasselbe Muster wie `brain-ingest-worklist.sh`, dessen TSV die Pipeline schon
verarbeitet — kein zweites Schnittstellenformat.

Chunk-Slug-Konvention: `<quell-slug>-<index>` (z. B. `openspec-specs-software-factory-03`),
Nullen-aufgefüllt, damit die lexikalische Sortierung der numerischen entspricht.
Der Quell-Slug kommt unverändert aus der Worklist (`slugify()` in
`brain-ingest-worklist.sh:69`), damit Prune (`brain-ingest-prune.sh`) die
`source::`-Rückverweise weiterhin auflösen kann.

### D3 — `MAX_SOURCE_CHARS` wird fail-closed statt kürzend

`head -c` verschwindet aus `brain-ingest-transform.sh`. Übersteigt die
übergebene Quelle die Grenze, bricht das Skript mit Exit ≠ 0 und einer Meldung
ab, die Länge, Grenze und den Hinweis auf `brain-chunk.sh` nennt.

**Warum nicht einfach die Grenze anheben?** Eine höhere Grenze verschiebt den
stillen Verlust nur nach oben; die 4000 wären dann 16000 und
`software-factory.md` läge weiterhin darüber. Der Fehler ist nicht der Wert,
sondern dass Überlänge kein Fehlerpfad ist.

Der Guard greift *nach* dem Chunking: die Pipeline übergibt Chunks, die per
Konstruktion unter der Grenze liegen. Ein Auslösen bedeutet also einen Defekt
im Chunker, nicht eine große Quelle — genau das soll er melden.

### D4 — Eltern-MOC deterministisch, ohne LLM

Je gechunkter Quelle entsteht eine MOC-Seite, die auf ihre Chunk-Seiten
verlinkt, erzeugt direkt aus dem Chunk-TSV.

**Warum kein LLM:** Der Wikilink-Lint in Phase 3 (`brain-ingest.sh:441`) ist
fail-closed, und sein Reparaturversuch entfernt tote Links per `sed`
(`:444-452`). Ein LLM, das Slugs halluziniert, produziert also entweder einen
roten Lauf oder eine MOC, aus der die Links stillschweigend herausgeputzt
wurden. Die Slug-Liste liegt exakt vor — es gibt nichts zu generieren.

Die MOC folgt dem Format der bestehenden Gruppen-MOCs (`brain-ingest.sh:313`),
inklusive `source::`-Rückverweis auf die Originalquelle, damit Prune sie wie
jede andere Seite behandelt.

### D5 — Coverage-Gate in Phase 3, Schwelle 95 %

Phase 3 vergleicht die Summe der tatsächlich an das LLM übertragenen
Quellzeichen gegen die Summe der Worklist-Quellzeichen und bricht unter 95 %
ab. Schwelle konfigurierbar (`BRAIN_MIN_COVERAGE_PCT`), Vorgabe 95.

Nicht 100 %, weil idempotent übersprungene Quellen (unveränderter Hash,
`brain-ingest.sh:155`) korrekt nicht erneut übertragen werden; die Bezugsmenge
ist deshalb *versuchte* Quellen, analog zur bestehenden Fehlerschwelle
(`INGEST_MAX_FAIL_PCT`, `:262`). Die 5 % Puffer decken Rundung und
Chunk-Overhead ab, nicht systematischen Verlust — 17,7 % läge um Größenordnungen
darunter.

### D6 — MCP-Server: stdio-JSON-RPC, Standardbibliothek, BM25

Neuimplementierung von `scripts/brain-mcp-server.py` als stdio-MCP-Server:
`initialize` → `tools/list` → `tools/call`, eine JSON-RPC-Nachricht je Zeile.

- **Kein `mcp`-SDK.** `python3 -c "import mcp"` schlägt auf diesem Host fehl
  (Python 3.12.3, kein Paket installiert). Eine neue Laufzeitabhängigkeit für
  einen Index über ~300 Markdown-Dateien wäre unverhältnismäßig; der
  Bestandsserver `scripts/bge-mcp/server.mjs` implementiert das Protokoll aus
  demselben Grund von Hand.
- **BM25 statt Substring.** `brain_search(query, top_k)` tokenisiert Titel,
  Tags und Body, rankt mit BM25 (k1=1.5, b=0.75) und liefert je Treffer Slug,
  Score und einen Snippet um die beste Fundstelle. Die heutige
  Substring-Suche liefert eine Pfadliste ohne Reihenfolge — für einen Agenten
  unbrauchbar, weil er nicht weiß, welche Datei er lesen soll.
- **`brain_read(slug)`** gibt Frontmatter und Body der Seite zurück.
- **Transport ist stdio, nicht HTTP** — anders als bei `bge-mcp`. Dort erzwang
  die llama-Web-UI eine URL; hier gibt es diesen Zwang nicht, und stdio bringt
  die implizite Authentifizierung mit, dass nur der startende Prozess den
  Server erreicht. Kein Bind, kein Token, kein Port.

Der Wiki-Pfad kommt aus `BRAIN_WIKI_DIR` (Vorgabe `~/brain/wiki`), damit die
Registry-Einträge keinen worktree-abhängigen Pfad einbacken.

**Die bestehenden Tests in `tests/spec/brain-mcp.bats` prüfen die alte
argparse-CLI** (`--resource`, `--search`) und werden durch diesen Umbau
ungültig. Sie werden ersetzt, nicht ergänzt — ein CLI-Kompatibilitätsmodus
neben dem Protokollpfad wäre zwei Oberflächen für einen Server ohne Nutzer der
alten.

### D7 — Registry ist SSOT, Konfigurationen sind generiert

Der Eintrag entsteht in `docs/agent-guide/registry/mcp.yaml`; `.mcp.json`,
`.opencode/opencode.jsonc` und `scripts/llm/mcp-servers.json` werden per
`task mcp:sync` regeneriert und mitcommittet. Handedit der Zieldateien ist
Drift und wird von `task mcp:check` gemeldet.

Ein `llamacpp`-Harness-Block ist zulässig (`transport: stdio`), wird hier aber
**nicht** gesetzt: jeder Eintrag dort ist ein zusätzlicher Kindprozess bei
jedem Modellstart, und der Ingest-Lesepfad gehört zu den Agenten-Harnesses,
nicht zum Modellserver.

## Risiken

| Risiko | Umgang |
|---|---|
| ~300 statt 144 LLM-Aufrufe verlängern den Lauf | Ingest-Loadout ist lokal (llama-server); `MAX_PARALLEL` bleibt an der Slot-Zahl |
| Chunk-Grenzen zerschneiden Kontext, den das LLM zum Verständnis braucht | Chunk-Prompt trägt Quellpfad und Überschrift; Eltern-MOC hält die Seiten zusammen |
| Wikilink-Lint kippt bei ~300 neuen Slugs | MOC deterministisch aus dem TSV (D4); Slug-Inventar wird vor Phase 2 vollständig berechnet |
| Prune hält Chunk-Seiten für verwaist | Chunk-Seiten tragen `source::` auf die Originalquelle; Prune-Verhalten ist testabgedeckt |
