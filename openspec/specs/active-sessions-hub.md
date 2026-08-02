# active-sessions-hub

## Purpose

Das Active Sessions Hub ist ein lokales Dev-Only-Feature, das laufende Dev-Sessions (HTML-Formulare, Brainstorm-Boards, Visual Companions) als klickbare Karten im Mediaviewer-Panel der Website sichtbar macht. Externe Nutzer (z.B. `gekko`) erreichen diese Sessions über Pocket-ID-gate-geschützte `sish`-Reverse-SSH-Tunnels hinter `session-*.${DEV_DOMAIN}`.

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

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id, resolved in this order: the test override `AGENT_LOCK_SID` first, then the harness session variables (`CLAUDE_CODE_SESSION_ID`, then `CLAUDE_SESSION_ID`), and only as a last resort the per-call Unix `SID(2)`. The test override MUST take precedence over the harness variables, because the harness exports them ambiently into every session — an override that ambient state can outrank is not an override.

The system SHALL resolve the tool class of the caller by the same principle: the test override `AGENT_LOCK_TOOL` first, then the ambient harness markers. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`.

#### Scenario: Test override AGENT_LOCK_SID outranks the ambient harness variable

- **GIVEN** the harness has exported `CLAUDE_CODE_SESSION_ID=harness-abc` into the environment
- **AND** the caller sets `AGENT_LOCK_SID=test-sid-7`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="test-sid-7"`

#### Scenario: Harness session id wins over the per-call Unix SID

- **GIVEN** a Bash tool call is invoked from the harness with `CLAUDE_CODE_SESSION_ID=claude-xyz-1234` and no `AGENT_LOCK_SID`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label execute` is executed
- **THEN** the resulting lock file has `owner_sid="claude-xyz-1234"` (the harness env, not the per-call `ps -o sess=` value)

#### Scenario: Test override AGENT_LOCK_TOOL outranks the ambient harness markers

- **GIVEN** the harness has exported `CLAUDECODE=1` and `CLAUDE_CODE_SESSION_ID` into the environment
- **AND** the caller sets `AGENT_LOCK_TOOL=gemini`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `tool="gemini"`

#### Scenario: Harness-owned lock is not reaped by a different harness session

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=claude-xyz-1234`
- **WHEN** a different harness session (`CLAUDE_CODE_SESSION_ID=claude-abc-5678`) attempts `bash scripts/agent-lock.sh claim ticket T000123`
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
- **Der Worktree+Branch-Match (Session-Resume, Regel 0b) MUSS die
  Heartbeat-TTL respektieren:** Er schützt die Lock-Datei nur, solange
  `heartbeat_at` jünger als `AGENT_LOCK_TTL` ist (oder das Feld fehlt).
  Ist der Heartbeat abgelaufen, MUSS `_reapable()` den Lock unabhängig
  vom Worktree-Match als reapable werten (Reap-Grund `heartbeat-ttl`).
  Ein Session-Resume erneuert den Heartbeat über Re-Claim/`refresh`; ein
  toter Halter ruft nichts mehr auf und sein Lock wird nach Ablauf der
  TTL entfernt.
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

#### Scenario: Worktree+Branch-Match schützt den Lock nur bei frischem Heartbeat

- **GIVEN** Lock `ticket__T002513.json` existiert mit `owner_sid` einer
  toten numerischen Session, toter `owner_pid`, `worktree` einem
  existierenden Git-Repo auf Branch `probe-branch`, `branch=probe-branch`
  und `heartbeat_at` älter als `AGENT_LOCK_TTL`
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** wird die Lock-Datei entfernt
- **AND** der `.reap.log` enthält einen Eintrag
  `ticket/T002513 heartbeat-ttl`

#### Scenario: Worktree+Branch-Match mit frischem Heartbeat überlebt reap

- **GIVEN** Lock `ticket__T002513b.json` existiert mit toter `owner_sid`
  und toter `owner_pid`, passendem Worktree+Branch-Match und
  `heartbeat_at` jünger als `AGENT_LOCK_TTL`
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** bleibt die Lock-Datei bestehen (Resume-Semantik bleibt
  erhalten — Regel 0b verliert ihre Schutzfunktion nicht)
- **AND** der `.reap.log` enthält **keinen** Eintrag für diesen Lock

#### Scenario: Altformat ohne heartbeat_at bleibt durch Regel 0b geschützt

- **GIVEN** Lock `ticket__T002513c.json` existiert ohne `heartbeat_at`-Feld,
  mit toter `owner_sid`, toter `owner_pid` und passendem
  Worktree+Branch-Match
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** bleibt die Lock-Datei bestehen (kein Reap für prä-Heartbeat-Claims)

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/active-sessions-hub.bats`) that
establishes initial, spec-linked test coverage for the active-sessions-hub SSOT spec, per the
"one BATS file per OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/active-sessions-hub.bats` exists
- **WHEN** `bats tests/spec/active-sessions-hub.bats` is run
- **THEN** the placeholder test `active-sessions-hub spec covered` passes

<!-- merged from change delta active-sessions-hub.md (72ffc78c2fef) -->

<!-- merged from change delta active-sessions-hub.md (68c160604856) -->

### Requirement: Releasing a foreign live lock requires --force

The system SHALL permit `agent-lock.sh release` without `--force` only when the caller owns the lock (`owner_sid` equals the caller's session id) or when the recorded owner session is no longer alive. Matching tool class alone SHALL NOT authorise a release: in normal operation every participating session reports the same tool class, so such a rule would make the ownership check vacuous.

When a release is refused, the system SHALL exit with status 1 and emit a diagnostic line to stderr naming the owning session id, the caller's session id, and the `--force` escape hatch.

The same ownership rule SHALL apply to `agent-lock.sh refresh`: a session SHALL NOT extend the heartbeat of a lock held by a different live session.

#### Scenario: Release of a live foreign lock is refused

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `tool=claude`, and `session-A` is alive
- **WHEN** a caller with session id `session-B` and tool class `claude` runs `bash scripts/agent-lock.sh release ticket T000123`
- **THEN** the command exits with status 1
- **AND** stderr names `session-A`, `session-B` and `--force`
- **AND** the lock file still exists

#### Scenario: Release with --force succeeds against a live foreign lock

- **GIVEN** the same live foreign lock as above
- **WHEN** the caller runs `bash scripts/agent-lock.sh release ticket T000123 --force`
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Release of an abandoned lock succeeds without --force

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `session-A` is no longer alive
- **WHEN** a caller with a different session id runs `bash scripts/agent-lock.sh release ticket T000123`
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Own lock is released without --force across tool-call boundaries

- **GIVEN** a lock claimed by the current harness session
- **WHEN** the same session runs `bash scripts/agent-lock.sh release` from a later, separate Bash invocation
- **THEN** the command exits with status 0 without requiring `--force`

#### Scenario: Refresh of a live foreign lock is refused

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `tool=claude`, and `session-A` is alive
- **WHEN** a caller with session id `session-B` and tool class `claude` runs `bash scripts/agent-lock.sh refresh ticket T000123`
- **THEN** the command exits with a non-zero status and `heartbeat_at` in the lock file is unchanged

### Requirement: Lock guard tests must not depend on ambient harness environment

The system SHALL provide the test overrides `AGENT_LOCK_SID` and `AGENT_LOCK_TOOL` so that BATS coverage of the ownership guards can state its preconditions explicitly. Tests covering these guards MUST set both overrides rather than relying on which harness variables happen to be exported, so that the same verdict is produced in CI and in an interactive agent session.

#### Scenario: Guard tests produce the same verdict with and without harness environment

- **GIVEN** the BATS files covering `agent-lock.sh` release and refresh guards
- **WHEN** they are run once with `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` exported and once with both unset
- **THEN** both runs report identical pass/fail results

<!-- merged from change delta active-sessions-hub.md (ca5a66df033d) -->