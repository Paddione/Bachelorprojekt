# Proposal: mcp-check-hermetic (T900922)

## Problem

`tests/spec/mcp-tooling.bats` T002398 („mcp:check erkennt Drift in der
llama.cpp-Config") ist auf main rot — der Positiv-Anker (unmanipulierter
`mcp-sync.sh check` muss gruen sein) scheitert. Knock-on: T002779-Guard
faellt mit, weil er die Suite in der Sandbox laufen laesst.

## Symptom vs. Ursache (T002448-M5)

- Symptom (Fakt): `mcp-sync.sh check` meldet DRIFT in `mcp_config.json`,
  `settings.json (qwen)` und `~/.claude/settings.json mcpServers.bge-mcp`
  (Exit 1), obwohl keine Repo-Datei angefasst wurde.
- Ursache (verifiziert 2026-10-02, nur Laengen/Match verglichen, nie
  Werte gelesen): Die User-Scope-Targets werden gegen frisch
  gerendertes Soll mit aufgeloestem `BGE_MCP_TOKEN` verglichen; die
  Aufloesung liest zuerst die Umgebung, dann `server.env`. Auf dieser
  Maschine weicht die Umgebung ab (`env_len=64`, `file_len=48`,
  `match=false`), waehrend die Dateien mit den `server.env`-Werten
  gerendert wurden (Struktur-Diff bis auf den Token identisch). Mit
  `env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN` ist derselbe Check
  vollstaendig gruen (Exit 0). Der Testausgang haengt also vom
  Zufalls-Env des Aufrufers ab — kein Repo-Drift, sondern
  Test-Hermetizitaetsfehler.

## Optionen

1. Token-Env in den Test-Check-Aufrufen unsetten (gewaehlt):
   `env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN` vor den vier
   `mcp-sync.sh check`-Aufrufen in den drei betroffenen Tests. Der
   Renderer faellt deterministisch auf `server.env` zurueck; echte
   Drifts (Hand-Edits, veraltete Renders) werden weiter erkannt, die
   Live-Verifikation der echten Dateien bleibt erhalten.
2. Fake-HOME-Sandbox nach Vorbild der No-Secret-Leak-Tests:
   verworfen — schwerer und schwaecher (pruefte nur Fixturen statt
   der echten Dateien); das Vorbild loest ein anderes Problem
   (Credential-Redaction, nicht Env-Determinismus).
3. Nur lokal re-syncen (`task mcp:sync`): verworfen als Repo-Fix —
   heilt diese Maschine, laesst die Landmine fuer jeden liegen,
   dessen Env abweicht; zudem ist die Credential-Entscheidung
   (welcher Token gilt) nicht Sache dieses Tickets.

## Fix-Ansatz

Vier Aufrufstellen, je ein `env -u`-Praefix, keine Skript-Aenderung:

- `tests/spec/mcp-tooling.bats` (T002398, zwei Runs: Anker + Drift)
- `tests/spec/mcp-gateway.bats` („check passes" — gleicher Root-Cause,
  auf dieser Maschine ebenfalls rot verifiziert)
- `tests/spec/mcp-gateway/authenticated-http-headers.bats`
  („stays green" — gleicher Root-Cause, ebenfalls rot verifiziert)

Unangetastet: `mcp-sync.sh` (Aufloesung ist dokumentiertes T002704-
Verhalten), `task mcp:check` (Operator-Kontext), No-Leak-Tests
(bereits hermetisch), „read-only"-/„skips"-Tests (env-unabhaengig).

## Akzeptanz

- Alle drei Tests gruen — auch in einer Shell MIT abweichendem
  `BGE_MCP_TOKEN` (die Fix-Umgebung schlechthin).
- Drift-Erkennung intakt: manipuliertes Target meldet weiter DRIFT
  (zweite Haelfte von T002398).
- T002779-Guard wieder gruen; kein Credential-Wert in Logs/Diffs.

## Nicht-Ziele

- Keine Credential-Bereinigung auf dieser Maschine (Env- vs.
  Datei-Token-Entscheid liegt beim Eigner; der Test ist danach
  unabhaengig davon).
- Kein Precedence-Wechsel im Renderer (T002704 bleibt).
