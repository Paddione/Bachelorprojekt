# Context7 across harnesses

Context7 provides `resolve-library-id` and `query-docs`. Claude Code loads the
official `@upstash/context7-mcp` stdio server, as do the other clients.
The duplicate `context7@claude-plugins-official` plugin is disabled: its
`?client=claude-code-plugin` endpoint returned HTTP 401 for documentation calls
without authentication, although initialization and tool listing succeeded.
Do not copy Claude's plugin manifest into another harness: its configuration
shape and `${CONTEXT7_API_KEY:-}` expansion are Claude-specific.

## Managed configuration

`docs/agent-guide/registry/mcp.yaml` pins the stdio package version. Run
`bash scripts/mcp-sync.sh render`, then `bash scripts/mcp-sync.sh check`.
This generates project OpenCode and llama.cpp configuration, plus existing
Antigravity (`~/.gemini/config/mcp_config.json`) and Qwen user configuration.
Claude uses the generated project `.mcp.json`; leave the duplicate plugin disabled.
For Claude outside this repository, use
`claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp@4.1.1`.

## Other user configurations

Codex and Gemini CLI are not targets of the shared generator. Configure these
once per machine using the package version in the registry:

```sh
codex mcp add context7 -- npx -y @upstash/context7-mcp@4.1.1
```

Merge this entry into `mcpServers` in `~/.gemini/settings.json` for Gemini CLI:

```json
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp@4.1.1"]
}
```

For OpenCode outside this repository, merge the registry's
`harness.opencode` entry into `mcp.context7` in
`~/.config/opencode/opencode.jsonc`. Preserve existing settings.
Restart existing harness sessions after changing configuration. llama.cpp reads
`scripts/llm/mcp-servers.json` at server startup; do not restart a running model
solely to apply this change without coordinating its active users.

## Verification and limits

Check `opencode mcp list`, `qwen mcp list`, and `codex mcp get context7`.
A configuration listing alone is not an end-to-end test: initialize the server,
list tools, resolve a library, and retrieve documentation with `query-docs`.
Node.js/npm must be on the harness PATH. The first stdio launch downloads the
pinned package. An API key is optional; unauthenticated access has lower limits.
Never commit a key or translate an unset key into a literal authorization header.

Hermes is not installed on the verified machine. The DeepSeek `dsh` launcher
points at a missing checkout, so neither is covered by a successful runtime
check. Configure and verify those clients when their installations are restored.

Upstream: https://github.com/upstash/context7 and
https://context7.com/docs/resources/all-clients.
