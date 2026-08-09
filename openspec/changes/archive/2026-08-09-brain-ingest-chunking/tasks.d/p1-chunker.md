## Partial p1 — Chunker

Zuständig für genau zwei Dateien: das neue `scripts/brain-chunk.sh` und den
Umbau von `scripts/brain-ingest-transform.sh` auf einen fail-closed Guard.
Die Verdrahtung in `scripts/brain-ingest.sh`, der MCP-Server und sämtliche
Tests liegen in anderen Partials und werden hier nicht angefasst.

Umgesetzte Anforderungen: REQ-k4-04 (Sektions-Chunking), REQ-k4-05
(fail-closed Prompt-Obergrenze), REQ-k4-06 (deterministische Eltern-MOC).
Entscheidungen: D1 (Fallback-Kette, greedy), D2 (TSV-Schnittstelle),
D3 (`MAX_SOURCE_CHARS` fail-closed), D4 (MOC ohne LLM).

### S1-Budgets (wirksame Schwelle = Extension-Limit `.sh` = 800, keine der beiden Dateien ist gebaselined)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/brain-chunk.sh` | 0 | 800 |
| `scripts/brain-ingest-transform.sh` | 175 | 625 |

`scripts/brain-chunk.sh` wird auf ~250–350 Zeilen geschnitten und bleibt damit
deutlich unter 80 % der wirksamen Schwelle. `brain-ingest-transform.sh`
schrumpft durch diesen Vorgang (der `head -c`- und Truncation-Block entfällt),
das Budget wird also nicht belastet.

### Kontrakt der neuen Schnittstelle

```
scripts/brain-chunk.sh --source <source-file> --slug <source-slug> --out-dir <dir> [--moc <file>] [--target-chars <n>]
```

Ausschließlich benannte Optionen, keine Positionsargumente — p2 und p4 rufen das
Skript genau in dieser Form auf, und ein zweites Aufrufmuster wäre die Divergenz,
die dieser Vorgang gerade beseitigt.

stdout, eine Zeile je Chunk, TAB-getrennt (D2):

```
<chunk-file>\t<chunk-slug>\t<index>\t<heading>
```

Konfiguration über `BRAIN_CHUNK_TARGET_CHARS` (Vorgabe 8000). Der Chunker
kennt kein LLM, kein Wiki-Repo und keinen Zustand.

## Aufgaben

- [x] **Gerüst und Argumentparsing für `scripts/brain-chunk.sh`.**
  Neue Datei anlegen: `#!/usr/bin/env bash`, `set -euo pipefail`, Kopfkommentar
  im Stil von `scripts/brain-ingest-worklist.sh:1-9` (Usage, TSV-Spalten,
  Ticket-Verweis T002679). Benannte Optionen `--source` und `--slug` (beide
  Pflicht), `--out-dir` (Pflicht), `--moc` (optional, Zieldatei der Eltern-MOC)
  und `--target-chars` als Überschreibung von
  `BRAIN_CHUNK_TARGET_CHARS`. Unbekannte Argumente enden mit Exit 2 und
  Meldung auf stderr — dasselbe Muster wie
  `brain-ingest-worklist.sh:15-22`. Fehlende Quelldatei und fehlendes
  `--out-dir` enden mit Exit 1 und benannter Ursache; `--out-dir` wird per
  `mkdir -p` angelegt.
  *Danach beobachtbar:* Aufruf ohne Argumente meldet die Usage und endet mit
  Exit ≠ 0; mit gültigen Argumenten läuft das Skript (noch ohne Ausgabe)
  durch und legt das Ausgabeverzeichnis an.

- [x] **Split-Fallback-Kette implementieren (D1, REQ-k4-04).**
  Funktion `detect_split_pattern()` in `scripts/brain-chunk.sh`: zählt
  `grep -c '^### Requirement:'` in der Quelle; bei ≥ 2 Treffern ist das
  Split-Muster `^### Requirement:`. Sonst zählt sie `^## ` und nimmt bei
  ≥ 2 Treffern dieses Muster. Sonst liefert sie das Sentinel für den harten
  Absatz-Split. Das gewählte Muster geht als Diagnosezeile auf stderr, damit
  ein Lauf nachvollziehbar bleibt.
  Funktion `split_sections()`: liest die Quelle zeilenweise mit `awk` und
  schneidet an jeder Zeile, die auf das Muster passt; Vorspann vor der ersten
  Überschrift (bei OpenSpec-Specs Frontmatter und H1) bildet Abschnitt 0. Je
  Abschnitt werden Text und Überschriftszeile festgehalten.
  *Danach beobachtbar:* Eine SSOT-Spec mit mehreren `### Requirement:` wird an
  genau diesen Zeilen zerlegt; `docs/diagrams/architecture.md` (keine
  Requirement-Ebene, D1) fällt sichtbar auf `^## ` zurück.

- [x] **Greedy-Packing bis Zielgröße plus harter Absatz-Split.**
  Funktion `pack_sections()` in `scripts/brain-chunk.sh`: hängt Abschnitte
  nacheinander an den laufenden Chunk an, solange die Zeichenlänge des
  Ergebnisses `BRAIN_CHUNK_TARGET_CHARS` (Vorgabe 8000) nicht überschreitet;
  andernfalls wird der laufende Chunk abgeschlossen und ein neuer begonnen.
  Ein einzelner Abschnitt, der die Grenze allein reißt, geht durch
  `hard_split_paragraphs()`: Teilung an Leerzeilen (`\n\n`), greedy bis zur
  Grenze; überschreitet ein einzelner Absatz die Grenze immer noch, wird er
  als eigener Chunk ausgegeben statt verworfen — Vollständigkeit hat Vorrang
  vor der Zielgröße, und der Fall wird auf stderr gemeldet.
  *Danach beobachtbar:* Die Verkettung aller Chunk-Inhalte reproduziert den
  Quelltext; kein Chunk aus einer normal strukturierten Quelle liegt über der
  Zielgröße.

- [x] **Chunk-Dateien schreiben und TSV-Manifest emittieren (D2, REQ-k4-04).**
  In `scripts/brain-chunk.sh`: je Chunk eine Datei
  `<out-dir>/<chunk-slug>.md` schreiben. Der Chunk-Slug ist
  `<source-slug>-<index>` mit `printf '%03d'`-Nullenauffüllung, damit die
  lexikalische Sortierung der numerischen entspricht (D2). Drei Stellen, nicht
  zwei: die größte Quelle (`openspec/specs/software-factory.md`, 262.570 Zeichen)
  ergibt bei 8000 Zeichen Zielgröße schon ~33 Chunks, und eine kleinere
  `--target-chars`-Einstellung überschritte die Hunderterschwelle — ab
  `<slug>-100` wäre die lexikalische Sortierung bei zweistelliger Auffüllung
  falsch. Der Quell-Slug wird
  unverändert vom Aufrufer übernommen — er stammt aus `slugify()`
  (`brain-ingest-worklist.sh:67-73`) und darf hier nicht neu berechnet werden,
  sonst brechen die `source::`-Rückverweise für `brain-ingest-prune.sh`.
  Index beginnt bei 1. Die Überschrift ist die Überschriftszeile des ersten
  Abschnitts im Chunk, ohne führende `#`-Zeichen und ohne TAB (TABs werden zu
  Leerzeichen normalisiert, sonst zerfällt die Spaltenstruktur); hat ein Chunk
  keine Überschrift, steht dort der Quell-Slug. Ausgabe je Chunk:
  `printf '%s\t%s\t%s\t%s\n' "$chunk_file" "$chunk_slug" "$index" "$heading"`.
  Eine Quelle unterhalb der Zielgröße ergibt genau eine TSV-Zeile.
  *Danach beobachtbar:* `brain-chunk.sh` auf eine große Spec liefert N Zeilen
  mit vier Spalten, und `sort` über Spalte 2 ergibt dieselbe Reihenfolge wie
  `sort -n` über Spalte 3.

- [x] **Deterministische Eltern-MOC aus dem Chunk-TSV erzeugen (D4, REQ-k4-06).**
  Funktion `emit_parent_moc()` in `scripts/brain-chunk.sh`, aktiv nur bei
  gesetztem `--moc` und mehr als einem Chunk. Sie baut die Seite ausschließlich
  aus dem bereits berechneten TSV — kein LLM-Aufruf, kein Netzwerkzugriff
  (D4: der Wikilink-Lint in `brain-ingest.sh:441` ist fail-closed und sein
  `sed`-Reparaturpfad `:444-452` würde halluzinierte Links stillschweigend
  entfernen). Format analog zu den Gruppen-MOCs in `brain-ingest.sh:313`:
  Frontmatter mit `type: moc`, `tags: [<source-slug>, moc]`, `status: active`
  und einer `source::`-Zeile, die auf den **Originalquellpfad** zeigt (nicht
  auf einen Chunk), danach H1 `# <source-slug> — Map of Content`, eine Zeile
  mit der Chunk-Anzahl, `## Abschnitte` und je Chunk eine Zeile
  `- [[<chunk-slug>]] — <heading>`.
  *Danach beobachtbar:* Für eine in N Chunks zerlegte Quelle enthält die
  MOC-Datei genau N `[[…]]`-Einträge, deren Slugs eins zu eins den Chunk-Slugs
  aus Spalte 2 des TSV entsprechen, plus eine `source::`-Zeile auf die
  Originalquelle.

- [x] **`MAX_SOURCE_CHARS` in `scripts/brain-ingest-transform.sh` fail-closed machen (D3, REQ-k4-05).**
  Zeilen 59-66 ersetzen: `CONTENT="$(head -c "$MAX_SOURCE_CHARS" "$SOURCE")"`
  entfällt zugunsten von `CONTENT="$(cat "$SOURCE")"`; `SRC_LEN` bleibt
  (`wc -c < "$SOURCE"`). Übersteigt `SRC_LEN` die Grenze, bricht das Skript mit
  Exit 1 ab und meldet auf stderr Ist-Länge, Grenze und den Hinweis, dass die
  Quelle vorher durch `scripts/brain-chunk.sh` laufen muss. Der
  `[...truncated at … chars of … total...]`-Block wird ersatzlos gestrichen —
  in keiner Prompt-Variante bleibt eine Truncation-Notiz zurück. Der
  Kopfkommentar zu `MAX_SOURCE_CHARS` (Zeile 36) wird von „Max source chars to
  send to LLM" auf die Guard-Semantik umgeschrieben.
  **Zusätzlich in derselben Datei: Quellpfad überschreibbar machen.** Zeile 69
  leitet `SRC_PATH` per `sed` aus dem übergebenen Dateipfad ab. Bei einem Chunk
  aus einem Temp-Verzeichnis trägt das einen Pfad in den Prompt und damit in die
  `source::`-Zeile, den `brain-ingest-prune.sh:56` weder im Repo noch in der
  Worklist findet — jede Chunk-Seite wäre sofort Prune-Kandidat. Deshalb:
  `SRC_PATH="${BRAIN_SOURCE_PATH:-$(echo "$SOURCE" | sed -E 's|.*/Bachelorprojekt/||')}"`.
  Ist die Variable gesetzt, gilt sie; sonst bleibt das heutige Verhalten exakt
  erhalten. p2 setzt sie auf den Repo-relativen Originalpfad. Der Override
  greift damit schon im Prompt, statt die fertige Seite nachträglich zu
  reparieren.
  **Unangetastet bleibt alles andere:** die Pflichtvariablen `LM_STUDIO_URL`
  und `LM_MODEL` (Zeilen 48-49, T002533), die `reasoning_content`-Diagnose in
  `call_llm()` (Zeilen 116-133), `validate_output()` und der Retry-Pfad
  (Zeilen 148-172).
  *Danach beobachtbar:* Eine Quelle über der Grenze erzeugt keine
  transformierte Seite mehr, sondern Exit ≠ 0 mit einer Meldung, in der beide
  Zahlen und der Skriptname `brain-chunk.sh` vorkommen; eine Quelle unter der
  Grenze erreicht den Prompt vollständig und ohne Marker.

- [x] **Ausführbarkeit und Syntax der beiden Dateien sichern.**
  `chmod +x scripts/brain-chunk.sh` und `bash -n` auf beide Dateien laufen
  lassen. Zusätzlich `shellcheck scripts/brain-chunk.sh
  scripts/brain-ingest-transform.sh`, sofern lokal vorhanden, und die
  gemeldeten Befunde beheben. Anschließend `wc -l` auf beide Dateien und
  gegen die Budget-Tabelle oben abgleichen (`brain-chunk.sh` < 800,
  `brain-ingest-transform.sh` < 800).
  *Danach beobachtbar:* Beide Skripte sind syntaktisch gültig, `brain-chunk.sh`
  ist ausführbar, und die Zeilenzahlen liegen innerhalb der notierten Budgets.

### Übergabepunkte an andere Partials

- **S4 (Orphan-Skripte):** `scripts/brain-chunk.sh` ist erst erreichbar,
  wenn `scripts/brain-ingest.sh` es aufruft — das geschieht in p2. Bis dahin
  meldet `task quality:check` das Skript als Orphan; die Auflösung liegt
  bewusst in p2 und nicht hier.
- **Aufrufkonvention:** p2 übergibt den Quell-Slug aus der Worklist-Spalte 2
  unverändert und liest das TSV von stdout ein.
