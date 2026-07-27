# Fix: CI Concurrency Race + E2E Skip + Auto-Merge Docs

## Purpose

Three independent fixes from mishap bundle T002248:

1. **ci.yml concurrency-Race:** Bei `edited`-PR-Events bricht `cancel-in-progress: true` den echten CI-Run ab; der Ersatz-Run skippt alle Jobs. Auto-title (pr-auto-title.yml) feuert `edited` Sekunden nach `opened`.
2. **test:changed E2E-Abbruch:** Ohne `CRON_SECRET` wirft der E2E-Leg unbedingt (kein Skip-Guard) – reißt den gesamten Verify-Block exit code mit.
3. **git-workflow Auto-Merge-Doku:** Keine Warnung, dass nach `--auto` gepushte Commits auf gemergten Branches landen und verloren gehen.

## Scope

- `.github/workflows/ci.yml`: `edited` aus concurrency-cancel ausnehmen
- `tests/e2e/specs/global-db-cleanup.ts` oder Taskfile: E2E-Leg skippen wenn CRON_SECRET fehlt
- `.claude/skills/git-workflow/SKILL.md`: Auto-Merge-Race-Hinweis dokumentieren
