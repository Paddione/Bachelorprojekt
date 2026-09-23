## p3 — Anleitungen: unlock vor remove

Target files: `.opencode/skills/git-workflow/references/worktree-cleanup.md`,
`.opencode/skills/dev-flow-chore/SKILL.md`, `.claude/skills/references/dev-flow-execute-phases.md`,
`.claude/skills/references/repo-hygiene-ops.md`

`.claude/skills/git-workflow` und `.claude/skills/dev-flow-chore` sind Symlinks auf `.opencode/skills/…`;
die Aenderung erfolgt an der Zieldatei.

- [x] **Jede Befehlszeile `git … worktree remove <pfad> …` in diesen Dateien bekommt davor
  `git … worktree unlock <pfad> 2>/dev/null || true`** — gleicher `-C`-Kontext, gleicher Pfad.
  Betroffen: `worktree-cleanup.md` Zeile ~16, `dev-flow-chore/SKILL.md` Schritt 6 (Zeile ~160),
  `dev-flow-execute-phases.md` Zeile ~381, `repo-hygiene-ops.md` Zeilen ~151 und ~698.
  Ein Satz Begruendung je Datei hoechstens einmal: „worktree-create.sh sperrt jeden Worktree
  (T900046); `remove --force` allein scheitert daran (T900340)."

- [x] **Keine weiteren Fundstellen uebersehen.**

```bash
git grep -n 'worktree remove' -- .opencode/skills .claude/skills/references | grep -v unlock
```
