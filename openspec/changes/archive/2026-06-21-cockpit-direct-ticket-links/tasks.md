# Tasks: cockpit-direct-ticket-links

> Plan: `docs/superpowers/plans/2026-06-20-cockpit-direct-ticket-links.md` · Ticket: T000966
> S1-Budgets (alle nicht-baselined, gegen statisches Limit): `TicketRow.svelte` 113 → ~108 · `CockpitTable.svelte` 197 → ~195 · `Cockpit.svelte` 170 → ~158 · `cockpitStore.ts` 85 → ~78. `TicketDrawer.svelte` (166) + `TicketDrawer.test.ts` (79) GELÖSCHT. Alle Änderungen schrumpfen → S1 unkritisch, Baseline-Key-Count unverändert.
> Befund über Spec hinaus: `CockpitTable.test.ts` (Z. 85–90) testet ebenfalls `onOpenDrawer` → muss entfernt werden (Task 2), sonst `test:changed` rot.

## Task 1: TicketRow — Titel als direkter Link, Drawer-Prop/Handler entfernen

- [ ] Failing-Test (`TicketRow.test.ts`): Block "dispatches openDrawer on title click" (Z. 26–31) ersetzen durch Assert, dass der Titel ein `<a>` mit `href="/admin/tickets/t1"` ist (Fixture `id:'t1'`); Lauf muss zuerst fehlschlagen (aktuell `<button>`)
- [ ] `TicketRow.svelte`: Prop `onOpenDrawer` (Z. 12) entfernen
- [ ] `TicketRow.svelte`: Funktion `handleOpenDrawer` (Z. 39–43) entfernen — `createEventDispatcher`/`dispatch` bleibt (statusChange/priorityChange/selectToggle/dragStart)
- [ ] `TicketRow.svelte` Z. 68: `<button class="title-link" on:click={handleOpenDrawer}>{ticket.title}</button>` → `<a class="title-link" href="/admin/tickets/{ticket.id}">{ticket.title}</a>`
- [ ] `TicketRow.svelte` Z. 98 `.title-link`-CSS von Button-Reset auf Link-Style: `.title-link { color: inherit; text-decoration: none; cursor: pointer; }` + `.title-link:hover { text-decoration: underline; }`
- [ ] `npx vitest run src/components/admin/TicketRow.test.ts` grün
- [ ] Commit `feat(cockpit): render ticket title as direct link to full view [T000966]`

## Task 2: CockpitTable — `onOpenDrawer`-Prop und Durchreichung entfernen

- [ ] `CockpitTable.test.ts`: Test "opens the drawer via row title click" (Z. 85–90) entfernen (Titel ist jetzt `<a href>`, kein Callback mehr)
- [ ] `CockpitTable.svelte`: Prop `onOpenDrawer` (Z. 13) entfernen (`TicketRowT`-Import bleibt — `tickets: TicketRowT[]`)
- [ ] `CockpitTable.svelte` Z. 148: `onOpenDrawer={(d) => onOpenDrawer?.(d)}` aus dem `<TicketRow .../>`-Aufruf entfernen
- [ ] `npx vitest run src/components/admin/CockpitTable.test.ts` grün
- [ ] Commit `feat(cockpit): drop onOpenDrawer prop from CockpitTable [T000966]`

## Task 3: Cockpit — TicketDrawer-Mount, Drawer-State und Funktionen entfernen

- [ ] `Cockpit.svelte` Z. 5: `setActiveTicket` aus dem `cockpitStore`-Import streichen
- [ ] `Cockpit.svelte` Z. 10: `import TicketDrawer from './TicketDrawer.svelte';` entfernen
- [ ] `Cockpit.svelte` Z. 18–19: State `drawerTicket`, `drawerOpen` entfernen
- [ ] `Cockpit.svelte` Z. 98–101: Funktionen `openDrawer`, `closeDrawer` entfernen; danach Z. 3 ungenutzten `TicketRow`-Typimport streichen (übrige Typen bleiben)
- [ ] `Cockpit.svelte` Z. 148: `onOpenDrawer={openDrawer}` vom `<CockpitTable .../>`-Block entfernen
- [ ] `Cockpit.svelte` Z. 159–160: `<TicketDrawer .../>`-Mount entfernen (`<TicketCreateModal .../>` bleibt)
- [ ] Selbstcheck: `grep -nE 'TicketDrawer|setActiveTicket|drawerOpen|drawerTicket|openDrawer|closeDrawer|TicketRow' website/src/components/admin/Cockpit.svelte` ist leer
- [ ] Commit `feat(cockpit): remove TicketDrawer mount and drawer state from Cockpit [T000966]`

## Task 4: cockpitStore — `activeTicket`-Feld und `setActiveTicket` entfernen

- [ ] `cockpitStore.test.ts`: ersten Test (Z. 10–16) auf `activeTicket`-Assert reduzieren/umbenennen; `setActiveTicket`-Test (Z. 30–36) entfernen
- [ ] `cockpitStore.ts` Z. 8: `activeTicket: string | null;` aus `CockpitState` entfernen
- [ ] `cockpitStore.ts` Z. 24: `activeTicket: null,` aus `initial` entfernen
- [ ] `cockpitStore.ts` Z. 58–60: Funktion `setActiveTicket` entfernen (übrige Exporte unverändert)
- [ ] `npx vitest run src/lib/stores/cockpitStore.test.ts src/components/admin/TicketRow.test.ts src/components/admin/CockpitTable.test.ts` grün
- [ ] Commit `feat(cockpit): drop activeTicket state and setActiveTicket from cockpitStore [T000966]`

## Task 5: TicketDrawer-Dateien löschen

- [ ] Verifizieren: `grep -rn "TicketDrawer" website/src/ | grep -v "platform/AssetTicketDrawer"` ist leer (kein verbleibender Importeur; `AssetTicketDrawer` bleibt)
- [ ] `git rm website/src/components/admin/TicketDrawer.svelte website/src/components/admin/TicketDrawer.test.ts`
- [ ] `cd website && npx vitest run` (gesamte Suite) grün — keine verwaisten Importe
- [ ] Commit `feat(cockpit): delete TicketDrawer component and its test [T000966]`

## Task 6: Finale Verifikation (CI-Äquivalent) + OpenSpec

- [ ] AC-grep: `onOpenDrawer` (in admin/) leer · `setActiveTicket`/`activeTicket` (in website/src) leer · beide TicketDrawer-Dateien fehlen · `href="/admin/tickets/` in `TicketRow.svelte` vorhanden
- [ ] `task test:inventory` (Tests geändert/gelöscht) → `website/src/data/test-inventory.json` aktualisiert
- [ ] `task test:changed` grün
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` grün (S1–S4-Ratchet + Baseline-Key-Count)
- [ ] `bash scripts/openspec.sh validate` grün (alternativ `task openspec:validate`)
- [ ] Regenerierte Artefakte committen (falls Diff): `chore(cockpit): regenerate test-inventory + freshness artifacts [T000966]`
- [ ] `cd website && npx vitest run` final grün
