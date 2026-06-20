import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isValidSlug, readProposal, writeProposal } from './proposal';

describe('proposal lib', () => {
  const testSlug = 'cockpit-dor-inline-editor';

  afterEach(async () => {
    // Clean up test file if it was created
    const repoRoot = process.env.OPENSPEC_REPO_ROOT ?? path.resolve(process.cwd(), '../../..');
    const testPath = path.join(repoRoot, 'openspec', 'changes', 'test-slug', 'proposal.md');
    await fs.rm(testPath, { force: true }).catch(() => {});
    await fs.rm(path.dirname(testPath), { force: true }).catch(() => {});
  });

  it('isValidSlug validates correctly', () => {
    expect(isValidSlug('cockpit-dor-inline-editor')).toBe(true);
    expect(isValidSlug('../etc/passwd')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('readProposal returns null when file does not exist', async () => {
    const content = await readProposal('does-not-exist');
    expect(content).toBeNull();
  });

  it('writeProposal writes the file and readProposal reads it', async () => {
    await writeProposal('test-slug', 'inhalt');
    const content = await readProposal('test-slug');
    expect(content).toBe('inhalt');
  });
});
