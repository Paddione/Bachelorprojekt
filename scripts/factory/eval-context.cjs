#!/usr/bin/env node
// scripts/factory/eval-context.cjs — Build a compact eval context string for a ticket.
const { existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')

const REPO = resolve(__dirname, '../..')
const DEFAULT_FIXTURES_DIR = resolve(REPO, 'tests/factory-eval/fixtures')
const DEFAULT_OUT_DIR = resolve(REPO, 'docs/factory-eval')

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function buildEvalContext(extId, { fixturesDir = DEFAULT_FIXTURES_DIR, outDir = DEFAULT_OUT_DIR } = {}) {
  const fixtureDir = join(fixturesDir, extId)
  if (!existsSync(fixtureDir)) return null

  const latestPath = join(outDir, 'latest.json')
  if (!existsSync(latestPath)) return null

  let latest
  try {
    latest = loadJSON(latestPath)
  } catch {
    return null
  }

  const entry = (latest.scores || []).find(s => s.fixture === extId)
  if (!entry) return null

  const ctx = {
    fixture: entry.fixture,
    mode: entry.mode || 'live',
    base_commit: entry.base_commit || null,
    score: entry.score,
    pass: entry.pass,
  }
  const str = JSON.stringify(ctx)
  return str.length > 220 ? str.slice(0, 217) + '...' : str
}

module.exports = { buildEvalContext }
