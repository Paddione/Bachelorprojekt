// mcp-task-runner/runner/executor_internal_test.go
// package runner (intern): Zugriff auf sigkillDelay für schnelle Timing-Tests.
package runner

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// TestSigkillEscalation pins the cancel semantics (T005592): SIGTERM via
// cmd.Cancel at context cancellation; SIGKILL via time.AfterFunc after
// sigkillDelay, so a task that ignores SIGTERM cannot outlive the
// escalation window (WaitDelay remains the backstop).
func TestSigkillEscalation(t *testing.T) {
	old := sigkillDelay
	sigkillDelay = 200 * time.Millisecond
	t.Cleanup(func() { sigkillDelay = old })

	pidFile := filepath.Join(t.TempDir(), "child.pid")
	dir := t.TempDir()
	script := "trap '' TERM\necho $$ > '" + pidFile + "'\nsleep 60\n"
	if err := os.WriteFile(filepath.Join(dir, "task"), []byte("#!/bin/sh\n"+script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan Result, 1)
	start := time.Now()
	go func() {
		r, _ := RunTask(ctx, "stubborn", "dev", "Taskfile.yml")
		done <- r
	}()

	// Warten, bis das Kind läuft und seine PID kennt.
	var pid int
	for i := 0; i < 100; i++ {
		b, err := os.ReadFile(pidFile)
		if err == nil {
			if _, err := fmt.Sscanf(string(b), "%d", &pid); err == nil && pid > 0 {
				break
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	if pid == 0 {
		t.Fatal("child never wrote its PID")
	}

	// Positiv-Anker: Kind lebt und ignoriert SIGTERM.
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		t.Fatalf("child not alive before cancel: %v", err)
	}

	cancel() // Context-Cancel → cmd.Cancel (SIGTERM) → WaitDelay → SIGKILL

	select {
	case r := <-done:
		if r.ExitCode == 0 {
			t.Errorf("want non-zero exit after kill, got %d", r.ExitCode)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("RunTask did not return within the escalation window")
	}

	if elapsed := time.Since(start); elapsed > 1500*time.Millisecond {
		t.Errorf("escalation took too long: %v", elapsed)
	}

	// Nachweis: Der Prozess ist tot (SIGKILL), nicht nur entkoppelt.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); err == syscall.ESRCH {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Errorf("child pid %d still alive after escalation", pid)
}
