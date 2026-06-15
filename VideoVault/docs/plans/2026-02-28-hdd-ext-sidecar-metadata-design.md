# HDD-ext Sidecar Metadata Design

## Problem

HDD-ext video metadata (categories, tags, ffprobe data) lives only in PostgreSQL. If the DB is reset or the startup cleanup runs, user-curated classifications are lost. No metadata travels with the video files on disk.

## Solution

Per-directory `metadata.json` sidecar files with bidirectional sync. Disk JSON is source of truth for user-curated data (categories, customCategories); DB/ffprobe is source of truth for technical metadata.

## File Format

Each video directory in `3_complete/` gets `metadata.json`:

```json
{
  "version": 1,
  "id": "sha256-derived-id",
  "filename": "video.mp4",
  "displayName": "Video Title",
  "size": 1086462681,
  "lastModified": "2026-02-28T02:33:00.000Z",
  "metadata": {
    "duration": 1234.5,
    "width": 1920,
    "height": 1080,
    "bitrate": 5000000,
    "codec": "h264",
    "fps": 30,
    "aspectRatio": "16:9"
  },
  "categories": {
    "age": [],
    "physical": [],
    "ethnicity": [],
    "relationship": [],
    "acts": [],
    "setting": [],
    "quality": [],
    "performer": []
  },
  "customCategories": {}
}
```

`version` field enables future schema migrations.

## Data Flow

### On `/hdd-ext/index` (read + write)

1. Scan directory, find video file
2. Read `metadata.json` if it exists
3. Run ffprobe for fresh technical metadata
4. Merge: ffprobe overwrites `metadata`; `categories`/`customCategories` come from disk JSON (source of truth)
5. Upsert merged result into DB
6. Write merged result back to `metadata.json`

### On `PATCH /api/videos/:id` (write to disk)

1. Update DB as usual
2. Resolve video directory from `path` + `rootKey`
3. Read existing `metadata.json`, merge patched fields, write back

### On `POST /api/videos/bulk_upsert` (write to disk)

1. Upsert to DB as usual
2. For each video with `rootKey === 'hdd-ext'`, write updated `metadata.json`

## Files to Modify

| File | Change |
|------|--------|
| `server/lib/sidecar.ts` (new) | `readSidecar(dirPath)`, `writeSidecar(dirPath, data)` utility |
| `server/routes/processing.ts` | `/hdd-ext/index` — read sidecar before insert, write after |
| `server/routes/persistence.ts` | `patchVideo`, `bulkUpsertVideos` — write sidecar for hdd-ext videos |

## Error Handling

- Sidecar write failures: non-fatal, log warning
- Malformed JSON on disk: log warning, treat as empty, re-create from DB/ffprobe
- Missing directory: skip silently

## Conflict Resolution

- **Technical metadata** (`metadata` field): ffprobe always wins (fresh extraction)
- **User-curated data** (`categories`, `customCategories`): disk JSON wins
- **File info** (`size`, `lastModified`): filesystem stat always wins
