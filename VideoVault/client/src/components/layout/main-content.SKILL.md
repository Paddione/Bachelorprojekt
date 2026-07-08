# Main content layout component

Primary page layout structure with sidebar navigation, header actions, and responsive grid container for video list display. Manages global state synchronization across components.

## Purpose

- Provide consistent layout structure for all pages  
- Global state management (videos, filters, search)
- Responsive design for mobile/tablet/desktop
- Accessible keyboard navigation support

## Architecture

```typescript
// Core modules:
main-content.tsx   → 772 lines (layout container, state hooks)
  ├─ SidebarNav    → Collapsible navigation menu  
  ├─ HeaderBar     → Search, filters, user actions  
  └─ ContentGrid   → Responsive video list layout

// Related components:
VideoList          → VideoCard grid implementation  
FilterPanel        → Category/date/size filter controls
```

## Usage

```typescript
const content = <MainContent videos={videos} onFilterChange={handleFilters}>;
```

---

**File:** `VideoVault/client/src/components/layout/main-content.tsx` (772 LOC) → SKILL documentation  
**Related:** [filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/filter-engine.SKILL.md), [directory-database](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/directory-database.SKILL.md)
