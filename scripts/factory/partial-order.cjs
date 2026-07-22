/**
 * scripts/factory/partial-order.cjs
 *
 * Dependency-based partial scheduling: topo-sort, ready-filter, done-skip.
 * Pure CommonJS — no DB/API imports. Used by pipeline-runner.js read-partials.
 *
 * Offline lint: node --check scripts/factory/partial-order.cjs
 */

// topoSort(manifest) -> [ids in dependency order]
// Throws Error('D2: unknown depends_on id: <id>') or Error('D2: dependency cycle: <a> -> <b> -> <a>')
function topoSort(manifest) {
  const byId = new Map()
  for (const m of manifest || []) {
    byId.set(m.id, m)
  }

  // Validate all depends_on references exist
  for (const m of manifest || []) {
    const deps = m.depends_on || []
    for (const d of deps) {
      if (!byId.has(d)) {
        throw new Error(`D2: unknown depends_on id: ${d}`)
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map()
  const adj = new Map()
  for (const m of manifest || []) {
    inDegree.set(m.id, 0)
    adj.set(m.id, [])
  }
  for (const m of manifest || []) {
    for (const d of (m.depends_on || [])) {
      adj.get(d).push(m.id)
      inDegree.set(m.id, (inDegree.get(m.id) || 0) + 1)
    }
  }

  const queue = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted = []
  while (queue.length > 0) {
    const id = queue.shift()
    sorted.push(id)
    for (const neighbor of (adj.get(id) || [])) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== (manifest || []).length) {
    // Find a cycle for the error message
    const remaining = (manifest || []).map((m) => m.id).filter((id) => !sorted.includes(id))
    const cycleStr = remaining.join(' -> ')
    throw new Error(`D2: dependency cycle: ${cycleStr}`)
  }

  return sorted
}

// readyPartials(manifest, doneIds) -> subset without open dependencies, topo-ordered
function readyPartials(manifest, doneIds) {
  const done = new Set(doneIds || [])
  const sorted = topoSort(manifest)
  return sorted.filter((id) => {
    const m = (manifest || []).find((x) => x.id === id)
    if (!m) return false
    if (done.has(id)) return false
    return (m.depends_on || []).every((d) => done.has(d))
  })
}

// orderAndFilter(manifest, doneIds) -> topo-ordered, non-done partials
function orderAndFilter(manifest, doneIds) {
  const done = new Set(doneIds || [])
  const sorted = topoSort(manifest)
  return sorted.filter((id) => !done.has(id))
}

module.exports = { topoSort, readyPartials, orderAndFilter }
