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
    '  harness: opencode',
    '  init_prompt_de: "/dev-flow-plan: plane meine Aenderung"',
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

test('buildWebappData: keys components by slug with the base fields (+ optional map fields)', () => {
  const data = buildWebappData(fixtureRegistry());
  assert.ok(data.components.keycloak, 'components is an object keyed by slug');
  const kc = data.components.keycloak;
  const BASE = ['emoji', 'kind', 'name', 'sensitivity', 'slug', 'summary_de', 'url'];
  for (const k of BASE) assert.ok(k in kc, `component keeps base field '${k}'`);
  assert.equal(kc.sensitivity, 'assisted');
  // The fixture component has no area/theme/relates_to → those keys must be ABSENT.
  assert.ok(!('area' in kc) && !('theme' in kc) && !('relates_to' in kc));
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

test('buildWebappData: projiziert harness pro Tool (gesetzt) und faellt sonst auf "both" zurueck', () => {
  const data = buildWebappData(fixtureRegistry2());
  const byId = Object.fromEntries(data.tools.map(t => [t.id, t]));
  // dev-flow-plan hat harness: opencode in der Fixture → wird uebernommen
  assert.equal(byId['dev-flow-plan'].harness, 'opencode');
  // agent-website hat KEIN harness-Feld → Fallback 'both'
  assert.equal(byId['agent-website'].harness, 'both');
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

// ── Task 2 (new): themes, glossary, per-card field passthrough ───────────────
import { readFileSync as testReadFileSync, existsSync as testExistsSync } from 'node:fs';

/** Extend the shared fixture with themes.yaml + glossary.yaml + new card fields. */
function fixtureRegistryThemed() {
  const dir = globalThis.__agFixtureRegistry();
  writeFileSync(join(dir, 'themes.yaml'), [
    '- { id: website,    label_de: "Website",       emoji: "🌐", order: 1, accent: "#4a9eff", blurb_de: "Webseite." }',
    '- { id: entwickeln, label_de: "Entwickeln",    emoji: "⚙",  order: 2, accent: "#b89bff", blurb_de: "Dev-Flow." }',
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'glossary.yaml'), [
    '- { term: "PR",  def_de: "Ein Änderungsvorschlag." }',
    '- { term: "ENV", def_de: "Die Ziel-Umgebung." }',
    '',
  ].join('\n'));
  // Re-author goals/tools with the new fields the fixture didn't carry:
  writeFileSync(join(dir, 'tools.yaml'), [
    '- id: agent-website',
    '  name_de: "Website-Agent"', '  kind: agent', '  summary_de: "Ändert Website-Texte."',
    '  what_for_de: "Pflegt Inhalte."', '  how_to_start_de: "Sag, welche Seite."',
    '  what_could_go_wrong_de: "Falsche Seite."', '  danger: safe',
    '  theme: website', '  common: true', '  order: 1', '  aliases_de: [text, inhalt]',
    '  guardrails: []', '  related: [dev-flow-plan]',
    '  links: [{ label_de: "Doku", url: "https://example/doc.html" }]',
    '- id: dev-flow-plan',
    '  name_de: "Entwicklungs-Plan starten"', '  kind: skill', '  summary_de: "Plant eine Änderung."',
    '  what_for_de: "Wählt den Pfad."', '  how_to_start_de: "Beschreibe es."',
    '  what_could_go_wrong_de: "Nichts Gefährliches."', '  danger: safe',
    '  theme: entwickeln', '  aliases_de: [plan]', '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []', '  links: []', '',
  ].join('\n'));
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text auf der Website ändern"',
    '  when_de: "Wenn etwas Falsches dasteht."', '  danger: forbidden',
    '  theme: website', '  one_liner_de: "Text korrigieren."',
    '  common: true', '  order: 2', '  aliases_de: [text, ueberschrift]',
    '  flow:', '    - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
    '  example_prompt_de: "Ändere die Überschrift."',
    '  guardrails: [G-ENV-EXPLICIT]', '  related: []', '',
  ].join('\n'));
  return dir;
}

test('buildWebappData: emits ordered themes[] from themes.yaml', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  assert.ok(Array.isArray(data.themes));
  assert.deepEqual(data.themes.map(t => t.id), ['website', 'entwickeln']);
  assert.equal(data.themes[0].label_de, 'Website');
  assert.equal(data.themes[0].emoji, '🌐');
  assert.equal(data.themes[0].accent, '#4a9eff');
});

test('buildWebappData: emits glossary[] from glossary.yaml', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  assert.deepEqual(data.glossary.map(g => g.term), ['PR', 'ENV']);
  assert.equal(data.glossary[0].def_de, 'Ein Änderungsvorschlag.');
});

test('buildWebappData: passes through theme/one_liner_de/aliases_de/common/order/links', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  const goal = data.goals.find(g => g.id === 'change-website-text');
  assert.equal(goal.theme, 'website');
  assert.equal(goal.one_liner_de, 'Text korrigieren.');
  assert.equal(goal.common, true);
  assert.equal(goal.order, 2);
  assert.deepEqual(goal.aliases_de, ['text', 'ueberschrift']);

  const tool = data.tools.find(t => t.id === 'agent-website');
  assert.equal(tool.theme, 'website');
  assert.deepEqual(tool.aliases_de, ['text', 'inhalt']);
  assert.equal(tool.common, true);
  assert.deepEqual(tool.links, [{ label_de: 'Doku', url: 'https://example/doc.html' }]);
});

test('buildWebappData: defaults escalate_to_de to "Patrick" on forbidden cards only', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  const forbidden = data.goals.find(g => g.id === 'change-website-text'); // danger: forbidden in fixture
  assert.equal(forbidden.escalate_to_de, 'Patrick');
  const tool = data.tools.find(t => t.id === 'agent-website'); // danger: safe
  assert.equal(tool.escalate_to_de, undefined, 'non-forbidden cards carry no escalate_to_de');
});

test('buildWebappData: tolerates a registry with no themes.yaml/glossary.yaml', () => {
  const data = buildWebappData(globalThis.__agFixtureRegistry()); // original fixture, no themes file
  assert.deepEqual(data.themes, []);
  assert.deepEqual(data.glossary, []);
  // missing theme falls back to 'allgemein'
  assert.equal(data.goals[0].theme, 'allgemein');
});

test('buildWebappData includes init_prompt_de when present and omits it when absent', () => {
  const dir = globalThis.__agFixtureRegistry();
  const data = buildWebappData(dir);
  const plan = data.tools.find(t => t.id === 'dev-flow-plan');
  const website = data.tools.find(t => t.id === 'agent-website');
  assert.equal(plan.init_prompt_de, '/dev-flow-plan: plane meine Aenderung');
  assert.ok(!('init_prompt_de' in website), 'absent field must not be emitted as a key');
});

// ── Map block (flow ribbon + territory) ──────────────────────────────────────
function fixtureRegistryMapped() {
  const dir = fixtureRegistryThemed();
  writeFileSync(join(dir, 'flow.yaml'), [
    '- { id: idee, label_de: "Idee", emoji: "💡", danger: safe, order: 1, blurb_de: "PR Idee." }',
    '- { id: plan, label_de: "Plan", emoji: "📋", danger: caution, order: 2, blurb_de: "Plan ENV." }',
    '',
  ].join('\n'));
  // give the themed goal a stage + concept, the plan tool a stage
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text auf der Website ändern"',
    '  when_de: "Wenn etwas Falsches dasteht."', '  danger: safe',
    '  theme: website', '  one_liner_de: "Text korrigieren."',
    '  concept_de: "Konzept: ein PR ist ein Änderungsvorschlag."',
    '  stages: [plan]',
    '  flow:', '    - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
    '  example_prompt_de: "Ändere die Überschrift."',
    '  guardrails: [G-ENV-EXPLICIT]', '  related: []', '',
  ].join('\n'));
  // tag keycloak onto the map; mailpit stays off-map
  writeFileSync(join(dir, 'components.yaml'), [
    '- { slug: keycloak, kind: software, name: "Keycloak", emoji: "🔐", summary_de: "SSO.", what_for_de: "x", placeholder_en: "x", sensitivity: assisted, url: "https://auth", links: [], area: plattform, theme: website, relates_to: [change-website-text] }',
    '- { slug: mailpit,  kind: software, name: "Mailpit",  emoji: "📭", summary_de: "Test.", what_for_de: "x", placeholder_en: "x", sensitivity: safe, url: "https://mail", links: [] }',
    '',
  ].join('\n'));
  return dir;
}

test('buildWebappData: emits a map.flow ordered by station order with resolved goal/tool ids', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  assert.ok(data.map && Array.isArray(data.map.flow));
  assert.deepEqual(data.map.flow.map((s) => s.id), ['idee', 'plan']);
  const plan = data.map.flow.find((s) => s.id === 'plan');
  assert.equal(plan.label_de, 'Plan');
  assert.equal(plan.danger, 'caution');
  assert.deepEqual(plan.goalIds, ['change-website-text']);
  assert.deepEqual(data.map.flow.find((s) => s.id === 'idee').goalIds, []);
});

test('buildWebappData: emits map.territory areas with only opted-in components, carrying accent', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  const plattform = data.map.territory.find((a) => a.id === 'plattform');
  assert.ok(plattform, 'plattform area present');
  assert.deepEqual(plattform.nodes.map((n) => n.slug), ['keycloak']);
  const kc = plattform.nodes[0];
  assert.equal(kc.sensitivity, 'assisted');
  assert.equal(kc.theme, 'website');
  assert.equal(kc.accent, '#4a9eff');                 // resolved from themes.yaml
  assert.deepEqual(kc.relatesTo, ['change-website-text']);
  // mailpit has no area → must not appear anywhere in territory
  const allSlugs = data.map.territory.flatMap((a) => a.nodes.map((n) => n.slug));
  assert.ok(!allSlugs.includes('mailpit'));
});

test('buildWebappData: passes stages + concept_de onto goals', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  const g = data.goals.find((x) => x.id === 'change-website-text');
  assert.deepEqual(g.stages, ['plan']);
  assert.equal(g.concept_de, 'Konzept: ein PR ist ein Änderungsvorschlag.');
});

test('buildWebappData: tolerates a registry with no flow.yaml (empty map.flow)', () => {
  const data = buildWebappData(globalThis.__agFixtureRegistry());
  assert.deepEqual(data.map.flow, []);
  assert.ok(Array.isArray(data.map.territory));
});

