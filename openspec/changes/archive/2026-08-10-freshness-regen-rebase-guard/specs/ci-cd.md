## ADDED Requirements

### Requirement: git-workflow rebased vor dem Freshness-Regen-Lauf gegen origin/main

Der `git-workflow`-Skill MUSS in Schritt 1 (Verifikation & Freshness Guard), unmittelbar vor
dem Verweis auf `task freshness:regenerate`, einen expliziten Divergenz-Check gegen
`origin/main` beschreiben (`git fetch origin main` + `git rev-list --count HEAD..origin/main`)
und bei Divergenz > 0 ein Rebase auf `origin/main` **vor** der Regeneration verlangen. Damit
wird vermieden, dass Freshness-Artefakte gegen eine Baumkonfiguration erzeugt werden, die
bereits beim Push wieder hinter `origin/main` zurückliegt (T002669 / Mishap PR #3788).

#### Scenario: git-workflow Schritt 1 beschreibt einen Rebase-Preflight vor dem Regen-Lauf *(BATS, source verification)*

- **GIVEN** `.claude/skills/git-workflow/SKILL.md`
- **WHEN** der Abschnitt "Schritt 1 — Verifikation & Freshness Guard" gelesen wird
- **THEN** enthält er vor dem Verweis auf `task freshness:regenerate` einen expliziten
  `origin/main`-Divergenz-Check (`git rev-list --count HEAD..origin/main` oder äquivalent)
  und eine Anweisung, bei Divergenz zuerst zu rebasen

#### Scenario: Schritt 0 (Pull-First) bleibt als eigener, früherer Checkpoint erhalten *(BATS, control test)*

- **GIVEN** `.claude/skills/git-workflow/SKILL.md`
- **WHEN** der Abschnitt "Schritt 0 — Pull-First" gelesen wird
- **THEN** enthält er weiterhin `git pull --rebase origin main`, unverändert durch diese Änderung
