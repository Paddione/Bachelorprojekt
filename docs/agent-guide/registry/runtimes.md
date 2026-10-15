# OpenCode / Orchestrator Runtimes

Moved from `AGENTS.md` (C1b diet, T900560) — read on-demand, do not frontload.

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md` (`.agents/agents` symlink).

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, Slim orchestrator, write) | Primary — plans on Muse Spark via Go; dispatches `local`/:1919 + `vllm-4b`/:8123 workers [T900929] |
| `local` | `llamacpp-local/Qwen3.8-27B` (153600 served KV, draft-MTP) | Higher-capability local subagent; `write=deny`, `edit=allow`; sequential, `budget_tokens` per packet |
| `exe-muse` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, subagent, write; chat rail, auth.json) | Execution worker for oversized/under-specified work; dispatched by `orchestrator`/bp-* primaries |
| `bp-build` | `llamacpp-local/Qwen3.8-27B` (153600, primary, write) | Build-Primary: Manifeste, Overlays, Taskfile, Secrets [T900858] |
| `bp-run` | `llamacpp-local/Qwen3.8-27B` (153600, primary, write) | Run-Primary: Live-Ops via task workspace:*/kubectl, Postgres-Reads [T900858] |
| `bp-ship` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, primary, write; chat rail, auth.json) | Ship-Primary: BATS/Playwright, Website, Test-Inventar [T900858] |
| `reviewer` | `llamacpp-local/Qwen3.8-27B` (subagent, read-only) | Review-Rolle (read/grep/tests); Edits wendet der Orchestrator an [T900074] |
| `plan-worker-self` | `llamacpp-local/Qwen3.8-27B` (primary, write; :1919) | plan-runner-Fallback wenn alle Worker-Slots belegt und `:1919` erreichbar; ein Partial in einem Lauf [T900504, T016656] |
| `plan-worker-muse` | `opencode/muse-spark-1.3-contributor-free` (primary, write) | plan-runner-Cloud-Track via `dispatch_cloud` (`--cloud-slots`, Default 1); der Direkt-Track braucht keinen Agenten (In-Process-Worker gegen vLLM :8123) [T016656] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task local` für lokale Implementation + `task exe-muse` für Cloud-Eskalation (T900751). Lokale: `write=deny` → Orchestrator erzeugt. SSOT `.opencode/agent-models.jsonc`; Historie `docs/agent-guide/registry/retired.md`.
