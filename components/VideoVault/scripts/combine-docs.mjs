#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const repoRoot = process.cwd();
  const docsDir = path.join(repoRoot, 'docs');
  try {
    const stat = await fs.stat(docsDir);
    if (!stat.isDirectory()) throw new Error('docs is not a directory');
  } catch (err) {
    console.error('docs directory not found');
    process.exit(1);
  }

  let files = (await fs.readdir(docsDir))
    .filter(f => f.toLowerCase().endsWith('.md'))
    .filter(f => f.toLowerCase() !== 'combined.md')
    .map(f => path.join(docsDir, f));

  if (files.length === 0) {
    const combinedPath = path.join(docsDir, 'COMBINED.md');
    try {
      const s = await fs.stat(combinedPath);
      if (s.isFile()) {
        files = [combinedPath];
      }
    } catch {}
    if (files.length === 0) {
      console.error('No markdown files found in docs');
      process.exit(1);
    }
  }

  // Prefer a sensible order if filenames exist; fallback to alpha
  const order = [
    'requirements.md',
    'design.md',
    'test-plan.md',
    'manual-testing-guide.md',
    'tasks.md',
  ];
  files.sort((a, b) => {
    const fa = path.basename(a).toLowerCase();
    const fb = path.basename(b).toLowerCase();
    const ia = order.indexOf(fa);
    const ib = order.indexOf(fb);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return fa.localeCompare(fb);
  });

  // Data structures for merging
  const slugify = (str) => {
    return str
      .toLowerCase()
      .replace(/[\t`*_~]/g, '')
      .replace(/[^a-z0-9\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const makeNode = (title, level) => ({
    title,
    slug: slugify(title),
    level,
    intro: [],
    introSeen: new Set(),
    childrenOrder: [],
    children: new Map(),
  });

  const root = makeNode('', 0);

  const addLine = (node, line) => {
    const key = line; // exact line
    if (!node.introSeen.has(key)) {
      node.introSeen.add(key);
      node.intro.push(line);
    }
  };

  const onlyCombined = files.length === 1 && path.basename(files[0]).toLowerCase() === 'combined.md';

  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    if (onlyCombined) {
      // Strip previous combined header/TOC to avoid duplicating our own
      const linesTmp = content.replace(/\r\n?/g, '\n').split('\n');
      let idx = 0;
      // Skip leading blanks
      while (idx < linesTmp.length && linesTmp[idx].trim() === '') idx++;
      if (/^#\s+videovault documentation \(combined\)/i.test(linesTmp[idx] || '')) {
        // Find the first horizontal rule '---' after header/TOC and skip through it
        let j = idx + 1;
        while (j < linesTmp.length && linesTmp[j].trim() !== '---') j++;
        if (j < linesTmp.length) {
          // Skip the '---' line as well
          content = linesTmp.slice(j + 1).join('\n');
        }
      }
    }
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let inCode = false;
    const stack = [root];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/[\t ]+$/g, '');

      if (/^```/.test(line)) {
        inCode = !inCode;
        addLine(stack[stack.length - 1], line);
        continue;
      }

      if (!inCode) {
        const m = /^(#{1,6})\s+(.*)$/.exec(line);
        if (m) {
          const level = m[1].length;
          const title = m[2].trim();
          // Find parent: deepest stack node with level < current level
          while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
          const parent = stack[stack.length - 1] || root;
          const slug = slugify(title);
          let node = parent.children.get(slug);
          if (!node) {
            node = makeNode(title, level);
            parent.children.set(slug, node);
            parent.childrenOrder.push(slug);
          }
          stack.push(node);
          continue;
        }
      }

      addLine(stack[stack.length - 1], line);
    }
  }

  // Render tree with header and TOC
  const out = [];
  out.push('# VideoVault Documentation (Combined)');
  out.push('');
  out.push('This file combines all markdown docs from the `docs/` directory by merging sections with the same headings.');
  out.push('Included files (in order): ' + files.map(f => '`' + path.basename(f) + '`').join(', '));
  out.push('');

  out.push('## Table of Contents');
  out.push('');

  const tocLines = [];
  for (const slug of root.childrenOrder) {
    const n1 = root.children.get(slug);
    if (n1.level === 1) {
      const title1 = n1.title.trim().toLowerCase();
      if (title1 === 'videovault documentation (combined)') continue;
      tocLines.push(`- [${n1.title}](#${n1.slug})`);
      // H2 under this H1
      for (const s2 of n1.childrenOrder) {
        const n2 = n1.children.get(s2);
        if (n2.level === 2) {
          const title2 = n2.title.trim().toLowerCase();
          if (title2 === 'table of contents') continue;
          tocLines.push(`  - [${n2.title}](#${n2.slug})`);
        }
      }
    }
  }
  if (tocLines.length === 0) tocLines.push('- (No chapters found)');
  out.push(...tocLines);
  out.push('');

  const renderNode = (node) => {
    if (node.level > 0) {
      out.push('');
      out.push(`${'#'.repeat(node.level)} ${node.title}`);
      out.push('');
    }
    // Write intro content
    for (const l of node.intro) out.push(l);
    // Recurse children in order
    for (const slug of node.childrenOrder) {
      renderNode(node.children.get(slug));
    }
  };

  // Separator then render all top-level nodes
  out.push('');
  out.push('---');
  out.push('');
  for (const slug of root.childrenOrder) {
    const n = root.children.get(slug);
    if (n.level === 1) renderNode(n);
  }

  // If source was the previous combined doc, remove its old header/TOC block if present
  if (onlyCombined) {
    let firstIdx = -1;
    let secondIdx = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i].trim().toLowerCase() === '# videovault documentation (combined)') {
        if (firstIdx === -1) firstIdx = i; else { secondIdx = i; break; }
      }
    }
    if (secondIdx !== -1) {
      let end = secondIdx + 1;
      while (end < out.length && out[end].trim() !== '---') end++;
      if (end < out.length) {
        out.splice(secondIdx, end - secondIdx + 1);
      }
    }
  }

  // Collapse excessive blank lines (max 2)
  const collapsed = [];
  let blankRun = 0;
  for (const l of out) {
    if (l.trim().length === 0) {
      blankRun += 1;
      if (blankRun <= 2) collapsed.push('');
    } else {
      blankRun = 0;
      collapsed.push(l);
    }
  }

  const outPath = path.join(docsDir, 'COMBINED.md');
  await fs.writeFile(outPath, collapsed.join('\n'), 'utf8');
  console.log(`Wrote combined docs to: ${path.relative(repoRoot, outPath)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
