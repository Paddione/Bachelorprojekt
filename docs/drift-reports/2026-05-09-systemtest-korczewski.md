# System-Test Drift Report — korczewski — 2026-05-09

> Generated: 2026-05-09T05:34:53Z
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
The `bachelorprojekt.features` table currently holds only a single placeholder row (`pr_number=SET`, all other fields null), so SSO/Keycloak work is invisible to feature lookups despite a 91 % compliance walk on korczewski — agents touching auth must rely on git history / PR titles, not the features table, and should be aware step 3 (cross-browser SSO) recorded as `teilweise`.

### ST-02: Admin-Verwaltung & CRM
No CRM/admin-dashboard rows exist in `features`, so the high 95 % compliance (10 steps covering clients, meetings, projects, calendar, branding) is undocumented in the timeline; the only `teilweise` is logo upload (step 10), which an agent extending branding should investigate before assuming the upload path is wired end-to-end.

### ST-03: Kommunikation — Chat-Widget, Inbox & E-Mail
With features empty, the messaging/inbox/newsletter flows that achieved 80 % compliance are untracked; the two `teilweise` results (Fragebogen-Widget visibility for users, real-time admin→user notification delivery) point to a likely gap in the websocket/notification path on the user-portal side that an agent should confirm before extending notifications.

### ST-04: Fragebogen-System (Coaching-Workflow)
Fragebogen template→assignment→submission→scoring scored 90 % but is not represented in `features`; the only `teilweise` is the user-portal step (assignment visibility on the Testnutzer dashboard), suggesting the admin-side flow is solid while the user-portal Fragebogen entrypoint needs a UX/wiring verification.

### ST-05: Dokumente & DocuSeal-Unterschriften
Document creation, content-blocks, and DocuSeal signing flow walked at 90 % with no `features` rows; the `teilweise` on step 4 (user actually completing the signature in DocuSeal) is a manual-verification gap rather than a code gap, but agents touching DocuSeal integration should treat the signed-doc round-trip as un-attested by automation.

### ST-06: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring
All 11 B-* req_ids (B-01..B-11) appear in the seed but **none** are present in `features.requirement_id` — this is a structural coverage gap; the `teilweise` results on B-03 (80 %/100 % thresholds, steps 4–5) and B-06 (€100 k threshold, step 6) further indicate the threshold-trigger UI cannot be exercised without test-data injection, so any agent working on TaxMonitor must add seedable test hooks.

### ST-07: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung
All 15 A-* req_ids (A-01..A-15) are absent from `features.requirement_id` despite 93.75 % compliance; the `teilweise` on A-08 (factur-x.xml embedding verification, requires `qpdf --show-attachments`) and A-10 (`retain_until = invoice_date + 10y` SQL check) are tooling gaps — agents touching invoicing should add automated assertions for ZUGFeRD attachment + GoBD retention rather than relying on manual terminal checks.

### ST-08: Buchhaltung — EÜR, Belege & Steuerauswertungen
All 13 C-* req_ids (C-01..C-13) are missing from `features.requirement_id` though compliance is 96 %; the only `teilweise` is C-13 (attaching a receipt PDF/image to a journal entry, step 13) — likely a Datei-Upload-Pfad that needs verification, and an agent extending Buchhaltung should also note the DATEV-Export step (14) has no req_id assigned in the seed.

### ST-09: Monitoring & Bug-Tracking
Walked at 100 % with no req_ids in the seed and no features rows; agents working on `/admin/bugs` (BR-YYYYMMDD-xxxx tickets) or the Test-Results-Panel must derive context from the ticket-DB itself and `bugs.bug_tickets` rather than `bachelorprojekt.features`.

### ST-10: Externe Dienste & öffentliche Website
Nextcloud (Files/Calendar/Contacts/Talk/Whiteboard), Collabora, Vaultwarden, Brett, public homepage walked at 95 %; the `teilweise` on step 4 (Talk audio/video permissions in browser) reflects a manual browser-permission step, not a code defect — but with `features` empty, agents extending Nextcloud apps or the public homepage have no quick way to discover prior PRs without `git log`.

### ST-11: LiveKit & Streaming
LiveKit start/stop, RTMP ingress, recordings, monitoring walked at 92.9 %; the `teilweise` on step 3 (Viewer-Portal connection from a second browser profile) is consistent with the documented DNS-pinning + node-affinity gotcha — agents touching `/admin/stream` or `/portal/stream` should re-read the LiveKit Gotcha section in CLAUDE.md before changing pin-node logic.

### ST-12: Projektmanagement
Projects, sub-projects, tasks, time-tracking, meeting-linking, archiving all walked 100 %; with no features rows the entire PM module is undocumented in the timeline despite being a substantial feature surface — high priority to backfill PR history into `bachelorprojekt.features` for this domain.


## CLAUDE.md Staleness Candidates

- `80:The legacy `mentolder:*` / `korczewski:*` shorthands were removed 2026-05-05 — pass `ENV=` to the unified tasks instead.`
- `255:Note: gaps in FA-/SA- numbering (FA-01..08, FA-22, SA-06, SA-09) reflect the removal of Mattermost and InvoiceNinja from the stack — see git history. Many other tests have individual test cases conditionally skipped when their preconditions are not met.`

## Improvement Plan

1. **Fix the structural req_id coverage gap (highest priority):** the seeds for ST-06 (B-01..B-11), ST-07 (A-01..A-15), and ST-08 (C-01..C-13) reference 39 req_ids, but `bachelorprojekt.features.requirement_id` contains zero matching rows — backfill these 39 req_ids by editing `tracking/pending/*.json` (or running `task tracking:backfill` after annotating the relevant PRs with the A-/B-/C- IDs in their tracking metadata) so the timeline view (`v_timeline`) and `/api/timeline` can join walked steps to features.

2. **Repair the empty-features state on korczewski shared-db:** the only row is `pr_number=SET` with all other columns null — investigate whether this is a `tracking-import` CronJob failure on `workspace-korczewski` namespace, or whether the `tracking/pending/` queue is drained but never written; check `kubectl logs -n workspace-korczewski cronjob/tracking-import` and the `TRACKING_DB_URL` SealedSecret values on korczewski.

3. **Add a `seed_req_ids` join column / view:** extend `bachelorprojekt.v_timeline` (or add a sibling view) that exposes which system-test req_ids each feature row claims to satisfy, so the drift report can be generated automatically by a SQL query rather than a JSON walk.

4. **Add automated assertions for A-08 and A-10:** the two `teilweise` outcomes in ST-07 require manual terminal commands (`qpdf --show-attachments`, raw SQL on `billing_invoices.retain_until`); convert these into BATS or Playwright assertions under `tests/` so future system-test walks can mark them `erfüllt` without operator tooling.

5. **Add seedable test hooks for B-03 and B-06 thresholds:** ST-06 cannot exercise the 80 %/100 %/€100 k tax-mode triggers without manual DB writes; expose an `/api/test/seed-revenue` endpoint (admin-only, gated on a `TEST_MODE` env var) so the walks can promote these to `erfüllt`.

6. **Fix the user-portal `teilweise` cluster** (ST-01 step 3, ST-03 steps 1+3, ST-04 step 3, ST-05 step 4, ST-10 step 4, ST-11 step 3): six steps across six templates fail because they require a second browser profile / Testnutzer session — add a documented "second-profile fixture" to the runner (e.g. `runner.sh local --user-profile=testuser`) so user-role steps don't degrade to manual.

7. **Update CLAUDE.md "Testing" section to list the 12 system-test templates:** the current `Test IDs` line only mentions FA-/SA-/NFA-/AK-* — add a paragraph describing ST-01..ST-12, the seed req_ids (A-/B-/C-*), and the `scripts/systemtest-fanout.sh` entrypoint so agents discover the system-test surface without reading the JSON.

8. **Remove the "Stripe payment gateway" line from CLAUDE.md:** `task workspace:stripe-setup` is still listed under "Post-Deploy Setup" but the `project_stripe_removed.md` memory says Stripe was removed; either delete the task or replace it with a no-op + deprecation comment, and update the line in CLAUDE.md.

9. **Document the systemtest-fanout drift workflow in CLAUDE.md:** the `scripts/systemtest-fanout.sh` (currently modified, untracked drift report at `docs/drift-reports/2026-05-09-systemtest-korczewski.md`) has no entry in CLAUDE.md — add a short section under "Testing" explaining how walks are run, where outcomes land, and how the drift report is generated so future agents extending the fanout know the contract.

10. **Add a `category` taxonomy for ST-09 / ST-12:** Monitoring/Bug-Tracking and Projektmanagement walked 100 % but have no req_ids and no features rows — assign them a `category` value (e.g. `monitoring`, `pm`) on relevant PRs and import historical PRs via `task tracking:backfill` so these untagged-but-complete domains gain timeline visibility.

## Quantitative Summary

| Metric | Value |
|--------|-------|
| Overall compliance score | 92.7% |
| Templates walked | 12 / 12 |
| req\_ids with no feature row | 39 |
| CLAUDE.md staleness candidates | 2 |
| Steps walked total | 103 |
