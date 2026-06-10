// scripts/docs-gen/discover.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSources, resolveProvenance } from './discover.mjs';

test('resolveProvenance: plugin-cache path -> <plugin>@<version>', () => {
  const p = join(
    '/home/u/.claude/plugins/cache',
    'claude-plugins-official', 'superpowers', '5.1.0',
    'skills', 'brainstorming', 'SKILL.md'
  );
  const pluginsRoot = '/home/u/.claude/plugins/cache';
  assert.equal(resolveProvenance(p, pluginsRoot), 'superpowers@5.1.0');
});

test('resolveProvenance: plugin-cache agent path -> <plugin>@<version>', () => {
  const p = join(
    '/home/u/.claude/plugins/cache',
    'claude-plugins-official', 'pr-review-toolkit', '9c44119a480e-53b37853',
    'agents', 'reviewer.md'
  );
  const pluginsRoot = '/home/u/.claude/plugins/cache';
  assert.equal(resolveProvenance(p, pluginsRoot), 'pr-review-toolkit@9c44119a480e-53b37853');
});

test('resolveProvenance: repo path (outside pluginsRoot) -> repo', () => {
  const p = '/repo/.claude/skills/fleet-ops/SKILL.md';
  const pluginsRoot = '/home/u/.claude/plugins/cache';
  assert.equal(resolveProvenance(p, pluginsRoot), 'repo');
});

test('discoverSources: finds repo skill, repo agent, doc; excludes specs; missing pluginsRoot does not throw', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docsgen-discover-'));
  try {
    // repo skill
    await mkdir(join(root, '.claude/skills/fleet-ops'), { recursive: true });
    await writeFile(join(root, '.claude/skills/fleet-ops/SKILL.md'), '---\nname: fleet-ops\n---\n# Fleet Ops\n');
    // top-level skills index/overview markdown (not a per-skill SKILL.md) → renders as a doc page
    await writeFile(join(root, '.claude/skills/OVERVIEW.md'), '# Skills Overview\n');
    // one-level-deeper superpowers sub-skill
    await mkdir(join(root, '.claude/skills/superpowers/brainstorming'), { recursive: true });
    await writeFile(join(root, '.claude/skills/superpowers/brainstorming/SKILL.md'), '---\nname: brainstorming\n---\n# Brainstorm\n');
    // repo agent
    await mkdir(join(root, '.claude/agents'), { recursive: true });
    await writeFile(join(root, '.claude/agents/bachelorprojekt-db.md'), '---\nname: bachelorprojekt-db\n---\n# DB agent\n');
    // an included doc
    await mkdir(join(root, 'docs/website'), { recursive: true });
    await writeFile(join(root, 'docs/website/overview.md'), '# Overview\n');
    // an EXCLUDED doc under specs
    await mkdir(join(root, 'docs/superpowers/specs'), { recursive: true });
    await writeFile(join(root, 'docs/superpowers/specs/internal.md'), '# Internal spec\n');
    // an EXCLUDED doc under plans
    await mkdir(join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(join(root, 'docs/superpowers/plans/internal.md'), '# Internal plan\n');
    // an EXCLUDED generated repo map under agent-guide/maps (S3)
    await mkdir(join(root, 'docs/agent-guide/maps'), { recursive: true });
    await writeFile(join(root, 'docs/agent-guide/maps/goals-map.md'), '# Goals map\n');

    const sources = await discoverSources({
      repoRoot: root,
      pluginsRoot: join(root, 'does-not-exist-plugins-cache'),
      homeDir: root,
    });

    const paths = sources.map(s => s.sourcePath);
    // included
    assert.ok(paths.includes(join(root, '.claude/skills/fleet-ops/SKILL.md')), 'repo skill found');
    assert.ok(paths.includes(join(root, '.claude/skills/superpowers/brainstorming/SKILL.md')), 'superpowers sub-skill found');
    assert.ok(paths.includes(join(root, '.claude/agents/bachelorprojekt-db.md')), 'repo agent found');
    assert.ok(paths.includes(join(root, 'docs/website/overview.md')), 'doc found');
    // excluded
    assert.ok(!paths.includes(join(root, 'docs/superpowers/specs/internal.md')), 'specs excluded');
    assert.ok(!paths.includes(join(root, 'docs/superpowers/plans/internal.md')), 'plans excluded');
    assert.ok(!paths.includes(join(root, 'docs/agent-guide/maps/goals-map.md')), 'agent-guide maps excluded');

    // shapes & types
    const skill = sources.find(s => s.sourcePath.endsWith('fleet-ops/SKILL.md'));
    assert.equal(skill.type, 'skill');
    assert.equal(skill.provenance, 'repo');
    assert.equal(skill.name, 'fleet-ops');
    assert.equal(typeof skill.raw, 'string');
    assert.ok(skill.raw.includes('Fleet Ops'));

    const agent = sources.find(s => s.sourcePath.endsWith('bachelorprojekt-db.md'));
    assert.equal(agent.type, 'agent');
    assert.equal(agent.name, 'bachelorprojekt-db');

    const doc = sources.find(s => s.sourcePath.endsWith('docs/website/overview.md'));
    assert.equal(doc.type, 'doc');
    assert.equal(doc.provenance, 'repo');

    // top-level skills OVERVIEW.md renders as a doc page (not a skill)
    const overview = sources.find(s => s.sourcePath.endsWith('.claude/skills/OVERVIEW.md'));
    assert.ok(overview, 'skills OVERVIEW.md discovered');
    assert.equal(overview.type, 'doc');
    assert.equal(overview.name, 'OVERVIEW');
    assert.equal(overview.provenance, 'repo');

    // deterministic sort: by type then sourcePath
    const sortedCopy = [...sources].sort((a, b) =>
      a.type === b.type ? a.sourcePath.localeCompare(b.sourcePath) : a.type.localeCompare(b.type)
    );
    assert.deepEqual(sources.map(s => s.sourcePath), sortedCopy.map(s => s.sourcePath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discoverSources: plugin skills and agents get <plugin>@<version> provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docsgen-discover-plugins-'));
  try {
    const pluginsRoot = join(root, 'plugins-cache');
    // plugin skill
    await mkdir(join(pluginsRoot, 'claude-plugins-official/superpowers/5.1.0/skills/brainstorming'), { recursive: true });
    await writeFile(join(pluginsRoot, 'claude-plugins-official/superpowers/5.1.0/skills/brainstorming/SKILL.md'), '---\nname: brainstorming\n---\n# Brainstorm\n');
    // plugin agent
    await mkdir(join(pluginsRoot, 'claude-plugins-official/pr-review-toolkit/2.0.0/agents'), { recursive: true });
    await writeFile(join(pluginsRoot, 'claude-plugins-official/pr-review-toolkit/2.0.0/agents/reviewer.md'), '---\nname: reviewer\n---\n# Reviewer\n');

    const sources = await discoverSources({ repoRoot: root, pluginsRoot, homeDir: root });

    const pSkill = sources.find(s => s.sourcePath.endsWith('brainstorming/SKILL.md'));
    assert.ok(pSkill, 'plugin skill discovered');
    assert.equal(pSkill.type, 'skill');
    assert.equal(pSkill.provenance, 'superpowers@5.1.0');
    assert.equal(pSkill.name, 'brainstorming');

    const pAgent = sources.find(s => s.sourcePath.endsWith('reviewer.md'));
    assert.ok(pAgent, 'plugin agent discovered');
    assert.equal(pAgent.type, 'agent');
    assert.equal(pAgent.provenance, 'pr-review-toolkit@2.0.0');
    assert.equal(pAgent.name, 'reviewer');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
