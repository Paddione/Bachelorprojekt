// T901942 RED: buildTree must truncate pathologically deep trees.
// The pure tree module (extracted from directory-picker-modal) does not exist
// pre-fix, so this suite fails at import (RED). Post-fix it pins the contract:
// shallow trees keep their exact shape, deep trees are truncated at
// MAX_TREE_DEPTH instead of blowing the stack (RangeError measured at ~5000
// levels pre-fix; React/jsdom crashes far earlier).
import { describe, expect, it } from 'vitest';

import { buildTree, maxTreeDepth, MAX_TREE_DEPTH, type TreeNode } from './directory-tree';

function deepPath(segments: number): string {
  const parts: string[] = [];
  for (let i = 0; i < segments; i++) parts.push(`d${i}`);
  return parts.join('/');
}

function normalizeDir(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

describe('directory-tree depth guard (T901942)', () => {
  it('positive anchor: shallow trees keep exact shape, sorted', () => {
    const tree = buildTree(['movies/comedy', 'movies/action'], normalizeDir);
    expect(tree.children.map((c) => c.name)).toEqual(['movies']);
    expect(tree.children[0].children.map((c) => c.name)).toEqual(['action', 'comedy']);
    expect(maxTreeDepth(tree)).toBe(2);
  });

  it('RED: 20000-deep input truncates instead of throwing', () => {
    let tree: TreeNode;
    expect(() => {
      tree = buildTree([deepPath(20000)], normalizeDir);
    }).not.toThrow();
    expect(maxTreeDepth(tree!)).toBeLessThanOrEqual(MAX_TREE_DEPTH);
  });

  it('RED: MAX_TREE_DEPTH is a sane bound (deep enough for real trees, far below crash)', () => {
    expect(MAX_TREE_DEPTH).toBeGreaterThanOrEqual(128);
    expect(MAX_TREE_DEPTH).toBeLessThanOrEqual(512);
  });
});
