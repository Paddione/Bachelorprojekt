# Proposal: mcp-config-mutation-race

## Why

T002779 ("Flaky spec shard: mcp-tooling.bats mutiert getrackte MCP-Configs
in-place") wurde als `done` geschlossen, aber die Reparatur erfasste nur eine
von zwei schuldigen Dateien. `tests/spec/mcp-gateway/authenticated-http-headers.bats`
(Test "renderers pass headers through for any http client, not just bge-mcp")
verwendet weiterhin exakt das Muster, das T002779 beheben sollte: es sichert
`.mcp.json`, `.opencode/opencode.jsonc` und `scripts/llm/mcp-servers.json` per
`cp` (ohne `-p`) in ein Backup, lässt `mcp-sync.sh render` auf die ECHTEN
Repo-Pfade schreiben und spielt danach zurück. `cp` ohne `-p` stempelt die
mtime neu — genau das Signal, das `tests/spec/ci-cd/spec-tracked-file-guard.bats`
(der T002779-Guard) als Verletzung interpretiert.

Der Grund für den Backup/Restore-Umweg steht im Testkommentar selbst: er
behauptet, `mcp-sync.sh render` unterstütze `MCP_OUT_DIR` nicht (RED-Zustand).
Das ist inzwischen falsch — verifiziert in `scripts/mcp-sync.sh`:
`OUT_DIR="${MCP_OUT_DIR:-$REPO}"` und `CLAUDE_TARGET`/`OPENCODE_TARGET`/
`LLAMACPP_TARGET` hängen alle bereits vollständig von `OUT_DIR` ab. Der
Kommentar ist stale; render unterstützt die Sandbox-Umleitung längst
vollständig, der Test nutzt sie nur nicht.

**Zweiter, unabhängiger Befund (T003001, Symptom aus PR #3974/CI-Run
31315262369, Shard 4):** Der T002779-Guard selbst (`spec-tracked-file-guard.bats`,
Test "T002779: mcp-tooling.bats laesst die getrackte MCP-Registry unberuehrt")
misst mit `_stamp()` die mtime der vier GLOBALEN getrackten Pfade rund um
einen Lauf von `mcp-tooling.bats`. Unter `bats -j $(nproc)`
(`task test:spec:changed`) ist dieses Messfenster nicht exklusiv: JEDE andere
parallel laufende Spec-Datei, die dieselben Pfade berührt — bisher
`authenticated-http-headers.bats` — verfälscht das Ergebnis, und der Guard
schreibt den Befund fälschlich `mcp-tooling.bats` zu. Lokal reproduziert
(`bats -j 4 tests/spec/mcp-gateway/authenticated-http-headers.bats
tests/spec/ci-cd/spec-tracked-file-guard.bats`), nichtdeterministisch welcher
Test fällt — ein zweiter Beleg für die Race. T003006 wurde bereits als
Dublette von T003001 geschlossen; keine weitere Aktion dafür nötig.

**Dritter, unabhängiger Befund aus derselben Quelldatei:** Der Drift-Zweig von
`mcp-sync.sh check` gibt bei Fehlschlag einen vollständigen Diff von
`mcp_config.json` (unter `$HOME/.gemini/config/`, außerhalb des Repos, ohne
git als Sicherheitsnetz) aus — inklusive eines expandierten Bearer-Tokens im
Klartext. Fällt dieser Zweig in CI, landet ein Credential im öffentlich
lesbaren Actions-Log.

## What

1. `authenticated-http-headers.bats`: Backup/Restore-Umweg entfernen, `render`
   ausschließlich mit `MCP_OUT_DIR=<tmpdir>` laufen lassen (analog zu den
   bereits vorhandenen Sandbox-Assertions weiter unten in derselben Datei).
   Die echten Repo-Dateien werden dann gar nicht mehr angefasst — T002941 ist
   damit strukturell erledigt, nicht nur der eine bekannte Trigger entschärft.
2. `spec-tracked-file-guard.bats`: Die T002779-mtime-Assertion robust gegen
   legitime parallele Spec-Läufe machen, indem `mcp-tooling.bats` gegen eine
   Sandbox-Kopie des Repos ausgeführt und dort gemessen wird (Muster existiert
   bereits in `_sandbox()` weiter unten in derselben Datei für die
   Guard-eigenen Tests), statt globale Repo-mtimes zu lesen, die von JEDER
   parallel laufenden Spec-Datei berührt werden können. Behebt T003001
   strukturell für die gesamte Fehlerklasse, nicht nur den bekannten Trigger.
3. `mcp-sync.sh check`: den Drift-Diff-Zweig für `mcp_config.json` redigieren
   (Wertegenerierung maskieren statt Klartext-Diff auszugeben), damit kein
   Token in CI-Logs landen kann, falls dieser Zweig dort je ausläuft.

## Out of Scope

- T003006 (Dublette von T003001, bereits geschlossen) — keine eigene Aktion.
- Keine Änderung an der Shard-Zuteilung von `find-changed-tests` selbst — der
  Fix macht die betroffenen Tests unabhängig von der Zuteilung robust.

_Ticket: T002941 (+ T003001 gemeinsam behoben, siehe oben)_
