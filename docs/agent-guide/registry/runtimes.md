# OpenCode / Orchestrator Runtimes

Moved from `AGENTS.md` (C1b diet, T900560) — read on-demand, do not frontload.

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md` (`.agents/agents` symlink).

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `llamacpp-local/Muse-Glimmer-30B` (131k ctx, RTX 5070 Ti, primary, write) | Primary — dispatches `qwen35-mtp` on RTX 3060 Ti + exe-muse/2-rail cloud escalation |
| `local` | `llamacpp-local/Muse-Glimmer-30B` (131k served KV, DFlash2) | Higher-capability local subagent; `write=deny`, `edit=allow`; sequential, `budget_tokens` per packet |
| `qwen35-mtp` | `llamacpp-qwen35/Qwen3.5-4B-MTP` (128k served KV, RTX 3060 Ti) | Text-only single-slot MTP subagent; Q4_K_XL weights and Q4 KV |
| `exe-muse` | `opencode-go-oai/muse-spark-1.3-contributor` (1M ctx, subagent, write; Responses API) | Execution worker (M2 after 2× local); dispatched by `orchestrator`/`big-pickle`/`glimmer-primary` |
| `glimmer-primary` | `llamacpp-local/Muse-Glimmer-30B` (131k, primary, write) | Plan-primary (Muse Glimmer, Spark-Familie); autonomer Ticket-Worker |
| `big-pickle` | `opencode-zen/big-pickle` (~260k ctx, primary, write) | Zen-Singleagent bis Free-Quota verbraucht |
| `ox-alpha-free` | `opencode-zen/laguna-s-2.1-free` (primary, write) | Free-Tier-Primary; dispatcht nur `ox-alpha` |
| `ox-alpha` | `opencode-zen/laguna-s-2.1-free` (subagent, write) | Subagent-Zwilling von `ox-alpha-free` |
| `deepseek-helper-go` | `opencode-go/deepseek-v4-flash` (write) | Eskalation Rail 1 (Go-Abo) wenn lokal stuck/ctx-leer |
| `deepseek-helper` | `deepseek/deepseek-v4-flash` (write) | Eskalation Rail 2 (direkte API) bei Go-Ausfall |
| `deepseek-pro` | `opencode-go/deepseek-v4-pro` (all, write) | Tiefe Analyse/harte Refactors |
| `deepseek-pro-direct` | `deepseek/deepseek-v4-pro` (direct API, all, write) | Direkte API (bypass Go gateway) |
| `deepseek-flash` | `opencode-go/deepseek-v4-flash` (all, write) | Parallel-Throughput bis 3 |
| `deepseek-flash-direct` | `deepseek/deepseek-v4-flash` (direct API, all, write) | Direkte API (bypass Go gateway) |
| `reviewer` | `llamacpp-local/Muse-Glimmer-30B` (subagent, read-only) | Review-Rolle (read/grep/tests); Edits wendet der Orchestrator an [T900074] |
| `plan-worker-4b` | `llamacpp-qwen35/Qwen3.5-4B-MTP` (primary, write; 3 Slots :1920) | plan-runner-Worker: führt ein OpenSpec-Partial aus; via `scripts/llm/plan-runner.mjs`, nicht interaktiv [T900504] |
| `plan-worker-self` | `llamacpp-local/Muse-Glimmer-30B` (primary, write; :1919) | plan-runner-Fallback wenn alle 4B-Slots belegt; ein Partial in einem Lauf [T900504] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task local` für lokale Implementation + deepseek-Rails (Go zuerst). Lokale: `write=deny` → Orchestrator erzeugt. SSOT `.opencode/agent-models.jsonc`; Historie `docs/agent-guide/registry/retired.md`.
