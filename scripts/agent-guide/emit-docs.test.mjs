// scripts/agent-guide/emit-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRegistry } from './load.mjs';
import { slugForToolId } from './emit-docs.mjs';

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

export { makeFixtureRegistry };
