# sidekick-cleanup-grilling-broadcast

## Purpose

Das Portal-Sidekick wird auf einen schlanken "nur noch Coaching/Quelle/Container"-Scope reduziert: die Tickets-, Inbox- und Pipeline-Views werden komplett entfernt, ebenso die zugehörigen Banner/Nudge-Logiken (`decideBanner`, `BannerDecision`, `shouldShowLearnDot`). Verbleibend sind Coaching, Quelle (Learn), Container und das neue ai-quality View.

## Requirements

### Requirement: SidekickHome.svelte ohne Tickets/Inbox/Pipeline-Items

The system SHALL NOT render the SidekickHome items for `tickets`, `inbox`, `pipeline` or `loslernen`. The remaining items (coaching, source, container, ai-quality) SHALL be renumbered 01-N in the order they appear.

### Requirement: PortalSidekick.svelte ohne View-Branches für entfernte Views

The system SHALL NOT include the `tickets`, `inbox`, or `pipeline` view branches in `PortalSidekick.svelte`. The `View` union, `titleMap`, and `decideBanner`/`shouldShowLearnDot` references SHALL be cleaned up accordingly. The `learning/summary`, `tickets`, and `inbox` API fetches SHALL be removed (only `container-count` remains).

### Requirement: sidekick-nudge.ts ohne Banner/LearnDot

The system SHALL NOT export `decideBanner`, `BannerDecision`, `BannerInput`, or `shouldShowLearnDot` from `website/src/lib/assistant/sidekick-nudge.ts`. `SidekickView` and `KNOWN_VIEWS` SHALL be reduced to the post-cleanup view set.

### Requirement: mediaviewer-bridge.ts Session-Protokoll

The system SHALL extend `HostInbound.setMode.mode` to accept `'brainstorm'`, and SHALL add `sessionStarted` and `sessionProgress` events to `HostOutbound` in `mediaviewer-bridge.ts`. The `buildSetModeMessage` and `parseOutbound` helpers SHALL be updated accordingly, with tests covering the new cases.

#### Scenario: Removed View wird im Sidekick nicht gerendert

- **GIVEN** `tickets`, `inbox`, `pipeline` sind aus `KNOWN_VIEWS` entfernt
- **WHEN** PortalSidekick mounted
- **THEN** ist keiner der drei Einträge in der Sidekick-Item-Liste sichtbar
- **AND** `grep -nE 'progressSub|summary|banner|pendingTickets|pendingInbox|loslernen' website/src/components/assistant/SidekickHome.svelte` ist leer

#### Scenario: Session-Protokoll für Brainstorm-View

- **GIVEN** die Mediaviewer ist im `brainstorm`-Modus
- **WHEN** die Brainstorm-Session startet
- **THEN** sendet die Bridge `sessionStarted` mit Session-Metadaten
- **AND** sendet periodisch `sessionProgress` Updates

<!-- from archive/2026-06-21-sidekick-cleanup-grilling-broadcast/tasks.md lines 1-100 -->
