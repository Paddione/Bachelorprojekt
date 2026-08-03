# Proposal: worktree-divergence-guard-T002387

## Why

Der Divergence-Guard in `scripts/worktree-create.sh` (Z. 37-58) ruft `git fetch origin main:main` auf. Wenn lokales main hinter origin/main liegt und in einem anderen Worktree ausgecheckt ist, verweigert Git die Aktualisierung: `refusing to fetch into branch refs/heads/main checked out at ...` → FATAL.

## What

- Wenn main in einem anderen Worktree ausgecheckt ist, `git fetch origin main:main` vermeiden
- Stattdessen: `git fetch origin +refs/heads/main:refs/remotes/origin/main` und den Worktree von origin/main rebasen lassen

_Ticket: T002387_
