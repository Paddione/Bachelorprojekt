# Proposal: fix-watchdog-sf26-vakuos-T002620

## Why

Die beiden Live-Tests FA-SF-26 in `tests/spec/software-factory/scheduling.bats`
(Zeilen 160–199) sollen belegen, dass der Watchdog ein haengendes `in_progress`-Ticket
eskaliert (Status-Reset, Slot-Freigabe, Comment, Worktree-Cleanup, Attempt-Counter).
Ihr Setup datiert `updated_at` 40 Minuten zurueck:

    UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';

Diese Zurueckdatierung ist **wirkungslos**: Der Trigger `tickets.fn_lifecycle_ts`
(`website/src/lib/tickets/tables/tickets.ts:338`) setzt bei JEDEM UPDATE unbedingt
`NEW.updated_at := now()` — der geschriebene Wert wird im selben Statement wieder
ueberschrieben. Am 2026-08-03 gegen eine Dev-DB mit prod-Schema verifiziert: direkt
nach dem UPDATE meldet `SELECT now() - updated_at` `00:00:16` statt `00:40:00`.

Die Stale-Liste des Watchdogs bleibt damit leer: Der Lauf endet mit Exit 0 und einem
leeren JSON-Array `[]`, der Eskalationspfad wird **nie ausgefuehrt**. Die Tests
scheitern dann zwar an ihrem Positiv-Anker (`jq -e 'any(.[]; . == $e)'` findet die
ext_id nicht) — aber aus dem falschen Grund. Ein vollstaendig defekter Watchdog
wuerde identisch scheitern; ein Lauf, aus dem man die Anker-Assertion entfernt, waere
gruen, ohne dass der Watchdog je Arbeit getan haette. Genau diese Vakuositaet liess
T002618 (Watchdog brach bei jedem stale Ticket ab, `local` auf Top-Level) unentdeckt,
obwohl FA-SF-26 fuer diesen Pfad gebaut ist.

## What

Die Alterung wird ueber den Schwellwert gesteuert statt ueber den Zeitstempel —
dasselbe Muster, das `tests/spec/software-factory/orphan-slot-reap.bats` (T002610)
bereits fuer den Waisen-Sweep umsetzt:

- **Kein Backdating mehr.** Der `kubectl exec`-Block mit dem
  `SET updated_at = now() - interval '40 minutes'`-UPDATE entfaellt aus beiden Tests.
- **`FACTORY_STALE_MIN=0`** macht jedes `in_progress`-Ticket sofort faellig (ein frisch
  geschriebenes Ticket ist immer aelter als `now() - 0min`). Zusaetzlich
  `FACTORY_ORPHAN_SLOT_MIN=999`, damit der Waisen-Sweep den Lauf nicht mit eigenen
  Seiteneffekten belegt — Isolationsspiegel zur Vorlage, die ihrerseits
  `FACTORY_STALE_MIN=999` setzt.
- **Positiv-Anker pro Test:** die eigene ext_id im JSON-Array
  (`echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'`). Ein leerer Lauf
  kann den Test nicht mehr bestehen lassen.
- **Zustand per direktem UPDATE** (`SET pipeline_slot=1, status='in_progress'`)
  statt `slots.sh claim`: dessen Subkommando schreibt `pipeline_slot_meta`, eine
  Spalte, die in prod fehlt (T002619 — der Claim scheiterte dort mit Exit 3, bevor
  der Test begann). Die Vorlage aus T002610 dokumentiert genau diesen Weg.
- **Schaerfere Assertion in Test 1:** zusaetzlich wird geprueft, dass der Slot
  tatsaechlich freigegeben wurde (`pipeline_slot` = NULL) — der Titel des Tests
  verspricht es bereits, geprueft war nur der Status.

Geaendert wird ausschliesslich `tests/spec/software-factory/scheduling.bats`
(FA-SF-26-Block, Zeilen 160–199). `orphan-slot-reap.bats` bleibt unveraendert;
`watchdog.sh` selbst braucht keine Aenderung — der Eskalationspfad ist intakt, er
wurde nur nie ausgefuehrt.

_Ticket: T002620_
