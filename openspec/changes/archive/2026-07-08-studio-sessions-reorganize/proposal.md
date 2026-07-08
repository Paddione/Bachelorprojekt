# Proposal: studio-sessions-reorganize

## Why
The coaching interface has redundant elements:
1. Both "Studio" and "Sessions" are present in the Admin sidebar, which is confusing since "Studio" is where active coaching sessions are managed.
2. The list-based "Sessions" view has a "+ Neue Session" button, which is redundant because new sessions should be initiated from the Studio context.
3. The "Projekte" tab in the sessions list is unused and not needed.

## What
1. Remove "Sessions" from the Admin sidebar.
2. Rename "Studio" to "Sessions" in the Admin sidebar (retaining path `/admin/coaching/studio`).
3. Make the list-based Sessions view accessible from the Studio page by adding a navigation link/button in the top bar.
4. Rename page title in Astro wrapper from "Coaching Studio" to "Coaching Sessions" and the brand sub-header inside the React component.
5. Remove the "+ Neue Session" button from the sessions list overview.
6. Remove the "Projekte" tab from the sessions list view.

_Ticket: T001649_

