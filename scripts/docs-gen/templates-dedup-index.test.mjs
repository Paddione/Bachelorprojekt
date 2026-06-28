// scripts/docs-gen/templates-dedup-index.test.mjs
// Tests for deduplicateSkills, categoryForSkill, renderAgentsIndex, renderDocsIndex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAgentsIndex,
  renderDocsIndex,
  deduplicateSkills,
  categoryForSkill,
} from './templates.mjs';

const pluginSkillPage = {
  slug: 'brainstorming',
  type: 'skill',
  provenance: 'superpowers@5.1.0',
  name: 'brainstorming',
  title: 'Brainstorming',
  description: 'Explore intent before building.',
  domain: 'general',
  bodyMarkdown: '',
  sourcePath: '/abs/plugins/cache/x/superpowers/5.1.0/skills/brainstorming/SKILL.md',
  outRelPath: 'skills/superpowers--brainstorming.html',
};

const makeSkillPage = (name, plugin, version, provenance) => ({
  slug: `${plugin}--${name}`,
  type: 'skill',
  provenance: provenance ?? `${plugin}@${version}`,
  name,
  title: name,
  description: '',
  domain: null,
  bodyMarkdown: '',
  sourcePath: `/x/${plugin}/${version}/skills/${name}/SKILL.md`,
  outRelPath: `skills/${plugin}--${name}.html`,
});

// ─── deduplicateSkills ────────────────────────────────────────────────────────

test('deduplicateSkills: keeps only the newest version per (plugin, name) pair', () => {
  const old = makeSkillPage('brainstorming', 'superpowers', '4.0.0');
  const newer = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const unrelated = makeSkillPage('tdd', 'superpowers', '5.1.0');
  const result = deduplicateSkills([old, newer, unrelated]);
  assert.equal(result.length, 2, 'one entry per unique skill name');
  assert.ok(result.some(p => p.provenance === 'superpowers@5.1.0' && p.name === 'brainstorming'),
    'newer version kept');
  assert.ok(!result.some(p => p.provenance === 'superpowers@4.0.0'),
    'older version removed');
});

test('deduplicateSkills: repo skills are kept as-is (no version conflict)', () => {
  const repoSkill = {
    slug: 'dev-flow-plan',
    type: 'skill',
    provenance: 'repo',
    name: 'dev-flow-plan',
    title: 'dev-flow-plan',
    description: '',
    domain: null,
    bodyMarkdown: '',
    sourcePath: '/x/.claude/skills/dev-flow-plan/SKILL.md',
    outRelPath: 'skills/dev-flow-plan.html',
  };
  const pluginSkill = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const result = deduplicateSkills([repoSkill, pluginSkill]);
  assert.equal(result.length, 2, 'both retained');
  assert.ok(result.some(p => p.provenance === 'repo'), 'repo skill kept');
});

test('deduplicateSkills: same skill from two different plugins both kept', () => {
  const a = makeSkillPage('using-git-worktrees', 'superpowers', '5.1.0');
  const b = makeSkillPage('using-git-worktrees', 'update-dependencies', '1.0.0');
  const result = deduplicateSkills([a, b]);
  assert.equal(result.length, 2, 'different plugin → different key → both kept');
});

// ─── categoryForSkill ─────────────────────────────────────────────────────────

test('categoryForSkill: maps known plugin names to correct categories', () => {
  const sup = { ...pluginSkillPage, provenance: 'superpowers@5.1.0', name: 'brainstorming' };
  assert.equal(categoryForSkill(sup), 'dev-workflow');

  const hf = { ...pluginSkillPage, provenance: 'huggingface-skills@1.0.3', name: 'hf-cli' };
  assert.equal(categoryForSkill(hf), 'ki-ml');

  const chrome = { ...pluginSkillPage, provenance: 'chrome-devtools-mcp@1.2.0', name: 'a11y-debugging' };
  assert.equal(categoryForSkill(chrome), 'browser');

  const pluginDev = { ...pluginSkillPage, provenance: 'plugin-dev@1.0.0', name: 'agent-development' };
  assert.equal(categoryForSkill(pluginDev), 'plugin-bau');

  const mcp = { ...pluginSkillPage, provenance: 'mcp-server-dev@1.0.0', name: 'build-mcp-server' };
  assert.equal(categoryForSkill(mcp), 'mcp-api');
});

test('categoryForSkill: mcp-cli from superpowers-lab → mcp-api despite plugin', () => {
  const mcpCli = { ...pluginSkillPage, provenance: 'superpowers-lab@1.0.0', name: 'mcp-cli' };
  assert.equal(categoryForSkill(mcpCli), 'mcp-api');
});

test('categoryForSkill: repo dev-flow skills → dev-workflow', () => {
  const dfp = { slug: 'dev-flow-plan', type: 'skill', provenance: 'repo', name: 'dev-flow-plan',
    title: 'dev-flow-plan', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/dev-flow-plan.html' };
  assert.equal(categoryForSkill(dfp), 'dev-workflow');
});

test('categoryForSkill: repo infra skills → bachelorprojekt-infra', () => {
  const sk = { slug: 'fleet-ops', type: 'skill', provenance: 'repo', name: 'fleet-ops',
    title: 'fleet-ops', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/fleet-ops.html' };
  assert.equal(categoryForSkill(sk), 'bachelorprojekt-infra');
});

test('categoryForSkill: unknown plugin → fallback claude-code', () => {
  const unknown = { ...pluginSkillPage, provenance: 'some-new-plugin@1.0.0', name: 'some-skill' };
  assert.equal(categoryForSkill(unknown), 'claude-code');
});

// ─── renderAgentsIndex ───────────────────────────────────────────────────────

const makeAgentPage = (name, provenance, domain) => ({
  slug: name,
  type: 'agent',
  provenance: provenance ?? 'repo',
  name,
  title: name,
  description: `Triggers: ${domain ?? 'general'} tasks.`,
  domain: domain ?? null,
  bodyMarkdown: '',
  sourcePath: `/x/.claude/agents/${name}.md`,
  outRelPath: `agents/${name}.html`,
});

test('renderAgentsIndex: Bachelorprojekt group appears first', () => {
  const bp = makeAgentPage('bachelorprojekt-infra', 'repo', 'infra');
  const other = makeAgentPage('feature-dev--code-architect', 'feature-dev@1.0.0', null);
  const html = renderAgentsIndex({ pages: [other, bp] });
  const bpIdx = html.indexOf('bachelorprojekt-infra');
  const otherIdx = html.indexOf('feature-dev--code-architect');
  assert.ok(bpIdx < otherIdx, 'bachelorprojekt agent appears before other agent');
});

test('renderAgentsIndex: shows trigger description on card', () => {
  const bp = makeAgentPage('bachelorprojekt-ops', 'repo', 'ops');
  const html = renderAgentsIndex({ pages: [bp] });
  assert.ok(html.includes('Triggers: ops tasks.'), 'description shown on card');
});

test('renderAgentsIndex: renders group headers', () => {
  const html = renderAgentsIndex({ pages: [
    makeAgentPage('bachelorprojekt-website', 'repo', 'website'),
    makeAgentPage('feature-dev--code-architect', 'feature-dev@1.0.0'),
  ]});
  assert.ok(html.includes('agent-group-header'), 'group headers present');
  assert.ok(html.includes('Bachelorprojekt'), 'Bachelorprojekt header present');
});

test('renderAgentsIndex: is a full HTML5 document with breadcrumbs', () => {
  const html = renderAgentsIndex({ pages: [makeAgentPage('bachelorprojekt-db', 'repo', 'db')] });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('Agents'), 'section title');
  assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
});

// ─── renderDocsIndex ─────────────────────────────────────────────────────────

const makeDocPage = (slug, description) => ({
  slug,
  type: 'doc',
  provenance: 'repo',
  name: slug,
  title: slug,
  description: description ?? '',
  domain: null,
  bodyMarkdown: '',
  sourcePath: `/x/docs/${slug}.md`,
  outRelPath: `${slug}.html`,
});

test('renderDocsIndex: renders group headers', () => {
  const pages = [
    makeDocPage('benutzerhandbuch', 'Anleitung für Endnutzer'),
    makeDocPage('architecture', 'Übersicht der Systemarchitektur'),
    makeDocPage('decision-log', ''),
  ];
  const html = renderDocsIndex({ pages });
  assert.ok(html.includes('doc-group-header'), 'group headers present');
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('Handbücher'), 'Handbücher group present');
});

test('renderDocsIndex: generates fallback description for empty description', () => {
  const page = makeDocPage('decision-log', '');
  const html = renderDocsIndex({ pages: [page] });
  assert.ok(html.includes('decision-log'), 'slug present in output');
  const emptyDescMatch = html.match(/<span class="section-card-desc"><\/span>/);
  assert.ok(!emptyDescMatch, 'empty description not rendered as empty span');
});

test('renderDocsIndex: is a full HTML5 document with correct breadcrumbs', () => {
  const html = renderDocsIndex({ pages: [makeDocPage('architecture', 'arch doc')] });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
  assert.ok(html.includes('Docs'), 'section title present');
});
