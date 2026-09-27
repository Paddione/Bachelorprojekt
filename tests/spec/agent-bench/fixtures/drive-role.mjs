// fixtures/drive-role.mjs — ruft einen Rollen-Adapter direkt auf und druckt
// das Ergebnis als JSON. argv: <rolle> <variante.json> <inputs.json>
// variante.json: { briefPath?, checksDir?, referenceDir?, dir?, budget?,
//   expected_decision?, perspective? }; inputs.json: beliebiges inputs-Objekt.
// Env: RECORDER_URL (fuer alle recorderUrls), WORKDIR.
import { readFileSync } from 'node:fs';
import { runRole } from '../../../../scripts/llm/agent-bench/lib/roles.mjs';

const [role, variantPath, inputsPath] = process.argv.slice(2);
const variant = JSON.parse(readFileSync(variantPath, 'utf8'));
const inputs = inputsPath ? JSON.parse(readFileSync(inputsPath, 'utf8')) : {};
const url = process.env.RECORDER_URL || '';
const params = {
  variant,
  inputs,
  endpoints: {},
  workdir: process.env.WORKDIR || '/tmp/drive-role-work',
  recorderUrls: {
    planner: url, orchestrator: url, codeWorker: url, visionWorker: url, reviewer: url,
  },
  timeoutMs: Number(process.env.DRIVE_TIMEOUT_MS || 60000),
};
try {
  const result = await runRole(role, params);
  if (result && typeof result.cleanup === 'function') await result.cleanup().catch(() => {});
  const { cleanup, ...rest } = result || {};
  console.log(JSON.stringify(rest));
} catch (e) {
  console.log(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
  process.exit(1);
}
