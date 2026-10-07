# p3 — tracing-status.sh und backfill-claude.sh

Target files: `scripts/langfuse/tracing-status.sh` (neu), `scripts/langfuse/backfill-claude.sh` (neu).
Design: `design.md` D4–D7, R1. S1: `.sh`-Limit 800, Ziel je unter 150 Zeilen.
Stil wie `scripts/langfuse/client-env.sh`: `set -euo pipefail`, Kopfkommentar mit Zweck, Aufruf,
Exit-Codes, `[T900750]`. Secrets nie ausgeben.

## Gemeinsame Pfade (beide Skripte)

```bash
ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/langfuse/tracing-status.json"
HOOK_LOG="$HOME/.claude/state/langfuse_hook.log"
HOOK_STATE="$HOME/.claude/state/langfuse_state.json"
RUNBOOK="docs/runbooks/qwen35-mtp-subagent-finetuning.md"
THRESHOLD="${LANGFUSE_FINETUNE_THRESHOLD:-3000}"
```

## Task 1: `tracing-status.sh`

Subcommands: `check [--hook]` und `refresh`. Unbekanntes Subcommand → Usage auf stderr, Exit 2.

### `check` (offline, muss unter 1 s bleiben, kein Netzwerk)

Sammelt Meldungszeilen in einem Array `msgs`:

1. Für jede Harness in `claude opencode pi codex`, nur wenn `command -v <h>` trifft:
   - claude: `$HOME/.claude/settings.json` existiert und `jq -e '.enabledPlugins["langfuse-observability@langfuse-observability"] == true'` ist wahr.
   - opencode: Datei `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode-langfuse.json` existiert.
   - pi: Datei `$HOME/.pi/agent/langfuse.json` existiert.
   - codex: Datei `$HOME/.codex/langfuse.json` existiert.
   Sonst Meldung: `Langfuse: <h> tracet nicht (Config fehlt) — task devmesh:langfuse:setup`.
2. Fehlt `$ENV_FILE`: Meldung `Langfuse: Credentials fehlen — task devmesh:langfuse:setup`.
3. Cache lesen, falls vorhanden. Format (von `refresh` geschrieben):
   `{"refreshed_at":"<ISO>","tool_traces":<int>,"last_claude_trace":"<ISO>|null","export_gap_session":"<id>|null"}`.
   - `tool_traces >= THRESHOLD` → Meldung
     `Finetune-Schwelle erreicht (<n> Tool-Traces ≥ <THRESHOLD>): $RUNBOOK durchgehen.`
   - `export_gap_session` nicht null → Meldung
     `Langfuse: Claude-Turns nicht angekommen (Session <id>) — task devmesh:langfuse:backfill SESSION=<id>`.
4. Ist der Cache älter als 24 h oder fehlt er, und `$ENV_FILE` existiert: `refresh` im Hintergrund
   starten, entkoppelt und stumm:
   `nohup bash "$0" refresh >/dev/null 2>&1 &` (Pfad über `${BASH_SOURCE[0]}`).
   Alter per `stat -c %Y` gegen `date +%s`.
5. Ausgabe:
   - ohne `--hook`: jede Meldung als eigene Zeile auf stdout.
   - mit `--hook`: nur wenn `msgs` nicht leer, genau ein JSON-Objekt
     `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<msgs mit ' | ' verbunden>"}}`
     per `jq -n --arg c "..."`. Leeres `msgs` → keine Ausgabe.
   - Exit immer 0 (ein Status-Check darf den Sessionstart nie blockieren).

### `refresh` (API, schreibt den Cache)

1. `$ENV_FILE` sourcen; fehlt er → Exit 2.
2. Tool-Traces zählen (verifiziert 2026-09-28, Antwort `{"data":[{"uniq_traceId":155}]}`):

```bash
q=$(jq -cn --arg to "$(date -u +%FT%TZ)" '{view:"observations",dimensions:[],
  metrics:[{measure:"traceId",aggregation:"uniq"}],
  filters:[{column:"type",operator:"=",value:"TOOL",type:"string"}],
  fromTimestamp:"2026-09-01T00:00:00Z",toTimestamp:$to}')
curl -fsS -m 30 -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" -G "$LANGFUSE_BASE_URL/api/public/v2/metrics" \
  --data-urlencode "query=$q" | jq -r '.data[0].uniq_traceId // 0'
```

3. Letzten Claude-Trace holen (verifiziert 2026-09-28):

```bash
curl -fsS -m 30 -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" -G "$LANGFUSE_BASE_URL/api/public/v2/observations" \
  --data-urlencode 'limit=1' --data-urlencode 'fields=core' \
  --data-urlencode 'fromStartTime=2026-09-01T00:00:00Z' \
  --data-urlencode 'filter=[{"type":"string","column":"traceName","operator":"=","value":"Claude Code Turn"}]' \
  | jq -r '.data[0].startTime // empty'
```

4. Exportlücke (D6): letzte Zeile in `$HOOK_LOG`, die auf `Processed [1-9][0-9]* turns` passt.
   Format: `2026-09-28 07:07:28 [INFO] Processed 1 turns in 0.05s (session=<uuid>)`, Zeitstempel
   in **lokaler** Zeit ohne Zone. `date -d "<datum> <zeit>" +%s` interpretiert lokal und ist damit
   korrekt. Liegt dieser Zeitpunkt mehr als 1800 s nach dem letzten Claude-Trace (oder gibt es
   keinen Claude-Trace), ist `export_gap_session` die Session-ID aus dieser Zeile, sonst `null`.
   Fehlt das Log, ist der Wert `null`.
5. Schlägt ein curl fehl: Cache nicht überschreiben, Meldung auf stderr, Exit 1.
6. Cache atomar schreiben (`mkdir -p`, Temp-Datei, `mv`) mit `jq -n`. stdout: eine Zeile
   `tool_traces=<n> last_claude_trace=<iso|none> export_gap_session=<id|none>`.

## Task 2: `backfill-claude.sh <session-id>`

1. Ohne Argument oder mit Argument, das nicht auf `^[0-9a-f-]{36}$` passt → Usage, Exit 2.
2. Transcript suchen: `find "$HOME/.claude/projects" -maxdepth 2 -name "<id>.jsonl" | head -1`.
   Nicht gefunden → `transcript für <id> nicht gefunden`, Exit 2.
3. Plugin-Hook finden: `ls -d "$HOME"/.claude/plugins/cache/langfuse-observability/langfuse-observability/*/hooks/langfuse_hook.py | sort -V | tail -1`.
   Nicht gefunden → Exit 2.
4. State-Key: `printf '%s' "<id>::<transcript>" | sha256sum | cut -d' ' -f1`.
   Ist der Key nicht in `$HOOK_STATE` (`jq -e --arg k "$key" 'has($k)'`) → Meldung
   `kein Plugin-State für <id> (Plugin-Format geändert?)`, Exit 2 (R1). Sonst Key per `jq 'del(.[$k])'`
   atomar entfernen.
5. `$ENV_FILE` sourcen und exportieren (`set -a`), dann den Hook aufrufen:

```bash
jq -cn --arg s "$id" --arg t "$transcript" '{session_id:$s,transcript_path:$t,hook_event_name:"SessionEnd"}' \
  | if command -v uv >/dev/null 2>&1; then uv run --quiet --script "$hook"; else python3 "$hook"; fi
```

6. Danach die letzte Zeile aus `$HOOK_LOG` mit `session=<id>` ausgeben und Exit 0.
   Kein Löschen oder Ändern anderer State-Einträge.

## Prüfung

```bash
HOME=$(mktemp -d) bash scripts/langfuse/tracing-status.sh check; echo "rc=$?"
# erwartet: rc=0
bash scripts/langfuse/backfill-claude.sh nope; echo "rc=$?"
# erwartet: rc=2
bash scripts/langfuse/tracing-status.sh refresh
# erwartet (mit echten Credentials): tool_traces=<n> last_claude_trace=... export_gap_session=...
```
