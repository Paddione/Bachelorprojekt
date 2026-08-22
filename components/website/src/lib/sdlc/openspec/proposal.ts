import * as fs from 'fs/promises';
import * as path from 'path';
import { findRepoRoot } from '../repo-root';

const REPO_ROOT = findRepoRoot();

export function proposalPath(slug: string): string {
  return path.join(REPO_ROOT, 'openspec', 'changes', slug, 'proposal.md');
}

export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

export async function readProposal(slug: string): Promise<string | null> {
  if (!isValidSlug(slug)) {
    throw new Error('Invalid proposal slug');
  }
  const filePath = proposalPath(slug);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeProposal(slug: string, content: string): Promise<void> {
  if (!isValidSlug(slug)) {
    throw new Error('Invalid proposal slug');
  }
  const filePath = proposalPath(slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}
