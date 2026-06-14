import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
