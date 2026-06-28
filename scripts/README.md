# scripts/

Bash utility scripts for the Workspace MVP platform (~164 files).

## Entry point

Use the VDA oracle to find and run the right task instead of calling scripts directly:

```bash
bash scripts/vda.sh oracle '<goal in plain English>'
# Example: bash scripts/vda.sh oracle 'deploy website mentolder'
```

## Key scripts by function

| Script | Purpose |
|--------|---------|
| `env-resolve.sh` | Source to export per-env config vars (never execute directly) |
| `env-generate.sh` | Generate plaintext secrets for an environment |
| `worktree-create.sh` | Create a git worktree for branch work |
| `agent-lock.sh` | File-based session claim/release for parallel agents |
| `agent-msg.sh` | Inter-session message broadcast |
| `backup-restore.sh` | Orchestrate DB + PVC backup/restore |
| `health-goals-check.sh` | Check repository health goals (G-* targets) |
| `plan-context.sh` | Inject active plan context into agent prompts |
| `vda.sh` | VDA oracle — resolve task commands via local LLM |

## Conventions

Scripts that are meant to be sourced (not executed) contain `return 1 2>/dev/null || exit 1`
at error paths. Never run `bash scripts/env-resolve.sh` directly — always `source` it.
