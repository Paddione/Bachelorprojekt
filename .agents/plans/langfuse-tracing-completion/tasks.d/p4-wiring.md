# p4 — Hook, Tasks und Runbook-Verweis

Target files: `.claude/settings.json`, `taskfiles/Taskfile.devmesh.yml`,
`docs/runbooks/qwen35-mtp-subagent-finetuning.md`.
Design: `design.md` D3–D5, D7. Alle drei Dateien sind S1-ungated.

### Task 1: SessionStart-Hook

In `.claude/settings.json` das Array `.hooks.SessionStart` um einen Eintrag ergänzen. Per `jq`,
damit die Formatierung stabil bleibt:

```bash
jq '.hooks.SessionStart += [{"hooks":[{"type":"command","command":"bash scripts/langfuse/tracing-status.sh check --hook 2>/dev/null || true","timeout":5,"statusMessage":"Checking Langfuse tracing..."}]}]' \
  .claude/settings.json > .claude/settings.json.tmp && mv .claude/settings.json.tmp .claude/settings.json
```

Danach: `jq -e . .claude/settings.json >/dev/null` muss Exit 0 liefern, `git diff --stat` darf nur
diese Datei für diesen Task zeigen.

### Task 2: Taskfile

In `taskfiles/Taskfile.devmesh.yml` direkt nach dem Task `langfuse:setup` (vor `migrate:`) einfügen:

```yaml
  langfuse:status:
    desc: "devmesh: Langfuse-Tracing-Status und Finetune-Readiness neu berechnen [T900750]"
    cmds:
      - bash scripts/langfuse/tracing-status.sh refresh
      - bash scripts/langfuse/tracing-status.sh check

  langfuse:backfill:
    desc: "devmesh: verlorene Claude-Code-Turns einer Session erneut an Langfuse senden [T900750]"
    requires:
      vars: [SESSION]
    cmds:
      - bash scripts/langfuse/backfill-claude.sh {{.SESSION}}
```

### Task 3: Runbook-Verweis

In `docs/runbooks/qwen35-mtp-subagent-finetuning.md` direkt unter der Überschrift
`### 3.2 Dataset Composition` und vor dem Satz `Collect or synthesize` einfügen:

```markdown
**Data source (T900750):** Agent traces from all harnesses are exported daily to
`s3://langfuse/exports/observations/<YYYY-MM-DD>.jsonl` on devmesh (CronJob `langfuse-export`,
one Langfuse observation per line with input and output). `task devmesh:langfuse:status` shows the
current count of tool-using traces. Claude Code sessions announce at session start once 3,000 are
reached.
```

### Prüfung

```bash
jq -r '.hooks.SessionStart[].hooks[].command' .claude/settings.json | grep -c tracing-status.sh
# erwartet: 1
task --list | grep -E 'devmesh:langfuse:(status|backfill)'
# erwartet: zwei Zeilen
grep -c 'langfuse-export' docs/runbooks/qwen35-mtp-subagent-finetuning.md
# erwartet: 1
```
