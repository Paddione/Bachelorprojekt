## Partial p4 — Tests

Zuständig ausschließlich für die sechs neuen BATS-Dateien unter
`tests/spec/brain-k4-brain-wiki/`, die Entfernung der abgelösten
`tests/spec/brain-mcp.bats` und die Regeneration von
`website/src/data/test-inventory.json`. Produktionscode (Chunker, Pipeline,
Coverage-Gate, MCP-Server, Registry) gehört zu p1, p2 und p3 und wird hier
nicht angefasst.

Abgedeckte Anforderungen: REQ-k4-04 bis REQ-k4-09 aus
`openspec/changes/brain-ingest-chunking/specs/brain-k4-brain-wiki.md` —
jedes dort gelistete Scenario bekommt mindestens einen `@test`.

### Verbindliche Testkonventionen für alle sechs Dateien

- **Output- statt Source-Verifikation (T002448-M4):** Jeder Test FÜHRT den
  Befehl aus (`run bash scripts/... `, `run python3 ...`) und prüft `$status`
  und `$output` bzw. die erzeugten Dateien. Kein `grep` auf Skript-Interna als
  Beweis für Verhalten. Einzige zulässige Ausnahme ist `mcp-registry.bats`,
  dessen Aussage sich in generierten Konfigurationsdateien manifestiert — das
  wird im Header-Kommentar dieser Datei ausdrücklich begründet.
- **Positiv-Anker-Pflicht (T002356-M1):** Jeder Negativtest prüft IM SELBEN
  `@test` zuerst den gültigen Fall (der bei fehlender Implementierung rot
  wird) und danach die Negativ-Aussage. Betrifft
  `max-source-chars-guard.bats`, `coverage-gate.bats` und den
  Fehlerfall-Test in `brain-mcp-server.bats`.
- **Keine unqualifizierten `$output`-Vergleiche:** Niemals
  `[[ "$output" == *"brain-chunk.sh"* ]]` gegen die volle Ausgabe — das
  Worktree-Verzeichnis heißt `brain-ingest-chunking-T002679` und kann Treffer
  erzeugen. Erst auf die relevante Zeile eingrenzen, etwa
  `printf '%s\n' "$output" | grep -c '^ERROR:'` oder
  `printf '%s\n' "$output" | grep '^ERROR:' | grep -c 'brain-chunk.sh'`, und
  gegen die erwartete Anzahl prüfen.
- **Runner ist der vendorierte `tests/unit/lib/bats-core/bin/bats`**, nicht
  `which bats`. `bash -n` ist kein Syntaxcheck für `.bats`; brauchbar ist
  `tests/unit/lib/bats-core/bin/bats --count <datei>`.
- **Eine Datei je Vorgang** unter `tests/spec/brain-k4-brain-wiki/`, keine
  ticket-nummerierten Dateinamen, jede Datei mit Kopfkommentar
  (Pfad, Ticket T002679, SSOT-Spec, Prüfmodus).
- **Fixtures aus `$BATS_TEST_TMPDIR`**, wie in
  `tests/spec/brain-foundation/ingest-llm-endpoint.bats`. Keine Testquelle
  außerhalb des Temp-Verzeichnisses erzeugen, kein Netzwerkzugriff, kein
  LLM-Aufruf.

### Aufrufform des Chunkers

Verbindlich ist ausschließlich die Flag-Form:
`bash scripts/brain-chunk.sh --source <pfad> --slug <quell-slug> --out-dir <dir> [--moc <datei>] [--target-chars <n>]`.
`tasks.d/p1-chunker.md` führt dieselbe Form; Positionsargumente gibt es nicht.
Die Tests werden gegen diese Signatur geschrieben und notieren sie im
Kopfkommentar von `chunking.bats`, damit eine spätere Abweichung als
Vertragsbruch und nicht als Testfehler gelesen wird.

## Aufgaben

- [ ] **RED-Schritt: alle sechs Testdateien anlegen und rot laufen lassen.**
  Die Dateien `tests/spec/brain-k4-brain-wiki/chunking.bats`,
  `max-source-chars-guard.bats`, `parent-moc.bats`, `coverage-gate.bats`,
  `brain-mcp-server.bats` und `mcp-registry.bats` werden in den folgenden
  Aufgaben inhaltlich ausgeführt; dieser Schritt legt das Verzeichnis an,
  schreibt sie und belegt, dass sie ohne p1/p2/p3 fehlschlagen. Reihenfolge im
  Vorgang: erst diese Datei-Reihe schreiben, dann den Runner starten, den roten
  Lauf protokollieren und erst danach die Implementierungspartials als grün
  betrachten.
  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/brain-k4-brain-wiki
  # expected: FAIL (rot — Chunker, Coverage-Gate und MCP-Server existieren noch nicht)
  ```
  Zusätzlich je Datei `tests/unit/lib/bats-core/bin/bats --count <datei>` als
  Syntaxprüfung.
  *Danach beobachtbar:* Der Runner findet alle sechs Dateien, meldet für jede
  eine Testzahl > 0, und der Gesamtlauf endet mit Exit ≠ 0 wegen fehlender
  Implementierung — nicht wegen eines Syntaxfehlers.

- [ ] **`tests/spec/brain-k4-brain-wiki/chunking.bats` schreiben (REQ-k4-04).**
  Fixtures in `setup()`: (a) `spec-mit-requirements.md` mit vier
  `### Requirement:`-Überschriften und je ~4000 Zeichen Fülltext, damit die
  Zielgröße 8000 sicher überschritten wird; (b) `ohne-requirements.md` mit
  fünf `## `-Überschriften und ohne jede `### Requirement:`-Zeile — das ist
  der reale Fall `docs/diagrams/architecture.md` (D1, Stufe 2 der
  Fallback-Kette) in klein; (c) `kurz.md` unter der Zielgröße.
  `BRAIN_CHUNK_TARGET_CHARS=8000` wird im Test explizit exportiert, damit die
  Vorgabe nicht implizit mitgeprüft wird.
  Zu schreibende `@test`-Blöcke:
  - `"chunker splits an OpenSpec spec at Requirement headings"` — Chunker auf
    (a) laufen lassen, `[ "$status" -eq 0 ]`, TSV-Zeilen zählen
    (`printf '%s\n' "$output" | grep -c .` > 1), und für jede Chunk-Datei außer
    der ersten prüfen, dass ihre erste inhaltliche Zeile mit
    `### Requirement:` beginnt.
  - `"no chunk exceeds the configured target size"` — über alle Chunk-Dateien
    `wc -c` bilden und gegen 8000 prüfen; zusätzlich als Positiv-Anker, dass
    überhaupt Chunk-Dateien existieren (Anzahl > 0), damit die Aussage nicht
    über einer leeren Menge trivial gilt.
  - `"chunker falls back to H2 for sources without Requirement level"` —
    Chunker auf (b): Exit 0, mehr als eine TSV-Zeile, und die Verkettung aller
    Chunk-Dateien in TSV-Reihenfolge reproduziert den Quelltext
    (`cat` der Dateien gegen die Quelle per `diff` nach Normalisierung
    führender/abschließender Leerzeilen). Damit ist Stufe 2 der Kette
    inhaltlich belegt, nicht nur formal.
  - `"chunk manifest is TAB-separated with four columns"` — jede Zeile per
    `awk -F'\t' '{print NF}'` auf genau 4 Felder prüfen; Spalte 1 zeigt auf
    eine existierende Datei, Spalte 3 ist eine fortlaufende Zahl ab 1.
  - `"chunk slugs sort lexicographically in numeric order"` — Spalte 2 mit
    `sort` und Spalte 3 mit `sort -n` sortieren und die resultierenden
    Reihenfolgen der Zeilen vergleichen; sie müssen identisch sein
    (Nullenauffüllung aus D2).
  - `"a source below the target size yields exactly one chunk"` — Chunker auf
    (c): genau eine TSV-Zeile, Index 1.
  *Danach beobachtbar:* Die Datei enthält sechs `@test`-Blöcke, läuft ohne
  `scripts/brain-chunk.sh` rot und deckt alle drei Scenarios von REQ-k4-04 ab.

- [ ] **`tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats` schreiben (REQ-k4-05).**
  `setup()` exportiert `LM_STUDIO_URL` und `LM_MODEL` (Pflichtvariablen,
  T002533) auf einen lokalen Stub-Port und legt zwei Quellen an: eine über und
  eine unter `MAX_SOURCE_CHARS`, das im Test auf einen kleinen Wert (etwa 500)
  gesetzt wird, damit keine großen Fixtures nötig sind. Für den Durchlauf-Fall
  wird derselbe `python3 http.server`-Stub verwendet wie in
  `tests/spec/brain-foundation/ingest-llm-endpoint.bats` — er schreibt den
  Request-Body mit, sodass der Prompt-Inhalt prüfbar ist.
  Zu schreibende `@test`-Blöcke:
  - `"oversized source is rejected and produces no page"` — Positiv-Anker
    zuerst: die kleine Quelle läuft gegen den Stub mit Exit 0 durch und
    erzeugt eine Ausgabedatei; danach die große Quelle: `[ "$status" -ne 0 ]`,
    die erwartete Ausgabedatei existiert NICHT, und die Fehlerzeile enthält
    Ist-Länge, Grenze und `brain-chunk.sh`. Die drei Bestandteile werden auf
    der eingegrenzten Fehlerzeile geprüft
    (`printf '%s\n' "$output" | grep -i 'MAX_SOURCE_CHARS' | grep -c ...`),
    nicht gegen `$output` als Ganzes.
  - `"source within the limit reaches the prompt untruncated"` — Quelle unter
    der Grenze mit einem eindeutigen Marker am **Dateiende** versehen; nach
    dem Lauf im mitgeschriebenen Request-Body des Stubs prüfen, dass der
    Endmarker vorkommt und die Zeichenkette `truncated` nicht. Der Endmarker
    ist der Positiv-Anker: fehlt der Request ganz, schlägt der Test fehl,
    statt die Abwesenheit von `truncated` trivial zu bestätigen.
  *Danach beobachtbar:* Beide Scenarios von REQ-k4-05 sind abgedeckt, beide
  Tests tragen ihren Positiv-Anker im selben Block, und ohne den p1-Umbau
  laufen sie rot (heute kürzt das Skript still und endet mit Exit 0).

- [ ] **`tests/spec/brain-k4-brain-wiki/parent-moc.bats` schreiben (REQ-k4-06).**
  Fixture: dieselbe mehrteilige Quelle wie in `chunking.bats`, Chunker-Aufruf
  mit gesetztem MOC-Ziel. Der Test liest die MOC-Datei und das TSV und
  vergleicht beide gegeneinander.
  Zu schreibende `@test`-Blöcke:
  - `"parent MOC links exactly one wikilink per chunk"` — Anzahl der
    `[[…]]`-Vorkommen in der MOC (`grep -o '\[\[[^]]*\]\]' | wc -l`) gleich der
    Anzahl TSV-Zeilen, und beide Zahlen > 1 (Positiv-Anker gegen die leere
    Menge).
  - `"every wikilink target resolves to an emitted chunk slug"` — die Slugs aus
    der MOC mit Spalte 2 des TSV per `comm -3` auf sortierten Listen
    abgleichen; die Differenzmenge muss leer sein, und beide Eingabelisten
    müssen nichtleer sein (Anker gemäß der Ad-hoc-Messregel in
    `plan-quality-gates.md`, „Gate-Messung & Ad-hoc-Skripte").
  - `"parent MOC carries a source:: back-reference to the original path"` —
    genau eine Zeile beginnt mit `source::`, und sie nennt den
    **Originalquellpfad**, nicht eine Chunk-Datei; geprüft auf der per `grep
    '^source::'` eingegrenzten Zeile.
  *Danach beobachtbar:* Das einzige Scenario von REQ-k4-06 ist mit drei
  unabhängigen Assertions abgedeckt (Anzahl, Auflösbarkeit, Rückverweis).

- [ ] **`tests/spec/brain-k4-brain-wiki/coverage-gate.bats` schreiben (REQ-k4-07).**
  Das Gate wird über `bash scripts/brain-ingest-coverage.sh` in einem
  isolierten Arbeitsverzeichnis geprüft. Die Eingaben (übertragene Zeichen
  gegen Worklist-Zeichen) werden als Fixture-Dateien in `$BATS_TEST_TMPDIR`
  bereitgestellt und dem Skript über seine dokumentierten Umgebungsvariablen
  bzw. sein Eingabeverzeichnis untergeschoben — p2 legt in seinem Partial
  fest, wie diese Zähler abgelegt werden; die Tests konsumieren genau diese
  Ablage und keine Skript-Interna. `BRAIN_MIN_COVERAGE_PCT` wird je Test
  explizit gesetzt, damit die Vorgabe 95 nicht implizit mitgeprüft wird.
  Zu schreibende `@test`-Blöcke:
  - `"coverage above the threshold passes and reports the percentage"` —
    Zähler für ~98 % Abdeckung, `BRAIN_MIN_COVERAGE_PCT=95`, Exit 0, und die
    auf `grep -i 'coverage'` eingegrenzte Ausgabezeile enthält eine Zahl
    ≥ 95.
  - `"coverage below the threshold fails closed and names both numbers"` —
    zuerst der Positiv-Anker (derselbe Aufruf mit ausreichenden Zählern endet
    mit Exit 0), dann Zähler für ~17 % Abdeckung: `[ "$status" -ne 0 ]`, und
    die eingegrenzte Meldung nennt sowohl den gemessenen Prozentwert als auch
    die Schwelle. Ohne den Anker bestünde der Test auch dann, wenn das Skript
    schlicht fehlt und jeder Aufruf mit 127 endet.
  - `"threshold is configurable via BRAIN_MIN_COVERAGE_PCT"` — dieselben
    Zähler einmal mit einer Schwelle unterhalb und einmal oberhalb des
    gemessenen Wertes; die beiden Exit-Codes müssen sich unterscheiden.
  *Danach beobachtbar:* Beide Scenarios von REQ-k4-07 sind abgedeckt, und der
  Negativtest kann nicht mehr durch ein fehlendes Skript grün werden.

- [ ] **stdio-Harness für den MCP-Server entwerfen und in `brain-mcp-server.bats` verankern (REQ-k4-08, Teil 1).**
  Der Server liest JSON-RPC zeilenweise von stdin und antwortet zeilenweise auf
  stdout (D6). Der Test braucht deshalb keine Nebenläufigkeit: eine
  Hilfsfunktion `rpc()` in der Testdatei baut mit `printf` einen
  Anfrage-Block aus `initialize` plus den gewünschten Folgeanfragen, jede als
  eine Zeile, leitet ihn per Here-String in
  `python3 "$SERVER"` und fängt stdout auf. Die Antwortzeilen werden mit
  `python3 -c` (Standardbibliothek `json`) nach `id` gefiltert und das
  gesuchte Feld ausgegeben — kein `jq`-Zwang, keine Regex auf JSON. Der
  Wiki-Pfad kommt über `BRAIN_WIKI_DIR` aus `$BATS_TEST_TMPDIR`, damit kein
  Zugriff auf `~/brain/wiki` erfolgt.
  Fixture-Wiki: fünf Markdown-Seiten mit Frontmatter (`type`, `tags`,
  `status`), davon eine, in der der Suchbegriff etwa zehnmal vorkommt, drei mit
  je einem Vorkommen und eine ohne Vorkommen — damit ist eine eindeutige
  Rangfolge erzwungen und `top_k` prüfbar.
  Jeder RPC-Aufruf wird mit `timeout 20` umschlossen, damit ein Server, der
  auf weitere Eingabe wartet, den Testlauf nicht blockiert, sondern rot macht.
  *Danach beobachtbar:* Die Hilfsfunktion liegt am Kopf der Datei, ist von
  allen Tests der Datei genutzt, und ein Aufruf gegen den noch nicht
  umgebauten Server endet innerhalb des Timeouts mit Exit ≠ 0.

- [ ] **`tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats` ausformulieren (REQ-k4-08, Teil 2).**
  Zu schreibende `@test`-Blöcke, alle über die `rpc()`-Hilfsfunktion:
  - `"tools/list advertises exactly brain_search and brain_read"` — die Liste
    der `name`-Felder aus `result.tools` extrahieren, sortieren und exakt
    gegen `brain_read brain_search` vergleichen (Gleichheit, nicht
    Teilmenge — „exactly" aus dem Scenario). Zusätzlich prüfen, dass jedes
    Werkzeug ein nichtleeres `inputSchema` trägt.
  - `"brain_search returns at most top_k results, strongest first"` —
    `tools/call` mit dem Suchbegriff und `top_k: 2`: Trefferzahl ≤ 2, > 0, und
    der erste Treffer ist der Slug der Seite mit den zehn Vorkommen.
  - `"every brain_search result carries slug, score and snippet"` — für jeden
    Treffer die drei Felder auslesen; alle drei müssen nichtleer sein, der
    Score numerisch, und die Trefferzahl > 0 als Anker.
  - `"brain_read returns frontmatter and body of a known slug"` — Antwort
    enthält einen Frontmatter-Wert (etwa den `type`) und einen eindeutigen
    Satz aus dem Seitenkörper; beides auf dem extrahierten Inhaltsfeld
    geprüft, nicht auf der rohen Serverausgabe.
  - `"brain_read on an unknown slug returns a JSON-RPC error"` — Positiv-Anker
    zuerst: derselbe Aufruf mit bekanntem Slug liefert eine Antwort mit
    `result` und ohne `error`; danach der unbekannte Slug: die Antwort trägt
    ein `error`-Objekt mit `code` und `message`, und kein leeres `result`.
  *Danach beobachtbar:* Alle drei Scenarios von REQ-k4-08 sind abgedeckt; die
  Datei läuft gegen die heutige argparse-CLI rot, weil diese auf
  JSON-RPC-Eingaben keine gültige Antwortzeile erzeugt.

- [ ] **`tests/spec/brain-k4-brain-wiki/mcp-registry.bats` schreiben (REQ-k4-09).**
  Kopfkommentar begründet den Prüfmodus: Die Aussage „Registry ist Quelle,
  Konfigurationen sind generiert" manifestiert sich in Dateiinhalten, deshalb
  ist hier neben dem Kommandolauf auch Dateiprüfung das angemessene Mittel
  (dokumentierte Ausnahme der Test-Resultats-Konvention T002448-M4).
  Zu schreibende `@test`-Blöcke:
  - `"task mcp:check reports no drift"` — `run task mcp:check` aus dem
    Repo-Root, `[ "$status" -eq 0 ]`. Ist `task` im Testumfeld nicht
    verfügbar, wird der Test mit `skip` übersprungen, nicht stillschweigend
    grün behauptet.
  - `"the brain server entry exists in the two harness configs"` — für
    `.mcp.json` und `.opencode/opencode.jsonc` je prüfen, dass ein Servername
    mit `brain` als Schlüssel im Server-Abschnitt vorkommt. Die Prüfung läuft
    über `python3 -c` mit JSON-Parsing (für die JSONC-Datei nach Entfernen der
    Kommentarzeilen), nicht über `grep` auf der ganzen Datei — ein
    `grep 'brain'` träfe auch einen beliebigen Kommentar. Positiv-Anker: die
    Zahl der geprüften Dateien (2) wird mitgezählt und muss 2 sein, damit ein
    fehlender Pfad nicht als „keine Abweichung" durchgeht.
  - `"the brain server is absent from the llama.cpp child-process config"` —
    `scripts/llm/mcp-servers.json` enthält **keinen** brain-Eintrag. Das ist
    kein Versehen, sondern Entscheidung D7: `render_llamacpp_json()`
    (`scripts/mcp-sync.sh`) nimmt nur Server mit `harness.llamacpp` auf, und
    jeder Eintrag dort ist ein zusätzlicher Kindprozess bei jedem Modellstart.
    Positiv-Anker im selben `@test`: zuerst prüfen, dass die Datei überhaupt
    gültiges JSON mit mindestens einem anderen Server enthält — sonst wäre die
    Abwesenheitsaussage über einer leeren oder kaputten Datei trivial erfüllt.
  - `"the registry declares the brain server with stdio transport"` — in
    `docs/agent-guide/registry/mcp.yaml` den brain-Eintrag auslesen und
    `transport: stdio` auf der zum Eintrag gehörenden Zeile prüfen, nicht
    irgendwo in der Datei.
  *Danach beobachtbar:* Das Scenario von REQ-k4-09 ist abgedeckt; ohne den
  p3-Registry-Eintrag laufen mindestens zwei der drei Tests rot.

- [ ] **`tests/spec/brain-mcp.bats` entfernen.**
  Die Datei prüft die abgelöste argparse-CLI (`--resource brain://…`,
  `--search`) und wird durch den Umbau in p3 ungültig — sie kann nicht
  repariert werden, weil die geprüfte Oberfläche verschwindet und laut D6
  bewusst kein Kompatibilitätsmodus daneben bestehen bleibt. Ersatz sind die
  fünf Tests in `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats`, die
  dieselben drei Fähigkeiten (Seitenabruf, Suche, Fehlerfall) über das
  Protokoll prüfen. Nach `git rm tests/spec/brain-mcp.bats` einen Repo-Scan
  auf verbliebene Verweise auf den Dateinamen laufen lassen (Taskfiles,
  Runner-Listen, Dokumentation) und gefundene Einträge auf das neue
  Verzeichnis umstellen.
  *Danach beobachtbar:* Die Datei ist weg, kein Runner und keine Doku
  verweist noch auf sie, und `tests/unit/lib/bats-core/bin/bats -r
  tests/spec/brain-k4-brain-wiki` deckt die drei alten Fähigkeiten weiterhin
  ab.

- [ ] **Gesamtlauf grün stellen und Testinventar regenerieren.**
  Nach p1, p2 und p3 beide Formen der Spec-Ablage prüfen (T002696), weil
  Sammeldatei und Verzeichnis gleichzeitig gültig sind:
  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/brain-k4-brain-wiki*
  tests/unit/lib/bats-core/bin/bats -r tests/spec/brain-ingest* tests/spec/brain-foundation*
  ```
  Anschließend `task test:inventory` ausführen und
  `website/src/data/test-inventory.json` mitcommitten — CI vergleicht die
  regenerierte Datei gegen die committete und schlägt bei Abweichung fehl.
  Der Lauf muss die sechs neuen Dateien enthalten und `tests/spec/brain-mcp.bats`
  nicht mehr.
  *Danach beobachtbar:* Beide Runner-Aufrufe enden mit Exit 0, das
  regenerierte Inventar unterscheidet sich nach dem Commit nicht mehr vom
  Arbeitsbaum, und `git status` meldet keine unversionierte Testdatei.
