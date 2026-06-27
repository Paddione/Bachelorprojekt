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

export function validateTree(openspecRoot: string): ValidationResult {
  const changesDir = join(openspecRoot, 'changes')

  if (!existsSync(changesDir)) {
    return { ok: true, errors: [], warnings: ['no changes/ dir under openspecRoot (ok)'] }
  }

  const allErrors: string[] = []
  const allWarnings: string[] = []

  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    const { result } = validateChange(join(changesDir, entry.name))
    allErrors.push(...result.errors)
    allWarnings.push(...result.warnings)
  }

  return { ok: allErrors.length === 0, errors: allErrors, warnings: allWarnings }
}
