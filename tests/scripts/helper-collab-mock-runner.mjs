#!/usr/bin/env node
/**
 * Mock-runner for helper-collab.js (T000542).
 * Evaluates the IIFE in a vm sandbox, emitting JSON: {who, promptCalled}.
 *
 * Usage: node helper-collab-mock-runner.mjs [search] [presetWho]
 *   search    — URL search string, e.g. "?who=AutoBot" (default: "")
 *   presetWho — pre-seed localStorage brainstorm_who (default: none)
 */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(__dir, '../../scripts/superpowers-collab/helper-collab.js');

const search = process.argv[2] ?? '';
const presetWho = process.argv[3] ?? '';

const src = readFileSync(HELPER, 'utf8');
let promptCalled = false;
const lsStore = presetWho ? { brainstorm_who: presetWho } : {};

const mockEl = () => ({
  style: { cssText: '' }, textContent: '', id: '', autocomplete: '',
  placeholder: '', appendChild() {}, addEventListener() {},
  scrollTop: 0, scrollHeight: 0,
});

const ctx = vm.createContext({
  window: {},
  location: { protocol: 'http:', host: 'localhost', search },
  localStorage: {
    getItem: (k) => lsStore[k] ?? null,
    setItem: (k, v) => { lsStore[k] = v; },
  },
  prompt: (_msg) => { promptCalled = true; return 'Human'; },
  document: { createElement: () => mockEl(), body: { appendChild() {} } },
  setInterval: () => {},
  WebSocket: class { constructor() { this.readyState = 3; } },
  JSON,
  setTimeout: () => {},
});

vm.runInContext(src, ctx);
process.stdout.write(JSON.stringify({ who: lsStore['brainstorm_who'], promptCalled }));
