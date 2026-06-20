# Tasks: sidekick-cleanup-grilling-broadcast

Plan-Ref: `docs/superpowers/plans/2026-06-20-sidekick-cleanup-grilling-broadcast.md` · Ticket: T000965

## 1. SidekickHome.svelte — Items, Banner & Nudge-Verdrahtung entfernen
- [ ] 1.1 Import `decideBanner`/`BannerDecision` entfernen; `tickets|inbox|pipeline` aus `View`-Union streichen
- [ ] 1.2 Props `pendingTickets`, `pendingInbox`, `summary` aus `$props()` entfernen
- [ ] 1.3 `banner`-`$derived` + `progressSub` entfernen; `isAdmin` behalten
- [ ] 1.4 Item-Liste bereinigen (tickets/inbox/pipeline/loslernen raus) + Nummern 01–07 neu vergeben
- [ ] 1.5 `{#if banner}`-Markup-Block entfernen
- [ ] 1.6 `.sk-banner*`-CSS-Regeln entfernen
- [ ] 1.7 Grep-Verifikation: keine `progressSub|summary|banner|pendingTickets|pendingInbox|loslernen`-Treffer
- [ ] 1.8 Commit

## 2. PortalSidekick.svelte — View-Routing, State & Fetches entfernen
- [ ] 2.1 Imports `TicketSidekickView`/`InboxSidekickView`/`PipelineSidekickView` entfernen; `shouldShowLearnDot` aus Nudge-Import streichen
- [ ] 2.2 `View`-Union bereinigen (tickets/inbox/pipeline raus)
- [ ] 2.3 State `pendingTickets`/`inboxPending`/`learningSummary` + `showLearnDot`-`$derived` entfernen
- [ ] 2.4 `titleMap`-Einträge tickets/inbox/pipeline entfernen
- [ ] 2.5 `learning/summary`- + admin-`tickets`/`inbox`-Fetches entfernen (nur `container-count` bleibt)
- [ ] 2.6 `learning:updated`-Listener-`$effect` entfernen
- [ ] 2.7 FAB-Badge-Bedingung auf `pendingQuestionnaires`/`pendingContainerCount` reduzieren; `{#if showLearnDot}` entfernen
- [ ] 2.8 `<SidekickHome>`-Props bereinigen (kein `pendingTickets`/`pendingInbox`/`summary`)
- [ ] 2.9 View-Routing-Branches tickets/inbox/pipeline entfernen
- [ ] 2.10 `.fab-dot`-CSS entfernen
- [ ] 2.11 Grep-Verifikation: keine toten Referenzen
- [ ] 2.12 Commit

## 3. sidekick-nudge.ts — Banner/LearnDot-Logik entfernen, Typen bereinigen
- [ ] 3.1 (TDD) `sidekick-nudge.test.ts` anpassen: `decideBanner`/`shouldShowLearnDot`-Blöcke raus, `removed view → null`-Assertions rein
- [ ] 3.2 Test ausführen → FAIL (KNOWN_VIEWS kennt tickets/inbox/pipeline noch)
- [ ] 3.3 Modul bereinigen: `decideBanner`/`BannerDecision`/`BannerInput`/`shouldShowLearnDot` entfernen; `SidekickView`/`KNOWN_VIEWS` ohne tickets/inbox/pipeline
- [ ] 3.4 Test ausführen → PASS
- [ ] 3.5 Commit

## 4. mediaviewer-bridge.ts — Session-Typen ins Protokoll aufnehmen
- [ ] 4.1 (TDD) `mediaviewer-bridge.test.ts`: `sessionStarted`/`sessionProgress`-Parser-Tests + `buildSetModeMessage('brainstorm')`-Test anhängen
- [ ] 4.2 Test ausführen → FAIL
- [ ] 4.3 `HostInbound.setMode.mode` um `'brainstorm'` erweitern; `HostOutbound` um `sessionStarted`/`sessionProgress`; `buildSetModeMessage`-Signatur + `parseOutbound`-Cases ergänzen
- [ ] 4.4 Test ausführen → PASS
- [ ] 4.5 Commit

## 5. grilling.ts — brainstorm-v1-Fragebogen hinzufügen
- [ ] 5.1 (TDD) `grilling.test.ts`: `brainstorm-v1`-`describe` (registered / 4 sections / 8–10 unique-id questions) anhängen
- [ ] 5.2 Test ausführen → FAIL (getQuestionnaire undefined)
- [ ] 5.3 `QUESTIONNAIRES['brainstorm-v1']` einfügen: 4 Sektionen (Problem/Lösungen/Risiken/Nächste Schritte), 9 Fragen q1–q9, **keine Brand-Domains**
- [ ] 5.4 Test ausführen → PASS
- [ ] 5.5 S3-Grep: keine `mentolder.de|korczewski.de` in grilling.ts
- [ ] 5.6 Commit

## 6. Host-Broadcast + GrillingSessionHost-sessionType-Override
- [ ] 6.1 (TDD) `MediaviewerPanel.test.ts`: `session:event`-CustomEvent-Broadcast-Test bei `grillingAnswer` anhängen
- [ ] 6.2 Test ausführen → FAIL
- [ ] 6.3 `MediaviewerPanel.svelte`: `currentSessionType`-`$derived` + fail-softer `broadcastSession()` (BroadcastChannel + CustomEvent, `ch.close()` sofort); `dispatch`-Switch broadcastet bei grillingAnswer/Dismiss/Complete vor den Callbacks
- [ ] 6.4 Test ausführen → PASS
- [ ] 6.5 `GrillingSessionHost.svelte`: optionales `sessionType`-Prop (default `final-grilling-v1`) an `buildGrillingSessionData(ticket, sessionType)` durchreichen
- [ ] 6.6 `svelte-check` Smoke (MediaviewerPanel + GrillingSessionHost) → 0 Errors
- [ ] 6.7 Commit

## 7. Test-Inventar regenerieren + committen
- [ ] 7.1 `task test:inventory`
- [ ] 7.2 `website/src/data/test-inventory.json` diff prüfen + (falls geändert) committen

## 8. Finale Verifikation (CI-Gate-Äquivalent)
- [ ] 8.1 `bash scripts/openspec.sh validate` → grün
- [ ] 8.2 `task test:changed` → PASS
- [ ] 8.3 `task freshness:regenerate` + etwaige Artefakte committen
- [ ] 8.4 `task freshness:check` → PASS (S1–S4-Ratchet + Baseline-Assertion)
- [ ] 8.5 voller `svelte-check --threshold error` → 0 Errors
- [ ] 8.6 Repo-weite Grep: keine `decideBanner|shouldShowLearnDot|BannerDecision|BannerInput`-Rest-Referenzen (E2E-Spec ggf. anpassen, NICHT Code wieder hinzufügen)
- [ ] 8.7 Abschluss-Commit (falls E2E-Spec angepasst)
