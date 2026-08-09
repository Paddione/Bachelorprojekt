---
ticket_id: T002702
plan_ref: openspec/changes/agent-lock-unparsable-lock-reap/tasks.md
status: active
date: 2026-08-09
---

# Design: agent-lock-unparsable-lock-reap

_Ticket: T002702_

## Root-Cause

Bestätigt durch Code-Lektüre **und** Reproduktion (nicht nur Hypothese aus dem Ticket):

`_reapable()` in `scripts/agent-lock.sh` beantwortet die Frage "ist dieser Lock tot?"
ausschließlich anhand von Feldern, die es aus dem Lock-JSON liest. Der Aufbau ist eine Kette von
`if [ -n "$feld" ]`-Zweigen: lebende SID gewinnt, sonst Worktree+Branch-Match, sonst lebende PID,
sonst tote PID nach Grace, sonst fehlender Worktree, sonst tote SID, sonst Heartbeat-TTL. Bei einer
0-Byte-Datei liefert jedes `_lock_field` einen Leerstring, **kein** Zweig greift, und die Funktion
endet auf `return 1` — der Rückgabewert für "lebt".

Der Pre-Commit-Guard prüft dagegen nur, **ob die Datei existiert**. Beide Seiten sind für sich
korrekt; ihre Kombination ergibt einen Lock, der weder gilt noch geräumt werden kann.

Reproduktion (verifiziert am 2026-08-09 in einem Wegwerf-Repo):

```
: > .git/agent-locks/main-checkout.json
bash scripts/agent-lock.sh reap   # Datei liegt danach unverändert da
bash scripts/agent-lock.sh list   # Zeile mit leerem SCOPE/ID/SID, STATE=live
```

## Warum "unparsbar ⇒ tot" ohne Grace-Periode sicher ist

`_write_lock()` schreibt nach `"$1.tmp.$$"` und schließt mit `mv -f` ab — ein atomarer Rename
innerhalb desselben Dateisystems. Ein regulärer Claim kann daher zu keinem Zeitpunkt eine leere oder
halbgeschriebene Lockdatei am Zielpfad hinterlassen. Zusätzlich serialisiert `_with_lock` alle
Schreiber über `flock` auf `.registry.lock`.

Daraus folgt: ein unparsbarer Lock ist immer externe Beschädigung (im gemeldeten Fall ein
WSL2-Crash), nie ein legitimer Zwischenzustand eines lebenden Halters. Es gibt kein Race-Fenster, das
eine Karenzzeit rechtfertigen würde — anders als bei den bestehenden PID-/SID-Prüfungen, die genau
deshalb `AGENT_LOCK_GRACE` respektieren.

## Fix-Ansatz

Drei Eingriffe, alle in `scripts/agent-lock.sh`:

**1. `_reapable()` — Vorabprüfung.** Ganz am Anfang, direkt nach `[ -f "$f" ] || return 0`: Ist die
Datei leer, kein gültiges JSON, oder trägt sie keines der Identitätsfelder, dann `_reap_log "$f"
unparsable; return 0`. Die Prüfung liegt **vor** der Feldauswertung, damit sie nicht von derselben
Leere abhängt, die sie erkennen soll.

Die Definition "unparsbar" umfasst bewusst drei Fälle:
- Größe 0 (der gemeldete Fall),
- ungültiges JSON (halbgeschrieben durch fremde Werkzeuge),
- gültiges JSON ohne jedes Identitätsfeld (z. B. `{}`) — sonst bliebe eine Datei liegen, die zwar
  parst, aber genauso wenig einen Halter benennt.

**2. Guard-Meldung.** Der Pre-Commit-Guard unterscheidet vor dem Rendern der Kollisionsmeldung, ob
der Lock auswertbar ist. Bei einem beschädigten Lock erscheint ein eigener Text, der die Datei
benennt und das Entfernen als Handlung nennt. Der bisherige Text bleibt für echte Kollisionen
unverändert.

Das ist kein kosmetischer Zusatz: die aktuelle Meldung empfiehlt einen Worktree anzulegen. Bei einem
beschädigten Lock ist das die falsche Handlung, und sie kostet den Leser die Zeit, die es braucht,
den Widerspruch zwischen "gehalten von " (leer) und "eine andere Session arbeitet" aufzulösen.

**3. `list`.** Der `STATE`-Wert folgt automatisch aus Punkt 1, weil `cmd_list` `_reapable` aufruft.
Ergänzt wird die Ausgabe um den Basename der Lockdatei, damit eine Zeile mit leerem Scope und leerer
ID überhaupt einer Datei zuzuordnen ist — im gemeldeten Fall war aus der Ausgabe nicht ersichtlich,
*welche* Datei betroffen war.

## Betroffene Subsysteme

| Bereich | Berührung |
|---|---|
| `scripts/agent-lock.sh` | `_reapable()`, Guard-Meldung, `cmd_list()` |
| `tests/spec/software-factory/` | neuer RED-Test |
| Aufrufer (`dev-flow-*`, Factory, Pre-Commit-Hook) | keine Signaturänderung, nur Verhalten im Fehlerfall |

## Edge-Cases

- **Lebende Locks bleiben unangetastet.** Die neue Prüfung greift nur, wenn kein Identitätsfeld
  vorhanden ist. Ein Lock mit auch nur einem gesetzten Feld läuft unverändert durch die bestehende
  Kette. Der RED-Test deckt beide Richtungen ab (Positiv-Anker-Pflicht T002356-M1).
- **`jq` nicht verfügbar.** `_lock_field` muss weiterhin ohne harte `jq`-Abhängigkeit funktionieren,
  falls sie heute nicht besteht — die Parsbarkeitsprüfung darf keine neue Systemabhängigkeit
  einführen. Die Implementierung prüft zuerst die Dateigröße (kostenlos) und fällt für die
  JSON-Validierung auf das zurück, was `_lock_field` ohnehin nutzt.
- **Nebenläufigkeit beim Räumen.** `cmd_reap` hält bereits den Registry-`flock`, wenn es Lockdateien
  löscht (Schritt 3 in `cmd_reap`). Die neue Prüfung ändert daran nichts.
- **`.reap.log`-Eintrag bei leerem Lock.** `_reap_log` liest `scope` und `id` aus der Datei — bei
  einem leeren Lock ergibt das `/`. Der Eintrag muss stattdessen den Dateinamen führen, sonst ist die
  Audit-Zeile so nichtssagend wie die `list`-Zeile es war.
