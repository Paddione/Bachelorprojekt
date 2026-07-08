# Settings modal component

Persistent settings dialog with form fields for application configuration, user preferences, and advanced options. Supports nested sections, validation, and keyboard navigation.

## Purpose

- Centralize all user-facing configuration in one place  
- Persist settings to localStorage/server
- Support complex nested forms (categories, tags, etc.)
- Keyboard-first navigation (Escape to close, Tab traversal)

## Architecture

```typescript
// Core modules:
settings-modal.tsx   → 651 lines (form layout, state management)
  ├─ FormSection     → Collapsible section containers  
  ├─ CheckboxGrid    → Multi-select checkbox rendering  
  └─ NumberInput     → Range slider with numeric precision

// Related components:
SettingsSidebar      → Left panel navigation
SettingsPage         → Full-page settings container
```

## Usage

```typescript
const modal = <SettingsModal currentSection='general' onSave={saveSettings}>;
```

---

**File:** `VideoVault/client/src/components/settings-modal.tsx` (651 LOC) → SKILL documentation  
**Related:** [settings-sidebar](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/components/settings-sidebar.SKILL.md), [form-validators](file:///home/patrick/Bachelorprojekt/VideoVault/client/lib/form-validators.SKILL.md)
