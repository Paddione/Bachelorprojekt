# p2 — Generator `scripts/mcp-sync.sh`

Rolle: `impl`. `depends_on: p1`.

`target_files`: `scripts/mcp-sync.sh` (neu, `.sh`, Limit 500, volle Reserve),
`Taskfile.yml` (nicht S1-gated).

## Aufgaben

- [ ] **P2.1 — Grundgerüst mit zwei Subkommandos.**

```
scripts/mcp-sync.sh render   # schreibt alle drei Ziele
scripts/mcp-sync.sh check    # vergleicht, exit != 0 bei Drift
```

      `check` darf **niemals** schreiben. Ein Prüfmodus mit Seiteneffekt macht jeden roten Lauf
      beim zweiten Aufruf grün und verdeckt damit genau das, was er finden soll.

- [ ] **P2.2 — Format-Übersetzung.** Eine Registry-Zeile wird pro Harness anders gerendert:

| Transport | Claude Code (`.mcp.json`) | agy (`mcp_config.json`) | opencode (`opencode.jsonc`) |
|---|---|---|---|
| http | `{"type":"http","url":…}` | `{"serverUrl":…}` | `{"type":"remote","url":…,"enabled":…}` |
| stdio | `{"command":…,"args":[…]}` | `{"command":…,"args":[…]}` | `{"type":"local","command":[…],"enabled":…}` |

      opencode fasst Kommando und Argumente in **ein** Array; die beiden anderen trennen sie.
      Das ist die häufigste Fehlerquelle bei der Übersetzung.

- [ ] **P2.3 — `.opencode/opencode.jsonc` blockweise ersetzen, nicht per JSON-Roundtrip.** Die
      Datei ist JSONC und ihre Kommentare tragen die Begründungen, warum einzelne Server
      deaktiviert sind (`github-mcp`: „zero references in this repo; gh-axi is the mandated
      GitHub path"; `playwright`/`docfork`/`webresearch`: „avoid context bloat"). Ein
      `jq`-Roundtrip verwirft sie alle.

      Vorgehen: den `"mcp": { … }`-Block per Textmarker lokalisieren und ersetzen, den Rest der
      Datei byteweise erhalten. Nach dem Schreiben verifizieren:

```bash
sed -e 's://.*$::' -e '/^\s*$/d' .opencode/opencode.jsonc | jq -e . >/dev/null \
  && echo "JSONC OK" || echo "FEHLER: Klammer- oder Kommafehler"
```

- [ ] **P2.4 — agy-Ziel conditional behandeln.** `~/.gemini/config/mcp_config.json` liegt
      außerhalb des Repos:
      - `render`: schreiben, wenn das Verzeichnis existiert; sonst mit Hinweis überspringen.
      - `check`: prüfen, wenn die Datei existiert; sonst **mit sichtbarer Ausgabe** überspringen
        und den Exit-Code allein aus den zwei repo-internen Dateien bilden.

      Der Pfad wird über `${HOME}` aufgelöst, nie hartcodiert. Ein stilles Überspringen ist
      untersagt — ein grüner Exit, der ein Ziel ausgelassen hat, liest sich wie ein Beweis, dass
      das Ziel passte.

- [ ] **P2.5 — Idempotenz.** Zweimal `render` hintereinander muss dieselbe Ausgabe erzeugen.
      Sortierreihenfolge der Server explizit festlegen (nicht auf Hash-Iterationsreihenfolge
      verlassen), sonst produziert jeder Lauf einen anderen Diff.

- [ ] **P2.6 — In `Taskfile.yml` einhängen (S4-Pflicht).** Ein neues `scripts/*.sh` ohne
      Referenz aus Taskfile, CI oder Doku ist eine Orphan-Violation:

```yaml
mcp:sync:   # ruft scripts/mcp-sync.sh render
mcp:check:  # ruft scripts/mcp-sync.sh check
```

      Beschreibungstexte so formulieren, dass der Task-Oracle (`bash scripts/vda.sh oracle`) sie
      findet — er ist der vorgeschriebene Weg, Kommandos in diesem Repo nachzuschlagen.

- [ ] **P2.7 — Shell-Sanity.**

```bash
bash -n scripts/mcp-sync.sh
shellcheck scripts/mcp-sync.sh 2>/dev/null || echo "(shellcheck nicht installiert)"
wc -l scripts/mcp-sync.sh   # Limit 500
```

## Abnahmekriterien

- `render` und `check` existieren; `check` schreibt nachweislich nicht (nach einem `check` ist
  `git status --porcelain` unverändert).
- Zwei aufeinanderfolgende `render`-Läufe erzeugen identische Dateien.
- `.opencode/opencode.jsonc` parst nach Kommentar-Strip als gültiges JSON und behält seine
  Begründungskommentare.
- Das agy-Ziel wird bei Abwesenheit mit sichtbarer Meldung übersprungen, nicht still.
- `Taskfile.yml` führt `mcp:sync` und `mcp:check`.
- `scripts/mcp-sync.sh` bleibt unter 500 Zeilen.
