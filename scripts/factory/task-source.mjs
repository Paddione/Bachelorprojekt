// scripts/factory/task-source.mjs — resolve the canonical task list for a change.
// OpenSpec tasks.md is the only accepted source.
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
  throw new Error(`No tasks.md found for slug '${slug}' in openspec/changes/${slug}/tasks.md`);
}
