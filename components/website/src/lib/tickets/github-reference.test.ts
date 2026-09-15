import { describe, expect, it } from 'vitest';

describe('GitHub reference contract', () => {
  const defaultRepository = { owner: 'Paddione', repository: 'Bachelorprojekt' };

  it('parses and formats issue, PR, qualified and branch references', async () => {
    const api = await import('./github-reference.ts');
    const issue = api.parseGitHubReference(' I#123 ', { defaultRepository });
    const pr = api.parseGitHubReference('PR#124', { defaultRepository });
    const qualified = api.parseGitHubReference('other/repo#123', { qualifiedKind: 'issue' });
    expect(issue).toEqual({ kind: 'issue', number: 123, ...defaultRepository });
    expect(pr).toEqual({ kind: 'pull_request', number: 124, ...defaultRepository });
    expect(qualified).toEqual({ kind: 'issue', number: 123, owner: 'other', repository: 'repo' });
    expect(api.formatGitHubReference(issue, { defaultRepository })).toBe('I#123');
    expect(api.formatGitHubReference(pr, { defaultRepository })).toBe('PR#124');
    expect(api.formatGitHubReference(qualified, { defaultRepository })).toBe('other/repo#123');
    expect(api.formatBranchIssueToken(api.parseGitHubReference('I5588', { defaultRepository }))).toBe('I5588');
  });

  it('rejects ambiguity and unsafe numeric forms', async () => {
    const api = await import('./github-reference.ts');
    for (const input of ['5588', 'I#0', 'I#-1', 'I#1.5', '+1', 'owner/#1', '#1', 'BUG#1', 'I#1 2']) {
      expect(() => api.parseGitHubReference(input, { defaultRepository })).toThrow(api.GitHubReferenceError);
    }
    expect(() => api.parseGitHubReference('I#5588')).toThrow(/default repository/i);
    expect(() => api.parseGitHubReference('owner/repo#5588')).toThrow(/kind/i);
  });
});
