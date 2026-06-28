import { describe, it, expect } from 'vitest';
import { KI_SERVICES, SOURCE, serviceByKey, type Tier } from './ki-services';

const VALID_TIERS: Tier[] = ['sonnet', 'haiku', 'coaching'];

describe('KI_SERVICES registry', () => {
  it('listet mindestens die vier Kern-Dienste', () => {
    const keys = KI_SERVICES.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining(['website-llm', 'assistant-chat', 'ticket-triage', 'coaching']),
    );
  });

  it('hat eindeutige keys und sources', () => {
    expect(new Set(KI_SERVICES.map((s) => s.key)).size).toBe(KI_SERVICES.length);
    expect(new Set(KI_SERVICES.map((s) => s.source)).size).toBe(KI_SERVICES.length);
  });

  it('verwendet nur gültige tiers und nicht-leere sources', () => {
    for (const s of KI_SERVICES) {
      expect(VALID_TIERS).toContain(s.tier);
      expect(s.source.length).toBeGreaterThan(0);
      expect(['routing', 'coaching']).toContain(s.paramSet);
    }
  });

  it('coaching ist brand-scoped, tier=coaching, paramSet=coaching', () => {
    const c = serviceByKey('coaching')!;
    expect(c.brandScoped).toBe(true);
    expect(c.tier).toBe('coaching');
    expect(c.paramSet).toBe('coaching');
  });

  it('Routing-Dienste sind nicht brand-scoped', () => {
    for (const key of ['website-llm', 'assistant-chat', 'ticket-triage']) {
      expect(serviceByKey(key)!.brandScoped).toBe(false);
    }
  });
});

describe('SOURCE constants (Anti-Drift gegen Runtime-Call-Sites)', () => {
  it('entsprechen exakt den real abgefragten Source-Strings', () => {
    expect(SOURCE.websiteLlm).toBe('website-llm');
    expect(SOURCE.assistantChat).toBe('assistant-chat');
    expect(SOURCE.ticketTriage).toBe('ticket-triage');
    expect(SOURCE.coaching).toBe('coaching');
  });

  it('jede ServiceDef.source ist eine SOURCE-Konstante', () => {
    const known = new Set<string>(Object.values(SOURCE));
    for (const s of KI_SERVICES) expect(known.has(s.source)).toBe(true);
  });
});
