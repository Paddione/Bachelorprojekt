---
title: "langfuse-tracing-completion — Implementation Plan"
ticket_id: T900750
domains: [infra, agents, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# langfuse-tracing-completion — Implementation Plan

Macht das Langfuse-Agent-Tracing aus T900688 verlustfrei, einheitlich und überwacht: ClickHouse auf
8Gi, Environment zentral im Collector, täglicher JSONL-Export nach MinIO, Status-Check am
Sessionstart mit Finetune-Erinnerung ab 3.000 Tool-Traces, Backfill für verlorene Claude-Turns.
Befunde F1–F5 und Entscheidungen D1–D7: `design.md`.

_Ticket: T900750_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/components/langfuse/clickhouse.yaml` | 59 | n/a (S1-ungated) |
| `dev-local/components/langfuse/otel-redact.yaml` | 110 | n/a (S1-ungated) |
| `dev-local/components/langfuse/kustomization.yaml` | 13 | n/a (S1-ungated) |
| `dev-local/components/langfuse/export/cronjob.yaml` | 0 (neu) | n/a (S1-ungated) |
| `scripts/langfuse/export_traces.py` | 0 (neu) | 800 (neue Datei, `.py`-Limit) |
| `scripts/langfuse/tracing-status.sh` | 0 (neu) | 800 (neue Datei, `.sh`-Limit) |
| `scripts/langfuse/backfill-claude.sh` | 0 (neu) | 800 (neue Datei, `.sh`-Limit) |
| `.claude/settings.json` | 204 | n/a (S1-ungated) |
| `taskfiles/Taskfile.devmesh.yml` | 151 | n/a (S1-ungated) |
| `docs/runbooks/qwen35-mtp-subagent-finetuning.md` | 376 | n/a (S1-ungated) |
| `tests/spec/langfuse-agent-tracing.bats` | 193 | n/a (S1-ungated) |

Limits gelesen mit `yq '.s1.limits' docs/code-quality/gates.yaml`. Keine der geänderten Dateien ist
gebaselined (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`).
S4: `export_traces.py` wird über den `configMapGenerator` referenziert, `tracing-status.sh` über
`.claude/settings.json` und `Taskfile.devmesh.yml`, `backfill-claude.sh` über `Taskfile.devmesh.yml`.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-cluster-fixes.md | impl | dev-local/components/langfuse/clickhouse.yaml, dev-local/components/langfuse/otel-redact.yaml | | 4b-local | 16000 |
| p2 | tasks.d/p2-export.md | impl | scripts/langfuse/export_traces.py, dev-local/components/langfuse/export/cronjob.yaml, dev-local/components/langfuse/kustomization.yaml | | 27b-local | 32000 |
| p3 | tasks.d/p3-status-backfill.md | impl | scripts/langfuse/tracing-status.sh, scripts/langfuse/backfill-claude.sh | | 27b-local | 32000 |
| p4 | tasks.d/p4-wiring.md | impl | .claude/settings.json, taskfiles/Taskfile.devmesh.yml, docs/runbooks/qwen35-mtp-subagent-finetuning.md | p3 | 4b-local | 32000 |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1, p2, p3, p4 | 27b-local | 32000 |

## Task: Rot-Grün-Anker

Der Failing-Test-Step liegt in p5 und läuft, bevor p1 bis p4 implementiert sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
# expected: FAIL — ClickHouse steht auf 4Gi, export_traces.py und tracing-status.sh fehlen
```

## Task: Deploy und Live-Nachweis

Nach dem Merge, gegen devmesh:

```bash
task devmesh:deploy
kubectl --context devmesh -n workspace create job --from=cronjob/langfuse-export langfuse-export-manual
kubectl --context devmesh -n workspace logs job/langfuse-export-manual
# erwartet: exported <n> observations to s3://langfuse/exports/observations/<gestern>.jsonl
task devmesh:langfuse:backfill SESSION=322c4ec8-dd16-4f01-8b9c-7726559d91f3
task devmesh:langfuse:status
```

1. Nach dem Backfill zeigt Langfuse Traces für Session `322c4ec8-…` (v2-Metrics nach `sessionId`,
   `traceName = Claude Code Turn`).
2. Eine neue Claude-Code-Session im Repo: Langfuse zeigt ihren Trace mit `environment=development`.
3. `kubectl --context devmesh -n workspace logs deploy/langfuse-worker --since=24h | grep -c 'memory limit exceeded'`
   ergibt `0` nach einem Tag Betrieb.
4. Ergebnisse als Kommentar an T900750.

## Task: Finale Verifikation

Nach Abschluss aller Partials:

```bash
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
