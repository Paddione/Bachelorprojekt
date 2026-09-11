// scripts/agent-skills/lib/findings.mjs
// Finding model, diagnostics rendering and result emission for the projection engine.
// Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)

import { toPosix } from './fsutil.mjs';

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_FATAL = 2;

export const FATAL_CODES = new Set([
  'unknown-option',
  'mode-conflict',
  'write-mode-disabled-in-ci',
  'root-not-found',
  'registry-not-found',
  'invalid-schema',
  'unknown-harness',
  'invalid-exposure',
  'duplicate-skill-id',
  'projection-outside-harness-root',
  'internal-error',
]);

export function makeFinding(code, details = {}) {
  const finding = { code };
  if (details.skill !== undefined && details.skill !== null) finding.skill = details.skill;
  if (details.harness !== undefined && details.harness !== null) finding.harness = details.harness;
  if (details.path !== undefined && details.path !== null) finding.path = details.path;
  if (details.message !== undefined && details.message !== null) finding.message = details.message;
  return finding;
}

export function findingToText(finding) {
  const parts = [finding.code];
  if (finding.skill) parts.push(`skill=${finding.skill}`);
  if (finding.harness) parts.push(`harness=${finding.harness}`);
  if (finding.path) parts.push(`path=${finding.path}`);
  return parts.join(' ');
}

export function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    return (
      String(a.skill || '').localeCompare(String(b.skill || '')) ||
      String(a.harness || '').localeCompare(String(b.harness || '')) ||
      String(a.code).localeCompare(String(b.code)) ||
      String(a.path || '').localeCompare(String(b.path || ''))
    );
  });
}

export function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = [finding.code, finding.skill || '', finding.harness || '', finding.path || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export function countByCode(findings) {
  const byCode = {};
  for (const finding of findings) {
    byCode[finding.code] = (byCode[finding.code] || 0) + 1;
  }
  return byCode;
}

export function emit(result) {
  const findings = sortFindings(dedupeFindings(result.findings || []));
  const fatalCount = findings.filter((finding) => FATAL_CODES.has(finding.code)).length;
  const status = fatalCount > 0 ? EXIT_FATAL : findings.length > 0 ? EXIT_FINDINGS : EXIT_OK;
  process.exitCode = status;

  const payload = {
    ok: status === EXIT_OK,
    mode: result.mode || 'check',
    root: toPosix(result.rootAbs || process.cwd()),
    registry: result.registryDisplay || null,
    harnesses: result.harnesses || [],
    catalog: result.catalog || [],
    ignored: result.ignored || [],
    findings,
    actions: result.actions || [],
    counts: {
      catalog: (result.catalog || []).length,
      ignored: (result.ignored || []).length,
      findings: findings.length,
      fatal: fatalCount,
      actions: (result.actions || []).length,
      byCode: countByCode(findings),
    },
  };

  if (result.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  for (const action of payload.actions) {
    console.log(`materialized skill=${action.skill} harness=${action.harness} path=${action.path}`);
  }
  for (const finding of findings) {
    console.log(findingToText(finding));
  }

  const flaggedSkills = new Set(findings.map((finding) => finding.skill).filter(Boolean));
  for (const entry of payload.catalog) {
    if (!flaggedSkills.has(entry.id)) console.log(`ok ${entry.id}`);
  }
}