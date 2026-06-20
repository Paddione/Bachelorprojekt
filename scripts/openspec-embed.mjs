#!/usr/bin/env node
// scripts/openspec-embed.mjs — Write-CLI: indexes one OpenSpec change (proposal/tasks/spec)
// into knowledge.chunks via TEI embeddings. Best-effort: logs errors, exits 0.
//   node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
// Chunking/frontmatter helpers are pure and duplicated from website/src/lib/chunking.ts
// (an ESM script cannot import the TS src/ tree).

export function stripFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { body: raw, frontmatter: {} };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { body: raw.slice(m[0].length).replace(/^\n+/, ''), frontmatter };
}

export function approxTokens(s) {
  return Math.ceil(s.length / 4);
}

function sectionTitleOf(section) {
  const line = section.split('\n').find((l) => /^#{1,6}\s/.test(l));
  return line ? line.replace(/^#{1,6}\s+/, '').trim() : '';
}

function splitByTokenBudget(text, target, overlap) {
  const charPerTok = 4;
  const targetChars = target * charPerTok;
  const overlapChars = overlap * charPerTok;
  const out = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push(text.slice(cursor, end).trim());
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}

export function chunkProposal(body) {
  return [{ position: 0, text: body.trim(), sectionTitle: '', charOffset: 0 }];
}

export function chunkSections(body, opts = {}) {
  const target = opts.targetTokens ?? 400;
  const overlap = opts.overlapTokens ?? 50;
  const out = [];
  let pos = 0;
  const lines = body.split('\n');
  const sections = [];
  let buf = '';
  let bufOffset = 0;
  let runningOffset = 0;
  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line);
    if (isHeading && buf.length > 0) {
      sections.push({ text: buf, offset: bufOffset });
      buf = '';
      bufOffset = runningOffset;
    }
    if (buf.length === 0) bufOffset = runningOffset;
    buf += line + '\n';
    runningOffset += line.length + 1;
  }
  if (buf.length > 0) sections.push({ text: buf, offset: bufOffset });

  for (const sec of sections) {
    const title = sectionTitleOf(sec.text);
    if (approxTokens(sec.text) <= target) {
      out.push({ position: pos++, text: sec.text.trim(), sectionTitle: title, charOffset: sec.offset });
    } else {
      for (const piece of splitByTokenBudget(sec.text, target, overlap)) {
        out.push({ position: pos++, text: piece, sectionTitle: title, charOffset: sec.offset });
      }
    }
  }
  return out;
}

// main() is fleshed out in Task 2; guard keeps the module importable by tests.
async function main() {
  console.error('openspec-embed: not yet wired (Task 2)');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
