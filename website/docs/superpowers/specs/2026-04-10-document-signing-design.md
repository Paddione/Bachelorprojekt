# Document Signing — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Depends on:** Client Portal spec

## Overview

Admin drops a PDF into a client's Nextcloud `pending-signatures/` folder. The client sees it in their portal under a "Zur Unterschrift" tab. They open the document in Collabora, read it, and click "Gelesen und akzeptiert". This records a timestamped confirmation to the client's Mattermost channel and their Outline page, and moves the file to a `signed/` folder.

## Admin Flow

1. Admin opens Nextcloud and navigates to `/Clients/<clientUsername>/pending-signatures/`
2. Uploads the PDF (e.g. `Coaching-Vertrag-2026.pdf`)
3. No further action required — the portal picks it up automatically

Optionally (phase 2): an `/admin` button "Dokument senden" that does the Nextcloud upload via WebDAV from the admin panel directly.

## Client Flow

1. Client sees a badge on "Zur Unterschrift" tab in `/portal` (count of pending docs)
2. Clicks a document → it opens in Collabora Online via Nextcloud's built-in Collabora integration (WOPI)
3. Below the Collabora iframe: **"Gelesen und akzeptiert"** button
4. Clicking the button:
   - Records confirmation: `POST /api/signing/confirm { documentName, clientEmail }`
   - Server logs: timestamp, username, document filename, SHA-256 hash of the file
   - Posts to Mattermost client channel: "✅ \<Name\> hat \<Dokument\> am \<Datum\> um \<Uhrzeit\> akzeptiert."
   - Appends to client's Outline page (or creates a "Unterschriften" section if absent)
   - Moves file in Nextcloud: `pending-signatures/` → `signed/`
5. Document disappears from "Zur Unterschrift" tab; appears in "Dokumente" tab under `signed/`

## Confirmation Record Format

Stored in Outline under the client's section:

```
## Unterschriften

| Dokument | Akzeptiert von | Datum | Uhrzeit | Hash (SHA-256) |
|----------|----------------|-------|---------|----------------|
| Coaching-Vertrag-2026.pdf | max.mustermann | 2026-04-14 | 14:32 UTC | abc123... |
```

## Data Flow

```
Client clicks "Gelesen und akzeptiert"
  → POST /api/signing/confirm { documentName, documentPath, clientEmail }
  → Compute SHA-256 of file via Nextcloud WebDAV download
  → Move file: WebDAV MOVE pending-signatures/ → signed/
  → postToChannel(clientChannelId, confirmation message)
  → Outline API: append row to signatures table in client doc
  → Return { success: true }
```

## Security

- `/api/signing/confirm` requires valid Keycloak session
- Server validates that `documentPath` is within the authenticated user's own Nextcloud folder (no path traversal)
- SHA-256 hash computed server-side from the actual Nextcloud file, not from client upload

## New Files

- `src/pages/api/signing/confirm.ts` — POST endpoint; moves file, logs confirmation
- `src/components/portal/SignaturesTab.astro` — lists pending + signed documents
- `src/pages/portal/document.astro` — document detail page with Collabora iframe + confirm button
- `src/lib/nextcloud-files.ts` — WebDAV helpers: list, move, download, hash (shared with portal spec)
