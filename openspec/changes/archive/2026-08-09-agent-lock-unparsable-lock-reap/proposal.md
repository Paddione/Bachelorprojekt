# Proposal: agent-lock-unparsable-lock-reap

## Why

Eine inhaltslose oder unparsbare Lockdatei unter `.git/agent-locks/` blockiert **jeden** Commit im
main-Checkout dauerhaft und wird von keinem Aufräummechanismus entfernt. Beobachtet am 2026-08-08
nach einem WSL2-Crash, der `.git/agent-locks/main-checkout.json` auf 0 Bytes zurückließ.

Die Ursache ist eine Asymmetrie zwischen zwei für sich konsistenten Seiten:

- `_reapable()` (`scripts/agent-lock.sh`) leitet Totsein ausschließlich aus Feldern **im** Lock-JSON
  ab (`owner_sid`, `owner_pid`, `worktree`, `heartbeat_at`, `created_at`). Bei einer leeren Datei ist
  jedes dieser Felder leer, jeder `[ -n … ]`-Zweig fällt durch, und die Funktion endet auf `return 1`
  — also "lebt, nicht reapbar".
- Der Pre-Commit-Guard dagegen wertet allein die **Existenz** der Datei als "Lock gehalten".

Zusammen ergeben beide einen Lock, der weder gilt noch geräumt werden kann. Der einzige Ausweg ist
manuelles Löschen oder `AGENT_LOCK_FORCE=1` — beides setzt voraus, dass man die Ursache bereits kennt.
Die Guard-Meldung führt aktiv in die falsche Richtung: sie rendert alle Halter-Felder leer und
empfiehlt einen Worktree anzulegen, obwohl niemand den Lock hält.

**Warum das Räumen risikofrei ist:** `_write_lock()` schreibt nach `$f.tmp.$$` und führt dann
`mv -f` aus — ein atomarer Rename. Ein regulärer Claim kann also zu keinem Zeitpunkt eine leere oder
halbgeschriebene Lockdatei hinterlassen. Ein unparsbarer Lock ist damit immer das Ergebnis externer
Beschädigung und niemals ein legitimer Zwischenzustand eines lebenden Halters. "Unparsbar ⇒ tot" hat
kein Race-Fenster.

## What

Drei zusammengehörige Änderungen an `scripts/agent-lock.sh`:

1. **`reap` räumt unparsbare Locks.** `_reapable()` stuft eine Lockdatei als tot ein, wenn sie leer
   ist, kein gültiges JSON enthält oder keines der Identitätsfelder trägt — geprüft **vor** der
   bisherigen Feldauswertung, mit Reap-Grund `unparsable` im `.reap.log`.
2. **Der Guard meldet einen defekten Lock eigenständig.** Statt der Kollisionsmeldung mit leeren
   Feldern erscheint ein eigener Text, der den Lock als beschädigt benennt und das Entfernen als
   Handlungsanweisung nennt — nicht das Anlegen eines Worktrees.
3. **`list` wertet einen inhaltslosen Lock nie als `live`.** Da Punkt 1 `_reapable()` korrigiert,
   folgt der `STATE`-Wert automatisch; die Zeile zeigt zusätzlich den Dateinamen, damit ein Eintrag
   ohne Scope/ID überhaupt zuzuordnen ist.

Abgegrenzt: Dies ändert **nicht**, wie lebende Locks bewertet werden. Die bestehenden
Liveness-Regeln (confirmed-alive SID, Worktree+Branch-Match, lebende PID, Heartbeat-TTL) bleiben
unangetastet — die neue Prüfung greift ausschließlich, wenn gar kein auswertbarer Inhalt vorliegt.

_Ticket: T002702_
