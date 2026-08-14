# Proposal: ticket-lock-stale-pass

## Why

T005029: Status-Schreibvorgänge wurden mit Exit 7 blockiert, obwohl der Lock-Halter (Plan-Phase) beendet war — `check` meldet für tote Halter pauschal „held" (rc=3), der Guard blockt. Der Reaper ist korrekt (verifiziert); die Lücke ist der fehlende Stale-Zustand im Check-Contract.

## What

`check` liefert rc=4/`held-stale` bei totem owner_pid (Lock bleibt bestehen); `_ticket_lock_guard` lässt rc=4 mit Warnung durch. Lebende Halter bleiben voll geschützt.

## Impact

`scripts/agent-lock.sh`, `scripts/vda/ticket/_ticket-core.sh`, neuer BATS-Test, SSOT-Delta `scripts.md`.
