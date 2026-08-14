#!/usr/bin/env bash
set -euo pipefail
# scripts/mcp-sync.sh — MCP Registry SSOT Generator
# Subcommands:
#   render   — Write all four target configs from docs/agent-guide/registry/mcp.yaml
#   check    — Compare targets against registry (exit != 0 on drift, never writes)

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# MCP_REGISTRY / MCP_OUT_DIR sind Test-Overrides (T002487). Ohne sie verhaelt sich
# das Skript exakt wie zuvor. Mit ihnen laesst sich `render` gegen eine
# Fixture-Registry in ein temporaeres Verzeichnis fahren, statt die echten
# Harness-Configs zu ueberschreiben -- ohne diese Trennung ist der
# Generizitaets-Nachweis nicht nebenwirkungsfrei fuehrbar.
REGISTRY="${MCP_REGISTRY:-$REPO/docs/agent-guide/registry/mcp.yaml}"
OUT_DIR="${MCP_OUT_DIR:-$REPO}"

CLAUDE_TARGET="$OUT_DIR/.mcp.json"
OPENCODE_TARGET="$OUT_DIR/.opencode/opencode.jsonc"
# AGY_TARGET und QWEN_TARGET bleiben an $HOME gebunden: die Dateien liegen
# konstruktionsbedingt ausserhalb des Repos. Ein Test isoliert sie ueber HOME,
# nicht ueber MCP_OUT_DIR.
AGY_TARGET="${HOME}/.gemini/config/mcp_config.json"
QWEN_TARGET="${HOME}/.qwen/settings.json"
LLAMACPP_TARGET="$OUT_DIR/scripts/llm/mcp-servers.json"

# render_opencode_jsonc erhaelt alles ausserhalb des "mcp"-Blocks, indem es die
# Zieldatei einliest. Unter einem alternativen OUT_DIR existiert sie noch nicht --
# dann dient die Repo-Variante als Vorlage.
opencode_source() {
  if [ -f "$OPENCODE_TARGET" ]; then
    printf '%s' "$OPENCODE_TARGET"
  else
    printf '%s' "$REPO/.opencode/opencode.jsonc"
  fi
}

render_claude_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };
    // [T004272] Server mit \${VAR} in Headers werden uebersprungen: Qwen Code
    // liest .mcp.json mit Vorrang vor ~/.qwen/settings.json, expandiert \${VAR}
    // aber nicht — der Literal-String fuehrt zu HTTP 401. Diese Server gehoeren
    // in die nicht-getrackten Harness-Configs (~/.claude/settings.json fuer
    // Claude Code, ~/.qwen/settings.json fuer Qwen Code) mit aufgeloestem Token.
    const PLACEHOLDER = /\\$\\{[A-Za-z_][A-Za-z0-9_]*\\}/;
    const hasPlaceholder = (headers) => {
      if (!headers) return false;
      return Object.values(headers).some(v => PLACEHOLDER.test(String(v)));
    };
    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.claude_code) continue;
      if (hasPlaceholder(c.headers)) continue;
      const h = c.harness.claude_code;
      if (c.transport === 'http') {
        out.mcpServers[name] = { type: 'http', url: c.endpoint };
        if (c.headers) out.mcpServers[name].headers = c.headers;
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
    const fs = require('fs'), yaml = require('yaml'), os = require('os'), path = require('path');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };

    // [T002704] agy loest \${VAR} in Header-Werten NICHT auf und kennt auch
    // opencodes {env:VAR} nicht — es sendet den Literal-String, der Zielserver
    // antwortet 401 und agy verwirft ihn. Deshalb wird hier zum echten Wert
    // aufgeloest. Das ist nur fuer dieses Ziel vertretbar: mcp_config.json liegt
    // unter \$HOME, ausserhalb jeder Versionierung. .mcp.json und
    // .opencode/opencode.jsonc sind getrackt und behalten ihre Platzhalter.
    //
    // Quellen in dieser Reihenfolge: Umgebung des Aufrufers, dann server.env.
    // Nur die Umgebung zu lesen hiesse, das Ergebnis davon abhaengig zu machen,
    // aus welcher Shell gesynct wird — genau daran ist es gescheitert: der Token
    // war in server.env gepflegt, nur nicht in der Umgebung des Harness.
    const envFileVars = {};
    try {
      const envFile = path.join(os.homedir(), '.config', 'bge-mcp', 'server.env');
      for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        // systemd-EnvironmentFile (KEY=VALUE), kein Shell-Skript: zeilenweise
        // lesen statt sourcen — sourcen wuerde beliebigen Code ausfuehren und
        // Anfuehrungszeichen anders behandeln als systemd.
        const eq = line.indexOf('=');
        if (eq < 1 || line.trimStart().startsWith('#')) continue;
        const key = line.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let val = line.slice(eq + 1).trim();
        if (val.length > 1 && val[0] === val[val.length - 1] && (val[0] === '\'' || val[0] === '\"')) {
          val = val.slice(1, -1);
        }
        envFileVars[key] = val;
      }
    } catch { /* keine server.env — dann bleibt nur die Umgebung */ }

    // Das Dollarzeichen ueber seinen Zeichencode, damit der Ausdruck nicht durch
    // drei Quoting-Ebenen (bash -> node -e -> RegExp) escaped werden muss.
    const PLACEHOLDER = new RegExp('[' + String.fromCharCode(36) + ']\\{([A-Za-z_][A-Za-z0-9_]*)\\}', 'g');
    const unresolved = new Set();
    const resolveValue = (raw) => String(raw).replace(PLACEHOLDER, (whole, varName) => {
      const value = process.env[varName] !== undefined && process.env[varName] !== ''
        ? process.env[varName]
        : envFileVars[varName];
      if (value === undefined || value === '') { unresolved.add(varName); return whole; }
      return value;
    });
    const resolveHeaders = (headers) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(headers)) outHeaders[k] = resolveValue(v);
      return outHeaders;
    };

    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.agy) continue;
      const h = c.harness.agy;
      if (c.transport === 'http') {
        out.mcpServers[name] = { serverUrl: c.endpoint };
        if (c.headers) out.mcpServers[name].headers = resolveHeaders(c.headers);
      } else {
        const server = {};
        if (h.command) server.command = h.command;
        if (h.args && h.args.length) server.args = h.args;
        if (h.env) server.env = h.env;
        out.mcpServers[name] = server;
      }
    }
    if (unresolved.size) {
      // Kein Abbruch: sonst scheiterte jeder Sync an einem Token, auch wenn man
      // einen ganz anderen Server aendert. Der Platzhalter bleibt stehen — der
      // heutige Zustand, nur nicht mehr stillschweigend.
      process.stderr.write(
        'mcp-sync: WARN: agy-Header nicht aufloesbar: ' + [...unresolved].sort().join(', ') +
        ' — weder in der Umgebung noch in ~/.config/bge-mcp/server.env. ' +
        'Der Platzhalter bleibt stehen; agy wird den Server mit HTTP 401 verwerfen.\n'
      );
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
  local source
  source="$(opencode_source)"
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const orig = fs.readFileSync('$source', 'utf8');

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
        // T002488: opencode expandiert \${VAR} NICHT — es kennt nur die eigene
        // Notation {env:VAR}. Empirisch belegt mit \`opencode mcp list\` gegen den
        // Shim auf :13005: mit \${BGE_MCP_TOKEN} meldet opencode 'failed', mit
        // {env:BGE_MCP_TOKEN} 'connected'. Die Registry fuehrt weiter die
        // kanonische \${VAR}-Schreibweise; uebersetzt wird hier, damit nicht jeder
        // Harness ein eigenes headers-Feld in der SSOT braucht.
        // split/join statt Regex: der Ausdruck muesste sonst durch drei
        // Quoting-Ebenen (bash -> node -e -> RegExp) escaped werden.
        if (cl.headers) {
          const translated = {};
          for (const [hk, hv] of Object.entries(cl.headers)) {
            translated[hk] = String(hv).split('\${').join('{env:');
          }
          fields.push(c + J('headers') + ': ' + J(translated));
        }
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

# render_qwen_json — Qwen Code (T004272)
# Qwen Code expandiert ${VAR} in settings.json-headers NICHT — es sendet den
# Literal-String, der Zielserver antwortet 401. Dieselbe Loesung wie agy
# (T002704): Token zur Sync-Zeit aufloesen. Die Datei liegt unter $HOME,
# ausserhalb jeder Versionierung; chmod 600 in cmd_render schuetzt den Token.
render_qwen_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml'), os = require('os'), path = require('path');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };

    // Token-Aufloesung identisch zu render_agy_json: Umgebung first, dann
    // ~/.config/bge-mcp/server.env als Fallback.
    const envFileVars = {};
    try {
      const envFile = path.join(os.homedir(), '.config', 'bge-mcp', 'server.env');
      for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const eq = line.indexOf('=');
        if (eq < 1 || line.trimStart().startsWith('#')) continue;
        const key = line.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let val = line.slice(eq + 1).trim();
        if (val.length > 1 && val[0] === val[val.length - 1] && (val[0] === '\'' || val[0] === '\"')) {
          val = val.slice(1, -1);
        }
        envFileVars[key] = val;
      }
    } catch { /* keine server.env — dann bleibt nur die Umgebung */ }

    const PLACEHOLDER = new RegExp('[' + String.fromCharCode(36) + ']\\{([A-Za-z_][A-Za-z0-9_]*)\\}', 'g');
    const unresolved = new Set();
    const resolveValue = (raw) => String(raw).replace(PLACEHOLDER, (whole, varName) => {
      const value = process.env[varName] !== undefined && process.env[varName] !== ''
        ? process.env[varName]
        : envFileVars[varName];
      if (value === undefined || value === '') { unresolved.add(varName); return whole; }
      return value;
    });
    const resolveHeaders = (headers) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(headers)) outHeaders[k] = resolveValue(v);
      return outHeaders;
    };

    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.qwen_code) continue;
      const h = c.harness.qwen_code;
      if (c.transport === 'http') {
        const server = { httpUrl: h.httpUrl || c.endpoint };
        if (c.headers) server.headers = resolveHeaders(c.headers);
        out.mcpServers[name] = server;
      } else {
        const server = {};
        if (h.command) server.command = h.command;
        if (h.args && h.args.length) server.args = h.args;
        if (h.env) server.env = h.env;
        out.mcpServers[name] = server;
      }
    }
    if (unresolved.size) {
      process.stderr.write(
        'mcp-sync: WARN: qwen-Header nicht aufloesbar: ' + [...unresolved].sort().join(', ') +
        ' — weder in der Umgebung noch in ~/.config/bge-mcp/server.env. ' +
        'Der Platzhalter bleibt stehen; Qwen Code wird den Server mit HTTP 401 verwerfen.\\n'
      );
    }

    // Merge in existing settings to preserve non-MCP config
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync('$QWEN_TARGET', 'utf8')); } catch {}
    settings.mcpServers = out.mcpServers;
    fs.writeFileSync('/dev/stdout', JSON.stringify(settings, null, 2) + '\n');
  "
}

diff_or_drift() {
  local label="$1" expected="$2" actual="$3"
  if ! diff -q "$expected" "$actual" >/dev/null 2>&1; then
    echo "mcp-sync: check: DRIFT in $label" >&2
    if [ "$label" = "mcp_config.json" ]; then
      # [T002941] Redigiere Authorization-Werte, um Secret-Leaks in CI-Logs zu verhindern
      diff "$expected" "$actual" 2>/dev/null | sed -E 's/("Authorization"[[:space:]]*:[[:space:]]*")[^"]*(")/\1***REDACTED***\2/g' || true
    else
      diff "$expected" "$actual" 2>/dev/null || true
    fi
    return 1
  fi
  echo "mcp-sync: check: OK $label"
  return 0
}

cmd_render() {
  # Unter einem alternativen OUT_DIR existieren die Unterverzeichnisse noch nicht.
  mkdir -p "$(dirname "$OPENCODE_TARGET")" "$(dirname "$LLAMACPP_TARGET")"

  echo "mcp-sync: render: writing $CLAUDE_TARGET"
  render_claude_json > "$CLAUDE_TARGET"

  echo "mcp-sync: render: writing $OPENCODE_TARGET"
  render_opencode_jsonc > "${OPENCODE_TARGET}.tmp"
  mv "${OPENCODE_TARGET}.tmp" "$OPENCODE_TARGET"

  if [ -d "$(dirname "$AGY_TARGET")" ]; then
    echo "mcp-sync: render: writing $AGY_TARGET"
    # [T002704] Diese Datei ist die einzige, die einen AUFGELOESTEN Token traegt
    # (siehe render_agy_json). Sie muss deshalb dieselben Rechte haben wie ihre
    # Quelle ~/.config/bge-mcp/server.env, naemlich 600 — sonst wandert das
    # Geheimnis aus einer nutzereigenen in eine world-readable Datei. Die umask
    # deckt den Neuanlage-Fall ab, das chmod eine bereits bestehende Datei: eine
    # Ausgabe-Umlenkung auf eine existierende Datei laesst deren Rechte unberuehrt.
    ( umask 077; render_agy_json > "$AGY_TARGET" )
    chmod 600 "$AGY_TARGET"
  else
    echo "mcp-sync: render: $AGY_TARGET dir missing — skipped" >&2
  fi

  if [ -d "$(dirname "$QWEN_TARGET")" ]; then
    echo "mcp-sync: render: writing $QWEN_TARGET"
    # [T004272] Qwen Code expandiert ${VAR} in Headers NICHT — Token wird zur
    # Sync-Zeit aufgeloest (wie agy, T002704). Die Datei liegt unter $HOME und
    # traegt jetzt einen Klartext-Token; chmod 600 schuetzt ihn.
    ( umask 077; render_qwen_json > "${QWEN_TARGET}.tmp" )
    mv "${QWEN_TARGET}.tmp" "$QWEN_TARGET"
    chmod 600 "$QWEN_TARGET"
  else
    echo "mcp-sync: render: $QWEN_TARGET dir missing — skipped" >&2
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
    echo "SKIP: $AGY_TARGET not present — skipped (exit 0 based on repo files)"
  fi

  if [ -f "$QWEN_TARGET" ]; then
    render_qwen_json > "$tmpd/qwen.json"
    diff_or_drift "settings.json (qwen)" "$tmpd/qwen.json" "$QWEN_TARGET" || exit_code=1
  else
    echo "SKIP: $QWEN_TARGET not present — skipped (exit 0 based on repo files)"
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
