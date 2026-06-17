#!/usr/bin/env node
// scripts/factory/ci-review.mjs — CI-side tiered AI code review (advisory).
// Reads a filtered diff + tier, runs tier-selected lens prompts against a
// DeepSeek/Anthropic-compatible endpoint, optionally consolidates via a
// coordinator, and posts a GitHub PR review with `gh pr review`.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import Anthropic from '@anthropic-ai/sdk'
import { parseChangedLines, filterFindings, formatChangedLinesHint } from './review-finding-filter.mjs'

const {
  ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY,
  CLEAN_DIFF_PATH, TIER_JSON_PATH,
  PR_NUMBER, CI_REVIEW_MODEL = 'deepseek-chat',
  CI_REVIEW_CONFIDENCE_THRESHOLD,
} = process.env
const confidenceThreshold = (() => { const v = Number(CI_REVIEW_CONFIDENCE_THRESHOLD); return Number.isNaN(v) ? 0.6 : v })()

const PROMPT_DIR = new URL('.', import.meta.url).pathname

if (!ANTHROPIC_API_KEY) {
  console.warn('ci-review: ANTHROPIC_API_KEY unset — skipping AI review (advisory).')
  process.exit(0)
}

const LENS_FILE = {
  bug:        'review-bug-hunter.prompt.md',
  security:   'review-security-auditor.prompt.md',
  pattern:    'review-pattern-enforcer.prompt.md',
  perf:       'review-perf-reviewer.prompt.md',
  'agents-md':'review-agents-md-staleness.prompt.md',
}
const TIER_LENSES = {
  trivial: ['bug'],
  lite:    ['bug', 'security', 'pattern'],
  full:    ['bug', 'security', 'pattern', 'perf', 'agents-md'],
}

const readPrompt = (lens) => readFileSync(PROMPT_DIR + LENS_FILE[lens], 'utf8')
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, ...(ANTHROPIC_BASE_URL ? { baseURL: ANTHROPIC_BASE_URL } : {}) })

function parseJson(text, fallback) {
  const m = text && text.match(/\{[\s\S]*\}/)
  if (!m) return fallback
  try { return JSON.parse(m[0]) } catch { return fallback }
}

async function callModel(systemPrompt, userContent) {
  const res = await client.messages.create({
    model: CI_REVIEW_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

async function runLens(lens, diff, hint) {
  try {
    const prefix = hint ? `Only report findings on these changed lines per file: ${hint}\nEach finding MUST include a numeric confidence 0.0–1.0.\n\n` : ''
    const out = await callModel(readPrompt(lens), `${prefix}Review this diff:\n\n${diff}`)
    return { lens, result: parseJson(out, { findings: [] }) }
  } catch (e) {
    console.error(`ci-review: lens ${lens} failed: ${e.message}`)
    return null
  }
}

function fallbackVerdict(reviews, suppressedCount) {
  const findings = reviews.flatMap((r) => r.result.findings || [])
  if (findings.some((f) => f && (f.severity === 'high' || f.severity === 'critical'))) return { verdict: 'requested_changes', summary: 'High/critical findings present.', findings, suppressedCount }
  if (findings.length) return { verdict: 'minor_issues', summary: 'Minor findings present.', findings, suppressedCount }
  return { verdict: 'approved', summary: 'No blocking findings.', findings: [], suppressedCount: suppressedCount || 0 }
}

async function coordinate(reviews, suppressedCount) {
  const xml = '<reviews>\n' + reviews.map((r) => `  <lens name="${r.lens}">${JSON.stringify(r.result)}</lens>`).join('\n') + '\n</reviews>'
  try {
    const coordPrompt = readFileSync(PROMPT_DIR + 'review-coordinator.prompt.md', 'utf8')
    const out = await callModel(coordPrompt, `Consolidate these lens findings:\n${xml}`)
    const result = parseJson(out, fallbackVerdict(reviews))
    result.suppressedCount = (result.suppressedCount || 0) + (suppressedCount || 0)
    return result
  } catch (e) {
    console.error(`ci-review: coordinator failed: ${e.message}`)
    return fallbackVerdict(reviews, suppressedCount)
  }
}

function renderBody(tier, consolidated) {
  const rows = (consolidated.findings || []).slice(0, 10).map((f) =>
    `| ${f.category || '-'} | ${f.severity || '-'} | ${f.file || '-'}:${f.line || '-'} | ${(f.description || '').replace(/\|/g, '\\|')} |`).join('\n')
  const suppressed = consolidated.suppressedCount ? `<sub>${consolidated.suppressedCount} finding(s) suppressed (out-of-diff / low-confidence / style)</sub>\n\n` : ''
  return [
    `### AI Code Review — tier: \`${tier}\``,
    '',
    consolidated.summary || '',
    '',
    rows ? `| category | severity | location | description |\n|---|---|---|---|\n${rows}` : '_No findings._',
    '',
    `**Verdict:** \`${consolidated.verdict}\``,
    '',
    suppressed,
    '<sub>Advisory automated review. Not a required check.</sub>',
  ].join('\n')
}

function postReview(verdict, body) {
  if (!PR_NUMBER) { console.log(body); return }
  const flag =
    verdict === 'requested_changes'      ? '--request-changes' :
    verdict === 'minor_issues'           ? '--comment' :
    verdict === 'approved_with_comments' ? '--comment' :
                                           '--approve'
  try {
    execFileSync('gh', ['pr', 'review', String(PR_NUMBER), flag, '--body', body], { stdio: 'inherit' })
  } catch (e) {
    // gh cannot approve your own PR; downgrade to a comment so the review still posts.
    console.error(`ci-review: ${flag} failed (${e.message}); falling back to --comment.`)
    execFileSync('gh', ['pr', 'review', String(PR_NUMBER), '--comment', '--body', body], { stdio: 'inherit' })
  }
}

async function main() {
  const diff = readFileSync(CLEAN_DIFF_PATH, 'utf8')
  if (!diff.trim()) { console.log('ci-review: empty diff — nothing to review.'); return }
  const tier = parseJson(readFileSync(TIER_JSON_PATH, 'utf8'), { tier: 'full' }).tier || 'full'
  const lenses = TIER_LENSES[tier] || TIER_LENSES.full

  const changedLines = parseChangedLines(diff)
  const hint = formatChangedLinesHint(changedLines)

  const beat = setInterval(() => console.log('AI review running...'), 30_000)
  try {
    const settled = await Promise.all(lenses.map((l) => runLens(l, diff, hint)))
    const reviews = settled.filter(Boolean)

    let totalSuppressed = 0
    for (const r of reviews) {
      const filtered = filterFindings(r.result.findings || [], changedLines, { confidenceThreshold })
      totalSuppressed += filtered.dropped.length
      r.result.findings = filtered.kept
    }

    const consolidated = (tier === 'full' && reviews.length >= 2) ? await coordinate(reviews, totalSuppressed) : fallbackVerdict(reviews, totalSuppressed)
    postReview(consolidated.verdict, renderBody(tier, consolidated))
  } finally {
    clearInterval(beat)
  }
}

main().catch((e) => { console.error('ci-review failed:', e); process.exit(1) })
