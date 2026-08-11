import http from 'node:http';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  stripFrontmatter,
  approxTokens,
  chunkProposal,
  chunkSections,
  buildChunks,
  embedSlug,
  resolveEmbeddingModel,
  defaultEmbed,
  estimateSlugTokenWorst,
  listLocalActivePlans,
  computeCoverageGap,
  completenessGateMessage,
} from './openspec-embed.mjs';


describe('stripFrontmatter', () => {
  it('removes the leading --- block and parses flat keys', () => {
    const raw = '---\nticket_id: T000987\nstatus: planning\n---\n\n# Title\n\nBody text.';
    const { body, frontmatter } = stripFrontmatter(raw);
    expect(frontmatter.ticket_id).toBe('T000987');
    expect(frontmatter.status).toBe('planning');
    expect(body.startsWith('# Title')).toBe(true);
    expect(body).not.toContain('ticket_id');
  });

  it('returns the raw body unchanged when there is no frontmatter', () => {
    const raw = '# No frontmatter\n\nhello';
    const { body, frontmatter } = stripFrontmatter(raw);
    expect(body).toBe(raw);
    expect(frontmatter).toEqual({});
  });
});

describe('approxTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('a'.repeat(400))).toBe(100);
  });
});

describe('chunkProposal', () => {
  it('produces exactly one atomic chunk for a short body', () => {
    const chunks = chunkProposal('# P\n\nsome proposal body that is short');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].sectionTitle).toBe('');
    expect(chunks[0].charOffset).toBe(0);
    expect(chunks[0].text).toContain('proposal body');
  });

  // T002839 RED: chunkProposal() currently returns the whole body as ONE
  // unsplit chunk regardless of size — unlike chunkSections(), which applies
  // a 400-token budget split (with overlap) once a section exceeds target.
  // A long proposal.md (e.g. openspec/changes/zielfamilie-llm-stack/proposal.md,
  // ~2306 tokens) therefore produces a single oversized chunk that trips the
  // 2048-token diagnostic in `--count-skipped` while embedSlug() silently
  // sends it whole to the embedding backend anyway.
  it('[T002839] splits an oversized body by the same 400-token budget as chunkSections, with overlap', () => {
    const big = '# P\n\n' + 'word '.repeat(500); // ~625 tokens > 400 budget
    const chunks = chunkProposal(big, { targetTokens: 400, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => approxTokens(c.text) <= 420)).toBe(true);
    expect(chunks.every((c) => c.sectionTitle === '')).toBe(true);
    // positions stay contiguous from 0
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });
});

describe('chunkSections', () => {
  it('splits on ## headings and records section titles + offsets', () => {
    const body = '## Alpha\n\nfirst section text\n\n## Beta\n\nsecond section text';
    const chunks = chunkSections(body);
    expect(chunks.length).toBe(2);
    expect(chunks[0].sectionTitle).toBe('Alpha');
    expect(chunks[1].sectionTitle).toBe('Beta');
    expect(chunks[0].charOffset).toBe(0);
    expect(chunks[1].charOffset).toBe(body.indexOf('## Beta'));
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
  });

  it('further splits an oversized section by token budget with overlap', () => {
    const big = '## Huge\n\n' + 'word '.repeat(500); // ~625 tokens > 400 budget
    const chunks = chunkSections(big, { targetTokens: 400, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.sectionTitle === 'Huge')).toBe(true);
    expect(chunks.every((c) => approxTokens(c.text) <= 420)).toBe(true);
  });
});

describe('buildChunks', () => {
  it('assigns global positions and correct fileType per source', () => {
    const chunks = buildChunks({
      proposal: '# P\n\nproposal body',
      tasks: '## T1\n\ntask one\n\n## T2\n\ntask two',
      spec: '## S1\n\nspec section',
    });
    const types = chunks.map((c) => c.fileType);
    expect(types[0]).toBe('proposal');
    expect(types).toContain('task_section');
    expect(types).toContain('spec_section');
    // positions are unique + contiguous from 0
    const positions = chunks.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions[0]).toBe(0);
  });

  // Regression anchor (already green today): a partial that fits the
  // plan-lint.sh T002453-C governing limit (7000 tokens, checked separately
  // from this diagnostic) MUST remain a single fileType='partial' chunk —
  // openspec-embedding.md's SSOT requirement "Plan-Partials aus tasks.d/
  // werden als Factory-Slot-Einheit eingebettet" says exactly this. T002839's
  // fix must NOT start splitting partials to make the 2048-token diagnostic
  // happy; only chunkProposal() gets the budget split (see above).
  it('[T002839] keeps an oversized-but-plan-lint-legal partial as one chunk', () => {
    const bigPartial = '# Partial\n\n' + 'word '.repeat(1700); // ~2125 tokens, < 7000
    const chunks = buildChunks({ partials: { 'p1-big': bigPartial } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].fileType).toBe('partial');
    expect(chunks[0].sectionTitle).toBe('p1-big');
    expect(approxTokens(chunks[0].text)).toBeGreaterThan(2048);
  });
});

describe('resolveEmbeddingModel', () => {
  it('uses bge-m3 when LLM_ENABLED=true, voyage otherwise', () => {
    const prev = process.env.LLM_ENABLED;
    process.env.LLM_ENABLED = 'true';
    expect(resolveEmbeddingModel()).toBe('bge-m3');
    process.env.LLM_ENABLED = 'false';
    expect(resolveEmbeddingModel()).toBe('voyage-multilingual-2');
    process.env.LLM_ENABLED = prev;
  });
});

describe('embedSlug', () => {
  function fakeDeps() {
    const queries = [];
    const fake = {
      log: () => {},
      embed: async (texts) => texts.map(() => Array(1024).fill(0.01)),
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/INSERT INTO knowledge\.collections/i.test(sql)) return { rows: [{ id: 'col-1' }] };
        if (/SELECT id FROM knowledge\.collections/i.test(sql)) return { rows: [{ id: 'col-1' }] };
        if (/INSERT INTO knowledge\.documents/i.test(sql)) return { rows: [{ id: 'doc-1' }] };
        return { rows: [] };
      },
    };
    return { fake, queries };
  }

  it('dry-run inserts nothing and reports dryRun:true', async () => {
    const { fake, queries } = fakeDeps();
    const res = await embedSlug({ slug: 'demo', repoRoot: '/nonexistent', dryRun: true, deps: fake });
    expect(res.dryRun).toBe(true);
    expect(queries.some((q) => /INSERT/i.test(q.sql))).toBe(false);
  });
});

describe('defaultEmbed', () => {
  // T002913: a backend that accepts TCP but never answers must NOT hang the
  // embed call forever — the post-commit hook ran inside the factory tick's
  // `git rebase` and wedged the whole dispatcher (flock held, no further ticks).
  it('aborts after the fetch timeout when the backend never responds', async () => {
    const server = http.createServer((_req, _res) => {
      // Accept the connection, never send a response (dead-but-accepting).
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const prevUrl = process.env.LLM_EMBED_URL;
    const prevTimeout = process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS;
    process.env.LLM_EMBED_URL = `http://127.0.0.1:${port}`;
    process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS = '300';

    try {
      await expect(defaultEmbed(['ping'])).rejects.toThrow(/aborted|timed out/i);
    } finally {
      process.env.LLM_EMBED_URL = prevUrl;
      if (prevTimeout === undefined) delete process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS;
      else process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS = prevTimeout;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

// T002839 fixture helper: builds a synthetic openspec/changes/ tree so the
// --count-skipped diagnostic can be exercised deterministically (no dependency
// on which real repo slugs happen to be active/oversized today).
function makeFixtureRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'openspec-embed-fixture-'));
  const changesDir = path.join(root, 'openspec', 'changes');

  function writeSlug(slug, { proposalTokens = 50, partialTokens = null } = {}) {
    const dir = path.join(changesDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'tasks.md'),
      `---\nticket_id: T000000\nstatus: active\n---\n\n## Partials\n`,
    );
    writeFileSync(
      path.join(dir, 'proposal.md'),
      `# ${slug}\n\n` + 'word '.repeat(proposalTokens),
    );
    if (partialTokens != null) {
      const tasksDir = path.join(dir, 'tasks.d');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(
        path.join(tasksDir, 'p1-x.md'),
        `# Partial\n\n` + 'word '.repeat(partialTokens),
      );
    }
  }

  return { root, writeSlug };
}

describe('estimateSlugTokenWorst', () => {
  // T002839 RED: today this returns a bare number (the max token count across
  // all chunks), which loses which chunk type produced it. The fix needs the
  // fileType alongside the count so `--count-skipped` can apply a type-aware
  // threshold (partials are governed by plan-lint.sh's 7000-token cap, not the
  // 2048-token default meant for proposal/task/spec chunks).
  it('[T002839] reports {tokens, fileType} for the worst chunk, not a bare number', () => {
    const { root, writeSlug } = makeFixtureRepo();
    try {
      // proposalTokens=50 stays a single short chunk; partialTokens=550 is the
      // worst chunk in this slug (~550*1.25 approx-tokens > the short proposal).
      writeSlug('slug-a', { proposalTokens: 50, partialTokens: 550 });
      const worst = estimateSlugTokenWorst('slug-a', root);
      expect(worst).not.toBeNull();
      expect(typeof worst).toBe('object');
      expect(worst.fileType).toBe('partial');
      expect(worst.tokens).toBeGreaterThan(400);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('CLI: node scripts/openspec-embed.mjs --count-skipped', () => {
  const scriptPath = path.resolve(import.meta.dirname, 'openspec-embed.mjs');

  function runCountSkipped(repoRoot) {
    return execFileSync('node', [scriptPath, '--count-skipped'], {
      env: { ...process.env, OPENSPEC_EMBED_REPO: repoRoot },
      encoding: 'utf8',
    });
  }

  // T002839 RED (reproduces the ticket's exact bug): a proposal.md far over
  // the 400-token chunk budget must stop being flagged once chunkProposal()
  // splits it — AND a plan-lint-legal partial (~2100 tokens, under the
  // 7000-token cap) must NEVER have been flagged as "skipped" in the first
  // place, since embedSlug() does not actually skip anything by token count.
  // A genuinely oversized partial (>7000 tokens, illegal even under
  // plan-lint.sh) stays flagged — the positive anchor proving the check still
  // catches real problems instead of trivially reporting zero for everything.
  it('[T002839] stops flagging a long proposal + a plan-lint-legal partial, keeps flagging an illegally oversized partial, and lists slugs', () => {
    const { root, writeSlug } = makeFixtureRepo();
    try {
      writeSlug('slug-long-proposal', { proposalTokens: 2000 }); // ~2500+ tokens unsplit today
      writeSlug('slug-legal-partial', { partialTokens: 1700 }); // ~2125 tokens, < 7000
      writeSlug('slug-illegal-partial', { partialTokens: 6000 }); // ~7500 tokens, > 7000
      writeSlug('slug-short', {}); // never skipped, sanity control

      const out = runCountSkipped(root);

      expect(out).toMatch(/skipped: 1 documents \(1 context limit > \d+ tokens, 0 other reasons\)/);
      expect(out).toContain('slug-illegal-partial');
      expect(out).not.toContain('slug-long-proposal');
      expect(out).not.toContain('slug-legal-partial');
      expect(out).not.toContain('slug-short');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// T002877 fixture helper: builds a synthetic openspec/changes/ tree with
// per-slug tasks.md frontmatter so listLocalActivePlans() can be exercised
// deterministically (status filtering, archive skipping, missing tasks.md).
function makeStatusFixtureRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'openspec-embed-status-'));
  const changesDir = path.join(root, 'openspec', 'changes');

  function writeSlug(slug, status) {
    const dir = path.join(changesDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'tasks.md'),
      `---\nticket_id: T000000\nstatus: ${status}\n---\n\n## Tasks\n`,
    );
  }

  return { root, changesDir, writeSlug };
}

describe('listLocalActivePlans', () => {
  it('returns slugs with status in ACTIVE_STATUSES and skips non-active + archive', () => {
    const { root, writeSlug } = makeStatusFixtureRepo();
    try {
      writeSlug('plan-a', 'planning');
      writeSlug('plan-b', 'plan_staged');
      writeSlug('plan-c', 'archived');
      writeSlug('plan-d', 'done');
      const archiveDir = path.join(root, 'openspec', 'changes', 'archive', 'old');
      mkdirSync(archiveDir, { recursive: true });
      writeFileSync(
        path.join(archiveDir, 'tasks.md'),
        `---\nticket_id: T000000\nstatus: planning\n---\n\n## Tasks\n`,
      );

      const slugs = listLocalActivePlans(root).sort();
      expect(slugs).toEqual(['plan-a', 'plan-b']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns [] when openspec/changes does not exist', () => {
    expect(listLocalActivePlans('/nonexistent')).toEqual([]);
  });

  it('returns [] when no tasks.md exists in any slug dir', () => {
    const { root, changesDir } = makeStatusFixtureRepo();
    try {
      mkdirSync(path.join(changesDir, 'no-tasks-a'), { recursive: true });
      mkdirSync(path.join(changesDir, 'no-tasks-b'), { recursive: true });
      expect(listLocalActivePlans(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('computeCoverageGap', () => {
  it('reports full coverage when every local active plan is indexed', () => {
    const gap = computeCoverageGap(['a', 'b'], ['a', 'b']);
    expect(gap.missing).toEqual([]);
    expect(gap.missingCount).toBe(0);
    expect(gap.total).toBe(2);
    expect(gap.coverageRatio).toBe(1);
  });

  it('reports the missing slugs when only part of the local plans are indexed', () => {
    const gap = computeCoverageGap(['a', 'b', 'c', 'd'], ['a', 'b']);
    expect(gap.missing).toEqual(['c', 'd']);
    expect(gap.missingCount).toBe(2);
    expect(gap.total).toBe(4);
    expect(gap.coverageRatio).toBe(0.5);
  });

  it('reports ratio 0 when there are no local active plans', () => {
    const gap = computeCoverageGap([], ['a']);
    expect(gap.missing).toEqual([]);
    expect(gap.missingCount).toBe(0);
    expect(gap.total).toBe(0);
    expect(gap.coverageRatio).toBe(0);
  });
});

describe('completenessGateMessage', () => {
  it('warns and lists the missing slugs when coverage exceeds the tolerance', () => {
    const msg = completenessGateMessage(computeCoverageGap(['a', 'b', 'c', 'd'], ['a', 'b']), 0.10);
    expect(msg.startsWith('WARN: completeness gate')).toBe(true);
    expect(msg).toContain('2/4');
    expect(msg).toContain('c, d');
  });

  it('reports OK when every local active plan is covered', () => {
    const msg = completenessGateMessage(computeCoverageGap(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']), 0.10);
    expect(msg.startsWith('completeness gate OK')).toBe(true);
  });

  it('uses the 10% default tolerance when none is given', () => {
    const msg = completenessGateMessage(computeCoverageGap(['a', 'b', 'c', 'd'], ['a', 'b']));
    expect(msg.startsWith('WARN:')).toBe(true);
  });

  it('reports OK with a dedicated message when there are no local active plans', () => {
    const msg = completenessGateMessage(computeCoverageGap([], []));
    expect(msg).toBe('completeness gate OK — no local active plans to cover');
  });
});

