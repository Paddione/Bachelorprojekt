package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestHashFileKnownContent(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "factory-mcp")
	content := []byte("#!/bin/sh\necho fake-binary\n")
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
	got := hashFile(filepath.Join(t.TempDir(), "does-not-exist"))
	if got != "" {
		t.Fatalf("hashFile auf fehlender Datei = %q, will \"\"", got)
	}
}

// Der Test-Prozess selbst ist frisch (sein Binary wurde nicht ersetzt,
// während er lief) — serverStale muss false melden. Das fixiert zugleich die
// Fail-open-Regel: keine Ausnahme, kein falscher Drift.
func TestServerStaleFreshProcessIsFalse(t *testing.T) {
	if serverStale() {
		t.Fatal("serverStale() = true für einen frischen Prozess — Fail-open kaputt")
	}
}
