import { describe, it, expect } from 'vitest';
import { isDeployDrift } from './ingest-e2e';

// T002202. The BATS spec pins that the gate EXISTS; these pin what it DOES.
// The distinction matters here more than usual: T002199 slipped through
// because the gate was present but checked the wrong thing.
describe('isDeployDrift', () => {
  const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const SHA_B = 'ffeeddccbbaa99887766554433221100aabbccdd';

  it('reports no drift when both sides are the same commit', () => {
    expect(isDeployDrift(SHA_A, SHA_A)).toBe(false);
  });

  it('reports drift when the commits differ', () => {
    expect(isDeployDrift(SHA_A, SHA_B)).toBe(true);
  });

  // ── fail closed ───────────────────────────────────────────────────────
  // Each of these is a state where we cannot prove the run measured the code
  // under test. Waving them through would defeat the gate at precisely the
  // moment it is needed.

  it('treats a deployed "unknown" as drift', () => {
    expect(isDeployDrift(SHA_A, 'unknown')).toBe(true);
  });

  it('treats a tested "unknown" as drift', () => {
    expect(isDeployDrift('unknown', SHA_A)).toBe(true);
  });

  it('treats a missing tested SHA as drift', () => {
    expect(isDeployDrift(undefined, SHA_A)).toBe(true);
    expect(isDeployDrift(null, SHA_A)).toBe(true);
  });

  it('treats a missing deployed SHA as drift', () => {
    expect(isDeployDrift(SHA_A, undefined)).toBe(true);
    expect(isDeployDrift(SHA_A, null)).toBe(true);
  });

  it('treats empty strings as drift', () => {
    expect(isDeployDrift('', '')).toBe(true);
    expect(isDeployDrift('   ', SHA_A)).toBe(true);
  });

  // ── normalisation ─────────────────────────────────────────────────────

  it('ignores case differences', () => {
    expect(isDeployDrift(SHA_A.toUpperCase(), SHA_A)).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isDeployDrift(`${SHA_A}\n`, ` ${SHA_A} `)).toBe(false);
  });

  // ── no prefix matching ────────────────────────────────────────────────

  it('does not accept a short SHA as matching its long form', () => {
    // Tolerating this would hide the failure mode "the SHA got truncated
    // somewhere in the chain" — which is itself a chain defect worth seeing.
    expect(isDeployDrift(SHA_A.slice(0, 7), SHA_A)).toBe(true);
  });
});
