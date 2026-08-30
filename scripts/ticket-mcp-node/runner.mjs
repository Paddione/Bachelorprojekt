#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MAX_BUFFER = 10 * 1024 * 1024;
const MISHAP_MAX_AGE_DAYS = 7;

// ── Repo root detection ────────────────────────────────────────────────────

function findRepoRoot() {
  const env = process.env.TICKET_MCP_REPO_ROOT;
  if (env) return env;
  let dir = dirname(resolve(process.argv[1] || '.'));
  while (dir !== '/' && dir !== '.' && dir.length > 0) {
    try {
      if (existsSync(join(dir, '.git')) && existsSync(join(dir, 'scripts', 'ticket.sh'))) return dir;
    } catch {}
    dir = dirname(dir);
  }
  return '';
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

export function runTicket(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const repoRoot = currentRepoRoot();
    const ticketSh = ticketShPath();
    const cleaned = resolve(ticketSh);
    const root = resolve(repoRoot || '.');
    if (!cleaned.startsWith(root)) {
      reject(new Error(`ticket.sh path ${cleaned} is outside repo root ${repoRoot}`));
      return;
    }
    const child = spawn('bash', [ticketSh, ...args], { cwd: repoRoot, maxBuffer: MAX_BUFFER });
    const env = { ...process.env };
    for (const [k, v] of Object.entries(extraEnv)) {
      env[k] = v;
    }
    child.env = env;
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (d) => stdout.push(d));
    child.stderr.on('data', (d) => stderr.push(d));
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString();
      const err = Buffer.concat(stderr).toString();
      if (code === 0) resolve(out.trimEnd());
      else reject(new Error(`ticket.sh failed (exit code ${code}): ${err.trim() || 'unknown error'}`));
    });
    child.on('error', reject);
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

if (cli.version) {
  console.log('ticket-mcp-node version=1.0.0');
  process.exit(0);
}

if (cli.flushStaleMishaps) {
  flushStaleMishaps(cli.brand, cli.flushMaxAgeDays)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`flush-stale-mishaps fehlgeschlagen: ${err.message}`);
      process.exit(1);
    });
} else {
  // Default: start as MCP server (stdio mode)
  await import('./server.mjs');
}
