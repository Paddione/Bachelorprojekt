# p7 — Rebase: Freshness-Artefakte nicht still verlieren (T003105)

## Ziel

Ein konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte ohne
Konfliktmeldung — das Artefakt verschwindet still aus dem Branch.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: Rebase über
   Freshness-Artefakt-Commit behält das Artefakt oder meldet den Verlust.
   `expected: FAIL` (still verloren).

2. **GREEN.** In `.claude/skills/git-workflow/SKILL.md` (und betroffener
   Rebase-Praxis): nach Rebase Freshness-Artefakte gegen Pre-Rebase-Stand prüfen
   (`git diff <pre-rebase> <post-rebase> -- <artefakt>`); Verlust → Meldung statt Stille.
   Falls `.gitattributes merge=ours` die Ursache ist: Rebase-Verhalten dokumentieren.

3. **Verifikation.** Fall aus T003105: Artefakt bleibt oder Verlust wird gemeldet.

## Acceptance

- Rebase verliert Freshness-Artefakte nicht mehr still.
- Verlust wird explizit gemeldet (falls unvermeidbar).

## Zusätzlich (D1-gebündelt)

Die `.claude/skills/git-workflow/SKILL.md`-Änderungen aus p4 (Stash-Netz-Doku)
und p7 (Rebase-Freshness) werden HIER in EINEM Partial zusammengeführt.
