# Proposal: mcp-task-runner-cancel-escalation

## Why

Die Tool-Description von `cancel_task` verspricht „SIGTERM; SIGKILL follows after 5 seconds" — das Verhalten existiert nur scheinbar: `cmd.WaitDelay` in `RunTask` wird nie erreicht, solange Kindprozesse des Tasks die stdout/stderr-Pipes offen halten (`streamLines` blockiert bis EOF, vor `cmd.Wait()`). Genau dann — Task ignoriert SIGTERM und hält Kinder, der Zweck der Eskalation — wird nichts gekillt und `run_task` hängt. Verifiziert per Unit-Test mit PID-Liveness (`syscall.Kill(pid, 0)`); die frühere pgrep-Messung (T005592) war auf WSL trügerisch.

## What

`RunTask` startet das Task-Kommando in einer **eigenen Prozessgruppe** (`Setpgid`). Der Cancel-Callback sendet `SIGTERM` an die Gruppe und eskaliert nach `sigkillDelay` (5 s, Package-Var für Tests) per `time.AfterFunc` zu `SIGKILL` an die Gruppe. `WaitDelay` bleibt als Backstop. Damit sterben Task und Kinder, die Pipes schließen, `RunTask` kehrt zurück — und die Description wird wahr.

`cancel_task`/Registry bleiben unverändert: der Context-Cancel trägt den neuen Pfad.

## Impact

- `mcp-task-runner/runner/executor.go` — Cancel-Callback + Setpgid.
- `mcp-task-runner/runner/executor_internal_test.go` — Regressionstest (rot verifiziert).
- SSOT-Delta `openspec/changes/mcp-task-runner-cancel-escalation/specs/mcp-task-runner.md` — cancel_task-Requirement um die Eskalation ergänzt.
- Kein BATS-Neuzugang: Timing-/PID-Prüfungen sind auf Go-Ebene deterministisch (siehe design.md).
