#!/usr/bin/env node
/**
 * dangling-interfaces-report.mjs — Stufe 2 des Dangling-Interfaces-Flows.
 *
 * Nimmt das Ergebnis von scripts/dangling-interfaces.mjs (exakter Abgleich),
 * kalibriert τ an exakt verbundenen Paaren (positiv) und deterministischen
 * Zufallspaaren (negativ), sucht Beinahe-Treffer unter den Waisen und schreibt
 * ein eigenständiges HTML-Kraftbild (inline CSS/SVG, kein CDN, kein Build).
 * Embedding: gehashte Token-/Zeichen-n-Gramm-Vektoren + Kosinus, rein lokal und
 * deterministisch — kein Modellserver, kein Netzwerk.
 *
 * Aufruf:
 *   node scripts/dangling-interfaces-report.mjs \
 *     --exact /tmp/dangling-exact.json \
 *     --json /tmp/dangling-report.json \
 *     --html /tmp/dangling-graph.html
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_SEED = 20260101
const EMBED_DIM = 512
const WILDCARD_SEGMENT = /^:[A-Za-z0-9_]+\*?$/
const MAX_GRAPH_PROVIDERS = 80
const MAX_GRAPH_CONSUMERS = 60

// ── Normalisierung (bewusst lokal: dieses Modul importiert das Inventar-Modul nicht) ──

function splitRoute(value) {
  let text = String(value ?? '')
    .trim()
    .split('#')[0]
    .split('?')[0]
    .replace(/\\/g, '/')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname
    } catch { /* Fallback: relativer Pfad bleibt stehen */ }
  }
  const segments = text.replace(/^\/+/, '').split('/').filter((segment) => segment.length > 0)
  if (segments[0] === 'api') segments.shift()
  return segments
}

// ── Embedding: signed hashing über Token- und Zeichen-n-Gramm-Merkmale ──

function hash32(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function charGrams(value, size) {
  const padded = `^${value}$`
  const grams = new Set()
  for (let index = 0; index + size <= padded.length; index += 1) {
    grams.add(padded.slice(index, index + size))
  }
  if (grams.size === 0) grams.add(padded)
  return grams
}

function features(text) {
  const weights = new Map()
  const add = (key, weight) => weights.set(key, (weights.get(key) ?? 0) + weight)
  const segments = splitRoute(text)
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    add(`s:${segment}`, 1)
    for (const gram of charGrams(segment, 4)) add(`c:${gram}`, 0.45)
    if (index > 0) add(`b:${segments[index - 1]}|${segment}`, 0.6)
  }
  return weights
}

function hashInto(vector, key, weight) {
  const hash = hash32(key)
  const index = hash % vector.length
  const sign = (hash & 0x80000000) === 0 ? 1 : -1
  vector[index] += sign * weight
}

function normalized(vector) {
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let index = 0; index < vector.length; index += 1) vector[index] /= norm
  }
  return vector
}

export function embed(text) {
  const vector = new Float64Array(EMBED_DIM)
  for (const [feature, weight] of features(text)) hashInto(vector, feature, weight)
  return normalized(vector)
}

/** Kurzes Einzelsegment-Vektor (3-Gramm) — feinere Auflösung für Tippfehler. */
function segmentEmbed(segment) {
  const vector = new Float64Array(EMBED_DIM)
  for (const gram of charGrams(segment, 3)) hashInto(vector, `t:${gram}`, 1)
  return normalized(vector)
}

function asVector(value) {
  if (typeof value === 'string') return embed(value)
  if (value && typeof value.length === 'number') return value
  return embed(String(value ?? ''))
}

export function cosine(left, right) {
  const a = asVector(left)
  const b = asVector(right)
  const size = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) normA += a[index] * a[index]
  for (let index = 0; index < b.length; index += 1) normB += b[index] * b[index]
  for (let index = 0; index < size; index += 1) dot += a[index] * b[index]
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

function levenshtein(left, right) {
  if (left === right) return 0
  const previous = new Array(right.length + 1)
  for (let index = 0; index <= right.length; index += 1) previous[index] = index
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column]
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + cost)
      diagonal = saved
    }
  }
  return previous[right.length]
}

function charSimilarity(left, right) {
  if (left === right) return 1
  const longest = Math.max(left.length, right.length)
  if (longest === 0) return 0
  return 1 - levenshtein(left, right) / longest
}

function round(value, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Ähnlichkeit zweier Routen in [0, 1].
 *
 * Strukturelle Zulässigkeit zuerst: Ein Beinahe-Treffer ist eine Route im
 * SELBEN Elternpfad mit abweichendem Endsegment (Tippfehler, Plural, Umbenennung
 * des letzten Glieds). Fremde Elternpfade bleiben unter 0.2 — sonst würden bloß
 * verwandte Ressourcen (`/admin/projekte/create` vs. `/admin/subprojekte/create`)
 * das Ergebnis fluten. Innerhalb des Elternpfads: 30 % Basispunkt + 70 %
 * Endsegment-Ähnlichkeit aus halber Editierdistanz und halber n-Gramm-Kosinus.
 * Wildcard-Enden (`:id`) zählen nur 0.35, weil ein gemeinsames Platzhalter-Ende
 * keine Nähe belegt.
 */
export function similarity(left, right) {
  const a = splitRoute(left)
  const b = splitRoute(right)
  if (a.length === 0 || b.length === 0) return 0
  if (a.join('/') === b.join('/')) return 1
  const tailA = a[a.length - 1]
  const tailB = b[b.length - 1]
  const parentA = a.slice(0, -1).join('/')
  const parentB = b.slice(0, -1).join('/')

  if (parentA !== parentB) {
    return round(0.2 * cosine(embed(parentA), embed(parentB)), 4)
  }

  const bothWildcard = WILDCARD_SEGMENT.test(tailA) && WILDCARD_SEGMENT.test(tailB)
  const tail = bothWildcard
    ? 0.35
    : 0.5 * charSimilarity(tailA, tailB) + 0.5 * cosine(segmentEmbed(tailA), segmentEmbed(tailB))
  return round(Math.max(0, Math.min(1, 0.3 + 0.7 * tail)), 4)
}

// ── τ-Kalibrierung ──

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function samplePairScores(texts, seed, count) {
  const unique = [...new Set(texts.map((text) => String(text)).filter((text) => text.length > 0))].sort()
  if (unique.length < 2) return []
  const random = mulberry32(seed)
  const target = Math.min(400, Math.max(24, unique.length * 4))
  const scores = []
  let guard = 0
  while (scores.length < target && guard < target * 20) {
    guard += 1
    const left = Math.floor(random() * unique.length)
    const right = Math.floor(random() * unique.length)
    if (left === right) continue
    scores.push(similarity(unique[left], unique[right]))
  }
  return scores
}

function percentile(scores, fraction) {
  if (scores.length === 0) return 0
  const sorted = [...scores].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index]
}

/**
 * τ aus Daten statt aus Bauchgefühl: positives = exakt verbundene Paare,
 * negatives = Zufallspaare (deterministischer Seed). Gewählt wird die
 * NIEDRIGSTE Schwelle, die ≥ 98 % der Positiva hält und ≤ 2 % der Negativa
 * durchlässt; findet sich keine, die beste Trennung (TPR − FPR).
 */
export function calibrateThreshold(input = {}) {
  const positives = Array.isArray(input.positives) ? input.positives : []
  const seed = Number.isFinite(input.seed) ? input.seed : DEFAULT_SEED
  const positiveScores = positives.map(([left, right]) => similarity(left, right))
  // Negativ-Pool ist bewusst das ganze Routen-Universum, nicht nur die
  // Treffertexte: sonst kalibriert τ gegen eine zu leichte Stichprobe.
  const pool = Array.isArray(input.pool) ? input.pool : positives.flat()
  const negativeScores = Array.isArray(input.negatives)
    ? input.negatives.map(([left, right]) => similarity(left, right))
    : samplePairScores(pool, seed)

  const stats = {
    positiveMin: positiveScores.length ? Math.min(...positiveScores) : 0,
    positiveMax: positiveScores.length ? Math.max(...positiveScores) : 0,
    negativeP50: round(percentile(negativeScores, 0.5), 4),
    negativeP95: round(percentile(negativeScores, 0.95), 4),
    negativeMax: negativeScores.length ? Math.max(...negativeScores) : 0,
    positiveCount: positiveScores.length,
    negativeCount: negativeScores.length,
  }
  const separation = round(stats.positiveMin - stats.negativeP95, 4)

  if (positiveScores.length === 0) {
    return {
      tau: 0.85,
      positives: positiveScores,
      negatives: negativeScores,
      tpr: 0,
      fpr: 0,
      separation,
      stats,
      method: 'fallback-no-positives',
    }
  }

  const boundaries = [...new Set([...positiveScores, ...negativeScores])].sort((left, right) => left - right)
  const candidates = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    candidates.push((boundaries[index] + boundaries[index + 1]) / 2)
  }
  if (candidates.length === 0) candidates.push(0.5)

  const evaluate = (tau) => ({
    tpr: positiveScores.filter((score) => score >= tau).length / positiveScores.length,
    fpr: negativeScores.length
      ? negativeScores.filter((score) => score >= tau).length / negativeScores.length
      : 0,
  })

  let chosen = null
  // Stufe 1: niedrigste Schwelle mit vollständiger Positiv-Trefferquote und
  // NULL Falsch-Positiven. Für ein Waisen-Werkzeug zählt Präzision: eine
  // erfundene Kante ist teurer als ein nicht gemeldeter Beinahe-Treffer.
  for (const tau of candidates) {
    const measured = evaluate(tau)
    if (measured.tpr >= 0.98 && measured.fpr === 0) {
      chosen = { tau, ...measured, method: 'lowest-tau-tpr98-fpr0' }
      break
    }
  }
  // Stufe 2: falls kein trennscharfer Punkt existiert, ≤ 2 % Falsch-Positive.
  if (!chosen) {
    for (const tau of candidates) {
      const measured = evaluate(tau)
      if (measured.tpr >= 0.98 && measured.fpr <= 0.02) {
        chosen = { tau, ...measured, method: 'lowest-tau-tpr98-fpr2' }
        break
      }
    }
  }
  if (!chosen) {
    let best = null
    for (const tau of candidates) {
      const measured = evaluate(tau)
      const quality = measured.tpr - measured.fpr
      if (!best || quality > best.quality + 1e-9 || (Math.abs(quality - best.quality) <= 1e-9 && tau > best.tau)) {
        best = { tau, ...measured, quality }
      }
    }
    chosen = { tau: best?.tau ?? 0.85, tpr: best?.tpr ?? 0, fpr: best?.fpr ?? 0, method: 'best-tpr-fpr' }
  }

  return {
    tau: round(chosen.tau, 4),
    positives: positiveScores,
    negatives: negativeScores,
    tpr: round(chosen.tpr, 4),
    fpr: round(chosen.fpr, 4),
    separation,
    stats,
    method: chosen.method,
  }
}

// ── Beinahe-Treffer ──

function asProvider(entry) {
  return typeof entry === 'string'
    ? { route: entry, normalized: entry }
    : { route: entry?.route ?? entry?.normalized, normalized: entry?.normalized ?? entry?.route }
}

function asConsumer(entry) {
  return typeof entry === 'string' ? { target: entry } : { target: entry?.target ?? entry?.route }
}

/** Kanten von Verbraucher-Waisen zu Anbieter-Waisen mit Score ≥ τ, Top-N je Seite. */
export function nearMiss(providers, consumers, tau, options = {}) {
  const limit = Number.isFinite(options.limitPerSide) ? options.limitPerSide : 10
  const providerList = (providers ?? []).map(asProvider).filter((entry) => entry.normalized)
  const consumerList = (consumers ?? []).map(asConsumer).filter((entry) => entry.target)

  const scored = []
  for (const consumer of consumerList) {
    for (const provider of providerList) {
      if (consumer.target === provider.normalized) continue
      const score = similarity(consumer.target, provider.normalized)
      if (score >= tau) scored.push({ from: consumer.target, to: provider.normalized, score })
    }
  }
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to),
  )

  const perConsumer = new Map()
  const perProvider = new Map()
  const edges = []
  for (const edge of scored) {
    const consumerCount = perConsumer.get(edge.from) ?? 0
    const providerCount = perProvider.get(edge.to) ?? 0
    if (consumerCount >= limit || providerCount >= limit) continue
    perConsumer.set(edge.from, consumerCount + 1)
    perProvider.set(edge.to, providerCount + 1)
    edges.push(edge)
  }
  return edges
}

export function buildReport({ exact, seed = DEFAULT_SEED, limitPerSide = 10 } = {}) {
  if (!exact || typeof exact !== 'object') throw new Error('buildReport: exakter Abgleich (JSON) fehlt')
  const positives = (exact.matched ?? []).map((entry) => [entry.route, entry.target])
  const orphanProviders = exact.orphanProviders ?? []
  const orphanConsumers = exact.orphanConsumers ?? []
  const pool = [
    ...(exact.matched ?? []).flatMap((entry) => [entry.route, entry.target]),
    ...orphanProviders.map((entry) => entry.route),
    ...orphanConsumers.map((entry) => entry.target),
  ]
  const calibration = calibrateThreshold({ positives, seed, pool })
  const edges = nearMiss(orphanProviders, orphanConsumers, calibration.tau, { limitPerSide })

  return {
    tau: calibration.tau,
    calibration: {
      tau: calibration.tau,
      method: calibration.method,
      tpr: calibration.tpr,
      fpr: calibration.fpr,
      separation: calibration.separation,
      stats: calibration.stats,
      positives: calibration.positives,
      negatives: calibration.negatives,
    },
    counts: { ...(exact.counts ?? {}), nearMiss: edges.length },
    nearMiss: edges,
    orphanProviders: orphanProviders.map((entry) => ({
      route: entry.route,
      sourceFile: entry.sourceFile ?? null,
    })),
    orphanConsumers,
    warnings: exact.warnings ?? [],
  }
}

// ── HTML-Kraftbild (eigenständig, deterministisch) ──

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clusterKey(route) {
  const segments = splitRoute(route)
  return segments.length > 1 ? segments[0] : '(root)'
}

function truncate(value, max) {
  const text = String(value)
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function layoutGraph(providerNodes, consumerNodes, edges, width) {
  const nodes = [...providerNodes, ...consumerNodes]
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const clusters = [...new Set(providerNodes.map((node) => node.cluster))].sort()

  // Cluster-Raster: 3 Spalten à 2 Knoten, Zeilenhöhe folgt dem größten Cluster.
  const clusterColumns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(clusters.length || 1))))
  const cellWidth = (width - 90) / clusterColumns
  let cursorY = 96
  for (let rowStart = 0; rowStart < clusters.length; rowStart += clusterColumns) {
    const rowClusters = clusters.slice(rowStart, rowStart + clusterColumns)
    const memberRows = Math.max(
      1,
      ...rowClusters.map((cluster) => Math.ceil(providerNodes.filter((node) => node.cluster === cluster).length / 2)),
    )
    rowClusters.forEach((cluster, column) => {
      const members = providerNodes.filter((node) => node.cluster === cluster)
      members.forEach((node, index) => {
        node.x = 52 + column * cellWidth + (index % 2) * 190
        node.y = cursorY + 26 + Math.floor(index / 2) * 50
      })
    })
    cursorY += memberRows * 50 + 72
  }

  const consumerColumns = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(consumerNodes.length || 1))))
  const consumerTop = cursorY + 40
  consumerNodes.forEach((node, index) => {
    node.x = 60 + (index % consumerColumns) * ((width - 120) / consumerColumns)
    node.y = consumerTop + Math.floor(index / consumerColumns) * 62
  })
  const height = Math.max(560, consumerTop + Math.ceil(consumerNodes.length / consumerColumns) * 62 + 56)

  const starts = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]))

  for (let iteration = 0; iteration < 140; iteration += 1) {
    const forces = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]))
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left]
        const b = nodes[right]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = Math.max(28, Math.hypot(dx, dy))
        const strength = 2600 / (distance * distance)
        const ux = distance === 0 ? 1 : dx / distance
        const uy = distance === 0 ? 0 : dy / distance
        const forceA = forces.get(a.id)
        const forceB = forces.get(b.id)
        forceA.x += ux * strength
        forceA.y += uy * strength
        forceB.x -= ux * strength
        forceB.y -= uy * strength
      }
    }
    for (const edge of edges) {
      const a = byId.get(edge.from)
      const b = byId.get(edge.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const strength = (distance - 240) * 0.004
      const ux = dx / distance
      const uy = dy / distance
      forces.get(a.id).x += ux * strength
      forces.get(a.id).y += uy * strength
      forces.get(b.id).x -= ux * strength
      forces.get(b.id).y -= uy * strength
    }
    for (const node of nodes) {
      const force = forces.get(node.id)
      const start = starts.get(node.id)
      node.x += Math.max(-12, Math.min(12, force.x)) + (start.x - node.x) * 0.02
      node.y += Math.max(-12, Math.min(12, force.y)) + (start.y - node.y) * 0.02
      node.x = Math.max(20, Math.min(width - 200, node.x))
      node.y = Math.max(80, Math.min(height - 40, node.y))
    }
  }

  return { nodes, clusters, height }
}

/** Anbieter-Waisen über die Cluster streuen statt alphabetisch abschneiden. */
function selectBalanced(entries, limit, keyOf) {
  const groups = new Map()
  for (const entry of entries) {
    const group = groups.get(keyOf(entry)) ?? []
    group.push(entry)
    groups.set(keyOf(entry), group)
  }
  const keys = [...groups.keys()].sort()
  const picked = []
  while (picked.length < limit) {
    let added = false
    for (const key of keys) {
      const group = groups.get(key)
      if (!group || group.length === 0) continue
      picked.push(group.shift())
      added = true
      if (picked.length >= limit) break
    }
    if (!added) break
  }
  return picked.sort((left, right) => left.route.localeCompare(right.route))
}

export function renderGraphHtml(report, options = {}) {
  const width = 1240
  const providerSource = report.orphanProviders ?? []
  const consumerSource = report.orphanConsumers ?? []
  const shownProviders = selectBalanced(providerSource, MAX_GRAPH_PROVIDERS, (entry) => clusterKey(entry.route))
  const shownConsumers = consumerSource.slice(0, MAX_GRAPH_CONSUMERS)

  const providerNodes = shownProviders.map((entry, index) => ({
    id: entry.route,
    label: entry.route,
    kind: 'provider',
    cluster: clusterKey(entry.route),
    x: 0,
    y: 0,
    index,
  }))
  const consumerNodes = shownConsumers.map((entry, index) => ({
    id: entry.target,
    label: entry.target,
    kind: 'consumer',
    cluster: 'consumers',
    x: 0,
    y: 0,
    index,
  }))

  const visibleIds = new Set([...providerNodes, ...consumerNodes].map((node) => node.id))
  const edges = (report.nearMiss ?? []).filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
  const graph = layoutGraph(providerNodes, consumerNodes, edges, width)
  const height = graph.height
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))

  const clusterBoxes = graph.clusters
    .map((cluster) => {
      const members = providerNodes.filter((node) => node.cluster === cluster)
      if (members.length === 0) return ''
      const xs = members.map((node) => node.x)
      const ys = members.map((node) => node.y)
      const left = Math.min(...xs) - 18
      const top = Math.min(...ys) - 22
      const boxWidth = Math.max(...xs) - Math.min(...xs) + 220
      const boxHeight = Math.max(...ys) - Math.min(...ys) + 58
      return (
        `<rect class="cluster" x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${boxWidth.toFixed(1)}" ` +
        `height="${boxHeight.toFixed(1)}" rx="14" />` +
        `<text class="cluster-label" x="${(left + 10).toFixed(1)}" y="${(top + 15).toFixed(1)}">` +
        `${escapeXml(truncate(cluster, 34))} (${members.length})</text>`
      )
    })
    .join('\n')

  const edgeMarkup = edges
    .map((edge) => {
      const from = nodeById.get(edge.from)
      const to = nodeById.get(edge.to)
      if (!from || !to) return ''
      const x1 = from.x + 84
      const y1 = from.y - 14
      const x2 = to.x + 84
      const y2 = to.y + 18
      const middleX = (x1 + x2) / 2
      const middleY = (y1 + y2) / 2
      return (
        `<path class="near-miss-edge" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${middleX.toFixed(1)} ${(y1 - 60).toFixed(1)}, ` +
        `${middleX.toFixed(1)} ${(y2 + 60).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" />` +
        `<text class="score" x="${middleX.toFixed(1)}" y="${(middleY - 4).toFixed(1)}">` +
        `${edge.score.toFixed(2)}</text>`
      )
    })
    .join('\n')

  const nodeMarkup = graph.nodes
    .map((node) => {
      const isConsumer = node.kind === 'consumer'
      const className = isConsumer ? 'node consumer' : 'node provider'
      const label = truncate(node.label, 30)
      return (
        `<g class="${className}">` +
        `<rect x="${node.x.toFixed(1)}" y="${(node.y - 16).toFixed(1)}" width="168" height="32" rx="8" />` +
        `<text x="${(node.x + 8).toFixed(1)}" y="${(node.y + 5).toFixed(1)}">${escapeXml(label)}</text>` +
        `<title>${escapeXml(node.label)}</title>` +
        `</g>`
      )
    })
    .join('\n')

  const counts = report.counts ?? {}
  const calibration = report.calibration ?? {}
  const stats = calibration.stats ?? {}
  const hiddenNote =
    providerSource.length > shownProviders.length || consumerSource.length > shownConsumers.length
      ? `<p class="note">Aus Platzgründen gezeigt: ${shownProviders.length}/${providerSource.length} Anbieter-Waisen, ` +
        `${shownConsumers.length}/${consumerSource.length} Verbraucher-Waisen. Vollständig im JSON.</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(options.title ?? 'Dangling Interfaces — Kraftgraph')}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 28px; background: #f7f7f5; color: #1d1d1b;
         font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { margin: 0 0 18px; font-size: 13px; color: #55554f; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .card { background: #fff; border: 1px solid #e2e2dc; border-radius: 10px; padding: 10px 14px; min-width: 150px; }
  .card .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b63; }
  .card .v { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .card.near .v { color: #b3261e; }
  .card.prov .v { color: #b25f00; }
  .sheet { background: #fff; border: 1px solid #e2e2dc; border-radius: 14px; padding: 8px; overflow: auto; }
  svg { display: block; }
  .cluster { fill: #fff4e2; stroke: #e3a24b; stroke-dasharray: 4 4; stroke-width: 1; }
  .cluster-label { font-size: 11px; fill: #8a5200; font-weight: 600; }
  .node text { font-size: 11.5px; fill: #23231f; }
  .node rect { stroke-width: 1.2; }
  .node.provider rect { fill: #fff6e5; stroke: #c26a00; }
  .node.consumer rect { fill: #fdecec; stroke: #b3261e; }
  .node.consumer text { font-weight: 700; fill: #8c1d18; }
  .near-miss-edge { fill: none; stroke: #b3261e; stroke-width: 1.4; stroke-dasharray: 5 4; opacity: 0.85; }
  .score { font-size: 10.5px; fill: #b3261e; font-weight: 700; text-anchor: middle;
           paint-order: stroke; stroke: #fff; stroke-width: 3px; }
  .legend { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 14px; font-size: 12.5px; color: #45453f; }
  .legend span { display: inline-flex; align-items: center; gap: 7px; }
  .swatch { width: 26px; height: 12px; border-radius: 4px; display: inline-block; }
  .swatch.near { border: 0; border-top: 2px dashed #b3261e; height: 0; border-radius: 0; }
  .swatch.prov { background: #fff6e5; border: 1.4px solid #c26a00; }
  .swatch.cons { background: #fdecec; border: 1.4px solid #b3261e; }
  .note { font-size: 12px; color: #6b6b63; margin: 12px 0 0; }
</style>
</head>
<body>
<h1>Dangling Interfaces — Kraftgraph</h1>
<p class="meta">Anbieter-Waisen orange geclustert · Verbraucher-Waisen rot fett · Beinahe-Treffer rot gestrichelt mit Score ·
τ = ${Number.isFinite(report.tau) ? report.tau.toFixed(3) : '—'} (${escapeXml(calibration.method ?? 'n/a')})</p>
<div class="cards">
  <div class="card"><div class="k">Treffer (exakt)</div><div class="v">${counts.matched ?? 0}</div></div>
  <div class="card prov"><div class="k">Anbieter-Waisen</div><div class="v">${counts.orphanProviders ?? providerSource.length}</div></div>
  <div class="card"><div class="k">Verbraucher-Waisen</div><div class="v">${counts.orphanConsumers ?? consumerSource.length}</div></div>
  <div class="card near"><div class="k">Beinahe-Treffer</div><div class="v">${counts.nearMiss ?? edges.length}</div></div>
  <div class="card"><div class="k">Trennung (min pos − p95 neg)</div><div class="v">${Number.isFinite(calibration.separation) ? calibration.separation.toFixed(3) : '—'}</div></div>
  <div class="card"><div class="k">TPR / FPR bei τ</div><div class="v">${Number.isFinite(calibration.tpr) ? calibration.tpr.toFixed(3) : '—'} / ${Number.isFinite(calibration.fpr) ? calibration.fpr.toFixed(3) : '—'}</div></div>
</div>
<div class="sheet">
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"
     aria-label="Kraftgraph der Waisen und Beinahe-Treffer">
${clusterBoxes}
${edgeMarkup}
${nodeMarkup}
</svg>
</div>
<div class="legend">
  <span><i class="swatch prov"></i>Anbieter-Waise (Endpunkt ohne Aufrufer)</span>
  <span><i class="swatch cons"></i>Verbraucher-Waise (Aufruf ohne Anbieter, Laufzeitfehler)</span>
  <span><i class="swatch near"></i>Beinahe-Treffer (Embedding-Score ≥ τ)</span>
</div>
${hiddenNote}
<p class="note">Kalibrierung: ${stats.positiveCount ?? 0} Positivpaare (exakt verbunden), ${stats.negativeCount ?? 0} Zufallspaare (Seed ${DEFAULT_SEED}).
Negativ-Perzentile p50 ${stats.negativeP50 ?? '—'} · p95 ${stats.negativeP95 ?? '—'} · max ${stats.negativeMax ?? '—'}.</p>
</body>
</html>
`
}

// ── CLI ──

const USAGE = `dangling-interfaces-report — τ-Kalibrierung, Beinahe-Treffer, HTML-Kraftgraph

  node scripts/dangling-interfaces-report.mjs --exact <dangling-exact.json> [Optionen]

Optionen:
  --exact <datei>   Pflicht. Ausgabe von scripts/dangling-interfaces.mjs
  --json <datei>    JSON-Report (Default: dangling-report.json)
  --html <datei>    HTML-Kraftgraph (Default: dangling-graph.html)
  --seed <zahl>     Seed für die Zufallspaare der Kalibrierung (Default: ${DEFAULT_SEED})
  -h, --help        Diese Hilfe`

function parseArgs(argv) {
  const args = { exact: null, json: 'dangling-report.json', html: 'dangling-graph.html', seed: DEFAULT_SEED, help: false }
  const flags = new Map([
    ['--exact', 'exact'],
    ['--json', 'json'],
    ['--html', 'html'],
    ['--seed', 'seed'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help' || flag === '-h') {
      args.help = true
      continue
    }
    const key = flags.get(flag)
    if (!key) throw new Error(`Unbekanntes Argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} erwartet einen Wert`)
    args[key] = key === 'seed' ? Number.parseInt(value, 10) : value
    index += 1
  }
  if (!Number.isFinite(args.seed)) throw new Error('--seed erwartet eine ganze Zahl')
  return args
}

export function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`Fehler: ${error.message}`)
    console.error(USAGE)
    return 2
  }
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  if (!args.exact) {
    console.error('Fehler: --exact <dangling-exact.json> fehlt (Ausgabe von scripts/dangling-interfaces.mjs).')
    console.error(USAGE)
    return 2
  }

  let exact
  try {
    exact = JSON.parse(readFileSync(resolve(args.exact), 'utf8'))
  } catch (error) {
    console.error(`Fehler: --exact ${args.exact} nicht lesbar: ${error.message}`)
    return 2
  }

  const report = buildReport({ exact, seed: args.seed })
  const html = renderGraphHtml(report)

  const jsonPath = resolve(args.json)
  const htmlPath = resolve(args.html)
  mkdirSync(dirname(jsonPath), { recursive: true })
  mkdirSync(dirname(htmlPath), { recursive: true })
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(htmlPath, html)

  console.error(
    `dangling-interfaces-report: τ ${report.tau} (${report.calibration.method}) · ` +
      `Beinahe-Treffer ${report.counts.nearMiss} · Anbieter-Waisen ${report.counts.orphanProviders} · ` +
      `Verbraucher-Waisen ${report.counts.orphanConsumers}`,
  )
  console.log(
    JSON.stringify({
      tau: report.tau,
      method: report.calibration.method,
      counts: report.counts,
      json: jsonPath,
      html: htmlPath,
    }),
  )
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  process.exitCode = main()
}
