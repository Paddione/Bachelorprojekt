# p2 — repo-hygiene-ops.md §1-§3 Runbook-Fixes (T003183, T003181, T003224, T003227)

<!-- S1-Budget: .claude/skills/references/repo-hygiene-ops.md — Markdown, kein S1-Gate (Limit 0) -->

## Ziel

Alle Text- und Verfahrensänderungen im Runbook in EINEM Partial (D1: die Datei
darf nur in einem Partial liegen). Deckt vier Kinder ab:

- T003183: §2 [gone]-Prune-Reihenfolge + Archiv-Tag-Signal
- T003181: §3 merge-tree Konfliktprobe statt invasivem Merge
- T003224: §3 gh pr checks — cancelled ≠ fail, Gegenprobe
- T003227: §1 Factory-Tick-Vorcheck + Messung vor Remove

## Ist-Stand (nach Teil-Implementierung c8e68ba97)

Alle vier Textänderungen sind in `.claude/skills/references/repo-hygiene-ops.md`
bereits committet (Marker T003183/T003181/T003224/T003227 vorhanden). §2 zeigt den
Sweep-Aufruf als `--sweep` (Z.~149: "Reaper VOR [gone]-Prune"; Z.~226-235:
`--sweep --dry-run` / `--sweep`). Dieser Partial ist damit im Kern GRÜN — offen ist
nur der Abgleich mit den main-Änderungen T003109/T003550 (nach Rebase bereits
automatisch zusammengeführt) und die p5-Textvertrag-Tests (grün).

## Steps

1. **RED.** Tests in `tests/spec/batch-repo-hygiene-ops-fixes.bats` (in p5 geschrieben,
   hier nur referenziert): `expected: FAIL`.

2. **GREEN — §2 (T003183).** In `.claude/skills/references/repo-hygiene-ops.md` §2:
   - Reihenfolge umdrehen (Reaper VOR [gone]-Prune), ODER
   - Archiv-Tag als zweites zulässiges Positiv-Signal dokumentieren
     (`git rev-parse --verify refs/tags/reaped/$b` vorhanden → `git branch -D` belegt sicher).

3. **GREEN — §3 (T003181).** `git merge-tree --write-tree --name-only origin/main <branch>`
   als primäre Konflikt-Gegenprobe dokumentieren (Exit 0 + Tree-SHA = konfliktfrei,
   Exit ≠ 0 + Dateiliste = echter Konflikt); Arbeitsbaum-Merge nur wenn Konfliktmarker
   sichtbar sein sollen. Reihenfolge "mergeStateStatus → probe" bleibt.

4. **GREEN — §3 (T003224).** Bei rot gemeldetem Check IMMER
   `gh run view <run> --json jobs -q '.jobs[]|select(.conclusion=="failure")'`
   gegenprüfen — cancelled/skipped ist kein failure, Re-Run genügt.

5. **GREEN — §1 (T003227).** Factory-Tick-Vorcheck (tick_running) VOR §1; bei laufendem
   Tick Worktree-Sektion überspringen oder --porcelain-Prüfung unmittelbar vor dem Remove.

6. **Verifikation.** Fälle aus T003183/T003181/T003224/T003227 laufen nach Runbook.

## Acceptance

- Runbook beschreibt die korrigierten Verfahren (Reihenfolge, merge-tree, cancelled-Probe,
  tick-Vorcheck).
- Keine invasive Konfliktprobe mehr als Primärweg dokumentiert.
