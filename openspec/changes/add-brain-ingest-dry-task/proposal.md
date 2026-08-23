# Proposal: add-brain-ingest-dry-task

## Why

Der system-audit-Skill dokumentiert `task brain:ingest:dry` als Audit-Einstieg (`.claude/skills/system-audit/SKILL.md`, Abschnitt Brain-Wiki) — der Task existiert aber nicht. `Taskfile.yml` bietet nur `brain:ingest-worklist`. Ein manueller Dry-Run scheitert zusätzlich an der T002533-Entscheidung: `scripts/brain-ingest.sh` bricht ohne `LM_MODEL` ab (`LM_MODEL ist Pflicht, kein Default`), und ein vollständiger Dry-Run braucht den Ingest-Pool unter `http://localhost:8093` statt des Default-Endpunkts `:8100`.

Damit ist der dokumentierte Audit-Einstieg nicht ausführbar — der Audit-Befund SA-BW-01 (2026-08-23, Ticket T014543).

## What Changes

- Neuer Taskfile-Task `brain:ingest:dry` als Wrapper um `scripts/brain-ingest.sh --dry-run`:
  - setzt `LM_MODEL` auf einen sinnvollen Default (`gemma-4-12b-qat`, Prior art: `scripts/brain-ingest-swap.sh:184`), überschreibbar via Environment
  - setzt `LM_STUDIO_URL` auf den Ingest-Pool `http://localhost:8093`, überschreibbar via Environment
  - reicht `CLI_ARGS` an das Script durch (`--pilot N`, `--state`, …)
- Doku-Pflege: der Verweis in `.claude/skills/system-audit/SKILL.md` bleibt gültig und bekommt einen Hinweis auf die gesetzten Defaults.

## Impact

- Betroffen: `Taskfile.yml` (ein neuer Task neben `brain:ingest-worklist`), `.claude/skills/system-audit/SKILL.md` (ein Satz).
- Kein Verhalten bestehender Tasks ändert sich; `brain-ingest.sh` selbst bleibt unberührt (T002533-Pflicht bleibt für direkte Aufrufer bestehen).
