// scripts/factory/task-source.cjs — resolve the canonical task list for a change (CJS version).
const { existsSync } = require('node:fs');

function resolveTaskSource(slug, repo, exists = existsSync) {
  const rel = `openspec/changes/${slug}/tasks.md`;
  if (exists(slug ? rel : '__none__')) return `${repo}/${rel}`;
  return `${repo}/docs/superpowers/plans/${slug}.md`;
}

module.exports = { resolveTaskSource };
