# p2 — Tests: Behavioral-Go-Tests + BATS-Verifikation (T003987)

## Ziel

Neben dem BATS-Quelltext-Check (T002716-Muster, Sibling factory-ask-timeout.bats)
soll die Konversion verhaltensnah abgesichert sein (T002448-M4-Konvention:
Assertions gegen echte Funktionsaufrufe, nicht Source-Greps).

## Steps

1. **RED.** Die neuen Go-Tests existieren noch nicht:
   `go test ./scripts/factory/mcp-go/ -run TestResolveToolCallAnswer` meldet
   „no tests to run". `expected: FAIL`.

```bash
(cd scripts/factory/mcp-go && go test -run TestResolveToolCallAnswer .)
# expected: FAIL (no tests to run — Testdatei-Erweiterung fehlt noch)
```

2. **GREEN.** In `scripts/factory/mcp-go/main_test.go` ergänzen:
   - **Happy Path:** Tool-Call-String auf `factory_status` → `handled=true`,
     Ergebnis ist der JSON-Output des echten `toolFactoryStatus` (Stub: fake
     `psql` im PATH liefert `{"count":0}`-artige Antworten; bestehende
     `writeStubRepo`-Hilfen für FACTORY_REPO wiederverwenden).
   - **Verweigerung:** Tool-Call-String auf `factory_enqueue` → `handled=true`,
     Antwort nennt `factory_enqueue` und „NOT executed"; per PATH-Stub
     verifizieren, dass kein `psql`-Aufruf stattfand (Call-Log).
   - **Passthrough:** Plain-Text-Antwort („Alle Worker sind gesund.") →
     `handled=false`, Rückgabe unverändert.
   - **Allowlist-Inhalt:** `factory_status`/`factory_queue` enthalten,
     `factory_enqueue`/`factory_trigger` nicht.
   - **Regex-Formen:** `call:factory_status{}` und `call:factory_status()` werden
     beide erkannt; Fließtext „call factory_status" NICHT (kein Falsch-Positiv).

3. **Verifikation.**
   ```bash
   (cd scripts/factory/mcp-go && go test ./...)
   tests/unit/lib/bats-core/bin/bats tests/spec/ticket-mcp/factory-ask-tool-call.bats
   ```
   Beides grün; bestehende T002663-Tests unberührt grün.

## Acceptance

- Verhaltensnahe Go-Tests decken Happy Path, Verweigerung, Passthrough und
  Regex-Formen ab.
- BATS-Quelltext-Check bleibt grün (T002716).
- Keine Ausführung side-effecting Tools (durch Call-Log belegt).
