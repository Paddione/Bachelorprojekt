#!/usr/bin/env bash
set -euo pipefail
# scripts/mcp-sync.sh — MCP Registry SSOT Generator
# Subcommands:
#   render   — Write all four target configs from docs/agent-guide/registry/mcp.yaml
#   check    — Compare targets against registry (exit != 0 on drift, never writes)

REPO="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY="$REPO/docs/agent-guide/registry/mcp.yaml"
CLAUDE_TARGET="$REPO/.mcp.json"
OPENCODE_TARGET="$REPO/.opencode/opencode.jsonc"
AGY_TARGET="${HOME}/.gemini/config/mcp_config.json"
LLAMACPP_TARGET="$REPO/scripts/llm/mcp-servers.json"

render_claude_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };
    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.claude_code) continue;
      const h = c.harness.claude_code;
      if (c.transport === 'http') {
        out.mcpServers[name] = { type: 'http', url: c.endpoint };
      } else {
        const server = {};
        if (h.command) server.command = h.command;
        if (h.args && h.args.length) server.args = h.args;
        if (h.env) server.env = h.env;
        out.mcpServers[name] = server;
      }
    }
    fs.writeFileSync('/dev/stdout', JSON.stringify(out, null, 2) + '\n');
  "
}

render_agy_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };
    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.agy) continue;
      const h = c.harness.agy;
      if (c.transport === 'http') {
        out.mcpServers[name] = { serverUrl: c.endpoint };
      } else {
        const server = {};
        if (h.command) server.command = h.command;
        if (h.args && h.args.length) server.args = h.args;
        if (h.env) server.env = h.env;
        out.mcpServers[name] = server;
      }
    }
    fs.writeFileSync('/dev/stdout', JSON.stringify(out, null, 4) + '\n');
  "
}
# llama.cpp (T002398): Cursor-Format "mcpServers". Opt-in ueber harness.llamacpp --
# ohne Block wird ein Server NICHT angehaengt, weil jeder Eintrag ein Kindprozess
# von llama-server wird (npx-basierte Server wuerden den Modellstart verzoegern).
render_llamacpp_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };
    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.llamacpp) continue;
      // llama.cpp spricht MCP NUR ueber stdio (server_mcp_stdio ist die einzige
      // Transport-Implementierung). Ein http-Server hier ergaebe eine Config, die
      // llama-server WORTLOS verwirft -- deshalb abbrechen statt ueberspringen.
      if (c.transport === 'http') {
        console.error('mcp-sync: ' + name + ' hat einen llamacpp-Block, ist aber transport: http — llama.cpp unterstuetzt nur stdio.');
        process.exit(2);
      }
      const h = c.harness.llamacpp;
      if (!h.command) {
        console.error('mcp-sync: ' + name + ' hat einen llamacpp-Block ohne command.');
        process.exit(2);
      }
      const server = { command: h.command };
      // Leere Felder werden WEGGELASSEN, nicht als null emittiert: llama.cpp
      // behandelt ein leeres command als 'ueberspringen'.
      if (h.args && h.args.length) server.args = h.args;
      if (h.env) server.env = h.env;
      if (h.cwd) server.cwd = h.cwd;
      if (h.timeout_ms) server.timeout_ms = h.timeout_ms;
      out.mcpServers[name] = server;
    }
    fs.writeFileSync('/dev/stdout', JSON.stringify(out, null, 2) + '\n');
  "
}

render_opencode_jsonc() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const orig = fs.readFileSync('$OPENCODE_TARGET', 'utf8');

    const mcpKeyIdx = orig.indexOf('\"mcp\"');
    const beforeMcpRaw = orig.slice(0, mcpKeyIdx);
    const trailMatch = beforeMcpRaw.match(/(\\s*)\$/);
    const trailingWs = trailMatch ? trailMatch[1] : '';
    const beforeMcp = beforeMcpRaw.slice(0, beforeMcpRaw.length - trailingWs.length);

    let br = 0, blkEnd = -1;
    for (let i = mcpKeyIdx; i < orig.length; i++) {
      const ch = orig[i];
      if (ch === '{') br++;
      else if (ch === '}') { br--; if (br === 0) { blkEnd = i + 1; break; } }
    }
    const afterMcp = orig.slice(blkEnd);

    const J = JSON.stringify;
    const a = trailingWs || '  ';
    const b = a + '  ';
    const c = b + '  ';
    const sorted = Object.keys(clients).sort();
    const servers = [];
    for (const name of sorted) {
      const cl = clients[name];
      if (!cl.harness || !cl.harness.opencode) continue;
      const h = cl.harness.opencode;
      const enabled = h.enabled !== false;
      const fields = [];
      fields.push(c + J('type') + ': ' + J(cl.transport === 'http' ? 'remote' : 'local'));
      if (cl.transport === 'http') {
        fields.push(c + J('url') + ': ' + J(cl.endpoint));
      } else {
        fields.push(c + J('command') + ': ' + J(h.command || []));
        if (h.environment) {
          fields.push(c + J('environment') + ': ' + J(h.environment));
        }
      }
      fields.push(c + J('enabled') + ': ' + (enabled ? 'true' : 'false'));
      servers.push(b + J(name) + ': {\n' + fields.join(',\n') + '\n' + b + '}');
    }
    const mcpBlock = a + J('mcp') + ': {\n' + servers.join(',\n') + '\n' + a + '}';
    process.stdout.write(beforeMcp + mcpBlock + afterMcp);
  "
}

diff_or_drift() {
  local label="$1" expected="$2" actual="$3"
  if ! diff -q "$expected" "$actual" >/dev/null 2>&1; then
    echo "mcp-sync: check: DRIFT in $label" >&2
    diff "$expected" "$actual" 2>/dev/null || true
    return 1
  fi
  echo "mcp-sync: check: OK $label"
  return 0
}

cmd_render() {
  echo "mcp-sync: render: writing $CLAUDE_TARGET"
  render_claude_json > "$CLAUDE_TARGET"

  echo "mcp-sync: render: writing $OPENCODE_TARGET"
  render_opencode_jsonc > "${OPENCODE_TARGET}.tmp"
  mv "${OPENCODE_TARGET}.tmp" "$OPENCODE_TARGET"

  if [ -d "$(dirname "$AGY_TARGET")" ]; then
    echo "mcp-sync: render: writing $AGY_TARGET"
    render_agy_json > "$AGY_TARGET"
  else
    echo "mcp-sync: render: $AGY_TARGET dir missing — skipped" >&2
  fi

  echo "mcp-sync: render: writing $LLAMACPP_TARGET"
  render_llamacpp_json > "${LLAMACPP_TARGET}.tmp"
  mv "${LLAMACPP_TARGET}.tmp" "$LLAMACPP_TARGET"
}

cmd_check() {
  local tmpd
  tmpd="$(mktemp -d)"
  trap 'rm -rf "${tmpd:-}"' EXIT

  local exit_code=0

  render_claude_json > "$tmpd/claude.json"
  diff_or_drift ".mcp.json" "$tmpd/claude.json" "$CLAUDE_TARGET" || exit_code=1

  render_opencode_jsonc > "$tmpd/opencode.jsonc"
  diff_or_drift ".opencode/opencode.jsonc" "$tmpd/opencode.jsonc" "$OPENCODE_TARGET" || exit_code=1

  if [ -f "$AGY_TARGET" ]; then
    render_agy_json > "$tmpd/agy.json"
    diff_or_drift "mcp_config.json" "$tmpd/agy.json" "$AGY_TARGET" || exit_code=1
  else
    echo "mcp-sync: check: $AGY_TARGET not present — skipped (exit 0 based on repo files)" >&2
  fi

  render_llamacpp_json > "$tmpd/llamacpp.json"
  diff_or_drift "scripts/llm/mcp-servers.json" "$tmpd/llamacpp.json" "$LLAMACPP_TARGET" || exit_code=1

  return "$exit_code"
}

case "${1:-help}" in
  render) cmd_render ;;
  check)  cmd_check ;;
  help|--help|-h)
    echo "Usage: $0 {render|check}"; exit 0 ;;
  *) echo "Unknown subcommand: $1"; echo "Usage: $0 {render|check}"; exit 1 ;;
esac
