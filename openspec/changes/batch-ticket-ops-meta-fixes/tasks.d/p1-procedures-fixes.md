# p1 — Triage-Query: Token-Limit bei ~96 Tickets (T003174)

## Ziel

Die json_agg-Query aus ticket-ops-procedures.md §Step 1.1 liefert 52.548 Zeichen
und wird von mcp-postgres mit "exceeds maximum allowed tokens" abgewiesen.

## Steps

1. **RED.** Test in `tests/spec/batch-ticket-ops-meta-fixes.bats`: die Triage-Query
   ist chunkbar (LIMIT/OFFSET) oder nutzt eine Datei-Ausgabe. `expected: FAIL`
   (einmaliger json_agg über den Gesamtbestand).

2. **GREEN.** In `.claude/skills/references/ticket-ops-procedures.md` §Step 1.1:
   - Query chunken (LIMIT/OFFSET nach Priorität, z.B. 50er-Chunks), ODER
   - Feldliste kürzen (readiness/depends_on nur aggregiert), ODER
   - Dokumentieren, dass die Ergebnisdatei der Weiterverarbeitungsweg ist.
   Entscheidung im Plan festhalten (die günstigste Variante ist Chunking).

3. **Verifikation.** Fall aus T003174: 96+ Tickets über MCP konsumierbar.

## Acceptance

- Triage-Query funktioniert bei ~100 Tickets über mcp-postgres.
- Skalierungsbruch dokumentiert und behoben.

## Zusätzlich (D1-gebündelt): p2 — Wellenbildung Freshness-Kante

Die Verfahrens-Änderung aus T003176 (ticket-ops-procedures.md §Step 3.1/3.2)
wird HIER im selben Partial umgesetzt, weil beide p1 und p2 dieselbe Datei
berühren (D1-Regel: eine Datei nur in einem Partial).

- Freshness-Generate (openspec-status.json, test-inventory.json) als implizite
  geteilte area der Wellenbildung behandeln — oder dev-flow-plan-Wellen
  grundsätzlich als seriell-mergend kennzeichnen und das im Masterplan-Format
  ausweisen (T003176).
