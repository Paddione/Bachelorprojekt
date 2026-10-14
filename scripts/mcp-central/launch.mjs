#!/usr/bin/env node
// scripts/mcp-central/launch.mjs — startet einen zentralen MCP-Server (T901492)
// aus $MCP_SERVERS_HOME (Default ~/mcp-servers) statt ueber einen absoluten Pfad.
//
//   node scripts/mcp-central/launch.mjs <relativer-pfad> [server-args...]
//   node scripts/mcp-central/launch.mjs ticket/server.mjs
//
// Warum ein Launcher: .mcp.json und .opencode/opencode.jsonc trugen
// /home/patrick/mcp-servers/... fest verdrahtet. Auf jedem anderen Host und in
// Cloud-Sessions zeigte das ins Leere, und der Harness meldete nur
// "Connection closed". ${HOME} in .mcp.json scheidet aus, weil Qwen die Datei
// ohne ${VAR}-Expansion liest (T004272) — dieselbe Begruendung wie beim
// warden-Launcher (scripts/warden-mcp/launch.mjs).
//
// Fehlt die Quelle, endet der Launcher mit Exit 1 und nennt Pfad und Abhilfe
// auf stderr, statt einen namenlosen Verbindungsabbruch zu hinterlassen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [rel, ...rest] = process.argv.slice(2);
if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
  process.stderr.write('usage: launch.mjs <pfad-relativ-zu-MCP_SERVERS_HOME> [args...]\n');
  process.exit(2);
}

const root = process.env.MCP_SERVERS_HOME || path.join(os.homedir(), 'mcp-servers');
const target = path.join(root, rel);
if (!fs.existsSync(target)) {
  process.stderr.write(
    `mcp-central: ${target} fehlt. Zentrale MCP-Server unter ~/mcp-servers ` +
    `auschecken oder MCP_SERVERS_HOME setzen (T901492).\n`,
  );
  process.exit(1);
}

const child = spawn(process.execPath, [target, ...rest], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
