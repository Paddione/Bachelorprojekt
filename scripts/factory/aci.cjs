// scripts/factory/aci.cjs — Agent-Computer-Interface: view/search/edit/test with auto-validation and revert.
// Pure helper module. Under 180 lines. node --check offline.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const MAX_VIEW_LINES = 80

function view(file, start = 1, end) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) return { failed: true, error: `File not found: ${file}` }
  const lines = fs.readFileSync(abs, 'utf8').split('\n')
  const startI = Math.max(0, (start || 1) - 1)
  const endI = Math.min(lines.length, end ? Math.max(end, startI + 1) : startI + MAX_VIEW_LINES)
  const snippet = lines.slice(startI, endI)
  const numbered = snippet.map((l, i) => `${startI + i + 1}: ${l}`).join('\n')
  return { failed: false, data: numbered, total_lines: lines.length, start: startI + 1, end: endI }
}

function search(pattern, fileGlob) {
  const results = []
  const target = fileGlob || '.'
  const grepCmd = `grep -rn '${pattern}' ${target} 2>/dev/null | head -50 || true`
  try {
    const out = execFileSync('bash', ['-c', grepCmd], { encoding: 'utf8', timeout: 15000, cwd: process.cwd() })
    out.trim().split('\n').filter(Boolean).forEach(l => results.push(l.trim()))
  } catch {}
  return { failed: false, matches: results, count: results.length }
}

function getValidator(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.ts' || ext === '.tsx') {
    return { cmd: 'node', args: ['--check', file], label: 'node --check' }
  }
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    return { cmd: 'node', args: ['--check', file], label: 'node --check' }
  }
  if (ext === '.sh') {
    return { cmd: 'bash', args: ['-n', file], label: 'bash -n' }
  }
  if (ext === '.json') {
    return { cmd: 'node', args: ['-e', `JSON.parse(require('fs').readFileSync('${file}','utf8'))`], label: 'JSON parse' }
  }
  if (ext === '.yaml' || ext === '.yml') {
    return { cmd: 'node', args: ['-e',
      `require('js-yaml').load(require('fs').readFileSync('${file}','utf8'))`], label: 'YAML parse' }
  }
  return null
}

function validate(file) {
  const v = getValidator(file)
  if (!v) return { valid: true, error: null, label: 'none' }
  try {
    execFileSync(v.cmd, v.args, { encoding: 'utf8', timeout: 15000, stdio: 'pipe' })
    return { valid: true, error: null, label: v.label }
  } catch (e) {
    const msg = String(e.stderr || e.stdout || e.message || '').trim()
    return { valid: false, error: msg || 'Validation failed', label: v.label }
  }
}

function edit(file, start, end, replacement) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) return { failed: true, error: `File not found: ${file}` }
  const original = fs.readFileSync(abs, 'utf8')
  const lines = original.split('\n')
  const startI = Math.max(0, (start || 1) - 1)
  const endI = end ? Math.min(end, lines.length) : lines.length
  if (startI > endI || startI > lines.length) {
    return { failed: true, error: `Invalid range: ${start}-${end} (file has ${lines.length} lines)` }
  }

  const replLines = (replacement || '').split('\n')
  const newLines = [...lines.slice(0, startI), ...replLines, ...lines.slice(endI)]
  const newContent = newLines.join('\n')

  // Write
  fs.writeFileSync(abs, newContent, 'utf8')

  // Validate
  const vResult = validate(abs)
  if (!vResult.valid) {
    // Auto-revert
    fs.writeFileSync(abs, original, 'utf8')
    return { failed: true, error: `Validation failed (${vResult.label}): ${vResult.error}`,
      reverted: true, validator: vResult.label }
  }

  return { failed: false, reverted: false, lines_changed: Math.abs(endI - startI) + replacement.split('\n').length,
    validator: vResult.label }
}

function runTest(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.ts' || ext === '.tsx') {
    return execCmd(`npx vitest run --reporter verbose ${file.replace(/\.tsx?$/, '.test.ts')} 2>&1 || true`)
  }
  if (ext === '.sh') {
    return execCmd(`bash -n ${file} 2>&1 && echo 'Syntax OK'`)
  }
  if (['.cjs', '.mjs', '.js'].includes(ext)) {
    return execCmd(`node --check ${file} 2>&1`)
  }
  return execCmd(`node --check ${file} 2>&1 || true`)
}

function execCmd(cmdStr) {
  try {
    const out = execFileSync('bash', ['-c', cmdStr], { encoding: 'utf8', timeout: 30000 })
    return { failed: false, output: out.trim() }
  } catch (e) {
    return { failed: true, output: String(e.stderr || e.stdout || '').trim() }
  }
}

module.exports = { view, search, edit, validate, runTest, getValidator }
