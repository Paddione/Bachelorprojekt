---
title: "p2 — Call-Site Migration"
status: pending
depends_on: [p1]
---

# p2 — Call-Site Migration

## Aufgabe

Ersetze `git worktree prune 2>/dev/null || true` durch den Aufruf von
`worktree_prune_safe` in allen bestehenden Aufrufstellen.

## Ersetzungen

In jeder der folgenden Dateien:

1. **Source die Library** (vor dem ersten Prune-Aufruf):
   ```bash
   HERE="$(dirname "${BASH_SOURCE[0]}")"
   . "$HERE/lib/worktree-prune-safe.sh" 2>/dev/null || true
   ```

2. **Ersetze `git worktree prune`** durch:
   ```bash
   worktree_prune_safe 2>/dev/null || true
   ```

## Betroffene Dateien

### `scripts/agent-lock-reap.sh` (ca. Zeile 163)

Im `cmd_reap()` Body: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

### `scripts/factory/cleanup.sh` (ca. Zeile 58)

Post-remove housekeeping: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

### `scripts/factory/dsh-exec.sh` (ca. Zeile 214)

Vor/Nach worktree ops: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

### `scripts/factory/opencode-exec.sh` (ca. Zeile 311)

Vor/Nach worktree ops: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

### `scripts/factory/watchdog.sh` (ca. Zeile 147)

Stale detection loop: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

### `scripts/worktree-create.sh` (ca. Zeile 327)

Idempotency prune: `git worktree prune 2>/dev/null || true` → `worktree_prune_safe 2>/dev/null || true`

## Akzeptanzkriterien

- [ ] Alle 6 Dateien wurden modifiziert
- [ ] Kein `git worktree prune` mehr in den genannten Dateien (nur noch `worktree_prune_safe`)
- [ ] Die Library wird korrekt sourced (relativer Pfad zur Library)
- [ ] Semantik bleibt non-fatal (exit 0 im Fehlerfall)
