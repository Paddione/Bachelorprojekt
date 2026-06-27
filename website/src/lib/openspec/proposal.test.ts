import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isValidSlug, readProposal, writeProposal, proposalPath } from './proposal';

describe('proposal lib', () => {
  const testSlug = 'cockpit-dor-inline-editor';

  afterEach(async () => {
    // Clean up test file if it was created
    const testPath = proposalPath('test-slug');
    await fs.rm(testPath, { force: true }).catch(() => {});
    await fs.rm(path.dirname(testPath), { recursive: true, force: true }).catch(() => {});
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
