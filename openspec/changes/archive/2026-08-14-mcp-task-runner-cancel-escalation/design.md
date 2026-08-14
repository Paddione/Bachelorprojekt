---
ticket_id: T005592
plan_ref: openspec/changes/mcp-task-runner-cancel-escalation/tasks.md
status: active
date: 2026-08-14
---

# Design: cancel_task-SIGKILL-Eskalation an die Prozessgruppe

## Root-Cause (REVISED nach Unit-Test-Befund)

Der ursprüngliche T005592-Befund („kein SIGKILL, kein Timer") war falsch — die Eskalation existiert über `cmd.WaitDelay = 5 * time.Second` (`executor.go:76`). Der Unit-Test hat aber einen tieferen Defekt aufgedeckt: **Die Eskalation ist im Standardfall unerreichbar.**

`RunTask` blockiert vor `cmd.Wait()` in `streamWg.Wait()` — `streamLines` (streamer.go) scannt die stdout/stderr-Pipes bis EOF. Hält ein Kindprozess des Tasks die Pipes offen (der Regelfall: der Task startet Prozesse), kommt das EOF erst mit deren Ende → `cmd.Wait()` und damit der WaitDelay-Kill werden **nie erreicht**. Ergebnis: Ein Task, der SIGTERM ignoriert und Kinder hält, wird nicht gekillt, und `run_task` hängt bis zum Kind-Lebensende. Die Tool-Description verspricht also Verhalten, das in genau dem Fall fehlt, für den die Eskalation gedacht ist.

Verifiziert mit `executor_internal_test.go` (PID-File + `syscall.Kill(pid, 0)` — autoritativ, im Gegensatz zur früheren pgrep-Messung, die auf WSL trügerisch war): Kind lebt, `RunTask` kehrt nicht zurück.

## Entscheidung

**SIGTERM/SIGKILL an die Prozessgruppe statt an den Einzelprozess:**

1. `cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}` — das Task-Kommando wird Gruppenführer einer eigenen Prozessgruppe; Kinder erben die Gruppe.
2. `cmd.Cancel` sendet `SIGTERM` an `-cmd.Process.Pid` (Gruppe) und plant per `time.AfterFunc(sigkillDelay, …)` `SIGKILL` an die Gruppe — die Eskalation hängt damit am Cancel-Pfad und **nicht mehr** daran, dass `RunTask` das `cmd.Wait()` erreicht. Guard: `cmd.Process == nil` → no-op (Cancel kann vor `Start` feuern; `Kill(-1, …)` wäre fatal).
3. `cmd.WaitDelay = sigkillDelay` bleibt als Backstop.

Damit sterben Task **und** Kinder → Pipes schließen → `streamLines`-EOF → `RunTask` kehrt zurück. `cancel_task` bleibt unverändert (Registry-Cancel löst den Context-Cancel aus, der den neuen Cancel-Pfad trägt).

Bekannte Grenze (dokumentiert, akzeptiert): Kinder, die selbst `setsid` aufrufen, verlassen die Gruppe und überleben — außerhalb des Semantikversprechens.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `mcp-task-runner/runner/executor.go` | Setpgid + Gruppen-Signal-Eskalation im Cancel-Callback |
| `mcp-task-runner/runner/executor_internal_test.go` | Failing Test (rot verifiziert): Wrapper ignoriert TERM, Kind hält Pipes → RunTask muss innerhalb des Eskalationsfensters zurückkehren und beide Prozesse tot sein |
| `openspec/changes/mcp-task-runner-cancel-escalation/specs/mcp-task-runner.md` | Delta: cancel_task-Requirement + Eskalations-Szenario |

## Teststrategie

Der failing Test ist bewusst **Go-Unit** (internes Package für `sigkillDelay`-Override): Timing- und PID-Prüfungen sind auf Prozessebene deterministisch, ein BATS-Test gegen das echte 5-s-Fenster wäre CI-flakig. Rot verifiziert am aktuellen Stand (RunTask hängt → Timeout).
