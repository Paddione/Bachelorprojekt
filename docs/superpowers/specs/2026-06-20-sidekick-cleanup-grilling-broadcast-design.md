---
title: SidekickMenu-Bereinigung + Grilling-Widget Session-Broadcast
date: 2026-06-20
slug: sidekick-cleanup-grilling-broadcast
ticket_id: T000965
plan_ref: docs/superpowers/plans/2026-06-20-sidekick-cleanup-grilling-broadcast.md
status: approved
---

# Design-Spec: SidekickMenu-Bereinigung + Grilling-Widget Session-Broadcast

## Kontext & Motivation

Das SidekickMenu enthält aktuell vier Items, die nicht mehr im UI-Flow erscheinen sollen:
- **Anfragen** (id=`tickets`) — Admin-only, hat separate Admin-Page
- **Postfach** (id=`inbox`) — Admin-only, hat separate Admin-Page
- **Pipeline** (id=`pipeline`) — Admin-only, hat separate Admin-Page
- **Starte deinen Lernpfad / Lernpfad** (id=`loslernen`) — Lernpfad-Banner + Menu-Eintrag

Gleichzeitig soll das Grilling-Widget (mediaviewer-iframe) in die Lage versetzt werden,
beliebige Brainstorm- oder ähnliche Fragebögen zu broadcasten — d.h. Session-Events über
`BroadcastChannel` und `window.dispatchEvent(CustomEvent)` auszusenden, damit der Rest
der App (und andere Browser-Tabs) auf Session-Aktivität reagieren kann.

## Teil 1: SidekickMenu-Bereinigung

### Was entfernt wird

**Menu-Items (SidekickHome.svelte):**
- `{ id: 'tickets', ... show: isAdmin }` — Zeile 38
- `{ id: 'inbox', ... show: isAdmin }` — Zeile 39
- `{ id: 'pipeline', ... show: isAdmin }` — Zeile 40
- `{ id: 'loslernen', ... show: true, href: '/portal/loslernen' }` — Zeile 46

**Banner-Block (SidekickHome.svelte):**
- Der `{#if banner}` Block (Zeilen 67-78) mit "Starte deinen Lernpfad"
- Import von `decideBanner` und `BannerDecision` aus sidekick-nudge.ts
- Der `banner` $derived-State und die `BannerInput`-Props

**Typ-Definitionen (SidekickHome.svelte + PortalSidekick.svelte):**
- `'tickets' | 'inbox' | 'pipeline'` aus dem lokalen `type View`-Union

**View-Routing (PortalSidekick.svelte):**
- `{:else if view === 'tickets'}` Branch
- `{:else if view === 'inbox'}` Branch
- `{:else if view === 'pipeline'}` Branch
- `titleMap`-Einträge für tickets, inbox, pipeline
- Imports: `TicketSidekickView`, `InboxSidekickView`, `PipelineSidekickView`

**State & API-Fetches (PortalSidekick.svelte):**
- `pendingTickets` state + `/api/admin/tickets` Fetch
- `inboxPending` state + `/api/admin/inbox/count` Fetch
- `learningSummary` state + `/api/portal/learning/summary` Fetch
- `learning:updated` Event-Listener
- `showLearnDot` $derived + `fab-dot` UI-Element

**Sidekick-Nudge (sidekick-nudge.ts):**
- `'tickets' | 'inbox' | 'pipeline'` aus `SidekickView` Type-Union
- `'tickets', 'inbox', 'pipeline'` aus `KNOWN_VIEWS` Set
- `decideBanner()` Funktion + `BannerDecision`/`BannerInput` Interfaces
- `shouldShowLearnDot()` Funktion

### Was bleibt

- `pendingQuestionnaires` (FAB-Badge für Fragebögen) — bleibt
- `pendingContainerCount` (FAB-Badge für Cockpit-Container) — bleibt
- `summary`/`progressSub` in SidekickHome — bleibt für agent-guide Sub-Text
- Alle anderen Views: cockpit, grilling, questionnaire, support, agent-guide, mediaviewer, help

### Nummern-Renummerierung

Nach Entfernung der 4 Items werden die `no`-Felder neu gesetzt:

| View | Admin-Nummmer | Portal-Nummer |
|------|--------------|---------------|
| cockpit | 01 | (nur Admin) |
| grilling | 02 | (nur Admin) |
| questionnaire | 03 | 01 |
| support | 04 | 02 |
| agent-guide | 05 | 03 |
| mediaviewer | 06 | 04 |
| help | 07 | 05 |

## Teil 2: Grilling-Widget Session-Broadcast

### Anforderung

Das Grilling-Widget (in der Mediaviewer-iframe) soll Session-Events broadcasten, damit:
1. Andere Browser-Tabs (z.B. ein laufendes Brainstorm-Board) darüber informiert werden
2. Andere Svelte-Komponenten auf der gleichen Seite reagieren können
3. Beliebige Questionnaire-Typen (nicht nur `final-grilling-v1`) funktionieren

### Broadcast-Strategie: Dual-Channel

**Layer 1 — BroadcastChannel** (cross-tab, selber Origin):
```ts
const ch = new BroadcastChannel('session-events');
ch.postMessage({ type: 'grillingAnswer', sessionType: questionnaireId, questionId, answer });
```

**Layer 2 — CustomEvent** (same-page, für Svelte-Komponenten):
```ts
window.dispatchEvent(new CustomEvent('session:event', {
  detail: { type: 'grillingAnswer', sessionType, questionId, answer }
}));
```

### Neue Session-Typen

Ein neuer Questionnaire-Typ `brainstorm-v1` in `grilling.ts` für strukturierte Brainstorm-Sessions:
- Abschnitte: Problemstellung, Lösungsansätze, Risiken, nächste Schritte
- 8–10 Fragen optimiert für schnelle Dev-Flow-Brainstorm-Sessions

### Bridge-Erweiterung (mediaviewer-bridge.ts)

Neuer `HostInbound`-Message-Typ für beliebigen Session-Start:
```ts
| { type: 'setMode'; mode: 'video' | 'grilling' | 'brainstorm'; ticketId?: string; sessionId?: string }
```

Neue `HostOutbound`-Event-Typen (optional, aber nützlich für Brainstorm):
```ts
| { type: 'sessionStarted'; sessionType: string; sessionId?: string }
| { type: 'sessionProgress'; sessionType: string; answeredCount: number; totalCount: number }
```

### Host-seitige Broadcast-Logik (MediaviewerPanel.svelte)

Im `message`-Handler wird nach jedem grillingAnswer/grillingComplete/grillingDismiss Event
die Session-Information über beide Kanäle gebroadcastet:

```ts
// Im onGrillingAnswer Handler-Wrapper:
const channel = new BroadcastChannel('session-events');
channel.postMessage({ type: 'answer', sessionType: currentSessionType, questionId, answer });
window.dispatchEvent(new CustomEvent('session:event', {
  detail: { type: 'answer', sessionType: currentSessionType, questionId, answer }
}));
channel.close();
```

### GrillingSessionHost-Erweiterung

`GrillingSessionHost.svelte` erhält ein optionales `sessionType`-Prop, das an 
`buildGrillingSessionData` weitergegeben wird (override für `questionnaireId`).
Wenn `mode === 'brainstorm'`, wird `questionnaireId = 'brainstorm-v1'` verwendet.

### SidekickView-Integration (kein neues Menu-Item)

`brainstorm` wird NICHT als Menu-Item hinzugefügt. Stattdessen kann ein `sidekick:navigate`
Custom-Event mit `{ view: 'grilling', ticketId: '...', questionnaireId: 'brainstorm-v1' }` 
geworfen werden, um die Grilling-Session im Grilling-View zu starten.

Alternativ: `view: 'brainstorm'` als eigenständiger View, der über
`sidekick:navigate`-Events erreichbar ist (z.B. aus dev-flow-plan-Flows), aber NICHT
im Home-Menu erscheint.

## Entscheidungen & Trade-offs

| Entscheidung | Begründung |
|---|---|
| BroadcastChannel + CustomEvent dual | BroadcastChannel für cross-tab, CustomEvent für same-page Svelte-Reaktivität |
| brainstorm-v1 als neuer Questionnaire | Wiederverwendung der bestehenden GrillingSessionData-Struktur; kein neues API nötig |
| Kein neues Menu-Item für brainstorm | Brainstorm ist ein programmatischer Flow (dev-flow-plan triggert es), kein User-initiiertes Menu-Item |
| pendingTickets/inboxPending entfernen | Menu-Items weg → Badges weg; Admin hat separate Seiten |
| BannerDecision + shouldShowLearnDot entfernen | Mit loslernen aus dem Menu entfällt die gesamte Lernpfad-Nudge-Logik im Sidekick |

## Nicht in Scope

- Entfernung der eigentlichen Ticket-/Inbox-/Pipeline-Svelte-Ansichtskomponenten (die können bleiben für Admin-Pages)
- Änderungen an der Admin-Seite selbst
- Änderungen an der mediaviewer-widget Implementierung (Widget-Code im iframe)
- Backend-API-Änderungen
- Neues brainstorm-Backend (die Antworten werden weiterhin als grilling_answers gespeichert)
