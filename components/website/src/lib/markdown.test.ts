import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown — safety', () => {
  it('escapes raw HTML special chars in plain text', () => {
    const out = renderMarkdown('a < b & c > d "e"');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain('&amp;');
    expect(out).not.toContain('< b');
  });

  it('renders a <script> payload as inert text, never a tag', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('strips an onerror img injection to text', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('refuses a javascript: link, keeping the label as text', () => {
    const out = renderMarkdown('[klick](javascript:alert(1))');
    expect(out).not.toContain('href="javascript:');
    expect(out).toContain('klick');
  });

  it('refuses a data: link', () => {
    const out = renderMarkdown('[x](data:text/html,<script>1</script>)');
    expect(out).not.toContain('href="data:');
  });
});

describe('renderMarkdown — links', () => {
  it('renders https links with rel/target hardening', () => {
    const out = renderMarkdown('[Beispiel](https://example.org/a)');
    expect(out).toContain('href="https://example.org/a"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('>Beispiel</a>');
  });

  it('allows relative and anchor links', () => {
    expect(renderMarkdown('[admin](/admin/tickets)')).toContain('href="/admin/tickets"');
    expect(renderMarkdown('[anker](#abschnitt)')).toContain('href="#abschnitt"');
  });

  it('allows mailto links', () => {
    expect(renderMarkdown('[mail](mailto:a@b.de)')).toContain('href="mailto:a@b.de"');
  });
});

describe('renderMarkdown — blocks', () => {
  it('renders an unordered list', () => {
    const out = renderMarkdown('- eins\n- zwei');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>eins</li>');
    expect(out).toContain('<li>zwei</li>');
    expect(out).toContain('</ul>');
  });

  it('renders a numbered list as <ol>', () => {
    const out = renderMarkdown('1. eins\n2. zwei\n3. drei');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>eins</li>');
    expect(out).toContain('<li>drei</li>');
    expect(out).toContain('</ol>');
    expect(out).not.toContain('<ul>');
  });

  it('renders headings as h3..h5 (no h1/h2)', () => {
    const out = renderMarkdown('# Titel\n## Unter\n### Klein');
    expect(out).toContain('<h3>Titel</h3>');
    expect(out).toContain('<h4>Unter</h4>');
    expect(out).toContain('<h5>Klein</h5>');
    expect(out).not.toContain('<h1>');
  });

  it('renders a blockquote', () => {
    const out = renderMarkdown('> zitat');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('zitat');
  });

  it('renders a fenced code block with escaped content', () => {
    const out = renderMarkdown('```\n<b>x</b>\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).not.toContain('<b>x</b>');
  });

  it('wraps loose text in paragraphs', () => {
    const out = renderMarkdown('hallo welt');
    expect(out).toContain('<p>hallo welt</p>');
  });
});

describe('renderMarkdown — inline', () => {
  it('renders bold and italic', () => {
    expect(renderMarkdown('**fett**')).toContain('<strong>fett</strong>');
    expect(renderMarkdown('*kursiv*')).toContain('<em>kursiv</em>');
    expect(renderMarkdown('_kursiv_')).toContain('<em>kursiv</em>');
  });

  it('renders inline code with escaped content', () => {
    const out = renderMarkdown('nutze `a < b`');
    expect(out).toContain('<code>a &lt; b</code>');
  });
});

describe('renderMarkdown — edge cases', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   \n  \n')).toBe('');
  });

  it('handles non-string input defensively', () => {
    expect(renderMarkdown(null as unknown as string)).toBe('');
    expect(renderMarkdown(undefined as unknown as string)).toBe('');
  });

  it('keeps mixed blocks in order: heading, paragraph, list', () => {
    const out = renderMarkdown('# Plan\n\nKontext hier\n\n- a\n- b');
    const hIdx = out.indexOf('<h3>Plan</h3>');
    const pIdx = out.indexOf('<p>Kontext hier</p>');
    const lIdx = out.indexOf('<ul>');
    expect(hIdx).toBeGreaterThanOrEqual(0);
    expect(pIdx).toBeGreaterThan(hIdx);
    expect(lIdx).toBeGreaterThan(pIdx);
  });
});
