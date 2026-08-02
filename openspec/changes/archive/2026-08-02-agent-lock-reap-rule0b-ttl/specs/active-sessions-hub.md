## MODIFIED Requirements

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
