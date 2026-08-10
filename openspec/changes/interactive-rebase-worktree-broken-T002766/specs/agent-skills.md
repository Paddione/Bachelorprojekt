## ADDED Requirements

### Requirement: Interrupted git operations in worktrees are surfaced as a finding

The repository SHALL provide a guard that inspects every registered git worktree for an
interrupted git operation — an in-progress rebase (`rebase-merge` or `rebase-apply`), merge
(`MERGE_HEAD`) or cherry-pick (`CHERRY_PICK_HEAD`) — and reports each affected worktree.

The guard SHALL resolve the state directory per worktree (not from the caller's own git
directory), SHALL exit non-zero when at least one worktree is affected so that automation
fails closed, and SHALL exit zero when no worktree is affected.

The guard SHALL NOT attempt to complete, continue or abort the operation it finds. Repairing a
foreign worktree's rebase can produce a wrong commit on a branch the caller does not own; the
guard reports and leaves the decision to the operator.

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
- **WHEN** der Guard ausgeführt wird
- **THEN** besteht das Rebase-Zustandsverzeichnis dieses Worktrees danach unverändert fort

### Requirement: The interrupted-operation check precedes the allowlist-filtered cleanliness check

The repo-hygiene worktree procedure in `.claude/skills/references/repo-hygiene-ops.md` SHALL run
the interrupted-operation guard BEFORE the allowlist-filtered `git status --porcelain` precheck,
and SHALL state why the ordering is required.

The reason is structural, not stylistic: a rebase that is interrupted after its conflicts were
resolved and staged leaves only the resolved paths in `git status --porcelain`. The conflicts
that trigger these rebases are almost exclusively freshness artifacts under `website/src/data/`
and `docs/code-quality/` — precisely the paths the generat allowlist removes. After filtering,
the output is empty and the broken worktree is classified as clean. The allowlist-filtered check
therefore cannot detect this state at all, no matter how carefully it is performed.

#### Scenario: Reihenfolge im Runbook

- **GIVEN** der Abschnitt „Stale Git Worktrees" in `repo-hygiene-ops.md`
- **WHEN** ein Operator ihn von oben nach unten abarbeitet
- **THEN** trifft er den Guard-Aufruf vor dem allowlist-gefilterten `--porcelain`-Vorcheck
- **AND** findet dort die Begründung, dass die Allowlist genau diesen Zustand wegfiltert

#### Scenario: Der Stale-Worktree-Audit der Planungs-Skill ruft den Guard auf

- **GIVEN** der Stale-Worktree-Audit in `.claude/skills/dev-flow-plan/SKILL.md` (Schritt −1)
- **WHEN** eine Session ihn abarbeitet
- **THEN** ruft sie den Guard neben `git worktree list` auf
