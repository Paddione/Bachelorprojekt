import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUSTANG_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/mustang.sh');

export interface MustangResult { ok: boolean; output: string }

export function validateWithMustang(content: Buffer | string, ext: 'xml' | 'pdf'): MustangResult {
  const dir = mkdtempSync(join(tmpdir(), 'mustang-'));
  const file = join(dir, `invoice.${ext}`);
  writeFileSync(file, content);
  try {
    const out = execFileSync(MUSTANG_SCRIPT, ['validate', file], { encoding: 'utf8' });
    return { ok: true, output: out };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return { ok: false, output: String(err.stdout ?? '') + String(err.stderr ?? '') + (err.message ?? '') };
  }
}

export const mustangAvailable = (() => {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();
