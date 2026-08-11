# p1 — ticket-ops-Prozeduren: Triage-Query Chunking (T003174) + Wellenbildung Freshness-Kante (T003176)

_Ticket: T003541 · Partial p1 (impl) · Kinder: T003174, T003176_

## Ziel

Zwei Skalierungs-/Erkennungsbrüche in der ticket-ops-Prozedur auf einen Schlag
beheben. Beide betreffen DIESELBE Datei
(`.claude/skills/references/ticket-ops-procedures.md`), deshalb in einem Partial
(D1-Regel: eine Datei nur in einem Partial).

## Kinder

1. **T003174 — Triage-Query Token-Limit.** Die json_agg-Query aus §Step 1.1
   liefert bei ~96 offenen Tickets 52.548 Zeichen und wird von
   `mcp__mcp-postgres__query` mit "exceeds maximum allowed tokens" abgewiesen.
   Das Ergebnis landet in einer Datei im Tool-Results-Verzeichnis; die Query ist
   über MCP nicht mehr direkt konsumierbar. Der Skalierungsbruch ist nicht
   dokumentiert (Beispiel nennt N=17).

2. **T003176 — Wellenbildung Freshness-Kante.** Die Soft-Conflict-Kante aus
   §Step 3.1 serialisiert zwei Tickets nur bei geteiltem `areas`-Eintrag. Sie
   fängt nicht, dass alle Welle-1-Branches dasselbe generierte Artefakt
   (`website/src/data/openspec-status.json`) ändern — jede dev-flow-plan-Einheit
   regeneriert die Statuskarte und committet sie mit. Eine areas-basierte
   Heuristik kann das strukturell nicht sehen.

## Entscheidungen (im Plan festgehalten)

- **T003174 → Chunking per LIMIT/OFFSET nach Priorität** (Vorschlag aus dem
  Ticket, Variante "chunken"). Feldliste kürzen verliert Information, die in
  Phase 1 gebraucht wird; Datei-Ausgabe verschiebt den Bruch nur. Chunking
  erhält den MCP-direkten Konsum. Chunkgröße so wählen, dass ein Chunk weit
  unter dem Token-Limit bleibt (50er-Chunks bei ~96 Tickets ≈ 2 Chunks).
- **T003176 → Freshness-Generate als implizite geteilte area.** Die Wellenbildung
  behandelt die generierten Artefakte (`openspec-status.json`,
  `test-inventory.json`) als zusätzliche "area freshness" jeder
  dev-flow-plan-Einheit, sodass die bestehende Konfliktkante ohne neue
  Mechanik greift. (Alternative "grundsätzlich seriell-mergend" ist zu grob —
  sie serialisiert auch Einheiten ohne jegliches geteiltes Artefakt.)

## Steps

1. **RED.** BATS-Test in `tests/spec/batch-ticket-ops-meta.bats` (wird in p6
   gesammelt, hier nur die Anforderung angeben):
   - `triage chunk`: die Triage-Query ist per LIMIT/OFFSET chunkbar und jeder
     Chunk bleibt unter dem Token-Limit (z.B. über ein wc -c auf die Query-
     Ausgabe bei 96+ Testdatensätzen oder einen Struktur-Grep auf LIMIT/OFFSET
     in der Prozedur).
   - `freshness edge`: zwei Tickets ohne gemeinsame area, aber mit
     Freshness-Artefakt-Überschneidung → Konfliktkante erkannt (Struktur-Grep
     auf die Prozedur + Positiv-Pfad).

2. **GREEN.** In `.claude/skills/references/ticket-ops-procedures.md`:
   - §Step 1.1: Query in Chunks dokumentieren (LIMIT/OFFSET nach Priorität,
     z.B. 50er-Chunks) + den Skalierungsbruch und die Chunk-Größe explizit
     dokumentieren (N=96 → 2 Chunks, N=200 → 4 Chunks).
   - §Step 3.1: Freshness-Generate (openspec-status.json, test-inventory.json)
     als implizite geteilte area definieren; Erklärung, WARUM die areas-Heuristik
     das sonst nicht sieht (generiertes Artefakt als Nebenwirkung jedes
     Planlaufs).
   - §Step 3.2: Wellenformel entsprechend erweitern (Freshness-Kante wie
     areas-Kante behandeln).

3. **Verifikation.** Fälle aus T003174/T003176: 96+ Tickets über MCP
   konsumierbar; vier dev-flow-plan-Einheiten mit geteiltem
   openspec-status.json werden serialisiert.

## Acceptance

- Triage-Query funktioniert bei ~100 Tickets über mcp-postgres (kein
  Token-Error).
- Wellenbildung erkennt Kollisionen über generierte Artefakte und serialisiert
  sie.
- Beide Brüche sind in der Prozedur dokumentiert (kein stiller Skalierungsbruch
  mehr).
