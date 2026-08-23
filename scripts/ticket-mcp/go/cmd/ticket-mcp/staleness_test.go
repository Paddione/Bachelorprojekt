package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestHashFileKnownContent(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "ticket-mcp-go")
	content := []byte("\x7fELF-fake-ticket-mcp-binary")
	if err := os.WriteFile(p, content, 0o755); err != nil {
		t.Fatalf("fixture schreiben fehlgeschlagen: %v", err)
	}
	sum := sha256.Sum256(content)
	want := hex.EncodeToString(sum[:])
	if got := hashFile(p); got != want {
		t.Fatalf("hashFile = %q, will %q", got, want)
	}
}

func TestHashFileMissingPathIsEmpty(t *testing.T) {
	if got := hashFile(filepath.Join(t.TempDir(), "missing")); got != "" {
		t.Fatalf("hashFile auf fehlender Datei = %q, will \"\"", got)
	}
}

// Der Test-Prozess hält sein eigenes, nicht ersetztes Binary — die Warnung
// darf schweigen. Ein false positive würde JEDE Session mit Warnmüll nerven.
func TestWarnIfStaleSilentOnFreshProcess(t *testing.T) {
	var buf bytes.Buffer
	warnIfStale(&buf)
	if buf.Len() != 0 {
		t.Fatalf("unerwartete Stale-Warnung: %q", buf.String())
	}
}

func TestSelfBinaryStaleFreshProcessIsFalse(t *testing.T) {
	if selfBinaryStale() {
		t.Fatal("selfBinaryStale() = true für einen frischen Prozess — Fail-open kaputt")
	}
}
