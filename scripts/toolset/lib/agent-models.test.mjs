// scripts/toolset/lib/agent-models.test.mjs — node:test für den agent-models-Guard (T900792).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripJsonc, checkAgentModels } from './agent-models.mjs';

const CLEAN = `{
  // Historien-Kommentar: DeepSeek-Schiene entfernt (T900751) — kein Treffer.
  "provider": {
    "opencode-go": {
      "models": { "muse-spark-1.3-contributor": {} }
    }
  },
  "agent": {
    "exe-muse": { "model": "opencode-go/muse-spark-1.3-contributor" }
  }
}`;

test('clean agent-models passes, comments naming a forbidden provider stay green', () => {
  assert.deepEqual(checkAgentModels(CLEAN, ['deepseek']), []);
});

test('forbidden provider key fails', () => {
  const errors = checkAgentModels('{ "provider": { "deepseek": { "models": {} } }, "agent": {} }', ['deepseek']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /forbidden provider deepseek in agent-models\.jsonc provider 'deepseek'/);
});

test('forbidden model reference fails (provider prefix and model part)', () => {
  const text = `{ "provider": {},
    "agent": { "helper": { "model": "opencode-go/deepseek-v4-flash" } } }`;
  const errors = checkAgentModels(text, ['deepseek']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /forbidden provider deepseek in agent-models\.jsonc agent 'helper'/);
});

test('forbidden model key inside a clean provider fails', () => {
  const text = `{ "provider": { "opencode-go": { "models": { "deepseek-v4-flash": {} } } } }`;
  const errors = checkAgentModels(text, ['deepseek']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /forbidden provider deepseek in agent-models\.jsonc model 'opencode-go\/deepseek-v4-flash'/);
});

test('matching is case-insensitive', () => {
  const errors = checkAgentModels('{ "provider": { "DeepSeek-Direct": {} } }', ['deepseek']);
  assert.equal(errors.length, 1);
});

test('commented-out provider stays green', () => {
  const text = `{
    // "deepseek": { "models": {} },
    /* "provider": { "deepseek": {} } */
    "provider": { "local": {} }
  }`;
  assert.deepEqual(checkAgentModels(text, ['deepseek']), []);
});

test('trailing commas parse (valid JSONC stays green)', () => {
  const text = `{ "provider": { "local": { "models": { "m": {}, }, }, }, "agent": {}, }`;
  assert.deepEqual(checkAgentModels(text, ['deepseek']), []);
});

test('comment-like sequences inside strings survive stripping', () => {
  const stripped = stripJsonc('{ "url": "http://127.0.0.1:1919/v1" /* c */ } // tail');
  assert.deepEqual(JSON.parse(stripped), { url: 'http://127.0.0.1:1919/v1' });
});

test('unparseable file fails closed', () => {
  const errors = checkAgentModels('{ broken jsonc', ['deepseek']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /agent-models\.jsonc: cannot parse/);
});

test('empty forbidden list checks nothing but still parses', () => {
  const errors = checkAgentModels('{ "provider": { "deepseek": {} } }', []);
  assert.deepEqual(errors, []);
});
