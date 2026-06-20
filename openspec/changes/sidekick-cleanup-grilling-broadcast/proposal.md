# Proposal: sidekick-cleanup-grilling-broadcast

## Why

Das SidekickMenu enthält vier UI-Einträge die im aktuellen Workflow nicht mehr gebraucht werden:
- **Anfragen/Postfach/Pipeline** sind Admin-Views, die direkt über eigene Admin-Seiten zugänglich sind. Im Sidekick erzeugen sie Verwirrung und belasten das UI mit Fetch-Calls und Badge-Counts ohne Mehrwert.
- **Lernpfad + Banner "Starte deinen Lernpfad"** ist ein Lernpfad-Feature, das im aktuellen Nutzungskontext nicht relevant ist.

Das Grilling-Widget (mediaviewer-iframe) unterstützt aktuell nur `final-grilling-v1` und sendet Events nur als postMessage an den unmittelbaren Host-Frame. Für dev-flow-Brainstorm-Sessions (und künftig weitere strukturierte Sessions) wird ein Broadcast-Mechanismus benötigt, damit andere Tabs und Komponenten auf Session-Events reagieren können.

## What

### Teil 1: SidekickMenu-Bereinigung

Aus dem Sidekick-Menu entfernen (ohne die eigentlichen Ansichtskomponenten zu löschen):
- Menu-Items: `tickets`, `inbox`, `pipeline`, `loslernen`
- Banner-Logik: `decideBanner()`, `BannerDecision`, `shouldShowLearnDot()`, `learningSummary`, `fab-dot`
- State & Fetches: `pendingTickets`, `inboxPending`, `/api/admin/tickets`, `/api/admin/inbox/count`, `/api/portal/learning/summary`
- Type-Bereinigung: aus `SidekickView`, `KNOWN_VIEWS`, lokalen `View`-Unions
- Renummerierung der verbleibenden Items (cockpit=01, grilling=02, questionnaire=03/01, ...)

### Teil 2: Session-Broadcast im Grilling-Widget

- Neuer Questionnaire `brainstorm-v1` in `grilling.ts`
- Dual-Broadcast in `MediaviewerPanel.svelte`: BroadcastChannel(`session-events`) + `window.dispatchEvent(CustomEvent('session:event', ...))`
- `mediaviewer-bridge.ts`: `sessionStarted` + `sessionProgress` als neue HostOutbound-Typen
- `GrillingSessionHost.svelte`: optionales `sessionType`-Prop (override für questionnaireId)

_Ticket: T000965_
