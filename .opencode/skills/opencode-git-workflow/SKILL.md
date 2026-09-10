---
name: opencode-git-workflow
description: 'Use whenever committing, pushing, creating a PR, or finishing work on any branch in opencode. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.'
---

# opencode-git-workflow — Verweis auf die SSOT

**Der Inhalt dieses Skills steht in [`.opencode/skills/git-workflow/SKILL.md`](.opencode/skills/git-workflow/SKILL.md).
Lies dort weiter und folge dem Ablauf von dort.**

## Warum hier nur ein Verweis steht [T900024]

Diese Datei war bis T900024 eine **unabhaengige Kopie** von
`.claude/skills/git-workflow/SKILL.md` — 319 gegen 321 Zeilen, mit inhaltlicher
Drift in beide Richtungen. Die auffaelligste: die Claude-Code-Fassung zitierte
`T069/T070`, wo hier `T003069/T003070` stand. Nachweisbar richtig sind die
sechsstelligen IDs (`openspec/changes/archive/2026-08-14-batch-git-worktree-integrity/`);
die kurzen waren Kuerzungsfehler. Wer zwei Kopien pflegt, pflegt am Ende zwei
verschiedene Ablaeufe — und merkt es erst, wenn eine Session dem falschen folgt.

Die Zusammenfuehrung ist in die SSOT gelaufen. Uebernommen wurde daraus auch der
Abschnitt **„Worktree-Erstellung"** (die git-crypt-Einschraenkung des
opencode-Plugins `worktree_create`), der nur in dieser Fassung stand.

**Kein Symlink:** T900077 hat die Symlinks unter `.opencode/skills/` bewusst
durch echte Verzeichnisse ersetzt (SSOT-Flip). Ein Verweis-Dokument erreicht
dasselbe Ziel — eine Quelle, kein zweiter Ablauf — ohne diese Entscheidung
umzudrehen, und laesst alle bestehenden Referenzen auf den Skill-Namen
`opencode-git-workflow` (OVERVIEW.md, `docs/agent-guide/registry/tools.yaml`,
`docs/agent-guide/20-werkzeuge.md`) gueltig.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Use `git-workflow` directly |
| **opencode** | Full — this entry redirects to `.opencode/skills/git-workflow/SKILL.md` |
| **agy** | Full — treat the opencode path as authoritative |
