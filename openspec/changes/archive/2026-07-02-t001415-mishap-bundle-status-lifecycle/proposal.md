# Proposal: t001415-mishap-bundle-status-lifecycle

## Why

Ein `mishap-tracker`-Aggregat-Ticket (T001415, priority mittel, severity minor,
attention_mode ai_ready) bündelt drei unabhängige Findings aus derselben
ticket-ops-Sitzung am 2026-07-01. Alle drei sitzen in der dev-flow
Lock/Merge/Auto-Close-Kette, und **Mishap 3 (Auto-Close-Defizit) ist der
Headline-Fix** — drei unabhängig beobachtete Vorfälle in einer Sitzung
(T001371, T001412, T001414), bei denen gemergte PRs nicht zu
`done`-Tickets geführt haben und manuell nachgeschlossen werden mussten.

1. **`scripts/agent-lock.sh` reapt Lock nicht, wenn der Owner-PID tot ist.**
   Ein abgestürzter Agent mit `CLAUDE_SESSION_ID` (harness-provided,
   non-numeric) umgeht die numerische `_sid_alive`-Prüfung. Der
   `worktree-missing`-Branch greift nicht, solange das Worktree-Verzeichnis
   noch existiert. Die Heartbeat-TTL (`AGENT_LOCK_TTL=1800`) braucht bis zu
   30 min, was live-blockierend wirkt. Beobachtet am 2026-07-01:
   `agent-a67140173b9f80e8d` mit `owner_pid=880037` — `ps -p 880037` tot,
   Lock aber live.

2. **`scripts/devflow-ci-watch.sh` reagiert nicht auf `mergeable=CONFLICTING`.**
   Der T001408-Preflight deckt nur `mergeStateStatus=DIRTY` ab (Branch
   hinter main, sauberer Rebase möglich). Echte `CONFLICTING` (Merge-Konflikt
   gegen main) führt zu leerem `statusCheckRollup` (CI läuft gar nicht) und
   der Agent hängt oder versucht fälschlich Auto-Merge. Beobachtet an
   T001371/PR #2433.

3. **Auto-Close nach Merge greift nicht** (HEADLINE). Der einzige
   Auto-Close-Pfad ist `scripts/factory/pipeline.js:649` als **Teil** des
   Factory-Pipeline-Deploy-Agenten-Prompts. Wenn (a) der Agent vorher
   terminiert, (b) der PR außerhalb der Factory-Pipeline gemergt wird
   (z. B. durch ticket-ops-Operatoren), oder (c) der Agent-Prompt-Schritt
   aus anderen Gründen übersprungen wird, bleibt das Ticket auf
   `triage`/`in_progress`/`awaiting_deploy`. Es gibt **keinen** Poll, der
   `gh pr list --state merged` scannt und die `[T\d{6}]`-Tags transitioned.
   Beobachtet an T001371, T001412, T001414 in dieser Sitzung.

## What

Ein Plan, drei unabhängige Fix-Tasks im selben Branch
`fix/t001415-status-lifecycle-bundle`:

- **M1 (agent-lock dead-PID):** `_reapable()` prüft zusätzlich
  `owner_pid` via `kill -0` und reapet nach `AGENT_LOCK_GRACE` Sekunden,
  wenn der Owner-Prozess nicht mehr existiert. Reihenfolge:
  `pid-dead` > `worktree-missing` > `sid-dead` > `heartbeat-ttl`. Jeder
  Branch schreibt einen Reason in `.reap.log`.

- **M2 (devflow-ci-watch CONFLICTING):** Preflight erweitert: zusätzlich
  `gh pr view --json mergeable` abfragen. Bei `CONFLICTING`: Exit 4 mit
  klarer Meldung "PR has merge conflicts — rebase manually" (kein
  Auto-Force, Sicherheit). `dev-flow-execute` SKILL.md Schritt 5.5
  dokumentiert die manuelle Rebase-Recovery.

- **M3 (Factory Poll für Auto-Close, HEADLINE):** Neues Skript
  `scripts/factory/auto-close-merged.sh` scannt `gh pr list --state merged
  --limit 30`, extrahiert `[T\d{6}]`-Tags, transitioned Tickets mit
  non-terminal-Status auf `done` (resolution: `shipped` für type=feature,
  `fixed` für type=bug). Idempotent. `scripts/factory/wakeup.sh` ruft das
  Skript pro Brand vor dem Dispatcher-Tick auf (analog `auto-enqueue.sh`
  und `auto-triage.sh`). SSOT-Update in `openspec/specs/ticket-system.md`.

Details, Root-Cause-Analyse und Edge-Cases:
`docs/superpowers/specs/2026-07-01-t001415-mishap-bundle-design.md`.
Failing-Test-Contract für alle drei Findings wird in
`tests/spec/t001415-mishap-bundle.bats` (RED bestätigt) committed.

_Ticket: T001415_
