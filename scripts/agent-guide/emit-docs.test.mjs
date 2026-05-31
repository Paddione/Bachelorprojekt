// scripts/agent-guide/emit-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRegistry } from './load.mjs';
import {
  slugForToolId,
  renderHeader,
  dangerBadge,
  toolLink,
  urlLink,
  renderZiele,
  renderWerkzeuge,
  renderBausteine,
} from './emit-docs.mjs';

// makeFixtureRegistry will be used by Tasks 3-5; defined here so later tasks can append test() blocks
function makeFixtureRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-guide-emit-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'taxonomy.yaml'), [
    '- id: safe',
    '  label_de: Sicher',
    '  emoji: "🟢"',
    '  meaning_de: Du kannst nichts kaputt machen.',
    '  doc_treatment: inline',
    '  enforcement_default: none',
    '- id: caution',
    '  label_de: Vorsicht',
    '  emoji: "🟡"',
    '  meaning_de: Schau genau hin.',
    '  doc_treatment: inline',
    '  enforcement_default: warn',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(dir, 'guardrails.yaml'), [
    '- id: G-ENV-EXPLICIT',
    '  name_de: Umgebung immer explizit angeben',
    '  rule_de: Gib ENV stets explizit an.',
    '  why_de: Sonst triffst du den falschen Cluster.',
    '  enforced_by: docs',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(dir, 'tools.yaml'), [
    '- id: dev-flow-plan',
    '  name_de: Plan erstellen',
    '  kind: skill',
    '  summary_de: Legt einen Plan an.',
    '  what_for_de: Beschreibt dein Ziel.',
    '  how_to_start_de: Sag der KI dein Ziel.',
    '  what_could_go_wrong_de: Nichts Schlimmes.',
    '  danger: safe',
    '  guardrails: [G-ENV-EXPLICIT]',
    '  related: [agent-website]',
    '  links: []',
    '- id: agent-website',
    '  name_de: Website-Agent',
    '  kind: agent',
    '  summary_de: Kümmert sich um die Website.',
    '  what_for_de: Frontend-Änderungen.',
    '  how_to_start_de: Beschreibe deine Änderung.',
    '  what_could_go_wrong_de: Layout kann brechen.',
    '  danger: caution',
    '  guardrails: []',
    '  related: []',
    '  links:',
    '    - { label: Website-Standards, url: "https://example.test/std" }',
    '- id: task-oracle',
    '  name_de: Task-Orakel',
    '  kind: task',
    '  summary_de: Findet den richtigen Task.',
    '  what_for_de: Übersetzt Wünsche in Tasks.',
    '  how_to_start_de: Beschreibe dein Ziel.',
    '  what_could_go_wrong_de: Nichts.',
    '  danger: safe',
    '  guardrails: []',
    '  related: []',
    '  links:',
    '    - { label: Quelle, url: "https://example.test/oracle" }',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text der Website ändern"',
    '  when_de: Wenn du einen Absatz anpassen willst.',
    '  flow:',
    '    - tool: dev-flow-plan',
    '      note_de: beschreibt der KI dein Ziel',
    '    - tool: agent-website',
    '      note_de: setzt die Änderung um',
    '    - tool: task-oracle',
    '      note_de: findet den passenden Task',
    '  example_prompt_de: "Ändere den Preis von 90 auf 120."',
    '  danger: safe',
    '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []',
    '- id: fix-a-bug',
    '  title_de: "Ich will einen Fehler beheben"',
    '  when_de: Wenn etwas nicht funktioniert.',
    '  flow:',
    '    - tool: dev-flow-plan',
    '      note_de: beschreibt das Problem',
    '  example_prompt_de: "Behebe den Fehler auf der Startseite."',
    '  danger: caution',
    '  guardrails: []',
    '  related: [change-website-text]',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(dir, 'components.yaml'), [
    '- slug: keycloak',
    '  kind: software',
    '  name: Keycloak',
    '  emoji: "🔐"',
    '  summary_de: Anmeldung und Single Sign-On.',
    '  what_for_de: Zentrale Anmeldung für alle Dienste.',
    '  placeholder_en: Login provider',
    '  sensitivity: caution',
    '  url: https://www.keycloak.org',
    '  links: []',
    '- slug: gpu-host',
    '  kind: hardware',
    '  name: GPU-Host',
    '  emoji: "🖥️"',
    '  summary_de: Rechnet KI-Modelle lokal.',
    '  what_for_de: Lokale Embeddings und Chat.',
    '  placeholder_en: GPU box',
    '  sensitivity: safe',
    '  url: ""',
    '  links: []',
    '',
  ].join('\n'), 'utf8');
  return dir;
}

test('slugForToolId: spine skills keep their id (discoverable SKILL.md slug)', () => {
  for (const id of ['dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e']) {
    assert.equal(slugForToolId(id), id);
  }
});

test('slugForToolId: agents map agent-<x> -> bachelorprojekt-<x>', () => {
  assert.equal(slugForToolId('agent-website'), 'bachelorprojekt-website');
  assert.equal(slugForToolId('agent-ops'), 'bachelorprojekt-ops');
  assert.equal(slugForToolId('agent-infra'), 'bachelorprojekt-infra');
  assert.equal(slugForToolId('agent-test'), 'bachelorprojekt-test');
  assert.equal(slugForToolId('agent-db'), 'bachelorprojekt-db');
  assert.equal(slugForToolId('agent-security'), 'bachelorprojekt-security');
});

test('slugForToolId: task-oracle and unknown ids return null (no wikilink)', () => {
  assert.equal(slugForToolId('task-oracle'), null);
  assert.equal(slugForToolId('something-else'), null);
});

test('renderHeader: line 1 is exactly --- and frontmatter carries the contract keys', () => {
  const header = renderHeader('Ziele — Was will ich tun?', 'Ziele — „Ich will …"');
  const lines = header.split('\n');
  assert.equal(lines[0], '---', 'line 1 is the opening fence');
  assert.ok(header.includes('domain: general'), 'declares domain: general');
  assert.ok(
    header.includes('generated_by: scripts/agent-guide/emit-docs.mjs'),
    'records generated_by',
  );
  // closing fence then the DO-NOT-EDIT comment as the first body line.
  const fenceIdxs = lines.map((l, i) => (l === '---' ? i : -1)).filter((i) => i >= 0);
  assert.equal(fenceIdxs.length, 2, 'exactly two fences');
  const firstBodyLine = lines[fenceIdxs[1] + 1];
  assert.equal(
    firstBodyLine,
    '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->',
    'first body line is the DO-NOT-EDIT comment',
  );
});

test('dangerBadge: renders emoji + bold label from the taxonomy via tierFor', () => {
  const dir = makeFixtureRegistry();
  try {
    loadRegistry(dir); // last-load-wins: dangerBadge reads this registry
    assert.equal(dangerBadge('safe'), '🟢 **Sicher**');
    assert.equal(dangerBadge('caution'), '🟡 **Vorsicht**');
    // unknown danger degrades to a visible marker, never a raw blank.
    assert.equal(dangerBadge('mystery'), '⚪ **mystery**');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('toolLink: wikilink for discoverable ids, plain link for task-oracle', () => {
  const dir = makeFixtureRegistry();
  try {
    loadRegistry(dir);
    assert.equal(toolLink('dev-flow-plan'), '[[dev-flow-plan]]');
    assert.equal(toolLink('agent-website'), '[[bachelorprojekt-website]]');
    // task-oracle has no discoverable page → plain [label](url) from its links.
    assert.equal(toolLink('task-oracle'), '[Task-Orakel](https://example.test/oracle)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('urlLink: renders a markdown link, empty string for blank url', () => {
  assert.equal(urlLink('Keycloak', 'https://www.keycloak.org'), '[Keycloak](https://www.keycloak.org)');
  assert.equal(urlLink('Nichts', ''), '');
});

/** The set of slugs the docs generator WILL discover (for membership checks). */
const DISCOVERABLE = new Set([
  'dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e',
  'bachelorprojekt-website', 'bachelorprojekt-ops', 'bachelorprojekt-infra',
  'bachelorprojekt-test', 'bachelorprojekt-db', 'bachelorprojekt-security',
  '00-anleitung', '10-ziele', '20-werkzeuge', '30-bausteine',
]);

/** Pull every [[target]] (ignoring |alias and #anchor) out of a markdown string. */
function wikilinkTargets(md) {
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  const out = [];
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1].trim());
  return out;
}

test('renderZiele: fence-first, resolves ids, every wikilink target is discoverable', () => {
  const dir = makeFixtureRegistry();
  try {
    const reg = loadRegistry(dir);
    const md = renderZiele(reg);
    assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
    assert.ok(md.includes('## Ich will den Text der Website ändern'), 'goal H2 present');
    assert.ok(md.includes('🟢 **Sicher**'), 'danger badge resolved');
    assert.ok(md.includes('Umgebung immer explizit angeben'), 'guardrail name resolved');
    // flow tools: dev-flow-plan → wikilink, agent-website → mapped wikilink, task-oracle → plain link
    assert.ok(md.includes('[[dev-flow-plan]]'), 'spine skill wikilinked');
    assert.ok(md.includes('[[bachelorprojekt-website]]'), 'agent id mapped + wikilinked');
    assert.ok(md.includes('[Task-Orakel](https://example.test/oracle)'), 'task-oracle is a plain link');
    assert.ok(!md.includes('[[task-oracle]]'), 'task-oracle is NEVER a wikilink');
    assert.ok(!md.includes('[[agent-website]]'), 'raw agent id is NEVER emitted as a wikilink');
    // the verbatim prompt lives in a fenced text block (Copy button hook, spec §6)
    assert.ok(md.includes('```text\nÄndere den Preis von 90 auf 120.\n```'), 'prompt fenced');
    for (const t of wikilinkTargets(md)) {
      assert.ok(DISCOVERABLE.has(t), `wikilink [[${t}]] is discoverable`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderWerkzeuge: cards for every tool; task-oracle stays a plain link', () => {
  const dir = makeFixtureRegistry();
  try {
    const reg = loadRegistry(dir);
    const md = renderWerkzeuge(reg);
    assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
    assert.ok(md.includes('## Plan erstellen'), 'tool card present');
    assert.ok(md.includes('## Task-Orakel'), 'task-oracle card present');
    assert.ok(md.includes('Skill'), 'kind pill rendered');
    assert.ok(md.includes('Nichts Schlimmes.'), 'what_could_go_wrong rendered');
    // related on dev-flow-plan points to agent-website → mapped wikilink
    assert.ok(md.includes('[[bachelorprojekt-website]]'), 'related agent mapped');
    for (const t of wikilinkTargets(md)) {
      assert.ok(DISCOVERABLE.has(t), `wikilink [[${t}]] is discoverable`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderBausteine: software-first then hardware; sensitivity badge resolved', () => {
  const dir = makeFixtureRegistry();
  try {
    const reg = loadRegistry(dir);
    const md = renderBausteine(reg);
    assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
    assert.ok(md.includes('## 🔐 Keycloak'), 'software component header');
    assert.ok(md.includes('## 🖥️ GPU-Host'), 'hardware component header');
    assert.ok(md.includes('🟡 **Vorsicht**'), 'sensitivity badge resolved');
    // software before hardware regardless of file order
    assert.ok(md.indexOf('Keycloak') < md.indexOf('GPU-Host'), 'software listed first');
    // url rendered as a plain link; blank url omitted (GPU-Host has url: "")
    assert.ok(md.includes('[Keycloak](https://www.keycloak.org)'), 'component url link');
    // only wikilink is the back-reference to 00-anleitung in the header
    assert.deepEqual(wikilinkTargets(md), ['00-anleitung'], 'only back-link to anleitung');
    for (const t of wikilinkTargets(md)) {
      assert.ok(DISCOVERABLE.has(t), `wikilink [[${t}]] is discoverable`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

export { makeFixtureRegistry };
