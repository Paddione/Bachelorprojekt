export interface TreeNode {
  name: string;
  path: string; // normalized with trailing slash or empty for root
  children: TreeNode[];
}

// Choke-point cap for all recursive traversals of the picker tree
// (sortTree, filter visit, renderNode). 256 is ~20x below the measured
// RangeError threshold (~5000 levels) and ~5x above realistic trees (< 50).
export const MAX_TREE_DEPTH = 256;

export function buildTree(
  directories: string[],
  normalizeDir: (d: string) => string,
): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] };
  const pathToNode = new Map<string, TreeNode>([['', root]]);

  const ensureNode = (parentPath: string, segment: string) => {
    const childPath = parentPath ? `${parentPath}${segment}/` : `${segment}/`;
    if (!pathToNode.has(childPath)) {
      const node: TreeNode = { name: segment, path: childPath, children: [] };
      const parent = pathToNode.get(parentPath)!;
      parent.children.push(node);
      pathToNode.set(childPath, node);
    }
    return pathToNode.get(childPath)!;
  };

  const normalized = Array.from(new Set(directories.map(normalizeDir)));
  normalized.forEach((dir) => {
    const segments = dir.split('/').filter(Boolean);
    let parentPath = '';
    let depth = 0;
    for (const seg of segments) {
      if (depth >= MAX_TREE_DEPTH) break;
      const node = ensureNode(parentPath, seg);
      parentPath = node.path;
      depth++;
    }
  });

  // Sort children alphabetically at each level for stable UI
  sortTree(root);

  return root;
}

export function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  node.children.forEach(sortTree);
}

export function maxTreeDepth(node: TreeNode): number {
  let max = 0;
  const stack: Array<{ node: TreeNode; depth: number }> = [{ node, depth: 0 }];
  while (stack.length > 0) {
    const { node: current, depth } = stack.pop()!;
    if (depth > max) max = depth;
    for (const child of current.children) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return max;
}
