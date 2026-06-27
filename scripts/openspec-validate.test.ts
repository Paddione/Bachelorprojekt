import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { validateChange, validateTree } from './openspec-validate.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(REPO_ROOT, 'tests/unit/fixtures/openspec')

describe('validateChange', () => {
  it('passes a well-formed change', () => {
    const { result } = validateChange(join(FIXTURES, 'valid/changes/sample-change'))
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when heading level is H2 instead of H3', () => {
    const { result } = validateChange(join(FIXTURES, 'bad-heading/changes/sample-change'))
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /Requirement|H2|heading/i.test(e))).toBe(true)
  })

  it('fails when specs/ directory is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toMatch(/specs/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('fails when specs/ has no capability .md', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      mkdirSync(join(tmp, 'specs'), { recursive: true })
      writeFileSync(join(tmp, 'specs', 'cap.md'), '# nothing here\n')
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toMatch(/Requirement/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('warns but does not fail when .ticket is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      mkdirSync(join(tmp, 'specs'), { recursive: true })
      writeFileSync(
        join(tmp, 'specs', 'cap.md'),
        '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL …\n',
      )
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => /\.ticket/.test(w))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('validateTree — repo integration', () => {
  it('passes the actual openspec/ tree', () => {
    const { ok, errors } = validateTree(join(REPO_ROOT, 'openspec'))
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(ok).toBe(true)
  })

  it('returns ok when changes/ dir does not exist', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      const { ok } = validateTree(tmp)
      expect(ok).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('skips archive/ entries', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      // archive/ with invalid structure must NOT cause failures
      mkdirSync(join(tmp, 'changes/archive/2024-old/specs'), { recursive: true })
      writeFileSync(join(tmp, 'changes/archive/2024-old/specs/old.md'), '# garbage\n')
      const { ok } = validateTree(tmp)
      expect(ok).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
