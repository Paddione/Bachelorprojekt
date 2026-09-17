<!-- Partial p1-impl — id=p1, file=tasks.d/p1-impl.md, role=impl, target_files: scripts/mcp-gateway/token-drift-heal.sh (NEW), scripts/mcp-gateway/watchdog-check.sh (hook) -->

## Partial P1: Token-Drift-Heal (impl)

**Rolle:** impl. **depends_on:** keine.

**Ziel:** Der `mcp-gateway-watchdog` erkennt Token-Drift per sha256-Fingerprint und heilt ihn
selbst: `scripts/mcp-gateway/token-drift-heal.sh` (neu, Verben `check`/`heal`) wird aus
`scripts/mcp-gateway/watchdog-check.sh` im bestehenden 60-s-Tick aufgerufen und teilt sich
Tick, Rate-Limit (`mcp-gateway-watchdog.last_restart`) und Pod-Death-Guard fail-closed mit der
bestehenden Probe-Logik. Kein zweiter Sync-Pfad — Heal laeuft ueber `bash scripts/mcp-sync.sh render`
(`cmd_render`, `scripts/mcp-sync.sh:542`).

**Spec:** `openspec/changes/mcp-token-auto-sync/specs/mcp-gateway.md` (beide ADDED-Requirements),
Details in `openspec/changes/mcp-token-auto-sync/design.md`.

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|-------|---------------|-----|--------|
| `scripts/mcp-gateway/token-drift-heal.sh` | NEU: `check`/`heal`-Verben, Fingerprint-Vergleich, atomarer Rewrite, Render, Unit-Restart, Notify, Verify | 0 (neu) | bleibt mit unter 150 Zeilen deutlich unter dem 800-Limit |
| `scripts/mcp-gateway/watchdog-check.sh` | Hook: Heal-Skript im selben Tick aufrufen (vor dem all-OK-Fruehexit) | 82 | netto zeilenneutral (Hook = wenige Zeilen, ruft nur das neue Skript) |

`scripts/mcp-gateway/watchdog-check.sh` (Ist 82, nicht baselined, wirksame Schwelle 800, Budget 718):
Der Hook fasst die bestehende Probe-/Restart-Logik nicht an und bleibt innerhalb weniger Zeilen.

`scripts/mcp-sync.sh` wird nur aufgerufen (`render`), nicht geaendert. BATS-Abdeckung liegt in
`tasks.d/p2-tests.md` (D1: disjunkt zu diesem Partial).

### Key-Tabelle (einzige Quelle je Key, aus Bestand verifiziert)

| Key | Live-Quelle | `server.env` | Unit bei Drift |
|-----|-------------|--------------|----------------|
| `BGE_MCP_TOKEN` | devmesh-Secret `workspace-secrets`, ns `workspace` | `~/.config/bge-mcp/server.env` | `bge-mcp` |
| `MCP_POSTGRES_TOKEN` | devmesh-Secret `workspace-secrets`, ns `workspace` | `~/.config/mcp-postgres/server.env` | `mcp-postgres-local` |
| `FACTORY_MCP_TOKEN` | zustaendiger Service (je Key dokumentiert) | `~/.config/factory-mcp-node/server.env` | `factory-mcp` |

Pfade und Ports bestaetigt durch `scripts/mcp-gateway/doctor.sh` (`probe 13005 …/bge-mcp/…`,
`probe 13001 …/mcp-postgres/…`, `probe 13003 …/factory-mcp-node/…`) und
`scripts/mcp-sync.sh:148-150`; Units `bge-mcp`, `mcp-postgres-local`, `factory-mcp` aus der
Unit-Schleife in `doctor.sh`. `devmesh-forward.service` bleibt unter der bestehenden
Probe-/Restart-Logik in `watchdog-check.sh` (kein Token an diese Unit gebunden).

### Task P1.1 — Geruest `token-drift-heal.sh` mit Key-Tabelle und Helfern

Lege `scripts/mcp-gateway/token-drift-heal.sh` an (`set -euo pipefail`, ausfuehrbar):

- Key-Tabelle als `case`/Assoziation: `KEY → server.env-Pfad + Unit` gemaess Tabelle oben.
- `live_value <KEY>`: `kubectl --context devmesh -n workspace get secret workspace-secrets
  -o jsonpath="{.data.<KEY>}" | base64 -d`. Jeder kubectl-Fehlschlag (Cluster nicht erreichbar,
  Secret fehlt, Key fehlt) fuehrt zu `SKIP`, nicht zu Heal (fail-closed, Delta-Szenario
  „Cluster unreachable").
- `fingerprint`: `printf '%s' "$value" | sha256sum` — Werte fliessen nur ueber stdin/Pipes in
  `sha256sum`, nie als Kommandozeilenargument (kein Leak ueber Prozessliste) und nie nach stdout.
- `env_value <file> <KEY>`: letzte `^KEY=`-Zeile aus der `server.env` lesen (ohne den Wert zu
  loggen); fehlende Datei zaehlt als Drift, nicht als Fehler.
- Verb-Dispatch: `$1 = check | heal`. Unbekanntes Verb → Usage auf stderr, Exit 2.
- Ausgabeformat strikt `<KEY>: match|drift|skip` pro Zeile, ein Key pro Zeile, sonst nichts.

Akzeptanz: Skript ist unter 150 Zeilen; `shellcheck` ohne neue Warnungen; kein Token-Wert
kann in Ausgabe gelangen (es wird nur der Key-Name plus Statuswort gedruckt).

### Task P1.2 — Verb `check` (read-only Detect)

Implementiere `check` gemaess Delta-Requirement „Watchdog detects MCP token drift without
leaking secrets":

- Pro Key `sha256(live)` gegen `sha256(server.env-Wert)` vergleichen; pro Key genau eine
  Statuszeile (`match`, `drift`, `skip`).
- Exit 0 bei all-`match` oder (teil-)`skip`; Exit non-zero sobald mindestens ein Key `drift`
  meldet. Schreibt nichts, restartet nichts.
- Fail-closed: Ist der Cluster nicht erreichbar, meldet jeder Key `skip`, Exit 0, kein Heal.

Akzeptanz: Entspricht den Delta-Szenarien „Fingerprints match", „Fingerprints differ" und
„Cluster unreachable" (rote/gruene Pruefung dieser Szenarien gehoert zu `tasks.d/p2-tests.md`).

### Task P1.3 — Verb `heal` (Rewrite, Render, Restart, Notify, Verify)

Implementiere `heal` gemaess Delta-Requirement „Watchdog heals token drift and notifies",
nur fuer Keys mit `drift` (`match`/`skip` bleiben unberuehrt — Idempotenz):

1. **Rewrite:** Driftete Keys in ihrer `server.env` atomar ersetzen: übrige Zeilen erhalten,
   neue Datei per `mktemp` im selben Verzeichnis aufbauen, `chmod 600` nach dem
   `harden_secret_file`-Muster (`scripts/mcp-sync.sh:58`, dort zusaetzlich Plattform-Zweig),
   dann `mv` ueber das Original.
2. **Render:** Einmalig `bash scripts/mcp-sync.sh render` aufrufen (heilt `.opencode/opencode.jsonc`,
   `.mcp.json`, Gemini-/Qwen-/Claude-User-Configs und die Codex-Bearer in `~/.codex/config.toml`
   gemaess design.md). Genau ein Render-Lauf pro Heal, auch bei mehreren drifteten Keys.
3. **Restart:** Nur `systemctl --user restart <unit>` fuer Units drifteter Keys (Mapping aus der
   Key-Tabelle). Keine anderen Units anfassen.
4. **Notify:** `bash scripts/agent-msg.sh post "Token <KEY,…> rotiert, Dateien geheilt — Harness einmal neu starten"` plus Journal-Echo derselben Zeile (stdout der Unit landet im Journal).
5. **Verify:** `bash scripts/mcp-gateway/doctor.sh` laufen lassen. Bleibt der Exit non-zero,
   genau eine zweite Meldung via `agent-msg.sh post` absetzen und danach **nicht** erneut heilen:
   Das Rate-Limit des Watchdogs (`mcp-gateway-watchdog.last_restart`, `RATE_LIMIT_SEC=300`) gilt
   auch hier — der Heal beruehrt die STAMP-Datei (Anlegen nach Heal) und ueberspringt den naechsten
   Heal, solange das Limit greift. Kein Heal-Loop.
6. **Redaction:** Zu keinem Zeitpunkt einen Token-Wert auf stdout, ins Journal oder in
   Agent-Messages schreiben (nur Key-Namen und Statuswoerter).

Akzeptanz: Entspricht den Delta-Szenarien „Drift triggers full heal", „No drift — heal is a
no-op" und „Heal notifies about the required harness restart" (Pruefung in `tasks.d/p2-tests.md`).

### Task P1.4 — Hook in `watchdog-check.sh` (zeilenneutral)

Ergaenze `scripts/mcp-gateway/watchdog-check.sh` um wenige Zeilen (Budget siehe File Structure):

- Aufruf `"<script-dir>/token-drift-heal.sh" heal` **vor** dem all-OK-Fruehexit
  (heute Zeilen 37–40), damit Drift auch bei gesunden TCP-Probes heilt (Probes pruefen nur
  Erreichbarkeit, keine Tokens).
- Fehlschlag des Heal-Skripts darf den Probe-Pfad nie brechen (guard in `if ! …`-Form —
  Datei laeuft unter `set -euo pipefail`); danach laeuft die bestehende Probe-/Rate-Limit-/
  Pod-Death-Guard-Logik unveraendert weiter.
- Keine neue Rate-Limit-Datei, keine neue STAMP-Semantik: Das Heal-Skript nutzt dieselbe
  `STAMP`-Datei (`mcp-gateway-watchdog.last_restart`) und dasselbe `RATE_LIMIT_SEC`-Fenster.
  S4: `token-drift-heal.sh` ist damit von `watchdog-check.sh` aus erreichbar (kein Orphan-Skript).

Akzeptanz: `watchdog-check.sh` waechst nur um den Hook (eine Handvoll Zeilen, bestehende
Funktionen unveraendert); `bash -n` auf beiden Dateien fehlerfrei.
