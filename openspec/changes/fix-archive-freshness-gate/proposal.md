# Proposal: fix-archive-freshness-gate

## Why

Der Archiv-PR #4083 fiel durch den Freshness-Gate: `scripts/openspec.sh archive` regenerierte
`website/src/data/openspec-status.json` zwar nach dem Move (cmd_archive, Zeile ~290), aber der
Archiv-Commit des Aufrufers staged nur `openspec/changes/` — die regenerierte JSON blieb
unstaged. CI regeneriert in `freshness:check` Phase 0 dasselbe Artefakt und diffet gegen HEAD;
der Diff war nicht leer, der Gate schlug fehl. Geheilt wurde der PR erst durch den
nachgeschobenen "chore: regenerate freshness artifacts"-Commit (6f74b77e, nur diese eine
Datei).

Der pre-commit-Auto-Stage (T001388) deckt den Pfad nicht garantiert ab: `SKIP_FRESHNESS_REGEN`
und `--no-verify` umgehen ihn, ebenso fehlende Hook-Installation. Die Dokumentation
(`.claude/skills/references/plan-archive-steps.md`) fordert das explizite Staging bereits,
aber der Script-Pfad selbst verlässt sich darauf, dass der Aufrufer die Konvention kennt.

## What

- `scripts/openspec.sh` `cmd_archive`: nach dem Status-Map-Regenerate das Ergebnis selbst
  stagen (`git -C "$REPO" add -- website/src/data/openspec-status.json`, best-effort wie der
  Status-Map-Aufruf) — damit trägt jeder nachfolgende Archiv-Commit die Datei, unabhängig von
  Hook-Zustand und Flow-Skill.
- `.opencode/skills/opencode-flow-execute/SKILL.md` Schritt 7: `git add` um
  `website/src/data/openspec-status.json` ergänzen (Defense-in-Depth, konsistent mit
  plan-archive-steps.md).
- Regressionstest: `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats`
  (Sandbox-Lauf prüft, dass die Datei nach `archive` im Git-Index liegt).
- Delta-Spec auf `openspec-workflow` (SSOT-Parent), neue Anforderung "Archive staged die
  regenerierte Status-Map für den Folge-Commit".

_Ticket: T003136_
