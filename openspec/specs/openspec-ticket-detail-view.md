# openspec-ticket-detail-view

## Purpose

Im Admin-Cockpit wird auf der Ticket-Detail-Seite (`/admin/tickets/[id]`) ein neues `OpenSpecProposalsPanel.svelte` eingeblendet, das alle laufenden OpenSpec-Change-Proposals anzeigt, die dieses Ticket referenzieren. Das Panel wird statisch aus `openspec-status.json` (ticketId → Vorschläge) gerendert und ist Slug-zu-Titel-case-basiert mit GitHub-Link auf `proposal.md`.

## Requirements

### Requirement: OpenSpecProposalsPanel-Komponente

The system SHALL provide `website/src/components/admin/OpenSpecProposalsPanel.svelte` accepting a `proposals: Array<{ slug: string; status: string }>` prop. The component SHALL render each proposal as a row with a status badge (color-coded: `planning` gray, `plan_staged` gold, `archived` green, fallback gray) and a link to `https://github.com/Paddione/Bachelorprojekt/blob/main/openspec/changes/{slug}/proposal.md`.

#### Scenario: Panel rendert Slug als Title-Case

- **GIVEN** `proposals = [{ slug: "sidekick-ai-quality", status: "plan_staged" }]`
- **WHEN** das Panel gerendert wird
- **THEN** zeigt es den Titel "Sidekick Ai Quality" mit goldenem Badge
- **AND** der Link verweist auf `.../blob/main/openspec/changes/sidekick-ai-quality/proposal.md`

### Requirement: Statische SSR-Integration in [id].astro

The system SHALL import the `OpenSpecProposalsPanel` and `openspec-status.json` in `website/src/pages/admin/tickets/[id].astro`, derive `openspecProposals = (map as ...)[ticket.externalId] ?? []` at SSR time, and render the panel via `<OpenSpecProposalsPanel client:load ... />` after the existing `TicketAttachmentsPanel` only when `openspecProposals.length > 0`.

### Requirement: Stil-Konsistenz mit ContainerDorPanel

The system SHALL style `OpenSpecProposalsPanel.svelte` to match `ContainerDorPanel.svelte` (same border, padding, font size) so the panel visually integrates with the existing ticket detail layout.

<!-- from archive/2026-06-21-openspec-ticket-detail-view/tasks.md lines 1-50 -->
