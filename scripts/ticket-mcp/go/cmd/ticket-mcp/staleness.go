package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
)

// buildInfo wird per -ldflags "-X main.buildInfo=..." im Makefile eingesetzt
// [T014940]. Leer = Dev-Build ohne Versionsembedding.
var buildInfo string

// hashFile liefert den sha256 des Dateiinhalts oder "" bei Fehlern.
func hashFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// selfBinaryStale vergleicht den Inhalt des laufenden Prozess-Binaries
// (/proc/self/exe = Inode-Inhalt beim Start) mit dem File on disk. true =
// jemand hat neu gebaut, während dieser Prozess alt blieb — genau das
// Szenario vom 2026-08-23: eine Session hielt ticket-mcp-go auf dem alten
// Inode und ihre gemergten Fixes existierten für sie nicht. Fail-open:
// unlesbare Pfade sind kein Drift-Urteil (dieselbe Regel wie
// scripts/runtime-drift-check.sh §1).
func selfBinaryStale() bool {
	exe, err := os.Executable()
	if err != nil || exe == "" {
		return false
	}
	hProc := hashFile("/proc/self/exe")
	hDisk := hashFile(exe)
	if hProc == "" || hDisk == "" {
		return false
	}
	return hProc != hDisk
}

// warnIfStale schreibt eine deutliche Warnung. Stdio-MCP-Prozesse dürfen NIE
// auf stdout schreiben (Protokollkanal) — deshalb immer stderr bzw. den
// übergebenen Writer.
func warnIfStale(w io.Writer) {
	if !selfBinaryStale() {
		return
	}
	fmt.Fprintf(w,
		"WARNUNG: laufender ticket-mcp hält eine ALTE Binary (build=%q) — gemergte Fixes greifen hier NICHT. Session neu starten (stdio-Respawn) bzw. Binary neu installieren: make -C scripts/ticket-mcp/go install\n",
		buildInfo)
}
