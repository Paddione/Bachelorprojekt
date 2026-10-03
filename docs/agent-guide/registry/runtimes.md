# OpenCode / Orchestrator Runtimes

Moved from `AGENTS.md` (C1b diet, T900560) — read on-demand, do not frontload.

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md` (`.agents/agents` symlink).

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, Slim orchestrator, write) | Primary — plans on Muse Spark via Go; dispatches `local`/:1919 + `qwen3-4b`/:8080 workers [T900929] |
| `local` | `llamacpp-local/Qwen3.8-27B` (153600 served KV, draft-MTP) | Higher-capability local subagent; `write=deny`, `edit=allow`; sequential, `budget_tokens` per packet |
| `qwen3-4b` | `llamacpp-qwen3/Qwen3-4B-2507` (90k shared KV, RTX 3060 Ti, 3 slots :8080) | Text-only worker-pool subagent; UD-Q4_K_XL weights and Q4_0 KV, non-thinking |
| `exe-muse` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, subagent, write; chat rail, auth.json) | Execution worker for oversized/under-specified work; dispatched by `orchestrator`/bp-* primaries |
| `bp-build` | `llamacpp-local/Qwen3.8-27B` (153600, primary, write) | Build-Primary: Manifeste, Overlays, Taskfile, Secrets [T900858] |
| `bp-run` | `llamacpp-local/Qwen3.8-27B` (153600, primary, write) | Run-Primary: Live-Ops via task workspace:*/kubectl, Postgres-Reads [T900858] |
| `bp-ship` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, primary, write; chat rail, auth.json) | Ship-Primary: BATS/Playwright, Website, Test-Inventar [T900858] |
| `reviewer` | `llamacpp-local/Qwen3.8-27B` (subagent, read-only) | Review-Rolle (read/grep/tests); Edits wendet der Orchestrator an [T900074] |
| `plan-worker-4b` | `llamacpp-qwen3/Qwen3-4B-2507` (primary, write; 3 Slots :8080, 90k shared) | plan-runner-Worker: führt ein plan-Partial aus; via `scripts/llm/plan-runner.mjs`, nicht interaktiv [T900504] |
| `plan-worker-self` | `llamacpp-local/Qwen3.8-27B` (primary, write; :1919) | plan-runner-Fallback wenn alle 4B-Slots belegt; ein Partial in einem Lauf [T900504] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task local` für lokale Implementation + `task exe-muse` für Cloud-Eskalation (T900751). Lokale: `write=deny` → Orchestrator erzeugt. SSOT `.opencode/agent-models.jsonc`; Historie `docs/agent-guide/registry/retired.md`.
