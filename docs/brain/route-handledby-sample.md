# Route HANDLED_BY Sample (G1 gate evidence)

Source: `docs/brain/handled-by-map.json` (349 rows, frozen corpus `8fed539b996fdcb89181fa8e8084fec8d299c8ab`).
Sample: deterministic every-7th row (indices 0,7,...,343) = 50 rows.
Verdict rule: PASS = `handled_by` non-empty, every target resolves on disk, hops <= 2.

| # | Route (path:VERB) | Slice | Layer | handled_by (primary) | Hops | Verdict |
|---|---|---|---|---|---|---|
| 1 | `admin/agent-push/settings.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 2 | `admin/billing/[id]/finalize-from-prepayment.ts:POST` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 3 | `admin/billing/[id]/send.ts:POST` | admin | lib | `lib/auth.ts +6` | 1 | PASS |
| 4 | `admin/billing/datev-export.ts:GET` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 5 | `admin/billing/sepa-export.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 6 | `admin/brett/broadcast.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 7 | `admin/clients/decline-enrollment.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 8 | `admin/clients/roles-remove.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 9 | `admin/coaching/books/[id]/chunks.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 10 | `admin/coaching/drafts/[id].ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 11 | `admin/coaching/ki-config/index.ts:GET` | admin | lib | `lib/auth.ts +3` | 1 | PASS |
| 12 | `admin/coaching/save.ts:POST` | admin | lib | `lib/auth.ts +3` | 1 | PASS |
| 13 | `admin/coaching/sessions/[id]/status.ts:PATCH` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 14 | `admin/coaching/snippets/[id].ts:DELETE` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 15 | `admin/coaching/step-templates/index.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 16 | `admin/components/[id].ts:DELETE` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 17 | `admin/customers-list.ts:GET` | admin | lib | `lib/auth.ts +3` | 2 | PASS |
| 18 | `admin/documents/notify/[id].ts:POST` | admin | lib | `lib/auth.ts +5` | 2 | PASS |
| 19 | `admin/einstellungen/backup.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 20 | `admin/folder-templates/create.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 21 | `admin/homepage/save.ts:OPTIONS` | admin | lib | `lib/auth.ts +4` | 1 | PASS |
| 22 | `admin/inhalte/custom/index.ts:GET` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 23 | `admin/knowledge/collections/[id]/crawl-config.ts:PATCH` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 24 | `admin/knowledge/collections/index.ts:GET` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 25 | `admin/legal/[key]/save.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 26 | `admin/members/list.ts:GET` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 27 | `admin/newsletter/blocks/[id].ts:PUT` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 28 | `admin/newsletter/preview.ts:POST` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 29 | `admin/poll/[id]/share.ts:POST` | admin | lib | `lib/auth.ts +2` | 1 | PASS |
| 30 | `admin/projekte/create.ts:POST` | admin | lib | `lib/auth.ts +5` | 2 | PASS |
| 31 | `admin/questionnaires/assign.ts:POST` | admin | lib | `lib/auth.ts +8` | 2 | PASS |
| 32 | `admin/questionnaires/assignments/index.ts:GET` | admin | lib | `lib/auth.ts +6` | 2 | PASS |
| 33 | `admin/referenzen/save.ts:POST` | admin | lib | `lib/content-publish-handler.ts` | 1 | PASS |
| 34 | `admin/sessions/history/index.ts:GET` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 35 | `admin/sessions/templates/index.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 36 | `admin/stammdaten/save.ts:POST` | admin | lib | `lib/content-publish-handler.ts` | 1 | PASS |
| 37 | `admin/tax-monitor/ustvaexport.ts:GET` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 38 | `admin/zeiterfassung/create.ts:POST` | admin | lib | `lib/auth.ts +1` | 1 | PASS |
| 39 | `assistant/nudges.ts:GET` | assistant | lib | `lib/auth.ts +5` | 1 | PASS |
| 40 | `auth/magic.ts:GET` | auth | lib | `lib/auth/magic-link.ts +1` | 1 | PASS |
| 41 | `billing/invoice/[id]/xrechnung.xml.ts:GET` | billing | lib | `lib/website-db.ts +1` | 1 | PASS |
| 42 | `cron/error-log-retention.ts:POST` | cron | lib | `lib/logging/error-log-store.ts` | 1 | PASS |
| 43 | `homepage.ts:OPTIONS` | (root) | lib | `lib/cors.ts +2` | 1 | PASS |
| 44 | `internal/tickets/notify-close.ts:POST` | internal | lib | `lib/website-db.ts +1` | 1 | PASS |
| 45 | `newsletter/confirm.ts:GET` | newsletter | lib | `lib/newsletter-db.ts` | 1 | PASS |
| 46 | `portal/learning/summary.ts:GET` | portal | lib | `lib/auth.ts +1` | 1 | PASS |
| 47 | `portal/onboarding/mark-step.ts:POST` | portal | lib | `lib/auth.ts +1` | 1 | PASS |
| 48 | `portal/questionnaires/[id]/answer.ts:PUT` | portal | lib | `lib/auth.ts +5` | 2 | PASS |
| 49 | `portal/rooms/[id]/messages.ts:POST` | portal | lib | `lib/auth.ts +1` | 1 | PASS |
| 50 | `stream/end.ts:POST` | stream | lib | `lib/auth.ts` | 1 | PASS |

Result: 50/50 PASS = precision 100.0% (gate >= 95%). Unhandled in sample: 0 (gate < 15% = max 7). Over-2-hop: 0 (gate: none).
Full-map check: 349/349 rows have handled_by; 0 empty; max hops 2.
