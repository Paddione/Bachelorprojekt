import { describe, it, expect } from 'vitest';
import {
  stripFrontmatter,
  approxTokens,
  chunkProposal,
  chunkSections,
  buildChunks,
  embedSlug,
  resolveEmbeddingModel,
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
  it('produces exactly one atomic chunk', () => {
    const chunks = chunkProposal('# P\n\nsome proposal body that is short');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].sectionTitle).toBe('');
    expect(chunks[0].charOffset).toBe(0);
    expect(chunks[0].text).toContain('proposal body');
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
