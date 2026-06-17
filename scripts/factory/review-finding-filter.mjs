#!/usr/bin/env node
import { readFileSync } from 'node:fs'

export function parseChangedLines(unifiedDiff) {
  const map = new Map()
  if (!unifiedDiff) return map
  let currentFile = null
  let currentNewLine = 0
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentFile = line.slice(line.lastIndexOf(' b/') + 3)
      currentNewLine = 0
      if (!map.has(currentFile)) map.set(currentFile, new Set())
    } else if (!currentFile) {
      continue
    } else if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') ||
               line.startsWith('new file ') || line.startsWith('deleted file ') ||
               line.startsWith('old mode ') || line.startsWith('new mode ') ||
               line.startsWith('rename ') || line.startsWith('similarity ') ||
               line.startsWith('Binary files ')) {
      continue
    } else if (line.startsWith('@@ ')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        currentNewLine = parseInt(m[1], 10) - 1
      }
    } else if (line.startsWith('+')) {
      currentNewLine++
      map.get(currentFile).add(currentNewLine)
    } else if (!line.startsWith('-')) {
      currentNewLine++
    }
  }
  return map
}

const STYLE_REGEX = /\b(naming|formatting|format\b|whitespace|indentation|indent\b|style|rename|typo|cosmetic)\b/i

export function isStyleNitpick(finding) {
  if (!finding || finding.severity !== 'low') return false
  if (!finding.description || typeof finding.description !== 'string') return false
  return STYLE_REGEX.test(finding.description)
}

const DEFAULT_OPTS = { confidenceThreshold: 0.6, requireInDiff: true, dropStyleNitpicks: true }

export function filterFindings(findings, changedLines, opts) {
  const { confidenceThreshold, requireInDiff, dropStyleNitpicks } = { ...DEFAULT_OPTS, ...opts }
  const kept = []
  const dropped = []
  if (!Array.isArray(findings)) return { kept, dropped }
  for (const f of findings) {
    if (!f) continue

    if (requireInDiff && f.file && f.line && f.line > 0) {
      const lines = changedLines && changedLines.get(f.file)
      if (!lines || !lines.has(f.line)) {
        dropped.push({ finding: f, reason: 'out-of-diff' })
        continue
      }
    }

    if (typeof f.confidence === 'number' && f.confidence < confidenceThreshold) {
      dropped.push({ finding: f, reason: 'low-confidence' })
      continue
    }

    if (dropStyleNitpicks && isStyleNitpick(f)) {
      dropped.push({ finding: f, reason: 'style-nitpick' })
      continue
    }

    kept.push(f)
  }
  return { kept, dropped }
}

export function formatChangedLinesHint(changedLines) {
  if (!changedLines || !(changedLines instanceof Map) || changedLines.size === 0) {
    return '(no changed lines)'
  }
  const parts = []
  for (const [file, lines] of changedLines) {
    const sorted = [...lines].sort((a, b) => a - b)
    const ranges = []
    let start = sorted[0]
    let end = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i]
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`)
        start = sorted[i]
        end = sorted[i]
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`)
    parts.push(`${file}: ${ranges.join(', ')}`)
  }
  return parts.join(', ')
}

function cli() {
  try {
    const args = process.argv.slice(2)
    let diffPath, findingsPath, threshold = DEFAULT_OPTS.confidenceThreshold, useStdin = false
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--diff' && args[i + 1]) { diffPath = args[++i] }
      else if (args[i] === '--findings' && args[i + 1]) { findingsPath = args[++i] }
      else if (args[i] === '--stdin') { useStdin = true }
      else if (args[i] === '--threshold' && args[i + 1]) { threshold = parseFloat(args[++i]) || DEFAULT_OPTS.confidenceThreshold }
    }
    if (!diffPath || (!findingsPath && !useStdin)) {
      console.log(JSON.stringify({ kept: [], droppedCount: 0 }))
      return
    }
    const diff = readFileSync(diffPath, 'utf8')
    const changedLines = parseChangedLines(diff)
    let rawFindings
    if (useStdin) {
      rawFindings = JSON.parse(readFileSync(process.stdin.fd, 'utf8'))
    } else {
      rawFindings = JSON.parse(readFileSync(findingsPath, 'utf8'))
    }
    const findings = Array.isArray(rawFindings) ? rawFindings : (rawFindings.findings || [])
    const result = filterFindings(findings, changedLines, { confidenceThreshold: threshold })
    console.log(JSON.stringify({ kept: result.kept, droppedCount: result.dropped.length }))
  } catch {
    console.log(JSON.stringify({ kept: [], droppedCount: 0 }))
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ''))) {
  cli()
}
