// scripts/factory/task-source.cjs — resolve the canonical task list for a change (CJS version).
// OpenSpec tasks.md is the only accepted source.
const { existsSync } = require('node:fs');

function resolveTaskSource(slug, repo, exists = existsSync) {
  const rel = `openspec/changes/${slug}/tasks.md`;
  if (exists(slug ? rel : '__none__')) return `${repo}/${rel}`;
  throw new Error(`No tasks.md found for slug '${slug}' in openspec/changes/${slug}/tasks.md`);
}

module.exports = { resolveTaskSource };
