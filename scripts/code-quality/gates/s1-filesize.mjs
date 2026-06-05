// scripts/code-quality/gates/s1-filesize.mjs
// S1: tracked files over a per-extension line limit. key=S1:<path>, metric=lines.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scanUniverse } from '../scan.mjs';
import { matchGlob } from '../glob.mjs';

/** Number of lines: newline count, plus one if the last line has no newline. */
export function lineCount(text) {
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') n++;
  if (text[text.length - 1] !== '\n') n++;
  return n;
}

/** Build a violation for `file` (lines/limits/ignore), or null if it passes. */
export function evalFile(file, lines, limits, ignore) {
  if (ignore.some((g) => matchGlob(file, g))) return null;
  const ext = extname(file);
  const limit = limits[ext];
  if (limit === undefined) return null;
  if (lines <= limit) return null;
  return {
    key: `S1:${file}`,
    path: file,
    metric: lines,
    detail: `${lines} lines > ${limit} limit (${ext})`,
  };
}

/** Run S1 over the scan-universe. Returns the gate contract object. */
export function runS1(repoRoot, gates) {
  const limits = gates?.s1?.limits ?? {};
  const ignore = gates?.s1?.ignore ?? [];
  const violations = [];
  for (const file of scanUniverse(repoRoot, gates)) {
    if (extname(file) in limits === false) continue;
    let text;
    try { text = readFileSync(join(repoRoot, file), 'utf8'); }
    catch (err) {
      // Keep the skip (git-tracked file; a read failure is a rare race), but be
      // loud so a systemic read failure is never silent.
      process.stderr.write(`S1: unreadable ${file}: ${err?.message}\n`);
      continue;
    }
    const v = evalFile(file, lineCount(text), limits, ignore);
    if (v) violations.push(v);
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S1', status: violations.length ? 'fail' : 'pass', violations };
}
