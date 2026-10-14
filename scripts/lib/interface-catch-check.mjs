#!/usr/bin/env node
// Parse interface catch blocks structurally so nested braces and rethrows remain visible.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../../components/website/package.json', import.meta.url));
const ts = require('typescript');
const files = process.argv.slice(2);
const defaults = ['embeddings.ts', 'rerank.ts', 'bge-router.ts'].map(f => `components/website/src/lib/${f}`);
let swallowed = 0;
for (const file of files.length ? files : defaults) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error(`Cannot parse interface source: ${file}`);
  function exposesFailure(block) {
    let visible = false;
    function walk(node) {
      if (ts.isFunctionLike(node) || ts.isCatchClause(node)) return;
      if (ts.isThrowStatement(node)) visible = true;
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source);
        if (/^(?:logger\.|console\.(?:error|warn)$)/.test(callee)) visible = true;
      }
      ts.forEachChild(node, walk);
    }
    walk(block);
    return visible;
  }
  function visit(node) {
    if (ts.isCatchClause(node) && !exposesFailure(node.block)) swallowed++;
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log(swallowed);
