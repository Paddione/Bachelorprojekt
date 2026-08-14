#!/usr/bin/env node
/**
 * kalibrierung-retrieval.mjs — Messprotokoll der S1-Retrieval-Parameter (T002658, p6 Schritt 6).
 *
 * Fuer jede Kombination (limit 20/40/60 x budget 2000/4000/8000) laufen alle
 * Eintraege des Golden-Sets (tests/fixtures/context-retrieve/golden-queries.json).
 * Gemessen: Recall (Ziel-Chunk im selected-Set, mode=retrieval), durchschnittlich
 * belegte Tokens, durchschnittliche Latenz, degraded-/rulefilter-/Fehler-Faelle.
 *
 * Ergebnis 2026-08-14: Recall 16/16 ueber alle 9 Kombinationen; die Latenz
 * skaliert nur mit limit (Rerank ~96 % der Dispatch-Zeit, design.md), budget
 * steuert nur die Fuellmenge. Vorgabewerte bleiben limit=40, budget=4000
 * (design.md "Offene Parameter").
 *
 * Umgebung (dieselben Forwards wie die BATS-Tests):
 *   LLM_EMBED_URL (Default http://127.0.0.1:8081, fleet-Forward),
 *   LLM_RERANKER_URL (Default http://127.0.0.1:8093, fleet; lokal k3d-dev-Pod
 *   ueber 8094), PGURL aus dem k3d-Secret (context-retrieve-cli.bats
 *   _export_pgurl). CONTEXT_RETRIEVE_EMBED_TIMEOUT_MS=20000: der 5-s-Default
 *   ist fuer den fleet-WAN-Pfad zu knapp — 3 von 9 Kombinationen zeigten im
 *   Erstlauf rulefilter-Artefakte (Embed-Timeout), mit 20 s sind alle 9
 *   Kombinationen artefaktfrei.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const execFileP = promisify(execFile);

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = JSON.parse(readFileSync(resolve(REPO, 'tests/fixtures/context-retrieve/golden-queries.json'), 'utf8'));
const pw = (await execFileP('kubectl', ['--context', 'k3d-mentolder-dev', '-n', 'workspace', 'get', 'secret', 'workspace-secrets', '-o', 'jsonpath={.data.SHARED_DB_PASSWORD}'])).stdout;
const PGURL = `postgres://website:${Buffer.from(pw, 'base64').toString('utf8')}@localhost:5432/website`;
const env = {
  ...process.env,
  PGURL,
  LLM_EMBED_URL: process.env.LLM_EMBED_URL ?? 'http://127.0.0.1:8081',
  LLM_RERANKER_URL: process.env.LLM_RERANKER_URL ?? 'http://127.0.0.1:8093',
  CONTEXT_RETRIEVE_EMBED_TIMEOUT_MS: process.env.CONTEXT_RETRIEVE_EMBED_TIMEOUT_MS ?? '20000',
};

const limits = [20, 40, 60];
const budgets = [2000, 4000, 8000];

for (const limit of limits) {
  for (const budget of budgets) {
    let recall = 0, usedSum = 0, msSum = 0, degraded = 0, failed = 0, rulefilter = 0;
    for (const entry of GOLDEN) {
      const t = Date.now();
      let j;
      try {
        const out = await execFileP('node', [resolve(REPO, 'scripts/context-retrieve.mjs'), '--task-prompt', entry.task, '--role', 'bachelorprojekt-infra', '--limit', String(limit), '--budget', String(budget), '--json'], { env, timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
        j = JSON.parse(out.stdout);
      } catch (err) {
        failed++;
        console.log(`FAIL limit=${limit} budget=${budget} q=${entry.expect.slug} ${err.message}`);
        continue;
      }
      msSum += Date.now() - t;
      if (j.mode !== 'retrieval') { rulefilter++; continue; }
      if (j.degraded) degraded++;
      if (j.results.some((r) => r.slug === entry.expect.slug && r.sectionTitle === entry.expect.sectionTitle)) recall++;
      usedSum += j.budget.used;
    }
    const n = GOLDEN.length;
    console.log(`limit=${String(limit).padStart(2)} budget=${String(budget).padStart(4)} recall=${recall}/${n} avg_used=${Math.round(usedSum / n)} avg_ms=${Math.round(msSum / n)} degraded=${degraded} rulefilter=${rulefilter} failed=${failed}`);
  }
}
