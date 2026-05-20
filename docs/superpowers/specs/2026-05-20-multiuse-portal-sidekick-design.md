# Design Spec: Portal Sidekick (Unified Widget Hub)

## Goals
Rework the fragmented widget landscape (BugReport, HelpPanel, Questionnaire/ChatWidget) into a single, high-end "Assistant" hub. The goal is to declutter the UI, provide a consistent user experience, and allow seamless transitions between quick widget interactions and full-page portal views.

## User Experience

### 1. The Unified Trigger
- Replaces all existing floating action buttons (FABs) and fixed help buttons.
- A single, premium icon button in the bottom right corner.
- Dynamic badge support (e.g., showing the number of pending questionnaires).

### 2. The Hub (Side Drawer)
- Opens a side panel (default width: 400px).
- **Home View:** A dashboard showing:
    - Quick links to "Support" (Bug Report), "Help" (Contextual Guide), and "Tasks" (Questionnaires).
    - Contextual summary (e.g., "3 open tasks", "Help available for this page").
- **Sub-Views:** Each tool operates within the same panel, maintaining its own state but sharing the header/navigation structure.

### 3. Navigation & Modes
- **Expandable (Mode B):** A toggle to expand the side drawer to a wide view (800px) or a centered overlay. This is used for complex forms like the Questionnaire Wizard.
- **Navigate/Pop-out (Mode C):** Every sub-view features a "Full Page" button.
    - Clicking it closes the sidekick and navigates the main browser window to the corresponding route in the portal (e.g., `/portal?section=fragebögen` or `/portal?section=hilfe`).
    - This allows users to start a task in the widget and finish it in the full portal if needed.

## Technical Implementation

### Components
- **`PortalSidekick.svelte` [NEW]:** The main orchestrator component.
    - Manages `open`, `view` (home|help|ticket|questionnaire), and `layout` (standard|expanded).
    - Hosts the unified trigger and the side drawer.
- **`SidekickHeader.svelte` [NEW]:** Shared header with "Back to Home", "Expand", "Pop-out", and "Close" actions.
- **`SidekickHome.svelte` [NEW]:** The dashboard view.
- **Reused Logic:**
    - The logic from `BugReportWidget.svelte`, `HelpPanel.svelte`, and `ChatWidget.svelte` will be extracted or wrapped into internal sub-views of the Sidekick.

### State Management
- Shared store or Svelte `$state` for keeping track of current context (which page the user is on) to provide relevant help content.

## Visual Design
- **Theme:** Follows the "Admin Premium" style: Glassmorphism (`backdrop-blur-xl`), dark mode default, subtle gradients (`var(--admin-primary)` accents).
- **Typography:** Uses `Geist` for body text and `Instrument Serif` for headings (matching the site's brand).
- **Transitions:** Use Svelte transitions (`fly`, `fade`, `slide`) for seamless view switching within the drawer.

## Verification Plan
- **Manual Smoke Test:** Open the sidekick on different pages, verify contextual help updates, check questionnaire badges, and test the "Full Page" navigation.
- **Layout Test:** Verify the "Expand" toggle works correctly on different screen sizes (responsive design).
- **Navigation Test:** Ensure "Pop-out" leads to the correct portal sections and closes the sidekick.
