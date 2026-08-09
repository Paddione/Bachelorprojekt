# Proposal: fix-wakeup-help-T002662

## Why

`wakeup.sh` hat kein Argument-Handling. Ein Aufruf mit `--help` (etwa im Rahmen von
repo-hygiene, um die Usage zu pruefen) wird stillschweigend ignoriert und loest einen
echten Factory-Tick aus — inklusive Konsum des `force-tick-requested`-Flags und
Dispatch von Backlog-Tickets. Ein harmloser Help-Aufruf hat also reale Seiteneffekte.
Das Skript ist die "Inversion of Intelligence"-Waechterhuelle (spec §4): jede bewusste
Handlung braucht einen expliziten, pruefbaren Weg — ein irrtuemlicher Tick ist genau
der Zustand, den der Kill-Switch verhindern soll.

## What

`scripts/factory/wakeup.sh` weist unbekannte Argumente ab und beantwortet `--help`
mit der Usage (Exit 0). Beides geschieht VOR jedem Seiteneffekt (env source,
flock, git pull, force-tick-Flag, Tick-Loop).

_Ticket: T002662_
