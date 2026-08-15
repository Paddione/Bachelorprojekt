# Sidebar navigation component

Collapsible sidebar with multi-level navigation menus, search shortcuts, and quick action buttons for primary operations. Provides persistent state across route changes.

## Purpose

- Multi-column navigation structure (Library, Tools, Settings)  
- Search shortcut access without leaving current page  
- Persistent sidebar state (collapsed/expanded)
- Keyboard shortcut integration

## Architecture

```typescript
// Core modules:
sidebar.tsx        → 771 lines (navigation tree, collapse logic)
  ├─ NavTree       → Recursive menu structure rendering  
  ├─ CollapsePanel → Expand/collapse animation handling  
  └─ ShortcutKeys  → Keyboard shortcut registration

// Related components:
HeaderBar         → Top navigation integration
VideoList         → Content area coordination
```

## Usage

```typescript
const sidebar = <SidebarNav currentRoute={route} onNavigate={navigate}>;
```

---

**File:** `VideoVault/client/src/components/ui/sidebar.tsx` (771 LOC) → SKILL documentation  
**Related:** [main-content](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/components/layout/main-content.SKILL.md), [filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/filter-engine.SKILL.md)
