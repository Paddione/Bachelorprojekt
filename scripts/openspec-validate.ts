import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface ChangeValidation {
  slug: string
  result: ValidationResult
}

// Names of `### Requirement:` under a given `## <op> Requirements` section.
function sectionRequirements(content: string, op: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  let inSec = false
  let cur: { name: string; body: string } | null = null
  const flush = () => { if (cur) { out.push(cur); cur = null } }
  for (const line of content.split('\n')) {
    const sec = line.match(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/)
    if (sec) { flush(); inSec = sec[1] === op; continue }
    if (!inSec) continue
    const r = line.match(/^### Requirement: (.+?)\s*$/)
    if (r) { flush(); cur = { name: r[1].trim(), body: '' }; continue }
    if (cur) cur.body += line + '\n'
  }
  flush()
  return out
}

function allRequirementNames(content: string): string[] {
  return [...content.matchAll(/^### Requirement: (.+?)\s*$/gm)].map(m => m[1].trim())
}

function validateDeltaFile(
  filePath: string,
  specsRoot?: string,
): { errors: string[]; warnings: string[] } {
  const content = readFileSync(filePath, 'utf-8')
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/m.test(content)) {
    errors.push(`${filePath}: missing '## ADDED|MODIFIED|REMOVED|RENAMED Requirements' header`)
  }
  if (!/^### Requirement: /m.test(content)) {
    errors.push(`${filePath}: has no '### Requirement: ' (H3) entry`)
  }
  if (/^## Requirement: /m.test(content)) {
    errors.push(`${filePath}: uses H2 '## Requirement:' (must be H3 '### Requirement:')`)
  }

  // Stub detection (reported as warnings so in-flight skeletons don't break the gate).
  const STUB_MARKER = 'TO' + 'DO' // assembled marker for skeleton-stub detection
  if (new RegExp(`^### Requirement: ${STUB_MARKER}\\s*$`, 'm').test(content)) warnings.push(`${filePath}: unedited stub '### Requirement: ${STUB_MARKER}'`)
  if (new RegExp(`^#### Scenario: ${STUB_MARKER}\\s*$`, 'm').test(content)) warnings.push(`${filePath}: unedited stub '#### Scenario: ${STUB_MARKER}'`)
  if (/^The system SHALL …\s*$/m.test(content)) warnings.push(`${filePath}: unexpanded 'The system SHALL …' stub`)

  // RENAMED blocks must carry a direction directive.
  for (const { name, body } of sectionRequirements(content, 'RENAMED')) {
    if (!/\*\*Renamed-to:\*\*/.test(body)) warnings.push(`${filePath}: RENAMED '${name}' missing '**Renamed-to:**' directive`)
  }

  // Cross-reference: MODIFIED/REMOVED/RENAMED targets should exist in the SSOT.
  if (specsRoot) {
    const ssotPath = join(specsRoot, basename(filePath))
    const targets = [
      ...sectionRequirements(content, 'MODIFIED'),
      ...sectionRequirements(content, 'REMOVED'),
      ...sectionRequirements(content, 'RENAMED'),
    ].map(t => t.name)
    if (targets.length > 0) {
      if (!existsSync(ssotPath)) {
        warnings.push(`${filePath}: MODIFIED/REMOVED/RENAMED but SSOT ${ssotPath} is absent`)
      } else {
        const present = new Set(allRequirementNames(readFileSync(ssotPath, 'utf-8')))
        for (const t of targets) {
          if (!present.has(t)) warnings.push(`${filePath}: target '${t}' not found in SSOT ${basename(ssotPath)}`)
        }
      }
    }
  }

  return { errors, warnings }
}

export function validateChange(changeDir: string, specsRoot?: string): ChangeValidation {
  const slug = basename(changeDir)
  const errors: string[] = []
  const warnings: string[] = []

  const specsDir = join(changeDir, 'specs')
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    return { slug, result: { ok: false, errors: [`${slug}: missing specs/ delta dir`], warnings } }
  }

  const capFiles = readdirSync(specsDir).filter(f => f.endsWith('.md'))
  if (capFiles.length === 0) {
    return { slug, result: { ok: false, errors: [`${slug}: specs/ has no capability .md`], warnings } }
  }

  if (!existsSync(join(changeDir, '.ticket'))) {
    warnings.push(`${slug}: has no .ticket link`)
  }

  for (const capFile of capFiles) {
    const { errors: fileErrors, warnings: fileWarnings } = validateDeltaFile(join(specsDir, capFile), specsRoot)
    errors.push(...fileErrors)
    warnings.push(...fileWarnings)
  }

  return { slug, result: { ok: errors.length === 0, errors, warnings } }
}

/**
 * Validate a single SSOT spec file under `openspec/specs/`. Enforces:
 *   - `## Purpose` H2 header is present
 *   - `## Requirements` H2 header is present
 *   - at least one `### Requirement:` H3 entry is present under Requirements
 */
export function validateSpec(specFile: string): Pick<ValidationResult, 'errors'> {
  const content = readFileSync(specFile, 'utf-8')
  const errors: string[] = []

  if (!/^## Purpose\s*$/m.test(content)) {
    errors.push(`${specFile}: missing '## Purpose' H2 header`)
  }
  if (!/^## Requirements\s*$/m.test(content)) {
    errors.push(`${specFile}: missing '## Requirements' H2 header`)
  }
  if (!/^### Requirement: /m.test(content)) {
    errors.push(`${specFile}: has no '### Requirement: ' (H3) entry`)
  }
  if (/^## Requirement: /m.test(content)) {
    errors.push(`${specFile}: uses H2 '## Requirement:' (must be H3 '### Requirement:')`)
  }

  return { errors }
}

export function validateSpecsDir(specsDir: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    return { ok: true, errors: [], warnings: [`no specs/ dir at ${specsDir} (ok)`] }
  }

  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const { errors: fileErrors } = validateSpec(join(specsDir, entry.name))
    errors.push(...fileErrors)
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Check whether SSOT specs under openspec/specs/ are listed in openspec/config.yaml
 * OpenSpec-Komponenten. Emits WARN (never FAIL) for unlisted slugs.
 */
export function checkConfigDrift(openspecRoot: string): ValidationResult {
  const warnings: string[] = []

  const configPath = join(openspecRoot, 'config.yaml')
  const specsDir = join(openspecRoot, 'specs')

  if (!existsSync(configPath) || !existsSync(specsDir)) {
    return { ok: true, errors: [], warnings }
  }

  const configContent = readFileSync(configPath, 'utf-8')
  // Extract the OpenSpec-Komponenten value (block scalar or inline)
  const match = configContent.match(/OpenSpec-Komponenten:\s*\|?\s*([\s\S]*?)(?:\n\w|\n$|$)/)
  const componentSet = new Set<string>()
  if (match) {
    const raw = match[1]
    for (const part of raw.split(/[\n,]+/)) {
      const slug = part.trim()
      if (slug) componentSet.add(slug)
    }
  }

  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const slug = entry.name.replace(/\.md$/, '')
    if (!componentSet.has(slug)) {
      warnings.push(`WARN: ${slug} not listed in config.yaml OpenSpec-Komponenten`)
    }
  }

  return { ok: true, errors: [], warnings }
}

export function validateTree(openspecRoot: string): ValidationResult {
  const changesDir = join(openspecRoot, 'changes')
  const specsDir = join(openspecRoot, 'specs')

  if (!existsSync(changesDir)) {
    return { ok: true, errors: [], warnings: ['no changes/ dir under openspecRoot (ok)'] }
  }

  const allErrors: string[] = []
  const allWarnings: string[] = []

  // 1) Validate every change folder
  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    const { result } = validateChange(join(changesDir, entry.name), specsDir)
    allErrors.push(...result.errors)
    allWarnings.push(...result.warnings)
  }

  // 2) Validate every SSOT spec under openspec/specs/ (Purpose + Requirements headers)
  const specsResult = validateSpecsDir(specsDir)
  allErrors.push(...specsResult.errors)
  allWarnings.push(...specsResult.warnings)

  // 3) Check config drift — SSOT specs not listed in config.yaml
  const driftResult = checkConfigDrift(openspecRoot)
  allWarnings.push(...driftResult.warnings)

  return { ok: allErrors.length === 0, errors: allErrors, warnings: allWarnings }
}
