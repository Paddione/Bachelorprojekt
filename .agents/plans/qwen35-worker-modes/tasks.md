---
title: Qwen3.5 instruction workers with request reasoning modes
ticket_id: T900930
domains: [ops]
status: staged
---
# Qwen3.5 worker modes — Implementation Plan

## File Structure
- `.opencode/agent-models.jsonc`: worker provider model, request mode, context and prompt routing.
- `.opencode/oh-my-opencode-slim.jsonc`: existing explorer/librarian worker references.
- `.opencode/prompts/qwen35-worker.md`: dedicated instruction-worker contract.
- `scripts/llm/start-qwen35-4b-service.ps1`: reproducible Windows-native worker launcher.
- `docs/runbooks/qwen35-worker-modes.md`: mode switching, verification and rollback.
- `docs/agent-guide/registry/runtimes.md`: runtime role assignments.
- `tests/spec/qwen35-worker-modes.bats`: worker routing and mode regression checks.

## Zweck und Entscheidungen
Den bestehenden 4B-Instruct-Worker durch die neueren Qwen3.5-4B-Gewichte ersetzen. Der 27B bleibt Planer und Orchestrator auf der separaten 5070 Ti. Ein Resident-Modell bedient Thinking und Non-Thinking pro Request; Non-Thinking ist Worker-Default. Bestehende Rollen-Handles bleiben kompatibel. Kein Modelltraining und keine bezahlten Jobs. GGUF und Windows-Binary sind lokal vorhanden. Graph-MCP ist nicht exponiert; gezielte Config- und Source-Reads ersetzen Graph-Evidenz. Live-Endpunkt 8080 ist derzeit nicht erreichbar; dies begrenzt die Live-Verifikation.

## Task 1 — Regression and compatibility
- [ ] Add focused BATS checks and run `tests/unit/lib/bats-core/bin/bats tests/spec/qwen35-worker-modes.bats` (expected: FAIL before implementation).
- [ ] Verify OpenCode/provider transport supports per-request `chat_template_kwargs`; do not invent unsupported variants. Document exact working API and any client limitation.

## Task 2 — Implement routing and launcher
- [ ] Update worker model references and add dedicated worker prompt with correct context and permissions; retain the 27B assignments.
- [ ] Track an ASCII Windows launcher using existing pinned Qwen3.5 GGUF, text-only, 3060 Ti GPU selection, non-thinking default and explicit health/model validation. Use conservative context pending Windows measurements, avoid claiming old Linux measurements as current.
- [ ] Document per-request mode switching and rollback. Update runtime SSOT/generated config through canonical sync.

## Task 3 — Verify and deliver
- [ ] Run focused BATS, PowerShell parser, request serialization/template checks. If live runtime is reachable, verify both modes on same PID and tool calls; otherwise report the precise limitation without claiming activation.
- [ ] Run `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task workspace:validate` with postcommit freshness verification.
- [ ] Commit/push and create a scoped draft PR; T900930 remains open for its broader deliverables. Do not merge unrelated pipeline work or close the ticket.

## Budgets
Config and existing scripts stay within current baselines. New worker prompt and runbook under 200 lines each; launcher under 180 lines; focused BATS under 200 lines. No nested agent fan-out.
