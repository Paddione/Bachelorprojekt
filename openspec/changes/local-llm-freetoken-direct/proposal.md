# Proposal: local-llm-freetoken-direct

## Why
Der `llm-proxy.service` (WSL, 127.0.0.1:18235) ist seit 2026-09-03 stillgelegt (ADR-007). Das einzige verbliebene lokale Generierungs-Backend ist FreeToken-native auf Windows (:1919) mit dem Checkpoint `Qwen3.6-35B-A3B-NVFP4`. Mehrere Komponenten (`pipeline.mjs` flash-Tier, `route-provider.sh`, `provider-register-local.sh`, `dispatcher-bridge.sh`, `mcp-go`, `factory-mcp-node` und `.opencode`-Konfigurationen) zeigten jedoch weiterhin auf :18235 bzw. versuchten den nicht mehr existierenden `/admin/factory`-Modell-Pin zu lesen.

## What
- Lokale LLM-Konsumenten und Router (`route-provider.sh`, `provider-register-local.sh`, `pipeline.mjs`, `factory-mcp-node`, `mcp-go`) zielen direkt auf FreeToken (`http://127.0.0.1:1919`).
- Der entfernte Proxy-Pin (`factory_model_pin`) und `/admin/factory` werden aus `lib.sh`, `route-provider.sh` und `dispatcher-bridge.sh` bereinigt.
- `.opencode/agent-models.jsonc` und verwandte Prompts referenzieren FreeToken direkt.
- Neuer BATS-Guard `tests/spec/software-factory/local-llm-freetoken-direct.bats` sichert die Umstellung ab; bestehende Tests werden entsprechend nachgezogen.

_Ticket: T900208_
