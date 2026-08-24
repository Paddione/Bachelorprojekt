## MODIFIED Requirements

### Requirement: Interrupted git operations in worktrees are surfaced as a finding

The repository SHALL provide a guard that inspects every registered git worktree for an
interrupted git operation — an in-progress rebase (`rebase-merge` or `rebase-apply`), merge
(`MERGE_HEAD`) or cherry-pick (`CHERRY_PICK_HEAD`) — and reports each affected worktree.

The guard SHALL resolve the state directory per worktree (not from the caller's own git
directory), SHALL exit non-zero when at least one worktree is affected so that automation
fails closed, and SHALL exit zero when no worktree is affected.

**When invoked without an explicit completion request, the guard SHALL NOT attempt to complete,
continue or abort the operation it finds.** Repairing a foreign worktree's rebase can produce a
wrong commit on a branch the caller does not own; by default the guard reports and leaves the
decision to the operator.

The guard SHALL additionally accept an opt-in `--finish` mode. In that mode it SHALL complete an
interrupted rebase **only** where all three of the following hold, and SHALL otherwise merely
report:

- the rebase has no unresolved conflicts, and
- no rebase commands remain pending (`rebase-merge/git-rebase-todo` is empty or absent), and
- the working tree is clean under the generated-artifact allowlist used by
  `scripts/worktree-clean-check.sh`.

Within that intersection completing the rebase produces no new content — it records the state the
operator already resolved. Outside it, the reasoning behind the default prohibition applies
unchanged.

Where `--finish` completes a rebase, it SHALL verify the result from a **positive** signal and
SHALL NOT treat the exit code of `git rebase --continue` as the verdict: the rebase state
directory is gone **and** the branch ref resolves to the same commit as `HEAD`. `git rebase
--continue` has been observed exiting 0 while writing `error: update_ref failed` to stderr, so an
exit-code-based judgement can report a success that did not happen. Where the verification fails,
`--finish` SHALL report the worktree as still affected and SHALL exit non-zero.

`--finish` SHALL NOT act on interrupted merges, cherry-picks, or rebases with unresolved
conflicts.

#### Scenario: Ein Worktree steht mitten in einem Rebase

- **GIVEN** ein Worktree, in dem ein Rebase mit Konflikt begonnen und nicht abgeschlossen wurde
- **WHEN** der Guard ausgeführt wird
- **THEN** nennt seine Ausgabe den Pfad dieses Worktrees
- **AND** endet er mit einem Exit-Code ungleich 0

#### Scenario: Alle Worktrees sind ohne laufende Operation

- **GIVEN** kein Worktree hat eine unterbrochene git-Operation
- **WHEN** der Guard ausgeführt wird
- **THEN** endet er mit Exit-Code 0

#### Scenario: Der Guard repariert nichts

- **GIVEN** ein Worktree steht mitten in einem Rebase mit bereits aufgelösten Konflikten
- **WHEN** der Guard **ohne** `--finish` ausgeführt wird
- **THEN** besteht das Rebase-Zustandsverzeichnis dieses Worktrees danach unverändert fort

#### Scenario: --finish schließt den maschinell sicheren Fall ab

- **GIVEN** ein Worktree mit unterbrochenem Rebase ohne offene Konflikte, ohne verbleibende
  Kommandos und mit nach Allowlist sauberem Working Tree
- **WHEN** der Guard mit `--finish` ausgeführt wird
- **THEN** ist das Rebase-Zustandsverzeichnis danach verschwunden
- **AND** zeigt der Branch-Ref auf denselben Commit wie `HEAD`

#### Scenario: --finish fasst einen Rebase mit offenen Konflikten nicht an

- **GIVEN** ein Worktree mit unterbrochenem Rebase, in dem Konflikte ungelöst sind
- **WHEN** der Guard mit `--finish` ausgeführt wird
- **THEN** besteht das Rebase-Zustandsverzeichnis danach unverändert fort
- **AND** endet der Guard mit einem Exit-Code ungleich 0

#### Scenario: --finish fasst einen Rebase mit nicht-allowlisteter Abweichung nicht an

- **GIVEN** ein Worktree mit unterbrochenem Rebase ohne offene Konflikte und ohne verbleibende
  Kommandos, dessen Working Tree aber eine Abweichung außerhalb der Generat-Allowlist trägt
- **WHEN** der Guard mit `--finish` ausgeführt wird
- **THEN** besteht das Rebase-Zustandsverzeichnis danach unverändert fort
- **AND** endet der Guard mit einem Exit-Code ungleich 0

#### Scenario: --finish fasst einen unterbrochenen Merge nicht an

- **GIVEN** ein Worktree mit einem unterbrochenen Merge (`MERGE_HEAD` vorhanden)
- **WHEN** der Guard mit `--finish` ausgeführt wird
- **THEN** ist `MERGE_HEAD` danach unverändert vorhanden

#### Scenario: --finish urteilt nicht nach dem Exit-Code

- **GIVEN** ein Rebase, dessen Abschluss den Zustand nicht herstellt (Zustandsverzeichnis bleibt
  bestehen oder Branch-Ref und `HEAD` laufen auseinander)
- **WHEN** der Guard mit `--finish` ausgeführt wird
- **THEN** meldet er den Worktree weiterhin als betroffen
- **AND** endet er mit einem Exit-Code ungleich 0
