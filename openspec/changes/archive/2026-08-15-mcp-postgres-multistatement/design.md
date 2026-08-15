# T006293: mcp-postgres liefert leeres Array bei Multi-Statement-SQL statt Fehler

## Problem

Ein `mcp__mcp-postgres__query`-Aufruf mit vier durch Semikolon getrennten
Statements liefert `[]` — ununterscheidbar von einem leeren Ergebnis.
COUNT-Queries liefern immer mindestens eine Zeile, daher ist `[]` nachweislich
kein Messwert. Einzel-Statements funktionieren korrekt.

## Symptom vs. Ursache (T002448-M5)

**Symptom (reproduziert):** Live-Aufruf gegen den laufenden Adapter auf
`http://127.0.0.1:13001/mcp` mit
`SELECT 1 AS a; SELECT 2 AS b; SELECT 3 AS c; SELECT 4 AS d` → Response
`{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"[]"}]}}`.

**Ursache (verifiziert mit Minimal-Reproducer gegen die lokale k3d-Dev-DB,
Stand HEAD des Worktrees):**

```js
const result = await pool.query('SELECT 1 AS a; SELECT 2 AS b; SELECT 3 AS c; SELECT 4 AS d');
// result isArray: true          → pg liefert bei Multi-Statement ein Array von Results
// result.rows: undefined        → .rows existiert auf dem Array nicht
JSON.stringify(result.rows)      // === undefined
text || '[]'                     // === '[]'  → der Server antwortet mit leerem Array
```

Gegenprobe: Einzel-Statement `SELECT 1 AS total_open` → `[{"total_open":1}]`.
Trailing Semicolon `SELECT 1 AS x;` → einzelnes Result (kein Array) — läuft
heute und muss weiterlaufen. Der Bug-Fall ist also exakt „mehr als ein
Statement", nicht „Semikolon vorhanden".

Der Defekt sitzt in `scripts/mcp-gateway/mcp-postgres-local.mjs`
`handleToolsCall()` (Zeilen 87–98): `rows` ist `undefined`, und
`text || '[]'` münzt das in ein leeres Array um. Es ist die verifizierte
Instanz der Runbook-Grundregel „leere Antwort muss von negativer unterscheidbar
sein" (repo-hygiene-ops §3, [leere-api-antwort-ist-kein-urteil]).

## Fix-Ansatz

Multi-Statement-SQL wird abgelehnt (fail-closed, Ticket-Vorgabe) — konsistent
mit dem bestehenden read-only-Guard (nur SELECT/WITH/EXPLAIN, gleicher
JSON-RPC-Fehlercode `-32602`). Keine Alternative (Ausführen + Zusammenführen)
ernsthaft erwogen: Die Query-Schnittstelle liefert eine einzelne Tabelle, und
der Adapter ist als minimaler Read-Only-Wrapper konzipiert.

**Zwei Verteidigungslinien:**

1. **Präventiv** (vor `pool.query`): Scanner, der Semikolons außerhalb von
   String-Literalen (`'…'`, `"…"` inkl. `''`-Escapes) und Kommentaren
   (`--`, `/* */`) findet, **hinter denen noch Nicht-Whitespace-Inhalt folgt**
   → mehr als ein Statement → JSON-RPC-Fehler. Trailing Semicolon zählt nicht
   als zweites Statement (keine Regression für `SELECT 1;`). Vorteil: die
   Statements werden gar nicht erst ausgeführt (fail-fast, kein unnötiger
   DB-Roundtrip); der Pfad ist ohne DB testbar.
2. **Defensiv** (nach `pool.query`): `Array.isArray(result)` → JSON-RPC-Fehler.
   Fängt alle Fälle ab, in denen pg mehrere Results liefert (Parser-Lücken,
   Exoten) — 3 Zeilen, kostet nichts.

**Fehlermeldung:** JSON-RPC-Error `-32602` (Invalid params) mit Message, die
„single-statement" nennt — semantische Unterscheidung zu `Query failed: …`.

## Test-Design (Rot-Grün)

`tests/spec/mcp-gateway/mcp-postgres-multistatement.bats` (eine Datei pro
Vorgang, T002416; Verzeichnis `tests/spec/mcp-gateway/`):

- Der Test **startet den echten Adapter selbst** auf einem freien Port mit
  Wegwerf-`DATABASE_URL` (Muster `bge-http-only-get.bats`) und prüft die
  JSON-RPC-Antwort per curl — Output-Verifikation (T002448-M4), kein
  Source-Grep.
- **Test 1 (ehrlicher Rot-Grün-Test):** braucht die lokale k3d-Dev-DB auf
  `:15432` — Verfügbarkeits-Guard in der Rotphase (T002820): ohne DB `skip`
  (CI hat keine lokale DB). Reihenfolge im Test: erst Positiv-Anker
  (Einzel-Statement liefert Zeilen), dann Negativ-Aussage (Multi-Statement →
  Fehler, kein `[]`) — Positiv-Anker-Pflicht (T002356-M1).
- **Test 2 (CI-wirksam):** Adapter mit unerreichbarer DB (freier Port aus
  demselben Scan) starten → Multi-Statement muss mit „single-statement"-Fehler
  abgelehnt werden, **bevor** die DB gebraucht wird. Vor dem Fix: `Query failed:
  connect ECONNREFUSED` (rot); nach dem Fix: Ablehnungsfehler (grün). Sichert
  den präventiven Pfad in CI ab, wo Test 1 skippt.

## Nicht betroffen

- Der in-cluster Monolith (`claude-code-mcp-monolith`, fleet, T002307): anderes
  System, kapselt bereits in `READ ONLY`-Transaktion ein; nicht Teil des
  Tickets und nicht durch diese Änderung berührt.
- `mcp-kubernetes` (:18080) und die übrigen Gateway-Ports.
- Write-Pfad: Der Adapter ist read-only; die SELECT/WITH/EXPLAIN-Beschränkung
  bleibt unverändert.

## Deployment

Der laufende Prozess auf :13001 ist der lokale Node-Adapter (Start aus dem
Haupt-Checkout, `node scripts/mcp-gateway/mcp-postgres-local.mjs`, kein
systemd-Service). Nach dem Merge: Prozess neu starten (`pkill -f
mcp-postgres-local.mjs`, dann identisch wieder starten).
