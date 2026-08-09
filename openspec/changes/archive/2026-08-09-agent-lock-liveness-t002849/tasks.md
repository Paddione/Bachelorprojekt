---
title: "agent-lock-liveness-t002849 — Implementation Plan"
ticket_id: T002849
domains: [test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-liveness-t002849 — Implementation Plan

_Ticket: T002849_

## File Structure

```
scripts/agent-lock.sh                                                            (Ist 623 · Budget 177, .sh-Limit 800, nicht-baselined)
tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats     (neu)
openspec/specs/factory-reclaim-lock-respect.md                                    (delta-merge bei archive)
```

<!-- vitest: kein neuer Test nötig, weil reine Bash/BATS-Änderung, kein website/src-Code -->

## Task 1 — RED: Failing-Test für Block 0b (pid-dead + worktree-match) schreiben

Neue Datei `tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats`
(eigene Datei je T002416-Konvention, nicht an die Sammeldatei
`tests/spec/factory-reclaim-lock-respect.bats` angehängt). Fixture: ein echtes Mini-Git-Repo
als `$WT` (`git init` + ein Commit + `checkout -b fix/demo-T002849`), damit
`git -C "$wt" rev-parse --abbrev-ref HEAD` real auflöst. `AGENT_LOCK_GRACE=5` (statt Default
120) exportieren, damit der Test in Sekunden statt Minuten läuft. `AGENT_LOCK_FAKE_ALIVE=""`
erzwingt den Fallback (dieselbe Konvention wie `tests/spec/factory-reclaim-lock-respect.bats`).

Drei Fälle in derselben Datei (Positiv-Anker-Pflicht T002356-M1 — der Negativfall steht nicht
isoliert):
1. **RED-Fall:** `owner_pid=4194303` (praktisch nie real), Alter 30s (> Grace 5s, ≪ TTL 1800s),
   Worktree existiert, Branch passt → erwartet `free`/exit 0. Schlägt auf dem aktuellen Stand
   fehl (aktuell `held`/exit 3), weil Block 0b nur den Heartbeat gegen die volle TTL prüft.
2. **Positiv-Anker (Resume-Schutz):** dieselbe Lock-Konstellation, aber Alter 1s (< Grace) →
   bleibt `held`/exit 3. Muss VOR und NACH dem Fix grün sein — beweist, dass der Fix das
   T002204-Resume-Fenster nicht bricht.
3. **Positiv-Anker (Live-PID):** `owner_pid=$$` (der Bats-Prozess selbst, garantiert lebendig),
   Alter 30s → bleibt `held`/exit 3 unabhängig vom Alter — beweist, dass der neue Pfad die
   bestehende Live-PID-Priorität nicht verdrängt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats
# expected: FAIL (Fall 1 rot — Block 0b prüft owner_pid noch nicht; Fälle 2+3 bereits grün)
```

## Task 2 — GREEN: Block 0b um `_pid_alive`-Prüfung erweitern

In `scripts/agent-lock.sh` `_reapable()`, Block 0b (Kommentar "Worktree+branch match beats a
dead/mismatched SID"): nach der bestehenden Heartbeat-TTL-Prüfung, aber noch innerhalb des
`wt_branch = br`-Zweigs, einen zweiten Check ergänzen, der Block 0a spiegelt:

```bash
if [ -n "$pid" ] && ! _pid_alive "$pid"; then
  age=$(( now - age_base ))
  if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
    _reap_log "$f" pid-dead; return 0
  fi
fi
return 1
```

`pid` ist im Funktionsscope bereits vor Block 0a mit `pid="$(_lock_field "$f" owner_pid)"`
gesetzt — keine erneute Zuweisung nötig. `age_base` (`heartbeat_at` mit `created_at`-Fallback)
und `AGENT_LOCK_GRACE` sind ebenfalls bereits im Scope, identisch zu Block 0a und dem
Sid-dead-Pfad weiter unten in derselben Funktion — keine neuen Variablen, kein neues Verhalten
außerhalb des in der Spec beschriebenen Falls. Reason-String `pid-dead` (nicht ein neuer Wert)
für Konsistenz mit dem bestehenden `.reap.log`-Vokabular (Block 0a und der PID-Check weiter
unten in `_reapable` nutzen denselben String).

Kommentar direkt über der neuen Prüfung ergänzen, der auf T002849 verweist und erklärt, warum
`_pid_alive` allein Resume und Crash nicht unterscheidet (die im Lock stehende `owner_pid`
gehört in beiden Fällen dem alten Prozess) und warum `AGENT_LOCK_GRACE` das
unterscheidende Signal ist (ein Resume erneuert `heartbeat_at` innerhalb des Fensters, ein
abgestürzter Halter nie).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats
# expected: alle 3 Fälle grün
```

## Task 3 — Regressionsnachweis gegen bestehende agent-lock-Suite

Der geänderte Block ist gemeinsamer Code für JEDEN Worktree+Branch-match-Lock (T002204,
T002513, T002267 etc.) — vor dem Commit die volle agent-lock-bezogene BATS-Fläche laufen
lassen, nicht nur die neue Datei:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub.bats \
  tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats \
  tests/spec/active-sessions-hub/opencode-session-id-stable.bats \
  tests/spec/active-sessions-hub/release-foreign-lock-guard.bats \
  tests/spec/agent-lock-branch-reap-T002785.bats \
  tests/spec/agent-lock-claim-persist.bats \
  tests/spec/agent-lock-fetch-guard.bats \
  tests/spec/agent-lock-force-claim.bats \
  tests/spec/agent-lock-session-identity.bats \
  tests/spec/factory-branch-switch-guard.bats \
  tests/spec/factory-reclaim-lock-respect.bats \
  tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats \
  tests/spec/software-factory/agent-lock-scope-argument.bats \
  tests/spec/software-factory/unparsable-lock-reap.bats
```

Erwartung: alle grün, keine Regression gegenüber dem Stand vor Task 2.

## Task 4 — T002826 (Nebenbefund) dokumentieren, keinen Code ändern

Kein RED/GREEN-Zyklus — der Defekt ist trotz gezielter Reproduktion nicht messbar. Nachweis
(bereits während der Planung erbracht, im Proposal dokumentiert): 5 Läufe à 20 parallele
`agent-lock.sh claim ticket <id>`-Aufrufe auf dieselbe Ticket-ID (100 Versuche gesamt) —
in jedem Lauf gewinnt exakt ein Aufruf (`exit=0`), alle übrigen scheitern korrekt mit `exit=1`,
`check ticket` meldet danach konsistent den Gewinner. `cmd_claim` und `cmd_reap` serialisieren
beide über dieselbe `flock`-Sektion (`_with_lock`), das schützt gegen die vermutete Race
Condition. Dieser Task fügt keinen Code hinzu — er hält im Ticket T002826 (via Kommentar/Notiz)
fest, dass der Befund unreproduziert bleibt und nachrangig gegenüber T002849 ist, statt einen
Fix für einen nicht messbaren Defekt zu konstruieren.

## Task 5 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
