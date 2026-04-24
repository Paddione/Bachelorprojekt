# Systembrett Library-Embed Verification — Findings

**Date:** 2026-04-24
**Cluster:** mentolder
**Nextcloud Whiteboard image:** `ghcr.io/nextcloud-releases/whiteboard:v1.5.7`

## Result

**FAIL** — User B did not see User A's library items on first open of the shared whiteboard. The library panel was empty for User B despite the document having been saved with the items in scope.

## Observations

- User A created a whiteboard as admin in Nextcloud Files, saved three test shapes to the library via Excalidraw's `Save to library` flow, and shared the file with User B.
- User B opened the shared whiteboard in an incognito session on the same mentolder cluster. The library panel showed no items.
- Excalidraw's library is stored per-user in Nextcloud Whiteboard — either server-side in per-user preferences or client-side via browser storage — and does not travel inside the `.whiteboard` document in a way that's visible to other users on first open.

## Decision

Proceeding with **Path B (hybrid)** as pre-agreed in the design spec §3.

The template `.whiteboard` file will ship with the 15 primitives placed directly on the canvas as a left-edge tray. Coaches Alt-drag any tray piece to pull a copy into the work area. Tray pieces stay put; only the copy moves. This guarantees cross-user visibility because tray elements live in the scene's `elements` array (which every user sees) rather than in `libraryItems` (which every user's Excalidraw fetches separately).

The design spec's 15-piece inventory is unchanged — only the delivery mechanism switches.
