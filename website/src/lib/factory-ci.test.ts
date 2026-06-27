import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeChecks, rollupConclusion, type CiCheck } from './factory-ci';

describe('normalizeChecks', () => {
  it('maps GitHub check-run fields onto the CiCheck shape', () => {
    const out = normalizeChecks([
      { name: 'build', status: 'completed', conclusion: 'success', details_url: 'd', html_url: 'h' },
    ]);
    expect(out[0]).toEqual({
      name: 'build',
      status: 'completed',
      conclusion: 'success',
      url: 'd',
    });
  });

  it('falls back to html_url when details_url is missing', () => {
    const out = normalizeChecks([
      { name: 'x', status: 'queued', conclusion: null, html_url: 'h' },
    ]);
    expect(out[0].url).toBe('h');
  });

  it('treats a missing conclusion as null', () => {
    const out = normalizeChecks([{ name: 'x', status: 'queued' }]);
    expect(out[0].conclusion).toBeNull();
  });

  it('returns an empty list when input is empty or null', () => {
    expect(normalizeChecks([])).toEqual([]);
    expect(normalizeChecks(null as unknown as never)).toEqual([]);
  });
});

describe('rollupConclusion', () => {
  const chk = (conclusion: string | null, status = 'completed'): CiCheck => ({
    name: 'n', status, conclusion, url: null,
  });

  it('returns null for an empty list of checks', () => {
    expect(rollupConclusion([])).toBeNull();
  });

  it('returns "pending" when any check is not yet completed', () => {
    expect(rollupConclusion([chk('success'), chk(null, 'queued')])).toBe('pending');
  });

  it('returns "failure" when a completed check has a non-success conclusion', () => {
    expect(rollupConclusion([chk('success'), chk('failure')])).toBe('failure');
  });

  it('returns "failure" for "cancelled" and "timed_out" and "action_required" conclusions', () => {
    expect(rollupConclusion([chk('cancelled')])).toBe('failure');
    expect(rollupConclusion([chk('timed_out')])).toBe('failure');
    expect(rollupConclusion([chk('action_required')])).toBe('failure');
  });

  it('returns "success" for success / neutral / skipped', () => {
    expect(rollupConclusion([chk('success')])).toBe('success');
    expect(rollupConclusion([chk('neutral')])).toBe('success');
    expect(rollupConclusion([chk('skipped')])).toBe('success');
    expect(rollupConclusion([chk('success'), chk('neutral'), chk('skipped')])).toBe('success');
  });
});

describe('fetchCiChecks (env / failure paths)', () => {
  const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });
  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
  });

  it('returns empty checks when no GitHub token is configured', async () => {
    const { fetchCiChecks } = await import('./factory-ci');
    const out = await fetchCiChecks(12345);
    expect(out).toEqual({ checks: [], rollup: null });
  });

  it('returns empty checks when the GitHub API returns a non-OK status', async () => {
    process.env.GITHUB_TOKEN = 'token';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    try {
      const { fetchCiChecks } = await import('./factory-ci');
      const out = await fetchCiChecks(12345);
      expect(out).toEqual({ checks: [], rollup: null });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
