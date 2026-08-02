# Proposal: agent-lock-reap-rule0b-ttl

## Why

Regel 0b in `_reapable()` (`scripts/agent-lock.sh`) schützt einen Claim, sobald der
Worktree-Pfad existiert UND auf dem im Lock vermerkten Branch steht — ohne jede
Alters-/Heartbeat-Prüfung. `reap` räumt einen solchen Lock deshalb NIE auf, auch wenn
`owner_sid` und `owner_pid` nachweislich tot sind und der Heartbeat längst abgelaufen ist.

### Ursache

Seit T002204 ist Regel 0b die Liveness-Brücke für den Session-Resume: eine fortgesetzte
Session startet einen neuen Prozess mit neuer SID (und ggf. neuer PID); ohne Regel 0b
fiele ihr eigener Lock in die `pid-dead`/`sid-dead`-Reap-Pfade. Regel 0b prüft die
Liveness deshalb über den Dateisystem-/Git-Zustand (Worktree existiert + Branch passt).

Sie prüft dabei aber **nur den Worktree**, nie das Alter des Claims. Ein toter Halter,
dessen Worktree nicht gelöscht wurde, hinterlässt damit einen unbegrenzt lebenden Lock.
T002448-M8 (T002511, PR #3557) hat festgehalten, dass der **Heartbeat das einzige
belastbare Lebenssignal** ist, weil eine Claude-Code-Session pro Bash-Aufruf einen neuen
PID hat — genau dieser Grundsatz fehlt in Regel 0b.

### Beobachtung (2026-08-01, live reproduziert)

`ticket__T002506.json`: `owner_sid=3907863` / `owner_pid=3907864` (beide nicht existent),
`heartbeat_at` 5308s alt (TTL 1800). `agent-lock.sh list` meldete `live`, `reap` ließ den
Lock stehen — der Worktree `.worktrees/mishap-bundle-T002506` existierte und stand auf
`chore/mishap-bundle-T002506` (genau Regel 0b). Folge: der Worktree-Write-Guard blockiert
jede weitere Session im Worktree, bis ein manuelles `release` den Lock räumt.

Der identische Befund trat am selben Tag am Lock von T002513 selbst auf (SID 2963564 /
PID 2964129 tot, Heartbeat 6147s alt, Worktree `t002513-agent-lock` + Branch-Match) —
der Lock überlebte `reap`, bis er per `claim --force` abgelöst wurde.

## What

1. **Regel 0b an die Heartbeat-TTL koppeln** in `_reapable()`. Ein Worktree+Branch-Match
   schützt den Lock nur noch, solange `heartbeat_at` jünger als `AGENT_LOCK_TTL` ist
   (oder das Feld fehlt, Altformat ohne Heartbeat). Ist der Heartbeat abgelaufen, wird der
   Lock mit `heartbeat-ttl` gereapt. Ein **Resume erneuert den Heartbeat** (Re-Claim mit
   SID-Match, `cmd_claim` Zeile 294-295 schreibt ihn frisch) — ein toter Halter nicht.
2. **RED-Test** in `tests/spec/active-sessions-hub.bats`: Lock mit totem SID+PID,
   passendem Worktree+Branch, aber abgelaufenem Heartbeat MUSS von `reap` entfernt werden.
3. **Gegenprobe**: derselbe Lock mit **frischem** Heartbeat MUSS `reap` überleben
   (Resume-Semantik bleibt erhalten — Regel 0b verliert ihre Schutzfunktion nicht).
4. **SSOT-Delta** `active-sessions-hub.md`: Requirement „Claim-Persistenz gegen reap-Race"
   um die Heartbeat-TTL-Kopplung der Worktree-Branch-Liveness erweitern.

### Bewusst nicht Teil dieses Change

- **Kein Aufräumen der Altformate/Altfälle.** Fehlt `heartbeat_at` (pre-Heartbeat-Claims),
  bleibt Regel 0b unverändert schützend — das Feld ist seit T001582 Standard.
- **Keine Änderung an `cmd_claim`/`cmd_release`.** Die Heartbeat-Erneuerung beim Resume
  funktioniert bereits über den bestehenden Re-Claim-Pfad (SID-Match); hier ändert sich
  nur, was `reap` als tot erkennt.
- **Kein verpflichtender Heartbeat-Refresher.** Wo `refresh`/`claim` nicht regelmäßig
  aufgerufen werden, darf ein Lock nach TTL sterben — das ist die gewollte Semantik.

## Impact

`scripts/agent-lock.sh` gewinnt ~6 Zeilen (Regel-0b-Block), bleibt weit unter dem
S1-Limit (`.sh: 800`). Betroffen ist nur der `_reapable()`-Pfad; alle Aufrufer
(`list`/`reap`/`claim`/`check`/Hooks) profitieren indirekt, weil tote Halter nun
tatsächlich als tot erkannt werden. Der Worktree-Write-Guard blockiert nicht mehr
dauerhaft auf verwaisten Locks.

_Ticket: T002513_
