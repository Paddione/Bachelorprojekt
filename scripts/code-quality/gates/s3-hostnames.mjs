// scripts/code-quality/gates/s3-hostnames.mjs
// S3: hardcoded prod hostnames (string literal, not comment) in scoped dirs.
// key=S3:<path>:<host>, metric=1.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackedFiles } from '../scan.mjs';

const HOST_RE = /[a-z0-9-]+\.(?:mentolder|korczewski)\.de/g;

/** True iff the line is a comment-only line (# or //). */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith('#') || t.startsWith('//');
}

/** Set of distinct hostnames in `text`, ignoring comment-only lines. */
export function hostsInText(text) {
  const hosts = new Set();
  for (const line of text.split('\n')) {
    if (isCommentLine(line)) continue;
    for (const m of line.matchAll(HOST_RE)) hosts.add(m[0]);
  }
  return hosts;
}

/** A file is in S3 scope if under a scope_dir, not allowlisted, not md/built. */
function inScope(file, scopeDirs, allowlist) {
  if (!scopeDirs.some((d) => file.startsWith(d))) return false;
  if (allowlist.includes(file)) return false;
  if (file.endsWith('.md')) return false;
  if (file.includes('-content-built/')) return false;
  return true;
}

/** Run S3 over the tracked tree. Returns the gate contract object. */
export function runS3(repoRoot, gates) {
  const scopeDirs = gates?.s3?.scope_dirs ?? [];
  const allowlist = gates?.s3?.allowlist_files ?? [];
  const violations = [];
  for (const file of trackedFiles(repoRoot)) {
    if (!inScope(file, scopeDirs, allowlist)) continue;
    let text;
    try { text = readFileSync(join(repoRoot, file), 'utf8'); }
    catch (err) {
      // Keep the skip (git-tracked file; a read failure is a rare race), but be
      // loud so a systemic read failure is never silent.
      process.stderr.write(`S3: unreadable ${file}: ${err?.message}\n`);
      continue;
    }
    for (const host of [...hostsInText(text)].sort()) {
      violations.push({
        key: `S3:${file}:${host}`,
        path: file,
        metric: 1,
        detail: `hardcoded host: ${host}`,
      });
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S3', status: violations.length ? 'fail' : 'pass', violations };
}
