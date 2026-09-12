# Architektur — Living Docs

0 Services · 0 Abhängigkeitskanten · 291 API-Endpoints

## Service-Map

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b", "edgeLabelBackground": "#1a1a1a"}}}%%
flowchart LR
  classDef default fill:#1a1a1a,stroke:#2a2a2a,color:#e5e7eb
  classDef db fill:#1a1a1a,stroke:#f59e0b,color:#f59e0b
  classDef ingress fill:#1a1a1a,stroke:#10b981,color:#10b981
  classDef auth fill:#1a1a1a,stroke:#8b5cf6,color:#8b5cf6
```

## K8s-Topology

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b"}}}%%
flowchart TB
```

## API-Surface

| Path | Methods | Auth |
|------|---------|------|
| `/api/admin/agent-push/settings` | GET, POST | 🔐 admin |
| `/api/admin/angebote/save` | POST | 🔐 admin |
| `/api/admin/art-library` | GET | 🔐 admin |
| `/api/admin/assets` | GET | 🔐 admin |
| `/api/admin/assets/upload` | POST | 🔐 admin |
| `/api/admin/billing/{id}` | GET | 🔐 admin |
| `/api/admin/billing/{id}/discard` | POST | 🔐 admin |
| `/api/admin/billing/{id}/finalize-from-prepayment` | POST | 🔐 admin |
| `/api/admin/billing/{id}/item` | POST, PATCH, DELETE | 🔐 admin |
| `/api/admin/billing/{id}/payments` | GET, POST | 🔐 admin |
| `/api/admin/billing/{id}/send` | POST | 🔐 admin |
| `/api/admin/billing/{id}/storno` | POST | 🔐 admin |
| `/api/admin/billing/{id}/validate` | POST | 🔐 admin |
| `/api/admin/billing/create-invoice` | POST | 🔐 admin |
| `/api/admin/billing/create-monthly-invoices` | POST | 🔐 admin |
| `/api/admin/billing/customers/{id}/leitweg` | PATCH | 🔐 admin |
| `/api/admin/billing/datev-email` | POST | 🔐 admin |
| `/api/admin/billing/datev-export` | GET | 🔐 admin |
| `/api/admin/billing/draft-count` | GET | 🔐 admin |
| `/api/admin/billing/drafts` | GET | 🔐 admin |
| `/api/admin/billing/dunning/{id}/send` | POST | 🔐 admin |
| `/api/admin/billing/dunning/run` | POST, GET | 🔐 admin |
| `/api/admin/billing/integrity-check` | GET | 🔐 admin |
| `/api/admin/billing/sepa-export` | GET | 🔐 admin |
| `/api/admin/bookings/{uid}/delete` | DELETE | 🔐 admin |
| `/api/admin/bookings/{uid}/remind` | POST | 🔐 admin |
| `/api/admin/bookings/{uid}/status` | PATCH | 🔐 admin |
| `/api/admin/bookings/create` | POST | 🔐 admin |
| `/api/admin/bookkeeping/summary` | GET | 🔐 admin |
| `/api/admin/brand-starter` | GET | 🔐 admin |
| `/api/admin/brett/broadcast` | GET, POST | 🔐 admin |
| `/api/admin/clientnotes/create` | POST | 🔐 admin |
| `/api/admin/clientnotes/delete` | POST | 🔐 admin |
| `/api/admin/clients-list` | GET | 🔐 admin |
| `/api/admin/clients/contact-history/create` | POST | 🔐 admin |
| `/api/admin/clients/create` | POST | 🔐 admin |
| `/api/admin/clients/decline-enrollment` | POST | 🔐 admin |
| `/api/admin/clients/delete` | POST | 🔐 admin |
| `/api/admin/clients/enroll` | POST | 🔐 admin |
| `/api/admin/clients/flag-user` | POST | 🔐 admin |
| `/api/admin/clients/newsletter-toggle` | POST | 🔐 admin |
| `/api/admin/clients/reset-password` | POST | 🔐 admin |
| `/api/admin/clients/roles-assign` | POST | 🔐 admin |
| `/api/admin/clients/roles-remove` | POST | 🔐 admin |
| `/api/admin/clients/set-admin-number` | POST | 🔐 admin |
| `/api/admin/clients/set-customer-number` | POST | 🔐 admin |
| `/api/admin/clients/set-is-admin` | POST | 🔐 admin |
| `/api/admin/clients/update` | POST | 🔐 admin |
| `/api/admin/clients/update-crm` | POST | 🔐 admin |
| `/api/admin/coaching/books` | GET | 🔐 admin |
| `/api/admin/coaching/books/{id}` | GET, DELETE | 🔐 admin |
| `/api/admin/coaching/books/{id}/acceptance-rate` | GET | 🔐 admin |
| `/api/admin/coaching/books/{id}/chunks` | GET | 🔐 admin |
| `/api/admin/coaching/books/upload` | POST | 🔐 admin |
| `/api/admin/coaching/clusters` | GET, POST | 🔐 admin |
| `/api/admin/coaching/drafts` | GET | 🔐 admin |
| `/api/admin/coaching/drafts/{id}` | GET | 🔐 admin |
| `/api/admin/coaching/drafts/{id}/accept` | POST | 🔐 admin |
| `/api/admin/coaching/drafts/{id}/reject` | POST | 🔐 admin |
| `/api/admin/coaching/ki-config` | GET, POST | 🔐 admin |
| `/api/admin/coaching/ki-config/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/ki-config/active` | PATCH | 🔐 admin |
| `/api/admin/coaching/ki-config/models` | GET | 🔐 admin |
| `/api/admin/coaching/projects` | GET | 🔐 admin |
| `/api/admin/coaching/projects/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/coaching/questionnaire/insights` | POST | 🔐 admin |
| `/api/admin/coaching/save` | POST | 🔐 admin |
| `/api/admin/coaching/sessions` | GET, POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}` | GET, PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/archive` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/audit` | GET | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/complete` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/status` | PATCH | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/steps/{n}` | PATCH | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/steps/{n}/generate` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/summary` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/unarchive` | POST | 🔐 admin |
| `/api/admin/coaching/snippets` | GET, POST | 🔐 admin |
| `/api/admin/coaching/snippets/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/snippets/{id}/draft-template` | POST | 🔐 admin |
| `/api/admin/coaching/step-templates` | GET, POST | 🔐 admin |
| `/api/admin/coaching/step-templates/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/templates` | GET | 🔐 admin |
| `/api/admin/coaching/templates/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/coaching/templates/{id}/publish` | POST | 🔐 admin |
| `/api/admin/coaching/templates/{id}/versions` | GET | 🔐 admin |
| `/api/admin/components` | GET, POST | 🔐 admin |
| `/api/admin/components/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/content/restore` | POST | 🔐 admin |
| `/api/admin/content/save` | POST | 🔐 admin |
| `/api/admin/content/versions` | GET | 🔐 admin |
| `/api/admin/customers` | GET | 🔐 admin |
| `/api/admin/customers-list` | GET | 🔐 admin |
| `/api/admin/documents/assign` | POST | 🔐 admin |
| `/api/admin/documents/assignments` | GET | 🔐 admin |
| `/api/admin/documents/assignments/{id}` | DELETE, PATCH | 🔐 admin |
| `/api/admin/documents/assignments/{id}/pdf` | GET | 🔐 admin |
| `/api/admin/documents/notify/{id}` | POST | 🔐 admin |
| `/api/admin/documents/templates` | GET, POST | 🔐 admin |
| `/api/admin/documents/templates/{id}` | GET, PUT, DELETE | 🔐 admin |
| `/api/admin/documents/templates/{id}/pdf` | GET | 🔐 admin |
| `/api/admin/einstellungen/backup` | POST | 🔐 admin |
| `/api/admin/einstellungen/benachrichtigungen` | POST | 🔐 admin |
| `/api/admin/einstellungen/branding` | POST | 🔐 admin |
| `/api/admin/einstellungen/email` | POST | 🔐 admin |
| `/api/admin/einstellungen/rechnungen` | POST | 🔐 admin |
| `/api/admin/einstellungen/upload-logo` | POST | 🔐 admin |
| `/api/admin/faq/save` | POST | 🔐 admin |
| `/api/admin/folder-templates/create` | POST | 🔐 admin |
| `/api/admin/folder-templates/delete` | POST | 🔐 admin |
| `/api/admin/folder-templates/update` | POST | 🔐 admin |
| `/api/admin/footer/save` | POST | 🔐 admin |
| `/api/admin/fuehrung/save` | POST | 🔐 admin |
| `/api/admin/generate-3d` | POST | 🔐 admin |
| `/api/admin/generate-3d/status` | GET | 🔐 admin |
| `/api/admin/homepage/save` | OPTIONS, POST | 🔐 admin |
| `/api/admin/inbox` | GET | 🔐 admin |
| `/api/admin/inbox/{id}/action` | POST | 🔐 admin |
| `/api/admin/inbox/count` | GET | 🔐 admin |
| `/api/admin/inhalte/custom` | GET, POST | 🔐 admin |
| `/api/admin/inhalte/custom/{slug}` | PUT, DELETE | 🔐 admin |
| `/api/admin/inhalte/rechnungsvorlagen/preview` | GET | 🔐 admin |
| `/api/admin/inhalte/rechnungsvorlagen/save` | POST | 🔐 admin |
| `/api/admin/knowledge/collections` | GET, POST | 🔐 admin |
| `/api/admin/knowledge/collections/{id}` | GET, DELETE | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/context7` | POST, GET | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/context7-config` | PATCH | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/crawl` | POST, GET | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/crawl-config` | PATCH | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/documents` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/reindex` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/merge` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/suggest` | GET | 🔐 admin |
| `/api/admin/knowledge/import/json` | POST | 🔐 admin |
| `/api/admin/kontakt/save` | POST | 🔐 admin |
| `/api/admin/kore-flags/save` | POST | 🔐 admin |
| `/api/admin/legal/{key}/save` | POST | 🔐 admin |
| `/api/admin/legal/retokenize` | POST | 🔐 admin |
| `/api/admin/meetings` | GET | 🔐 admin |
| `/api/admin/meetings/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/meetings/create` | POST | 🔐 admin |
| `/api/admin/members/{userId}` | GET | 🔐 admin |
| `/api/admin/members/list` | GET | 🔐 admin |
| `/api/admin/messages` | GET, POST | 🔐 admin |
| `/api/admin/messages/{threadId}` | GET, POST | 🔐 admin |
| `/api/admin/navigation/save` | POST | 🔐 admin |
| `/api/admin/newsletter/blocks` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/blocks/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/newsletter/campaigns` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/campaigns/{id}` | PUT | 🔐 admin |
| `/api/admin/newsletter/campaigns/{id}/send` | POST | 🔐 admin |
| `/api/admin/newsletter/preview` | POST | 🔐 admin |
| `/api/admin/newsletter/subscribers` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/subscribers/{id}` | DELETE | 🔐 admin |
| `/api/admin/onboarding/reset` | POST | 🔐 admin |
| `/api/admin/onboarding/update` | POST | 🔐 admin |
| `/api/admin/poll` | POST | 🔐 admin |
| `/api/admin/poll/{id}` | GET | 🔐 admin |
| `/api/admin/poll/{id}/share` | POST | 🔐 admin |
| `/api/admin/poll/active` | GET | 🔐 admin |
| `/api/admin/poll/templates` | GET | 🔐 admin |
| `/api/admin/projekte/attachments/delete` | POST | 🔐 admin |
| `/api/admin/projekte/attachments/download` | GET | 🔐 admin |
| `/api/admin/projekte/attachments/upload` | POST | 🔐 admin |
| `/api/admin/projekte/create` | POST | 🔐 admin |
| `/api/admin/projekte/delete` | POST | 🔐 admin |
| `/api/admin/projekte/export` | GET | 🔐 admin |
| `/api/admin/projekte/update` | POST | 🔐 admin |
| `/api/admin/projekttasks/create` | POST | 🔐 admin |
| `/api/admin/projekttasks/delete` | POST | 🔐 admin |
| `/api/admin/projekttasks/update` | POST | 🔐 admin |
| `/api/admin/questionnaires/assign` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments` | GET | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}` | GET, PUT | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/archive` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/create-task` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/reassign` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/reopen` | POST | 🔐 admin |
| `/api/admin/questionnaires/templates` | GET, POST | 🔐 admin |
| `/api/admin/questionnaires/templates/{id}` | GET, PUT, DELETE | 🔐 admin |
| `/api/admin/rechtliches/save` | POST | 🔐 admin |
| `/api/admin/referenzen/save` | POST | 🔐 admin |
| `/api/admin/seo` | GET | 🔐 admin |
| `/api/admin/seo/pages` | GET | 🔐 admin |
| `/api/admin/seo/save` | POST | 🔐 admin |
| `/api/admin/seo/upload-og-image` | POST | 🔐 admin |
| `/api/admin/service-page/save` | POST | 🔐 admin |
| `/api/admin/sessions` | GET, POST, DELETE | 🔐 admin |
| `/api/admin/sessions/history` | GET | 🔐 admin |
| `/api/admin/sessions/history/{id}` | GET | 🔐 admin |
| `/api/admin/sessions/purge` | POST | 🔐 admin |
| `/api/admin/sessions/templates` | GET, POST | 🔐 admin |
| `/api/admin/sessions/templates/{id}` | DELETE | 🔐 admin |
| `/api/admin/shortcuts/create` | POST | 🔐 admin |
| `/api/admin/shortcuts/delete` | DELETE | 🔐 admin |
| `/api/admin/shortcuts/fetch-title` | GET | 🔐 admin |
| `/api/admin/shortcuts/update` | PATCH | 🔐 admin |
| `/api/admin/slots/add` | POST | 🔐 admin |
| `/api/admin/slots/remove` | DELETE | 🔐 admin |
| `/api/admin/stammdaten/save` | POST | 🔐 admin |
| `/api/admin/startseite/save` | POST | 🔐 admin |
| `/api/admin/startseite/upload-portrait` | POST | 🔐 admin |
| `/api/admin/subprojekte/create` | POST | 🔐 admin |
| `/api/admin/subprojekte/delete` | POST | 🔐 admin |
| `/api/admin/subprojekte/update` | POST | 🔐 admin |
| `/api/admin/tax-monitor/status` | GET | 🔐 admin |
| `/api/admin/tax-monitor/ustvaexport` | GET | 🔐 admin |
| `/api/admin/time-windows/add` | POST | 🔐 admin |
| `/api/admin/time-windows/remove` | DELETE | 🔐 admin |
| `/api/admin/transcription` | GET, POST | 🔐 admin |
| `/api/admin/uebermich/save` | POST | 🔐 admin |
| `/api/admin/urlaub/save` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/create` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/delete` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/export` | GET | 🔐 admin |
| `/api/assets/{...path}` | GET | ❓ unclassified |
| `/api/assistant/chat` | POST | 🔐 admin |
| `/api/assistant/dismiss` | POST | ❓ session |
| `/api/assistant/execute` | POST | 🔐 admin |
| `/api/assistant/nudges` | GET | 🔐 admin |
| `/api/assistant/transcribe` | POST | ❓ session |
| `/api/auth/callback` | GET | 🔐 admin |
| `/api/auth/delete-account` | POST | ❓ session |
| `/api/auth/e2e-login` | GET | 🔐 admin |
| `/api/auth/login` | GET | ❓ unclassified |
| `/api/auth/logout` | GET | ❓ unclassified |
| `/api/auth/magic` | GET | ❓ unclassified |
| `/api/auth/me` | OPTIONS, GET | 🔐 admin |
| `/api/bge/changes` | GET | 🔐 admin |
| `/api/bge/retrieve` | GET | 🔐 admin |
| `/api/billing/create-invoice` | POST | ❓ unclassified |
| `/api/billing/invoice/{id}/pdf` | GET | 🔐 admin |
| `/api/billing/invoice/{id}/xrechnung.xml` | GET | 🔐 admin |
| `/api/billing/invoice/{id}/zugferd` | GET | 🔐 admin |
| `/api/booking` | POST | ❓ unclassified |
| `/api/bookings/{uid}/project` | PATCH | 🔐 admin |
| `/api/brett/bot` | POST | ❓ unclassified |
| `/api/calendar/slots` | GET | ❓ unclassified |
| `/api/contact` | POST | ❓ unclassified |
| `/api/cron/error-log-retention` | POST | ❓ cron |
| `/api/cron/notify-unread` | POST | 🔐 admin |
| `/api/cron/scheduled-publish` | GET | ❓ cron |
| `/api/demo/coaching-sim` | POST | ❓ unclassified |
| `/api/dsgvo-request` | POST | ❓ unclassified |
| `/api/health` | GET | ❓ unclassified |
| `/api/homepage` | OPTIONS, GET | ❓ unclassified |
| `/api/internal/tickets/notify-close` | POST | ❓ internal |
| `/api/leistungen` | GET | ❓ unclassified |
| `/api/meeting/finalize` | POST | ❓ unclassified |
| `/api/meeting/release` | POST | 🔐 admin |
| `/api/meeting/save-transcript` | POST | ❓ unclassified |
| `/api/meeting/transcribe` | POST | ❓ unclassified |
| `/api/meetings/{id}/project` | PATCH | 🔐 admin |
| `/api/newsletter/confirm` | GET | ❓ unclassified |
| `/api/newsletter/subscribe` | POST | ❓ unclassified |
| `/api/newsletter/unsubscribe` | GET | ❓ unclassified |
| `/api/poll/{id}` | GET | ❓ unclassified |
| `/api/poll/{id}/answer` | POST | ❓ unclassified |
| `/api/poll/{id}/results` | GET | ❓ unclassified |
| `/api/portal/documents/{assignmentId}/pdf` | GET | ❓ session |
| `/api/portal/learning/summary` | GET | ❓ session |
| `/api/portal/learning/track` | POST | ❓ session |
| `/api/portal/messages` | GET, POST | ❓ session |
| `/api/portal/messages/{threadId}` | GET, POST | ❓ session |
| `/api/portal/nachrichten` | GET | ❓ session |
| `/api/portal/onboarding/mark-step` | POST | ❓ session |
| `/api/portal/onboarding/reset` | POST | ❓ session |
| `/api/portal/onboarding/update` | POST | ❓ session |
| `/api/portal/profile/export` | GET | ❓ session |
| `/api/portal/profile/update` | POST | ❓ session |
| `/api/portal/projekte` | GET | ❓ session |
| `/api/portal/projekttasks/{id}/done` | POST | ❓ session |
| `/api/portal/questionnaires` | GET | ❓ session |
| `/api/portal/questionnaires/{id}` | GET | ❓ session |
| `/api/portal/questionnaires/{id}/answer` | PUT | ❓ session |
| `/api/portal/questionnaires/{id}/dismiss` | POST | ❓ session |
| `/api/portal/questionnaires/{id}/submit` | POST | ❓ session |
| `/api/portal/rooms` | GET | ❓ session |
| `/api/portal/rooms/{id}/messages` | GET, POST | ❓ session |
| `/api/portal/rooms/{id}/share` | POST | ❓ session |
| `/api/portal/rooms/ensure-direct` | POST | ❓ session |
| `/api/portal/sign/{assignmentId}` | POST | ❓ session |
| `/api/register` | POST | ❓ unclassified |
| `/api/signing/confirm` | POST | ❓ session |
| `/api/status` | GET | ❓ unclassified |
| `/api/stream/end` | POST | 🔐 admin |
| `/api/stream/recording` | POST | 🔐 admin |
| `/api/stripe/checkout` | POST | ❓ unclassified |
| `/api/stripe/invoice-payment-intent` | POST | ❓ unclassified |
| `/api/stripe/webhook` | POST | ❓ unclassified |
| `/api/timeline` | GET | ❓ unclassified |
