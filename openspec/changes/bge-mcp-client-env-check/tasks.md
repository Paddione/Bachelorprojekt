# Tasks: bge-mcp Client-Env-Check

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | scripts/bge-mcp/check-client-env.sh | impl | scripts/bge-mcp/check-client-env.sh | — |
| 2 | tests/spec/mcp-gateway/client-env-check.bats | test | tests/spec/mcp-gateway/client-env-check.bats | 1 |
| 3 | .claude/skills/references/mcp-tool-guide.md | docs | .claude/skills/references/mcp-tool-guide.md | 1 |

## Partials

### 1 — Diagnose-Check-Skript

**target_files:** `scripts/bge-mcp/check-client-env.sh`

- Prüft `~/.config/bge-mcp/server.env` Existenz + `BGE_MCP_TOKEN`
- Probt Server mit/ohne Token
- Exit codes: 0=ok, 1=Token fehlt, 2=Server down
- Fix-Hinweis im Output bei Fehler

### 2 — BATS-Test

**target_files:** `tests/spec/mcp-gateway/client-env-check.bats`

- Fake-Env im tmpdir (CI-sicher)
- Alle drei Zustände testen
- Kein Zugriff auf echte Secrets

### 3 — Doku-Update

**target_files:** `.claude/skills/references/mcp-tool-guide.md`

- Diagnose-Block verweist auf das Check-Skript
