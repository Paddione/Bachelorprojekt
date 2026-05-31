// scripts/agent-guide/emit-maps.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeCell,
  renderGoalsMap,
  renderToolsMap,
  renderDangerMap,
} from './emit-maps.mjs';

test('escapeCell: pipe is backslash-escaped', () => {
  assert.equal(escapeCell('a | b'), 'a \\| b');
});

test('escapeCell: embedded newline collapses to a single space', () => {
  assert.equal(escapeCell('line one\nline two'), 'line one line two');
  assert.equal(escapeCell('line one\r\nline two'), 'line one line two');
});

test('escapeCell: runs of whitespace around a newline collapse to one space', () => {
  assert.equal(escapeCell('a  \n   b'), 'a b');
});

test('escapeCell: leading/trailing whitespace trimmed', () => {
  assert.equal(escapeCell('   padded   '), 'padded');
});

test('escapeCell: pipe and newline together stay table-safe', () => {
  assert.equal(escapeCell('„Fix |broken|\nlogin“'), '„Fix \\|broken\\| login“');
});

test('escapeCell: empty/undefined renders as the em-dash placeholder', () => {
  assert.equal(escapeCell(''), '—');
  assert.equal(escapeCell(undefined), '—');
  assert.equal(escapeCell(null), '—');
});
