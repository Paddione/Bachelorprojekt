# Proposal: spec-junit-shard-ignore

## Purpose (deutsch)

Mishap-Fix (T006368, drift): BATS-Läufe erzeugen JUnit-Artefakte als
`spec-junit-shard-1..4/report.xml` (untracked). `.gitignore` ignorierte nur
`junit-report/` (BATS_JUNIT_DIR, T003025) und `vitest-junit-report/`, nicht die
Shard-Form. Folge: Jeder Worktree, in dem BATS-Shard-Läufe liefen, wurde durch
die Nicht-Allowlist-Filter im `worktree-clean-check` blockiert — repo-hygiene §1
musste die Artefakte von Hand löschen, bevor der Worktree-Remove möglich war
(beobachtet an `.worktrees/review-gate-enforce`). Der Fix nimmt
`spec-junit-shard-*/` in die JUnit-Ignore-Zeile auf und verankert die Regel mit
einem BATS-Guard.

Rekonstruktion: Der Change wurde ursprünglich als OpenSpec-Change angelegt,
aber nie archiviert — die einzige Kopie ging im Hauptcheckout verloren. Dieser
Nachhol-Archiv rekonstruiert das Delta aus den gemergten PRs #4570 (chore:
`.gitignore`-Zeile) und #4563 (fix: Guard-Test + Inventar-Artefakte).

## Goals

- `.gitignore`: `spec-junit-shard-*/` neben `junit-report/` (BATS_JUNIT_DIR)
  und `vitest-junit-report/` aufnehmen — JUnit-Shard-Artefakte gelten wie alle
  anderen JUnit-Artefakte als CI-Artefakt, nie committen.
- BATS-Guard `tests/spec/dev-flow-plan/junit-shard-ignore.bats`:
  `git check-ignore -q` für `spec-junit-shard-1/report.xml` und
  `spec-junit-shard-4/report.xml` muss rc=0 liefern.
- Inventar-Artefakte (`docs/code-quality/repo-index.json`,
  `website/src/data/test-inventory.json`) regeneriert und committet.

## Non-Goals

- Keine Änderung an der Shard-Erzeugung (BATS_RUNNER Shard-Setup) — die
  Artefakt-Form bleibt bestehen, nur das Ignore-Verhalten ändert sich.
- Kein Auto-Cleanup bereits liegender Artefakte in bestehenden Worktrees — der
  Fix verhindert nur neue Blockaden.
- Keine Regel für weitere, zukünftige Artefakt-Formen — nur die heute
  beobachtete Shard-Form.

_Ticket: T006368_
