# p2 — RED-Test + Delta-Spec (Tests-Rolle)

_Ticket: T007032 · Partial p2 (tests) · IMMER zuletzt · haengt an p1_

## Ziel

Der RED-Test `tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats` ist der Beleg fuer den
Befund aus T007032: Er ist mit diesem Plan committet (Stage-Commit) und faellt auf dem
jetzigen Stand rot (die Positiv-Anker scheitern, weil das MERGED-PR-Signal fehlt). Nach p1
sind alle Faelle gruen. Die Delta-Spec `openspec/changes/branch-reaper-keep-allowlist/
specs/ci-cd.md` wird gegen die Implementierung abgeglichen.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats
# expected: FAIL (red — die Positiv-Anker 1/2/3 scheitern: '^REAP ' enthaelt fix/merged-T009010
# bzw. fix/succ-T009014 bzw. fix/merged-ticketmode-T009019 nicht; die Negativ-Tests faellen
# ueber ihren In-Lauf-Anker)
```

Syntax-Pruefung nur ueber `bats --count`, nicht `bash -n` (T002351-M2): `@test "name" { … }`
ist keine gueltige Bash-Syntax.

## Steps

1. **RED bestaetigen.** Der Test liegt bereits auf dem Branch (Stage-Commit). Er laeuft gegen
   ein Wegwerf-Fixture (git init in BATS_TEST_TMPDIR, eigenes bare Remote, gh-/ticket.sh-Stubs)
   — niemals gegen das echte Repo: ohne `--dry-run` loescht das Skript Remote-Branches.
   Erwartung: alle 9 Faelle rot (Anker 1/2/3 + Negativ-Tests ueber ihren Anker).
2. **Gruen nach p1.** Nach Abschluss von p1:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats
   # erwartet: 9/9 ok
   ```
3. **Regression:** die bestehenden Reaper-Tests bleiben gruen — die alten gh-Stubs antworten
   auf die neuen Abfragen (`--state merged`) mit `[]`, es darf kein Positiv-Signal entstehen
   und kein bestehender Fall kippen:
   ```bash
   tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/branch-reaper.bats tests/spec/ci-cd/branch-reaper-freshness-regen.bats tests/spec/ci-cd/branch-reaper-sweep.bats tests/spec/ci-cd/branch-reaper-empty-answer.bats tests/spec/ci-cd/branch-reaper-local-ref.bats
   ```
4. **Delta-Spec-Finalisierung.** `openspec/changes/branch-reaper-keep-allowlist/specs/ci-cd.md`
   gegen die implementierte Semantik abgleichen: ADDED-Requirement „Merged Pull Requests Are a
   Positive Reaping Signal" deckt Signal 1 (headRefOid == Tip), Signal 2 (identische Blobs auf
   der gesamten Divergenzmenge, nur MERGED-Nachfolger), die KEEP-Faelle und die Unveraendert-
   Klauseln (freshness-Klasse, Loeschmechanik). Widerspricht die Implementierung der Spec, die
   Spec korrigieren — nicht umgekehrt.
5. **Finale Verifikation.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Acceptance

- Alle 9 Testfaelle gruen, Regression gruen, Delta-Spec deckt das implementierte Verhalten.
