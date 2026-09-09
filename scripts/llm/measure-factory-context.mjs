#!/usr/bin/env node
// scripts/llm/measure-factory-context.mjs
// Offline-Kontextmessung der Software-Factory-Dispatch-Prompts (P3, T900087).
//
// EHRLICHKEITSPFLICHT: scripts/factory/eval-context.cjs baut KEINEN Dispatch-Prompt — es liest
// docs/factory-eval/latest.json (Score-Ergebnisse eines gelaufenen Evals) zurueck. Der reale
// Dispatch-Kontext sind die contextHints aus scripts/factory/provision.js:buildContextHints()
// (Vorhaben-Pack, ticket spec, touched_files, target-code-Exzerpte) — deren Auflösung passiert
// zur Laufzeit im Workflow-Orchestrator, nicht in einem festen Skript. Dieses Skript misst daher
// NUR den "ticket spec"-Baustein aus den acht Fixtures unter tests/factory-eval/fixtures/ — eine
// UNTERGRENZE, kein Vollbild. Korrektiv: Live-Telemetrie aus P2 (.opencode/plugin/freetoken-active.ts).
//
// TOKENISIERUNG: kein Tokenizer-Paket im Repo verdrahtet. Deklarierte Naeherung chars/4
// (Fehlerbalken +-30%, siehe meta.tokenizer_method in der Ausgabe). Optionaler exakter Abgleich
// per --tokenizer-endpoint <url> (POST {url}/tokenize, gleiches Shape wie
// scripts/llm-proxy/server.mjs:measureTokens) — auch dieser Wert sieht keinen
// Chat-Template-/Tool-Schema-Overhead (siehe CTX_MARGIN-Kommentar dort), bleibt also ebenfalls
// ein Lower-Bound.
//
// Mess-Konvention T002717: Aufrufbefehl und Commit-Stand stehen in meta.invocation_command /
// meta.commit der Ausgabe — die Zahl ist damit ohne Rueckfrage nachstellbar.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..')
const FIXTURES_DIR = resolve(REPO, 'tests/factory-eval/fixtures')
const CHARS_PER_TOKEN = 4 // deklarierte Naeherung, siehe Kopf-Kommentar; Fehlerbalken +-30%

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

async function tokenizeExact(endpoint, content) {
  try {
    const res = await fetch(`${endpoint}/tokenize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body?.tokens) ? body.tokens.length : null
  } catch {
    return null
  }
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function main() {
  const args = process.argv.slice(2)
  const endpointIdx = args.indexOf('--tokenizer-endpoint')
  const endpoint = endpointIdx >= 0 ? args[endpointIdx + 1] : null
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null

  const ids = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const results = []
  for (const id of ids) {
    const dir = join(FIXTURES_DIR, id)
    const ticketPath = join(dir, 'ticket.json')
    const expectedPath = join(dir, 'expected.json')
    if (!existsSync(ticketPath) || !existsSync(expectedPath)) continue
    const ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
    // Nachbau des "ticket spec"-Hints aus provision.js:buildContextHints — das Naechstliegende,
    // was "ticket spec + attachments" offline hergibt (Fixtures haben keine Attachments).
    const promptText = JSON.stringify({ ticket, expected })
    const charCount = promptText.length
    const approxTokens = Math.ceil(charCount / CHARS_PER_TOKEN)
    const exactTokens = endpoint ? await tokenizeExact(endpoint, promptText) : null
    results.push({
      ticket_id: id,
      char_count: charCount,
      approx_tokens: approxTokens,
      exact_tokens: exactTokens,
    })
  }

  if (results.length === 0) {
    console.error(`FEHLER: keine Fixtures unter ${FIXTURES_DIR} gefunden`)
    process.exit(1)
  }

  const approxVals = results.map((r) => r.approx_tokens)
  const report = {
    meta: {
      generated_at: new Date().toISOString(),
      commit: gitHead(),
      invocation_command: `node scripts/llm/measure-factory-context.mjs${
        endpoint ? ` --tokenizer-endpoint ${endpoint}` : ''
      }`,
      tokenizer_method: endpoint
        ? `exact via POST ${endpoint}/tokenize (llama.cpp API); chars/4-Fallback wo unerreichbar`
        : 'approx chars/4 (deklarierte Naeherung, +-30% Fehlerbalken; kein Tokenizer im Repo verdrahtet)',
      scope_caveat:
        'misst NUR den ticket-spec-Hint aus provision.js:buildContextHints() — Vorhaben-Pack/Footguns/target-code-Exzerpte/similar-tickets sind offline nicht rekonstruierbar; Untergrenze, kein Vollbild. Korrektiv: P2-Live-Telemetrie.',
      fixture_count: results.length,
    },
    fixtures: results,
    aggregate: {
      min: Math.min(...approxVals),
      median: median(approxVals),
      max: Math.max(...approxVals),
    },
  }

  const json = JSON.stringify(report, null, 2)
  if (outPath) writeFileSync(outPath, json)
  console.log(json)

  console.error('\nTicket       | chars  | ~tokens | exact')
  console.error('-------------|--------|---------|------')
  for (const r of results) {
    console.error(
      `${r.ticket_id.padEnd(12)} | ${String(r.char_count).padStart(6)} | ${String(
        r.approx_tokens,
      ).padStart(7)} | ${r.exact_tokens ?? '-'}`,
    )
  }
  console.error(
    `\nAggregate: min=${report.aggregate.min} median=${report.aggregate.median} max=${report.aggregate.max}`,
  )
}

main()
