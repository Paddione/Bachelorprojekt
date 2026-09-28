## Task p3: Konfigurationsziele der übrigen Harnesses messen

Context. Ticket T900791, Spec `design.md` Risiko R4. codex, omp, muse, agy und openclaw haben in
der Registry `config: null`, weil unbelegt ist, welche Konfigurationsdatei sie für MCP-Server
lesen und ob eine Projekt-Datei im Repo wirkt. Dieses Partial misst das und schreibt ein
Protokoll. Es ändert keinen Code und keine Konfiguration. Unabhängig von p1, p2, p4 und p5.

Ist-Stand (2026-09-28): installiert sind `codex` (User-Config `~/.codex/config.toml`, Flag
`-c key=value`), `muse` (Muse Code 1.4.0), `agy` 1.2.12 (User-Configs laut
`scripts/toolset/lib/harness.mjs`: `~/.gemini/config/mcp_config.json`, `~/.gemini/settings.json`;
im Repo existiert `.agy/`). `omp` und `openclaw` sind nicht installiert.

Target files:

- `docs/agent-guide/registry/harness-config-targets.md` (NEW)

### Steps

- [ ] Step 1 — Pro installierter Harness (codex, muse, agy) messen:
  1. Welche Datei definiert MCP-Server? Quelle: `<cli> --help`, `<cli> mcp --help` bzw.
     `<cli> mcp list`, falls vorhanden.
  2. Wirkt eine Projekt-Datei im Repo? Probe: in einem Temp-Git-Repo eine Projekt-Konfiguration
     mit einem Dummy-Server `probe-t900791` anlegen, dort `<cli> mcp list` (oder das
     Äquivalent) ausführen und prüfen, ob `probe-t900791` erscheint. Nur Positiv-Befunde
     zählen. Eine leere Liste ist kein Nein, sondern „nicht messbar" (Memory: leere Antwort ist
     kein Urteil).
  3. Gibt es einen Schalter pro Server (`enabled`, `disabled`, Allowlist)?
- [ ] Step 2 — Für omp und openclaw nur die Upstream-Doku auswerten
  (`gh api repos/can1357/oh-my-pi/contents/docs` und README) und als „nicht installiert,
  Doku-Befund" markieren.
- [ ] Step 3 — Protokoll schreiben: je Harness ein Abschnitt mit dem ausführbaren Befehl im
  Code-Block, der Ausgabe (gekürzt), dem Befund (`project` / `user` / `flag-only` /
  `nicht messbar`) und dem vorgeschlagenen `config:`-Wert. Kopfzeile mit Commit-Stand
  (`git rev-parse HEAD`) nach Mess-Konvention T002717.
- [ ] Step 4 — Ergebnis als Kommentar an T900791 (`bash scripts/ticket.sh add-comment --id T900791 --body "…"`).
  Commit:
  ```bash
  git add docs/agent-guide/registry/harness-config-targets.md
  git commit -m "docs(T900791): measured config targets per harness [T900791]"
  ```

### Acceptance criteria

- [ ] Jeder der fünf Harnesses hat einen Abschnitt mit Befehl und Befund.
- [ ] Keine Konfigurationsdatei im Repo oder im Home-Verzeichnis dauerhaft verändert
  (Probe nur im Temp-Repo, danach gelöscht).
