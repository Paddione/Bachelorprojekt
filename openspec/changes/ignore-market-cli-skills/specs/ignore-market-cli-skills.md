# ignore-market-cli-skills — Delta-Spec

## Purpose

Markiert alle market-cli Skills als ungetrackt und erweitert die .gitignore um ein generisches Muster, das zukünftige market-cli Installationen abdeckt.

## ADDED Requirements

### Requirement: GITIGNORE-001 — Market-cli Skills werden ignoriert

Alle unter `.claude/skills/` installierten market-cli Skills (Drittanbieter) werden über ein generisches .gitignore-Muster ignoriert.

**Scenarios:**

- GIVEN a locally installed market-cli skill THEN it MUST NOT appear in `git status` as untracked
- GIVEN a tracked market-cli skill THEN `git rm --cached` MUST remove it from the index without deleting the files

### Requirement: GITIGNORE-002 — Team-eigene Skills bleiben getrackt

Eigene Skills (`dev-flow-*`, `git-workflow`, `infra-ops`, etc.) werden von der Ignore-Regel nicht betroffen.

**Scenarios:**

- GIVEN a team-owned skill THEN it MUST remain tracked in git
