---
title: K4-Surgery — Spiegel entfernen
ticket_id: T900451
domains: [brain, cleanup]
status: active
---

# k4-surgery — Implementation Plan

## File Structure

- `scripts/brain-ingest*.sh` + Helfer (p1, 18 Pfade DEL + Skill-Verzeichnis)
- `taskfiles/Taskfile.brain.yaml` (p1, Shrink auf brain:chunk/eval/chunk)
- `Taskfile.yml` (p1, Brain-Block entfernen)
- `scripts/health-goals-check.sh` (p1, G-BRAIN12/13/14 raus)
- `.claude/lib/goals.md` (p1, G-BRAIN12/13/14 raus)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-pipeline.md | impl | scripts/brain-ingest.sh, scripts/brain-ingest-worklist.sh, scripts/brain-ingest-transform.sh, scripts/brain-ingest-moc.sh, scripts/brain-ingest-prune.sh, scripts/brain-ingest-restamp.sh, scripts/brain-ingest-swap.sh, scripts/brain-ingest-reset.sh, scripts/brain-ingest-coverage.sh, scripts/brain-group-match.sh, scripts/brain-source-provenance.sh, scripts/brain-page-metadata.py, scripts/brain-lifecycle-audit.py, scripts/brain-expertise.py, scripts/brain-bootstrap.sh, scripts/brain-merge-hook.sh, .github/workflows/brain-merge-hook.yml, scripts/brain/ingest-sources.yaml, .agents/skills/brain-ingest/SKILL.md, taskfiles/Taskfile.brain.yaml, Taskfile.yml, scripts/health-goals-check.sh, .claude/lib/goals.md | |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
