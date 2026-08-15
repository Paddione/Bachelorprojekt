# Slot Widget — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Overview

A section on the homepage that shows the next available booking day and all its open slots. Rendered server-side on each page request (SSR) — no JavaScript required, no layout shift. Clicking any slot deep-links to `/termin` with the date and time pre-filled.

## Behaviour

1. At request time, the homepage calls `getAvailableSlots()` from `lib/caldav.ts` (already exists)
2. Find the first day that has at least one available slot
3. Render that day's slots as clickable buttons inline in the page
4. If CalDAV is unreachable or returns no slots within 3 s, the section is hidden gracefully (no error shown to visitor)

## UI Placement

Below the hero section, above the services grid. Headed with:

> **Nächster freier Termin — \<Wochentag, TT.MM.YYYY\>**

Slots rendered as a row of pill buttons:

```
[ 09:00 – 10:00 ]  [ 10:00 – 11:00 ]  [ 14:00 – 15:00 ]  [ 16:00 – 17:00 ]
```

Each pill links to:

```
/termin?date=2026-04-14&start=09:00&end=10:00
```

## Booking Form Integration

`src/pages/termin.astro` (or the `BookingForm.svelte` component) reads `?date`, `?start`, `?end` from the URL on mount and pre-fills the date picker and slot selector. If params are absent, form behaves as today.

## Error / Empty States

- CalDAV timeout (>3 s): section not rendered — homepage shows normally without it
- No slots in next 21 days: section not rendered
- These are silent failures — no error message shown to visitors

## Brand Awareness

The slot widget uses `config.services[0]` as the default booking type pre-fill, so it works for both mentolder and korczewski brands without hardcoding.

## New / Changed Files

- `src/pages/index.astro` — add slot widget section (SSR fetch + conditional render)
- `src/components/SlotWidget.astro` — presentational component; accepts `day: DaySlots` prop
- `src/pages/termin.astro` — read URL params on load; pass to BookingForm
- `src/components/BookingForm.svelte` — accept `initialDate`, `initialStart`, `initialEnd` props
