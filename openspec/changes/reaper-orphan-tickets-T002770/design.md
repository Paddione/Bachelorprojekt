# T002770: Reaper für in_progress-Tickets ohne Lock, Branch oder Worktree

## Problem

Tickets in `in_progress` ohne aktive Session bleiben dauerhaft in diesem Status. Der
Watchdog (`scripts/factory/watchdog.sh`) hat bereits einen Slot-Reaper (T002610), aber
keinen Ticket-Status-Reaper. Die ticket-ops-Invariante "laufende Arbeit nicht anfassen"
vertraut auf den Statuswert — der hier nichts mehr abbildet.

## Fix

Watchdog-Regel in `scripts/factory/watchdog.sh`: Wenn ein `in_progress`-Ticket nach
einer Karenzzeit (z.B. 60min) weder einen Agent-Lock noch einen Remote-Branch hat,
wird es auf `triage` zurückgesetzt und der Vorgang kommentiert.

Existierender Slot-Reaper als Vorbild (Commit `63b1f766d`, PR #3756).
