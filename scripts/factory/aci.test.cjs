// scripts/factory/aci.test.cjs — Unit tests for ACI tools. node scripts/factory/aci.test.cjs -> exit 0.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const aci = require('./aci.cjs')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aci-test-'))

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8')
}

function rm(p) {
  try { fs.unlinkSync(p) } catch {}
}

// --- view tests ---
;(function testView() {
  const f = path.join(TMP, 'view-test.txt')
  write(f, Array.from({length: 20}, (_, i) => `line ${i + 1}`).join('\n'))

  // Full view
  let r = aci.view(f)
  assert(!r.failed)
  assert(r.total_lines === 20)
  assert(r.data.includes('line 1'))
  assert(r.data.includes('line 20'))

  // Range
  r = aci.view(f, 2, 5)
  assert(!r.failed)
  assert(r.data.includes('2: line 2'))
  assert(r.data.includes('5: line 5'))
  assert(!r.data.includes('1: line 1'))

  // Nonexistent
  r = aci.view('/nonexistent-file-12345.xyz')
  assert(r.failed)
  assert(r.error.includes('not found'))
  console.log('PASS: view')
})()

// --- search tests ---
;(function testSearch() {
  const f = path.join(TMP, 'search-test.ts')
  write(f, 'const x = 42;\nfunction hello() {}\n')

  r = aci.search('const x', f)
  assert(!r.failed)
  assert(r.count >= 1)
  console.log('PASS: search')
})()

// --- validator tests ---
;(function testValidator() {
  const shF = path.join(TMP, 'test-valid.sh')
  write(shF, '#!/usr/bin/env bash\necho "hello"\n')

  let v = aci.validate(shF)
  assert(v.valid)
  assert(v.label === 'bash -n')

  // Invalid shell
  write(shF, '#!/usr/bin/env bash\necho "hello\n')
  v = aci.validate(shF)
  assert(!v.valid)

  const jsF = path.join(TMP, 'test-valid.js')
  write(jsF, 'const x = 1;\n')
  v = aci.validate(jsF)
  assert(v.valid)
  assert(v.label === 'node --check')

  write(jsF, 'const x = ;\n')
  v = aci.validate(jsF)
  assert(!v.valid)
  console.log('PASS: validator')
})()

// --- edit + auto-revert tests ---
;(function testEdit() {
  const f = path.join(TMP, 'edit-test.js')
  const original = 'const a = 1;\nconst b = 2;\n'
  write(f, original)

  // Valid edit
  let r = aci.edit(f, 1, 2, 'const a = 100;')
  assert(!r.failed)
  assert(!r.reverted)
  const content = fs.readFileSync(f, 'utf8')
  assert(content.includes('const a = 100;'))
  assert(!content.includes('const b = 2;'))

  // Auto-revert on invalid edit
  write(f, original)
  r = aci.edit(f, 1, 2, 'const a = ;')  // syntax error
  assert(r.failed)
  assert(r.reverted)
  assert(r.error.includes('Validation'))
  // Verify original content restored
  const restored = fs.readFileSync(f, 'utf8')
  assert(restored === original, `Expected original content restored, got: ${restored}`)
  console.log('PASS: edit + auto-revert')
})()

// --- runTest tests ---
;(function testRunTest() {
  const jsF = path.join(TMP, 'runtest-test.js')
  write(jsF, 'const x = 42;\n')
  let r = aci.runTest(jsF)
  assert(!r.failed)

  const shF = path.join(TMP, 'runtest-test.sh')
  write(shF, '#!/usr/bin/env bash\necho hi\n')
  r = aci.runTest(shF)
  assert(!r.failed)
  console.log('PASS: runTest')
})()

// --- cleanup ---
fs.rmSync(TMP, { recursive: true, force: true })

console.log('\nALL ACI TESTS PASSED')
process.exit(0)
