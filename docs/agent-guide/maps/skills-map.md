# Skill-Inventar

<!-- GENERIERT aus docs/agent-guide/registry/skills.yaml — nicht von Hand editieren.
     Neu erzeugen: task skills:map · Prüfen: task skills:check -->

Autoritativer Skill-Bestand je Harness. `sync: identical` heißt: gleiche Inhalte
wie der Kanon; `manual` heißt: Harness-Adapter mit eigenem Mapping.
Projektions-Engine: `scripts/agent-skills/project.mjs --check`.

| Skill | Kanon | `codex` | `agy` | `opencode` | `claude_code` | `muse` |
|---|---|---|---|---|---|---|
| `agentic-resource-lookup` | `.agents/skills/agentic-resource-lookup` | identisch | identisch | identisch | identisch | identisch |
| `bachelorprojekt-vim` | `.agents/skills/bachelorprojekt-vim` | identisch | identisch | identisch | identisch | identisch |
| `codebase-memory` | `.agents/skills/codebase-memory` | identisch | identisch | identisch | identisch | identisch |
| `database-specialist` | `.agents/skills/database-specialist` | identisch | identisch | identisch | identisch | identisch |
| `dev-flow-chore` | `.agents/skills/dev-flow-chore` | identisch | identisch | identisch | identisch | identisch |
| `dev-flow-e2e` | `.agents/skills/dev-flow-e2e` | identisch | identisch | identisch | identisch | identisch |
| `dev-flow-execute` | `.agents/skills/dev-flow-execute` | identisch | identisch | identisch | identisch | identisch |
| `dev-flow-plan` | `.agents/skills/dev-flow-plan` | identisch | identisch | manuell | manuell | identisch |
| `freetoken-setup` | `.opencode/skills/freetoken-setup` | ausgenommen | ausgenommen | identisch | identisch | ausgenommen |
| `gh-fix-ci` | `.agents/skills/gh-fix-ci` | identisch | identisch | identisch | identisch | identisch |
| `git-workflow` | `.agents/skills/git-workflow` | identisch | identisch | identisch | identisch | identisch |
| `gitops-cluster-debug` | `.agents/skills/gitops-cluster-debug` | identisch | identisch | identisch | identisch | identisch |
| `gitops-knowledge` | `.agents/skills/gitops-knowledge` | identisch | identisch | identisch | identisch | identisch |
| `gitops-repo-audit` | `.agents/skills/gitops-repo-audit` | identisch | identisch | identisch | identisch | identisch |
| `hf-mem` | `.opencode/skills/hf-mem` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-best` | `.opencode/skills/huggingface-best` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-community-evals` | `.opencode/skills/huggingface-community-evals` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-datasets` | `.opencode/skills/huggingface-datasets` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-llm-trainer` | `.opencode/skills/huggingface-llm-trainer` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-local-models` | `.opencode/skills/huggingface-local-models` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-lora-space-builder` | `.opencode/skills/huggingface-lora-space-builder` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-paper-publisher` | `.opencode/skills/huggingface-paper-publisher` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-papers` | `.opencode/skills/huggingface-papers` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-tool-builder` | `.opencode/skills/huggingface-tool-builder` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-trackio` | `.opencode/skills/huggingface-trackio` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-vision-trainer` | `.opencode/skills/huggingface-vision-trainer` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `huggingface-zerogpu` | `.opencode/skills/huggingface-zerogpu` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `incident-response` | `.agents/skills/incident-response` | identisch | identisch | manuell | manuell | identisch |
| `infra-ops` | `.agents/skills/infra-ops` | identisch | identisch | manuell | manuell | identisch |
| `lavish` | `.agents/skills/lavish` | identisch | identisch | identisch | identisch | identisch |
| `llama-cpp` | `.opencode/skills/llama-cpp` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `mishap-tracker` | `.agents/skills/mishap-tracker` | identisch | identisch | identisch | identisch | identisch |
| `opencode-git-workflow` | `.opencode/skills/opencode-git-workflow` | ausgenommen | ausgenommen | identisch | identisch | ausgenommen |
| `operations-management` | `.agents/skills/operations-management` | identisch | identisch | identisch | identisch | identisch |
| `playwright-best-practices` | `.agents/skills/playwright-best-practices` | identisch | identisch | identisch | identisch | identisch |
| `python-testing-patterns` | `.agents/skills/python-testing-patterns` | identisch | identisch | identisch | identisch | identisch |
| `references` | `.agents/skills/references` | identisch | identisch | manuell | manuell | identisch |
| `repo-hygiene` | `.agents/skills/repo-hygiene` | identisch | identisch | identisch | identisch | identisch |
| `security-specialist` | `.agents/skills/security-specialist` | identisch | identisch | identisch | identisch | identisch |
| `skill-craft` | `.opencode/skills/skill-craft` | ausgenommen | ausgenommen | identisch | identisch | ausgenommen |
| `skill-creator` | `.opencode/skills/skill-creator` | ausgenommen | ausgenommen | identisch | identisch | ausgenommen |
| `sota-testing` | `.agents/skills/sota-testing` | identisch | identisch | identisch | identisch | identisch |
| `system-audit` | `.agents/skills/system-audit` | identisch | identisch | identisch | identisch | identisch |
| `toolset-curate` | `.agents/skills/toolset-curate` | identisch | identisch | identisch | identisch | identisch |
| `train-sentence-transformers` | `.opencode/skills/train-sentence-transformers` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `transformers-js` | `.opencode/skills/transformers-js` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `trl-training` | `.opencode/skills/trl-training` | ausgenommen | ausgenommen | identisch | ausgenommen | ausgenommen |
| `update-dependencies` | `.agents/skills/update-dependencies` | identisch | identisch | identisch | identisch | identisch |
| `vitest` | `.agents/skills/vitest` | identisch | identisch | identisch | identisch | identisch |
| `vitest-testing` | `.agents/skills/vitest-testing` | identisch | identisch | identisch | identisch | identisch |
| `web-audit` | `.agents/skills/web-audit` | identisch | identisch | identisch | identisch | identisch |
| `website-specialist` | `.agents/skills/website-specialist` | identisch | identisch | identisch | identisch | identisch |

## Manuelle Adapter (sync: manual)

- `dev-flow-plan` — OpenCode adapter: runtime MCP tool identifiers differ from portable capability names. (opencode: `mcp-postgres_query`; claude_code: `mcp__mcp-postgres__query`)
- `incident-response` — OpenCode adapter: runtime MCP tool identifiers differ from portable capability names. (opencode: `mcp-kubernetes_pods_get`, `mcp-kubernetes_pods_list_in_namespace`, `mcp-kubernetes_pods_log`, `mcp-postgres_query`; claude_code: `mcp__mcp-kubernetes__pods_get`, `mcp__mcp-kubernetes__pods_list_in_namespace`, `mcp__mcp-kubernetes__pods_log`, `mcp__mcp-postgres__query`)
- `infra-ops` — OpenCode adapter: runtime MCP tool identifiers differ from portable capability names. (opencode: `mcp-kubernetes_pods_list_in_namespace`, `mcp-kubernetes_pods_log`; claude_code: `mcp__mcp-kubernetes__pods_list_in_namespace`, `mcp__mcp-kubernetes__pods_log`)
- `references` — OpenCode adapter: runtime MCP tool identifiers differ from portable capability names. (opencode: `mcp-postgres_query`, `mcp-kubernetes_pods_list_in_namespace`, `playwright_*`; claude_code: `mcp__mcp-postgres__query`, `mcp__mcp-kubernetes__pods_list_in_namespace`, `mcp__playwright__*`)
