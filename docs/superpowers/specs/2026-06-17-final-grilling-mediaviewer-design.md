---
ticket_id: T000942
plan_ref: null
status: active
date: 2026-06-17
---

# Final-Grilling-Session im Mediaviewer Sidekick Widget

## Summary

Der Mediaviewer-Widget erhält einen zweiten Modus (`grilling`), in dem kein Video
abgespielt wird, sondern eine interaktiv beantwortbare Final-Grilling-Session
angezeigt wird. Die Session-Fragen werden **implizit aus Ticket-Informationen**
(Grilling-Antworten des `coaching-sessions-v1`, Ticket-Metadaten, Anhänge,
Kommentare) abgeleitet und mit KI-generierten Vorschlägen (Visual Companion)
angereichert. Der Coach sieht im Sidekick eine strukturierte Reflexion über die
abgeschlossene Coaching-Session und kann Antworten direkt im Widget persistieren.

## Motivation

- **Problem**: Nach Abschluss eines Coachings liegen viele Informationen verteilt
  (Grilling-Antworten, Ticket-Kommentare, Anhänge, Session-Notizen). Es fehlt eine
  fokussierte Abschluss-Reflexion, die alle Puzzleteile zusammenführt.
- **Ziel**: Eine Final-Grilling-Session im Sidekick-Widget, die:
  - aus Ticket-Daten **implizit generierte** Reflexionsfragen anzeigt,
  - KI-Vorschläge und visuelle Begleiter einblendet,
  - Antworten direkt im Widget-Ticket persistiert,
  - für **beide Brands** (mentolder + korczewski) funktioniert.

## User Story

> Als Coach öffne ich nach einer Coaching-Session den Sidekick, wähle
> "Final Grilling" und erhalte eine interaktive Reflexions-Ansicht mit Fragen,
> die sich aus meinen vorherigen Antworten und den Ticket-Assets ableiten.
> Ich kann Fragen beantworten, Vorschläge annehmen/verwerfen und die Antworten
> werden automatisch am Ticket gespeichert.

## Architecture

```
PortalSidekick.svelte
  ├── SidekickHome (neuer Tile: "Final Grilling")
  └── view='mediaviewer'
      └── MediaviewerPanel.svelte
          └── <iframe src="mediaviewer.X/embed.html">
              └── postMessage({ type:'setMode', mode:'grilling', ticketId, ... })
              └── React: MediaviewerWidget (mode='grilling')
                  └── GrillingSessionView (neue Komponente)
                      ├── GrillingStepper (adaptiert aus admin/)
                      ├── VisualCompanionSuggestions
                      └── AssetReferences
```

### Zwei Modi des Mediaviewer-Widgets

| Modus | Typ | Inhalt |
|-------|-----|--------|
| `video` (default) | Video-Playlist | Help-Videos aus Videovault |
| `grilling` | Interaktives Q/A | Final-Grilling-Fragebogen |

### Neue postMessage-Bridge-Typen

**Host → Widget (Inbound):**
```typescript
{ type: 'setMode'; mode: 'video' | 'grilling'; ticketId?: string }
{ type: 'setGrillingData'; data: GrillingSessionData }
```

**Widget → Host (Outbound):**
```typescript
{ type: 'grillingAnswer'; questionId: string; answer: string }
{ type: 'grillingDismiss'; questionId: string }
{ type: 'grillingComplete'; answers: Record<string, string> }
```

### Datenfluss

1. PortalSidekick erkennt einen Ticket-Kontext (z.B. via `sidekick:navigate`-Event
   mit `ticketId`) und lädt GrillingDaten via API.
2. `MediaviewerPanel` sendet `setMode:'grilling'` + `setGrillingData` an den Widget.
3. Widget rendert `GrillingSessionView` mit Fragen + Vorschlägen.
4. Nutzer-Antworten werden via `grillingAnswer` zurück an den Host gepostet.
5. Host persistiert via `PATCH /api/admin/tickets/:id` in `grilling_answers`.

## Neue Komponenten & Dateien

### Host-seitig (website/)

| Datei | Zweck |
|-------|-------|
| `website/src/components/mediaviewer/GrillingSessionView.svelte` | NEU: Host-seitiger Wrapper für Grilling-Mode (lädt Daten, managed Persistenz) |
| `website/src/lib/tickets/final-grilling.ts` | NEU: Final-Grilling-Logik — implizite Fragen-Generierung, KI-Vorschläge |
| `website/src/lib/mediaviewer-bridge.ts` | ÄNDERN: Neue Message-Typen |
| `website/src/components/MediaviewerPanel.svelte` | ÄNDERN: Neuer `mode`-Prop, Routing zu Grilling vs. Video |
| `website/src/components/PortalSidekick.svelte` | ÄNDERN: Neuer `mediaviewerMode`-State, Ticket-Kontext-Weitergabe |
| `website/src/components/assistant/SidekickHome.svelte` | ÄNDERN: Neuer Tile "Final Grilling" |
| `website/src/lib/tickets/grilling.ts` | ÄNDERN: `final-grilling-v1`-Questionnaire registrieren |

### Widget-seitig (mediaviewer-widget/)

| Datei | Zweck |
|-------|-------|
| `mediaviewer-widget/src/components/GrillingSessionView.tsx` | NEU: Grilling-UI im Widget (Fragen, Antworten, Vorschläge) |
| `mediaviewer-widget/src/components/GrillingSessionView.test.tsx` | NEU: Tests |
| `mediaviewer-widget/src/embed/bridge.ts` | ÄNDERN: Neue Message-Typen |
| `mediaviewer-widget/src/embed/EmbedApp.tsx` | ÄNDERN: Mode-Routing (video vs. grilling) |
| `mediaviewer-widget/src/MediaviewerWidget.tsx` | ÄNDERN: Neuer `mode`-Prop, Conditional Rendering |
| `mediaviewer-widget/src/styles/grilling.css` | NEU: Grilling-spezifisches Styling |

### Tests

| Datei | Zweck |
|-------|-------|
| `website/src/lib/mediaviewer-bridge.test.ts` | ÄNDERN: Neue Message-Typen testen |
| `website/src/components/MediaviewerPanel.test.ts` | ÄNDERN: Grilling-Mode-Rendering |
| `mediaviewer-widget/src/embed/bridge.test.ts` | ÄNDERN: Neue Message-Typen testen |
| `mediaviewer-widget/src/MediaviewerWidget.test.tsx` | ÄNDERN: Grilling-Mode-Snapshot |

## Fragebogen: `final-grilling-v1`

### Struktur (6 Sektionen, ~20 Fragen)

1. **Sessionrückblick** — Was lief gut? Was war überraschend?
2. **Methoden-Reflexion** — Welche Methoden haben gewirkt? Was würdest du anders machen?
3. **Coachee-Fortschritt** — Wo steht der Coachee jetzt vs. zu Beginn?
4. **Asset-Nutzung** — Welche Materialien/Dokumente wurden genutzt? Fehlt etwas?
5. **Nächste Schritte** — Was sind die konkreten nächsten Aktionen?
6. **Abschluss & Wünsche** — Ist das Coaching abgeschlossen? Was wünschst du dir für die Zukunft?

### Implizite Generierung

Die Fragen werden nicht statisch gerendert, sondern **dynamisch aus Ticket-Daten
abgeleitet**:

- **Sessionrückblick**: Aus `coaching-sessions-v1`-Antworten (insb. q5-q8 Session-Struktur)
- **Methoden-Reflexion**: Aus q9-q12 (Methoden & Werkzeuge)
- **Coachee-Fortschritt**: Aus q15-q16 (Dokumentation & Fortschritt)
- **Asset-Nutzung**: Aus `ticket_attachments`-Metadaten
- **Nächste Schritte**: Aus q11 (Aufgaben/Experimente) + offenen Ticket-Kommentaren
- **Abschluss**: Aus q16 (erfolgreicher Abschluss) + q22-q23 (Wünsche)

Jede Frage kann **KI-generierte Vorschläge** (Visual Companion) enthalten,
die aus dem Gesamtkontext des Tickets abgeleitet werden.

## Acceptance Criteria

1. Der `SidekickHome` zeigt einen neuen Tile "Final Grilling" (für beide Brands, nur bei vorhandenem Ticket-Kontext).
2. Bei Klick öffnet der Mediaviewer-Panel im `grilling`-Mode mit `setMode`-Message.
3. Der Widget rendert den `final-grilling-v1`-Fragebogen mit implizit aus Ticket-Daten generierten Fragen.
4. Fragen können im Widget beantwortet werden — Antworten werden per `POST` an `/api/admin/tickets/:id` persistiert (via Host-Mediation oder Widget-Direkt-Call).
5. KI-Vorschläge (Visual Companion) werden als expandierbare Karten unter jeder Frage angezeigt.
6. Der Widget funktioniert für beide Brands (mentolder + korczewski) via identischer postMessage-Infrastruktur.
7. Bestehende Video-Funktionalität bleibt unverändert (Mode-Umschaltung ist nicht-destruktiv).
8. `task test:changed` läuft grün nach allen Änderungen.
9. `task freshness:regenerate` + `task freshness:check` laufen grün.
