// Reviewer-Rolle (p5 Task 5.6): Urteil pass/fail ueber clean.diff oder
// seeded-*.diff aus checks/diffs/, Defektstelle gegen seeded-*.json.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { addUsage, chat, emptyResult, parseJsonLoose } from './_shared.mjs';

export async function runReviewer({ variant, inputs, endpoints, recorderUrls, timeoutMs = 300_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { diff: null };
  const diffsDir = join(variant.checksDir, 'diffs');
  const files = existsSync(diffsDir) ? readdirSync(diffsDir) : [];
  const seeded = files.find((f) => f.startsWith('seeded-') && f.endsWith('.diff'));
  const clean = files.find((f) => f === 'clean.diff');
  const diffFile = seeded || clean;
  if (!diffFile) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `kein Diff in ${diffsDir}` };
  const diff = readFileSync(join(diffsDir, diffFile), 'utf8');
  artifacts.diff = diffFile;
  const expectedVerdict = seeded ? 'fail' : 'pass';
  const seededJson = seeded ? join(diffsDir, seeded.replace(/\.diff$/, '.json')) : null;
  const expectedLocation = seeded && existsSync(seededJson) ? readFileSync(seededJson, 'utf8') : null;
  const partialText = inputs.partialText || (inputs.partialFile && existsSync(inputs.partialFile) ? readFileSync(inputs.partialFile, 'utf8') : '');
  const url = recorderUrls?.reviewer || endpoints?.reviewer;
  const res = await chat(url, {
    messages: [
      {
        role: 'user',
        content: `## Partial\n${partialText}\n\n## Diff\n${diff}\n\nAntworte ausschliesslich mit JSON {"verdict":"pass"|"fail","reason":"...","location":"datei:zeile"}.`,
      },
    ],
    model: inputs.partialModel || 'reviewer',
    params: { temperature: 0, max_tokens: 2048 },
    timeoutMs,
  });
  addUsage(usage, res.usage);
  if (!res.ok) return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const parsed = parseJsonLoose(res.message.content);
  if (!parsed || !['pass', 'fail'].includes(String(parsed.verdict || ''))) {
    return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  }
  const verdict = parsed.verdict;
  if (verdict !== expectedVerdict) {
    events.push({ kind: verdict === 'pass' ? 'false_pass' : 'false_fail' });
    return { outcome: 0, events, usage, artifacts };
  }
  if (verdict === 'fail' && expectedLocation) {
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const hay = `${norm(parsed.location)} ${norm(parsed.reason)}`;
    const tokens = parseJsonLoose(expectedLocation) || expectedLocation;
    const flat = typeof tokens === 'string' ? tokens : JSON.stringify(tokens);
    const named = String(flat).match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) || [];
    if (!named.some((t) => hay.includes(norm(t)))) events.push({ kind: 'defect_unnamed' });
  }
  return { outcome: 1, events, usage, artifacts };
}
