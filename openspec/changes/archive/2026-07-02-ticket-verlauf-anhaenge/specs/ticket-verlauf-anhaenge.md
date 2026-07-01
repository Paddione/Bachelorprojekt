## ADDED Requirements

### Requirement: TicketActivityTimeline collapse

The system SHALL initially show only the 5 most recent activity entries in
`TicketActivityTimeline` and provide an expand/collapse toggle when the total entry count
exceeds the initial limit.

#### Scenario: Default shows 5 entries when more exist

- **GIVEN** a ticket has 10 activity entries
- **WHEN** `TicketActivityTimeline` renders without an explicit `initialCount` prop
- **THEN** exactly 5 entries are visible in the list

#### Scenario: Expand button shows all entries

- **GIVEN** `TicketActivityTimeline` is in collapsed state with 10 entries
- **WHEN** the user clicks the expand button
- **THEN** all 10 entries are visible

#### Scenario: Collapse button returns to initial count

- **GIVEN** `TicketActivityTimeline` is in expanded state
- **WHEN** the user clicks "Weniger anzeigen"
- **THEN** only the initial 5 entries are visible again

#### Scenario: No toggle button when entries fit

- **GIVEN** a ticket has 4 activity entries and `initialCount` is 5
- **WHEN** `TicketActivityTimeline` renders
- **THEN** no expand/collapse toggle button is present

### Requirement: TicketAttachmentsPanel component

The system SHALL provide a `TicketAttachmentsPanel` Svelte component that lists ticket
attachments with human-readable file sizes, offers a download link for attachments where
`hasDataUrl === true`, and provides an upload dialog via a `<dialog>` element.

#### Scenario: Empty state

- **GIVEN** a ticket has no attachments
- **WHEN** `TicketAttachmentsPanel` renders
- **THEN** a "Keine Anhänge" message is displayed
- **AND** the header count reads 0

#### Scenario: Download link for available attachment

- **GIVEN** an attachment with `hasDataUrl === true`
- **WHEN** `TicketAttachmentsPanel` renders that attachment
- **THEN** an `<a>` with `href="/api/admin/tickets/{ticketId}/attachments/{id}"` and a `download` attribute is present

#### Scenario: No download link when data unavailable

- **GIVEN** an attachment with `hasDataUrl === false`
- **WHEN** `TicketAttachmentsPanel` renders that attachment
- **THEN** no download `<a>` is rendered for that attachment

#### Scenario: File size formatted correctly

- **GIVEN** attachments with sizes 512 B, 2048 B, and 2097152 B
- **WHEN** `TicketAttachmentsPanel` renders
- **THEN** the sizes display as "512 B", "2 KB", and "2 MB" respectively

#### Scenario: Upload dialog opens via button

- **GIVEN** `TicketAttachmentsPanel` is rendered
- **WHEN** the user clicks the upload button
- **THEN** the `<dialog>` element is opened via `showModal()`

#### Scenario: Upload error shown without crash

- **GIVEN** the upload form is submitted and the server returns an error
- **WHEN** the `fetch POST` completes with a non-ok status
- **THEN** an error message is displayed in the dialog
- **AND** the dialog remains open

### Requirement: [id].astro Anhänge-Block replaced by TicketAttachmentsPanel

The system SHALL replace the inline attachment-list markup and upload dialog in the
fullscreen ticket detail page (`[id].astro`) with a single `<TicketAttachmentsPanel
client:load />` island, reducing the attachment section from ~28 lines to 1 line.

#### Scenario: Attachment panel renders in fullscreen detail

- **GIVEN** a ticket detail page with existing attachment data
- **WHEN** the fullscreen page renders
- **THEN** `<TicketAttachmentsPanel />` is present in the DOM
- **AND** no duplicate upload `<dialog>` element exists outside the panel
