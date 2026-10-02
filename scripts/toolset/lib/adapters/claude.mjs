// scripts/toolset/lib/adapters/claude.mjs — Adapter .claude/settings.json (T900791).
// Reine Funktion: Dateitext rein, Dateitext raus. Kein I/O.
export const file = '.claude/settings.json';

// ctx = { toolset: Set, registryMcp: Set (alle mcp:-Namen der Registry),
//         suppressedMcp: Set, projectMcp: Set (Server-Namen aus .mcp.json) }
export function render(currentText, ctx) {
  const obj = JSON.parse(currentText);
  const disabled = new Set(ctx.suppressedMcp ?? []);
  for (const name of ctx.projectMcp ?? []) {
    if (ctx.registryMcp.has(name) && !ctx.toolset.has('mcp:' + name)) {
      disabled.add(name);
    }
  }
  // Server ohne Registry-Eintrag bleiben unangetastet (design.md §2, Quarantäne ist Sache
  // von check.mjs §3): bereits deaktivierte Unbekannte nicht stillschweigend aktivieren.
  for (const name of obj.disabledMcpjsonServers ?? []) {
    if (!ctx.registryMcp.has(name)) {
      disabled.add(name);
    }
  }
  obj.disabledMcpjsonServers = [...disabled].sort();
  return JSON.stringify(obj, null, 2) + '\n';
}
