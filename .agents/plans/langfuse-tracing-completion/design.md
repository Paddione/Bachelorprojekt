---
ticket_id: T900750
plan_ref: .agents/plans/langfuse-tracing-completion/tasks.md
status: active
date: 2026-09-28
---

# langfuse-tracing-completion — Design

_Ticket: T900750 · Nachfolger von T900688 (`.agents/plans/langfuse-agent-tracing/design.md`)_

## Ziel

Die in T900688 gebaute Langfuse-Instanz auf devmesh nimmt jede Agent-Session verlustfrei an,
speichert sie einheitlich gekennzeichnet und dauerhaft, und meldet am Sessionstart, wenn eine
Harness nicht mehr liefert oder genug Daten für den Finetune nach
`docs/runbooks/qwen35-mtp-subagent-finetuning.md` vorliegen.

## Befunde (Diagnose 2026-09-28)

| # | Beobachtung (Fakt) | Beleg |
|---|---|---|
| F1 | ClickHouse verwirft Inserts mit `memory limit exceeded ... maximum: 3.60 GiB` als „non-retryable". Das Pod-Limit ist 4Gi, Langfuse nennt 8 GiB als Minimum. | `kubectl --context devmesh -n workspace logs deploy/langfuse-worker --since=10h \| grep -c 'memory limit exceeded'` (Fehler um 04:12Z und 04:55Z) |
| F2 | Der Claude-Code-Hook meldet 26 verarbeitete Turns, Langfuse hat 4 `Claude Code Turn`-Traces. Session `322c4ec8-…` mit 22 Turns fehlt ganz. Das Plugin verwirft Exportfehler still (Kommentar im Hook: „Export auth failures are swallowed downstream") und rückt den State-Offset trotzdem vor. | `grep -oE 'Processed [0-9]+ turns' ~/.claude/state/langfuse_hook.log \| awk '{s+=$2} END{print s}'` gegen v2-Metrics `traceName = Claude Code Turn` |
| F3 | OpenCode schreibt `environment=development`, Claude/Codex/Pi schreiben `default`. | v2-Metrics gruppiert nach `environment` |
| F4 | Tracing ist pro Maschine opt-in. Fällt eine Plugin-Config weg, merkt das niemand. | kein Check im Repo |
| F5 | Traces liegen nur in ClickHouse auf einem Longhorn-PVC. Einen Export gibt es nicht. | `dev-local/components/langfuse/` |

Ursache von F2 für Session `322c4ec8` ist nicht belegt (Hypothese: Session startete vor der
Plugin-Konfiguration mit veraltetem Base-URL). Der Plan behandelt die Fehlerklasse
(stiller Exportverlust) statt dieser einen Ursache.

## Entscheidungen

| # | Entscheidung | Grund |
|---|---|---|
| D1 | ClickHouse-Limit 4Gi → 8Gi, Request 1Gi → 2Gi. | Offizielles Minimum. `gpu-cluster2` ist zu 19 % belegt (`kubectl --context devmesh top node gpu-cluster2`). |
| D2 | Der Redact-Collector setzt `langfuse.environment=development` als Resource-Attribut, wenn es fehlt. | Eine Stelle statt vier Plugin-Configs. Bestehende `default`-Daten bleiben unverändert. |
| D3 | Täglicher CronJob `langfuse-export` exportiert alle Observations des Vortags (UTC) mit Input und Output als JSONL nach MinIO `s3://langfuse/exports/observations/<YYYY-MM-DD>.jsonl`. Python-Stdlib, SigV4 selbst signiert, Image `python:3.13-alpine`. | Nutzerentscheidung. Unabhängig von ClickHouse und direkt Rohmaterial für den Datensatz. Keine Zusatz-Images. |
| D4 | `scripts/langfuse/tracing-status.sh` mit `check` (offline, schnell) und `refresh` (API, gecacht 24 h in `${XDG_CACHE_HOME:-$HOME/.cache}/langfuse/tracing-status.json`). Ein SessionStart-Hook in `.claude/settings.json` ruft `check --hook` auf. Keine Reparatur beim Start. | Nutzerentscheidung „warnen". Sessionstart bleibt schnell. |
| D5 | Finetune-Erinnerung ab **3.000** Traces mit mindestens einer `TOOL`-Observation (alle Environments, seit 2026-09-01). Text: „Finetune-Schwelle erreicht (N Tool-Traces): docs/runbooks/qwen35-mtp-subagent-finetuning.md durchgehen." | Nutzerentscheidung, Obergrenze aus Runbook §3.2. |
| D6 | Exportlücke = letzter Hook-Log-Eintrag `Processed [1-9]` ist jünger als der letzte `Claude Code Turn`-Trace plus 30 min. Dann Warnung mit Verweis auf `task devmesh:langfuse:backfill SESSION=<id>`. | Erkennt F2 ohne Plugin-Patch. |
| D7 | `scripts/langfuse/backfill-claude.sh <session-id>` löscht den State-Eintrag der Session (`sha256("<id>::<transcript_path>")` in `~/.claude/state/langfuse_state.json`) und ruft den Plugin-Hook mit dem Transcript erneut auf. Die Trace-IDs sind deterministisch, ein Doppellauf überschreibt statt zu duplizieren. | Holt verlorene Turns zurück, auch `322c4ec8`. |

## Außerhalb des Scopes

- OpenCode-, Codex- und Pi-Sessions bekommen keine eigene Startwarnung. Der Claude-Hook prüft alle
  vier Harnesses der Maschine mit.
- Factory-Runner: läuft derzeit auf keinem Cluster (`kubectl get deploy -A | grep factory` leer).
- Umschreiben der alten `default`-Environment-Daten.

## Risiken

- R1: Der Plugin-State-Schlüssel ist ein internes Format von Plugin v1.2.0. Das Backfill-Skript
  bricht mit Exit 2 ab, wenn der Schlüssel fehlt, statt blind zu schreiben.
- R2: Der Export liest über die v2-Observations-API. Seiten mit Input/Output sind auf 50 Einträge
  begrenzt. Das Skript paginiert per Cursor.
