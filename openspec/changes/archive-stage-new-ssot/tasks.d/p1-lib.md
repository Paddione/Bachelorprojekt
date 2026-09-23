## p1 — `archive_stage_commit` stagt die Ziel-Specs der Deltas

Target files: `scripts/lib/archive-staged-scope.sh`

Requirement: agent-skills „The archive commit carries every SSOT spec its deltas target".
`scripts/lib/archive-staged-scope.sh` hat 76 Zeilen, Restbudget 724.

- [ ] **Signatur erweitern.** `archive_stage_commit <slug> [archive-flags...]`. `--no-merge` in den
  Flags setzt einen lokalen Schalter; alle anderen Flags werden ignoriert.

- [ ] **Bestehendes Staging unveraendert lassen.** Die beiden vorhandenen `git add`-Zeilen (Archiv-
  und Change-Pfade mit `-A`, Specs/Daten/Docs mit `-u`) bleiben wie sie sind (T016597).

- [ ] **Gezieltes Staging (design.md D1), nur ohne `--no-merge`.** Fuer jede Datei
  `openspec/changes/archive/*-<slug>/specs/*.md`: Ziel `openspec/specs/<basename>`. Existiert die
  Datei, `git add -- <ziel>`. Keine anderen Pfade unter `openspec/specs/` anfassen.

- [ ] **Pruefung (design.md D2), nur ohne `--no-merge`.** Fuer jedes Ziel: im Index vorhanden, wenn
  `git ls-files --error-unmatch -- <ziel>` Exit 0 liefert (deckt getrackt-unveraendert und frisch
  gestagt ab). Fehlende Ziele sammeln; ist die Liste nicht leer, auf stderr
  `archive-stage: FATAL — Ziel-Spec fehlt im Index: <pfad>` je Ziel ausgeben und `return 1`.
  Reihenfolge danach wie bisher: `archive_assert_staged_scope "$slug"`.

- [ ] **Kopfkommentar der Funktion** um einen Satz zu T900339 ergaenzen (warum `-u` allein nicht
  reicht und warum trotzdem kein `-A` auf `openspec/specs`).

- [ ] **Lib-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats -f 'Index|Bestands|fremder|fail-closed|no-merge' tests/spec/agent-skills/archive-stage-new-ssot.bats
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/archive-staged-scope.bats
# expected: alle ok
```
