// scripts/docs-gen/build-smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBuild } from '../build-docs.mjs';

/** Build a minimal fixture repo tree and return its root. */
function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'docs-gen-smoke-'));

  // Minimal CLAUDE.md with a routing table the orchestrator reads for domains/edges.
  writeFileSync(join(root, 'CLAUDE.md'), [
    '# CLAUDE.md',
    '',
    '## Agent Routing',
    '',
    '| Signals | Agent |',
    '|---------|-------|',
    '| `website/`, Astro, component | `bachelorprojekt-website` |',
    '| pod, logs, kubectl, status | `bachelorprojekt-ops` |',
    '',
  ].join('\n'), 'utf8');

  // Repo skills: .claude/skills/<name>/SKILL.md
  mkdirSync(join(root, '.claude', 'skills', 'alpha-skill'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'alpha-skill', 'SKILL.md'), [
    '---',
    'name: alpha-skill',
    'description: First fixture skill.',
    '---',
    '# Alpha Skill',
    '',
    'Alpha body. See [[beta-skill]] for more.',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(root, '.claude', 'skills', 'beta-skill'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'beta-skill', 'SKILL.md'), [
    '---',
    'name: beta-skill',
    'description: Second fixture skill.',
    '---',
    '# Beta Skill',
    '',
    'Beta body.',
    '',
  ].join('\n'), 'utf8');

  // Repo agent: .claude/agents/<name>.md with a block-scalar description.
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'bachelorprojekt-ops.md'), [
    '---',
    'name: bachelorprojekt-ops',
    'description: >',
    '  Ops agent for pods, logs, status, restarts and',
    '  general cluster health questions.',
    '---',
    '# Ops Agent',
    '',
    'Ops agent body.',
    '',
  ].join('\n'), 'utf8');

  // Docs markdown: docs/**/*.md
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'intro.md'), [
    '# Intro',
    '',
    'Intro doc body with a mermaid diagram.',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
  ].join('\n'), 'utf8');

  // Legacy HTML: docs/legacy-html/<slug>.html
  mkdirSync(join(root, 'docs', 'legacy-html'), { recursive: true });
  writeFileSync(join(root, 'docs', 'legacy-html', 'architecture.html'), [
    '<!DOCTYPE html>',
    '<html lang="de"><head><title>Architecture — Workspace MVP</title></head>',
    '<body><main class="content"><h1>Architecture</h1><p>Legacy architecture page.</p></main></body>',
    '</html>',
  ].join('\n'), 'utf8');

  return root;
}

test('runBuild: produces the static output contract from a fixture repo', async () => {
  const repoRoot = makeFixtureRepo();
  const outDir = mkdtempSync(join(tmpdir(), 'docs-gen-out-'));
  const pluginsRoot = join(repoRoot, '__no_plugins_here__'); // absent → plugin sources skipped

  try {
    const report = await runBuild({ repoRoot, pluginsRoot, outDir });

    // Landing + section indexes.
    assert.ok(existsSync(join(outDir, 'index.html')), 'index.html written');
    assert.ok(existsSync(join(outDir, 'skills.html')), 'skills.html written');
    assert.ok(existsSync(join(outDir, 'agents.html')), 'agents.html written');
    assert.ok(existsSync(join(outDir, 'docs.html')), 'docs.html written');

    // At least one skill page and one agent page (under their subdirs).
    const skillPages = readdirSync(join(outDir, 'skills')).filter((f) => f.endsWith('.html'));
    assert.ok(skillPages.length >= 1, 'at least one skills/<x>.html written');
    const agentPages = readdirSync(join(outDir, 'agents')).filter((f) => f.endsWith('.html'));
    assert.ok(agentPages.length >= 1, 'at least one agents/<x>.html written');

    // Legacy rewrapped page keeps its bare slug URL.
    assert.ok(existsSync(join(outDir, 'architecture.html')), 'legacy architecture.html written at bare slug');

    // Assets.
    assert.ok(existsSync(join(outDir, 'style.css')), 'style.css written');
    assert.ok(existsSync(join(outDir, 'app.js')), 'app.js written');

    // search.json shape.
    assert.ok(existsSync(join(outDir, 'search.json')), 'search.json written');
    const idx = JSON.parse(readFileSync(join(outDir, 'search.json'), 'utf8'));
    assert.ok(Array.isArray(idx), 'search.json is an array');
    assert.ok(idx.length >= 1, 'search.json is non-empty');
    for (const entry of idx) {
      assert.equal(typeof entry.slug, 'string', 'entry.slug is a string');
      assert.equal(typeof entry.title, 'string', 'entry.title is a string');
      assert.equal(typeof entry.excerpt, 'string', 'entry.excerpt is a string');
    }

    // Build report is returned with counts.
    assert.equal(typeof report, 'object', 'report returned');
    assert.equal(typeof report.counts, 'object', 'report.counts present');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
