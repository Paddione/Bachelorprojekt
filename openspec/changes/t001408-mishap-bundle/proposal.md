# Proposal: t001408-mishap-bundle

## Why

Ein `mishap-tracker`-Aggregat-Ticket (T001408, priority hoch) bündelt drei unabhängige, aber
thematisch verwandte Reliability-Lücken in derselben dev-flow CI/Merge/Lock-Kette:

1. `scripts/agent-lock.sh` reapt Branch-Claims fälschlich innerhalb derselben Session, bevor der
   Pre-Commit-Guard laufen kann — beobachtet live sowohl im ursprünglichen Mishap als auch erneut
   während der Planung dieses Tickets selbst.
2. `.claude/skills/dev-flow-execute/SKILL.md` lässt einen Implementer-Subagenten passiv im
   CI-Poll-Loop hängen, obwohl `mergeStateStatus: DIRTY` bereits vorliegt und CI nie startet
   (bei T001406/PR #2420 beobachtet — Orchestrator musste eingreifen, doppelte Push-Aktionen
   drohten).
3. `scripts/devflow-ci-watch.sh` ruft ein ungültiges `gh pr checks --json`-Flag auf (verifiziert:
   `gh pr checks --help` kennt kein `--json`), wodurch das Skript fälschlich "alle CI-Checks grün"
   meldet, bevor Checks überhaupt liefen.

Ohne Fix bleibt die dev-flow-Pipeline anfällig für stille Fehlreports (Mishap 3), unnötige
Doppelarbeit durch Orchestrator-Eingriffe (Mishap 2) und schwer diagnostizierbare
Lock-Race-Verluste (Mishap 1).

## What

Ein Plan, drei unabhängige Fix-Tasks im selben Branch `fix/t001408-mishap-bundle-agent-lock`:

- **M1 (agent-lock):** `_reapable()` erhält eine Grace-Period (`AGENT_LOCK_GRACE`, Default 120s),
  die einen frisch erstellten Claim vor einem verfrühten Reap allein wegen einer nicht
  verifizierbaren numerischen SID schützt, plus ein append-only `.reap.log` mit dem Reap-Grund
  (`worktree-missing` / `sid-dead` / `heartbeat-ttl`) für künftige Diagnostik. Die
  Heartbeat-TTL bleibt der ultimative Fallback für wirklich tote Sessions.
- **M2 (dev-flow-execute / devflow-ci-watch.sh):** Preflight-Check auf `mergeStateStatus` vor
  Eintritt in die CI-Polling-Schleife; bei `DIRTY` versucht das Skript selbst
  `git fetch origin main && git rebase origin/main` (sauberer Rebase → weiterpollen; Konflikt →
  klarer Abbruch statt stillem Hängenbleiben). SKILL.md Schritt 5.5 dokumentiert das neue
  Verhalten, damit der Implementer-Subagent bei einem Rebase-Konflikt selbst reagiert statt einen
  zweiten Subagenten zu spawnen.
- **M3 (devflow-ci-watch.sh):** Ersetzt die ungültige `gh pr checks --json name,state,link` Zeile
  durch eine funktionierende strukturierte Abfrage über `gh pr view --json statusCheckRollup`
  (CheckRun- und StatusContext-Feldnamen defensiv abgedeckt).

Details, Root-Cause-Analyse und Edge-Cases: siehe
`docs/superpowers/specs/2026-07-01-t001408-mishap-bundle-design.md`. Failing-Test-Contract für
alle drei Findings bereits committed in `tests/spec/t001408-mishap-bundle.bats` (RED bestätigt).

_Ticket: T001408_
