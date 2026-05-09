# System-Test Drift Report — mentolder — 2026-05-09

> Generated: 2026-05-09T02:17:28Z
> Outcome files: 12/12

## Compliance Matrix

| # | Template | Steps | ✅ erfüllt | ⚠️ teilweise | ❌ nicht erfüllt | Score |
|---|----------|------:|----------:|------------:|----------------:|------:|
| 1 | Authentifizierung & SSO (Keycloak) | 6 | 5 | 1 | 0 | 91.7% |
| 2 | Admin-Verwaltung & CRM | 10 | 9 | 1 | 0 | 95% |
| 3 | Kommunikation — Chat-Widget, Inbox & E-Mail | 5 | 3 | 2 | 0 | 80% |
| 4 | Fragebogen-System (Coaching-Workflow) | 5 | 4 | 1 | 0 | 90% |
| 5 | Dokumente & DocuSeal-Unterschriften | 5 | 4 | 1 | 0 | 90% |
| 6 | Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring | 12 | 9 | 3 | 0 | 87.5% |
| 7 | Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung | 16 | 14 | 2 | 0 | 93.8% |
| 8 | Buchhaltung — EÜR, Belege & Steuerauswertungen | 14 | 13 | 1 | 0 | 96.4% |
| 9 | Monitoring & Bug-Tracking | 5 | 5 | 0 | 0 | 100% |
| 10 | Externe Dienste & öffentliche Website | 10 | 9 | 1 | 0 | 95% |
| 11 | LiveKit & Streaming | 7 | 6 | 1 | 0 | 92.9% |
| 12 | Projektmanagement | 8 | 8 | 0 | 0 | 100% |
| **Σ** | | **103** | **89** | **14** | **0** | **92.7%** |

## Coverage Gaps (req\_ids → features.requirement\_id)

Steps whose req\_ids have no matching row in `bachelorprojekt.features`:

- Template 6, req_id=B-01
- Template 6, req_id=B-02
- Template 6, req_id=B-03
- Template 6, req_id=B-04
- Template 6, req_id=B-05
- Template 6, req_id=B-06
- Template 6, req_id=B-07
- Template 6, req_id=B-08
- Template 6, req_id=B-09
- Template 6, req_id=B-10
- Template 6, req_id=B-11
- Template 7, req_id=A-01
- Template 7, req_id=A-02
- Template 7, req_id=A-03
- Template 7, req_id=A-04
- Template 7, req_id=A-05
- Template 7, req_id=A-06
- Template 7, req_id=A-07
- Template 7, req_id=A-08
- Template 7, req_id=A-09
- Template 7, req_id=A-10
- Template 7, req_id=A-11
- Template 7, req_id=A-12
- Template 7, req_id=A-13
- Template 7, req_id=A-14
- Template 7, req_id=A-15
- Template 8, req_id=C-01
- Template 8, req_id=C-02
- Template 8, req_id=C-03
- Template 8, req_id=C-04
- Template 8, req_id=C-05
- Template 8, req_id=C-06
- Template 8, req_id=C-07
- Template 8, req_id=C-08
- Template 8, req_id=C-09
- Template 8, req_id=C-10
- Template 8, req_id=C-11
- Template 8, req_id=C-12
- Template 8, req_id=C-13

> **Finding #1 (structural):** The seed uses an A/B/C internal numbering scheme
> (e.g. A-01, B-03, C-12); `bachelorprojekt.features.requirement_id` uses
> FA/SA/NFA IDs. This mismatch causes automated coverage joins to report 0%.
> Aligning the ID schemes is the highest-priority improvement to the single
> source of truth.

## Reality Gaps (feature "done" vs test outcome)

Features whose requirement\_id appears in the seed but the matching step was
walked as `nicht_erfüllt` or `teilweise`:

- ST-1 System-Test 1: Authentifizierung & SSO (Keycloak) step 3: teilweise (req_ids: )
- ST-2 System-Test 2: Admin-Verwaltung & CRM step 10: teilweise (req_ids: )
- ST-3 System-Test 3: Kommunikation — Chat-Widget, Inbox & E-Mail step 1: teilweise (req_ids: )
- ST-3 System-Test 3: Kommunikation — Chat-Widget, Inbox & E-Mail step 3: teilweise (req_ids: )
- ST-4 System-Test 4: Fragebogen-System (Coaching-Workflow) step 3: teilweise (req_ids: )
- ST-5 System-Test 5: Dokumente & DocuSeal-Unterschriften step 4: teilweise (req_ids: )
- ST-6 System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring step 4: teilweise (req_ids: B-03)
- ST-6 System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring step 5: teilweise (req_ids: B-03, B-04)
- ST-6 System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring step 6: teilweise (req_ids: B-06)
- ST-7 System-Test 7: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung step 8: teilweise (req_ids: A-08)
- ST-7 System-Test 7: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung step 10: teilweise (req_ids: A-10)
- ST-8 System-Test 8: Buchhaltung — EÜR, Belege & Steuerauswertungen step 13: teilweise (req_ids: C-13)
- ST-10 System-Test 10: Externe Dienste & öffentliche Website step 4: teilweise (req_ids: )
- ST-11 System-Test 11: LiveKit & Streaming step 3: teilweise (req_ids: )

## Agent Observations

### ST-01: Authentifizierung & SSO (Keycloak)
SSO work is well-represented in features (PRs #259, #260, #100, #232 around Vaultwarden SSO, OIDC sync, Keycloak realm reconciliation), but none carry `requirement_id` so an agent cannot trace the ST-01 walk's "teilweise" on step 3 (portal Keycloak login) to a specific feature row — the structural mismatch hides which SSO PR landed which behaviour.

### ST-02: Admin-Verwaltung & CRM
Admin/CRM coverage in features is broad and explicit (PRs #379 admin numbers, #342 dual responsibility, #347 sidebar consolidation, #208 bug-ticket cleanup, many client-detail PRs); the only ST-02 partial (step 10, branding logo upload) lacks a matching feature row, suggesting the branding-upload UI may not have been shipped end-to-end.

### ST-03: Kommunikation — Chat-Widget, Inbox & E-Mail
Chat/Inbox is heavily represented (PR #167 ChatWidget, #136 inbox, #131 native messaging, #184 direct messages, #449 questionnaire widget replacing chat widget) — agents should know the floating widget on `/portal` was replaced by a Fragebogen widget in #449, which directly explains step 1's "teilweise" (the chat-widget step is now testing a different artifact than the seed implies).

### ST-04: Fragebogen-System (Coaching-Workflow)
Fragebogen is one of the few domains with a single, traceable feature shipment (PR #326 introduces the system, #355 adds system-test protocols, #449 swaps the floating widget) — the step 3 "teilweise" (testnutzer dashboard) likely reflects the widget/overlay UX still being unsettled rather than missing functionality.

### ST-05: Dokumente & DocuSeal-Unterschriften
DocuSeal is represented by PR #223 (full feature) and #224 (customer variable substitution), with no follow-up PRs covering signature capture UX; the step 4 "teilweise" (testnutzer signs) is consistent with the absence of any DocuSeal end-to-end UX hardening PR after #224.

### ST-06: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring
This template has the most acute drift: 11 req_ids (B-01..B-11) are seeded but **zero** appear in `features.requirement_id`; the relevant work exists (PR #397 tax-mode toggle, #394 native SEPA billing, #437 GoBD core) but is invisible to a compliance audit, and the three "teilweise" walks at steps 4-6 (B-03/B-04/B-06 threshold alerts) need test-data fixtures to be verifiable at all.

### ST-07: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung
A-01..A-15 are all uncovered in features despite massive shipped work (PR #437 GoBD, #438 SEPA + e-invoice, #439 ZUGFeRD/XRechnung, #443 HTML invoice template, #441 ZUGFeRD/XRechnung output); the step 8 (A-08 factur-x.xml embed) and step 10 (A-10 retain_until) "teilweise" walks need terminal/SQL access to verify, suggesting these acceptance steps are untestable without admin tooling exposed in the UI.

### ST-08: Buchhaltung — EÜR, Belege & Steuerauswertungen
C-01..C-13 are entirely uncovered in features though the GoBD core (#437) and EÜR module (#394) clearly ship most of this; the step 13 (C-13 beleg upload) "teilweise" reflects the same pattern as ST-02 step 10 — file-upload UX gaps that need a real test file fixture.

### ST-09: Monitoring & Bug-Tracking
Monitoring is well-traceable (PR #346 staleness audit, #208 bug-ticket fixes, #160/#192 inbox sync, #172 operational actions) and the walk passed cleanly at 1.0 compliance — agents can rely on `bachelorprojekt.features` for this domain even without req_ids.

### ST-10: Externe Dienste & öffentliche Website
External services are covered by many small PRs (#194 Wiki removal, #198 KI-Dienst removal, #156 whiteboard link fix, #281 dev fallbacks); step 4 "teilweise" (Talk audio/video) is the only soft spot and aligns with the absence of any Talk media-pipeline E2E PR — consistent with the LiveKit pivot.

### ST-11: LiveKit & Streaming
LiveKit coverage is dense and recent (PRs #456, #468, #480, #482, #495, #502 — pinning, codec fixes, hostNetwork, DNS-pinning); step 3 "teilweise" (viewer-portal player) is consistent with the unresolved DNS-round-robin issue documented in #468 and worth flagging to any agent touching `livekit-*` manifests.

### ST-12: Projektmanagement
Projekt features are well-covered (PR #96 initial module, #97 admin toolkit extension, #337 redirect bug + attachments, #338 calendar views, #218 race-condition fix) and the walk passed at 1.0 — feature rows here are reliable.


## CLAUDE.md Staleness Candidates

- `80:The legacy `mentolder:*` / `korczewski:*` shorthands were removed 2026-05-05 — pass `ENV=` to the unified tasks instead.`
- `255:Note: gaps in FA-/SA- numbering (FA-01..08, FA-22, SA-06, SA-09) reflect the removal of Mattermost and InvoiceNinja from the stack — see git history. Many other tests have individual test cases conditionally skipped when their preconditions are not met.`

## Improvement Plan

1. **Backfill `bachelorprojekt.features.requirement_id`** for all 39 req_ids referenced in ST-06/07/08 seeds (B-01..B-11, A-01..A-15, C-01..C-13) by mapping each req_id to the originating PR (e.g. B-01→#397, A-08→#439, C-13→#437); this is the single highest-impact change because every coverage gap and every ST-06/07/08 reality gap traces back to this empty-string column. Update `.github/workflows/track-pr.yml` and `tracking/pending/*.json` writers to require a non-empty `requirement_id` going forward.
2. **Update CLAUDE.md "Testing" section** (line ~273) to document that req_ids in test seeds must match `bachelorprojekt.features.requirement_id` and add a note that B-*/A-*/C-* are bookkeeping requirements distinct from FA-*/SA-*/NFA-*.
3. **Add a CI gate** that fails when a `system-test-seed-data.ts` step references a req_id absent from the live `bachelorprojekt.features` table — prevents future drift like the current 39 missing rows.
4. **Resolve the ST-03 step 1 widget ambiguity**: PR #449 replaced the chat widget with a Fragebogen widget on `/portal`, but the ST-03 seed step still says "Fragebogen-Widget (📋-Symbol rechts unten)" while the template title says "Chat-Widget" — reconcile by either renaming ST-03 to "Inbox & E-Mail" or splitting chat-widget tests into a separate template.
5. **Provide test-data fixtures for tax-threshold walks** (ST-06 steps 4/5/6, B-03/B-04/B-06): the "Nutzer: Testwert via DB oder Test-Modus setzen" instruction guarantees "teilweise" outcomes for any non-admin tester. Build a `task tracking:seed-tax-thresholds ENV=mentolder` task or expose a test-mode toggle in `/admin/steuer`.
6. **Expose A-08 (factur-x.xml embed) and A-10 (retain_until) in the admin UI** so ST-07 steps 8 and 10 don't require terminal/SQL access — add a "PDF-Inhalt prüfen" panel to the invoice detail view that surfaces embedded XML attachments and the 10-year retention timestamp.
7. **Add a file-upload fixture path** to `tests/lib/k3d.sh` that hands all upload-step questionnaires (ST-02 step 10 logo, ST-05 step 4 signature, ST-08 step 13 beleg) a known small PNG/PDF — eliminates three "teilweise" walks that fail purely on missing test artifacts.
8. **Document the LiveKit DNS-pinning prerequisite in CLAUDE.md's "Operational" gotcha** more prominently (it exists at line ~344 but is buried) — anchor it to ST-11 step 3's "teilweise" so agents touching `livekit-*` know to run `task livekit:dns-pin` before walking the template.
9. **Add `ALTER TABLE bachelorprojekt.features ALTER COLUMN requirement_id SET NOT NULL` migration** after the backfill in #1 — currently the empty string is a silent default that lets every new PR ship without traceability.
10. **Mark template 1's `pr_number=SET` row** (the first row in the features payload, all NULL fields) as bad data and add a constraint or filter to `tracking-import` to reject rows with literal `'SET'` or all-NULL payloads.

## Quantitative Summary

| Metric | Value |
|--------|-------|
| Overall compliance score | 92.7% |
| Templates walked | 12 / 12 |
| req\_ids with no feature row | 39 |
| CLAUDE.md staleness candidates | 2 |
| Steps walked total | 103 |
