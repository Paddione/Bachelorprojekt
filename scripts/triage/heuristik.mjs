#!/usr/bin/env node
/**
 * heuristik.mjs — Heuristic severity triage for new tickets.
 *
 * CLI args:  --title <text> --description <t> --areas <key>
 * Stdin:     JSON { title, description, areas }
 * Output:    JSON { severity, confidence, reasoning, auto_apply }
 * Exit:      0 ok, 1 input invalid, 2 heuristik threw (caller: no-triage)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AREA_WEIGHTS = { infra: 1.0, chat: 0.9, ops: 0.8, db: 0.8, ai: 0.7,
                       factory: 0.6, website: 0.5, docs: 0.3 };
const CRITICAL_KEYWORDS = ['kritisch', 'prod-down', 'datenverlust', 'ausfall',
                           'notfall', 'severe', 'down', 'offline'];
const HIGH_KEYWORDS     = ['fehler', 'bug', 'kaputt', 'broken', 'failing'];
const MEDIUM_KEYWORDS   = ['verbesserung', 'refactor', 'optimierung'];

function loadFewShot() {
  try {
    return JSON.parse(readFileSync(join(__dirname, 'few-shot-examples.json'), 'utf8'));
  } catch {
    return [];
  }
}

function wordBoundaryRegex(keyword) {
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

function scoreText(text) {
  const t = text || '';
  return {
    criticalHits: CRITICAL_KEYWORDS.filter(k => wordBoundaryRegex(k).test(t)).length,
    highHits:     HIGH_KEYWORDS.filter(k => wordBoundaryRegex(k).test(t)).length,
    mediumHits:   MEDIUM_KEYWORDS.filter(k => wordBoundaryRegex(k).test(t)).length,
  };
}

function triage({ title, description, areas }) {
  if (!title) throw new Error('title is required');
  const text = `${title} ${description || ''}`;
  const { criticalHits, highHits, mediumHits } = scoreText(text);
  const areaWeight = AREA_WEIGHTS[areas] ?? 0.5;
  let score = 0;
  if (criticalHits > 0)      score = 0.95;
  else if (highHits > 0)     score = 0.75;
  else if (mediumHits > 0)   score = 0.55;
  score *= areaWeight;
  const fewShot = loadFewShot();
  if (fewShot.length >= 20 && score > 0 && score < 0.4) score = 0.4;
  let severity = 'low';
  if (score >= 0.85)      severity = 'critical';
  else if (score >= 0.65) severity = 'high';
  else if (score >= 0.40) severity = 'medium';
  const confidence = Math.min(1, Math.max(0, score));
  return {
    severity,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `criticalHits=${criticalHits} highHits=${highHits} mediumHits=${mediumHits} areaWeight=${areaWeight}`,
    auto_apply: confidence > 0.90,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      out[args[i].slice(2)] = args[++i];
    }
  }
  return out;
}

async function main() {
  const cli = parseArgs();
  let input;
  if (Object.keys(cli).length > 0) {
    input = { title: cli.title, description: cli.description, areas: cli.areas };
  } else {
    const stdin = readFileSync(0, 'utf8');
    input = JSON.parse(stdin || '{}');
  }
  if (!input.title) {
    process.stderr.write('ERROR: title is required\n');
    process.exit(1);
  }
  const result = triage(input);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ severity: null, confidence: 0,
    reasoning: `heuristik threw: ${err.message}`, auto_apply: false }) + '\n');
  process.exit(2);
});
