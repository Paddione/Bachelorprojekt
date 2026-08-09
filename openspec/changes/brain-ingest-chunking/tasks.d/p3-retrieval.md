## Partial p3 — Retrieval

Deckt REQ-k4-08 (Brain-Retrieval als MCP-Server) und REQ-k4-09 (Registrierung in
der MCP-Registry) ab, dazu das Ingest-Loadout und die Task-Anbindung der neuen
Skripte. Chunker (p1) und Ingest-Pipeline (p2) werden hier nicht berührt; alle
BATS-Dateien liegen in p4 — dieser Partial schreibt keine Tests.

Zuständige Dateien: `scripts/brain-mcp-server.py`,
`docs/agent-guide/registry/mcp.yaml`, `.mcp.json`, `.opencode/opencode.jsonc`,
`scripts/llm/mcp-servers.json`, `scripts/llm/loadouts.json`,
`taskfiles/Taskfile.brain.yaml`.

### S1-Budget

| Datei | Ist | Budget |
|---|---|---|
| `scripts/brain-mcp-server.py` | 45 | 755 |

Die Datei ist nicht gebaselined; wirksame Schwelle ist das `.py`-Extension-Limit.
`.yaml`, `.json` und `.jsonc` tragen kein S1-Limit, deshalb steht für sie hier
keine Zahl.

### Aufgaben

- [ ] **JSON-RPC-Rahmen in `scripts/brain-mcp-server.py`** — die argparse-CLI
      (`--wiki`, `--resource`, `--search`) entfällt vollständig, es entsteht ein
      Zeilenprotokoll über stdin/stdout: je Zeile eine JSON-RPC-Nachricht,
      Antwort als eine Zeile auf stdout, Diagnose ausschließlich auf stderr.
      Behandelte Methoden analog `scripts/bge-mcp/server.mjs:182-203`:
      `initialize` (antwortet mit `protocolVersion`, `capabilities.tools`,
      `serverInfo`), `notifications/initialized` und `notifications/cancelled`
      (keine Antwort), `ping` (leeres Ergebnis), `tools/list`, `tools/call`,
      alles andere `-32601 method not found`. Nicht parsebare Zeilen ergeben
      `-32700 parse error`. Die Leseschleife endet bei **EOF auf stdin** und der
      Prozess beendet sich mit Exit 0 — kein Endlosloop ohne Abbruchbedingung.
      Ohne das liefe der Test aus p4, der mehrere JSON-RPC-Zeilen in einem Zug
      hineinschiebt und die Antworten liest, in sein `timeout` statt zu
      terminieren. Der Wiki-Pfad kommt aus `BRAIN_WIKI_DIR` mit Vorgabe
      `~/brain/wiki`, expandiert über `Path(...).expanduser()`; die Registry
      bekommt damit keinen worktree-abhängigen Pfad eingebacken.
      Ausschließlich Standardbibliothek — `python3 -c "import mcp"` scheitert auf
      diesem Host (Python 3.12.3) mit `ModuleNotFoundError: No module named
      'mcp'`, eine neue Laufzeitabhängigkeit ist ausgeschlossen. Der
      Bestandsserver `bge-mcp` implementiert das Protokoll aus demselben Grund
      von Hand; dessen `ok()`/`fail()`-Hilfsfunktionen sind die Vorlage.

- [ ] **Seiten-Index in `scripts/brain-mcp-server.py`** — beim Start werden alle
      `*.md` unterhalb des Wiki-Verzeichnisses rekursiv eingelesen (`rglob`, wie
      in der abgelösten Fassung) und je Seite Slug (Dateiname ohne Endung),
      Frontmatter, Titel, Tags und Body gehalten. Die Frontmatter-Zerlegung der
      Bestandsfunktion `read_page()` (Split an `---`, Zeilen mit `:` als
      Schlüssel/Wert) wird übernommen und um eine Listenform für `tags` erweitert.
      Der Index wird einmal aufgebaut und im Prozess gehalten: bei ~300 Seiten
      ist ein Neuaufbau je Anfrage messbar teurer als der Speicher, und der
      Server lebt genau so lange wie die Harness-Sitzung.

- [ ] **BM25-Ranking in `scripts/brain-mcp-server.py`** — Tokenisierung von
      Titel, Tags und Body auf Kleinschreibung und Wortgrenzen; Dokumentfrequenz
      je Term, durchschnittliche Dokumentlänge, Scoring mit k1=1.5 und b=0.75
      über die Standardformel. Titel- und Tag-Treffer gehen mit in dasselbe
      Dokument ein, damit eine Seite, die den Suchbegriff im Titel führt, nicht
      hinter einer langen Seite mit beiläufiger Erwähnung landet. Die abgelöste
      Substring-Suche lieferte eine unsortierte Pfadliste — für einen Agenten
      unbrauchbar, weil er nicht entscheiden kann, welche Datei er lesen soll.

- [ ] **Werkzeug `brain_search` in `scripts/brain-mcp-server.py`** —
      `inputSchema` mit `query` (string, erforderlich) und `top_k` (integer,
      `minimum: 1`, Vorgabe 5), Aufbau wie die `TOOLS`-Konstante in
      `scripts/bge-mcp/server.mjs:59-88`. Rückgabe sind höchstens `top_k`
      Treffer, absteigend nach Score, je Treffer `slug`, `score`, `title` und ein
      Snippet um die stärkste Fundstelle (fester Zeichenradius, an Wortgrenzen
      beschnitten, Kürzungen markiert). Leere Trefferliste ist ein gültiger
      Erfolg — nur der Werkzeugfehler ist ein Fehler.

- [ ] **Werkzeug `brain_read` in `scripts/brain-mcp-server.py`** —
      `inputSchema` mit `slug` (string, erforderlich). Bekannter Slug liefert
      Frontmatter, Body und Pfad. Unbekannter Slug antwortet mit einem
      JSON-RPC-Fehler, dessen Meldung den angefragten Slug und das durchsuchte
      Wiki-Verzeichnis nennt — kein leerer Erfolg, sonst kann der Aufrufer einen
      Tippfehler nicht von einer leeren Seite unterscheiden. Die Fehlerantwort
      ist die JSON-RPC-`error`-Form, nicht ein `result` mit `isError`.

- [ ] **Registry-Eintrag `brain-mcp` in `docs/agent-guide/registry/mcp.yaml`** —
      unter `clients:` nach dem Vorbild der bestehenden `transport: stdio`-Einträge
      `ticket-mcp` und `codebase-memory-mcp`: `transport: stdio`,
      `command: python3`, `args: [/home/patrick/Bachelorprojekt/scripts/brain-mcp-server.py]`,
      dazu `bridge:` mit `url: http://127.0.0.1:18235/mcp/brain-mcp`,
      `bind: 127.0.0.1:18235`, `auth: null` und ein `browser_endpoint` auf
      dieselbe Bridge-URL — dieselben Felder, die jeder andere stdio-Eintrag
      führt. `harness:`-Blöcke für `claude_code` (`command`, `args`), `agy`
      (`command`, `args`) und `opencode` (`type: local`, `command: [...]`,
      `enabled: true`). Ein `env:`-Block setzt `BRAIN_WIKI_DIR`, damit alle drei
      Harnesses dasselbe Wiki lesen.
      **Kein `llamacpp`-Block:** jeder Eintrag dort wird ein Kindprozess bei
      jedem Modellstart (Kommentarkopf `mcp.yaml:9-14`), und der Lesepfad gehört
      zu den Agenten-Harnesses, nicht zum Modellserver. Folge davon ist, dass
      `render_llamacpp_json()` (`scripts/mcp-sync.sh:123-183`) den Server
      überspringt und `scripts/llm/mcp-servers.json` unverändert bleibt — das ist
      die beabsichtigte Wirkung, kein übersehener Schritt.

- [ ] **Zielkonfigurationen regenerieren** — `task mcp:sync` ausführen und die
      erzeugten Dateien mitcommitten: `.mcp.json` (Objekt unter `mcpServers`,
      `command` + `args`), `.opencode/opencode.jsonc` (Block unter `mcp`,
      `type: "local"`, `command: [...]`, `enabled: true`) und
      `scripts/llm/mcp-servers.json` (regeneriert, ohne neuen Eintrag, siehe
      vorige Aufgabe). Keine dieser drei Dateien wird von Hand editiert;
      `~/.gemini/config/mcp_config.json` liegt außerhalb des Repos und wird vom
      selben Lauf mitgeschrieben. Anschließend `task mcp:check` als Drift-Gate —
      es muss für alle Ziele `OK` melden und mit 0 enden.

- [ ] **Ingest-Loadout in `scripts/llm/loadouts.json`** — neuer Eintrag im Array
      `loadouts` mit den Feldern der Bestandseinträge (`slug`, `label`, `model`,
      `port`, `fit`, `args`, `speculative`, `mcp`, `extraArgs`, `notes`,
      `exclusiveGroup`).
      *Port 8093:* `scripts/brain-ingest.sh:42` führt genau diesen Port als
      Vorgabe seiner `LM_STUDIO_URL` und nennt ihn im Kopfkommentar
      „ingest pool"; belegt sind in `loadouts.json` bisher 8090, 8091 (dreifach,
      exklusiv), 8094, 8095, 8096, 8098, 8099 und 45013 — 8093 ist frei und
      macht die bereits dokumentierte Adresse zum ersten Mal real.
      *`exclusiveGroup: "chat-gpu"`:* dieselbe Gruppe wie alle GPU-residenten
      Chat-Loadouts; der Ingest belegt den Grafikspeicher genauso und darf nicht
      neben `gptoss-context` oder `devstral-quality` laufen. Die Gruppe leer zu
      lassen (wie bei `bge-embed-cpu`/`bge-rerank-cpu`) wäre falsch: jene sind
      über `CUDA_VISIBLE_DEVICES: ""` und `ngl: 0` CPU-gebunden, dieses Loadout
      ist es nicht.
      *`args.parallel: 4`:* deckungsgleich mit `MAX_PARALLEL` (Vorgabe 4,
      `brain-ingest.sh:44`) — mehr Ingest-Jobs als Server-Slots stellen sich nur
      in die Warteschlange.
      *`model`:* eine der unter `modelRoots` tatsächlich vorhandenen Dateien
      (`~/models/gguf` führt `devstral24`, `gemma4`, `gemma4-base`,
      `gemma4-tuned`, `gptoss20`, `qwen3coder30`); gewählt wird
      `gptoss20/gpt-oss-20b-Q8_0.gguf`, weil die Ingest-Last Zusammenfassung ist
      und dieses Modell laut `notes` des Eintrags `gptoss-context` MXFP4-nativ bei
      11,5–12,1 GB liegt und damit Platz für vier Slots lässt. `gemma4-base` und
      `gemma4-tuned` scheiden aus: sie sind das Eval-Paar aus T002634 und laut
      ihren `notes` bis auf die Modelldatei zeichengleich zu halten.
      **`LM_STUDIO_URL` und `LM_MODEL` bleiben Pflichtvariablen** (T002533,
      `brain-ingest-transform.sh:48-49` mit `${VAR:?}`) — dieses Loadout stellt
      den Server bereit, es setzt keine neue Vorgabe-Adresse und ändert keine
      Zeile in den Ingest-Skripten. Weil `scripts/llm-proxy/runner.mjs:129`
      `--alias <slug>` übergibt, ist der Slug zugleich die Modell-ID, die
      Aufrufer als `LM_MODEL` setzen; die `notes` des Eintrags halten das fest.
      Danach `task llm:loadouts:check` — die Datei muss der kanonischen
      `writeLoadouts()`-Form entsprechen, Reparatur über `task llm:loadouts:format`.

- [ ] **Tasks in `taskfiles/Taskfile.brain.yaml`** — die neuen Skripte dürfen
      nicht verwaisen (S4). Ergänzt werden:
      `brain:chunk` (ruft `scripts/brain-chunk.sh` mit `--source`, `--slug` und
      `--out-dir` auf und reicht `$@` durch, damit der Chunker ohne Kenntnis
      seiner Aufrufkonvention benutzbar ist),
      `brain:mcp` (startet `python3 scripts/brain-mcp-server.py` mit gesetztem
      `BRAIN_WIKI_DIR`, für manuelles Anschließen und Fehlersuche auf stdio) und
      `brain:mcp:tools` (schickt `initialize` und `tools/list` in denselben
      Prozess und gibt die Antwortzeilen aus — die kürzeste Prüfung, dass der
      Server antwortet). Alle drei mit `desc:` im Stil der Bestandstasks.
      `scripts/brain-ingest-coverage.sh` bindet p2 selbst an; hier wird es nur
      nicht doppelt eingetragen.

### Abhängigkeiten

- `tests/spec/brain-mcp.bats` prüft die hier abgelöste argparse-CLI und wird von
  **p4** entfernt. Solange p4 nicht gelaufen ist, ist diese Datei rot; p3 fasst
  sie nicht an.
- Die Registry-Prüfung aus REQ-k4-09 (`task mcp:check` driftfrei, Einträge in
  den generierten Zieldateien) gehört als BATS-Datei ebenfalls zu p4.
