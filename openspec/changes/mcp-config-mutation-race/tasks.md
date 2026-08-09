---
title: "mcp-config-mutation-race — Implementation Plan"
ticket_id: T002941
domains: [test, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-config-mutation-race — Implementation Plan

_Ticket: T002941 (+ T003001 gemeinsam behoben — Symptom aus PR #3974/CI-Run
31315262369, Shard 4/4; T003006 ist eine bereits geschlossene Dublette von
T003001 und braucht keine eigene Aktion)_

## File Structure

```
tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats     (neu — bereits geschrieben, rot gegen unreparierte Fassung, T002941)
tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats              (neu — bereits geschrieben, rot gegen unreparierte Fassung, T003001)
tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats            (neu — bereits geschrieben, rot gegen unreparierte Fassung, T002941 Zweitbefund)
tests/spec/mcp-gateway/authenticated-http-headers.bats               (geändert — Backup/Restore-Umweg entfernt, render laeuft ausschliesslich gegen MCP_OUT_DIR)
tests/spec/ci-cd/spec-tracked-file-guard.bats                        (geändert — T002779-Assertion misst gegen eine Sandbox-Kopie des Repos statt globaler mtimes)
scripts/mcp-sync.sh                                                  (geändert — diff_or_drift() redigiert Authorization-Werte im mcp_config.json-Drift-Zweig)
```

**S1-Budget** (`.bats`-Dateien sind nicht in `docs/code-quality/gates.yaml` →
`s1.limits` gelistet, also ohne Zeilenlimit; `scripts/mcp-sync.sh` Limit
`.sh` = 800, Ist 325, nicht gebaselined → Restbudget 475, Änderung fügt eine
Handvoll Zeilen in `diff_or_drift()` hinzu, kein Split nötig):

| Datei | aktuell | Restbudget |
|---|---|---|
| `scripts/mcp-sync.sh` | 325 | 475 |

## Task 1: Failing-Tests bereits geschrieben (RED, verifiziert)

Alle drei neuen Testdateien existieren bereits (Teil dieses Plan-Commits) und
wurden gegen die unreparierte Fassung verifiziert rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats
# expected: FAIL (rot — "generic-header-passthrough test never touches real
#           tracked config mtimes": der Test in authenticated-http-headers.bats
#           kopiert .mcp.json/.opencode/opencode.jsonc/scripts/llm/mcp-servers.json
#           per `cp` ohne -p in ein Backup und spielt sie zurueck; die mtime
#           aendert sich trotz identischem Inhalt.)

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats
# expected: FAIL (rot — deterministisch reproduziert per kontrolliertem
#           Hintergrundprozess, der waehrend des Guard-Laufs
#           docs/agent-guide/registry/mcp.yaml beruehrt: der T002779-Guard
#           liest globale Repo-mtimes und wird durch JEDE gleichzeitige
#           Beruehrung verfaelscht, unabhaengig von mcp-tooling.bats selbst.)

tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats
# expected: FAIL (rot — der aufgeloeste Bearer-Token "s3cr3t-live-token-9f8e7d"
#           erscheint im Klartext im diff-Output des mcp_config.json-Drift-Zweigs.)
```

Prüfmodus (T002448-M4): alle drei Tests führen die betroffenen bats-Dateien
bzw. `mcp-sync.sh` tatsächlich aus und messen das Ergebnis (mtime-Vergleich,
Exit-Code, Substring-Abwesenheit) — kein Grep auf Implementierungsmuster.
Jeder Test trägt einen Positiv-Anker vor der Negativ-Aussage (T002356-M1).

## Task 2: authenticated-http-headers.bats — Backup/Restore-Umweg entfernen (GREEN, T002941)

In `tests/spec/mcp-gateway/authenticated-http-headers.bats`, Test "renderers
pass headers through for any http client, not just bge-mcp": den Block, der
`.mcp.json`, `.opencode/opencode.jsonc` und `scripts/llm/mcp-servers.json` in
`$backup` kopiert, den `render`-Aufruf einrahmt und danach zurückspielt,
vollständig entfernen (die Zeilen ab dem `local backup=...`-Kommentarblock
bis zu den drei `cp "$backup/..." "$REPO/..."`-Zeilen nach dem `run`-Aufruf).

Grund (verifiziert in `scripts/mcp-sync.sh`): `render` schreibt bei gesetztem
`MCP_OUT_DIR` bereits ausschließlich in `$OUT_DIR` — `CLAUDE_TARGET`,
`OPENCODE_TARGET` und `LLAMACPP_TARGET` hängen alle von `OUT_DIR` ab, nicht
von `$REPO`. Der einzige verbleibende Berührungspunkt mit dem echten Repo ist
ein LESENDER Fallback in `opencode_source()` (Vorlage für Nicht-`mcp`-Teile
von `opencode.jsonc`, falls die `MCP_OUT_DIR`-Zieldatei noch nicht existiert)
— das ändert keine mtime. `AGY_TARGET` bleibt ohnehin an `$HOME` gebunden,
nicht an `$OUT_DIR`; der Test setzt bereits `HOME="$tmpd/fakehome"`.

Der stale Kommentar ("Solange MCP_OUT_DIR nicht unterstuetzt wird ...") wird
durch eine kurze Notiz ersetzt, dass `render` vollständig gegen `MCP_OUT_DIR`
läuft und die echten Repo-Ziele damit gar nicht berührt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/authenticated-http-headers.bats
# beide gruen
```

## Task 3: spec-tracked-file-guard.bats — T002779-Assertion sandboxen (GREEN, T003001)

In `tests/spec/ci-cd/spec-tracked-file-guard.bats`: den Test "T002779:
mcp-tooling.bats laesst die getrackte MCP-Registry unberuehrt" so umbauen,
dass `mcp-tooling.bats` gegen eine Sandbox-Kopie des Repos läuft und `_stamp()`
dort misst, statt die vier globalen, echten Repo-Pfade zu lesen. Das
existierende `_sandbox()`-Helferpattern weiter unten in derselben Datei (git-
init'tes Wegwerf-Repo unter `$BATS_TEST_TMPDIR`) dient als Vorbild, muss aber
erweitert werden: `mcp-tooling.bats` braucht eine funktionierende Kopie der
vier realen Artefakte (`docs/agent-guide/registry/mcp.yaml`,
`scripts/llm/mcp-servers.json`, `.mcp.json`, `.opencode/opencode.jsonc`) plus
`scripts/`, `node_modules`-Erreichbarkeit (z.B. via `PATH`/`NODE_PATH`
ausserhalb der Kopie) — ein reines `git init` mit einer Trackdatei reicht
hier nicht. Pragmatischer Ansatz: eine Verzeichniskopie des relevanten
Teilbaums (`cp -a` der vier Artefakte + `scripts/mcp-sync.sh` + `tests/`) in
ein `BATS_TEST_TMPDIR`-Sandbox-Root, `mcp-tooling.bats` dort mit `REPO`-
Override (falls die Datei ein Override kennt) oder per `cd` + relativen
Pfaden ausführen, und `_stamp()` gegen die Sandbox-Pfade statt die
`REPO_ROOT`-Pfade laufen lassen.

**Randbedingung:** Kann `mcp-tooling.bats` aus strukturellen Gründen nicht
sinnvoll gegen eine partielle Sandbox-Kopie laufen (z.B. weil es selbst
Annahmen über den vollen Repo-Pfad trifft), ist die Rückfalloption: die
Messung bewusst auf `git status --porcelain=v1` UND mtime zu kombinieren und
zusätzlich zu prüfen, dass kein anderer, gleichzeitig laufender bats-Prozess
(`pgrep -f bats`) im Messfenster aktiv war — das ist schwächer, aber dokumentiert
die Grenze explizit im Testkommentar, statt sie stillschweigend zu behaupten.
Bevorzugt bleibt die volle Sandbox-Lösung; diese Randbedingung nur nutzen, wenn
die Sandbox-Kopie nachweislich scheitert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard.bats
# beide gruen
```

## Task 4: mcp-sync.sh — Drift-Diff für mcp_config.json redigieren (GREEN, T002941 Zweitbefund)

In `scripts/mcp-sync.sh`, Funktion `diff_or_drift()`: wenn `label` =
`"mcp_config.json"`, den `diff`-Output vor der Ausgabe durch eine Redaktion
schleusen, die `Authorization`-Werte durch einen Platzhalter ersetzt (z.B.
`sed -E 's/("Authorization"[[:space:]]*:[[:space:]]*")[^"]*(")/\1***REDACTED***\2/g'`
auf beiden JSON-Formatierungsvarianten — Registry-Fixture und reale Datei
können unterschiedlich eingerückt sein, das Muster darf sich nicht auf
Whitespace verlassen). Für alle anderen Labels bleibt das Verhalten
unverändert (dort stehen ohnehin nur `${VAR}`-Platzhalter, keine aufgelösten
Werte).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats
# gruen
```

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
