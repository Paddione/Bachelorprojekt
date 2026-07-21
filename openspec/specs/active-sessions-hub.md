# active-sessions-hub

## Purpose

Das Active Sessions Hub ist ein lokales Dev-Only-Feature, das laufende Dev-Sessions (HTML-Formulare, Brainstorm-Boards, Visual Companions) als klickbare Karten im Mediaviewer-Panel der Website sichtbar macht. Externe Nutzer (z.B. `gekko`) erreichen diese Sessions über Keycloak-gate-geschützte `sish`-Reverse-SSH-Tunnels hinter `session-*.${DEV_DOMAIN}`.

## Requirements

### Requirement: Session-Registry als Single Source of Truth

The system SHALL maintain a JSON registry at `~/.local/share/bachelorprojekt/active-sessions.json` whose entries describe one dev session each with the fields `{slug, type, title, port, public_url, local_url, tunnel_pid, server_pid, started_at}`. Mutations SHALL be atomic (write to `.tmp` then `mv`) and SHALL be performed exclusively through `scripts/session-hub.sh` subcommands.

#### Scenario: Register schreibt einen Eintrag in eine leere Registry

- **GIVEN** die Registry-Datei existiert nicht oder ist leer
- **WHEN** `bash scripts/session-hub.sh register --name foo --port 18080 --type brainstorm --title "Foo"` aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=foo` und `public_url=https://session-foo.${DEV_DOMAIN}`

#### Scenario: Register ist idempotent pro Slug (replace statt duplicate)

- **GIVEN** ein Eintrag mit `slug=dup` ist bereits in der Registry
- **WHEN** `register --name dup --port 2 --type form --title "v2"` ein zweites Mal aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=dup` und `port=2` (kein Duplikat)

#### Scenario: Reap entfernt Einträge deren PIDs nicht mehr laufen

- **GIVEN** ein Registry-Eintrag referenziert `tunnel_pid=999999` und `server_pid=999999`
- **WHEN** `bash scripts/session-hub.sh reap` aufgerufen wird
- **THEN** wird der Eintrag aus der Registry entfernt

<!-- from archive/2026-06-21-active-sessions-hub/tasks.md lines 50-244, 280-700 -->

<!-- merged from change delta active-sessions-hub.md on 2026-06-27 -->

### Requirement: Harness-Stable Session Identity for agent-lock

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id — preferring `CLAUDE_SESSION_ID` (Claude Code / opencode), then the test override `AGENT_LOCK_SID`, then the per-call Unix `SID(2)` only as a last-resort fallback. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`.

#### Scenario: CLAUDE_SESSION_ID wins over Unix SID

- **GIVEN** a Bash tool call is invoked from the Claude Code / opencode harness with `CLAUDE_SESSION_ID=claude-xyz-1234`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label execute` is executed
- **THEN** the resulting lock file has `owner_sid="claude-xyz-1234"` (the harness env, not the per-call `ps -o sess=` value)

#### Scenario: Test override AGENT_LOCK_SID remains authoritative

- **GIVEN** the environment sets `AGENT_LOCK_SID=test-sid-7`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="test-sid-7"` regardless of `CLAUDE_SESSION_ID` or Unix SID

#### Scenario: Harness-owned lock is not reaped by a different harness session

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=claude-xyz-1234`
- **WHEN** a different harness session (`CLAUDE_SESSION_ID=claude-abc-5678`) attempts `bash scripts/agent-lock.sh claim ticket T000123`
- **THEN** the claim is rejected with `AGENT-LOCK: ticket/T000123 bereits gehalten von …` and status 1

### Requirement: Pre-Commit Guards in dev-flow-plan

The system SHALL refuse to land a plan-stage commit in `dev-flow-plan` Schritt 5 unless the operator (or implementer subagent) has verified that the current branch is not `main`, that `git status --porcelain` is empty, and that the current branch matches the branch recorded in the agent-lock ticket claim. The skill text MUST contain an explicit "Pre-Commit Guard" block that surfaces these three checks as hard-coded checklist steps.

#### Scenario: dev-flow-plan blocks commit on main

- **GIVEN** the current branch is `main`
- **WHEN** an implementer subagent follows the `dev-flow-plan` Schritt 5 plan-stage commit flow
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) before any `git commit` runs

#### Scenario: dev-flow-plan requires clean working tree

- **GIVEN** `git status --porcelain` is non-empty
- **WHEN** the plan-stage commit flow is followed
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) with a "stash or commit first" message

#### Scenario: dev-flow-plan cross-checks branch against agent-lock claim

- **GIVEN** the agent-lock claim for `T000123` records `branch=fix/t000123-foo`
- **WHEN** the current `git rev-parse --abbrev-ref HEAD` returns `main` or some other branch
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) with a branch-mismatch message

### Requirement: Push-Verification Checkpoint in dev-flow-execute

The system SHALL require the implementer subagent in `dev-flow-execute` Schritt 7 to prove that the archive commit was actually pushed to `origin` before declaring the archive step complete. The proof MUST consist of: (a) `git push -u origin "$ARCHIVE_BRANCH"` exits 0, (b) `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` returns the same SHA as the local `HEAD`, (c) the subagent return contract includes the field `push_verified:<sha>`. The skill text MUST contain an explicit "Push-Verification Checkpoint" block that documents all three checks and the return-contract field.

#### Scenario: dev-flow-execute asserts push via git ls-remote

- **GIVEN** a subagent has committed the archive steps locally on `chore/plan-archive-<slug>`
- **WHEN** the archive step is followed
- **THEN** the Push-Verification Checkpoint block MUST instruct the subagent to run `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` and compare the SHA to the local HEAD before `gh pr create` runs

#### Scenario: dev-flow-execute mandates push_verified:<sha> in subagent return contract

- **GIVEN** the archive steps have been committed
- **WHEN** the subagent returns its completion summary to the orchestrator
- **THEN** the subagent return MUST include a `push_verified:<sha>` field (== local HEAD SHA after `git push`); the orchestrator MUST refuse to advance to merge / ticket-archive if the field is missing

### Requirement: Claim-Persistenz gegen reap-Race

The system SHALL persist `agent-lock.sh claim`-Lock-Dateien zuverlässig,
auch wenn direkt nach dem Schreiben ein Reaper-Lauf (`cmd_reap` oder
externer `reap`-Tick aus dem Factory-Dispatch) auf demselben Lock-Dir
läuft. Konkret:

- `_reapable()` in `scripts/agent-lock.sh` MUSS die
  Reapability-Prüfungen in der Reihenfolge `sid-alive → worktree-missing
  → sid-dead-Grace → heartbeat-ttl` ausführen. Ein **lebender** Owner-SID
  (laut `pgrep -s` für numerische IDs, bzw. `CLAUDE_SESSION_ID` als
  "always alive" für nicht-numerische IDs) MUSS die Lock-Datei **vor
  jedem** anderen Reapability-Check schützen — `return 1` (nicht
  reapable).
- `cmd_reap()` in `scripts/agent-lock.sh` MUSS vor dem iterativen
  `rm -f "$f"` über `agent-locks/*.json` dieselbe `_with_lock`-Sequenz
  aufrufen wie `cmd_claim`/`cmd_refresh`/`cmd_release`, sodass Reap und
  Claim über denselben `flock 9` auf `.registry.lock` serialisiert sind.
  Schritte 1–2c (Prozesse killen, `git worktree prune`, Branch-Cleanup)
  bleiben außerhalb des Locks, weil sie keine Lock-Dateien berühren.
- `_lock_dir()` in `scripts/agent-lock.sh` MUSS den `git-common-dir` per
  `cd "$(git rev-parse --show-toplevel)" && git rev-parse
  --git-common-dir` resolven, damit der Pfad unabhängig vom `cwd` des
  rufenden Skripts stabil ist. Der Fallback `/tmp/agent-locks` darf nur
  bei echtem `git rev-parse`-Fehler greifen.

#### Scenario: claim überlebt reap mit lebendem SID trotz fehlendem Worktree-Pfad

- **GIVEN** `AGENT_LOCK_DIR` zeigt auf ein leeres Temp-Dir und
  `CLAUDE_SESSION_ID=claude-t001384` ist gesetzt
- **AND** `agent-lock.sh claim branch fix/t001384-agent-lock-claim-persist
  --worktree /tmp/wt-that-does-not-exist --label dev-flow-plan` wurde
  erfolgreich ausgeführt (Lock-Datei existiert)
- **WHEN** `agent-lock.sh reap` in derselben Session läuft
- **THEN** ist die Lock-Datei `branch__fix-t001384-agent-lock-claim-persist.json`
  **immer noch vorhanden** (lebender SID schützt vor worktree-missing)
- **AND** der `.reap.log` enthält **keinen** Eintrag
  `branch/fix/t001384-agent-lock-claim-persist worktree-missing`

#### Scenario: reap hält den Registry-Lock und serialisiert mit parallelem claim

- **GIVEN** `AGENT_LOCK_DIR` zeigt auf ein leeres Temp-Dir
- **WHEN** zwei Subshells parallel laufen: (A) `agent-lock.sh claim ticket
  T001384 --label A` und (B) `agent-lock.sh reap`
- **THEN** ist nach Abschluss beider Prozesse **entweder** der Claim
  vollwertig vorhanden (Claim gewann den Race), **oder** der Claim wurde
  vom Reaper entfernt **bevor** `_write_lock` lief (Reap gewann) — nie
  aber: Claim schreibt die Datei, Reap löscht sie danach
  (TOCTOU)
- **AND** der Reap-Vorgang hält mindestens einmal den `.registry.lock`
  exklusiv (per `flock 9`)

#### Scenario: _lock_dir resolved identisch aus Main-Checkout und Worktree

- **GIVEN** `AGENT_LOCK_DIR` ist nicht gesetzt
- **WHEN** `_lock_dir` einmal aus `/home/patrick/Bachelorprojekt` (Main)
  und einmal aus einem Worktree-Pfad `$WT_PATH` aufgerufen wird
- **THEN** liefern beide Aufrufe denselben absoluten Pfad
  `<main-checkout>/.git/agent-locks`
- **AND** `_lock_file ticket T001384` liefert aus beiden Shells den
  identischen Ziel-Pfad

#### Scenario: zweiter claim aus anderer Session bleibt abgewiesen

- **GIVEN** ein Claim `ticket__T001384.json` mit
  `owner_sid=claude-session-A` existiert
- **WHEN** `bash scripts/agent-lock.sh claim ticket T001384
  --label other` mit `CLAUDE_SESSION_ID=claude-session-B` aufgerufen wird
- **THEN** exit status 1, stderr enthält `AGENT-LOCK: ticket/T001384
  bereits gehalten`
- **AND** die bestehende Lock-Datei wird **nicht** überschrieben (kein
  Refresh durch fremde Session)

<!-- merged from change delta active-sessions-hub.md on 2026-07-01 -->

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/active-sessions-hub.bats`) that
establishes initial, spec-linked test coverage for the active-sessions-hub SSOT spec, per the
"one BATS file per OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/active-sessions-hub.bats` exists
- **WHEN** `bats tests/spec/active-sessions-hub.bats` is run
- **THEN** the placeholder test `active-sessions-hub spec covered` passes

<!-- merged from change delta active-sessions-hub.md (72ffc78c2fef) -->