import { describe, it, expect } from 'vitest';
import { KI_SERVICES, SOURCE, serviceByKey } from './ki-services';

describe('KI_SERVICES / SOURCE / serviceByKey', () => {
  it('exposes the canonical SOURCE constants', () => {
    expect(SOURCE.websiteLlm).toBe('website-llm');
    expect(SOURCE.assistantChat).toBe('assistant-chat');
    expect(SOURCE.ticketTriage).toBe('ticket-triage');
    expect(SOURCE.coaching).toBe('coaching');
  });

  it('exposes four service definitions', () => {
    expect(KI_SERVICES).toHaveLength(4);
  });

  it('every service has a matching source from SOURCE', () => {
    for (const s of KI_SERVICES) {
      const fromSource = Object.values(SOURCE).find((v) => v === s.source);
      expect(fromSource).toBeDefined();
    }
  });

  it('coaching is brandScoped; others are not', () => {
    expect(serviceByKey('coaching')?.brandScoped).toBe(true);
    expect(serviceByKey('website-llm')?.brandScoped).toBe(false);
    expect(serviceByKey('assistant-chat')?.brandScoped).toBe(false);
    expect(serviceByKey('ticket-triage')?.brandScoped).toBe(false);
  });

  it('finds a service by key', () => {
    expect(serviceByKey('website-llm')?.label).toBe('Website-LLM');
    expect(serviceByKey('coaching')?.tier).toBe('coaching');
  });

  it('returns undefined for an unknown key', () => {
    expect(serviceByKey('nope')).toBeUndefined();
  });
});
