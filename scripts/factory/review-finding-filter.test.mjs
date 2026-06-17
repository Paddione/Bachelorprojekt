import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseChangedLines,
  isStyleNitpick,
  filterFindings,
  formatChangedLinesHint,
} from './review-finding-filter.mjs'

describe('parseChangedLines', () => {
  it('parses a single hunk — new file', () => {
    const diff = `diff --git a/foo.js b/foo.js
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/foo.js
@@ -0,0 +1,5 @@
+line1
+line2
+line3
+line4
+line5`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([['foo.js', new Set([1, 2, 3, 4, 5])]]))
  })

  it('parses a single hunk — modified file', () => {
    const diff = `diff --git a/bar.ts b/bar.ts
index abc..def 100644
--- a/bar.ts
+++ b/bar.ts
@@ -5,6 +5,8 @@ context before
 context
+added1
 context
+added2
 context
 context after`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([['bar.ts', new Set([6, 8])]]))
  })

  it('parses multiple hunks in one file', () => {
    const diff = `diff --git a/app.ts b/app.ts
index abc..def 100644
--- a/app.ts
+++ b/app.ts
@@ -1,4 +1,5 @@
+added_top
 context
 context
@@ -10,3 +11,4 @@
 context
+added_bottom`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([['app.ts', new Set([1, 12])]]))
  })

  it('parses multiple hunks in one file — modified with context', () => {
    const diff = `diff --git a/app.ts b/app.ts
index abc..def 100644
--- a/app.ts
+++ b/app.ts
@@ -1,3 +1,4 @@
+added_top
 context
 context
@@ -10,3 +11,4 @@
 context
+added_bottom`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([['app.ts', new Set([1, 12])]]))
  })

  it('parses multiple files', () => {
    const diff = `diff --git a/a.ts b/a.ts
@@ -1,3 +1,4 @@
+x
 context
diff --git a/b.ts b/b.ts
@@ -5,2 +6,3 @@
 context
+y`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([
      ['a.ts', new Set([1])],
      ['b.ts', new Set([7])],
    ]))
  })

  it('removed lines do NOT increment the new-line counter', () => {
    const diff = `diff --git a/mod.ts b/mod.ts
@@ -10,5 +11,4 @@
-removed_line
 context
+added_line
 context`
    const result = parseChangedLines(diff)
    assert.deepEqual(result, new Map([['mod.ts', new Set([12])]]))
  })

  it('only context lines (no + lines) produces empty map entry for file', () => {
    const diff = `diff --git a/noadd.ts b/noadd.ts
@@ -1,3 +1,3 @@
 context
 context`
    const result = parseChangedLines(diff)
    assert.equal(result.has('noadd.ts'), true)
    assert.deepEqual(result.get('noadd.ts'), new Set())
  })

  it('handles empty diff gracefully', () => {
    assert.deepEqual(parseChangedLines(''), new Map())
    assert.deepEqual(parseChangedLines(null), new Map())
    assert.deepEqual(parseChangedLines(undefined), new Map())
  })

  it('handles diff with only non-code metadata', () => {
    const diff = `diff --git a/empty.ts b/empty.ts
new file mode 100644
index 0000000..1111111`
    const result = parseChangedLines(diff)
    assert.equal(result.has('empty.ts'), true)
    assert.deepEqual(result.get('empty.ts'), new Set())
  })
})

describe('isStyleNitpick', () => {
  it('detects style nitpick by naming keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'variable naming convention' }), true)
  })

  it('detects style nitpick by format keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'code formatting issue' }), true)
  })

  it('detects nitpick with whitespace keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'trailing whitespace' }), true)
  })

  it('detects nitpick with indent keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'inconsistent indentation' }), true)
  })

  it('detects nitpick with style keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'code style violation' }), true)
  })

  it('detects nitpick with typo keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'typo in comment' }), true)
  })

  it('detects nitpick with cosmetic keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'cosmetic change needed' }), true)
  })

  it('detects nitpick with rename keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'rename variable' }), true)
  })

  it('does not flag medium severity with style keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'medium', description: 'naming issue causes confusion' }), false)
  })

  it('does not flag low severity without style keyword', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: 'potential null dereference' }), false)
  })

  it('does not flag undefined/null severity', () => {
    assert.equal(isStyleNitpick({ description: 'naming convention' }), false)
    assert.equal(isStyleNitpick(null), false)
    assert.equal(isStyleNitpick(undefined), false)
  })

  it('does not flag empty description', () => {
    assert.equal(isStyleNitpick({ severity: 'low', description: '' }), false)
  })
})

describe('filterFindings', () => {
  const changedLines = new Map([['src/app.ts', new Set([5, 8, 12])]])

  it('keeps finding on a changed line', () => {
    const findings = [{ severity: 'high', file: 'src/app.ts', line: 5, description: 'bug on changed line' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('drops finding not in changedLines range', () => {
    const findings = [{ severity: 'high', file: 'src/app.ts', line: 3, description: 'bug on unchanged line' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'out-of-diff')
  })

  it('drops finding for file not in diff at all', () => {
    const findings = [{ severity: 'high', file: 'other/file.ts', line: 1, description: 'bug elsewhere' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'out-of-diff')
  })

  it('keeps finding without a line number', () => {
    const findings = [{ severity: 'high', file: 'src/app.ts', description: 'file-level issue' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('drops finding below confidence threshold', () => {
    const findings = [{ severity: 'medium', file: 'src/app.ts', line: 5, description: 'weak signal', confidence: 0.3 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'low-confidence')
  })

  it('keeps finding with confidence at threshold', () => {
    const findings = [{ severity: 'medium', file: 'src/app.ts', line: 5, description: 'borderline', confidence: 0.6 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('keeps finding without confidence field (fail-open)', () => {
    const findings = [{ severity: 'high', file: 'src/app.ts', line: 5, description: 'no confidence field' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('drops style nitpick', () => {
    const findings = [{ severity: 'low', file: 'src/app.ts', line: 5, description: 'naming convention violation', confidence: 0.9 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'style-nitpick')
  })

  it('keeps high severity even with style keyword', () => {
    const findings = [{ severity: 'high', file: 'src/app.ts', line: 5, description: 'naming causes crash', confidence: 0.9 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('resolves multiple drop reasons in priority order: out-of-diff first', () => {
    const findings = [{ severity: 'low', file: 'other.ts', line: 1, description: 'naming convention', confidence: 0.3 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'out-of-diff')
  })

  it('respects requireInDiff:false', () => {
    const findings = [{ severity: 'high', file: 'other.ts', line: 1, description: 'out of diff file' }]
    const result = filterFindings(findings, changedLines, { requireInDiff: false })
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('respects dropStyleNitpicks:false', () => {
    const findings = [{ severity: 'low', file: 'src/app.ts', line: 5, description: 'naming convention', confidence: 0.9 }]
    const result = filterFindings(findings, changedLines, { dropStyleNitpicks: false })
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('respects custom confidenceThreshold', () => {
    const findings = [{ severity: 'medium', file: 'src/app.ts', line: 5, description: 'some issue', confidence: 0.7 }]
    const result = filterFindings(findings, changedLines, { confidenceThreshold: 0.8 })
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'low-confidence')
  })

  it('handles empty findings array', () => {
    const result = filterFindings([], changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 0)
  })

  it('handles null/undefined findings gracefully', () => {
    const result = filterFindings(null, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 0)
  })

  it('keeps finding with line=0 (treated as file-level, no line check)', () => {
    const findings = [{ severity: 'medium', file: 'src/app.ts', line: 0, description: 'file-level issue' }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 1)
    assert.equal(result.dropped.length, 0)
  })

  it('out-of-diff followed by low-confidence and nitpick returns only first matching reason', () => {
    const findings = [{ severity: 'low', file: 'other.ts', line: 1, description: 'naming convention', confidence: 0.3 }]
    const result = filterFindings(findings, changedLines)
    assert.equal(result.kept.length, 0)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.dropped[0].reason, 'out-of-diff')
  })
})

describe('formatChangedLinesHint', () => {
  it('renders single file with single range', () => {
    const changed = new Map([['foo.ts', new Set([1, 2, 3, 4, 5])]])
    const result = formatChangedLinesHint(changed)
    assert.equal(result, 'foo.ts: 1-5')
  })

  it('renders single file with multiple ranges', () => {
    const changed = new Map([['foo.ts', new Set([1, 2, 5, 8, 9, 10])]])
    const result = formatChangedLinesHint(changed)
    assert.equal(result, 'foo.ts: 1-2, 5, 8-10')
  })

  it('renders multiple files', () => {
    const changed = new Map([
      ['a.ts', new Set([1, 2])],
      ['b.ts', new Set([5])],
    ])
    const result = formatChangedLinesHint(changed)
    assert.equal(result, 'a.ts: 1-2, b.ts: 5')
  })

  it('renders empty changedLines', () => {
    assert.equal(formatChangedLinesHint(new Map()), '(no changed lines)')
  })

  it('handles null/undefined gracefully', () => {
    assert.equal(formatChangedLinesHint(null), '(no changed lines)')
    assert.equal(formatChangedLinesHint(undefined), '(no changed lines)')
  })
})
