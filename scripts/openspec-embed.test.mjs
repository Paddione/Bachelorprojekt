import { describe, it, expect } from 'vitest';
import {
  stripFrontmatter,
  approxTokens,
  chunkProposal,
  chunkSections,
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
