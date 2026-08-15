# Meeting History — Design Spec

**Date:** 2026-04-10
**Status:** Superseded — Mattermost entfernt 2026-04; Spec vor Nutzung aktualisieren
**Depends on:** Client Portal spec

## Overview

After a meeting's finalization pipeline runs (Whisper transcription → Outline doc creation), an admin can release the artefacts to the client. The client then sees the transcript, whiteboard image, and AI summary in the "Vergangene Termine" tab of their `/portal`. Audio is deleted server-side immediately after the Whisper job completes.

## Release Model

Each finalized meeting has a release state stored in a lightweight JSON file in Nextcloud at `/Meetings/<meetingId>/meta.json`:

```json
{
  "meetingId": "uuid",
  "clientEmail": "kunde@example.com",
  "date": "2026-04-10",
  "type": "Coaching",
  "released": false,
  "releasedAt": null,
  "outlineDocId": "outline-doc-uuid",
  "whiteboardImagePath": "/Meetings/uuid/whiteboard.png",
  "transcriptPath": "/Meetings/uuid/transcript.txt"
}
```

`released: false` = admin has not approved yet; client sees nothing.
`released: true` = all artefacts visible to client.

Audio file (`/Meetings/<uuid>/recording.webm`) is deleted by the finalization pipeline once `transcript.txt` is written successfully.

## Admin Flow

In `/admin` → client detail → "Vergangene Termine" tab:

- All meetings for the client are listed, with a `released` badge
- Each unreleased meeting has a **"Freigeben"** button
- Clicking it: sets `released: true` + `releasedAt` in `meta.json`, posts a message to the client's Mattermost channel: "Ihr Gesprächsprotokoll vom \<date\> ist jetzt verfügbar."

## Client Flow

In `/portal` → "Vergangene Termine" tab:

- Lists only meetings where `released: true` and `clientEmail` matches session email
- Each entry: date, meeting type, expand button
- Expanded view shows:
  - **Zusammenfassung** — AI summary text from Outline doc
  - **Transkript** — full transcript text from Outline doc
  - **Zeichnung** — whiteboard image (if exists), rendered inline
- No audio player (recording deleted by then)

## Data Flow

```
Admin clicks "Freigeben"
  → POST /api/meeting/release { meetingId }
  → Write meta.json (released: true)
  → postToChannel(clientChannelId, notification)

Client loads /portal?tab=meetings
  → List /Meetings/ folders from Nextcloud WebDAV
  → Filter by clientEmail + released: true
  → For each: fetch Outline doc via Outline API (outlineDocId)
  → Render transcript + summary; serve whiteboard image from Nextcloud
```

## New Files

- `src/pages/api/meeting/release.ts` — POST endpoint; sets `released: true` in meta.json
- `src/components/portal/MeetingsTab.astro` — lists + expands meetings
- `src/components/portal/MeetingDetail.astro` — transcript, summary, whiteboard view

## Changes to Existing Files

- `src/pages/api/meeting/finalize.ts` — add: delete audio after transcript written; write `meta.json` with `released: false`
