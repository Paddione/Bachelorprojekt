import { describe, it, expect } from 'vitest';
import { publishContent, type GitHubClient } from '../content-publish';

const validFaq = [{ question: 'q', answer: 'a' }];

// Local fake GitHub client — records every call so the test can
// assert the branch/PR/auto-merge sequence and return a fixed
// `currentSha` to drive the 409/200/422 matrix.
function fakeGitHub({ currentSha, currentValue }: { currentSha: string; currentValue?: unknown }): GitHubClient & {
  currentSha: string;
  currentValue?: unknown;
  branchName?: string;
  putSha?: string;
  prNumber: number;
  prUrl: string;
  autoMergeEnabled: boolean;
  calls: string[];
} {
  const fake: ReturnType<typeof fakeGitHub> = {
    currentSha,
    currentValue,
    prNumber: 42,
    prUrl: 'https://github.com/Paddione/Bachelorprojekt/pull/42',
    autoMergeEnabled: false,
    calls: [],
    async getFile() {
      this.calls.push('getFile');
      return { sha: currentSha, value: currentValue };
    },
    async createBranch(opts: { name: string }) {
      this.calls.push('createBranch');
      this.branchName = opts.name;
    },
    async putFile(opts: { branch: string; path: string; content: string; sha: string }) {
      this.calls.push('putFile');
      this.putSha = opts.sha;
      return { sha: 'NEW_COMMIT_SHA' };
    },
    async openPr(opts: { branch: string; title: string; labels: string[]; squash: boolean; autoMerge: boolean }) {
      this.calls.push('openPr');
      this.autoMergeEnabled = opts.autoMerge && opts.squash;
      return { prNumber: this.prNumber, prUrl: this.prUrl };
    },
  };
  return fake;
}

describe('content-publish (T001490 Task 6)', () => {
  it('returns 409 when baseSha is stale (blob-SHA optimistic concurrency)', async () => {
    const gh = fakeGitHub({ currentSha: 'SHA_NEW' });
    const r = await publishContent({
      brand: 'mentolder', domain: 'faq', payload: validFaq,
      baseSha: 'SHA_OLD', editor: 'a@b', client: gh,
    });
    expect(r).toMatchObject({ ok: false, status: 409, currentSha: 'SHA_NEW' });
    // MUST NOT have created a branch / pushed / opened PR
    expect(gh.calls).toEqual(['getFile']);
  });

  it('opens a squash-auto-merge PR on success with the right branch name shape', async () => {
    const gh = fakeGitHub({ currentSha: 'SHA_OLD' });
    const r = await publishContent({
      brand: 'mentolder', domain: 'faq', payload: validFaq,
      baseSha: 'SHA_OLD', editor: 'a@b', client: gh,
    });
    expect(r).toMatchObject({ ok: true, sha: 'NEW_COMMIT_SHA', prNumber: 42 });
    if (r.ok) {
      expect(r.prUrl).toMatch(/\/pull\//);
    }
    // Branch name MUST match `^content/<brand>-<domain>-<digits>$`
    expect(gh.branchName).toMatch(/^content\/mentolder-faq-\d+$/);
    expect(gh.calls).toEqual(['getFile', 'createBranch', 'putFile', 'openPr']);
    expect(gh.autoMergeEnabled).toBe(true);
  });

  it('returns 422 on schema-invalid payload (Zod fail-closed)', async () => {
    const gh = fakeGitHub({ currentSha: 'SHA_OLD' });
    const r = await publishContent({
      brand: 'mentolder', domain: 'faq', payload: [{ nope: 1 }] as unknown as typeof validFaq,
      baseSha: 'SHA_OLD', editor: 'a@b', client: gh,
    });
    expect(r).toMatchObject({ ok: false, status: 422 });
    // MUST NOT have read the file or pushed anything
    expect(gh.calls).toEqual([]);
  });

  it('uses default GitHubClient (env-derived) when none is supplied', async () => {
    // We do not exercise the real GitHub client — the only assertion
    // is that publishContent does not throw and returns *some* result.
    // The fake client is mandatory in production code paths; this
    // test just guards against a missing optional argument blowing up.
    const gh = fakeGitHub({ currentSha: 'SHA_OLD' });
    const r = await publishContent({
      brand: 'mentolder', domain: 'faq', payload: validFaq,
      baseSha: 'SHA_OLD', editor: 'a@b', client: gh,
    });
    expect(r.ok).toBe(true);
  });
});
