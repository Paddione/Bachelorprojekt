---
title: mcp-task-runner: cancel-Eskalation an die Prozessgruppe — Implementation Plan
ticket_id: T005592
domains: [docs]
status: completed
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-task-runner: cancel-Eskalation an die Prozessgruppe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RunTask` startet das Task-Kommando in einer eigenen Prozessgruppe; der Cancel-Pfad signalisiert die Gruppe (SIGTERM → nach `sigkillDelay` SIGKILL), sodass Tasks, die SIGTERM ignorieren und Kinder halten, zuverlässig beendet werden und `run_task`/`run_task_async` zurückkehren.

**Architecture:** Eskalation hängt am `cmd.Cancel`-Callback (löst bei Context-Cancel sofort aus) statt am unerreichbaren `cmd.Wait()`; `WaitDelay` bleibt Backstop. Registry/`cancel_task` unverändert.

**Tech Stack:** Go, `syscall` (Setpgid, Kill), `time.AfterFunc`.

**Spec:** `openspec/changes/mcp-task-runner-cancel-escalation/design.md`

## Global Constraints

- Guard im Cancel-Callback: `cmd.Process == nil` → no-op. Cancel kann vor `Start` feuern; ein Signal an `-1` wäre fatal.
- `.go` nicht in `s1.limits` → kein S1-Budget; `executor.go` fokussiert halten (Ist 176, Ziel ≈ 185).
- Kein neuer BATS-Test — die Timing-/PID-Zusicherung ist auf Go-Ebene deterministisch (CI-Flakiness-Risiko, siehe design.md).
- Rotphase ist bereits verifiziert: `TestSigkillEscalation` schlägt am aktuellen Stand fehl (RunTask-Timeout).

## File Structure

```
mcp-task-runner/runner/executor.go                          # MODIFY: Setpgid + Gruppen-Eskalation im Cancel-Callback
mcp-task-runner/runner/executor_internal_test.go            # EXISTS: failing Test (rot, liegt bereits im Arbeitsbaum)
openspec/changes/mcp-task-runner-cancel-escalation/specs/mcp-task-runner.md  # EXISTS: Delta-Spec
```

---

### Task 1: Prozessgruppen-Eskalation in RunTask

**Files:**
- Modify: `mcp-task-runner/runner/executor.go`
- Test: `mcp-task-runner/runner/executor_internal_test.go` (existiert, rot)

**Interfaces:**
- Produces: unveränderte Signatur `RunTask(ctx, task, env, taskfilePath) (Result, error)`; neu ist das Verhalten bei Context-Cancel.

- [ ] **Step 1: Failing Test bestätigen (Rotphase)**

Run: `cd mcp-task-runner && go test ./runner/ -run TestSigkillEscalation -v`
expected: FAIL — `executor_internal_test.go:69: RunTask did not return within the escalation window` (Task ignoriert SIGTERM, Kind hält Pipes; WaitDelay-Kill ist unerreichbar).

- [ ] **Step 2: Cancel-Callback auf Prozessgruppen-Eskalation umstellen**

In `RunTask` den Command-Aufbau ersetzen (die `sigkillDelay`-Var existiert bereits seit dem Befund-Commit):

```go
	cmd := exec.CommandContext(ctx, "task", taskArgs...)
	// Eigene Prozessgruppe: Kinder des Tasks erben sie, damit Cancel die
	// ganze Gruppe signalisieren kann (T005592).
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		// Cancel kann vor Start feuern (ctx bereits beendet) — dann ist
		// cmd.Process noch nil; ein Signal an -1 wäre fatal.
		if cmd.Process == nil {
			return nil
		}
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		time.AfterFunc(sigkillDelay, func() {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		})
		return nil
	}
	cmd.WaitDelay = sigkillDelay
```

Der bisherige Einzelprozess-Callback `func() error { return cmd.Process.Signal(syscall.SIGTERM) }` entfällt.

- [ ] **Step 3: Test grün**

Run: `cd mcp-task-runner && go test ./runner/ -run TestSigkillEscalation -v`
Expected: PASS — `RunTask` kehrt innerhalb des Fensters zurück, ExitCode ≠ 0, Kind-PID tot (`syscall.Kill(pid, 0)` = ESRCH).

- [ ] **Step 4: Gesamtes Modul**

Run: `cd mcp-task-runner && go build ./... && go vet ./... && go test ./...`
Expected: alles grün, keine Ausgabe von build/vet.

- [ ] **Step 5: Commit**

```bash
git add mcp-task-runner/runner/executor.go mcp-task-runner/runner/executor_internal_test.go
git commit -m "fix(mcp): escalate task cancel to process-group SIGKILL [T005592]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/mcp-task-runner-cancel-escalation/`, BATS-Suite `tests/spec/mcp-task-runner*`

- [ ] **Step 1: Binary neu bauen und installieren**

Run: `task test:spec:build-mcp-runner`
Expected: `mcp-task-runner: installed fresh build to /usr/local/bin`.

- [ ] **Step 2: BATS-Suite (beide Formen, T002696)**

Run: `tests/unit/lib/bats-core/bin/bats -r tests/spec/mcp-task-runner*`
Expected: PASS — Oberflächen- und Graphen-Tests unbeeinflusst.

- [ ] **Step 3: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0.

- [ ] **Step 4: CI-äquivalente Spec-Suite**

Run: `timeout 900 task test:spec:changed`
Expected: Exit 0.

- [ ] **Step 4.5: Geänderte Domains**

Run: `timeout 900 task test:changed`
Expected: Exit 0 (keine k8s-Manifeste berührt — keine E2E-Gruppe).

- [ ] **Step 5: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json 2>/dev/null || true
git commit -m "chore: regenerate freshness artifacts [T005592]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit (`git show --stat HEAD`).

- [ ] **Step 6: Abschluss-Commit**

```bash
git add openspec/changes/mcp-task-runner-cancel-escalation/
git commit -m "chore(plans): finalize cancel-escalation change [T005592]"
```
