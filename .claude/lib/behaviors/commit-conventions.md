# Behavior: Commit- und Branch-Konventionen

## Branch-Naming
- Features: `feature/<slug>`
- Bug-Fixes: `fix/<slug>`
- Wartung/Chores: `chore/<slug>`

## Commit-Messages
Conventional-Commits-Format: `type(scope): kurze Beschreibung`

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

Immer anhängen (HEREDOC-Form):
```bash
git commit -m "$(cat <<'EOF'
type(scope): beschreibung

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
EOF
)"
```

## PR-Merge-Strategie
**Immer Squash-and-Merge** für saubere `main`-History:
```bash
gh pr merge <N> --squash --auto
```

Nach PR-Erstellung keine weiteren Commits hinzufügen — auto-merge erledigt das.

## Worktrees bevorzugen
```bash
bash scripts/worktree-create.sh <branch> .worktrees/<slug>
```
Worktrees laufen in `/tmp/` (kurzlebig). Nach Merge aufräumen:
```bash
bash scripts/worktree-create.sh --cleanup .worktrees/<slug>
```
