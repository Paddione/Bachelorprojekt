import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { validateChange, validateTree } from './openspec-validate.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(REPO_ROOT, 'tests/unit/fixtures/openspec')
const BACKLOG_FILE = join(REPO_ROOT, 'tests/spec/openspec-workflow/t002573-backlog-slugs.txt')

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

  // [T003676] Frueher war dies ein reiner warning ("warns but does not fail when
  // .ticket is missing"). Die Umkehr auf fail-closed ist eine bewusste Entscheidung:
  // ein Change ohne .ticket liess den VERURSACHENDEN PR gruen durchlaufen, waehrend
  // der fail-closed BATS-Guard ticket-file-required.bats erst gegen den bereits
  // gemergten main-Stand laeuft. Folge: der Verursacher merged sauber, danach ist
  // jeder ANDERE offene PR blockiert — mit einer Fehlermeldung, die auf einen Change
  // zeigt, mit dem er nichts zu tun hat. Zweimal belegt am 2026-08-11 binnen einer
  // Stunde (PR #4231/T002929 und PR #4236/T003003).
  it('fails when .ticket is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      mkdirSync(join(tmp, 'specs'), { recursive: true })
      writeFileSync(
        join(tmp, 'specs', 'cap.md'),
        '## ADDED Requirements\n\n### Requirement: X\n\n#### Scenario: X\n\nThe system SHALL …\n',
      )
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /\.ticket/.test(e))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  // Positiv-Anker (T002356-M1) zum Test darueber: ohne ihn koennte die
  // .ticket-Regel jeden Change ablehnen und der Negativtest bliebe trotzdem gruen.
  it('passes the same change once .ticket is present', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      mkdirSync(join(tmp, 'specs'), { recursive: true })
      writeFileSync(
        join(tmp, 'specs', 'cap.md'),
        '## ADDED Requirements\n\n### Requirement: X\n\n#### Scenario: X\n\nThe system SHALL …\n',
      )
      writeFileSync(join(tmp, '.ticket'), 'T000001\n')
      const { result } = validateChange(tmp)
      expect(result.ok, result.errors.join('\n')).toBe(true)
      expect(result.errors.some(e => /\.ticket/.test(e))).toBe(false)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  // [T003676] Ein leeres .ticket ist kein gueltiger Link — dieselbe Zusicherung
  // trifft der BATS-Guard mit `[ -s "$d/.ticket" ]`. Ohne diesen Fall koennte eine
  // 0-Byte-Datei das Gate passieren und den Guard danach trotzdem rot faerben:
  // Gate und Guard wuerden sich widersprechen.
  it('fails when .ticket exists but is empty', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      mkdirSync(join(tmp, 'specs'), { recursive: true })
      writeFileSync(
        join(tmp, 'specs', 'cap.md'),
        '## ADDED Requirements\n\n### Requirement: X\n\n#### Scenario: X\n\nThe system SHALL …\n',
      )
      writeFileSync(join(tmp, '.ticket'), '   \n')
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /\.ticket/.test(e))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  // [T003676] Der T002573-Altbestand (42 Slugs) traegt bewusst kein .ticket. Die
  // Allowlist wird NICHT hier dupliziert — Validator und BATS-Guard lesen dieselbe
  // Datei tests/spec/openspec-workflow/t002573-backlog-slugs.txt. Zwei Kopien liefen
  // auseinander, und dann widersprechen sich Gate und Guard.
  it('exempts a T002573 backlog slug from the .ticket requirement', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-test-'))
    try {
      // Slug aus der echten Allowlist — nicht erfunden, sonst prueft der Test nichts.
      const backlogSlug = readFileSync(BACKLOG_FILE, 'utf-8')
        .split('\n').map(s => s.trim()).filter(Boolean)[0]
      expect(backlogSlug, 'Allowlist ist leer — Test waere vakuos').toBeTruthy()

      const changeDir = join(tmp, backlogSlug)
      mkdirSync(join(changeDir, 'specs'), { recursive: true })
      writeFileSync(
        join(changeDir, 'specs', 'cap.md'),
        '## ADDED Requirements\n\n### Requirement: X\n\n#### Scenario: X\n\nThe system SHALL …\n',
      )
      const { result } = validateChange(changeDir)
      expect(result.ok, result.errors.join('\n')).toBe(true)
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

describe('validateDeltaFile — T001262 hardening', () => {
  function tmpChange(deltaBody: string) {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-h-'))
    mkdirSync(join(tmp, 'specs'), { recursive: true })
    writeFileSync(join(tmp, 'specs', 'cap.md'), deltaBody)
    writeFileSync(join(tmp, '.ticket'), 'T000000\n')
    return tmp
  }

  it('accepts a RENAMED-only delta (no spurious missing-header error)', () => {
    const tmp = tmpChange('## RENAMED Requirements\n\n### Requirement: Old\n\n**Renamed-to:** New\n')
    try {
      const { result } = validateChange(tmp)
      expect(result.errors.some(e => /missing.*Requirements.*header/i.test(e))).toBe(false)
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  it('warns (not errors) on an unedited stub delta', () => {
    const STUB_MARKER = 'TO' + 'DO' // assembled marker for stub-detection tests
    const tmp = tmpChange(
      '## ADDED Requirements\n\n### Requirement: ' + STUB_MARKER +
        '\n\n#### Scenario: ' + STUB_MARKER + '\n\nThe system SHALL …\n'
    )
    try {
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => /stub/i.test(w))).toBe(true)
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  it('warns (not errors) when a MODIFIED target is absent from the SSOT', () => {
    const specsRoot = mkdtempSync(join(tmpdir(), 'openspec-ssot-'))
    writeFileSync(join(specsRoot, 'cap.md'),
      '## Purpose\n\nx\n\n## Requirements\n\n### Requirement: Present\n\nThe system SHALL exist.\n')
    const tmp = tmpChange(
      '## MODIFIED Requirements\n\n### Requirement: Absent\n\n#### Scenario: Absent\n\nThe system SHALL change.\n')
    try {
      const { result } = validateChange(tmp, specsRoot)
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => /Absent/.test(w) && /not found/i.test(w))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      rmSync(specsRoot, { recursive: true, force: true })
    }
  })
})


