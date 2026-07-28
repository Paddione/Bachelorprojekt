#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

const LLM_PROXY = process.env.LLM_PROXY || 'http://127.0.0.1:18235';
const MODEL = process.env.SYNTHESIZE_MODEL || '';

async function readStdin() {
  const rl = createInterface({ input: process.stdin });
  let data = '';
  for await (const line of rl) data += line + '\n';
  return JSON.parse(data);
}

function buildPrompt(cluster) {
  const lines = [
    'Du bist ein Merge-Arbiter. Deine Aufgabe: führe mehrere Änderungen derselben Datei aus verschiedenen Pull Requests zu einer einzigen Version zusammen.',
    '',
    `Cluster-Key: ${cluster.cluster_key}`,
    `Kollidierende Dateien: ${cluster.files.join(', ')}`,
    '',
    'Beteiligte PRs:',
  ];

  for (const pr of cluster.eligible_prs) {
    lines.push(`  - PR #${pr.number} (${pr.branch}${pr.ticket ? `, Ticket ${pr.ticket}` : ''}): ${pr.title}`);
  }

  lines.push('');
  lines.push('Für jede kollidierende Datei gibt es die main-Version und die Version jedes PRs.');
  lines.push('Erstelle eine zusammengeführte Version, die alle semantischen Änderungen vereint.');
  lines.push('');
  lines.push('Antworte NUR als JSON mit diesem Schema:');
  lines.push('{');
  lines.push('  "merged": { "<datei>": "<zusammengeführter Inhalt>" },');
  lines.push('  "confidence": 0.0-1.0,');
  lines.push('  "rationale": "Erklärung der Zusammenführung",');
  lines.push('  "per_pr_notes": { "<pr-number>": "Notiz für diesen PR" }');
  lines.push('}');

  return lines.join('\n');
}

async function queryLlm(prompt) {
  return new Promise((resolve, reject) => {
    const url = `${LLM_PROXY}/v1/chat/completions`;
    const body = JSON.stringify({
      model: MODEL || undefined,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const curl = spawn('curl', [
      '-s', '-X', 'POST', url,
      '-H', 'Content-Type: application/json',
      '-d', body,
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });

    let output = '';
    let error = '';
    curl.stdout.on('data', (chunk) => { output += chunk; });
    curl.stderr.on('data', (chunk) => { error += chunk; });

    curl.on('close', (code) => {
      if (code !== 0) reject(new Error(`llm-proxy exited ${code}: ${error}`));
      else resolve(JSON.parse(output));
    });
    curl.on('error', reject);
  });
}

function validateSchema(response) {
  if (!response.merged || typeof response.merged !== 'object') throw new Error('missing merged');
  if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
    throw new Error('invalid confidence');
  }
  if (typeof response.rationale !== 'string' || !response.rationale.trim()) throw new Error('missing rationale');
  if (!response.per_pr_notes || typeof response.per_pr_notes !== 'object') throw new Error('missing per_pr_notes');
  return response;
}

async function main() {
  const cluster = await readStdin();
  const prompt = buildPrompt(cluster);
  const raw = await queryLlm(prompt);
  const reply = raw.choices?.[0]?.message?.content;
  if (!reply) throw new Error('empty LLM response');
  const parsed = JSON.parse(reply);
  const validated = validateSchema(parsed);
  process.stdout.write(JSON.stringify(validated, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
