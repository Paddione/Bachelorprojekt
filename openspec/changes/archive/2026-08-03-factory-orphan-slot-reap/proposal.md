# Proposal: factory-orphan-slot-reap

## Why

Ein Ticket kann dauerhaft und lautlos aus der Factory fallen, obwohl es in der
Dispatcher-Queue steht. Beobachtet am 2026-08-03 an T002482: das Ticket erschien bei jedem
Tick in `queue.sh`, wurde aber nie gestartet — kein Eintrag in agent-msg, keiner in den
Phase-Events.

**Symptom (Fakt, reproduziert):** Ein Ticket mit gesetztem `pipeline_slot` und einem Status
ungleich `in_progress` wird bei jedem Dispatcher-Tick übersprungen, ohne dass irgendwo eine
Meldung entsteht.

**Ursache (am Code verifiziert, nicht aus dem Ticket übernommen):**

| Belegstelle | Befund |
|---|---|
| `scripts/factory/slots.sh:40` | `claim-gang` aktualisiert nur Zeilen mit `pipeline_slot IS NULL`. Trägt ein Ticket aus einem abgebrochenen Lauf noch einen Slot, trifft die UPDATE-Bedingung nie zu — unabhängig vom Status. |
| `scripts/factory/slots.sh:24` | `count` summiert nur Zeilen mit `status='in_progress'`. Der verwaiste Slot belegt damit keine Kapazität und taucht in keiner Auswertung auf. |
| `scripts/factory/schedule.sh:106` | Der `claim-gang`-Aufruf läuft mit `>/dev/null 2>&1` innerhalb einer `if`-Bedingung. Sowohl die Fehlermeldung als auch der Exit-Code werden verworfen. |

Der Zustand ist damit rein blockierend und zugleich unsichtbar: er kostet keine Kapazität,
erzeugt kein Signal und ist nur durch manuelles Nachsehen in der DB auffindbar.

Bemerkenswert: `schedule.sh` dokumentiert in seinen Kopfkommentaren bereits **zwei** behobene
Fälle exakt dieser Klasse — T002386 (Slot-Count-Fehler still als 0 gewertet) und T002418
(conflict-check rc 2 still geschluckt). Zeile 106 ist der dritte, noch offene Fall desselben
Musters im selben Skript.

## What

Zwei getrennte Eingriffe — der eine heilt, der andere macht sichtbar.

### ① Räumen — `scripts/factory/watchdog.sh`

Ein zweiter Sweep neben dem bestehenden Stale-Sweep, als dessen logische Umkehrung:

| | Bestehender Stale-Sweep | Neuer Waisen-Sweep |
|---|---|---|
| Bedingung | `status='in_progress'` und `updated_at` alt | `pipeline_slot IS NOT NULL` **und** `status <> 'in_progress'` und `updated_at` alt |
| Deutung | Pipeline hängt | Slot ist verwaist |
| Aktion | Slot frei **und** Status zurücksetzen | **nur** Slot frei — der Status ist bereits korrekt |
| Schwelle | `FACTORY_STALE_MIN` (Default 30) | `FACTORY_ORPHAN_SLOT_MIN` (Default 10) |

Der eigene Schwellwert ist bewusst getrennt: ein Waise ist ein anderer Zustand als eine
hängende Pipeline und darf schneller geräumt werden, ohne den Stale-Sweep umzuparametrieren.
Die Karenzzeit schließt zugleich jedes Rennen mit einem gerade laufenden Claim aus.

Die Freigabe läuft über `ticket.sh release-slot` — denselben Pfad, den der bestehende
Stale-Sweep in `watchdog.sh:180` bereits nutzt (er ruft intern `slots.sh release` auf).
**Nicht** über `scripts/factory/release-slot.sh`: das verwaltet trotz des naheliegenden Namens
eine ganz andere Ressource — Provider-Kapazität in `tickets.provider_health` —, nicht den
`pipeline_slot`. Dazu ein Audit-Comment am Ticket, damit die Freigabe nachvollziehbar ist,
statt still zu geschehen.

Strukturell ist der neue Sweep dem bestehenden `awaiting_deploy`-Sweep (`watchdog.sh:187-197`)
nachgebildet: eigener Schwellwert, eigenes `mapfile`, eigene Schleife, Eintrag ins
`escalated`-Array.

### ③ Watchdog wieder lauffähig machen — T002618

`watchdog.sh:160` deklariert `local tier_name="flash"` innerhalb der `for row in "${stale[@]}"`-
Schleife, die auf Top-Level steht und nicht in einer Funktion. Unter `set -euo pipefail`
(Zeile 14) bricht das Skript dort ab, sobald **ein** stale Ticket existiert:

```
$ bash -c 'set -euo pipefail; for i in 1; do local x="y"; echo erreicht; done'
bash: line 1: local: can only be used in a function
exit=1
```

Damit werden Status-Reset (179), Slot-Freigabe (180), Comment (181), Worktree-Cleanup (183)
und der `awaiting_deploy`-Sweep (187 ff.) in genau den Ticks übersprungen, für die der
Watchdog existiert. Bei leerer Stale-Liste läuft alles durch — deshalb fällt es im
Normalbetrieb nicht auf.

Der Befund entstand bei der Planung dieses Vorgangs und ist als **T002618** eigenständig
erfasst (Bug-Triage-Konvention G-DORA03). Er wird hier mitbehoben, weil der Waisen-Sweep
hinter der Abbruchstelle läge und ohne diese Korrektur nachweislich wirkungslos bliebe —
T002610 würde grün gemergt, ohne etwas zu bewirken. Die Behebung ist eine Zeile
(`local tier_name=` → `tier_name=`) plus ein Regressionstest.

### ② Melden — `scripts/factory/schedule.sh`

Der fehlgeschlagene `claim-gang` verschluckt seine Diagnose nicht mehr, sondern gibt eine
`WARN`-Zeile mit `ext_id` und Grund auf stderr aus — im selben Stil wie die dort bereits
vorhandenen Meldungen für T002386 und T002418. Fail-open bleibt erhalten: ein Fehlschlag
überspringt weiterhin nur diesen Kandidaten und hält den Dispatch nicht an.

## Bewusst außerhalb des Scopes

`slots.sh count` und `next` ermitteln die belegten Slots über `status='in_progress'`. Ein
verwaister Slot gilt dort als **frei** und kann parallel an ein zweites Ticket vergeben werden —
aus der Blockade würde dann eine Slot-Kollision (zwei Zeilen mit demselben `pipeline_slot`).
Dieser Befund entstand bei der Ursachen-Verifikation und steht nicht im Ticket.

Er wird hier bewusst **nicht** mitgefixt: der Waisen-Sweep schließt das Zeitfenster an der
Wurzel und reduziert es auf einen Watchdog-Takt. Die Buchführung stattdessen auf
`pipeline_slot IS NOT NULL` umzustellen würde einen härteren Failure-Mode einbauen — ein nicht
freigegebener Slot fräße dann dauerhaft reale Kapazität und könnte die Factory ganz anhalten,
statt nur ein einzelnes Ticket zu blockieren.

_Ticket: T002610_
_Mitbehoben: T002618_
