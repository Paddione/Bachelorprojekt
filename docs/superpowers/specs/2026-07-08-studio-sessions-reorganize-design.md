---
title: Reorganize Studio and Sessions Views
ticket_id: null
plan_ref: null
status: draft
---

# Design Spec: Reorganize Studio and Sessions Views

## Purpose
The coaching interface needs to be reorganized to simplify navigation and align the terminology. Currently, both "Studio" and "Sessions" are present in the sidebar, which is redundant since the Studio is where active coaching sessions are managed. We will rename "Studio" to "Sessions" in the sidebar, make the older list-based Sessions view accessible from the new Sessions Studio, and remove redundant actions (like creating a new session from the list-based view) as well as the unused "Projekte" tab.

## Requirements
1. **Admin Sidebar**:
   - Remove the menu item for "Sessions" (`/admin/coaching/sessions`).
   - Rename the menu item "Studio" (`/admin/coaching/studio`) to "Sessions".
2. **Coaching Studio (Sessions View)**:
   - Rename the sub-brand header from "Coaching Studio" to "Coaching Sessions".
   - Rename page title in Astro wrapper from "Coaching Studio" to "Coaching Sessions".
   - Add a navigation button/link to the "Sessions-Liste" (`/admin/coaching/sessions`) inside the Studio top bar.
3. **Sessions List View**:
   - Remove the "Projekte" tab from the navigation tab bar.
   - Remove the "+ Neue Session" option from the sessions overview table toolbar.
   - Retain the "Sessions" tab pointing to `/admin/coaching/sessions` and the "Studio" tab renamed to "Sessions" pointing to `/admin/coaching/studio`.

## Architectural Decisions
- Keep `/admin/coaching/studio` as the endpoint for the main interactive Sessions application.
- Keep `/admin/coaching/sessions` as the endpoint for the tabular overview of all historical sessions.
- In the tab navigation on the Sessions list page, show "Sessions-Liste" and "Sessions" (linking to Studio).
