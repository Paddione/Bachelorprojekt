#!/usr/bin/env node
/**
 * scripts/context-retrieve.mjs — S1-Retrieval-Schicht (T002658).
 *
 * Ein Aufruf pro Dispatch: (Aufgabentext, Rolle, Budget) -> budgetierter,
 * gerankter, herkunfts-markierter Kontextblock. Ersetzt langfristig den
 * Volltext-Dump der vier *-context.sh-Skripte (S3, ausserhalb dieses Changes).
 *
 * Ablauf: Pinned-Set laden -> Query embedden -> Kandidaten ziehen -> reranken
 * -> Budget fuellen -> rendern.
 *
 * Fallback-Kette (p4, design.md "Fehlerbehandlung"):
 *   - Embedding- oder Datenbankfehler  -> mode=rulefilter, Delegation an die
 *     rollen-schluesselbaren *-context.sh (plan-context.sh, toolset-context.sh),
 *     hart am Budget gekappt
 *   - Rerank-Ausfall                   -> mode=retrieval degraded=rerank
 *     (Vektor-Reihenfolge)
 *   - Budget < Pinned-Set              -> mode=truncated, Pinned-Set vollstaendig
 *   - Null Kandidaten                  -> Block mit Header und Klartextsatz,
 *     niemals ein Leerstring
 *
 * Exit-Code ist in allen Backend-Ausfall-Faellen 0 — ein Exit != 0 wuerde bei
 * einem Backend-Ausfall jeden Agent-Dispatch im Repo lahmlegen. Nur
 * Aufrufer-Fehler (fehlende Argumente, unbekannte Rolle) enden != 0.
 *
 * Die Pruefung erfolgt ausschliesslich ueber eine tatsaechliche Antwort des
 * Endpoints (lib-context-retrieve.mjs wirft bei Fehler/Timeout/leerer
 * Antwort) — nie ueber Prozess- oder systemd-Unit-Zustand.
 *
 * Endpoints (Konvention website/src/lib/bge-router.ts): LLM_EMBED_URL,
 * LLM_RERANKER_URL. DB: PGURL (Konvention lib-knowledge-pg.mjs makePool).
 */

import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePool } from './knowledge/lib-knowledge-pg.mjs';
import { approxTokens } from './knowledge/lib-context-retrieve.mjs';
import {
  buildPredicates,
  embedQuery,
  pullCandidates,
  rerank,
  fillBudget,
} from './knowledge/lib-context-retrieve.mjs';
import { loadPinned, renderPinned, assertRole } from './knowledge/lib-context-pinned.mjs';

const execFileP = promisify(execFile);

const USAGE = `Usage: node scripts/context-retrieve.mjs [options]

  --task-prompt <text>|-   Aufgabentext als Query-Quelle; '-' liest stdin
  --role <rolle>           harter Metadaten-Filter; Allowlist identisch zu
                           toolset-context.sh (agents.yaml roles: + orchestrator)
  --budget <tokens>        Obergrenze des Retrieval-Anteils (Vorgabe 4000)
  --corpora <a,b,c>        Korpus-Whitelist (collection.source); Default: specs_plans
  --limit <n>              Kandidatenzahl vor dem Rerank (Vorgabe 40, p6-kalibriert)
  --json                   Diagnose statt Block: Scores, Kandidatenzahl,
                           Token-Bilanz, mode, Anzahl der Backend-Aufrufe
`;

function parseArgs(argv) {
  const out = { taskPrompt: null, role: null, budget: 4000, corpora: null, limit: 40, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--task-prompt': out.taskPrompt = argv[++i] ?? ''; break;
      case '--role': out.role = argv[++i] ?? ''; break;
      case '--budget': out.budget = Number(argv[++i]); break;
      case '--corpora': out.corpora = String(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--limit': out.limit = Number(argv[++i]); break;
      case '--json': out.json = true; break;
      case '--help':
      case '-h': process.stdout.write(USAGE); process.exit(0); break;
      default:
        process.stderr.write(`FEHLER: unbekanntes Argument "${arg}"\n${USAGE}`);
        process.exit(2);
    }
  }
  return out;
}

/** Klartext-Warnsatz, der die Unvollstaendigkeit benennt (design.md). */
function warningSentence(mode, reason) {
  return `Dieser Kontext ist unvollstaendig (mode=${mode}): ${reason} Schliesse aus fehlenden Informationen nicht auf deren Nichtexistenz.`;
}

/**
 * Delegation an die heutigen rollen-schluesselbaren *-context.sh, hart am
 * Budget gekappt. plan-context.sh und toolset-context.sh sind die beiden
 * Skripte, die allein aus einer Rolle bedienbar sind; task-context.sh braucht
 * ein Ticket, openspec-context.sh einen Pfad (beides S3-Kanaele).
 */
async function rulefilterContext(role, budgetTokens) {
  const scripts = ['scripts/plan-context.sh', 'scripts/toolset-context.sh'];
  const blocks = [];
  for (const script of scripts) {
    try {
      const { stdout } = await execFileP(script, [role], { timeout: 15_000 });
      if (stdout.trim()) blocks.push(stdout.trim());
    } catch {
      // Delegat nicht verfuegbar — bleibt leer, die Warnung traegt die Ehrlichkeit.
    }
  }
  let used = 0;
  const capped = [];
  for (const block of blocks) {
    if (used >= budgetTokens) break;
    capped.push(block);
    used += approxTokens(block);
  }
  return capped.join('\n\n');
}

function provenance(candidate) {
  const meta = candidate.metadata ?? {};
  return { slug: meta.slug ?? 'unbekannt', sectionTitle: meta.section_title ?? '' };
}

function renderBlock({ mode, degraded, corpora, candidates, selected, balance, pinnedCount, pinnedBlock, retrievalSection, warning }) {
  const header = [
    '<!-- context-retrieve',
    `mode=${mode}${degraded ? ` degraded=${degraded}` : ''}`,
    `corpora=${corpora.join(',')}`,
    `candidates=${candidates}`,
    `selected=${selected}`,
    `budget=${balance.used}/${balance.budget}`,
    `pinned=${pinnedCount}`,
    '-->',
  ].join(' ');
  const parts = [header];
  if (warning) parts.push(warning, '');
  if (pinnedBlock) parts.push(pinnedBlock);
  if (retrievalSection) parts.push(retrievalSection);
  return parts.join('\n');
}

function renderRetrievalSection(selected) {
  const lines = ['', '## Retrieval-Kontext'];
  for (const c of selected) {
    const { slug, sectionTitle } = provenance(c);
    const heading = sectionTitle ? `### \`${slug}\` — ${sectionTitle}` : `### \`${slug}\``;
    lines.push('', heading, c.text);
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.taskPrompt === null) {
    process.stderr.write(`FEHLER: --task-prompt fehlt\n${USAGE}`);
    process.exit(2);
  }
  if (opts.role === null) {
    process.stderr.write(`FEHLER: --role fehlt\n${USAGE}`);
    process.exit(2);
  }
  if (!Number.isFinite(opts.budget) || opts.budget < 0) {
    process.stderr.write(`FEHLER: --budget muss eine Zahl >= 0 sein (war ${opts.budget})\n${USAGE}`);
    process.exit(2);
  }
  if (!Number.isFinite(opts.limit) || opts.limit < 1) {
    process.stderr.write(`FEHLER: --limit muss eine Zahl >= 1 sein (war ${opts.limit})\n${USAGE}`);
    process.exit(2);
  }
  try {
    assertRole(opts.role);
  } catch (err) {
    process.stderr.write(`FEHLER: ${err.message}\n${USAGE}`);
    process.exit(2);
  }

  const taskPrompt = opts.taskPrompt === '-' ? readFileSync(0, 'utf8').trim() : opts.taskPrompt;
  const corpora = opts.corpora ?? ['specs_plans'];
  const backendCalls = { embed: 0, rerank: 0 };

  // ── 1. Pinned-Set laden (ausserhalb des Budgets) ─────────────────────
  const pinned = loadPinned(opts.role);
  const pinnedBlock = renderPinned(pinned);
  const pinnedTokens = approxTokens(pinnedBlock);

  // ── 2. Budget < Pinned-Set -> mode=truncated, kein Backend-Aufruf ────
  if (opts.budget < pinnedTokens) {
    const warning = warningSentence('truncated', 'Das Budget reichte nicht fuer den Retrieval-Anteil; der Pinned-Kontext ist vollstaendig.');
    const header = `<!-- context-retrieve mode=truncated corpora=${corpora.join(',')} candidates=0 selected=0 budget=0/${opts.budget} pinned=${pinned.entries.length} -->`;
    const block = [header, warning, '', pinnedBlock].join('\n');
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        mode: 'truncated', degraded: null, corpora,
        candidates: 0, selected: 0,
        budget: { used: 0, total: opts.budget },
        pinned: pinned.entries.length,
        backendCalls,
        results: [],
      }, null, 2) + '\n');
    } else {
      process.stdout.write(block + '\n');
    }
    return 0;
  }

  // ── 3. Query embedden (Fehler -> rulefilter) ─────────────────────────
  let vector;
  try {
    vector = await embedQuery(taskPrompt);
    backendCalls.embed += 1;
  } catch {
    backendCalls.embed += 1;
    const delegated = await rulefilterContext(opts.role, opts.budget);
    const warning = warningSentence('rulefilter', 'Retrieval war nicht verfuegbar (Embedding-Backend oder Konfiguration).');
    const header = `<!-- context-retrieve mode=rulefilter corpora=${corpora.join(',')} candidates=0 selected=0 budget=0/${opts.budget} pinned=${pinned.entries.length} -->`;
    const block = [header, warning, '', pinnedBlock, delegated ? `\n## Regel-Filter-Kontext (Fallback)\n${delegated}` : ''].join('\n');
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        mode: 'rulefilter', degraded: null, corpora,
        candidates: 0, selected: 0,
        budget: { used: 0, total: opts.budget },
        pinned: pinned.entries.length,
        backendCalls,
        results: [],
      }, null, 2) + '\n');
    } else {
      process.stdout.write(block + '\n');
    }
    return 0;
  }

  // ── 4. Kandidaten ziehen (DB-Fehler -> rulefilter) ───────────────────
  const predicates = buildPredicates({ role: opts.role, corpora, status: null });
  const pool = makePool();
  let candidates;
  try {
    candidates = await pullCandidates(pool, vector, predicates, opts.limit);
  } catch {
    const delegated = await rulefilterContext(opts.role, opts.budget);
    const warning = warningSentence('rulefilter', 'Retrieval war nicht verfuegbar (Datenbankfehler).');
    const header = `<!-- context-retrieve mode=rulefilter corpora=${corpora.join(',')} candidates=0 selected=0 budget=0/${opts.budget} pinned=${pinned.entries.length} -->`;
    const block = [header, warning, '', pinnedBlock, delegated ? `\n## Regel-Filter-Kontext (Fallback)\n${delegated}` : ''].join('\n');
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        mode: 'rulefilter', degraded: null, corpora,
        candidates: 0, selected: 0,
        budget: { used: 0, total: opts.budget },
        pinned: pinned.entries.length,
        backendCalls,
        results: [],
      }, null, 2) + '\n');
    } else {
      process.stdout.write(block + '\n');
    }
    return 0;
  } finally {
    await pool.end();
  }

  // ── 5. Rerank (Ausfall -> Vektor-Reihenfolge, degraded) ──────────────
  let ranked = candidates;
  let degraded = null;
  if (candidates.length > 0) {
    backendCalls.rerank += 1;
    const out = await rerank(taskPrompt, candidates, opts.limit);
    ranked = out.ranked;
    degraded = out.degraded;
  }

  // ── 6. Budget fuellen + rendern ──────────────────────────────────────
  const { selected, balance } = fillBudget(ranked, opts.budget);
  const mode = 'retrieval';
  const warning = selected.length === 0
    ? warningSentence(mode, 'Fuer diese Aufgabe wurden keine Kandidaten gefunden.')
    : null;

  const results = selected.map((c) => {
    const { slug, sectionTitle } = provenance(c);
    return { slug, sectionTitle, score: Number(c.score.toFixed(4)), tokens: approxTokens(c.text) };
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      mode, degraded, corpora,
      candidates: candidates.length,
      selected: selected.length,
      budget: { used: balance.used, total: opts.budget },
      pinned: pinned.entries.length,
      backendCalls,
      results,
    }, null, 2) + '\n');
    return 0;
  }

  const block = renderBlock({
    mode, degraded, corpora,
    candidates: candidates.length,
    selected: selected.length,
    balance,
    pinnedCount: pinned.entries.length,
    pinnedBlock,
    retrievalSection: renderRetrievalSection(selected),
    warning,
  });
  process.stdout.write(block + '\n');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[context-retrieve] FATAL: ${err.message}\n`);
    process.exit(0); // Backend-Fehler duerfen den Dispatch nie abwuergen
  });
}
