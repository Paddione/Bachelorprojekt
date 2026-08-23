---
title: "add-brain-ingest-dry-task — Implementation Plan"
ticket_id: T014543
domains: [tools, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# add-brain-ingest-dry-task — Implementation Plan

## File Structure

```
Taskfile.yml                                       (1 neuer Task nach brain:ingest-worklist, ~Zeile 5436)
.claude/skills/system-audit/SKILL.md               (1 Hinweissatz am brain:ingest:dry-Verweis, ~Zeile 119)
```

## Implementation Steps

### 1. Task `brain:ingest:dry` in Taskfile.yml ergänzen

Im Block „Brain-Documentation Generator" direkt nach `brain:ingest-worklist`:

```yaml
  brain:ingest:dry:
    desc: "Dry-Run der Brain-Ingest-Pipeline (setzt LM_MODEL-Default + Ingest-Pool :8093; SA-BW-01/T014543). Usage: task brain:ingest:dry"
    cmds:
      - LM_MODEL="${LM_MODEL:-gemma-4-12b-qat}" LM_STUDIO_URL="${LM_STUDIO_URL:-http://localhost:8093}" bash scripts/brain-ingest.sh --dry-run {{.CLI_ARGS}}
```

Begründung der Defaults:
- `gemma-4-12b-qat` ist etablierter Prior art (`scripts/brain-ingest-swap.sh:184`); der FreeToken-native Pool ignoriert das model-Feld ohnehin (T014105), der Wert dient nur der T002533-Pflicht.
- `http://localhost:8093` ist der dokumentierte Ingest-Pool (Kommentar in `scripts/brain-ingest.sh`, `-np 4`).
- Beide Variablen bleiben per Environment überschreibbar — der Wrapper erzwingt nichts.

### 2. Doku-Hinweis in system-audit-SKILL.md

Am Verweis `task brain:ingest:dry` (~Zeile 119) einen Klammerzusatz ergänzen:
`task brain:ingest:dry (setzt LM_MODEL-Default gemma-4-12b-qat und den Ingest-Pool :8093; überschreibbar via Environment)`.

## Verification

1. `task brain:ingest:dry --pilot 2` läuft ohne `LM_MODEL is required`-Abbruch und ohne manuelle Env-Setzung (Exit 0 oder fachlicher Fehler des Pools, nicht der Pflichtprüfung).
2. `bash scripts/brain-ingest.sh --dry-run` ohne Env bricht weiterhin ab (T002533 für Direktaufrufer unverändert).
3. `grep -n "brain:ingest:dry" Taskfile.yml .claude/skills/system-audit/SKILL.md` zeigt Task und Doku-Verweis.
