// scripts/toolset/lib/adapters/opencode.mjs — Adapter .opencode/opencode.jsonc (T900791).
// Reine Funktion: ersetzt textuell nur die "enabled"-Zeile je bekanntem Server.
// Kommentare und Formatierung bleiben byte-identisch erhalten. Kein I/O.
export const file = '.opencode/opencode.jsonc';

// ctx = { toolset: Set, registryMcp: Set (alle mcp:-Namen der Registry) }
export function render(currentText, ctx) {
  const lines = currentText.split('\n');
  let inMcp = false;
  let currentServer = null;
  const out = lines.map(line => {
    if (!inMcp) {
      if (/^\s*"mcp":\s*\{/.test(line)) inMcp = true;
      return line;
    }
    if (/^  \}/.test(line)) {
      inMcp = false;
      return line;
    }
    const serverMatch = /^    \"([^\"]+)\": \{/.exec(line);
    if (serverMatch) {
      currentServer = serverMatch[1];
      return line;
    }
    const enabledMatch = /^(\s*"enabled":\s*)(true|false)(.*)$/.exec(line);
    if (enabledMatch && currentServer !== null && ctx.registryMcp.has(currentServer)) {
      return `${enabledMatch[1]}${ctx.toolset.has('mcp:' + currentServer)}${enabledMatch[3]}`;
    }
    return line;
  });
  return out.join('\n');
}
