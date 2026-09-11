# Proposal: opencode-factory-context-tuning

## Why

Die Factory läuft auf Qwen3.6-35B-A3B (FreeToken-native, 200k ctx gemessen) mit
opencode-V2-Defaults (`buffer: 20000`, `keep.tokens: 8000`): Compaction triggert
erst bei `context − max(output, buffer)` ≈ 180k — die Session wächst bis ans
Maximum statt bei 60–100k aktiv zu bleiben. `origin/main` enthält gar keinen
`compaction`-Block; der alte Block im Haupt-Checkout (`reserved`,
`preserve_recent_tokens`) sind V1-Keys, die V2 ignoriert. Dazu kommt
Tool-Schema-Tax (global alles erlaubt, keine Rollen-Einschränkung), alternde
Long-Running-Sessions statt frischer Partial-Sessions und ein 211-zeiliges
AGENTS.md über dem 160-Zeilen-Ziel.

## What

V2-Compaction auf Ziel ~100k (`buffer: 96000`, `keep.tokens: 16000`),
Tool-Restriktion pro Factory-Rolle, Fresh-Session-Betrieb an
Ticket-/Partial-Grenzen, Research/Implement-Trennung, informationsförmiges
Tool-Output, explizite Stopp-Bedingungen, `Rejected approaches`-Pflege,
Partial-Cap 3–7 Files, Compact-an-Phasenübergängen, Poisoning-Watch und
AGENTS.md-Slimming auf ≤160 Zeilen. Parent-Spec: `llm-local-dev`.

## Scope

In scope: `.opencode/opencode.jsonc`, `.opencode/agent-models.jsonc` (+Sync),
`.opencode/prompts/orchestrator.md`, `.opencode/prompts/local-subagent.md`,
`AGENTS.md` (+Verweise), Task-Paket-Template, Spec-Delta, BATS-Guards.
Out of scope: Modell-Limits/KV-Ladder, neue Provider, CI-Logik, Deploy-Routing.

_Ticket: T900074_
