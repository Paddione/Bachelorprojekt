# chat-inbox

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

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
