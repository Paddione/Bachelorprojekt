# Proposal: factory-branch-switch-guard

## Why

Mehrere Agenten-Sessions teilen sich denselben main-Checkout (T000510
Session-Koordination). `.githooks/pre-commit` blockt Commits im main-Checkout hart, wenn
eine andere lebende Session den `main-checkout`-Lock hält — aber `.githooks/post-checkout`
warnt bei einem Branch-Wechsel nur (nie Exit ≠ 0). Ein Audit von `scripts/factory/*` (Ticket
T001383) fand keinen aktuellen Live-Bug: `pipeline.js` isoliert Ticket-Implementierung
korrekt in dedizierten Worktrees. Das Ticket ist präventiv/hardening: es soll strukturell
verhindert werden, dass (a) künftiger Factory-Code jemals einen rohen `git checkout`/
`git switch` gegen den geteilten main-Checkout ausführt, und (b) ein Branch-Wechsel einer
Fremd-Session im main-Checkout unkorrigiert bleibt, während eine andere Session dort
claimt zu arbeiten.

Git bietet keinen blockierenden `pre-checkout`-Hook — echte Prävention ist nur für den
Factory-Code-Pfad möglich (statischer CI-Guard). Für den interaktiven Pfad ist nur ein
Best-effort-Revert nach dem Fakt erreichbar, siehe
`docs/superpowers/specs/2026-07-01-factory-branch-switch-guard-design.md` für die volle
Root-Cause-Analyse und Edge-Case-Abwägung (insbesondere die Rebase/Merge-Exemption, ohne
die ein Revert legitime `git pull --rebase origin main`-Syncs anderer Sessions zerstören
würde).

## What

1. **Statischer Factory-Guard-Test** (`tests/spec/factory-branch-switch-guard.bats`): schlägt
   fehl (CI-gated), sobald ein Skript unter `scripts/factory/` einen `git checkout`/
   `git switch` gegen den main-Checkout ausführt (worktree-scoped Aufrufe `-C "$WORK_WT"`
   bleiben erlaubt).
2. **`scripts/agent-lock.sh::cmd_guard_postcheckout`**: neue Rebase/Merge/Cherry-Pick-
   Exemption (kein Revert/keine Warnung während `.git/rebase-merge`, `rebase-apply`,
   `MERGE_HEAD`, `CHERRY_PICK_HEAD`) + best-effort Revert auf den im `main-checkout`-Lock
   hinterlegten `branch`-Namen (niemals auf eine rohe SHA), gated durch
   `AGENT_LOCK_POSTCHECKOUT_REVERT` (default an).
3. **`scripts/agent-lock.sh::cmd_guard_precommit`**: self-claims/refresht den
   `main-checkout`-Lock mit `--branch "$(git rev-parse --abbrev-ref HEAD)"` nach jedem
   erfolgreichen Commit im main-Checkout, damit Schritt 2 ein verlässliches Revert-Ziel hat
   (bisher wird der Lock kaum aktiv geclaimt).

_Ticket: T001383_
