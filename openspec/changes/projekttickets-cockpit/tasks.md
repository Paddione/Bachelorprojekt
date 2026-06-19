# Tasks: projekttickets-cockpit

## Task 1: container-detail.ts — getContainerRollup

- [ ] Failing-Test `container-detail.test.ts`: Feature mit 2 Leaves (done/blocked) → `{total:2,done:1,blocked:1,pctDone:50,health:'red'}`; unbekannte id → null; fremde Brand → null
- [ ] `container-detail.ts` (NEU, reines pg-Modul): `getContainerRollup(brand, containerId)` liest `v_cockpit_rollup` per Container-uuid mit Brand-Guard-Join
- [ ] Test grün

## Task 2: getTicketPlan (content gefiltert)

- [ ] Failing-Test: neuester Plan je `ticket_id`, kein Plan → null, fremde Brand → null
- [ ] `getTicketPlan(brand, ticketId)`: `content` NUR per `WHERE p.ticket_id = $1` (CLAUDE.md-Footgun), Brand-Guard via Join, `ORDER BY archived_at DESC, id DESC LIMIT 1`
- [ ] Test grün

## Task 3: getContainerDor

- [ ] Failing-Test: liest `value_prop/effort/areas/depends_on/readiness/requirements_list`, `dorScore` aus `DOR_KEYS`; fremde Brand → null
- [ ] `getContainerDor(brand, containerId)` + `dorScore`/`DOR_KEYS`-Reuse aus `planning-office.ts`
- [ ] Entscheidung dokumentiert: separater Loader (nicht `getTicketDetail` erweitern, weil `admin.ts` S1-Budget 0)

## Task 4: ContainerChildrenList.astro

- [ ] Neue `.astro`-Komponente: Kind-Tickets nach Status gruppiert, Status-/Prio-Chips, `role=list/listitem`, Labels aus `cockpit-labels.ts`

## Task 5: ContainerRollupHeader.svelte

- [ ] Fortschrittsbalken (`pctDone`), Breakdown (done/blocked/in_progress/awaiting_deploy/open), Health-Punkt, Lifecycle-Streifen (Status + Plan-Branch + PR) — nur bereits geladene Daten, kein Fetch

## Task 6: TicketPlanPanel.svelte

- [ ] Plan-Metadaten (slug/branch/PR) immer sichtbar; `content` als Markdown in `<details>` collapsible (`renderedHtml`-Prop, server-seitig gerendert)

## Task 7: ContainerDorPanel.svelte

- [ ] DoR-Checkliste (4 `DOR_KEYS`), `dorScore/4`, valueProp/effort/areas/dependsOn, requirementsList (read-only)

## Task 8: [id].astro — Status-Map-Fix + conditional Sektionen (S1-kritisch)

- [ ] Lokale Label-Maps (Z. 55–72) entfernen → Import `statusLabel/typeLabel/priorityLabel` aus `cockpit-labels.ts`
- [ ] `isContainer`-Conditional; `getContainerRollup/getContainerDor/getTicketPlan` fail-soft (try/catch) laden
- [ ] Komponenten einbinden (Rollup-Header nach Action-Bar; Plan/DoR/ChildrenList in Main-Column); flache `<ul>` ersetzen
- [ ] `wc -l` ≤ 400 verifizieren (sonst Farb-Klassen in reines `cockpit-status-classes.ts` extrahieren)

## Task 9: container-count.ts Endpoint

- [ ] `GET /api/admin/cockpit/container-count` → `{total}` offene `project`/`feature`-Container der Brand; 403 ohne Admin; fail-soft (Muster `inbox/count.ts`)

## Task 10: Sidekick-Eintrag „Projekttickets"

- [ ] Failing-Test `PortalSidekick.test.ts`: Admin zeigt „Projekttickets" (href `/admin/cockpit`); Portal nicht
- [ ] `SidekickHome.svelte`: href-Item nach `loslernen`-Muster + `pendingContainers`-Badge + `no`-Renumbering (kein neuer View-Slug)
- [ ] `PortalSidekick.svelte`: `pendingContainers`-State + Fetch im Admin-`$effect` + FAB-Badge-Summe + Prop-Durchreichung
- [ ] Test grün

## Task 11: OpenSpec-Artefakte

- [ ] proposal.md / tasks.md / specs gefüllt; `scripts/openspec.sh validate` grün

## Task 12: Playwright-Smoke (optional)

- [ ] Falls Live-Env/Suite: `feature`-Ticket zeigt Rollup+Plan+DoR; `task`-Leaf nicht. Sonst auf dev-flow-e2e nach Deploy verschieben

## Task 13: Finale Verifikation (PFLICHT)

- [ ] `task test:inventory` (+ `test-inventory.json` committen)
- [ ] `task test:changed`
- [ ] `task test:openspec`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` (S1–S4-Ratchet + Baseline-Assertion grün; `admin.ts`/`cockpit-db.ts` unverändert)
