// fixtures/drive-restore.mjs — installiert die Restore-Hooks aus loadouts.mjs
// und schlaeft, damit der Test per SIGINT abbrechen kann.
// Env: POOL_JSON (Pfad), FAKE_BIN_LOG via fake-bin.
import { readFileSync } from 'node:fs';
import { installRestoreHooks, restoreProduction } from '../../../../scripts/llm/agent-bench/lib/loadouts.mjs';

const pool = JSON.parse(readFileSync(process.env.POOL_JSON, 'utf8'));
installRestoreHooks(() => restoreProduction(pool));
console.log('DRIVE-RESTORE-READY');
await new Promise((r) => setTimeout(r, Number(process.env.DRIVE_SLEEP_MS || 15000)));
console.log('DRIVE-RESTORE-DONE');
