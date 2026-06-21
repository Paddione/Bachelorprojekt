---
title: "Cockpit: DoR / Lastenheft inline editieren"
ticket_id: T000990
domains: [website]
status: active
---

# Implementation Plan: cockpit-dor-inline-editor

> Ticket: T000990 · Spec: `docs/superpowers/specs/2026-06-20-cockpit-dor-inline-editor.md`
> S1-Budgets: `website/src/pages/admin/tickets/[id].astro` steht bei 340 Zeilen, statisches Limit 400 → +60 Rest. Neue Dateien (`proposal.ts`, `save-proposal.ts`, `DorPanel.svelte` sowie drei Test-Dateien) sind nicht auf Platte und damit für den S1-Pre-flight unkritisch.

## File Structure

| Pfad | Rolle | Status |
|------|-------|--------|
| `website/src/lib/openspec/proposal.ts` | Slug-Auflösung, `readProposal`/`writeProposal`, Path-Traversal-Guard | NEU |
| `website/src/pages/api/admin/openspec/save-proposal.ts` | POST-Endpoint, Admin-Guard, delegiert an `writeProposal` | NEU |
| `website/src/components/admin/DorPanel.svelte` | Editor-Insel: Textarea + Live-Preview + Save-Button + Leer-Fallback | NEU |
| `website/src/pages/admin/tickets/[id].astro` | Server-seitiges Read, DorPanel einbinden, Type-Guard {project,feature} | ERWEITERT |
| `website/src/lib/openspec/proposal.test.ts` | Unit-Tests für `proposal.ts` (Slug-Validierung, read/write) | NEU |
| `website/src/components/admin/DorPanel.test.ts` | Component-Test (Textarea, Preview, Save-Fetch, Leer-Hinweis) | NEU |
| `website/src/pages/api/admin/openspec/save-proposal.test.ts` | Endpoint-Test (Auth-Guard 403, gültiger Save 200, Bad-Slug 400) | NEU |

## Task 1: proposal.ts — Lib + Failing-Test

- [ ] Test `website/src/lib/openspec/proposal.test.ts` anlegen:
  - `isValidSlug('cockpit-dor-inline-editor')` === `true`
  - `isValidSlug('../etc/passwd')` === `false` (Path-Traversal)
  - `isValidSlug('')` === `false`
  - `readProposal('does-not-exist')` resolved zu `null` (kein Wurf)
  - `writeProposal('test-slug','inhalt')` schreibt die Datei (tmp-Fixture, Aufräum-`afterEach`)
  - Test ausführen — expected: fail (Modul `proposal.ts` existiert noch nicht)
- [ ] `website/src/lib/openspec/proposal.ts` implementieren:
  - `REPO_ROOT = process.env.OPENSPEC_REPO_ROOT ?? path.resolve(process.cwd(), '../../..')`
  - `proposalPath(slug)` = `path.join(REPO_ROOT, 'openspec', 'changes', slug, 'proposal.md')`
  - `isValidSlug(slug)`: Regex `^[a-z0-9][a-z0-9-]*$`, lehnt `..`, leeren String und Pfad-Separator ab
  - `readProposal(slug): Promise<string|null>` — `null` bei fehlender Datei, wirft nur bei IO-Fehlern
  - `writeProposal(slug, content): Promise<void>` — `fs.mkdir({recursive:true})` + `fs.writeFile`
- [ ] Test grün; `wc -l` ≤ 120

## Task 2: save-proposal.ts — Endpoint + Failing-Test

- [ ] Test `website/src/pages/api/admin/openspec/save-proposal.test.ts` anlegen:
  - POST ohne Session → 403
  - POST mit Admin-Session + gültigem `{ slug, content }` → 200 `{ ok: true }` und `writeProposal` mit korrekten Args aufgerufen (Mock-Stub)
  - POST mit Admin-Session + ungültigem Slug (`'../x'`) → 400
  - Test ausführen — expected: fail (Endpoint existiert noch nicht)
- [ ] `website/src/pages/api/admin/openspec/save-proposal.ts` implementieren:
  - `import { getSession, isAdmin } from '../../../../lib/auth'`
  - `import { isValidSlug, writeProposal } from '../../../../lib/openspec/proposal'`
  - POST-Handler: Session/Admin-Guard → 403 bei fehlend; JSON-Body `{ slug, content }`; `isValidSlug(slug)` UND `typeof content === 'string'` Guard → 400 bei Verstoß; `await writeProposal(slug, content)` → 200 `{ ok: true }`; `catch` → 500 `{ error: 'save failed' }`
- [ ] Test grün; `wc -l` ≤ 80

## Task 3: DorPanel.svelte — Editor-Insel + Failing-Test

- [ ] Test `website/src/components/admin/DorPanel.test.ts` anlegen:
  - Render mit `{ slug: 's1', proposalContent: '# Hello' }` → `<textarea>` enthält `# Hello`, Preview-Div rendert `<h1>`
  - Klick auf „Speichern" triggert `fetch('/api/admin/openspec/save-proposal', { method: 'POST', body: JSON.stringify({ slug: 's1', content }) })` (fetch gemockt)
  - Render mit `{ slug: null, proposalContent: null }` → Hinweis „Kein Proposal verknüpft" + Openspec-Link, kein `<textarea>`
  - Render mit `{ slug: 's1', proposalContent: null }` → leerer Editor (kein Hinweis-Block, leere Textarea)
  - Test ausführen — expected: fail (Komponente existiert noch nicht)
- [ ] `website/src/components/admin/DorPanel.svelte` implementieren (Svelte 5 Runes, `$props`):
  - Props `{ slug: string|null, proposalContent: string|null }`
  - State: `let draft = $state(proposalContent ?? '')`, `let saving = $state(false)`, `let toast = $state<string|null>(null)`
  - `{#if !slug}` → amber Hinweis „Kein Proposal verknüpft" + Link zu `https://github.com/Paddione/Bachelorprojekt/tree/main/openspec/changes`; kein Editor
  - `{:else}` → Side-by-Side-Grid: `<textarea bind:value={draft}>` links, `<div class="md-body" set:html={rendered}>` rechts; Preview via `renderMarkdown(draft)` aus `../../lib/markdown` (Markdown-Syntax-Fehler → roher Text, keine Blockade, AC-Edge)
  - „Speichern"-Button → `onSave()`: `saving=true`, `fetch POST`, bei `!r.ok` → `toast='Speichern fehlgeschlagen'` und `draft` bleibt unverändert (AC Fehlerfall), bei Erfolg → `toast='Gespeichert'`; `finally saving=false`
  - `client:load`-tauglich (kein SSR-only-Code, `renderMarkdown` ist isomorph)
- [ ] Test grün; `wc -l` ≤ 200

## Task 4: [id].astro — Server-Read + Einbindung (S1-kritisch ≤400)

- [ ] Importe ergänzen: `import { readProposal } from '../../../lib/openspec/proposal'` und `import DorPanel from '../../../components/admin/DorPanel.svelte'`
- [ ] Server-seitig: wenn `isContainer && openspecProposals[0]?.slug` → `const dorSlug = openspecProposals[0].slug; const proposalContent = await readProposal(dorSlug).catch(() => null)`; sonst `dorSlug = null`, `proposalContent = null`
- [ ] Im Main-Column-Markup nach `{containerDor && <ContainerDorPanel …/>}` einfügen: `{isContainer && <DorPanel client:load slug={dorSlug} proposalContent={proposalContent} />}` (AC-1: nur project/feature; AC-5: leerer Slug → Hinweis innerhalb DorPanel)
- [ ] Reihenfolge (AC-1): Beschreibung → TicketSpecProgress → ContainerDorPanel → DorPanel → TicketPlanPanel → ContainerChildrenList → GrillingStepper → …
- [ ] Typecheck sauber; `wc -l` ≤ 400 (HART, kein Baseline-Spielraum — aktuell 340, +60 Rest)
- [ ] Commit `feat(cockpit): inline DoR/Lastenheft editor in ticket detail [T000990]`

## Task 5: Finale Verifikation (CI-Äquivalent)

- [ ] `task test:changed` grün
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` grün (S1–S4-Ratchet + Baseline-Key-Count); regenerierte Artefakte committen
