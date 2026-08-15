import { describe, test, expect } from 'vitest';
import { chunkText, approxTokens } from './chunking';

describe('chunkText', () => {
  test('short text → one chunk', () => {
    const out = chunkText('hello world', { targetTokens: 600, overlapTokens: 100 });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('hello world');
    expect(out[0].position).toBe(0);
  });

  test('text longer than target → multiple chunks with overlap', () => {
    const big = ('paragraph. ').repeat(2000);  // ~4000 tokens
    const out = chunkText(big, { targetTokens: 600, overlapTokens: 100 });
    expect(out.length).toBeGreaterThan(5);
    // Adjacent chunks share suffix/prefix
    const tail = out[0].text.split(/\s+/).slice(-20).join(' ');
    expect(out[1].text.startsWith(tail.slice(0, 20))).toBe(true);
  });

  test('markdown with H2 boundaries → splits on heading first', () => {
    const md = '## A\n' + 'foo '.repeat(400) + '\n\n## B\n' + 'bar '.repeat(400);
    const out = chunkText(md, { targetTokens: 600, overlapTokens: 100, mode: 'markdown' });
    // First chunk should contain "## A" but not "## B"
    expect(out[0].text).toContain('## A');
    expect(out[0].text).not.toContain('## B');
    expect(out.some(c => c.text.startsWith('## B'))).toBe(true);
  });

  test('approxTokens ≈ length / 4', () => {
    expect(approxTokens('hello world')).toBeCloseTo(3, 0);
    expect(approxTokens('x'.repeat(400))).toBeCloseTo(100, 0);
  });
});
