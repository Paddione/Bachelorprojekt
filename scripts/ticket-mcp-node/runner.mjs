#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MISHAP_MAX_AGE_DAYS = 7;

// ── Repo root detection ────────────────────────────────────────────────────

function findRepoRoot() {
  const env = process.env.TICKET_MCP_REPO_ROOT;
  if (env) return env;
  let dir = dirname(resolve(process.argv[1] || '.'));
  // Abbruch am Fixpunkt statt an '/': auf Windows liefert dirname('C:\')
  // wieder 'C:\', die Schleife endet dort sonst nie.
  for (;;) {
    try {
      if (existsSync(join(dir, '.git')) && existsSync(join(dir, 'scripts', 'ticket.sh'))) return dir;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

let initialRepoRoot = findRepoRoot();

function currentRepoRoot() {
  return process.env.TICKET_MCP_REPO_ROOT || initialRepoRoot;
}

function ticketShPath() {
  const env = process.env.TICKET_SH;
  if (env) {
    const cleaned = resolve(env);
    const root = currentRepoRoot();
    if (root && cleaned.startsWith(root)) return cleaned;
  }
  return join(currentRepoRoot(), 'scripts', 'ticket.sh');
}

// `spawn('bash')` loest je nach PATH des MCP-Hostprozesses ggf. den
// WSL-Stub (System32) statt Git-bash auf — dort existiert /c/... nicht
// (WSL nutzt /mnt/c/...), was exakt den Fehler
// "/bin/bash: /c/.../ticket.sh: No such file or directory" (exit 127) gab.
// Deshalb Git-bash auf Windows explizit bevorzugen, Fallback: 'bash'.
function resolveBash() {
  if (process.platform === 'win32') {
    const candidates = [];
    if (process.env.GIT_INSTALL_ROOT) candidates.push(join(process.env.GIT_INSTALL_ROOT, 'bin', 'bash.exe'));
    candidates.push('C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe');
    for (const c of candidates) {
      try {
        if (existsSync(c)) return c;
      } catch {}
    }
  }
  return 'bash';
}

const BASH_BIN = resolveBash();

// Git-bash versteht keine Windows-Pfade (C:\x\y kam als "C:xy" an →
// "No such file or directory", exit 127). Laufwerk in POSIX-Form bringen;
// UNC- und POSIX-Pfade fallen unverändert (bis auf Backslashes) durch.
function toBashPath(p) {
  const m = /^([A-Za-z]):[\\/]/.exec(p);
  if (m) return '/' + m[1].toLowerCase() + '/' + p.slice(3).replace(/\\/g, '/');
  return p.replace(/\\/g, '/');
}

export function runTicket(args, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const repoRoot = currentRepoRoot();
    const ticketSh = ticketShPath();
    const cleaned = resolve(ticketSh);
    const root = resolve(repoRoot || '.');
    if (!cleaned.startsWith(root)) {
      rejectPromise(new Error(`ticket.sh path ${cleaned} is outside repo root ${repoRoot}`));
      return;
    }
    // env gehört in die spawn-Optionen (child.env nachträglich zu setzen
    // erreicht den Kindprozess nicht) — maxBuffer ist keine spawn-Option.
    const env = { ...process.env };
    for (const [k, v] of Object.entries(extraEnv)) {
      env[k] = v;
    }
    const child = spawn(BASH_BIN, [toBashPath(ticketSh), ...args], { cwd: repoRoot, env });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (d) => stdout.push(d));
    child.stderr.on('data', (d) => stderr.push(d));
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString();
      const err = Buffer.concat(stderr).toString();
      if (code === 0) resolvePromise(out.trimEnd());
      else rejectPromise(new Error(`ticket.sh failed (exit code ${code}): ${err.trim() || 'unknown error'}`));
    });
    child.on('error', rejectPromise);
  });
}

// ── CLI mode: --flush-stale-mishaps (einmalig, beendet sich danach) ──────

function parseArgs(argv) {
  const args = {
    flushStaleMishaps: false,
    brand: 'mentolder',
    flushMaxAgeDays: MISHAP_MAX_AGE_DAYS,
    version: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--flush-stale-mishaps') args.flushStaleMishaps = true;
    else if (argv[i] === '--brand' && i + 1 < argv.length) args.brand = argv[++i];
    else if (argv[i] === '--flush-max-age-days' && i + 1 < argv.length)
      args.flushMaxAgeDays = parseFloat(argv[++i]);
    else if (argv[i] === '--version') args.version = true;
  }
  return args;
}

function mishapBufferPath(repoRoot) {
  return join(repoRoot, '.git', 'info', 'mishap-buffer.json');
}

async function flushStaleMishaps(brand, maxAgeDays) {
  const repoRoot = findRepoRoot();
  if (!repoRoot) throw new Error('Repo root nicht gefunden');

  const bufPath = mishapBufferPath(repoRoot);
  if (!existsSync(bufPath)) {
    console.log('Mishap-Buffer nicht überfällig — kein Bundle-Ticket angelegt.');
    return '';
  }

  const bufContent = readFileSync(bufPath, 'utf8');
  const buffer = JSON.parse(bufContent);
  if (!buffer || !Array.isArray(buffer) || buffer.length === 0) {
    console.log('Mishap-Buffer nicht überfällig — kein Bundle-Ticket angelegt.');
    return '';
  }

  // Find oldest entry
  const oldest = buffer.reduce((a, b) => {
    const at = new Date(a.ReportedAt);
    const bt = new Date(b.ReportedAt);
    return at < bt ? a : b;
  });

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(oldest.ReportedAt).getTime() < maxAgeMs) {
    console.log('Mishap-Buffer nicht überfällig — kein Bundle-Ticket angelegt.');
    return '';
  }

  // Flush: create a bundle ticket with all buffer entries
  const descriptions = buffer
    .map((e) => `[${e.Type}] ${e.Title}: ${e.Description}`)
    .join('\n\n');
  const title = `Mishap-Bundle: ${buffer.length} Eintraege (aeltester: ${oldest.ReportedAt})`;
  const description = `Automatischer Mishap-Bundle-Eintrag.\n\n${descriptions}`;

  // Create incident ticket via ticket.sh
  const result = await runTicket(
    [
      'create',
      '--type',
      'incident',
      '--title',
      title,
      '--description',
      description,
      '--brand',
      brand,
    ],
    {},
  );

  // Truncate buffer
  writeFileSync(bufPath, JSON.stringify([]), 'utf8');

  // Extract external_id from output (format: "external_id|uuid")
  const extId = result.split('|')[0];
  console.log(`Bundle-Ticket angelegt: ${extId}`);
  return extId;
}

// ── Entry point ────────────────────────────────────────────────────────────

const cli = parseArgs(process.argv);

// server.mjs importiert runner.mjs statisch (runTicket). Ohne diesen Guard
// liefe der Entrypoint-Block auch bei diesem Import und startete den Server
// ein zweites Mal.
const IS_ENTRY = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_ENTRY && cli.version) {
  console.log('ticket-mcp-node version=1.0.0');
  process.exit(0);
} else if (IS_ENTRY && cli.flushStaleMishaps) {
  flushStaleMishaps(cli.brand, cli.flushMaxAgeDays)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`flush-stale-mishaps fehlgeschlagen: ${err.message}`);
      process.exit(1);
    });
} else if (IS_ENTRY) {
  // Default: start as MCP server (stdio mode). Bewusst NICHT awaiten:
  // server.mjs importiert runner.mjs statisch zurueck. Ein top-level await
  // hier laesst beide Module aufeinander warten — der Prozess erreicht die
  // stdio-Schleife nie und antwortet auf kein einziges JSON-RPC-Frame.
  import('./server.mjs').catch((err) => { console.error(err); process.exit(1); });
}
