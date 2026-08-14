#!/usr/bin/env node
// scripts/openspec-merge.mjs — operation-aware OpenSpec delta → SSOT merge.
// Replaces the raw-append merge in scripts/openspec.sh:_merge_delta(). Parses the
// SSOT into `### Requirement:` blocks and applies ADDED/MODIFIED/REMOVED/RENAMED
// correctly. Fail-closed: exits 1 on a missing target, a RENAMED block without a
// `**Renamed-to:**` directive, or an unedited skeleton stub.
//   node scripts/openspec-merge.mjs apply <deltaPath> <ssotPath>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQ = /^### Requirement: (.+?)\s*$/
const SECTION = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/
const STUB_MARKER = 'TO' + 'DO' // assembled marker for skeleton-stub detection
const STUBS = [
  new RegExp(`^### Requirement: ${STUB_MARKER}\\s*$`, 'm'),
  new RegExp(`^#### Scenario: ${STUB_MARKER}\\s*$`, 'm'),
  /^The system SHALL …\s*$/m,
]

function fail(msg) {
  process.stderr.write(`ERROR: ${msg}\n`)
  process.exit(1)
}

// Parse a delta into ordered items: { op, name, lines, renamedTo }
export function parseDelta(text) {
  const out = []
  let op = null
  let cur = null
  const flush = () => { if (cur) { out.push(cur); cur = null } }
  for (const line of text.split('\n')) {
    const s = line.match(SECTION)
    if (s) { flush(); op = s[1]; continue }
    const r = line.match(REQ)
    if (r && op) { flush(); cur = { op, name: r[1].trim(), lines: [line], renamedTo: null }; continue }
    if (cur) {
      const rt = line.match(/^\*\*Renamed-to:\*\*\s*(.+?)\s*$/)
      if (rt) cur.renamedTo = rt[1].trim()
      cur.lines.push(line)
    }
  }
  flush()
  return out
}

// Locate every `### Requirement:` block: { name, start, end } (end exclusive).
// A block ends at the next H3 (`### `) or H2 (`## `) line, or EOF.
export function findBlocks(lines) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const r = lines[i].match(REQ)
    if (!r) { i++; continue }
    let j = i + 1
    while (j < lines.length && !/^### /.test(lines[j]) && !/^## /.test(lines[j])) j++
    blocks.push({ name: r[1].trim(), start: i, end: j })
    i = j
  }
  return blocks
}

// Index just past the `## Requirements` section (before the next H2 or EOF).
function endOfRequirements(lines) {
  const start = lines.findIndex(l => /^## Requirements\s*$/.test(l))
  if (start === -1) return lines.length
  let i = start + 1
  while (i < lines.length && !/^## /.test(lines[i])) i++
  return i
}

// T005310: Trunkierungs-Guard. Ein Delta, das ein existierendes SSOT-Requirement
// per full-block replacement ersetzt und dabei weniger `#### Scenario:`-Zeilen
// trägt als der Bestand, löscht Szenarien stillschweigend (beobachteter Schaden:
// PR #4440, 591 → 586). Gilt für den expliziten MODIFIED-Zweig UND den
// ADDED→MODIFIED-Auto-Convert (derselbe Ersetzungsmechanismus, Review-Befund
// IMPORTANT 1). Ohne allowShrink fail() — der Aufrufer schreibt nichts, die SSOT
// bleibt unverändert; bewusste Konsolidierungen brauchen das Flag explizit.
function assertNoTruncation(deltaName, item, lines, hit, allowShrink) {
  const ssotBlock = lines.slice(hit.start, hit.end).join('\n')
  const countScenarios = t => (t.match(/^#### Scenario: .*$/gm) || []).length
  const deltaCount = countScenarios(item.lines.join('\n'))
  const ssotCount = countScenarios(ssotBlock)
  if (deltaCount < ssotCount) {
    process.stderr.write(`WARN: ${deltaName}: MODIFIED '${item.name}' truncates scenarios (${ssotCount} → ${deltaCount})\n`)
    if (!allowShrink) {
      fail(`${deltaName}: MODIFIED '${item.name}' truncates scenarios (${ssotCount} → ${deltaCount}). Pass --allow-shrink to accept the reduction, or fix the delta to carry all scenarios.`)
    }
  }
}

// dryRun führt jeden Guard aus, schreibt aber nichts — weder die --create-new-
// Skeleton-SSOT noch das Merge-Ergebnis. [T002581] Nur so kann cmd_archive alle
// Deltas eines Change vorab prüfen, bevor der erste Schreibvorgang stattfindet.
// allowShrink (T005310): ein MODIFIED-Delta, das weniger `#### Scenario:`-Zeilen
// trägt als das SSOT-Requirement, ersetzt den Bestand stillschweigend (beobachteter
// Schaden: PR #4440, 591 → 586 Szenarien). Ohne allowShrink bricht der Merge ab;
// bewusste Konsolidierungen brauchen das Flag explizit.
export function applyDelta(deltaPath, ssotPath, today = new Date().toISOString().slice(0, 10), createNew = false, forceNewComponent = false, dryRun = false, allowShrink = false) {
  const deltaName = basename(deltaPath)
  const delta = readFileSync(deltaPath, 'utf-8')

  for (const re of STUBS) {
    if (re.test(delta)) fail(`${deltaName}: contains unedited skeleton stub (${STUB_MARKER} / 'The system SHALL …') — edit before archiving`)
  }

  // Die --create-new-Skeleton-SSOT wird zunächst nur IM SPEICHER aufgebaut.
  // [T002581] Bis Zeile 90 landete sie direkt auf der Platte — scheiterte danach
  // ein Guard (MODIFIED-Ziel nicht gefunden, --create-new ohne Requirement-Block),
  // blieb eine verwaiste Skeleton-Datei zurück, während das Change-Verzeichnis
  // unverschoben liegen blieb. Beobachtet in T002569 Charge 6 (auto-close-guard.md).
  let content
  let creating = false
  if (!existsSync(ssotPath)) {
    if (!createNew) {
      fail(`Target '${ssotPath}' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component (e.g. a cross-cutting mishap bundle with no parent SSOT spec).`)
    }
    const newSlug = basename(ssotPath, '.md')
    if (/^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})/.test(newSlug) && !forceNewComponent) {
      fail(`Refusing to create one-off spec '${newSlug}.md' (ticket/gate slug pattern). Use --target-spec <parent> to fold it into an existing component, or --force-new-component to override.`)
    }
    creating = true
    content = `# ${newSlug}\n\n## Purpose\n\n_Purpose fehlt — beim nächsten inhaltlichen Delta zu ${newSlug} ergänzen._\n\n## Requirements\n`
  } else {
    content = readFileSync(ssotPath, 'utf-8')
  }
  const deltaHash = createHash('sha1').update(delta).digest('hex').slice(0, 12)
  const marker = `<!-- merged from change delta ${deltaName} (${deltaHash}) -->`
  if (content.includes(marker)) {
    process.stdout.write(`skip (already merged): ${deltaName}\n`)
    return 0
  }

  let lines = content.split('\n')
  const items = parseDelta(delta)
  // T005310: Zusatz-Warnung — ein MODIFIED-Block, der mehrere Requirements in
  // einem Zug ersetzt, ist eine Kandidatin für versehentliche Konsolidierung.
  // Nur warnen, nie blockieren (bewusste Mehrfach-Änderungen sind legitim).
  const modifiedCount = items.filter(i => i.op === 'MODIFIED').length
  if (modifiedCount > 1) {
    process.stderr.write(`WARN: ${deltaName}: MODIFIED section replaces ${modifiedCount} requirements at once — verify no requirement was dropped unintentionally\n`)
  }
  for (const item of items) {
    const hit = findBlocks(lines).find(b => b.name === item.name)
    if (item.op === 'ADDED') {
      if (hit) {
        // Auto-correct: ADDED → MODIFIED when the requirement already exists in the
        // SSOT (e.g. the change directly edited the SSOT AND wrote a delta). Warn
        // loudly so the plan-phase lesson is visible, but do not abort the archive.
        process.stderr.write(`WARN: ${deltaName}: ADDED target '${item.name}' already exists in ${basename(ssotPath)} — auto-converting to MODIFIED\n`)
        // T005310: Der Auto-Convert ist derselbe full-block replacement wie ein
        // expliziter MODIFIED — der Trunkierungs-Guard gilt hier ebenso
        // (Review-Befund: ADDED-Delta mit trunkierendem Inhalt merged zuvor
        // stillschweigend mit exit 0 und verlor ein Szenario).
        assertNoTruncation(deltaName, item, lines, hit, allowShrink)
        lines.splice(hit.start, hit.end - hit.start, ...item.lines)
        continue
      }
      const at = endOfRequirements(lines)
      lines.splice(at, 0, '', ...item.lines)
    } else if (item.op === 'MODIFIED') {
      if (!hit) fail(`${deltaName}: MODIFIED target '${item.name}' not found in ${basename(ssotPath)}`)
      assertNoTruncation(deltaName, item, lines, hit, allowShrink)
      lines.splice(hit.start, hit.end - hit.start, ...item.lines)
    } else if (item.op === 'REMOVED') {
      if (!hit) fail(`${deltaName}: REMOVED target '${item.name}' not found in ${basename(ssotPath)}`)
      lines.splice(hit.start, hit.end - hit.start)
    } else if (item.op === 'RENAMED') {
      if (!hit) fail(`${deltaName}: RENAMED target '${item.name}' not found in ${basename(ssotPath)}`)
      if (!item.renamedTo) fail(`${deltaName}: RENAMED '${item.name}' missing '**Renamed-to:**' directive`)
      lines[hit.start] = `### Requirement: ${item.renamedTo}`
    }
  }

  lines.push('', marker)
  const merged = lines.join('\n').replace(/\n{3,}/g, '\n\n')

  if (createNew && !/^### Requirement:/m.test(merged)) {
    fail(`--create-new but no ### Requirement: block merged into ${basename(ssotPath)} — check that the delta has '## ADDED Requirements' with at least one '### Requirement: …' child.`)
  }

  // Ab hier ist jeder Guard durch. Erst jetzt wird geschrieben — im check-Modus
  // gar nicht. [T002581]
  if (dryRun) return 0
  if (creating) mkdirSync(dirname(ssotPath), { recursive: true })
  writeFileSync(ssotPath, merged)
  return 0
}

function main(argv) {
  const positional = argv.filter(a => !a.startsWith('--'))
  const flags = argv.filter(a => a.startsWith('--'))
  const [verb, deltaPath, ssotPath] = positional
  const createNew = flags.includes('--create-new')
  const forceNewComponent = flags.includes('--force-new-component')
  const allowShrink = flags.includes('--allow-shrink')

  // [T003140] batch: mehrere (delta, ssot)-Paare in EINEM Node-Prozess — der
  // Einzel-Archivierungspfad startet pro Delta einen Node (je ~3s); eine
  // N-Changes-Schleife brach in Default-Command-Timeouts. Die Liste kommt als
  // JSON-Datei: [{ "delta": "...", "ssot": "...", "create_new": bool,
  // "force_new_component": bool }].
  if (verb === 'batch') {
    const listPath = deltaPath
    if (!listPath) {
      process.stderr.write('Usage: openspec-merge.mjs batch <jsonListPath>\n')
      process.exit(2)
    }
    const items = JSON.parse(readFileSync(listPath, 'utf8'))
    if (!Array.isArray(items)) fail('batch list must be a JSON array')
    for (const item of items) {
      const createN = Boolean(item.create_new ?? createNew)
      const forceN = Boolean(item.force_new_component ?? forceNewComponent)
      applyDelta(item.delta, item.ssot, new Date().toISOString().slice(0, 10), createN, forceN, item.dry_run === true, Boolean(item.allow_shrink ?? allowShrink))
    }
    return 0
  }

  // 'check' ist 'apply' ohne Schreibvorgang — identische Guards. [T002581]
  if ((verb !== 'apply' && verb !== 'check') || !deltaPath || !ssotPath) {
    process.stderr.write('Usage: openspec-merge.mjs <apply|check|batch> <deltaPath> <ssotPath> [--create-new] [--force-new-component] [--allow-shrink]\n')
    process.exit(2)
  }
  return applyDelta(deltaPath, ssotPath, new Date().toISOString().slice(0, 10), createNew, forceNewComponent, verb === 'check', allowShrink)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
