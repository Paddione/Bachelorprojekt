# Design: factory-ask-tool-call (T003987)

## Symptom & Beleg

- Beobachtung 2026-08-13 (repo-hygiene §5): `factory_ask("Sind alle Factory-Worker
  gesund? …")` → Antwort `'<|tool_call|>call:factory_status{}<tool_call|>'`
  (source=content, model=gemma26-throughput). Zweifacher Aufruf reproduzierte den
  String konsistent (Ticket-Beschreibung T003987).
- Code-Pfad: `toolFactoryAsk` → `msg.Content` → `ans` (Trim) → JSON-Antwort.
  Keine Nachverarbeitung. `resolveLLM` routet via `route-provider.sh`; der
  Default-Anbieter ist `gemma26-throughput` (route-provider.sh:64/174).

## Optionen (Brainstorming 2026-08-14)

| Option | Bewertung |
|---|---|
| A. Read-only-Allowlist-Exec | Erfüllt die Modell-Intention (Antwort auf die Zustandsfrage) sicher; gewählt ✅ |
| B. Strip + Hinweis | Einfachster Code, aber die Frage bleibt unbeantwortet |
| C. Prompt-Fix + Retry | Zweiter LLM-Roundtrip im 45s-Budget; Modell reproduziert das Muster konsistent (Beleg: Doppelaufruf) |

## Implementierung (in `scripts/factory/mcp-go/main.go`)

1. **Allowlist-Map** (arglose read-only Handler):
   ```go
   var factoryReadOnlyTools = map[string]func() (string, bool, error){
       "factory_status": func() (string, bool, error) { return toolFactoryStatus() },
       "factory_queue":  func() (string, bool, error) { return toolFactoryQueue() },
   }
   ```
   `factory_recent`/`openspec_find_similar` verlangen Argumente — deren Arg-Parsing
   aus freiem Modell-Output ist Scope-Creep; sie fallen in den Verweigerungspfad.

2. **Erkennung + Konversion:**
   ```go
   // toolCallSyntaxRE matches raw tool-call emission like
   // <|tool_call|>call:factory_status{}<tool_call|> (args {...} or (...), optional).
   var toolCallSyntaxRE = regexp.MustCompile(`<\|tool_call\|>call:([a-z_]+)(?:\{[^}]*\}|\([^)]*\))?<tool_call\|>`)

   // resolveToolCallAnswer converts raw tool-call syntax in a model answer:
   // allowlisted read-only tools are executed and their result returned;
   // side-effecting tools are never executed — a plain-text note is returned.
   // handled=false when no tool-call syntax is present (answer unchanged).
   func resolveToolCallAnswer(ans string) (string, bool)
   ```
   - Treffer + Allowlist → Tool ausführen; Fehler → `(model requested tool X; execution failed: …)`.
   - Treffer + keine Allowlist → `(model requested tool X — side effects; NOT executed. Call X directly.)` — Klartext, kein Exec.
   - Kein Treffer → `(ans, false)`.

3. **Verdrahtung** in `toolFactoryAsk` NACH dem reasoning_content-Fallback, VOR dem JSON-Ausgang:
   ```go
   if repl, ok := resolveToolCallAnswer(ans); ok {
       ans = repl
       src = "tool_call"
   }
   ```

4. **Prompt-Härtung** (factorySystemPrompt ergänzen):
   `IMPORTANT: Never emit raw tool-call syntax (like <|tool_call|>…<tool_call|>).
   Name tools inline as plain text (e.g. "use factory_status").`

## Risiken & Grenzen

- **Falsch-Positive:** Der Regex matcht nur die beobachtete delimitierte Form —
  Fließtext wie „call factory_status" bleibt unberührt (kein Exec bei natürlicher
  Sprache).
- **Exec-Umfang:** Nur zwei arglose read-only Handler — kein Schreibzugriff,
  keine Argument-Injektion möglich.
- **Slot-Verhalten unverändert:** `resolveLLM`/`release-slot.sh`-Pflicht
  (software-factory.md „factory-mcp releases its slot…") bleibt unberührt.
- **Determinismus:** Die LLM-Ausgabe bleibt nicht deterministisch — der BATS-Test
  prüft deshalb Quelltext-Struktur (T002716-Muster wie factory-ask-timeout.bats);
  Go-Tests prüfen die Konversionsfunktion verhaltensnah (T002448-M4).
