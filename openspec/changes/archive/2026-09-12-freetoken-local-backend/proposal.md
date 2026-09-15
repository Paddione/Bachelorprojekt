# Proposal: freetoken-local-backend

## Why

FreeToken (edge-native MoE-Serving-Engine) läuft seit 2026-08-23 nativ unter Windows und
serviert `Qwen3.6-35B-A3B-NVFP4` mit ~103 tok/s (warm, gemessen; WSL2-Referenz: 95 tok/s)
über eine OpenAI-/Anthropic-kompatible API auf `127.0.0.1:1919`. Die beiden bisherigen
llama.cpp-Loadouts passen nicht mehr neben FreeToken auf die 16-GB-Karte:

- `gemma26-throughput` (Port 8092): vom Operator als nicht mehr benötigt markiert.
- `qwen38-220k` (Port 8094): verhungert neben FreeToken (~10 statt ~160 tok/s,
  gemessen 2026-08-23), weil der Proxy-[switch]-Mechanismus FreeToken nicht evicten kann.

`ft bench bw` (nativ): CPU-MoE 22,4 GB/s, PCIe-Gather 25,9 GB/s → Backend `offload`.
Das Routing läuft über `tickets.provider_config` (DB) mit baseUrl-Feld — FreeToken kann
als direkter OpenAI-compatible Provider eingetragen werden, ohne den llama-Proxy zu
touchieren.

## What

- Neuer opencode-Provider `freetoken-local` (`@ai-sdk/openai-compatible`,
  `http://127.0.0.1:1919/v1`) mit Modell `Qwen3.6-35B-A3B-NVFP4` (262.144 ctx nativ).
- Alle lokalen Familien-Subagenten (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`)
  und die darauf sitzenden Primaries werden auf `freetoken-local/Qwen3.6-35B-A3B-NVFP4`
  umgehängt. `gemma26-throughput-primary` entfällt (Zweck weg).
- `scripts/llm/loadouts.json`: `gemma26-throughput` + `qwen38-220k` stillgelegt
  (`enabled: false`, Messwerte/Kommentare bleiben), `factory.model` auf FreeToken-ID.
- `scripts/factory/route-provider.sh`: Fallbacks/PIN-Pfad emitieren FreeToken statt
  llamacpp/:18235. `scripts/plan-qa-check.sh`: Default-Modell umgezogen.
- Mirror-Dateien nachgezogen: `docs/agent-guide/registry/agents.yaml`,
  `docs/agent-guide/maps/agents-map.md`, `AGENTS.md` (agent-roster.bats bleibt grün).
- DB-Seite (Deployment-Zeit, nicht Repo): `tickets.provider_config` bekommt die
  FreeToken-Zeile; llama-Zeilen werden demoted.
- Runbook: FreeToken-native Betrieb (Start/Stop, Logs, JIT-Warmup, WSL-Symlink-Falle,
  `.wslconfig`-Stand 24 GB / 12 Kerne).

_Ticket: T014028_
