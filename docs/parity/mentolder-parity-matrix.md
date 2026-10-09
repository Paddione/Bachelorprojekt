# Mentolder Parity-Matrix

Inventur-Stand: Branch `chore/mentolder-parity-inventory-T901033`,
Basis `origin/main` (10e35fb79). Ticket: T901033.

Entscheidungs-Artefakt: Migrationen, Asset-Konsumenten, Klassifikation
(retain/extract/replace/defer), Mom-MVP-Vergleich, Staging-Baseline.
Klassifikationen sind Vorschläge zur Entscheidung, keine Beschlüsse.

## Migrationen

Verzeichnis `components/website/src/db/migrations/` (29 `.sql`, Voll-Lektüre
der Header; partielle K3-Abdeckung damit geschlossen). Runner:
`runMigrations` in `components/website/src/db/migrate.ts`
(Fresh-DB-Bootstrap mit `schema_migrations`-Tracking, Z. 28–40),
Wrapper `scripts/migrate-db.mjs`.

| Datei | Zweck |
|---|---|
| `20260520_create_assets_schema.sql` | Schema `assets` |
| `20260520_seed_asset_pack_02.sql` | Seed Asset-Pack 02 (Brett-Sets, Identity, Arena-SVGs) |
| `20260521_create_platform_assets.sql` | Plattform-Assets-Tabelle (`software_assets`) |
| `20260522_fix_platform_assets_status.sql` | Fix `live_status`-Einträge |
| `20260525_admin_actions.sql` | Admin-Actions-Audit-Trail |
| `20260530_seed_content_defaults.sql` | Seed Prod-Content (`leistungen_config`, `service_config`) |
| `20260607_add_model_3d_type.sql` | `model_3d` im Asset-Type-Enum |
| `20260607_create_generation_jobs.sql` | `assets.generation_jobs` (3D-Pipeline, ohne Brand) |
| `20260612_add_service_links.sql` | Service-Links (bounded: Dateiname) |
| `20260617_create_audit_log.sql` | Security-Audit-Log (T000904) |
| `20260617_create_folder_templates.sql` | `public.folder_templates` |
| `20260619_fix_pricing_units.sql` | Preise aus `service_config` entfernt |
| `20260620_create_sessions_templates.sql` | `sessions.templates` (Brainstorm) |
| `20260621_create_ai_call_log.sql` | AI-Call-Log (T001065) |
| `20260703_create_error_log.sql` | Error-Log (T001594) |
| `20260708_create_schema_migrations.sql` | Migrations-Tracking-Tabelle (T001652) |
| `20260717_add_missing_fk_indexes.sql` | FK-Indizes (G-DB01, T001905) |
| `20260717_drop_redundant_customers_email_index.sql` | Doppel-Index entfernt (T001908) |
| `20260719_add_missing_fk_indexes_batch2.sql` | FK-Indizes Batch 2 (T001946) |
| `20260802_create_cockpit_audit.sql` | `tickets.cockpit_audit` (T002463) |
| `20260804_cockpit_notify_triggers.sql` | `pg_notify` auf `cockpit_events` |
| `20260813_coaching_questionnaire_insights_cache.sql` | Semantik-Cache (T002652, ohne Brand) |
| `20260813_coaching_session_summary.sql` | LLM-Session-Zusammenfassung (T002653) |
| `20260821_add_missing_fk_indexes_and_brand_checks.sql` | FK-Indizes + `chk_customer_projects_brand` / `chk_cockpit_audit_brand` (`mentolder`/`korczewski`, T013031) |
| `20260917_application_pipeline_schema.sql` | Schema `applications.*` (T900228) |
| `20260917_application_pipeline_match_score.sql` | `match_score` + Evidenz-IDs (T900234) |
| `20261007_business_memberships.sql` | `business_memberships` + `inbox_items.brand` (T901022) |
| `20261008_invoices.sql` | `massage_invoices` + Zähler (T901027) |
| `20261008_massage_brand_checks.sql` | Brand-CHECKs + `'massage'` (T901440) |

Daneben `error-log-schema.test.ts` (Schema-Test, keine Migration).
Abweichung zur Vor-Evidenz: Die Reuse-Bewertung zitiert
`20260719-brand-check-constraints.sql` — diese Datei existiert nicht
(bounded `ls`); gemeint ist offenbar `20260821_…_brand_checks.sql`.

Parity-Hinweis: Ein erheblicher Schema-Anteil entsteht nicht aus Migrationen,
sondern aus Runtime-DDL in Lib-Init-Funktionen (`CREATE TABLE IF NOT EXISTS`
in appointments-db, billing-db, auth/`web_sessions` u. a.). Die
Plattform-Richtung verbietet Runtime-DDL in Request-Pfaden des neuen Kerns
(`docs/website/massage-reuse-assessment/README.md`, §1) — beim Port müssen
diese Tabellen in versionierte Migrationen überführt werden.

## Asset-Konsumenten

- Mail-Templates (`lib/email.ts`, `lib/appointment-notify.ts`,
  `lib/notifications.ts`): Verbraucher sind die Formular-Routen
  (`booking.ts` Z. 209–237, `contact.ts` Z. 54, `dsgvo-request.ts` Z. 45/52,
  `register.ts` Z. 43), Admin-Aktionen (Registrierungs-Mails, action.ts),
  Newsletter-Routen und Cron-Reminder (`cron/appointment-reminders.ts`).
- PDF-/HTML-Layouts (`lib/invoice-pdf.ts`, `lib/invoice-html.ts`):
  Verbraucher `lib/invoice-dunning.ts`, `lib/invoice-storno.ts`,
  `pages/api/admin/inhalte/rechnungsvorlagen/preview.ts` (Vorschau via
  `sampleInvoiceForPreview`), `pages/api/admin/billing/[id]/send.ts`,
  `pages/api/billing/invoice/[id]/pdf.ts` (bounded grep über Aufrufer).
- Statische Assets (`components/website/public/`): u. a. `arena/`, `brand/`,
  `coaching-studio/`, `cockpit/`, `fonts/`, `gerald.*` (avif/webp/jpg),
  `learning-assets/`, `systembrett/`, `robots.txt`, `favicon.svg` —
  werden statisch ausgeliefert; `brand/` trägt Marken-Themes (Darstellung,
  keine Autorisierung).
- Generierte Dateien (generator-owned, freshness-pflichtig):
  `lib/agent-guide.generated.json`, `lib/platform-descriptions.generated.json`,
  `lib/learning-assets.generated.json`, `lib/sdlc/goals-data.generated.json`
  plus `public/learning-assets/THIRD-PARTY-ASSETS.md` (Pflichtliste im
  Verifikationsblock). Sie werden von Generatoren geschrieben, nicht von
  Hand — beim Port Generatoren mitnehmen oder ersetzen.

## Klassifikation

Legende: retain = unverändert behalten; extract = Verträge/Muster in den
neuen Kern übernehmen; replace = neu bauen (Tenant-Scope); defer = später /
außerhalb MVP. Ausrichtung an Reuse-Bewertung §3
(`docs/website/massage-reuse-assessment/README.md`).

| Eintrag (Quelle) | Evidenz | Klasse | Begründung |
|---|---|---|---|
| Buchungs-POST (Validierung→Inbox→Ack→Admin) | Core-Dokument, booking.ts Z. 29–250 | extract | Muster passt zum MVP; Mandanten-Identität neu |
| Fenster/Whitelist/Claiming | Core-Dokument, appointments-db Z. 311–468 | extract | Claim-Pfad verifiziert genutzt; Race-Safety nur Whitelist |
| Inbox/Nachrichten | Auth-Dokument, messaging-db Z. 31–110 | replace | Brand NULL, kein Enforcement |
| Massage-Rechnungen (Pfad A) | Core-Dokument, invoices.ts | retain | Passt zu Praxis/MVP (T901027) |
| Zahlungsbuchung (Pfad B) | Core-Dokument, invoice-payments.ts Z. 30–164 | extract | Transaktions-/Lock-Muster; Brand-Param nachrüsten |
| Storno/Mahnung/PDF/HTML | Core-Dokument, Module mit Tests | extract | Getestete Module übernehmen |
| OIDC-Session-Schicht | Auth-Dokument, auth.ts | retain | Funktioniert; Brand-Env pro Deployment |
| Admin-/Owner-Guards | Auth-Dokument, owner-guard.ts, isAdmin | extract | Mechanik ok; Tenant-Bindung fehlt |
| Mitgliedschafts-Modell | business-memberships.ts, Migration 20261007 | extract | Modell da; Enforcement nachrüsten |
| Session-Brand aus Env | auth.ts Z. 75/233/298 | replace | Verifizierte Mitgliedschaft nötig |
| Admin-Inbox ohne Brand-Filter | admin/inbox.ts Z. 20 | replace | Scope im neuen Kern erzwingen |
| Jobs/Assets/Cache ohne Brand | Migrationen 20260607/20260520/20260813 | defer | 3D/Coaching: außerhalb MVP |
| Kontakt/DSGVO/Register/Newsletter | Rest-Dokument | extract | Einfache Muster, Scope neu verdrahten |
| Slot-Ansicht/Anfrage-Self-Service | Rest-Dokument | extract | Gehört zum Kern-Flow |
| Owner Annehmen/Ablehnen/Telefon/Umbuchung | Rest-Dokument | extract | Inhaber-Bestätigung = MVP |
| Owner Rechnungen/Kunden | Rest-Dokument | extract | Basis-Kunden/Rechnungen = MVP |
| Portal-Flows | Rest-Dokument | defer | Nicht im Pilot-Scope |
| Admin-Flows (Projekte/Angebote/SEO/…) | Rest-Dokument | defer | Nicht im Pilot-Scope |
| Mail/CalDAV/Nextcloud/Talk | Rest-Dokument | retain | Provider-Adapter bleiben |
| Stripe-HTTP (410) | stripe/*.ts je Z. 2 | defer | Entfernt; kein Online-Payment im MVP |
| Natives Billing (stripe-billing.ts) | Rest-Dokument | extract | Manuelle Methoden passen |
| Cron-Jobs (Reminder/Publish/Retention) | Rest-Dokument, CRON_SECRET | extract | Secret-Muster übernehmen |
| Assistant/BGE/Coaching/SDLC | Rest-Dokument Scope-Abgrenzung | defer | Per Ticket out of scope |

## Mom-MVP-Vergleich

Pilot-Scope (Quelle: Reuse-Bewertung §1): Anfragen + Inhaber-Bestätigung +
Kalender + Basis-Kunden/Rechnungen, Vortags-Cutoff Europe/Berlin,
Praxis-vor-Ort mit Ausnahme-Hausbesuchen, keine Online-Zahlungen. Ziel-Fluss
(§4): Anfrage → Inbox → Inhaber-Bestätigung → Kalender → Besuch → Rechnung,
durchgehend mit serverseitig verifizierter Mandanten-Identität.

| MVP-Funktion | Mentolder-Bestand (Evidenz) | Delta |
|---|---|---|
| Anfragen | booking/contact/register-POSTs mit Inbox + Mails (Core-/Rest-Dokument) | Tenant-Scope fehlt (Brand NULL) |
| Inhaber-Bestätigung | annehmen/ablehnen/resend, Telefon-Buchung (Rest-Dokument) | Gruppen-Guard statt Mitgliedschaft |
| Kalender | CalDAV (getAllBookings u. a.), Fenster/Whitelist mit Brand-FK (Core-/Rest-Dokument) | klein: Brand-Scope vorhanden |
| Basis-Kunden | `upsertCustomer`, Owner-Kunden-Routen mit Brand-Filter (Auth-/Rest-Dokument) | T901019-Mindestfelder neu (Reuse-§3) |
| Basis-Rechnungen | `massage_invoices` (Pfad A), Nummern/Status/Storno (Core-Dokument) | klein: passt zum MVP |
| Vortags-Cutoff Europe/Berlin | Berlin-strikt-danach-Regel (booking.ts Z. 110–124) | vorhanden |
| Praxis-vor-Ort + Hausbesuch-Ausnahme | Typ-Labels erstgespraech/callback/meeting/termin (booking.ts Z. 22–27) | Hausbesuch kein eigener Typ — prüfen |
| Keine Online-Zahlungen | Stripe-HTTP 410, manuelle Methoden (Rest-/Core-Dokument) | erfüllt |

Stack (Quelle: `components/website/package.json`, verifiziert):
Astro ^7.3.7, Svelte ^5.57.2, `pg` ^8.23.1, Nodemailer ^10.0.6,
PDFKit ^0.19.1, React ^19.2.7 + `@astrojs/react` ^6.0.1,
`@astrojs/svelte` ^9.0.1. Befund: Die Ticket-Aussage „React integration
already available" ist bestätigt.

## Staging-Baseline-Verfahren

Ziel: produktionsähnliche Vergleichs-Basis ohne Echtdaten. Prod wird nie
berührt — kein Lesen, kein Schreiben, kein Snapshot.

1. Staging-Stack nutzen, nicht Prod: Namespace `workspace-dev` auf `fleet`
   (`docs/dev-stack/README.md`); Website unter `web.dev.mentolder.de`.
   `task dev:db:refresh` ist für diese Baseline VERBOTEN — es spielt den
   aktuellen Prod-Snapshot in `shared-db-dev` ein.
2. Frische Datenbank: `shared-db-dev` leeren bzw. neu anlegen
   (`task dev:psql` für die Shell). Keine Prod-Dumps, keine Prod-Secrets.
3. Schema aufbauen: Migrationen via `runMigrations`
   (`components/website/src/db/migrate.ts`; Fresh-DB-Bootstrap mit
   `schema_migrations`-Tracking). Runtime-Tabellen entstehen beim
   Website-Start über die Lib-Init-Funktionen (`initBillingTables` u. a.).
4. Nur synthetische Daten: Testzeilen über den E2E-Marker
   (`X-E2E-Test: 1` + `X-Cron-Secret`, `lib/e2e-marker.ts` Z. 12–33)
   anlegen — sie werden als `is_test_data` markiert. System-Test-Templates
   aus `lib/system-test-seed-data.ts` verwenden. Namen/Adressen frei
   erfunden, keine echten Kundendaten.
5. Baseline prüfen: Kernpfade (Buchung→Rechnung) gegen Staging ausführen,
   BATS-Guards (`bats tests/spec/mentolder-parity-inventory.bats`) und
   gezielte vitest-Suiten laufen lassen.
6. Aufräumen: Testzeilen per `tickets.fn_purge_test_data()`
   (`lib/tickets/purge-fn.ts`, Version v8) entfernen; Purge-Sync-Test
   `tests/py/spec/native_ported/spec/e2e-test-infrastructure/test_purge_fn_website_sync.py`
   hält Funktions-Rumpf und SQL-Skript gleich.
