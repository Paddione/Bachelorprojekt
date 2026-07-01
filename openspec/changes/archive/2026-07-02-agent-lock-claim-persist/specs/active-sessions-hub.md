# Delta Spec: active-sessions-hub — Claim-Persistenz gegen reap-Race

> Source: T001384 (`fix(dev-tooling): agent-lock.sh claim branch persistiert
> Lock-Datei nicht zuverlässig`). Erweitert
> `openspec/specs/active-sessions-hub.md` um eine Requirement, die die
> Reihenfolge der Reapability-Checks in `scripts/agent-lock.sh` und die
> Lock-Serialisierung in `cmd_reap` festzieht.

## ADDED Requirements

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
