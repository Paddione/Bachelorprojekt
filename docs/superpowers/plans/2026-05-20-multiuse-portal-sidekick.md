---
ticket_id: T000058
brainstorm_choice: sidekick
brainstorm_session: 86938-1779238037
---
# Portal Sidekick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the fragmented widget landscape into a single, high-end "Portal Sidekick" hub with integrated support, help, and task management.

**Architecture:** Unified Side Drawer orchestrator using Svelte 5 state management. Components are extracted into independent views and hosted within the hub.

**Tech Stack:** Svelte 5 (Runes), Tailwind CSS (for layout/styling), Astro (for integration).

---

### Task 1: Component Extraction - SupportView
**Files:**
- Create: `website/src/components/assistant/SupportView.svelte`
- Modify: `website/src/components/BugReportWidget.svelte` (extract logic)

- [ ] **Step 1: Extract bug report logic into SupportView.svelte**
- [ ] **Step 2: Verify SupportView handles file uploads and API calls correctly**
- [ ] **Step 3: Commit**

### Task 2: Component Extraction - QuestionnaireView
**Files:**
- Create: `website/src/components/assistant/QuestionnaireView.svelte`
- Modify: `website/src/components/ChatWidget.svelte` (extract logic)

- [ ] **Step 1: Extract questionnaire listing and wizard logic into QuestionnaireView.svelte**
- [ ] **Step 2: Ensure state management for current step and answers is self-contained**
- [ ] **Step 3: Commit**

### Task 3: Component Extraction - HelpView
**Files:**
- Create: `website/src/components/assistant/HelpView.svelte`
- Modify: `website/src/components/HelpPanel.svelte` (extract logic)

- [ ] **Step 1: Extract help content fetching and guide rendering into HelpView.svelte**
- [ ] **Step 2: Commit**

### Task 4: Portal Sidekick Core
**Files:**
- Create: `website/src/components/PortalSidekick.svelte`
- Create: `website/src/components/assistant/SidekickHeader.svelte`
- Create: `website/src/components/assistant/SidekickHome.svelte`

- [ ] **Step 1: Implement the unified floating trigger button**
- [ ] **Step 2: Build the SidekickHeader with navigation actions (Back, Expand, Pop-out)**
- [ ] **Step 3: Build the SidekickHome dashboard with quick links**
- [ ] **Step 4: Implement the drawer container with layout modes (Standard, Expanded)**
- [ ] **Step 5: Commit**

### Task 5: Integration & Cleanup
**Files:**
- Modify: `website/src/layouts/Layout.astro`
- Modify: `website/src/layouts/AdminLayout.astro`
- Delete: `website/src/components/BugReportWidget.svelte`
- Delete: `website/src/components/HelpPanel.svelte`
- Delete: `website/src/components/ChatWidget.svelte`

- [ ] **Step 1: Replace old widgets with <PortalSidekick client:load /> in Layout.astro**
- [ ] **Step 2: Ensure contextual help context is passed correctly from layouts**
- [ ] **Step 3: Remove legacy widget files**
- [ ] **Step 4: Run verification tests**
- [ ] **Step 5: Commit**
