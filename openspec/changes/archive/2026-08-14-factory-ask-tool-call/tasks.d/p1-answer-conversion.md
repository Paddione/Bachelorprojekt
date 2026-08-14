# p1 — Tool-Call-Konversion im factory_ask-Answer-Pfad (T003987)

## Ziel

`factory_ask` reicht rohe Tool-Call-Syntax des Modells (z.B.
`<|tool_call|>call:factory_status{}<tool_call|>`) unverarbeitet an den Aufrufer
durch. Read-only-Tool-Referenzen sollen ausgeführt werden, alles andere wird
verweigert (Operator-Entscheid 2026-08-14: Read-only-Allowlist-Exec).

## Steps

1. **RED.** BATS-Test `tests/spec/ticket-mcp/factory-ask-tool-call.bats` (liegt
   bereits auf dem Branch) läuft rot: weder Allowlist noch Konversionsfunktion
   noch Prompt-Härtung existieren. `expected: FAIL`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-mcp/factory-ask-tool-call.bats
# expected: FAIL
```

2. **GREEN.** In `scripts/factory/mcp-go/main.go`:
   - `factoryReadOnlyTools`-Map: `factory_status`, `factory_queue` (arglose
     Handler). KEINE side-effecting Tools (enqueue/trigger).
   - `toolCallSyntaxRE` (Regex für `<|tool_call|>call:<name>{...}<tool_call|>`,
     Args `{...}` oder `(...)` optional) und
     `resolveToolCallAnswer(ans string) (string, bool)`:
     Allowlist-Treffer → Tool ausführen, Ergebnis als Ersatz-Antwort; Fehler →
     `(model requested tool X; execution failed: …)`; Treffer außerhalb der
     Allowlist → Klartext-Hinweis mit Tool-Namen und „NOT executed — call it
     directly"; kein Treffer → `(ans, false)`.
   - Verdrahtung in `toolFactoryAsk` NACH dem reasoning_content-Fallback, VOR
     dem JSON-Ausgang: bei `handled=true` `ans` ersetzen und `src="tool_call"`.
   - `factorySystemPrompt` ergänzen: „Never emit raw tool-call syntax (like
     <|tool_call|>…<tool_call|>). Name tools inline as plain text (e.g. "use
     factory_status")."
   - `success = true`-Semantik (Slot-Release) bleibt unverändert — die
     Konversion ändert den Release-Pfad nicht.

3. **Verifikation.** BATS-Test aus Step 1 wird grün; bestehende Go-Tests
   (`go test ./scripts/factory/mcp-go/`, T002663) bleiben grün.

## Acceptance

- Tool-Call-Syntax auf read-only Tools liefert das ausgeführte Ergebnis mit
  `source="tool_call"`.
- Tool-Call-Syntax auf enqueue/trigger wird NIE ausgeführt.
- Plain-Text-Antworten bleiben unverändert (handled=false).
- Prompt enthält das explizite Tool-Call-Syntax-Verbot.
