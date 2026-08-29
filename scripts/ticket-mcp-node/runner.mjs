#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';

const MAX_BUFFER = 10 * 1024 * 1024;

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
