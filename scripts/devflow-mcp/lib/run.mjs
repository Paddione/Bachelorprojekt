// scripts/devflow-mcp/lib/run.mjs — Skriptaufrufe mit Timeout, strukturierte Rückgabe (T900985).
//
// Asynchron (spawn statt spawnSync): ein langer Schritt wie worktree-create oder git push darf die
// Event-Loop des MCP-Servers nicht blockieren.
import { spawn } from 'node:child_process';

export function run(command, args = [], { cwd, env = process.env, timeoutMs = 120000, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + e.message, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: timedOut ? 124 : code, stdout, stderr, timedOut }); });
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}

// Letzte Zeilen einer Ausgabe — Rückgaben an Agenten bleiben kurz.
export const tail = (s, n = 15) => String(s ?? '').trimEnd().split('\n').slice(-n).join('\n');
