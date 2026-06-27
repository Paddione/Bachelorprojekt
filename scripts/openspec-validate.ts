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

function validateDeltaFile(filePath: string): Pick<ValidationResult, 'errors'> {
  const content = readFileSync(filePath, 'utf-8')
  const errors: string[] = []

  if (!/^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/m.test(content)) {
    errors.push(`${filePath}: missing '## ADDED|MODIFIED|REMOVED Requirements' header`)
  }
  if (!/^### Requirement: /m.test(content)) {
    errors.push(`${filePath}: has no '### Requirement: ' (H3) entry`)
  }
  if (/^## Requirement: /m.test(content)) {
    errors.push(`${filePath}: uses H2 '## Requirement:' (must be H3 '### Requirement:')`)
  }

  return { errors }
}

export function validateChange(changeDir: string): ChangeValidation {
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
    const { errors: fileErrors } = validateDeltaFile(join(specsDir, capFile))
    errors.push(...fileErrors)
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
    const { result } = validateChange(join(changesDir, entry.name))
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
