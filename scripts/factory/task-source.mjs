// scripts/factory/task-source.mjs — resolve the canonical task list for a change.
// Prefers the OpenSpec-format tasks.md; falls back to the legacy plan path.
// Pure: the filesystem check is injected so it stays unit-testable.
import { existsSync } from 'node:fs';

/**
 * @param {string} slug
 * @param {string} repo  absolute repo root
 * @param {(p:string)=>boolean} [exists] injectable for tests
 * @returns {string} absolute path to the task source
 */
export function resolveTaskSource(slug, repo, exists = existsSync) {
  const rel = `openspec/changes/${slug}/tasks.md`;
  if (exists(slug ? rel : '__none__')) return `${repo}/${rel}`;
  return `${repo}/docs/superpowers/plans/${slug}.md`;
}
