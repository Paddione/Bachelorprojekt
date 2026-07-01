# Tasks: ticket-verlauf-anhaenge

## Feature A — Verlauf-Collapse

### `TicketActivityTimeline.svelte`
- [ ] `initialCount: number = 5` Prop hinzufügen (Svelte-4-Syntax beibehalten: `export let`)
- [ ] `let expanded = false` reaktive Variable hinzufügen
- [ ] `$: visibleEntries` Derived anlegen (`entries.slice(0, initialCount)` wenn nicht expanded)
- [ ] Template: `{#each entries ...}` → `{#each visibleEntries ...}`
- [ ] Collapse-Button nach `</ol>` einfügen (`{#if entries.length > initialCount}`)
- [ ] CSS-Klassen für Toggle-Button in `<style>` ergänzen

### `TicketActivityTimeline.test.ts` (neu)
- [ ] Test: Default 5 Einträge sichtbar bei 10 Einträgen
- [ ] Test: Alle Einträge nach Klick auf Expand-Button
- [ ] Test: "Weniger anzeigen" Button erscheint nach Expand
- [ ] Test: Kein Button wenn Einträge ≤ initialCount
- [ ] Test: Default funktioniert ohne explizites initialCount

## Feature B — TicketAttachmentsPanel (neu)

### `TicketAttachmentsPanel.svelte` (neue Datei)
- [ ] Props: `ticketId: string`, `attachments: Array<{id, filename, mimeType, fileSize, hasDataUrl}>`
- [ ] Anhang-Liste rendern mit Download-`<a href="/api/admin/tickets/{ticketId}/attachments/{id}">` + `download`-Attribut (nur wenn `hasDataUrl === true`)
- [ ] Upload-Button öffnet `<dialog>` via `bind:this` + `dialogEl?.showModal()`
- [ ] `<form onsubmit={handleUpload}>` mit `fetch POST` und `location.reload()` bei Erfolg
- [ ] `uploadError` als `$state<string>` mit Fehleranzeige
- [ ] `fmtSize()` Hilfsfunktion für B/KB/MB

### `TicketAttachmentsPanel.test.ts` (neue Datei)
- [ ] Test: "Keine Anhänge" bei leerem Array
- [ ] Test: Download-Link wenn `hasDataUrl === true`
- [ ] Test: Kein Link wenn `hasDataUrl === false`
- [ ] Test: Größenformatierung (B, KB, MB)
- [ ] Test: Count im Header

### `[id].astro` — Anhänge-Block ersetzen
- [ ] `import TicketAttachmentsPanel` hinzufügen
- [ ] Anhänge-Block (~28 Zeilen) durch `<TicketAttachmentsPanel client:load .../>` (1 Zeile) ersetzen
- [ ] Upload-`<dialog>` (Zeilen ~345–366) entfernen
- [ ] Upload-Script-Handler aus `<script>` entfernen (nur unlink-Handler bleibt)
- [ ] Zeilenzahl prüfen: `wc -l [id].astro` → ≤ 395

## Feature C — Binary-Download-Endpoint

### `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts` (neue Datei)
- [ ] `GET` APIRoute mit Admin-Auth-Guard (`getSession` + `isAdmin`)
- [ ] Inline-DB-Query: `SELECT data_url, filename, mime_type FROM tickets.ticket_attachments JOIN tickets.tickets ... WHERE a.id=$1 AND a.ticket_id=$2 AND t.brand=$3 AND a.data_url IS NOT NULL`
- [ ] 403 bei fehlendem Admin-Recht, 404 wenn nicht gefunden
- [ ] Base64-Decode: `Buffer.from(data_url.slice(commaIdx+1), 'base64')`
- [ ] Response-Header: `Content-Type`, `Content-Disposition: attachment; filename*=UTF-8''...`, `Cache-Control: private, no-store`
- [ ] **Kein Import aus `lib/tickets/admin.ts`** (Budget=0 dort)

## Feature D — Fragebögen-Export

### `GrillingStepper.svelte`
- [ ] `exportAnswers()` Funktion: iteriert über `resolveQuestions(...)`, formatiert als `# Grilling: <title>\n## <Section>\n**<Frage>**\n<Antwort>\n`
- [ ] `const hasAnswers = $derived(...)` — prüft ob mindestens eine Antwort nicht leer
- [ ] Export-Button im Header (`{#if hasAnswers}`) mit `onclick={exportAnswers}`
- [ ] Blob-Download via `URL.createObjectURL(new Blob([text], { type: 'text/plain' }))`, Dateiname: `grilling-{questionnaireId}.txt`

### `GrillingStepper.test.ts` (erweitern)
- [ ] Test: Export-Button nicht sichtbar bei leeren Antworten
- [ ] Test: Export-Button sichtbar wenn mindestens eine Antwort vorhanden
- [ ] Test: Klick auf Export triggert Blob-Download (`URL.createObjectURL` aufgerufen, `<a>.click()` ausgeführt)

## Feature E — Plan-Download

### `TicketPlanPanel.svelte`
- [ ] Neue optionale Prop `planContent: string = ''` (Svelte-5-`$props()` — ganzen Script-Block auf Runes migrieren)
- [ ] `downloadPlan()` Funktion: `new Blob([planContent], { type: 'text/markdown' })`, Dateiname `plan-{plan.slug}.md`
- [ ] Download-Button im Panel-Header (`{#if planContent}`) mit `onclick={downloadPlan}`

### `TicketPlanPanel.test.ts` (neue Datei)
- [ ] Test: Slug und PR-Link werden gerendert
- [ ] Test: Download-Button sichtbar wenn `planContent` nicht leer
- [ ] Test: Download-Button nicht sichtbar wenn `planContent` leer
- [ ] Test: Klick löst Blob-Download aus (Typ `text/markdown`)

### `[id].astro` — planContent Prop ergänzen
- [ ] `<TicketPlanPanel ... planContent={containerPlan.content ?? ''} />` ergänzen

## Verifikation
- [ ] `task test:changed` grün
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` grün (S1–S4 Ratchet, Baseline-Key-Count unverändert)
- [ ] `task test:inventory` (falls neue Tests hinzugekommen)
- [ ] `npx tsc --noEmit` in `website/` — keine Fehler
- [ ] `wc -l [id].astro` ≤ 395 (deutlich unter 400-Limit)
