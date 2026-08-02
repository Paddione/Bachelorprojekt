# bge-mcp: Client-Env-Export von BGE_MCP_TOKEN per Check absichern

## Purpose

bge-mcp (Shim auf :13005) verlangt Bearer-Auth via `BGE_MCP_TOKEN`. Der Token muss vor dem Harness-Start in der Umgebung exportiert sein (`{env:BGE_MCP_TOKEN}`). Fehlt der Export, expandiert opencode die Variable zu leer → 401 → Server wird als `failed` markiert. Die Fehldiagnose „Server inaktiv" ist von „Token fehlt im Client-Env" nicht unterscheidbar.

Ein Diagnose-Check + Test-Gate soll die Betriebsvoraussetzung automatisiert prüfen und die drei Zustände differenzieren.

## Requirements

### REQ-bge01: Diagnose-Check-Skript

**GIVEN** `~/.config/bge-mcp/server.env` existiert und enthält `BGE_MCP_TOKEN`
**WHEN** `scripts/bge-mcp/check-client-env.sh` wird ausgeführt
**THEN** exit code 0, Ausgabe bestätigt Token vorhanden + Server antwortet 200

**GIVEN** `~/.config/bge-mcp/server.env` fehlt ODER enthält kein `BGE_MCP_TOKEN`
**WHEN** der Check wird ausgeführt
**THEN** exit code 1, Ausgabe nennt den Fix (bashrc-Zeile)

**GIVEN** der bge-mcp-Server (:13005) ist nicht erreichbar
**WHEN** der Check wird ausgeführt
**THEN** exit code 2, Ausgabe meldet Server down

### REQ-bge02: BATS-Test mit Fake-Env

**GIVEN** ein Fake-Env im tmpdir simuliert die drei Zustände
**WHEN** der BATS-Test läuft
**THEN** alle drei exit codes werden geprüft (CI-sicher, kein Zugriff auf echte Secrets)

### REQ-bge03: Doku-Verweis

**GIVEN** `mcp-tool-guide.md` Zeilen ~248-256 beschreiben die Diagnose
**WHEN** der Check existiert
**THEN** der Diagnose-Block verweist auf `scripts/bge-mcp/check-client-env.sh`

## Scope

- `scripts/bge-mcp/check-client-env.sh` (neu)
- `tests/spec/mcp-gateway/client-env-check.bats` (neu)
- `.claude/skills/references/mcp-tool-guide.md` (update)
- Keine Änderung an `server.mjs` — Bearer-Pflicht ist gewollt
