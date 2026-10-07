# p5 — Tests

Target files: `tests/spec/langfuse-agent-tracing.bats`.

Die bestehende Datei (T900688) erweitern, nicht ersetzen. Ihren `setup()` mit `render-stack.sh core`
und `$RENDERED` wiederverwenden. Tests prüfen Befehlsausgaben (T002448-M4), kein Cluster, kein
Netzwerk. Präfix aller neuen Testnamen: `T900750:`.

### Task 1: Failing Tests zuerst

Neue Fälle am Dateiende:

1. `T900750: ClickHouse-Limit ist 8Gi` —
   `yq ea -r 'select(.kind=="StatefulSet" and .metadata.name=="langfuse-clickhouse") | .spec.template.spec.containers[0].resources.limits.memory' "$RENDERED"` ergibt `8Gi`.
2. `T900750: Collector setzt fehlendes Environment auf development` — die gerenderte
   `langfuse-otel-redact-config` enthält die Zeichenkette
   `set(resource.attributes["langfuse.environment"], "development") where resource.attributes["langfuse.environment"] == nil`.
3. `T900750: CronJob langfuse-export mountet das Export-Skript` — gerendert existiert
   `CronJob/langfuse-export`, Volume-ConfigMap `langfuse-export-script`, und die ConfigMap
   `langfuse-export-script` hat den Key `export_traces.py`.
4. `T900750: export_traces.py --print-key` — `python3 scripts/langfuse/export_traces.py --print-key --date 2026-09-27`
   gibt genau `exports/observations/2026-09-27.jsonl` aus, Status 0.
5. `T900750: export_traces.py ohne Env endet mit 2` — `env -i PATH="$PATH" python3 scripts/langfuse/export_traces.py --date 2026-09-27`, Status 2.
6. `T900750: tracing-status check meldet fehlende Harness-Config` — `HOME=$BATS_TEST_TMPDIR`,
   `XDG_CONFIG_HOME` und `XDG_CACHE_HOME` unter `$BATS_TEST_TMPDIR`, `PATH` mit einem Stub-Verzeichnis,
   das ein ausführbares `opencode` (`#!/bin/sh` + `exit 0`) enthält, davor `/usr/bin:/bin`.
   Ausgabe enthält `opencode tracet nicht`, Status 0.
7. `T900750: Finetune-Erinnerung ab 3000 Tool-Traces` — Cache-Datei
   `$XDG_CACHE_HOME/langfuse/tracing-status.json` mit
   `{"refreshed_at":"<jetzt ISO>","tool_traces":3000,"last_claude_trace":null,"export_gap_session":null}`
   und `touch`, damit kein Hintergrund-Refresh startet. Ausgabe von `check` enthält
   `docs/runbooks/qwen35-mtp-subagent-finetuning.md`.
8. `T900750: keine Finetune-Erinnerung bei 2999` — wie 7 mit `2999`, Ausgabe enthält den Runbook-Pfad nicht.
9. `T900750: Exportlücke nennt den Backfill-Befehl` — Cache mit `export_gap_session` =
   `322c4ec8-dd16-4f01-8b9c-7726559d91f3`, Ausgabe enthält
   `task devmesh:langfuse:backfill SESSION=322c4ec8-dd16-4f01-8b9c-7726559d91f3`.
10. `T900750: check --hook liefert SessionStart-JSON` — Setup wie 7, Ausgabe mit
    `jq -r '.hookSpecificOutput.hookEventName'` ergibt `SessionStart`.
11. `T900750: backfill-claude.sh lehnt ungültige Session-ID ab` — `bash scripts/langfuse/backfill-claude.sh nope`, Status 2.
12. `T900750: Taskfile kennt status und backfill` — `task --list` (Skip, wenn `task` fehlt:
    `command -v task >/dev/null 2>&1 || skip "task binary not installed"`) enthält
    `devmesh:langfuse:status` und `devmesh:langfuse:backfill`.

In jedem Fall mit Cache-Datei vorher `mkdir -p "$XDG_CACHE_HOME/langfuse"` und keine
`agent-tracing.env` anlegen, damit `check` nie einen Refresh im Hintergrund startet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
# expected: FAIL — ClickHouse steht auf 4Gi, export_traces.py und tracing-status.sh fehlen
```

### Task 2: Grün nach p1–p4

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
task test:inventory
```

Alle alten und neuen Fälle grün. `components/website/src/data/test-inventory.json` mitcommitten.
