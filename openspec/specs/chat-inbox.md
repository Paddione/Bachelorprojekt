# chat-inbox

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

### Requirement: Authenticated message thread per customer

The system SHALL maintain exactly one `message_thread` per customer (identified by Keycloak user ID).
When a logged-in portal user sends their first message the system SHALL create the thread automatically;
subsequent messages SHALL append to the existing thread. Unauthenticated requests SHALL be rejected with HTTP 401.

#### Scenario: First message from a portal user

- **GIVEN** an authenticated portal user who has no existing message thread
- **WHEN** the user POSTs a non-empty body to `/api/portal/messages`
- **THEN** the system creates a new `message_thread` and a first `message` row, responds HTTP 201, and creates a `user_message` inbox item for the admin queue

#### Scenario: Subsequent message appends to existing thread

- **GIVEN** an authenticated portal user who already has a thread
- **WHEN** the user POSTs another message
- **THEN** the system appends to the existing thread, updates `last_message_at`, and responds HTTP 201

#### Scenario: Unauthenticated send attempt

- **GIVEN** no valid session cookie
- **WHEN** a POST to `/api/portal/messages` is made
- **THEN** the system responds HTTP 401 with `{"error":"Unauthorized"}`

---

## Requirements

### Requirement: Admin inbox aggregates all pending items by type

The system SHALL expose a single admin inbox that aggregates six item types
(`registration`, `booking`, `contact`, `bug`, `meeting_finalize`, `user_message`)
and tracks their lifecycle through three statuses: `pending`, `actioned`, `archived`.
Listing and counts SHALL be restricted to authenticated admin sessions.

#### Scenario: Admin fetches pending items

- **GIVEN** an authenticated admin session
- **WHEN** `GET /api/admin/inbox?status=pending` is called
- **THEN** the response contains `{ items: InboxItem[], counts: Record<InboxType, number> }` ordered by `created_at DESC`

#### Scenario: Non-admin is rejected

- **GIVEN** a session without the admin role
- **WHEN** `GET /api/admin/inbox` is called
- **THEN** the system responds HTTP 401

---

### Requirement: Inbox item transitions are idempotent and conflict-safe

The system SHALL reject action requests against inbox items that are not in `pending` status with HTTP 409 (`Already actioned`).
The only exception is the `delete` escape hatch, which SHALL succeed regardless of status.

#### Scenario: Attempt to action an already-actioned item

- **GIVEN** an inbox item with `status = 'actioned'` and a pending action request
- **WHEN** `POST /api/admin/inbox/[id]/action` is called with any action other than `delete`
- **THEN** the system responds HTTP 409 `{"error":"Already actioned"}` and makes no state change

#### Scenario: Delete bypasses status lock

- **GIVEN** an inbox item with any status
- **WHEN** `POST /api/admin/inbox/[id]/action` is called with `action: "delete"`
- **THEN** the system hard-deletes the row and responds HTTP 204

---

### Requirement: Booking approval triggers a cascade of external side effects

When an admin approves a booking, the system SHALL: create a Nextcloud Talk room, invite the customer as guest, create a CalDAV calendar event, send a confirmation email with the meeting link, upsert the customer record, create a meeting DB entry, auto-post the systemisches Brett link into the Talk room, and (when a paid service key is present) create a Stripe billing invoice — all before marking the inbox item as `actioned`.
Any single billing failure SHALL NOT abort the flow; the system SHALL surface it as a status detail instead.

#### Scenario: Full booking approval

- **GIVEN** a `pending` booking inbox item with a `slotStart`, `slotEnd`, `name`, `email`, and a paid `serviceKey`
- **WHEN** the admin triggers `approve_booking`
- **THEN** a Talk room is created, a CalDAV event is added, a confirmation email is sent, a meeting row is persisted, the Brett link is posted into the Talk room, a Stripe invoice is created, and the inbox item transitions to `actioned`

#### Scenario: Stripe invoice creation fails

- **GIVEN** a booking approval where the Stripe API returns an error
- **WHEN** `approve_booking` runs
- **THEN** the Talk room, calendar event, confirmation email, and meeting record are all committed; the inbox item is set to `actioned`; and the response includes `details` containing "Rechnung konnte nicht erstellt werden"

---

### Requirement: Bug resolution requires a non-empty note

The system SHALL refuse to resolve a `bug`-type inbox item when the `note` field is absent or blank,
responding HTTP 400. When a valid note is supplied the system SHALL call `resolveBugTicket` with the note
and the admin's username, mark the item `actioned`, and NOT send a separate email (the ticket transition
itself triggers the close-mail).

#### Scenario: Bug resolved with a valid note

- **GIVEN** a pending `bug` inbox item and an admin with a note of 1–500 characters
- **WHEN** `POST /api/admin/inbox/[id]/action` is called with `action: "resolve_bug"` and a non-empty `note`
- **THEN** `resolveBugTicket` is called, the item is set to `actioned`, HTTP 200 is returned

#### Scenario: Bug resolution without a note is rejected

- **GIVEN** a pending `bug` inbox item
- **WHEN** the action is posted with an empty or missing `note`
- **THEN** the system responds HTTP 400 `{"error":"Bitte geben Sie eine Notiz an."}` and the item remains `pending`

---

### Requirement: Admin compose initiates a new outbound message thread

The system SHALL allow an admin to compose a message to any existing customer (identified by `customerId`).
Composing SHALL reuse an existing thread when one exists for that customer, and SHALL inherit the thread's
`is_test_data` flag so that E2E-created threads are purged together with their replies.

#### Scenario: Admin sends to a customer without an existing thread

- **GIVEN** an authenticated admin, a valid `customerId`, and a non-empty `body`
- **WHEN** `POST /api/admin/messages` is called
- **THEN** a new `message_thread` is created, a `message` row with `sender_role='admin'` is inserted, and HTTP 201 is returned

#### Scenario: Admin sends to a customer who already has a thread

- **GIVEN** an authenticated admin and a customer with an existing thread
- **WHEN** `POST /api/admin/messages` is called
- **THEN** the message is appended to the existing thread; no duplicate thread is created

---

### Requirement: Thread read-receipts are tracked per role

The system SHALL mark messages as read from the perspective of the reading party:
when an admin opens a thread, all messages with `sender_role='user'` in that thread SHALL have their
`read_at` set; when a portal user reads their thread, all messages with `sender_role='admin'` SHALL be
marked read. Read receipt writes SHALL occur on GET, not on POST.

#### Scenario: Admin reads a thread

- **GIVEN** a thread containing unread user messages (messages with `read_at IS NULL` and `sender_role='user'`)
- **WHEN** `GET /api/admin/messages/[threadId]` is called by an admin
- **THEN** `markThreadRead(threadId, 'admin')` is called, setting `read_at = now()` on those rows

#### Scenario: Portal user reads their thread

- **GIVEN** a thread containing unread admin replies
- **WHEN** `GET /api/portal/messages/[threadId]` is called by the owning user
- **THEN** `markThreadRead(threadId, 'user')` is called, marking the admin messages as read

---

### Requirement: Chat room membership enforces access isolation

The system SHALL prevent portal users from reading or posting to chat rooms they are not a member of.
Archived rooms SHALL accept reads but reject new messages. Membership checks SHALL be based on the
`chat_room_members` table keyed by the customer record resolved from the session email.

#### Scenario: Non-member attempts to read a room

- **GIVEN** an authenticated portal user who is not a member of room 42
- **WHEN** `GET /api/portal/rooms/42/messages` is called
- **THEN** the system responds HTTP 403

#### Scenario: Post to an archived room is rejected

- **GIVEN** an authenticated member of room 42, and room 42 has `archived_at IS NOT NULL`
- **WHEN** `POST /api/portal/rooms/42/messages` is called
- **THEN** the system responds HTTP 403 `{"error":"Room is archived"}`

#### Scenario: Member reads and auto-marks messages as read

- **GIVEN** an authenticated member of room 42 with unread messages
- **WHEN** `GET /api/portal/rooms/42/messages` is called
- **THEN** the system returns all messages and calls `markRoomMessagesRead` up to the last returned message ID

---

### Requirement: Inbox badge reflects live pending counts

The system SHALL expose `GET /api/admin/inbox/count` that returns `{ counts: Record<InboxType, number>, total: number }` so the AdminLayout sidebar badge can stay in sync after client-side actions without reloading the full item list. The endpoint SHALL be restricted to authenticated admin sessions.

#### Scenario: Admin sidebar badge poll

- **GIVEN** an authenticated admin session and 3 pending `registration` items, 1 pending `booking`
- **WHEN** `GET /api/admin/inbox/count` is called
- **THEN** the response contains `{ counts: { registration: 3, booking: 1 }, total: 4 }`

#### Scenario: Non-admin count request is rejected

- **GIVEN** a non-admin or unauthenticated request
- **WHEN** `GET /api/admin/inbox/count` is called
- **THEN** the system responds HTTP 403

---

### Requirement: Prod-Guard gegen E2E-Testdaten in Postfach
Die API-Endpunkte `/api/contact`, `/api/booking`, `/api/bug-report` und `/api/portal/messages` MÜSSEN den `X-E2E-Test`-Header in Production-Umgebungen (`NODE_ENV=production`) ignorieren. `is_test_data` MUSS in Production immer `false` sein.

#### Scenario: X-E2E-Test Header wird in Prod ignoriert
- **WHEN** a request with `X-E2E-Test: true` header arrives in production
- **THEN** the request is processed normally but `is_test_data` is set to `false`

#### Scenario: X-E2E-Test Header funktioniert in Dev/Test
- **WHEN** a request with valid `X-E2E-Test` and `X-Cron-Secret` headers arrives in non-production
- **THEN** `is_test_data` is set to `true` as before

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: All messaging API endpoints require authentication
<!-- e2e: fa-01-messaging.spec.ts | e2e: fa-28-messaging.spec.ts -->

The system SHALL reject unauthenticated requests to all portal and admin messaging endpoints with HTTP 401 or 403.

#### Scenario: Portal rooms endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/portal/rooms` is called
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Portal nachrichten endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/portal/nachrichten` is called
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Ensure-direct room endpoint rejects unauthenticated POST *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `POST /api/portal/rooms/ensure-direct` is called with `{ targetCustomerId: 'test' }`
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Room messages endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/portal/rooms/999/messages` is called
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Portal messages endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/portal/messages` is called
- **THEN** the system responds HTTP 401

#### Scenario: Admin messages endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/admin/messages` is called
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Admin rooms endpoint rejects unauthenticated GET *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `GET /api/admin/rooms` is called
- **THEN** the system responds HTTP 401 or 403

#### Scenario: Portal messages POST with empty body rejected without auth *(E2E)*
- **GIVEN** no valid session cookie
- **WHEN** `POST /api/portal/messages` is called with an empty JSON body
- **THEN** the system responds HTTP 400, 401, or 403

---

### Requirement: Portal chat UI is inaccessible without authentication
<!-- e2e: fa-01-messaging.spec.ts | e2e: fa-28-messaging.spec.ts -->

The system SHALL redirect or block unauthenticated users attempting to access portal messaging pages.

#### Scenario: Portal nachrichten section redirects unauthenticated users *(E2E)*
- **GIVEN** no valid session
- **WHEN** the user navigates to `/portal?section=nachrichten`
- **THEN** the user is redirected away from `/portal`

#### Scenario: Portal root redirects unauthenticated user away from chat *(E2E)*
- **GIVEN** no valid session
- **WHEN** the user navigates to `/portal`
- **THEN** the user is either redirected to Keycloak/login, or if still on `/portal` the chat compose UI ("Nachrichten senden") is not rendered

---

### Requirement: Admin inbox renders two-pane UI with all item types
<!-- e2e: fa-admin-inbox.spec.ts -->

The system SHALL render the admin inbox with a sidebar listing all six item types plus "Alle", and auto-select the first item when the list is non-empty.

#### Scenario: Inbox app root and sidebar are visible *(E2E)*
- **GIVEN** an authenticated admin session at `/admin/inbox`
- **WHEN** the page loads
- **THEN** `[data-testid="inbox-app"]` and `[data-testid="inbox-sidebar"]` are visible, and the sidebar contains exactly 7 `[data-testid="inbox-sidebar-item"]` entries (Alle + 6 types)

#### Scenario: Empty detail placeholder shown when no item selected *(E2E)*
- **GIVEN** an authenticated admin at `/admin/inbox?status=archived` with no items in the list
- **WHEN** the page loads
- **THEN** `[data-testid="inbox-detail-empty"]` is visible

#### Scenario: Status tabs update URL query parameter *(E2E)*
- **GIVEN** an authenticated admin on `/admin/inbox`
- **WHEN** each status tab (`pending`, `done`, `archived`) is clicked
- **THEN** the URL updates to `?status=<status>` and the list re-renders

#### Scenario: Sidebar type filter narrows list rows *(E2E)*
- **GIVEN** an authenticated admin on `/admin/inbox` with items in the list
- **WHEN** a non-"Alle" sidebar type is clicked
- **THEN** the number of visible `[data-testid="inbox-list-row"]` items does not exceed the baseline count; clicking "Alle" restores all rows

---

### Requirement: Admin inbox delete escape hatch removes rows regardless of status
<!-- e2e: fa-admin-inbox-delete.spec.ts -->

The system SHALL allow admins to hard-delete any inbox item via the Löschen button regardless of its current status (`pending`, `actioned`, or `archived`).

#### Scenario: Seeded test row can be deleted via Löschen button *(E2E)*
- **GIVEN** an authenticated admin and a `contact` inbox row seeded with `is_test_data=true` via `POST /api/contact` (X-E2E-Test header)
- **WHEN** the admin selects the row and clicks `[data-testid="inbox-action-delete"]`, then confirms the dialog
- **THEN** the row disappears from `[data-testid="inbox-list"]` and a subsequent `GET /api/admin/inbox?status=pending` no longer contains the seeded item

#### Scenario: Delete button is present on archived rows *(E2E)*
- **GIVEN** an authenticated admin on `/admin/inbox?status=archived` with at least one archived row
- **WHEN** the admin selects an archived row
- **THEN** `[data-testid="inbox-action-delete"]` is visible and enabled

---

### Requirement: Bug resolution notifies reporter via email
<!-- e2e: fa-bugs-notifications.spec.ts -->

The system SHALL send a notification email to the original bug reporter when an admin resolves the ticket, with a subject containing the ticket ID.

#### Scenario: Reporter receives close-mail when admin resolves ticket *(E2E)*
- **GIVEN** a bug report submitted via `POST /api/bug-report` (no auth required), yielding a ticket ID
- **WHEN** an authenticated admin calls `POST /api/admin/bugs/resolve` with the ticket ID and a resolution note
- **THEN** Mailpit (or the SMTP relay) delivers an email to the reporter's address with a subject containing the ticket ID

#### Scenario: Bug resolve endpoint requires admin authentication *(E2E)*
- **GIVEN** no valid admin session
- **WHEN** `POST /api/admin/bugs/resolve` is called with a ticket ID and resolution note
- **THEN** the system responds HTTP 401 or 403

---

### Requirement: LLM workspace-chat roundtrip returns coherent German text
<!-- e2e: fa-37-workspace-chat.spec.ts -->

The system SHALL route chat completion requests through the LLM router and return non-empty, non-error German text responses within 90 seconds.

#### Scenario: Chat completions return sensible German text *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` or `LLM_HOST_IP` is set and the LLM router is reachable
- **WHEN** `POST /v1/chat/completions` is called with a ~200-token German prompt (model `qwen2.5:14b`)
- **THEN** the response is HTTP 200, `choices` is a non-empty array, and the first choice's content is longer than 30 characters and does not contain "error"

#### Scenario: Stream mode returns HTTP 200 without 5xx *(E2E)*
- **GIVEN** the LLM router is reachable
- **WHEN** `POST /v1/chat/completions` is called with `stream: true`
- **THEN** the response status is HTTP 200

---

### Requirement: System-Test 3 Kommunikation walkthrough succeeds
<!-- e2e: systemtest-03-kommunikation.spec.ts -->

The system SHALL successfully complete all steps of System-Test 3 (Kommunikation — Chat-Widget, Inbox & E-Mail) when walked via the automated systemtest runner.

#### Scenario: All Kommunikation systemtest steps complete *(E2E)*
- **GIVEN** an admin session and the website is reachable
- **WHEN** the systemtest runner walks all steps of template 3
- **THEN** all steps complete without error within 180 seconds

<!-- merged from change delta chat-inbox.md (72a5d35b9e1f) -->