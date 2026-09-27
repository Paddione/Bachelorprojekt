# Referenzplan f4-worktree-remove-replay/v1

Ein Partial: die gemeinsame Bibliothek plus alle vier Aufrufer. Die
Aufteilung in Lib und Aufrufer aus dem echten Change (p1-lib, p2-callers)
ist hier ein Partial, damit Worker-Laeufe die Checks erreichen koennen.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | scripts/lib/worktree-remove.sh, scripts/devflow-post-merge-finalize.sh, scripts/pr-refresh.sh, scripts/weekly-dep-schema-audit.sh, scripts/factory/cleanup.sh | |
