# Worktree-Cleanup (git-workflow Schritt 7 — Detail)

Nur wenn in einem `.worktrees/*`-Worktree gearbeitet wurde:

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
# Agent-Lock freigeben (T006290): erst im Haupt-Repo — aus dem Worktree heraus verweigert
# agent-lock.sh den Branch-Release. Ohne stderr-Unterdrückung, damit eine Verweigerung
# sichtbar bleibt. Lebenszyklus-SSOT: .agents/skills/references/session-coordination.md
bash scripts/agent-lock.sh release ticket "<T00XXXX>"
bash scripts/agent-lock.sh release branch "$BRANCH_NAME"
git worktree unlock "$WORKTREE_PATH" 2>/dev/null || true   # worktree-create.sh sperrt jeden Worktree (T900046) — sonst Exit 128 beim Remove (T900340)
git worktree remove "$WORKTREE_PATH"
git worktree prune

# T004612: der Merge löscht den Remote-Branch nicht — erst hier, NACH dem Archiv, löschen.
git push origin --delete "$BRANCH_NAME"
# Squash-Commit ist ein neuer Commit, `git branch -d` würde fehlschlagen; `-D` ist nötig.
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  git branch -D "$BRANCH_NAME"
fi
```

## Worktree-Erstellung — zwei Wege, nur einer ist git-crypt-sicher

1. **`scripts/worktree-create.sh` (empfohlen):** legt den Worktree mit Kopie des
   git-crypt-Keys an und neutralisiert die smudge/clean/required-Filter. Immer
   verwenden, wenn der Branch `environments/.secrets/**` beruehrt.

   ```bash
   bash scripts/worktree-create.sh <branch> .worktrees/<slug>
   ```

2. **opencode-Plugin `worktree_create` (`worktree.ts`):** `git worktree add` **ohne** die
   git-crypt-Filter zu neutralisieren. Scheitert auf verschluesselten Pfaden (exit 128) oder
   hinterlaesst `environments/.secrets/**` unbrauchbar. **Bekannte Einschraenkung:** nur fuer
   Branches sicher, die keine git-crypt-Pfade beruehren.
