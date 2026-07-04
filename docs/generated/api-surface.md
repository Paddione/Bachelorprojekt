# API Surface Map

> Generated at 2026-07-04T00:59:52.397Z

| Path | Methods | Auth | File |
|------|---------|------|------|
| `/api/admin/agent-push/settings` | GET, POST | 🔐 admin | `website/src/pages/api/admin/agent-push/settings.ts` |
| `/api/admin/ai-quality` | GET | 🔐 admin | `website/src/pages/api/admin/ai-quality.ts` |
| `/api/admin/angebote/save` | POST | 🔐 admin | `website/src/pages/api/admin/angebote/save.ts` |
| `/api/admin/art-library` | GET | 🔐 admin | `website/src/pages/api/admin/art-library.ts` |
| `/api/admin/assets` | GET | 🔐 admin | `website/src/pages/api/admin/assets.ts` |
| `/api/admin/assets/upload` | POST | 🔐 admin | `website/src/pages/api/admin/assets/upload.ts` |
| `/api/admin/backup-status` | GET | 🔐 admin | `website/src/pages/api/admin/backup-status.ts` |
| `/api/admin/billing/{id}` | GET | 🔐 admin | `website/src/pages/api/admin/billing/[id]/index.ts` |
| `/api/admin/billing/{id}/discard` | POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/discard.ts` |
| `/api/admin/billing/{id}/finalize-from-prepayment` | POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/finalize-from-prepayment.ts` |
| `/api/admin/billing/{id}/item` | POST, PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/billing/[id]/item.ts` |
| `/api/admin/billing/{id}/payments` | GET, POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/payments.ts` |
| `/api/admin/billing/{id}/send` | POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/send.ts` |
| `/api/admin/billing/{id}/storno` | POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/storno.ts` |
| `/api/admin/billing/{id}/validate` | POST | 🔐 admin | `website/src/pages/api/admin/billing/[id]/validate.ts` |
| `/api/admin/billing/create-invoice` | POST | 🔐 admin | `website/src/pages/api/admin/billing/create-invoice.ts` |
| `/api/admin/billing/create-monthly-invoices` | POST | 🔐 admin | `website/src/pages/api/admin/billing/create-monthly-invoices.ts` |
| `/api/admin/billing/customers/{id}/leitweg` | PATCH | 🔐 admin | `website/src/pages/api/admin/billing/customers/[id]/leitweg.ts` |
| `/api/admin/billing/datev-email` | POST | 🔐 admin | `website/src/pages/api/admin/billing/datev-email.ts` |
| `/api/admin/billing/datev-export` | GET | 🔐 admin | `website/src/pages/api/admin/billing/datev-export.ts` |
| `/api/admin/billing/draft-count` | GET | 🔐 admin | `website/src/pages/api/admin/billing/draft-count.ts` |
| `/api/admin/billing/drafts` | GET | 🔐 admin | `website/src/pages/api/admin/billing/drafts.ts` |
| `/api/admin/billing/dunning/{id}/send` | POST | 🔐 admin | `website/src/pages/api/admin/billing/dunning/[id]/send.ts` |
| `/api/admin/billing/dunning/run` | POST, GET | 🔐 admin | `website/src/pages/api/admin/billing/dunning/run.ts` |
| `/api/admin/billing/integrity-check` | GET | 🔐 admin | `website/src/pages/api/admin/billing/integrity-check.ts` |
| `/api/admin/billing/sepa-export` | GET | 🔐 admin | `website/src/pages/api/admin/billing/sepa-export.ts` |
| `/api/admin/bookings/{uid}/delete` | DELETE | 🔐 admin | `website/src/pages/api/admin/bookings/[uid]/delete.ts` |
| `/api/admin/bookings/{uid}/remind` | POST | 🔐 admin | `website/src/pages/api/admin/bookings/[uid]/remind.ts` |
| `/api/admin/bookings/{uid}/status` | PATCH | 🔐 admin | `website/src/pages/api/admin/bookings/[uid]/status.ts` |
| `/api/admin/bookings/create` | POST | 🔐 admin | `website/src/pages/api/admin/bookings/create.ts` |
| `/api/admin/bookkeeping/summary` | GET | 🔐 admin | `website/src/pages/api/admin/bookkeeping/summary.ts` |
| `/api/admin/brand-starter` | GET | 🔐 admin | `website/src/pages/api/admin/brand-starter.ts` |
| `/api/admin/brett/broadcast` | GET, POST | 🔐 admin | `website/src/pages/api/admin/brett/broadcast.ts` |
| `/api/admin/bugs/{id}` | GET | 🔐 admin | `website/src/pages/api/admin/bugs/[id].ts` |
| `/api/admin/bugs/{id}/comments` | POST | 🔐 admin | `website/src/pages/api/admin/bugs/[id]/comments.ts` |
| `/api/admin/bugs/archive` | POST | 🔐 admin | `website/src/pages/api/admin/bugs/archive.ts` |
| `/api/admin/bugs/create` | POST | 🔐 admin | `website/src/pages/api/admin/bugs/create.ts` |
| `/api/admin/bugs/list` | GET | 🔐 admin | `website/src/pages/api/admin/bugs/list.ts` |
| `/api/admin/bugs/reopen` | POST | 🔐 admin | `website/src/pages/api/admin/bugs/reopen.ts` |
| `/api/admin/bugs/resolve` | POST | 🔐 admin | `website/src/pages/api/admin/bugs/resolve.ts` |
| `/api/admin/clientnotes/create` | POST | 🔐 admin | `website/src/pages/api/admin/clientnotes/create.ts` |
| `/api/admin/clientnotes/delete` | POST | 🔐 admin | `website/src/pages/api/admin/clientnotes/delete.ts` |
| `/api/admin/clients-list` | GET | 🔐 admin | `website/src/pages/api/admin/clients-list.ts` |
| `/api/admin/clients/contact-history/create` | POST | 🔐 admin | `website/src/pages/api/admin/clients/contact-history/create.ts` |
| `/api/admin/clients/create` | POST | 🔐 admin | `website/src/pages/api/admin/clients/create.ts` |
| `/api/admin/clients/decline-enrollment` | POST | 🔐 admin | `website/src/pages/api/admin/clients/decline-enrollment.ts` |
| `/api/admin/clients/delete` | POST | 🔐 admin | `website/src/pages/api/admin/clients/delete.ts` |
| `/api/admin/clients/enroll` | POST | 🔐 admin | `website/src/pages/api/admin/clients/enroll.ts` |
| `/api/admin/clients/flag-user` | POST | 🔐 admin | `website/src/pages/api/admin/clients/flag-user.ts` |
| `/api/admin/clients/newsletter-toggle` | POST | 🔐 admin | `website/src/pages/api/admin/clients/newsletter-toggle.ts` |
| `/api/admin/clients/reset-password` | POST | 🔐 admin | `website/src/pages/api/admin/clients/reset-password.ts` |
| `/api/admin/clients/roles-assign` | POST | 🔐 admin | `website/src/pages/api/admin/clients/roles-assign.ts` |
| `/api/admin/clients/roles-remove` | POST | 🔐 admin | `website/src/pages/api/admin/clients/roles-remove.ts` |
| `/api/admin/clients/set-admin-number` | POST | 🔐 admin | `website/src/pages/api/admin/clients/set-admin-number.ts` |
| `/api/admin/clients/set-customer-number` | POST | 🔐 admin | `website/src/pages/api/admin/clients/set-customer-number.ts` |
| `/api/admin/clients/set-is-admin` | POST | 🔐 admin | `website/src/pages/api/admin/clients/set-is-admin.ts` |
| `/api/admin/clients/update` | POST | 🔐 admin | `website/src/pages/api/admin/clients/update.ts` |
| `/api/admin/clients/update-crm` | POST | 🔐 admin | `website/src/pages/api/admin/clients/update-crm.ts` |
| `/api/admin/cluster/graph` | GET | 🔐 admin | `website/src/pages/api/admin/cluster/graph.ts` |
| `/api/admin/cluster/logs` | GET | 🔐 admin | `website/src/pages/api/admin/cluster/logs.ts` |
| `/api/admin/cluster/pods-list` | GET | 🔐 admin | `website/src/pages/api/admin/cluster/pods-list.ts` |
| `/api/admin/cluster/warnings` | GET | 🔐 admin | `website/src/pages/api/admin/cluster/warnings.ts` |
| `/api/admin/coaching/books` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/books/index.ts` |
| `/api/admin/coaching/books/{id}` | GET, DELETE | 🔐 admin | `website/src/pages/api/admin/coaching/books/[id]/index.ts` |
| `/api/admin/coaching/books/{id}/acceptance-rate` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/books/[id]/acceptance-rate.ts` |
| `/api/admin/coaching/books/{id}/chunks` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/books/[id]/chunks.ts` |
| `/api/admin/coaching/books/upload` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/books/upload.ts` |
| `/api/admin/coaching/clusters` | GET, POST | 🔐 admin | `website/src/pages/api/admin/coaching/clusters/index.ts` |
| `/api/admin/coaching/drafts` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/drafts/index.ts` |
| `/api/admin/coaching/drafts/{id}` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/drafts/[id].ts` |
| `/api/admin/coaching/drafts/{id}/accept` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/drafts/[id]/accept.ts` |
| `/api/admin/coaching/drafts/{id}/reject` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/drafts/[id]/reject.ts` |
| `/api/admin/coaching/ki-config` | GET, POST | 🔐 admin | `website/src/pages/api/admin/coaching/ki-config/index.ts` |
| `/api/admin/coaching/ki-config/{id}` | PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/coaching/ki-config/[id].ts` |
| `/api/admin/coaching/ki-config/active` | PATCH | 🔐 admin | `website/src/pages/api/admin/coaching/ki-config/active.ts` |
| `/api/admin/coaching/projects` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/projects/index.ts` |
| `/api/admin/coaching/projects/{id}` | GET, PATCH | 🔐 admin | `website/src/pages/api/admin/coaching/projects/[id].ts` |
| `/api/admin/coaching/save` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/save.ts` |
| `/api/admin/coaching/sessions` | GET, POST | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/index.ts` |
| `/api/admin/coaching/sessions/{id}` | GET, PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/index.ts` |
| `/api/admin/coaching/sessions/{id}/archive` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/archive.ts` |
| `/api/admin/coaching/sessions/{id}/audit` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/audit.ts` |
| `/api/admin/coaching/sessions/{id}/complete` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` |
| `/api/admin/coaching/sessions/{id}/status` | PATCH | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/status.ts` |
| `/api/admin/coaching/sessions/{id}/steps/{n}` | PATCH | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts` |
| `/api/admin/coaching/sessions/{id}/steps/{n}/generate` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` |
| `/api/admin/coaching/sessions/{id}/unarchive` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/sessions/[id]/unarchive.ts` |
| `/api/admin/coaching/snippets` | GET, POST | 🔐 admin | `website/src/pages/api/admin/coaching/snippets/index.ts` |
| `/api/admin/coaching/snippets/{id}` | PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/coaching/snippets/[id].ts` |
| `/api/admin/coaching/snippets/{id}/draft-template` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/snippets/[id]/draft-template.ts` |
| `/api/admin/coaching/step-templates` | GET, POST | 🔐 admin | `website/src/pages/api/admin/coaching/step-templates/index.ts` |
| `/api/admin/coaching/step-templates/{id}` | PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/coaching/step-templates/[id].ts` |
| `/api/admin/coaching/templates` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/templates/index.ts` |
| `/api/admin/coaching/templates/{id}` | GET, PATCH | 🔐 admin | `website/src/pages/api/admin/coaching/templates/[id].ts` |
| `/api/admin/coaching/templates/{id}/publish` | POST | 🔐 admin | `website/src/pages/api/admin/coaching/templates/[id]/publish.ts` |
| `/api/admin/coaching/templates/{id}/versions` | GET | 🔐 admin | `website/src/pages/api/admin/coaching/templates/[id]/versions.ts` |
| `/api/admin/cockpit/batch` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/batch.ts` |
| `/api/admin/cockpit/container-count` | GET | 🔐 admin | `website/src/pages/api/admin/cockpit/container-count.ts` |
| `/api/admin/cockpit/feature` | GET | 🔐 admin | `website/src/pages/api/admin/cockpit/feature.ts` |
| `/api/admin/cockpit/feature-action` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/feature-action.ts` |
| `/api/admin/cockpit/feature-actions` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/feature-actions.ts` |
| `/api/admin/cockpit/portfolio` | GET | 🔐 admin | `website/src/pages/api/admin/cockpit/portfolio.ts` |
| `/api/admin/cockpit/reorder` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/reorder.ts` |
| `/api/admin/cockpit/reparent` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/reparent.ts` |
| `/api/admin/cockpit/suggest` | POST | 🔐 admin | `website/src/pages/api/admin/cockpit/suggest.ts` |
| `/api/admin/components` | GET, POST | 🔐 admin | `website/src/pages/api/admin/components/index.ts` |
| `/api/admin/components/{id}` | PATCH, DELETE | 🔐 admin | `website/src/pages/api/admin/components/[id].ts` |
| `/api/admin/content/restore` | POST | 🔐 admin | `website/src/pages/api/admin/content/restore.ts` |
| `/api/admin/content/save` | POST | 🔐 admin | `website/src/pages/api/admin/content/save.ts` |
| `/api/admin/content/versions` | GET | 🔐 admin | `website/src/pages/api/admin/content/versions.ts` |
| `/api/admin/customers` | GET | 🔐 admin | `website/src/pages/api/admin/customers.ts` |
| `/api/admin/customers-list` | GET | 🔐 admin | `website/src/pages/api/admin/customers-list.ts` |
| `/api/admin/delivery-metrics` | GET | 🔐 admin | `website/src/pages/api/admin/delivery-metrics.ts` |
| `/api/admin/deployments` | GET | 🔐 admin | `website/src/pages/api/admin/deployments.ts` |
| `/api/admin/deployments/{name}/restart` | POST | 🔐 admin | `website/src/pages/api/admin/deployments/[name]/restart.ts` |
| `/api/admin/deployments/{name}/scale` | POST | 🔐 admin | `website/src/pages/api/admin/deployments/[name]/scale.ts` |
| `/api/admin/documents/assign` | POST | 🔐 admin | `website/src/pages/api/admin/documents/assign.ts` |
| `/api/admin/documents/assignments` | GET | 🔐 admin | `website/src/pages/api/admin/documents/assignments.ts` |
| `/api/admin/documents/assignments/{id}` | DELETE, PATCH | 🔐 admin | `website/src/pages/api/admin/documents/assignments/[id].ts` |
| `/api/admin/documents/assignments/{id}/pdf` | GET | 🔐 admin | `website/src/pages/api/admin/documents/assignments/[id]/pdf.ts` |
| `/api/admin/documents/notify/{id}` | POST | 🔐 admin | `website/src/pages/api/admin/documents/notify/[id].ts` |
| `/api/admin/documents/templates` | GET, POST | 🔐 admin | `website/src/pages/api/admin/documents/templates/index.ts` |
| `/api/admin/documents/templates/{id}` | GET, PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/documents/templates/[id].ts` |
| `/api/admin/documents/templates/{id}/pdf` | GET | 🔐 admin | `website/src/pages/api/admin/documents/templates/[id]/pdf.ts` |
| `/api/admin/einstellungen/backup` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/backup.ts` |
| `/api/admin/einstellungen/benachrichtigungen` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/benachrichtigungen.ts` |
| `/api/admin/einstellungen/branding` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/branding.ts` |
| `/api/admin/einstellungen/email` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/email.ts` |
| `/api/admin/einstellungen/rechnungen` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/rechnungen.ts` |
| `/api/admin/einstellungen/upload-logo` | POST | 🔐 admin | `website/src/pages/api/admin/einstellungen/upload-logo.ts` |
| `/api/admin/evidence/{id}/replay` | GET | 🔐 admin | `website/src/pages/api/admin/evidence/[id]/replay.ts` |
| `/api/admin/evidence/upload` | POST | 🔐 admin | `website/src/pages/api/admin/evidence/upload.ts` |
| `/api/admin/factory-control` | GET, PATCH | 🔐 admin | `website/src/pages/api/admin/factory-control.ts` |
| `/api/admin/faq/save` | POST | 🔐 admin | `website/src/pages/api/admin/faq/save.ts` |
| `/api/admin/folder-templates/create` | POST | 🔐 admin | `website/src/pages/api/admin/folder-templates/create.ts` |
| `/api/admin/folder-templates/delete` | POST | 🔐 admin | `website/src/pages/api/admin/folder-templates/delete.ts` |
| `/api/admin/folder-templates/update` | POST | 🔐 admin | `website/src/pages/api/admin/folder-templates/update.ts` |
| `/api/admin/footer/save` | POST | 🔐 admin | `website/src/pages/api/admin/footer/save.ts` |
| `/api/admin/fuehrung/save` | POST | 🔐 admin | `website/src/pages/api/admin/fuehrung/save.ts` |
| `/api/admin/generate-3d` | POST | 🔐 admin | `website/src/pages/api/admin/generate-3d.ts` |
| `/api/admin/generate-3d/status` | GET | 🔐 admin | `website/src/pages/api/admin/generate-3d/status.ts` |
| `/api/admin/homepage/save` | OPTIONS, POST | 🔐 admin | `website/src/pages/api/admin/homepage/save.ts` |
| `/api/admin/inbox` | GET | 🔐 admin | `website/src/pages/api/admin/inbox.ts` |
| `/api/admin/inbox/{id}/action` | POST | 🔐 admin | `website/src/pages/api/admin/inbox/[id]/action.ts` |
| `/api/admin/inbox/count` | GET | 🔐 admin | `website/src/pages/api/admin/inbox/count.ts` |
| `/api/admin/inhalte/custom` | GET, POST | 🔐 admin | `website/src/pages/api/admin/inhalte/custom/index.ts` |
| `/api/admin/inhalte/custom/{slug}` | PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/inhalte/custom/[slug].ts` |
| `/api/admin/inhalte/rechnungsvorlagen/preview` | GET | 🔐 admin | `website/src/pages/api/admin/inhalte/rechnungsvorlagen/preview.ts` |
| `/api/admin/inhalte/rechnungsvorlagen/save` | POST | 🔐 admin | `website/src/pages/api/admin/inhalte/rechnungsvorlagen/save.ts` |
| `/api/admin/ki/catalog` | GET | 🔐 admin | `website/src/pages/api/admin/ki/catalog.ts` |
| `/api/admin/ki/embeddings` | GET, PUT | 🔐 admin | `website/src/pages/api/admin/ki/embeddings.ts` |
| `/api/admin/ki/env-status` | GET | 🔐 admin | `website/src/pages/api/admin/ki/env-status.ts` |
| `/api/admin/ki/providers` | GET, POST | 🔐 admin | `website/src/pages/api/admin/ki/providers.ts` |
| `/api/admin/ki/providers/{id}` | PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/ki/providers/[id].ts` |
| `/api/admin/knowledge/collections` | GET, POST | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/index.ts` |
| `/api/admin/knowledge/collections/{id}` | GET, DELETE | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/index.ts` |
| `/api/admin/knowledge/collections/{id}/context7` | POST, GET | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/context7.ts` |
| `/api/admin/knowledge/collections/{id}/context7-config` | PATCH | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/context7-config.ts` |
| `/api/admin/knowledge/collections/{id}/crawl` | POST, GET | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/crawl.ts` |
| `/api/admin/knowledge/collections/{id}/crawl-config` | PATCH | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts` |
| `/api/admin/knowledge/collections/{id}/documents` | POST | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts` |
| `/api/admin/knowledge/collections/{id}/reindex` | POST | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/[id]/reindex.ts` |
| `/api/admin/knowledge/collections/merge` | POST | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/merge.ts` |
| `/api/admin/knowledge/collections/suggest` | GET | 🔐 admin | `website/src/pages/api/admin/knowledge/collections/suggest.ts` |
| `/api/admin/knowledge/import/json` | POST | 🔐 admin | `website/src/pages/api/admin/knowledge/import/json.ts` |
| `/api/admin/kontakt/save` | POST | 🔐 admin | `website/src/pages/api/admin/kontakt/save.ts` |
| `/api/admin/kore-flags/save` | POST | 🔐 admin | `website/src/pages/api/admin/kore-flags/save.ts` |
| `/api/admin/legal/{key}/save` | POST | 🔐 admin | `website/src/pages/api/admin/legal/[key]/save.ts` |
| `/api/admin/legal/retokenize` | POST | 🔐 admin | `website/src/pages/api/admin/legal/retokenize.ts` |
| `/api/admin/meetings` | GET | 🔐 admin | `website/src/pages/api/admin/meetings/index.ts` |
| `/api/admin/meetings/{id}` | GET, PATCH | 🔐 admin | `website/src/pages/api/admin/meetings/[id].ts` |
| `/api/admin/meetings/create` | POST | 🔐 admin | `website/src/pages/api/admin/meetings/create.ts` |
| `/api/admin/members/{userId}` | GET | 🔐 admin | `website/src/pages/api/admin/members/[userId].ts` |
| `/api/admin/members/list` | GET | 🔐 admin | `website/src/pages/api/admin/members/list.ts` |
| `/api/admin/messages` | GET, POST | 🔐 admin | `website/src/pages/api/admin/messages.ts` |
| `/api/admin/messages/{threadId}` | GET, POST | 🔐 admin | `website/src/pages/api/admin/messages/[threadId].ts` |
| `/api/admin/monitoring` | GET | 🔐 admin | `website/src/pages/api/admin/monitoring.ts` |
| `/api/admin/navigation/save` | POST | 🔐 admin | `website/src/pages/api/admin/navigation/save.ts` |
| `/api/admin/newsletter/blocks` | GET, POST | 🔐 admin | `website/src/pages/api/admin/newsletter/blocks/index.ts` |
| `/api/admin/newsletter/blocks/{id}` | PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/newsletter/blocks/[id].ts` |
| `/api/admin/newsletter/campaigns` | GET, POST | 🔐 admin | `website/src/pages/api/admin/newsletter/campaigns/index.ts` |
| `/api/admin/newsletter/campaigns/{id}` | PUT | 🔐 admin | `website/src/pages/api/admin/newsletter/campaigns/[id].ts` |
| `/api/admin/newsletter/campaigns/{id}/send` | POST | 🔐 admin | `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts` |
| `/api/admin/newsletter/preview` | POST | 🔐 admin | `website/src/pages/api/admin/newsletter/preview.ts` |
| `/api/admin/newsletter/subscribers` | GET, POST | 🔐 admin | `website/src/pages/api/admin/newsletter/subscribers/index.ts` |
| `/api/admin/newsletter/subscribers/{id}` | DELETE | 🔐 admin | `website/src/pages/api/admin/newsletter/subscribers/[id].ts` |
| `/api/admin/onboarding/reset` | POST | 🔐 admin | `website/src/pages/api/admin/onboarding/reset.ts` |
| `/api/admin/onboarding/update` | POST | 🔐 admin | `website/src/pages/api/admin/onboarding/update.ts` |
| `/api/admin/openspec/save-proposal` | POST | 🔐 admin | `website/src/pages/api/admin/openspec/save-proposal.ts` |
| `/api/admin/ops/ai/reindex` | POST | 🔐 admin | `website/src/pages/api/admin/ops/ai/reindex.ts` |
| `/api/admin/ops/audit/log` | GET | 🔐 admin | `website/src/pages/api/admin/ops/audit/log.ts` |
| `/api/admin/ops/backup/list` | GET | 🔐 admin | `website/src/pages/api/admin/ops/backup/list.ts` |
| `/api/admin/ops/backup/trigger` | POST | 🔐 admin | `website/src/pages/api/admin/ops/backup/trigger.ts` |
| `/api/admin/ops/certs` | GET | 🔐 admin | `website/src/pages/api/admin/ops/certs.ts` |
| `/api/admin/ops/deployments/{ns}/{name}/restart` | POST | 🔐 admin | `website/src/pages/api/admin/ops/deployments/[ns]/[name]/restart.ts` |
| `/api/admin/ops/deployments/{ns}/{name}/scale` | POST | 🔐 admin | `website/src/pages/api/admin/ops/deployments/[ns]/[name]/scale.ts` |
| `/api/admin/ops/deployments/list` | GET | 🔐 admin | `website/src/pages/api/admin/ops/deployments/list.ts` |
| `/api/admin/ops/dns/pin` | POST | 🔐 admin | `website/src/pages/api/admin/ops/dns/pin.ts` |
| `/api/admin/ops/error-log` | POST, GET | 🔐 admin | `website/src/pages/api/admin/ops/error-log.ts` |
| `/api/admin/ops/health` | GET | 🔐 admin | `website/src/pages/api/admin/ops/health.ts` |
| `/api/admin/ops/log-stream/stream` | GET | 🔐 admin | `website/src/pages/api/admin/ops/log-stream/stream.ts` |
| `/api/admin/ops/redeploy/brett` | POST | 🔐 admin | `website/src/pages/api/admin/ops/redeploy/brett.ts` |
| `/api/admin/ops/redeploy/docs` | POST | 🔐 admin | `website/src/pages/api/admin/ops/redeploy/docs.ts` |
| `/api/admin/ops/redeploy/website` | POST | 🔐 admin | `website/src/pages/api/admin/ops/redeploy/website.ts` |
| `/api/admin/ops/restore` | POST | 🔐 admin | `website/src/pages/api/admin/ops/restore.ts` |
| `/api/admin/ops/server-logs/stream` | GET | 🔐 admin | `website/src/pages/api/admin/ops/server-logs/stream.ts` |
| `/api/admin/ops/users/create` | POST | 🔐 admin | `website/src/pages/api/admin/ops/users/create.ts` |
| `/api/admin/ops/users/groups` | GET | 🔐 admin | `website/src/pages/api/admin/ops/users/groups.ts` |
| `/api/admin/ops/users/list` | GET | 🔐 admin | `website/src/pages/api/admin/ops/users/list.ts` |
| `/api/admin/planungsbuero` | GET | 🔐 admin | `website/src/pages/api/admin/planungsbuero/index.ts` |
| `/api/admin/planungsbuero/{extId}` | PATCH | 🔐 admin | `website/src/pages/api/admin/planungsbuero/[extId].ts` |
| `/api/admin/platform/assets/{slug}/tickets` | GET | 🔐 admin | `website/src/pages/api/admin/platform/assets/[slug]/tickets.ts` |
| `/api/admin/platform/hardware` | GET | 🔐 admin | `website/src/pages/api/admin/platform/hardware.ts` |
| `/api/admin/platform/software` | GET, POST | 🔐 admin | `website/src/pages/api/admin/platform/software.ts` |
| `/api/admin/platform/software/{id}` | PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/platform/software/[id].ts` |
| `/api/admin/poll` | POST | 🔐 admin | `website/src/pages/api/admin/poll/index.ts` |
| `/api/admin/poll/{id}` | GET | 🔐 admin | `website/src/pages/api/admin/poll/[id].ts` |
| `/api/admin/poll/{id}/share` | POST | 🔐 admin | `website/src/pages/api/admin/poll/[id]/share.ts` |
| `/api/admin/poll/active` | GET | 🔐 admin | `website/src/pages/api/admin/poll/active.ts` |
| `/api/admin/poll/templates` | GET | 🔐 admin | `website/src/pages/api/admin/poll/templates.ts` |
| `/api/admin/projekte/attachments/delete` | POST | 🔐 admin | `website/src/pages/api/admin/projekte/attachments/delete.ts` |
| `/api/admin/projekte/attachments/download` | GET | 🔐 admin | `website/src/pages/api/admin/projekte/attachments/download.ts` |
| `/api/admin/projekte/attachments/upload` | POST | 🔐 admin | `website/src/pages/api/admin/projekte/attachments/upload.ts` |
| `/api/admin/projekte/create` | POST | 🔐 admin | `website/src/pages/api/admin/projekte/create.ts` |
| `/api/admin/projekte/delete` | POST | 🔐 admin | `website/src/pages/api/admin/projekte/delete.ts` |
| `/api/admin/projekte/export` | GET | 🔐 admin | `website/src/pages/api/admin/projekte/export.ts` |
| `/api/admin/projekte/update` | POST | 🔐 admin | `website/src/pages/api/admin/projekte/update.ts` |
| `/api/admin/projekttasks/create` | POST | 🔐 admin | `website/src/pages/api/admin/projekttasks/create.ts` |
| `/api/admin/projekttasks/delete` | POST | 🔐 admin | `website/src/pages/api/admin/projekttasks/delete.ts` |
| `/api/admin/projekttasks/update` | POST | 🔐 admin | `website/src/pages/api/admin/projekttasks/update.ts` |
| `/api/admin/prompt-library` | GET, POST | 🔐 admin | `website/src/pages/api/admin/prompt-library/index.ts` |
| `/api/admin/prompt-library/{id}` | PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/prompt-library/[id].ts` |
| `/api/admin/prompt-library/{id}/use` | POST | 🔐 admin | `website/src/pages/api/admin/prompt-library/[id]/use.ts` |
| `/api/admin/qa-criteria` | GET | 🔐 admin | `website/src/pages/api/admin/qa-criteria.ts` |
| `/api/admin/qa-queue` | GET | 🔐 admin | `website/src/pages/api/admin/qa-queue.ts` |
| `/api/admin/qa-reviews` | POST | 🔐 admin | `website/src/pages/api/admin/qa-reviews.ts` |
| `/api/admin/questionnaires/assign` | POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/assign.ts` |
| `/api/admin/questionnaires/assignments` | GET | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/index.ts` |
| `/api/admin/questionnaires/assignments/{id}` | GET, PUT | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/[id].ts` |
| `/api/admin/questionnaires/assignments/{id}/archive` | POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.ts` |
| `/api/admin/questionnaires/assignments/{id}/create-task` | POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/[id]/create-task.ts` |
| `/api/admin/questionnaires/assignments/{id}/reassign` | POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.ts` |
| `/api/admin/questionnaires/assignments/{id}/reopen` | POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/assignments/[id]/reopen.ts` |
| `/api/admin/questionnaires/templates` | GET, POST | 🔐 admin | `website/src/pages/api/admin/questionnaires/templates/index.ts` |
| `/api/admin/questionnaires/templates/{id}` | GET, PUT, DELETE | 🔐 admin | `website/src/pages/api/admin/questionnaires/templates/[id].ts` |
| `/api/admin/rechtliches/save` | POST | 🔐 admin | `website/src/pages/api/admin/rechtliches/save.ts` |
| `/api/admin/referenzen/save` | POST | 🔐 admin | `website/src/pages/api/admin/referenzen/save.ts` |
| `/api/admin/seo` | GET | 🔐 admin | `website/src/pages/api/admin/seo/index.ts` |
| `/api/admin/seo/pages` | GET | 🔐 admin | `website/src/pages/api/admin/seo/pages.ts` |
| `/api/admin/seo/save` | POST | 🔐 admin | `website/src/pages/api/admin/seo/save.ts` |
| `/api/admin/seo/upload-og-image` | POST | 🔐 admin | `website/src/pages/api/admin/seo/upload-og-image.ts` |
| `/api/admin/service-page/save` | POST | 🔐 admin | `website/src/pages/api/admin/service-page/save.ts` |
| `/api/admin/sessions` | GET, POST, DELETE | 🔐 admin | `website/src/pages/api/admin/sessions/index.ts` |
| `/api/admin/sessions/history` | GET | 🔐 admin | `website/src/pages/api/admin/sessions/history/index.ts` |
| `/api/admin/sessions/history/{id}` | GET | 🔐 admin | `website/src/pages/api/admin/sessions/history/[id].ts` |
| `/api/admin/sessions/purge` | POST | 🔐 admin | `website/src/pages/api/admin/sessions/purge.ts` |
| `/api/admin/sessions/templates` | GET, POST | 🔐 admin | `website/src/pages/api/admin/sessions/templates/index.ts` |
| `/api/admin/sessions/templates/{id}` | DELETE | 🔐 admin | `website/src/pages/api/admin/sessions/templates/[id].ts` |
| `/api/admin/shortcuts/create` | POST | 🔐 admin | `website/src/pages/api/admin/shortcuts/create.ts` |
| `/api/admin/shortcuts/delete` | DELETE | 🔐 admin | `website/src/pages/api/admin/shortcuts/delete.ts` |
| `/api/admin/shortcuts/fetch-title` | GET | 🔐 admin | `website/src/pages/api/admin/shortcuts/fetch-title.ts` |
| `/api/admin/shortcuts/update` | PATCH | 🔐 admin | `website/src/pages/api/admin/shortcuts/update.ts` |
| `/api/admin/slots/add` | POST | 🔐 admin | `website/src/pages/api/admin/slots/add.ts` |
| `/api/admin/slots/remove` | DELETE | 🔐 admin | `website/src/pages/api/admin/slots/remove.ts` |
| `/api/admin/stammdaten/save` | POST | 🔐 admin | `website/src/pages/api/admin/stammdaten/save.ts` |
| `/api/admin/startseite/save` | POST | 🔐 admin | `website/src/pages/api/admin/startseite/save.ts` |
| `/api/admin/startseite/upload-portrait` | POST | 🔐 admin | `website/src/pages/api/admin/startseite/upload-portrait.ts` |
| `/api/admin/subprojekte/create` | POST | 🔐 admin | `website/src/pages/api/admin/subprojekte/create.ts` |
| `/api/admin/subprojekte/delete` | POST | 🔐 admin | `website/src/pages/api/admin/subprojekte/delete.ts` |
| `/api/admin/subprojekte/update` | POST | 🔐 admin | `website/src/pages/api/admin/subprojekte/update.ts` |
| `/api/admin/systemtest/board` | GET | 🔐 admin | `website/src/pages/api/admin/systemtest/board.ts` |
| `/api/admin/systemtest/cleanup-fixtures` | POST | 🔐 admin | `website/src/pages/api/admin/systemtest/cleanup-fixtures.ts` |
| `/api/admin/systemtest/drain-outbox` | POST | 🔐 admin | `website/src/pages/api/admin/systemtest/drain-outbox.ts` |
| `/api/admin/systemtest/purge-all-test-data` | POST | 🔐 admin | `website/src/pages/api/admin/systemtest/purge-all-test-data.ts` |
| `/api/admin/systemtest/seed` | POST | 🔐 admin | `website/src/pages/api/admin/systemtest/seed.ts` |
| `/api/admin/tax-monitor/status` | GET | 🔐 admin | `website/src/pages/api/admin/tax-monitor/status.ts` |
| `/api/admin/tax-monitor/ustvaexport` | GET | 🔐 admin | `website/src/pages/api/admin/tax-monitor/ustvaexport.ts` |
| `/api/admin/test-results` | GET | 🔐 admin | `website/src/pages/api/admin/test-results.ts` |
| `/api/admin/test-runs` | GET | 🔐 admin | `website/src/pages/api/admin/test-runs.ts` |
| `/api/admin/testdata/purge` | DELETE | 🔐 admin | `website/src/pages/api/admin/testdata/purge.ts` |
| `/api/admin/testdata/seed` | POST | 🔐 admin | `website/src/pages/api/admin/testdata/seed.ts` |
| `/api/admin/tests/flake` | GET | 🔐 admin | `website/src/pages/api/admin/tests/flake.ts` |
| `/api/admin/tests/ingest-e2e` | POST | 🔐 admin | `website/src/pages/api/admin/tests/ingest-e2e.ts` |
| `/api/admin/tests/playwright-report` | GET, POST | 🔐 admin | `website/src/pages/api/admin/tests/playwright-report.ts` |
| `/api/admin/tests/report` | POST | 🔐 admin | `website/src/pages/api/admin/tests/report.ts` |
| `/api/admin/tests/results/{jobId}` | GET | 🔐 admin | `website/src/pages/api/admin/tests/results/[jobId].ts` |
| `/api/admin/tests/run` | POST | 🔐 admin | `website/src/pages/api/admin/tests/run.ts` |
| `/api/admin/tests/stream/{jobId}` | GET | 🔐 admin | `website/src/pages/api/admin/tests/stream/[jobId].ts` |
| `/api/admin/tests/traceability` | GET | 🔐 admin | `website/src/pages/api/admin/tests/traceability.ts` |
| `/api/admin/tests/trend` | GET | 🔐 admin | `website/src/pages/api/admin/tests/trend.ts` |
| `/api/admin/tickets` | GET, POST | 🔐 admin | `website/src/pages/api/admin/tickets/index.ts` |
| `/api/admin/tickets/{id}` | GET, PATCH | 🔐 admin | `website/src/pages/api/admin/tickets/[id].ts` |
| `/api/admin/tickets/{id}/attachments` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/attachments.ts` |
| `/api/admin/tickets/{id}/attachments/{aid}` | GET | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts` |
| `/api/admin/tickets/{id}/classify` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/classify.ts` |
| `/api/admin/tickets/{id}/comments` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/comments.ts` |
| `/api/admin/tickets/{id}/links` | POST, DELETE | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/links.ts` |
| `/api/admin/tickets/{id}/transition` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/transition.ts` |
| `/api/admin/tickets/{id}/triage` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/[id]/triage.ts` |
| `/api/admin/tickets/bulk-status` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/bulk-status.ts` |
| `/api/admin/tickets/bulk-status/undo` | POST | 🔐 admin | `website/src/pages/api/admin/tickets/bulk-status/undo.ts` |
| `/api/admin/time-windows/add` | POST | 🔐 admin | `website/src/pages/api/admin/time-windows/add.ts` |
| `/api/admin/time-windows/remove` | DELETE | 🔐 admin | `website/src/pages/api/admin/time-windows/remove.ts` |
| `/api/admin/transcription` | GET, POST | 🔐 admin | `website/src/pages/api/admin/transcription/index.ts` |
| `/api/admin/uebermich/save` | POST | 🔐 admin | `website/src/pages/api/admin/uebermich/save.ts` |
| `/api/admin/urlaub/save` | POST | 🔐 admin | `website/src/pages/api/admin/urlaub/save.ts` |
| `/api/admin/zeiterfassung/create` | POST | 🔐 admin | `website/src/pages/api/admin/zeiterfassung/create.ts` |
| `/api/admin/zeiterfassung/delete` | POST | 🔐 admin | `website/src/pages/api/admin/zeiterfassung/delete.ts` |
| `/api/admin/zeiterfassung/export` | GET | 🔐 admin | `website/src/pages/api/admin/zeiterfassung/export.ts` |
| `/api/assets/{...path}` | GET | ❓ unclassified | `website/src/pages/api/assets/[...path].ts` |
| `/api/assistant/chat` | POST | 🔐 admin | `website/src/pages/api/assistant/chat.ts` |
| `/api/assistant/dismiss` | POST | 🔑 session | `website/src/pages/api/assistant/dismiss.ts` |
| `/api/assistant/execute` | POST | 🔐 admin | `website/src/pages/api/assistant/execute.ts` |
| `/api/assistant/nudges` | GET | 🔐 admin | `website/src/pages/api/assistant/nudges.ts` |
| `/api/assistant/transcribe` | POST | 🔑 session | `website/src/pages/api/assistant/transcribe.ts` |
| `/api/auth/callback` | GET | 🔐 admin | `website/src/pages/api/auth/callback.ts` |
| `/api/auth/delete-account` | POST | 🔑 session | `website/src/pages/api/auth/delete-account.ts` |
| `/api/auth/login` | GET | ❓ unclassified | `website/src/pages/api/auth/login.ts` |
| `/api/auth/logout` | GET | ❓ unclassified | `website/src/pages/api/auth/logout.ts` |
| `/api/auth/magic` | GET | ❓ unclassified | `website/src/pages/api/auth/magic.ts` |
| `/api/auth/me` | OPTIONS, GET | 🔐 admin | `website/src/pages/api/auth/me.ts` |
| `/api/billing/create-invoice` | POST | ❓ unclassified | `website/src/pages/api/billing/create-invoice.ts` |
| `/api/billing/invoice/{id}/pdf` | GET | 🔐 admin | `website/src/pages/api/billing/invoice/[id]/pdf.ts` |
| `/api/billing/invoice/{id}/xrechnung.xml` | GET | 🔐 admin | `website/src/pages/api/billing/invoice/[id]/xrechnung.xml.ts` |
| `/api/billing/invoice/{id}/zugferd` | GET | 🔐 admin | `website/src/pages/api/billing/invoice/[id]/zugferd.ts` |
| `/api/booking` | POST | ❓ unclassified | `website/src/pages/api/booking.ts` |
| `/api/bookings/{uid}/project` | PATCH | 🔐 admin | `website/src/pages/api/bookings/[uid]/project.ts` |
| `/api/brett/bot` | POST | ❓ unclassified | `website/src/pages/api/brett/bot.ts` |
| `/api/bug-report` | POST | ❓ unclassified | `website/src/pages/api/bug-report.ts` |
| `/api/calendar/slots` | GET | ❓ unclassified | `website/src/pages/api/calendar/slots.ts` |
| `/api/cluster/status` | GET | ❓ unclassified | `website/src/pages/api/cluster/status.ts` |
| `/api/codesearch` | GET | 🔐 admin | `website/src/pages/api/codesearch.ts` |
| `/api/contact` | POST | ❓ unclassified | `website/src/pages/api/contact.ts` |
| `/api/cron/error-log-retention` | POST | ⏰ cron | `website/src/pages/api/cron/error-log-retention.ts` |
| `/api/cron/notify-unread` | POST | 🔐 admin | `website/src/pages/api/cron/notify-unread.ts` |
| `/api/cron/scheduled-publish` | GET | ⏰ cron | `website/src/pages/api/cron/scheduled-publish.ts` |
| `/api/demo/coaching-sim` | POST | ❓ unclassified | `website/src/pages/api/demo/coaching-sim.ts` |
| `/api/dsgvo-request` | POST | ❓ unclassified | `website/src/pages/api/dsgvo-request.ts` |
| `/api/factory-budget` | GET, POST | 🔐 admin | `website/src/pages/api/factory-budget.ts` |
| `/api/factory-floor` | GET | 🔐 admin | `website/src/pages/api/factory-floor.ts` |
| `/api/factory-floor/{extId}` | GET | 🔐 admin | `website/src/pages/api/factory-floor/[extId].ts` |
| `/api/factory-floor/{extId}/ci` | GET | 🔐 admin | `website/src/pages/api/factory-floor/[extId]/ci.ts` |
| `/api/factory-floor/{extId}/deploy` | POST | 🔐 admin | `website/src/pages/api/factory-floor/[extId]/deploy.ts` |
| `/api/factory-floor/{extId}/inject` | POST | 🔐 admin | `website/src/pages/api/factory-floor/[extId]/inject.ts` |
| `/api/factory-floor/{extId}/release` | POST | 🔐 admin | `website/src/pages/api/factory-floor/[extId]/release.ts` |
| `/api/factory-floor/stream` | GET | 🔐 admin | `website/src/pages/api/factory-floor/stream.ts` |
| `/api/factory-metrics` | GET | 🔐 admin | `website/src/pages/api/factory-metrics.ts` |
| `/api/factory-observability` | GET | 🔐 admin | `website/src/pages/api/factory-observability.ts` |
| `/api/health` | GET | ❓ unclassified | `website/src/pages/api/health.ts` |
| `/api/homepage` | OPTIONS, GET | ❓ unclassified | `website/src/pages/api/homepage.ts` |
| `/api/internal/tickets/notify-close` | POST | 🔒 internal | `website/src/pages/api/internal/tickets/notify-close.ts` |
| `/api/leistungen` | GET | ❓ unclassified | `website/src/pages/api/leistungen.ts` |
| `/api/live/state` | GET | 🔐 admin | `website/src/pages/api/live/state.ts` |
| `/api/meeting/finalize` | POST | ❓ unclassified | `website/src/pages/api/meeting/finalize.ts` |
| `/api/meeting/release` | POST | 🔐 admin | `website/src/pages/api/meeting/release.ts` |
| `/api/meeting/save-transcript` | POST | ❓ unclassified | `website/src/pages/api/meeting/save-transcript.ts` |
| `/api/meeting/transcribe` | POST | ❓ unclassified | `website/src/pages/api/meeting/transcribe.ts` |
| `/api/meetings/{id}/project` | PATCH | 🔐 admin | `website/src/pages/api/meetings/[id]/project.ts` |
| `/api/newsletter/confirm` | GET | ❓ unclassified | `website/src/pages/api/newsletter/confirm.ts` |
| `/api/newsletter/subscribe` | POST | ❓ unclassified | `website/src/pages/api/newsletter/subscribe.ts` |
| `/api/newsletter/unsubscribe` | GET | ❓ unclassified | `website/src/pages/api/newsletter/unsubscribe.ts` |
| `/api/openspec/search` | GET | ❓ unclassified | `website/src/pages/api/openspec/search.ts` |
| `/api/planning-office` | GET, POST, DELETE | 🔐 admin | `website/src/pages/api/planning-office/index.ts` |
| `/api/planning-office/{extId}` | PATCH | 🔐 admin | `website/src/pages/api/planning-office/[extId].ts` |
| `/api/planning-office/{extId}/clarify` | POST | 🔐 admin | `website/src/pages/api/planning-office/[extId]/clarify.ts` |
| `/api/planning-office/{extId}/promote` | POST | 🔐 admin | `website/src/pages/api/planning-office/[extId]/promote.ts` |
| `/api/poll/{id}` | GET | ❓ unclassified | `website/src/pages/api/poll/[id].ts` |
| `/api/poll/{id}/answer` | POST | ❓ unclassified | `website/src/pages/api/poll/[id]/answer.ts` |
| `/api/poll/{id}/results` | GET | ❓ unclassified | `website/src/pages/api/poll/[id]/results.ts` |
| `/api/portal/documents/{assignmentId}/pdf` | GET | 🔑 session | `website/src/pages/api/portal/documents/[assignmentId]/pdf.ts` |
| `/api/portal/learning/summary` | GET | 🔑 session | `website/src/pages/api/portal/learning/summary.ts` |
| `/api/portal/learning/track` | POST | 🔑 session | `website/src/pages/api/portal/learning/track.ts` |
| `/api/portal/messages` | GET, POST | 🔑 session | `website/src/pages/api/portal/messages.ts` |
| `/api/portal/messages/{threadId}` | GET, POST | 🔑 session | `website/src/pages/api/portal/messages/[threadId].ts` |
| `/api/portal/nachrichten` | GET | 🔑 session | `website/src/pages/api/portal/nachrichten.ts` |
| `/api/portal/onboarding/mark-step` | POST | 🔑 session | `website/src/pages/api/portal/onboarding/mark-step.ts` |
| `/api/portal/onboarding/reset` | POST | 🔑 session | `website/src/pages/api/portal/onboarding/reset.ts` |
| `/api/portal/onboarding/update` | POST | 🔑 session | `website/src/pages/api/portal/onboarding/update.ts` |
| `/api/portal/profile/export` | GET | 🔑 session | `website/src/pages/api/portal/profile/export.ts` |
| `/api/portal/profile/update` | POST | 🔑 session | `website/src/pages/api/portal/profile/update.ts` |
| `/api/portal/projekte` | GET | 🔑 session | `website/src/pages/api/portal/projekte.ts` |
| `/api/portal/projekttasks/{id}/done` | POST | 🔑 session | `website/src/pages/api/portal/projekttasks/[id]/done.ts` |
| `/api/portal/questionnaires` | GET | 🔑 session | `website/src/pages/api/portal/questionnaires/index.ts` |
| `/api/portal/questionnaires/{id}` | GET | 🔑 session | `website/src/pages/api/portal/questionnaires/[id]/index.ts` |
| `/api/portal/questionnaires/{id}/answer` | PUT | 🔑 session | `website/src/pages/api/portal/questionnaires/[id]/answer.ts` |
| `/api/portal/questionnaires/{id}/dismiss` | POST | 🔑 session | `website/src/pages/api/portal/questionnaires/[id]/dismiss.ts` |
| `/api/portal/questionnaires/{id}/submit` | POST | 🔑 session | `website/src/pages/api/portal/questionnaires/[id]/submit.ts` |
| `/api/portal/rooms` | GET | 🔑 session | `website/src/pages/api/portal/rooms.ts` |
| `/api/portal/rooms/{id}/messages` | GET, POST | 🔑 session | `website/src/pages/api/portal/rooms/[id]/messages.ts` |
| `/api/portal/rooms/{id}/share` | POST | 🔑 session | `website/src/pages/api/portal/rooms/[id]/share.ts` |
| `/api/portal/rooms/ensure-direct` | POST | 🔑 session | `website/src/pages/api/portal/rooms/ensure-direct.ts` |
| `/api/portal/sign/{assignmentId}` | POST | 🔑 session | `website/src/pages/api/portal/sign/[assignmentId].ts` |
| `/api/register` | POST | ❓ unclassified | `website/src/pages/api/register.ts` |
| `/api/signing/confirm` | POST | 🔑 session | `website/src/pages/api/signing/confirm.ts` |
| `/api/status` | GET | ❓ unclassified | `website/src/pages/api/status.ts` |
| `/api/stream/end` | POST | 🔐 admin | `website/src/pages/api/stream/end.ts` |
| `/api/stream/recording` | POST | 🔐 admin | `website/src/pages/api/stream/recording.ts` |
| `/api/stream/status` | GET | ❓ unclassified | `website/src/pages/api/stream/status.ts` |
| `/api/stream/token` | POST | 🔐 admin | `website/src/pages/api/stream/token.ts` |
| `/api/stripe/checkout` | POST | ❓ unclassified | `website/src/pages/api/stripe/checkout.ts` |
| `/api/stripe/invoice-payment-intent` | POST | ❓ unclassified | `website/src/pages/api/stripe/invoice-payment-intent.ts` |
| `/api/stripe/webhook` | POST | ❓ unclassified | `website/src/pages/api/stripe/webhook.ts` |
| `/api/tickets/{id}/readiness` | POST | 🔐 admin | `website/src/pages/api/tickets/[id]/readiness.ts` |
| `/api/tickets/comment` | OPTIONS, POST | ❓ unclassified | `website/src/pages/api/tickets/comment.ts` |
| `/api/tickets/graph` | GET | 🔐 admin | `website/src/pages/api/tickets/graph.ts` |
| `/api/timeline` | GET | ❓ unclassified | `website/src/pages/api/timeline.ts` |
