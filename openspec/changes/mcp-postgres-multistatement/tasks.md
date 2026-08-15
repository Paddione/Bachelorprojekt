---
title: "mcp-postgres-multistatement — Implementation Plan"
ticket_id: T006293
domains: [scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-postgres-multistatement — Implementation Plan

_Ticket: T006293_

## File Structure

| Datei | Aktion |
|---|---|
| `scripts/mcp-gateway/mcp-postgres-local.mjs` | ändern: Multi-Statement-Erkennung (präventiv + defensiv) |
| `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats` | neu (RED-Test, liegt im Stage-Commit vor) |
| `website/src/data/test-inventory.json` | regenerieren via `task test:inventory` |
| `openspec/changes/mcp-postgres-multistatement/specs/mcp-gateway.md` | Requirement-Delta (liegt vor) |

## Budgets (S1)

- `scripts/mcp-gateway/mcp-postgres-local.mjs`: Ist 181 Zeilen, nicht-baselined,
  `.mjs`-Limit 800 (gates.yaml) → Budget 619. Der Guard (~30 Zeilen) passt ohne Split.
- `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats`: neue Datei; `gates.yaml`
  hat kein S1-Limit für `.bats`.

## Partials

Ein einzelnes Partial p1 — keine Aufteilung nötig (ein Fix, eine Testdatei).

| Partial | Dateien |
|---|---|
| p1 | `scripts/mcp-gateway/mcp-postgres-local.mjs`, `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats`, `website/src/data/test-inventory.json` |

## Tasks

### Task 1: RED — Bug reproduzieren (Test liegt bereit)

- [x] RED bestätigt (2026-08-15): beide Tests rot — Test 1 liefert `{"text":"[]"}` statt Fehler, Test 2 `Query failed: connect ECONNREFUSED` (kein präventiver Guard)

Der failing Test `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats` ist bereits im
Stage-Commit enthalten. Zwei `@test`-Blöcke: (1) Multi-Statement-SQL → JSON-RPC-Fehler
statt `[]`, mit Positiv-Anker (Einzel-Statement liefert Zeilen) und DB-Guard auf `:15432`
(skippt in CI ohne lokale DB); (2) präventive Ablehnung vor der DB-Ausführung, läuft auch
ohne DB. Zuerst ausführen und den roten Zustand bestätigen — ohne Fix liefert der Adapter
`{"text":"[]"}` bzw. `Query failed: connect ECONNREFUSED`:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-postgres-multistatement.bats
# expected: FAIL (beide Tests rot — der Fix fehlt noch)
```

### Task 2: GREEN — Multi-Statement-Guard in mcp-postgres-local.mjs

- [x] Implementiert (2026-08-15): `isMultiStatement()`-Scanner (präventiv) + defensiver `Array.isArray`-Check + Tool-Beschreibung; Tests grün; Gegenprobe `bats -r tests/spec/mcp-gateway*` grün (88 Tests). Hinweis: Negativ-Assertion in Test 1 auf `if`-Form korrigiert (die `&& { return 1; }`-Form bricht unter BATS `set -e` auch bei erfüllter Negativ-Bedingung ab — Test konnte so nie grün werden)

In `handleToolsCall()` von `scripts/mcp-gateway/mcp-postgres-local.mjs`:

1. **Präventiv** vor `pool.query(sql)`: ein Scanner `isMultiStatement(sql)` erkennt ein
   Semikolon außerhalb von String-Literalen (`'…'` und `"…"` inkl. `''`-Escapes) und
   Kommentaren (`--`, `/* */`), hinter dem noch Nicht-Whitespace-Inhalt folgt. Trifft
   das zu → `throw { code: -32602, message: 'Only single-statement queries are supported' }`
   (gleicher Fehlercode wie der bestehende SELECT/WITH/EXPLAIN-Guard, Zeilen 82–85).
2. **Trailing Semicolon** (`SELECT 1;`) zählt NICHT als zweites Statement: semikolonloser
   Rest → weiterhin ausführen (pg liefert dort ein einzelnes Result; keine Regression).
3. **Defensiv** nach `pool.query(sql)`: `if (Array.isArray(result))` → derselbe Fehler.
   pg liefert bei mehreren Statements ein Array von Results; das fängt Parser-Lücken ab
   und verhindert, dass `result.rows` (dort `undefined`) jemals als leeres Array
   ausgegeben wird. `rows = result.rows` erst danach.
4. Tool-Beschreibung (Zeile 32) um den Hinweis ergänzen, dass pro Aufruf nur ein
   einzelnes Statement akzeptiert wird.

Danach muss der RED-Test grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-postgres-multistatement.bats
# expected: PASS (2 Tests grün)
```

Zusätzlich die bestehenden mcp-gateway-Tests gegenregeln (beide Formen, T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mcp-gateway*
```

### Task 3: Verifikation und Abschluss

- [ ] offen

```bash
task test:inventory          # neue .bats-Datei im Test-Inventar registrieren (CI-Check)
task test:changed
task freshness:regenerate
task freshness:check
```

Danach den laufenden Adapter-Prozess neu starten, damit der Fix auf `:13001` wirksam wird
(kein systemd-Service; Start wie bisher aus dem Haupt-Checkout):

```bash
pkill -f mcp-postgres-local.mjs || true
cd /home/patrick/Bachelorprojekt && nohup node scripts/mcp-gateway/mcp-postgres-local.mjs >/tmp/mcp-postgres-local.log 2>&1 &
```

Probe: Multi-Statement-Query gegen `http://127.0.0.1:13001/mcp` liefert jetzt einen
JSON-RPC-Fehler (code `-32602`), kein leeres Array.
