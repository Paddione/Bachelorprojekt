// scripts/lib/wsl-paths.mjs — Pfad-Helfer fuer MCP-Server, die Muse Code auf WSL und Windows bedienen.
//
// Aus scripts/glimmer-worker-mcp/lib.mjs extrahiert (T900379), damit glimmer-worker-mcp und
// comfy-image-mcp dieselbe Abbildung nutzen. Reine Funktionen, keine Seiteneffekte ausser git.

import { spawnSync } from 'node:child_process';

// Windows- und UNC-Formen auf WSL-Pfade abbilden; alles andere bleibt.
//   C:\a\b                        -> /mnt/c/a/b
//   \\wsl.localhost\<distro>\a\b  -> /a/b
//   \\wsl$\<distro>\a\b           -> /a/b
export function toWslPath(p) {
  let s = String(p || '').trim();
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(s);
  if (drive) {
    s = `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`;
  } else {
    const unc = /^[\\/]{2}wsl(?:\.localhost|\$)[\\/][^\\/]+[\\/]?(.*)$/i.exec(s);
    if (unc) s = '/' + unc[1].replace(/\\/g, '/');
  }
  s = s.replace(/\/{2,}/g, '/');
  return s.length > 1 ? s.replace(/\/+$/, '') : s;
}

// Prueft, ob dir in einem Git-Arbeitsbaum liegt.
export function isGitWorkTree(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { timeout: 10000 });
  return r.status === 0 && String(r.stdout).trim() === 'true';
}
