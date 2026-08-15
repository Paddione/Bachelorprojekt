import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, join as joinPath } from 'node:path';

// Anti-Drift: die Runtime-Call-Sites MÜSSEN ihren Source-String aus der Registry (SOURCE)
// beziehen, nicht aus einem Literal. Sonst kann das Dashboard (das KI_SERVICES nutzt) Sources
// konfigurieren, die die Runtime nie abfragt — genau der Bug, den dieses Feature behebt.
const here = dirname(fileURLToPath(import.meta.url)); // .../src/lib
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const CASES = [
  { file: 'claude.ts', usage: 'SOURCE.websiteLlm', literal: "getProviderConfig('website-llm'" },
  { file: 'ticket-triage.ts', usage: 'SOURCE.ticketTriage', literal: "getProviderConfig('ticket-triage'" },
  { file: 'assistant/llm.ts', usage: 'SOURCE.assistantChat', literal: "getProviderConfig('assistant-chat'" },
];

describe('Runtime-Call-Sites beziehen Source aus der Registry (Anti-Drift)', () => {
  for (const c of CASES) {
    it(`${c.file} nutzt ${c.usage} statt String-Literal`, () => {
      const src = read(c.file);
      expect(src).toContain(c.usage);
      expect(src).not.toContain(c.literal);
    });
  }
});

const pagesRoot = joinPath(here, '..', 'pages');
const readPage = (rel: string) => readFileSync(joinPath(pagesRoot, rel), 'utf8');

describe('classify.ts — Source-String kommt aus der Registry (Anti-Drift)', () => {
  it('classify.ts importiert SOURCE aus ki-services', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).toContain("from '");
    expect(src).toContain('SOURCE');
  });

  it('classify.ts nutzt SOURCE.ticketTriage statt String-Literal', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).toContain('SOURCE.ticketTriage');
    expect(src).not.toContain("getProviderConfig('ticket-triage'");
  });

  it('classify.ts enthält keine hardcoded claude-haiku Modell-ID', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).not.toContain('claude-haiku-4-5-20251001');
    expect(src).not.toContain('claude-haiku-4-5');
  });

  it('classify.ts hat keinen hardcoded ANTHROPIC_API_KEY Guard mehr', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).not.toContain("process.env.ANTHROPIC_API_KEY");
    expect(src).not.toContain('ANTHROPIC_API_KEY not configured');
  });
});
