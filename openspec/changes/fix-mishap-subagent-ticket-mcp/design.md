## Context

**Mishap 1 — qwen35-iq4 empty output:** Der Subagent läuft auf LM Studio (lokaler GPU-Host mit RTX 5070 Ti). Die Konfiguration in `.opencode/agent-models.jsonc` nutzt Qwen3.6-14B-A3B (IQ4_XS quantization, ~14B MoE, 4 parallel slots à 65k context). Das Modell startet, der Chat-Completion-Endpoint antwortet, aber der Prompt (insbesondere bei delegierten Research-Tasks mit umfangreichem Kontext) triggert keine generativen Tokens. Mögliche Ursachen: (a) Prompt-Template-Inkompatibilität (LM Studio vs. opencode-Format), (b) Context-Overflow durch zu großen System-Prompt + Skill-Content, (c) Modell-spezifisches Issue mit dem IQ4_XS Quant.

**Mishap 2 — triage_ticket component-Parameter:** `ticket-mcp` ist ein remote MCP-Server. Der `triage_ticket` Tool akzeptiert laut JSON-Schema nur: `id, type, severity, priority, attention_mode, status`. `component` fehlt. Repo-Location des ticket-mcp Servers ist `brett/` (Go-basierter MCP-Server).

## Goals / Non-Goals

**Goals:**
- Mishap 1: Root Cause identifizieren, Fix bereitstellen (oder Workaround dokumentieren)
- Mishap 2: component-Parameter zu triage_ticket hinzufügen, oder Workaround-Dokumentation in ticket-ops skill

**Non-Goals:**
- Komplette Überarbeitung des Subagent-Dispatch-Mechanismus
- Weitere ticket-mcp Tools ändern

## Decisions

**Mishap 1:** Prompt-Template-Format prüfen. Qwen3.6-14B-A3B erwartet u.U. ChatML-Format (`<|im_start|>system...<|im_end|>`). opencode sendet ggf. OpenAI-kompatible Messages — das sollte funktionieren. Wahrscheinlicher: Context-Overflow bei langen Research-Prompts (Skill-Content + Ticket-Description + File-Contents). Quick-Win: Prompts kürzen, oder Debug-Logging aktivieren.

**Mishap 2:** PR an `brett/` mit `component`-Feld im `triage_ticket`-Handler. Parallel Workaround-Dokumentation in ticket-ops skill (set_plan_meta für areas + add_comment für component-Info).

## Risks / Trade-offs

- **[Risk] Mishap 1 nicht reproduzierbar:** Subagent läuft auf GPU, Verhalten kann schwanken. → Workaround ist immer: Fallback auf inline-Execution.
- **[Risk] PR für ticket-mcp blockiert:** Der ticket-mcp Server ist Go-basiert in `brett/`. Wenn Änderungen dort komplex sind, reicht Workaround-Dokumentation.
