# Live-Cockpit — Stream + Meetings vereinen

**Status:** Spec
**Datum:** 2026-05-08
**Scope:** website (admin)
**Verwandte Specs:** `2026-05-04-livestream-design.md`, `2026-04-26-live-poll-design.md`, `2026-04-25-systemisches-brett-design.md`

## 1. Motivation

Heute existieren zwei getrennte Admin-Seiten — `/admin/stream` (LiveKit-Broadcast) und `/admin/meetings` (Talk-Calls + Bulk-Aktionen Brett/Poll/Transkription). Beide beschreiben dasselbe konzeptuelle Ding: *„etwas passiert gerade live, und ich will es steuern"*. Sie sind aber UI-fremd voneinander, der Stream-Eintrag fühlt sich isoliert an, und auf `web.korczewski.de` wirft `/admin/meetings` einen Fehler.

Der **Live-Cockpit** ersetzt beide durch eine adaptive Seite, die je nach Live-Zustand das richtige Layout präsentiert: ein Launchpad bei Leerlauf, einen Stream-Cockpit beim Senden, ein Multi-Room-Board bei laufenden Talk-Calls, oder beides nebeneinander.

## 2. Geltungsbereich (v1)

**Drin:**
- Empty-State-Launchpad (Start-Buttons, kommende Termine, letzte Sessions)
- Auto-Erkennung Live-Zustand → adaptive Layout
- Stream-Cockpit: Publish-Toggle, Recording, Verbindungs-Indikator, Live-Zuschauerzahl
- Audience-Live: Chat-Moderation, Reactions-Stream, Hand-Heben-Queue, Live-Poll-Overlay
- Multi-Room: aktive Talk-Räume, Bulk Brett/Poll/Transkription (übernehmen aus Bestand), Drill-into-Raum
- Live-Toasts (Hand gehoben, Aufzeichnung läuft, Call beendet)
- Korczewski-Bug-Fix als Teil des Refactors

**Stretch (rein wenn Zeit):** Q&A-Queue, Lower-Third/Bauchbinde, Live-Captions, Schedule-Nudge, Post-Live-Aufräum-Assistent.

**Explizit nicht in v1:** Co-Host promoten, Clip-30s-Highlight, Auto-End/Pre-Show-Lobby, Simulcast (YouTube/Twitch), Stage-Modus, Brett-aufs-Stream-Bild compositen, Talk-Mod-Aktionen (Kick/Mute), Focus-Mode.

## 3. Routing & Sidebar

**Neue kanonische Route:** `/admin/live`

| alt | neu |
|---|---|
| `/admin/stream` | 301 → `/admin/live` |
| `/admin/meetings` | 301 → `/admin/live` |
| `/admin/meetings/[id]` | umbenannt zu `/admin/live/sessions/[id]` (Detail bleibt) |

**Sidebar (`website/src/layouts/AdminLayout.astro`, Zeilen 75–76):**
Die zwei Einträge `Meetings` (icon: microphone) und `Stream` (icon: broadcast) verschmelzen zu einem Eintrag:

```ts
{ href: '/admin/live', label: 'Live', icon: 'broadcast' }
```

Die Liste vergangener Sessions (heute auf `/admin/meetings`) wandert in einen Bereich „Vergangene Sessions" innerhalb des Launchpads — das historische Material geht nicht verloren, ist aber nur sichtbar, wenn nichts live ist.

## 4. State-Machine

Ein einzelner abgeleiteter Zustand steuert das Layout:

| state | Trigger | Layout |
|---|---|---|
| `empty` | kein Stream + 0 Talk-Rooms | Launchpad: Start-Buttons + ScheduleNudge + letzte Sessions |
| `stream` | Stream live, 0 Rooms | Volle Breite: StreamCockpit |
| `rooms` | 0 Stream, 1+ Rooms | Volle Breite: RoomsBoard |
| `both` | Stream live + 1+ Rooms | 2/3 StreamCockpit links + 1/3 RoomsBoard rechts (Drawer) |

State wird aus `/api/live/state` abgeleitet und beim Eintreffen von SSE-Events aktualisiert.

## 5. Komponenten-Struktur

```
website/src/pages/admin/live/index.astro          (Astro-Seite: Auth + initial-state SSR)
website/src/pages/admin/live/sessions/[id].astro  (umzug von admin/meetings/[id])

website/src/components/live/
├── LiveCockpit.svelte          # Root, owns state + SSE
├── Launchpad.svelte            # Empty state
├── shared/
│   ├── LiveStatusBar.svelte    # Sticky "ON AIR · 47 Zuschauer · REC · 2 Calls"
│   ├── LiveToasts.svelte       # Event-getriebene Notifications
│   └── ScheduleNudge.svelte    # "Dein 14:00-Termin · in 5 Min · [Jetzt starten →]"
├── stream/
│   ├── StreamCockpit.svelte
│   ├── PublishControls.svelte  # Browser ↔ OBS, Cam/Mic
│   ├── RecordingPanel.svelte   # start/stop + Dauer + letzte MP4
│   ├── ConnectionIndicator.svelte
│   ├── AudiencePanel.svelte    # Zuschauerzahl + Reactions + Chat-Moderation
│   ├── HandRaiseQueue.svelte
│   └── PollOverlayPanel.svelte # Aktive Umfrage + Bars
└── rooms/
    ├── RoomsBoard.svelte
    ├── ActiveRoomCard.svelte   # Tn-Anzahl, Dauer, transkribierend?
    ├── RoomDrawer.svelte
    └── BulkActionsBar.svelte   # Brett/Poll/Transkription für alle
```

**Wiederverwendet (kein Duplikat):**
- `StreamPlayer.svelte`, `StreamReactions.svelte`, `StreamChat.svelte`, `StreamHandRaise.svelte` aus `components/LiveStream/` — Host-Varianten werden in `AudiencePanel`/`HandRaiseQueue` umhüllt
- Modal-Logik aus heutigem `meetings.astro` (Brett/Poll/Transkription) wird in die `rooms/`-Komponenten extrahiert; das Original ist ein riesiges Inline-Script und wird beim Refactor in saubere Svelte-Module zerlegt

## 6. API-Oberfläche

**Neu:**

| Endpoint | Typ | Zweck |
|---|---|---|
| `GET /api/live/state` | JSON | One-shot SSR-Seed: `{ stream, rooms[], pollActive, schedule[], recentSessions[] }` |
| `GET /api/live/events` | **SSE** | Push: `viewer.*`, `reaction`, `hand.*`, `chat.msg`, `room.changed`, `recording.state`, `poll.tally` |

**Wiederverwendet (unverändert):**
- `POST /api/stream/recording` — start/stop Egress
- `GET/POST /api/stream/token` — LiveKit-Tokens
- `GET/POST /api/admin/brett/broadcast` — Bulk-Brett
- `POST /api/admin/poll`, `GET /api/admin/poll/active`, `GET /api/admin/poll/:id`, `POST /api/admin/poll/:id/share`
- `GET/POST /api/admin/transcription`
- `listAllMeetings()` aus `lib/website-db.ts` — nur für „letzte Sessions" im Launchpad

## 7. Live-Datenpfad — SSE statt Polling

`EventSource('/api/live/events')` öffnet beim Mount des Cockpits, hat eingebauten Auto-Reconnect.

Server-seitig aggregiert der Endpoint aus drei Quellen:

1. **LiveKit-Webhooks** (bereits konfiguriert für Recording-Events) — Stream-State, Recording-State
2. **Talk-Participants-Endpoint** (heute schon vom `meetings.astro`-Polling abgefragt) — Räume + Teilnehmer
3. **Browser-Events von `/portal/stream`-Zuschauern** (Reactions, Hand-Raise, Chat) — werden via Postgres `LISTEN/NOTIFY` an den SSE-Endpoint gebrückt; keine neue Infra (`livekit-redis` existiert zwar, aber für diesen Datenmenge reicht Postgres-Listen)

**Fallback:** Bei SSE-Drop > 10 s Toast anzeigen + auf Polling von `/api/live/state` alle 5 s umschalten; SSE-Reconnect alle 30 s versuchen.

## 8. Page-Load-Flow

```
1. /admin/live (Astro, server)
   ├─ getSession + isAdmin (sonst Redirect)
   └─ fetchInitialState() → Seed wird in <LiveCockpit>-Props injiziert
2. LiveCockpit.svelte (client, mount)
   ├─ EventSource('/api/live/events')
   ├─ derive state ∈ {empty, stream, rooms, both} aus seed/events
   └─ render passende Hülle + Kinder
3. Kinder
   ├─ StreamPlayer verbindet LiveKit (Host-Modus)
   ├─ RoomsBoard liest rooms[] aus Props, postet an existing Bulk-Endpoints
   └─ Alle Schreibpfade nutzen die heutigen Admin-Endpoints — nur die Lesseite ist neu
```

## 9. Korczewski-Bug-Fix (im selben PR)

Der Refactor löst den `/admin/meetings`-Crash auf `web.korczewski.de` natürlich, weil die alte Route durch eine frisch geschriebene `/admin/live`-Page ersetzt wird, die auf beiden Brands gegen denselben Code-Pfad geht. Während der Implementation wird die Root-Cause noch identifiziert (vermutlich Schema-Drift bei `meeting_artifacts`/`meeting_insights` oder `process.env.BRAND`-Shadowing), und falls es ein Datenfehler ist, wird er als separater kleiner Commit am Anfang des PRs behoben — sodass auch das verbleibende `/admin/live/sessions/[id]` korrekt lädt.

`listAllMeetings()` wird im Cockpit nur für die „letzte Sessions"-Liste genutzt; sie steht in einem `try/catch`, sodass ein defekter Pfad nicht das gesamte Cockpit weißpapiert, sondern nur die Liste mit einem Fehler-Banner zeigt.

## 10. Fehlerbehandlung

| Fehler | Verhalten |
|---|---|
| SSE drop > 10 s | Toast + Polling-Fallback; SSE-Reconnect alle 30 s |
| `/api/live/state` 500 | „Cockpit nicht erreichbar" mit Retry-Knopf, Launchpad rendert weiterhin |
| LiveKit-Server unerreichbar (kein Stream) | StreamCockpit ausblenden, Stripe „Stream offline" im Launchpad |
| `listAllMeetings()` wirft (Korczewski-Schema) | „Letzte Sessions"-Liste zeigt Fehler-Banner, Cockpit-Rest unbeeinflusst |
| Bulk-Aktion (Brett/Poll/Transcribe) schlägt teilweise fehl | Bestehende Teilerfolg-Anzeige (`x/y gesendet`) wird übernommen |

## 11. Tests

**Playwright E2E** — neue Spec `tests/e2e/admin-live.spec.ts`:

- `empty`-State rendert Launchpad mit Start-Buttons
- mock-Stream-aktiv → StreamCockpit volle Breite
- mock-Rooms-aktiv → RoomsBoard volle Breite
- mock-beide → 2/3 + 1/3 Split
- Bulk-Aktion: „Brett für alle" trifft mock-Talk-API
- Hand-Heben aus `/portal/stream` taucht binnen 2 s in HandRaiseQueue auf (über SSE)
- Poll-Erstellung pusht in beide Räume und Stream-Overlay zugleich
- Beide Brands (mentolder + korczewski) laden `/admin/live` ohne Fehler

In `tests/e2e/groups.json` unter `website` einreihen.

**Unit / Integration:**
- State-Machine-Reducer als reine Funktion getestet (input → state)
- `/api/live/state`-Handler gegen seed-Daten

## 12. Phasen-Plan

| Phase | Inhalt |
|---|---|
| 0 | Korczewski-`/admin/meetings`-Root-Cause diagnostizieren + Hotfix-Commit (falls Datenfehler) |
| 1 | Routes + Sidebar + Launchpad + LiveCockpit-Skelett mit State-Machine + redirects |
| 2 | RoomsBoard + BulkActionsBar (Brett/Poll/Transcribe-Modale aus altem `meetings.astro` extrahieren) |
| 3 | StreamCockpit + PublishControls + RecordingPanel + ConnectionIndicator (Stream-Hälfte aus altem `stream.astro` zerlegen) |
| 4 | `/api/live/state` + `/api/live/events` (SSE) — initial nur LiveKit + Talk-Aggregation |
| 5 | AudiencePanel + HandRaiseQueue + PollOverlayPanel (Browser-Events via Postgres-LISTEN) |
| 6 | LiveToasts + ScheduleNudge + Polish |
| 7 | Stretch-Features (Q&A, Lower-Third, Captions, Post-Live-Aufräumen) |
| 8 | Playwright-Specs + Cleanup alter `meetings.astro`/`stream.astro`-Dateien |

Jede Phase ist eigener Commit; PR wird in einem Rutsch gemerged (vgl. CLAUDE.md auto-merge-Workflow).
