# Mentolder Rest-Flows, Integrationen und Jobs

Inventur-Stand: Branch `chore/mentolder-parity-inventory-T901033`,
Basis `origin/main` (10e35fb79). Ticket: T901033.

Alle Routen-Pfade relativ zu `components/website/src/pages/api/`, alle
Lib-Pfade relativ zu `components/website/src/lib/`. Kernpfade (Buchung bis
Rechnung) stehen im Core-Dokument und werden hier nur referenziert.

## Öffentliche Flows

Formular-Routen mit IP-Rate-Limit, ohne Session:

- `POST /api/contact` (`contact.ts`, POST Z. 19): Limit 5/Min. (Z. 21),
  Inbox-Anlage (Z. 46), Admin-Mail (Z. 54). Test: `kein Test`.
- `POST /api/dsgvo-request` (`dsgvo-request.ts`, POST Z. 10): Limit 3/Std.
  (Z. 12), Bestätigungs-Mail (Z. 45), Admin-Mail (Z. 52). Test: `kein Test`.
- `POST /api/register` (`register.ts`, POST Z. 7): Limit 5/Min. (Z. 9),
  Inbox-Anlage (Z. 33), Admin-Mail (Z. 43). Test: `kein Test`.
- Newsletter: `POST /api/newsletter/subscribe` (Z. 14),
  `GET /api/newsletter/confirm` (Z. 4), `GET /api/newsletter/unsubscribe`
  (Z. 4). Mail-Templates `sendNewsletterConfirmation` /
  `sendNewsletterCampaign` (lib/email.ts Z. 145–206). Test: `kein Test`.
- Lese-Routen: `GET /api/leistungen` (Z. 4), `GET /api/homepage` (Z. 22),
  `GET /api/timeline` (Z. 6), `GET /api/status` (Z. 7),
  `GET /api/health` (Z. 13), `GET /api/assets/[...path]` (Z. 5).
  Test: `kein Test` (bounded: keine Routen-Tests gefunden).
- `GET /api/calendar/slots` (`calendar/slots.ts`, Z. 26): öffentliche
  Verfügbarkeits-Ansicht; kein Session-Guard im Handler gefunden
  (bounded grep; passt zur öffentlichen Slot-Anzeige).
- Anfrage-Self-Service per Token: `POST /api/anfrage/[token]/storno`
  (Z. 40), `POST /api/anfrage/[token]/umbuchung` (Z. 55).
- Auth-Routen: `GET /api/auth/login` (Z. 5), `GET /api/auth/callback`
  (Z. 57), `GET /api/auth/logout` (Z. 5), `GET /api/auth/me` (Z. 14),
  `GET /api/auth/magic` (Z. 16), dazu `auth/e2e-login.ts` (System-Tests).
  Tests: `auth/callback.test.ts`, `auth/me.test.ts`, `auth/e2e-login.test.ts`.
- `POST /api/meeting/finalize` (`meeting/finalize.ts`, Z. 19;
  Idempotency-Kommentar Z. 46, Transkription Z. 94): kein Session-Guard im
  Handler gefunden (bounded grep) — Audit-Befund, kein Exploit-Nachweis.
  Schwestern-Routen `meeting/save-transcript.ts`, `meeting/release.ts`,
  `meeting/transcribe.ts` (Handler-Zeilen nicht erhoben).
- Poll: `GET /api/poll/[id]` (Z. 6), `poll/[id]/answer.ts`,
  `poll/[id]/results.ts` (kein Session-Guard per bounded grep gefunden).
- `POST /api/brett/bot` (Z. 7), `POST /api/signing/confirm` (Z. 28),
  `POST /api/stream/recording` (Z. 5), `stream/end.ts`. Test: `kein Test`.

## Admin-Flows

Guard-Muster `getSession` + `isAdmin` → 401 (Beleg: `admin/inbox.ts` Z. 8–11,
`admin/inbox/[id]/action.ts` Z. 18–21; Details im Auth-Dokument).

- Inbox: `GET /api/admin/inbox` (Liste, Z. 7), `GET /api/admin/inbox/count`
  (Z. 10), `POST /api/admin/inbox/[id]/action` (Aktionen inkl. Delete-
  Escape-Hatch, Buchungs-Rechnungs-Verknüpfung via `setBookingInvoice`).
- Projekte: `admin/projekte/create.ts`, `update.ts`, `delete.ts`,
  `export.ts`, `attachments/upload.ts|download.ts|delete.ts`.
- Inhalte: `admin/angebote/save.ts` (Test: `save.test.ts`),
  `admin/fuehrung/save.ts`, `admin/navigation/save.ts`, `admin/seo/*`
  (pages, index, save, upload-og-image), `admin/shortcuts/*`.
- Betrieb: `admin/brett/broadcast.ts`, `admin/bookkeeping/summary.ts`,
  `admin/agent-push/settings.ts`, `admin/generate-3d/status.ts`.
- Abgegrenzt (nicht vertieft): `admin/coaching/**` (s. Scope-Abgrenzung).
- Lib-Test: `lib/admin-api.test.ts`.

## Owner-Flows

Guard-Muster `requireOwner` (OIDC-Gruppe `workspace-owners`, s. Auth-Dokument).

- `GET /api/owner/me` (Z. 4).
- Buchungen: `POST /api/owner/bookings/phone` (Z. 92, Guard Z. 93),
  `POST /api/owner/bookings/[uid]/cancel` (Z. 27),
  `POST /api/owner/bookings/[uid]/reschedule` (Z. 84);
  `PATCH /api/bookings/[uid]/project` (Z. 5, Projekt-Verknüpfung).
- Anfragen: `POST /api/owner/anfragen/[id]/annehmen` (Z. 31, Guard Z. 32),
  `ablehnen` (Z. 37), `resend.ts`.
- Rechnungen: `POST /api/owner/rechnungen/erstellen` (s. Core-Dokument),
  `GET /api/owner/rechnungen/export` (Z. 25),
  `POST /api/owner/rechnungen/[id]/zahlungsstatus` (Z. 40),
  `rechnungen/[id]/korrigieren.ts`.
- Kunden: `owner/kunden/[id]/korrigieren|zusammenfuehren|loeschen|export`
  (Session-Brand-Filter, s. Auth-Dokument).
- Kalender: `owner/calendar/block.ts`.
- Meetings/Projekte: `PATCH /api/meetings/[id]/project` (Z. 5).
- Tests: Guard via `lib/__tests__/owner-guard.test.ts`; keine Routen-Tests
  unter `pages/api/owner/` (`kein Test`, bounded: Verzeichnis ohne
  `*.test.ts`).

## Portal-Flows

Guard-Muster `getSession` → 401 (Beispiel `portal/messages.ts` Z. 8–12,
`portal/nachrichten.ts` Z. 6–9).

- Nachrichten: `GET+POST /api/portal/messages` (Z. 8/16),
  `GET /api/portal/nachrichten` (Z. 5), `portal/rooms*` (rooms, ensure-direct,
  [id]/share, [id]/messages), `portal/messages/[threadId].ts`.
- Projekte/Lernen: `GET /api/portal/projekte` (Z. 5),
  `portal/learning/summary|track`, `portal/projekttasks/[id]/done`.
- Profil/Onboarding: `portal/profile/update|export`,
  `portal/onboarding/reset|mark-step|update`.
- Fragebögen: `portal/questionnaires/index`, `[id]/index|answer|submit|dismiss`.
- Dokumente/Signatur: `portal/documents/[assignmentId]/pdf`,
  `portal/sign/[assignmentId].ts`.
- Tests: Portal-Assistant-Aktionen
  (`lib/assistant/actions/portal/*.test.ts`: request/move/cancelSession,
  profile-isolation für Aktions-Whitelists); keine Routen-Tests unter
  `pages/api/portal/` (`kein Test`, bounded).

## Integrationen und Jobs

- Mail: `sendEmail` (lib/email.ts Z. 45) plus Templates für Registrierung
  (Z. 68–127), Kontakt-Antwort (Z. 128), Newsletter (Z. 145–206),
  Fragebögen (Z. 207–279), Buchung/Storno/Umbuchung (Z. 280–334);
  `sendAdminNotification` (lib/notifications.ts Z. 25); Notify-Lib mit
  Dedupe/Retry/Log (`dedupeKey` Z. 58, `renderNotify` Z. 90,
  `readNotifyLog` Z. 156, `sendNotify` in lib/appointment-notify.ts).
  Tests: `lib/__tests__/email-booking.test.ts`,
  `lib/__tests__/appointment-notify.test.ts`.
- PDF: `generateInvoicePdf` / `generateDunningPdf` (lib/invoice-pdf.ts
  Z. 193/60, s. Core-Dokument). Test: `invoice-pdf.test.ts`.
- Kalender (CalDAV): `getAllBookings` (lib/caldav.ts Z. 98),
  `getClientBookings` (Z. 150), `getAvailableSlots` (Z. 263),
  `deleteCalendarEvent` (Z. 394), `updateCalendarEventStatus` (Z. 410),
  `updateCalendarEventTime` (Z. 438), `createCalendarEvent` (Z. 474).
  Test: `lib/caldav.test.ts`.
- Stripe: HTTP-Schicht entfernt — `stripe/checkout.ts`, `stripe/webhook.ts`
  und `stripe/invoice-payment-intent.ts` antworten je Z. 2 mit
  `410 'Stripe removed'`; `lib/stripe.ts` ist ein Stub ohne SDK
  (Kommentar Z. 1–5, `stripe = null`, Z. 27). Natives Billing in
  `lib/stripe-billing.ts` bleibt aktiv (`SERVICES` Z. 10,
  `getOrCreateCustomer` Z. 124, `getDraftInvoices` Z. 151,
  `createBillingInvoice` Z. 229). Tests: `stripe-billing.test.ts`,
  `stripe.test.ts`.
- Nextcloud/Talk: `lib/nextcloud-files.ts`, `lib/nextcloud-shares.ts`,
  `lib/nextcloud-talk-db.ts`; Talk-Räume via `createTalkRoom` (lib/talk.ts
  Z. 36), `inviteGuestByEmail` (Z. 84), `getRecordingFile` (Z. 104),
  `deleteTalkRoom` (Z. 170), `sendChatMessage` (Z. 181).
  Test: `lib/talk.test.ts`.
- Cron/Jobs (alle Bearer-`CRON_SECRET`, fail-closed): `POST
  /api/cron/appointment-reminders` (Z. 26; hourly per K8s CronJob,
  Kopfkommentar Z. 1–3; Secret-Prüfung Z. 27–30), `POST
  /api/cron/notify-unread` (Z. 19; Prüfung Z. 8–22), `GET
  /api/cron/scheduled-publish` (Z. 13; Prüfung Z. 11–15), `POST
  /api/cron/error-log-retention` (Z. 5; Prüfung Z. 6–9).
  Test: `cron/error-log-retention.test.ts`; übrige `kein Test` (bounded).
- Asset-Generierung: `assets.generation_jobs` (s. Auth-Dokument: ohne
  Brand-Spalte), Status-Route `admin/generate-3d/status.ts`.

## Scope-Abgrenzung (SDLC/LLM/Coaching)

Per Ticket außerhalb des Small-Business-Kerns; nur aufgelistet, nicht
vertieft (bounded Verzeichnis-Evidenz):

- Assistant-Routen: `assistant/chat.ts` (POST Z. 14),
  `assistant/execute.ts` (POST Z. 12), `assistant/transcribe.ts`,
  `assistant/nudges.ts`, `assistant/dismiss.ts`.
- Retrieval: `bge/retrieve.ts` (GET Z. 29), `bge/changes.ts`.
- Coaching: `admin/coaching/**` (snippets, clusters u. a.),
  `demo/coaching-sim.ts` (Test: `demo/coaching-sim.test.ts`),
  Lib-Module `coaching-*.ts`, `session-agent*.ts`, `claude*.ts`,
  `assistant/` (je mit eigenen Tests).

## Test-Referenzen

| Bereich | Test | Art |
|---|---|---|
| Kontakt/DSGVO/Registrierung/Newsletter | `kein Test` | keine Routen-Tests gefunden |
| Auth-Routen | `auth/callback|me|e2e-login.test.ts` | Routen-Tests |
| Admin angebote/save | `admin/angebote/save.test.ts` | Routen-Test |
| Owner-/Portal-Routen | `kein Test` | nur Guard-/Aktions-Tests |
| Mail/Notify | `email-booking`, `appointment-notify.test.ts` | vitest |
| Kalender | `caldav.test.ts` | vitest |
| Stripe/Billing | `stripe.test.ts`, `stripe-billing.test.ts` | vitest |
| Talk/Nextcloud | `talk.test.ts` | vitest |
| Cron retention | `cron/error-log-retention.test.ts` | Routen-Test |
| Cron Rest | `kein Test` | bounded |
