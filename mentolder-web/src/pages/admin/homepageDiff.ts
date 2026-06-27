import type { HomepageBlocksDocumentType } from '@/blocks/schema';

// Which homepage blocks changed between a baseline document and the working
// copy. This editor only mutates block `props` (no add/remove/reorder), so a
// per-id deep compare of `props` is sufficient. Props are updated immutably via
// setAtPath, preserving key order, so a JSON.stringify compare is stable.
export function changedBlockIds(
  original: HomepageBlocksDocumentType | null,
  current: HomepageBlocksDocumentType | null,
): string[] {
  if (!original || !current) return [];
  const originalById = new Map(original.blocks.map((b) => [b.id, b]));
  return current.blocks
    .filter((b) => {
      const prev = originalById.get(b.id);
      return !prev || JSON.stringify(prev.props) !== JSON.stringify(b.props);
    })
    .map((b) => b.id);
}
