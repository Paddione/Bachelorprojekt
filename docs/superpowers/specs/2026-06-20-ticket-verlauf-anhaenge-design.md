---
title: "Ticket-Detail: Verlauf ausklappen + Anhänge/Fragebögen/Plan herunterladen"
date: 2026-06-20
slug: ticket-verlauf-anhaenge
ticket_id: null
plan_ref: null
status: draft
domains: [admin, website]
---

# Design-Spec: Ticket-Detail Downloads & Verlauf-Collapse

## Warum

Die Admin-Ticket-Detailseite (`/admin/tickets/[id]`) hat vier fehlende Interaktionen:

1. **Verlauf** zeigt alle Einträge sofort vollständig — bei aktiven Tickets wächst die Timeline
   auf 20–50 Einträge und dominiert die Seite. Es gibt kein Collapse.
2. **Anhänge** werden nur aufgelistet (Dateiname, MIME-Typ, Größe) — kein Download-Link.
   Die Daten liegen als `data_url` (Base64) in der DB und sind nie abrufbar.
3. **Fragebögen** (Grilling-Antworten, `coaching-sessions-v1`) können nicht exportiert werden.
   Der Stepper ist nur eine Eingabe-UI; was einmal gespeichert wurde, bleibt unsichtbar exportiert.
4. **Spec/Plan** ist hinter einem `<details>` angezeigt, aber nicht downloadbar.
   Entwickler wollen das Markdown für Offline-Review oder Archiv.

## Was

### Feature A — Verlauf-Collapse in `TicketActivityTimeline.svelte`
- Neue Prop `initialCount: number = 5`
- Standard: nur die jüngsten 5 Einträge sichtbar (reverse-chronologisch oben = neueste)
- Footer-Button "Alle X Einträge anzeigen" → expanded-State; Button wechselt zu "Weniger anzeigen"
- `$state<boolean>` für expanded, kein serverseitiger Roundtrip
- Budget: 149/500 → +~20 Zeilen zulässig ✓

### Feature B — `TicketAttachmentsPanel.svelte` (neu, ersetzt Astro-Block)
Extrahiert aus `[id].astro` (aktuell ~45 Zeilen: Anhänge-Div + Upload-Dialog + Script):
- Props: `attachments`, `ticketId`
- Zeigt Anhang-Liste mit Download-`<a href="/api/admin/tickets/{ticketId}/attachments/{id}">` + `download`-Attribut
- Beinhaltet Upload-Button + Dialog (der bisherige Inline-JS-Block)
- `[id].astro` ersetzt den gesamten Block durch eine Zeile: `<TicketAttachmentsPanel client:load ... />`
- Netto-Effekt auf `[id].astro`: −45 Zeilen (Budget von 2 auf ~47 erhöht) ✓

### Feature C — `GET /api/admin/tickets/[id]/attachments/[aid].ts` (neu)
- Auth-Guard: Admin-Session required
- DB: `SELECT data_url, filename, mime_type FROM tickets.ticket_attachments WHERE id=$1 AND ticket_id=$2`
- DB-Abfrage **inline im Endpoint** (kein Umweg über `admin.ts`, Budget dort=0)
- Response: Base64-dekodiert → Binary-Response mit `Content-Disposition: attachment; filename="..."` und korrektem MIME-Type
- Fehler: 404 wenn nicht gefunden, 403 bei fehlendem Recht

### Feature D — Fragebögen-Export in `GrillingStepper.svelte`
- Neuer "Export" Button im Stepper-Header (nur sichtbar wenn `answers` nicht leer)
- Client-side: serialisiert alle Fragen + Antworten als formatierten Text (Markdown-ähnlich)
- Browser-Download via `URL.createObjectURL(blob)` + temporärer `<a>`-Klick
- Kein neuer API-Endpoint nötig — Daten sind bereits im Svelte-State
- Format: `# Grilling: coaching-sessions-v1\n\n## <Sektionsname>\n**<Frage>**\n<Antwort>\n`
- Budget: `GrillingStepper.svelte` muss gecheckt werden

### Feature E — Plan-Download in `TicketPlanPanel.svelte`
- Neue Prop `planContent: string` (raw Markdown, ergänzend zu `renderedHtml`)
- Download-Button im Panel-Header (neben "Plan-Inhalt anzeigen")
- Client-side via Blob → `text/markdown` MIME, Dateiname `plan-{slug}.md`
- `[id].astro` übergibt zusätzlich `planContent={containerPlan?.content ?? ''}`
- Budget: `TicketPlanPanel.svelte` hat 22 Zeilen, Limit 500 → Budget 478 ✓

## Architektur-Entscheidungen

**Warum client-side für Fragebögen und Plan-Export?**  
Die Daten sind bereits auf der Seite vorhanden (Svelte-State bzw. Props). Ein Server-Roundtrip
würde Latenz und einen neuen Endpoint kosten, ohne Mehrwert zu liefern. Browser-Blob-Downloads
sind hier die richtige Ebene.

**Warum neuer API-Endpoint für Anhänge?**  
Anhänge werden als `data_url` in der DB gespeichert (v1; Nextcloud für v1.5 geplant). Das
Astro-SSR-HTML liefert nur Metadaten (`hasDataUrl`, nicht den Inhalt selbst). Ein dedizierter
GET-Endpoint ist nötig, damit `<a download>` funktioniert.

**Warum `[id].astro` nicht direkt erweitern?**  
Die Datei hat 398/400 Zeilen (Budget=2). Jede Erweiterung dort würde CI blockieren.
Die Extraktion des Anhänge-Blocks in `TicketAttachmentsPanel.svelte` löst das Budget-Problem
strukturell und ist ohnehin die sauberere Kapselung (Upload + Liste + Download in einer Komponente).

## Acceptance-Kriterien

1. `TicketActivityTimeline`: Default 5 Einträge, Button zeigt `X Einträge` an, Klick expandiert alle
2. Anhang-Download: `GET /api/admin/tickets/{id}/attachments/{aid}` liefert Binary mit korrektem MIME
3. Anhang-Download: Klick auf Dateiname in Anhänge-Panel startet Browser-Download
4. Anhang-Upload: weiterhin funktional (nicht regriert)
5. Fragebögen-Export: Button "Export" in GrillingStepper-Header, erzeugt `.txt`-Download
6. Plan-Download: Button in TicketPlanPanel, erzeugt `plan-{slug}.md`-Download
7. `[id].astro` bleibt ≤395 Zeilen (Puffer 5 für Folge-PRs)
8. Keine S2-Import-Zyklen: neue API-Endpoints importieren nicht aus `TicketAttachmentsPanel`
9. `task test:all` grün; `task freshness:check` grün

## Betroffene Dateien

| Datei | Aktion | Ist-Zeilen | Wirk. Schwelle | Budget |
|-------|--------|-----------|---------------|--------|
| `website/src/components/admin/TicketActivityTimeline.svelte` | Modify | 149 | 500 (nicht-baselined) | +351 |
| `website/src/components/admin/TicketAttachmentsPanel.svelte` | Create (neu) | 0 | 500 | <150 Ziel |
| `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts` | Create (neu) | 0 | 600 | <80 Ziel |
| `website/src/pages/admin/tickets/[id].astro` | Modify (−45 eff.) | 398 | 400 (nicht-baselined) | −45 netto |
| `website/src/components/admin/GrillingStepper.svelte` | Modify | 116 | 500 (nicht-baselined) | +384 |
| `website/src/components/admin/TicketPlanPanel.svelte` | Modify | 22 | 500 | +478 |
| `website/src/lib/tickets/admin.ts` | **NICHT anfassen** | 677 | 677 (baselined) | **Budget=0** — DB-Helper inline in API-Endpoint |
