// scripts/agent-guide/load.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRegistry, tierFor, toolById, guardrailById, goalById } from './load.mjs';

/** Write a tiny but complete fixture registry into a fresh temp dir; return the dir. */
function makeFixtureRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-guide-load-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'taxonomy.yaml'), [
    '- id: safe',
    '  label_de: "🟢 Sicher"',
    '  emoji: "🟢"',
    '  meaning_de: Du kannst nichts kaputt machen.',
    '  doc_treatment: inline',
    '  enforcement_default: none',
    '- id: caution',
    '  label_de: "🟡 Vorsicht"',
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
    '  related: [dev-flow-execute]',
    '  links: []',
    '- id: dev-flow-execute',
    '  name_de: Plan umsetzen',
    '  kind: skill',
    '  summary_de: Setzt den Plan um.',
    '  what_for_de: Öffnet einen PR.',
    '  how_to_start_de: Starte die Umsetzung.',
    '  what_could_go_wrong_de: Ein PR muss reviewt werden.',
    '  danger: caution',
    '  guardrails: []',
    '  related: []',
    '  links: []',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text der Website ändern"',
    '  when_de: Wenn du einen Absatz anpassen willst.',
    '  flow:',
    '    - tool: dev-flow-plan',
    '      note_de: beschreibt der KI dein Ziel',
    '    - tool: dev-flow-execute',
    '      note_de: setzt den Plan um',
    '  example_prompt_de: "Ändere den Preis von 90 auf 120."',
    '  danger: safe',
    '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []',
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
    '',
  ].join('\n'), 'utf8');
  return dir;
}

test('loadRegistry: returns the five top-level arrays in file order', () => {
  const dir = makeFixtureRegistry();
  try {
    const reg = loadRegistry(dir);
    assert.ok(Array.isArray(reg.taxonomy) && reg.taxonomy.length === 2, 'taxonomy array');
    assert.ok(Array.isArray(reg.guardrails) && reg.guardrails.length === 1, 'guardrails array');
    assert.ok(Array.isArray(reg.tools) && reg.tools.length === 2, 'tools array');
    assert.ok(Array.isArray(reg.goals) && reg.goals.length === 1, 'goals array');
    assert.ok(Array.isArray(reg.components) && reg.components.length === 1, 'components array');
    // file order preserved (no sorting)
    assert.equal(reg.tools[0].id, 'dev-flow-plan');
    assert.equal(reg.tools[1].id, 'dev-flow-execute');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tierFor / toolById / guardrailById: resolve known ids, undefined for unknown', () => {
  const dir = makeFixtureRegistry();
  try {
    loadRegistry(dir); // last-load-wins: helpers read this registry
    assert.equal(tierFor('safe').label_de, '🟢 Sicher');
    assert.equal(tierFor('caution').emoji, '🟡');
    assert.equal(tierFor('nope'), undefined);

    assert.equal(toolById('dev-flow-plan').name_de, 'Plan erstellen');
    assert.equal(toolById('does-not-exist'), undefined);

    assert.equal(guardrailById('G-ENV-EXPLICIT').name_de, 'Umgebung immer explizit angeben');
    assert.equal(guardrailById('G-NOPE'), undefined);

    assert.equal(goalById('change-website-text').title_de, 'Ich will den Text der Website ändern');
    assert.equal(goalById('no-such-goal'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
