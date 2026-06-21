import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_TICKET_SH = path.join(REPO_ROOT, 'scripts', 'ticket.sh');

export async function runTicket(args, extraEnv = {}) {
  const ticketSh = extraEnv.TICKET_SH ?? DEFAULT_TICKET_SH;
  const env = { ...process.env, ...extraEnv };
  delete env.TICKET_SH;

  try {
    const { stdout } = await execFileAsync('bash', [ticketSh, ...args], {
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const msg = err.stderr?.trim() || err.message;
    throw new Error(`ticket.sh failed (exit code ${err.code}): ${msg}`);
  }
}
