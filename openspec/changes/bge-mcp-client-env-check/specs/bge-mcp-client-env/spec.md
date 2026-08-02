# Spec Delta: bge-mcp-client-env

## ADDED Requirements

### REQ-bge01: Diagnose-Check-Skript

**GIVEN** `~/.config/bge-mcp/server.env` existiert und enthält `BGE_MCP_TOKEN`
**WHEN** `scripts/bge-mcp/check-client-env.sh` wird ausgeführt
**THEN** exit code 0, Ausgabe bestätigt Token vorhanden + Server antwortet 200

**GIVEN** `~/.config/bge-mcp/server.env` fehlt ODER enthält kein `BGE_MCP_TOKEN`
**WHEN** der Check wird ausgeführt
**THEN** exit code 1, Ausgabe nennt den Fix

**GIVEN** der bge-mcp-Server (:13005) ist nicht erreichbar
**WHEN** der Check wird ausgeführt
**THEN** exit code 2, Ausgabe meldet Server down

### REQ-bge02: BATS-Test mit Fake-Env

**GIVEN** ein Fake-Env im tmpdir simuliert die drei Zustände
**WHEN** der BATS-Test läuft
**THEN** alle drei exit codes werden geprüft

### REQ-bge03: Doku-Verweis

**GIVEN** `mcp-tool-guide.md` beschreibt die Diagnose
**WHEN** der Check existiert
**THEN** der Diagnose-Block verweist auf `scripts/bge-mcp/check-client-env.sh`
