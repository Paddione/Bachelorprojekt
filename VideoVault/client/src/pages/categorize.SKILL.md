# Categorize page

Video library categorization and tagging interface for organizing video collections with custom categories, tags, and search functionality.

## Purpose

- Multi-column category management (tags, locations, dates, etc.)
- Bulk assign/remove categories from selected videos  
- Smart suggestions based on video content analysis
- Persist category mappings to server

## Architecture

```typescript
// Core modules:
categorize.tsx       → 840 lines (page layout, state sync)
  ├─ CategoryGrid.svelte    → Drag-and-drop category tiles
  ├─ VideoSelectionPanel    → Multi-select video list  
  ├─ BulkOperations         → Batch apply/remove categories

// Related components:
CategoryTile         → Individual draggable tile component
BulkOperationModal   → Confirmation dialogs for bulk actions
```

## Usage

```typescript
const page = new Route('/admin/categorize');
await page.render({ videos, categories });
```

---

**File:** `VideoVault/client/src/pages/categorize.tsx` (840 LOC) → SKILL documentation  
**Related:** [tag-ops](file:///home/patrick/Bachelorprojekt/VideoVault/server/routes/tag-ops.SKILL.md), [bulk-operations](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/bulk-operations.SKILL.md)
