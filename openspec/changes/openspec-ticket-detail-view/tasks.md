# Tasks: openspec-ticket-detail-view

_Ticket: T000962 · Plan: `docs/superpowers/plans/2026-06-20-openspec-ticket-detail-view.md`_

## Task 1: OpenSpecProposalsPanel.svelte erstellen

- [ ] Create `website/src/components/admin/OpenSpecProposalsPanel.svelte` (Prop `proposals: Array<{ slug: string; status: string }>`)
- [ ] Status-Badge farbcodiert: `planning` grau, `plan_staged` gold, `archived` grün, Fallback grau
- [ ] Slug → Titel-Case (`slug.replace(/-/g, ' ')` + Capitalize), GitHub-Link `.../openspec/changes/{slug}/proposal.md`
- [ ] Stil-Vorlage `ContainerDorPanel.svelte`; Ziel ~70–100 Zeilen (Limit 500)
- [ ] `pnpm exec svelte-check` ohne neuen Error; commit

## Task 2: [id].astro erweitern (~5 Netto-Zeilen)

- [ ] Import `OpenSpecProposalsPanel` + statischer Import `openspec-status.json`
- [ ] SSR-`const openspecProposals = (map as ...)[ticket.externalId] ?? []`
- [ ] Conditional render `{openspecProposals.length > 0 && <OpenSpecProposalsPanel client:load ... />}` nach `TicketAttachmentsPanel`
- [ ] `wc -l` ≤ 400 (S1, nicht-baselined, Budget 68); `astro check` ohne neuen Error; commit

## Task 3: Verifikation (CI-Äquivalent — PFLICHT)

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- [ ] `task test:openspec`
- [ ] Generierte Artefakte mitcommitten
