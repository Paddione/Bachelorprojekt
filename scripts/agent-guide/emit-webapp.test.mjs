// scripts/agent-guide/emit-webapp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWebappData } from './emit-webapp.mjs';

/** Write a minimal but complete registry into a fresh temp dir; return its path. */
function fixtureRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'ag-fixture-'));
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, 'taxonomy.yaml'), [
    '- { id: safe,      label_de: "Sicher",        emoji: "🟢", meaning_de: "Bedenkenlos selbst.",      doc_treatment: none,   enforcement_default: none }',
    '- { id: caution,   label_de: "Vorsicht",      emoji: "🟡", meaning_de: "Lies kurz mit.",           doc_treatment: note,   enforcement_default: none }',
    '- { id: assisted,  label_de: "Nur mit Hilfe", emoji: "🟠", meaning_de: "Frag den Agenten.",        doc_treatment: warn,   enforcement_default: confirm }',
    '- { id: forbidden, label_de: "Niemals allein",emoji: "🔴", meaning_de: "Niemals ohne Rücksprache.",doc_treatment: danger, enforcement_default: block }',
    '',
  ].join('\n'));

  writeFileSync(join(dir, 'guardrails.yaml'), [
    '- { id: G-ENV-EXPLICIT, name_de: "Umgebung angeben", rule_de: "Immer ENV nennen.", why_de: "Sonst falscher Cluster.", enforced_by: ci }',
    '',
  ].join('\n'));

  writeFileSync(join(dir, 'tools.yaml'), [
    '- id: agent-website',
    '  name_de: "Website-Agent"',
    '  kind: agent',
    '  summary_de: "Ändert Website-Texte."',
    '  what_for_de: "Pflegt Inhalte."',
    '  how_to_start_de: "Sag, welche Seite."',
    '  what_could_go_wrong_de: "Falsche Seite."',
    '  danger: safe',
    '  guardrails: []',
    '  related: [dev-flow-plan]',
    '  links: []',
    '- id: dev-flow-plan',
    '  name_de: "Entwicklungs-Plan starten"',
    '  kind: skill',
    '  summary_de: "Plant eine Änderung."',
    '  what_for_de: "Wählt den Pfad."',
    '  how_to_start_de: "Beschreibe es."',
    '  what_could_go_wrong_de: "Nichts Gefährliches."',
    '  danger: safe',
    '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []',
    '  links: []',
    '',
  ].join('\n'));

  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text auf der Website ändern"',
    '  when_de: "Wenn etwas Falsches dasteht."',
    '  danger: safe',
    '  flow:',
    '    - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
    '  example_prompt_de: "Ändere die Überschrift."',
    '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []',
    '',
  ].join('\n'));

  writeFileSync(join(dir, 'components.yaml'), [
    '- { slug: keycloak, kind: software, name: "Keycloak", emoji: "🔐", summary_de: "Zentrale Anmeldung (SSO).", what_for_de: "SSO für alle Dienste.", placeholder_en: "x", sensitivity: assisted, url: "https://auth.example", links: [] }',
    '- { slug: mailpit,  kind: software, name: "Mailpit",  emoji: "📭", summary_de: "Fängt E-Mails ab (Test).", what_for_de: "Test-Postfach.",      placeholder_en: "x", sensitivity: safe,     url: "https://mail.example",  links: [] }',
    '',
  ].join('\n'));

  return dir;
}

// Shared with Task 2 (do not duplicate the fixture there).
globalThis.__agFixtureRegistry = fixtureRegistry;

test('buildWebappData: emits all four taxonomy tiers each with a non-empty color', () => {
  const data = buildWebappData(fixtureRegistry());
  assert.equal(data.taxonomy.length, 4);
  const ids = data.taxonomy.map(t => t.id);
  assert.deepEqual(ids, ['safe', 'caution', 'assisted', 'forbidden']);
  for (const tier of data.taxonomy) {
    assert.match(tier.color, /^#[0-9a-fA-F]{6}$/, `tier ${tier.id} must carry a 6-digit hex color`);
    assert.ok(tier.label_de && tier.emoji && tier.meaning_de, `tier ${tier.id} keeps label/emoji/meaning`);
  }
  // doc_treatment / enforcement_default are NOT rendered → must be dropped
  assert.ok(!('doc_treatment' in data.taxonomy[0]));
  assert.ok(!('enforcement_default' in data.taxonomy[0]));
});

test('buildWebappData: keys components by slug with only the §6.1 fields', () => {
  const data = buildWebappData(fixtureRegistry());
  assert.ok(data.components.keycloak, 'components is an object keyed by slug');
  const kc = data.components.keycloak;
  assert.deepEqual(Object.keys(kc).sort(),
    ['emoji', 'kind', 'name', 'sensitivity', 'slug', 'summary_de', 'url']);
  assert.equal(kc.sensitivity, 'assisted');
  // what_for_de / placeholder_en / links are NOT needed by S2 → dropped
  assert.ok(!('what_for_de' in kc));
  assert.ok(!('placeholder_en' in kc));
  assert.ok(!('links' in kc));
});

test('buildWebappData: carries the contract metadata fields', () => {
  const data = buildWebappData(fixtureRegistry());
  assert.equal(data.$schema, 'agent-guide.generated/v1');
  assert.equal(data.generatedFrom, 'docs/agent-guide/registry');
});

// Task 2 tests — failing until denormalization is added

const fixtureRegistry2 = globalThis.__agFixtureRegistry;

test('buildWebappData: pre-resolves every goal flow step tool name', () => {
  const data = buildWebappData(fixtureRegistry2());
  const goal = data.goals.find(g => g.id === 'change-website-text');
  assert.ok(goal, 'fixture goal present');
  for (const step of goal.flow) {
    assert.ok(step.tool_name_de, `flow step for tool "${step.tool}" must carry tool_name_de`);
  }
  assert.equal(goal.flow[0].tool, 'agent-website');
  assert.equal(goal.flow[0].tool_name_de, 'Website-Agent');
  assert.equal(goal.flow[0].note_de, 'Sag ihm, welche Seite.');
});

test('buildWebappData: resolves guardrails to {id,name_de,rule_de,why_de} on goals and tools', () => {
  const data = buildWebappData(fixtureRegistry2());

  const goal = data.goals.find(g => g.id === 'change-website-text');
  assert.equal(goal.guardrails.length, 1);
  assert.deepEqual(Object.keys(goal.guardrails[0]).sort(),
    ['id', 'name_de', 'rule_de', 'why_de']);
  assert.equal(goal.guardrails[0].id, 'G-ENV-EXPLICIT');
  assert.equal(goal.guardrails[0].rule_de, 'Immer ENV nennen.');
  assert.equal(goal.guardrails[0].why_de, 'Sonst falscher Cluster.');

  const tool = data.tools.find(t => t.id === 'dev-flow-plan');
  assert.equal(tool.guardrails.length, 1);
  assert.equal(tool.guardrails[0].name_de, 'Umgebung angeben');
});

test('buildWebappData: every tool carries a German kind label (kind_de)', () => {
  const data = buildWebappData(fixtureRegistry2());
  const byId = Object.fromEntries(data.tools.map(t => [t.id, t]));
  assert.equal(byId['agent-website'].kind_de, 'Agent');
  assert.equal(byId['dev-flow-plan'].kind_de, 'Fertigkeit');
});

// Task 3 determinism test
import { serialize } from './emit-webapp.mjs';

test('serialize: byte-identical across two runs (determinism guard)', () => {
  const dir = globalThis.__agFixtureRegistry();
  const a = serialize(buildWebappData(dir));
  const b = serialize(buildWebappData(dir));
  assert.equal(a, b, 'two serializations of the same registry must be byte-identical');
  assert.ok(a.endsWith('\n'), 'output ends with a trailing newline');
  // Stable, indented, deterministic key order at top level:
  assert.match(a, /^\{\n {2}"\$schema": "agent-guide\.generated\/v1",/);
});
