import { spawn } from 'child_process';
import { findRepoRoot } from './repo-root';

export interface ScanResult {
  id: string;
  measurable: boolean;
  actual?: number;
  cmp?: 'le' | 'ge' | 'eq';
  target?: number;
}

/** Großzügiger als der 60s-Vorbild in api/tests/report.ts — ein Multi-Ziel-Lauf misst real. */
export const SCAN_TIMEOUT_MS = 180_000;

/** Exit 2 des Wrappers = Eingabefehler (unbekannte/fehlende ID) → Route antwortet 400. */
export class HealthScanInputError extends Error {}

interface ProcOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runWrapper(args: string[]): Promise<ProcOutcome> {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['scripts/health-goals-scan.sh', ...args], {
      cwd: findRepoRoot(),
    });
    let stdout = '';
    let stderr = '';
    proc.stdout!.on('data', (chunk) => { stdout += chunk; });
    proc.stderr!.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { proc.kill(); }, SCAN_TIMEOUT_MS);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${err.message}` });
    });
  });
}

/**
 * Misst die angeforderten Ziel-IDs über scripts/health-goals-scan.sh.
 * Argument-Array, nie shell:true — Ziel-IDs erreichen den Wrapper uninterpoliert.
 * Jede angeforderte ID erhält einen Eintrag; fehlt eine Messung, ist es
 * explizit `measurable: false` (nie der dokumentierte Wert, nie stilles Droppen).
 */
export async function runHealthScan(ids: string[]): Promise<ScanResult[]> {
  if (ids.length === 0) {
    throw new HealthScanInputError('keine Ziel-IDs angegeben');
  }
  const outcome = await runWrapper(ids);

  if (outcome.code === 2) {
    throw new HealthScanInputError(outcome.stderr.trim() || 'Unbekannte Ziel-ID');
  }
  if (outcome.code !== 0) {
    throw new Error(
      `health-goals-scan.sh endete mit ${outcome.code}: ${outcome.stderr.trim().slice(0, 200)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    throw new Error('health-goals-scan.sh lieferte kein gültiges JSON auf stdout');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('health-goals-scan.sh lieferte kein JSON-Array');
  }

  const byId = new Map<string, ScanResult>();
  for (const item of parsed as ScanResult[]) {
    if (item && typeof item.id === 'string') {
      byId.set(item.id, item);
    }
  }
  // Vollständigkeit: keine angeforderte ID darf aus der Anzeige fallen.
  return ids.map((id) => byId.get(id) ?? { id, measurable: false });
}
