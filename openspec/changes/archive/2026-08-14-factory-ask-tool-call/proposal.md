# Proposal: factory-ask-tool-call

## Why

`factory_ask` ist die LLM-gestützte Q&A-Schnittstelle der Software Factory. Das
geroutete Durchsatzmodell (gemma26-throughput) emittiert auf Fragen nach dem
Factory-Zustand regelmäßig rohe Tool-Call-Syntax statt einer natürlichsprachlichen
Antwort — beobachtet am 2026-08-13 während repo-hygiene §5:
`<|tool_call|>call:factory_status{}<tool_call|>` (source=content, model=gemma26-throughput).
Ein zweiter Aufruf lieferte konsistent denselben String; die Health-Frage blieb
unbeantwortet (Verwandt: T003803 factory_ask-Timeout — anderes Symptom).

Der Handler `toolFactoryAsk` (`scripts/factory/mcp-go/main.go`) reicht
`msg.Content` unverarbeitet durch — es existiert weder Erkennung noch Konversion
von Tool-Call-Syntax. Der System-Prompt fordert das Modell zwar auf, Tools
„vorzuschlagen" — das Modell wählt stattdessen die wörtliche Tool-Call-Form.

## What

1. **Erkennung + Read-only-Ausführung:** Rohe Tool-Call-Syntax im Answer
   erkennen; referenziert sie ein read-only Tool (`factory_status`,
   `factory_queue`), wird es sofort ausgeführt und sein Ergebnis als Antwort
   geliefert (`source="tool_call"`).
2. **Harte Allowlist:** Side-effecting Tools (`factory_enqueue`,
   `factory_trigger`) werden NIE auto-ausgeführt — stattdessen Klartext-Hinweis,
   das Tool direkt aufzurufen.
3. **Prompt-Härtung:** Der System-Prompt verbietet explizit rohe Tool-Call-Syntax
   und verlangt Tool-Namen als Fließtext.

Operator-Entscheid (Brainstorming 2026-08-14): **Read-only-Allowlist-Exec**
(Option A) statt Strip-only oder Retry.

_Ticket: T003987_
