# Behavior: Nie direkt auf main pushen

**HARD RULE:** Commits direkt auf `main` und `git push origin main` sind verboten.

Alle Änderungen laufen über Pull Requests:
1. Feature-Branch erstellen: `git checkout -b feature/<slug>` (oder `fix/*`, `chore/*`)
2. Auf dem Branch arbeiten und committen
3. Branch pushen und PR öffnen: `commit-commands:commit-push-pr` Skill oder `gh pr create`
4. Mergen erst wenn CI grün und PR approved ist: `gh pr merge <N> --squash --auto`

**In Worktrees arbeiten** (bevorzugt):
```bash
bash scripts/worktree-create.sh <branch> .worktrees/<slug>
```
Die `dev-flow-plan`- und `using-git-worktrees`-Skills automatisieren das.

**Pre-commit-Hook feuert mit "main-checkout locked":** Eine andere Session hält den main-Lock.
Lösung: In einem Worktree arbeiten, nicht Force-pushen.
