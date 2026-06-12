# Spec: Vertrags-PDF-Preview & Download (T000610)

**Datum:** 2026-06-11  
**Ticket:** T000610  
**Branch:** feature/T000610-vertrag-pdf  
**Typ:** feature | **Priorität:** mittel

---

## Kontext & Problem

Das Dokument-/Vertragssystem ist bereits vollständig vorhanden:
- `document_templates` + `document_assignments` in der Website-DB
- Playwright HTML→PDF-Generator (`website/src/lib/signing/pdf-service.ts`)
- Signing-Flow (Kunden signieren über `/api/signing/*`)
- `signed_pdf BYTEA` in `document_assignments` für fertige PDFs

Was fehlt: Admins und Kunden können Verträge weder previewen noch als PDF herunterladen — ohne den vollständigen Signaturprozess abzuschließen. Konkret:

1. **Admin** kann nicht sehen, wie ein Vertragstemplate als PDF aussieht (nur HTML-iframe Preview existiert)
2. **Admin** kann zugewiesene Verträge (pending + completed) nicht als PDF in der Admin-Oberfläche previewen oder herunterladen
3. **Kunde** erhält das PDF nur als Datei-Download, nicht als Inline-Browser-Preview

---

## Ziele (Scope T000610)

### Z1 — Template-PDF-Preview (Admin)
Admin kann ein Vertragtemplate on-the-fly als PDF rendern und im Browser previewen (mit Muster-Platzhaltern).

### Z2 — Assignment-PDF-Preview & Download (Admin)
Admin kann jede Vertragszuweisung (pending UND completed) als PDF previewen und herunterladen. Für `completed`: aus gespeichertem `signed_pdf`; für `pending`: dynamisch aus `signed_html ?? html_body` mit Kunden-Daten substituiert.

### Z3 — Inline-PDF-Viewer (Admin + Portal)
PDF öffnet sich nativ im Browser (browser-built-in PDF viewer), nicht als Datei-Download. Download-Button bleibt zusätzlich erhalten.

### Z4 — Assignments-Übersicht im Admin
Neue Admin-Seite `/admin/dokumente` zeigt alle Zuweisungen mit Status, Kunden-Name, Template-Titel und Aktionen (Preview, Download).

---

## Nicht im Scope

- Kein eigener JavaScript PDF-Viewer (kein PDF.js) — nativer Browser-Viewer genügt
- Kein neues Signing-Flow (existiert bereits)
- Keine Änderungen an `document_templates` Schema
- Kein Export in andere Formate (Word, etc.)
- Keine Massenoperationen (Batch-Download)

---

## Architektur

### Neue API-Endpoints

#### `GET /api/admin/documents/templates/[id]/pdf`
- Auth: Admin-Session erforderlich
- Lädt Template aus DB, substituiert Platzhalter mit Muster-Daten
- Ruft `generatePdf(html)` (Playwright) auf
- Query-Param `?inline=1` → `Content-Disposition: inline; filename="…"` (Browser-Preview)
- Default: `Content-Disposition: attachment` (Download)
- Kein Caching (on-the-fly)

**Muster-Substitution (Template-Preview):**
```
{{KUNDENNAME}} → "Max Mustermann"
{{KUNDENNUMMER}} → "K-001"
{{EMAIL}} → "max@beispiel.de"
{{TELEFON}} → "+49 000 000 0000"
{{FIRMA}} → "Muster GmbH"
{{VORNAME}} → "Max"
{{NACHNAME}} → "Mustermann"
{{DATUM}} → heutiges Datum (DD.MM.YYYY)
{{JAHR}} → aktuelles Jahr
```

#### `GET /api/admin/documents/assignments/[id]/pdf`
- Auth: Admin-Session erforderlich
- Lädt Assignment inkl. Template + Customer-Daten
- Wenn `status = 'completed'` UND `signed_pdf` vorhanden: liefert gespeichertes BYTEA direkt
- Sonst: generiert PDF on-the-fly aus `signed_html ?? html_body` mit echten Kundendaten
- Query-Param `?inline=1` für Browser-Preview
- Logt `pdf_admin_viewed` / `pdf_admin_downloaded` im `signing_audit_log`

### Bestehender Endpoint — Erweiterung

#### `GET /api/portal/documents/[assignmentId]/pdf` (bestehend)
- Ergänze `?inline=1` → `Content-Disposition: inline` für Portal-seitige Browser-Preview
- Nur `completed` bleibt die Voraussetzung (kein Breaking Change)

### Neue Admin-Seite

#### `/admin/dokumente` (umgebaut aus Redirect)
- Astro-Seite: Admin-Auth-Gate
- Svelte-Komponente `DokumenteAdmin.svelte`
- Zeigt: Alle `document_assignments` JOIN `document_templates` JOIN Customer-Namen
- Spalten: Kunden-Name, Template-Titel, Status-Badge, Datum, Aktionen
- Aktionen pro Zeile:
  - **Vorschau** → öffnet PDF in neuem Tab (`?inline=1`)
  - **Download** → lädt PDF herunter (kein `inline`)
- Filterbar nach Status (pending / completed / expired / revoked)
- Pagination (20 pro Seite)

### Bestehende Admin-Seite — Erweiterung

#### `DokumentEditor.svelte` — Template-Preview erweitern
- Neben dem bestehenden HTML-iframe-Preview: Button **"Als PDF previewen"**
- Öffnet `/api/admin/documents/templates/[id]/pdf?inline=1` in neuem Tab
- Nur sichtbar wenn Template gespeichert (id vorhanden)

---

## Datenfluss

```
Admin klickt "PDF Vorschau" (Template)
  → GET /api/admin/documents/templates/[id]/pdf?inline=1
  → documents-db: getDocumentTemplate(id)
  → substituteTemplatePlaceholders(html, MOCK_VARS)
  → generatePdf(html)  [Playwright]
  → Response: Content-Type: application/pdf, inline

Admin klickt "PDF Vorschau" (Assignment, pending)
  → GET /api/admin/documents/assignments/[id]/pdf?inline=1
  → documents-db: getDocumentAssignmentById(id) + getCustomerVars(customer_id)
  → html = assignment.signed_html ?? template.html_body
  → substituteTemplateVars(html, customerVars)
  → generatePdf(html)
  → audit_log: pdf_admin_viewed
  → Response: inline PDF

Admin klickt "PDF Vorschau" (Assignment, completed)
  → GET /api/admin/documents/assignments/[id]/pdf?inline=1
  → documents-db: getAssignmentPdf(id)  [liefert BYTEA]
  → audit_log: pdf_admin_viewed
  → Response: inline PDF (gespeichertes Signed-PDF)
```

---

## DB-Änderungen

### Neue Audit-Events
`signing_audit_log.event` erhält zwei neue Werte (keine Schema-Änderung, TEXT-Feld):
- `pdf_admin_viewed` — Admin hat PDF im Browser geöffnet
- `pdf_admin_downloaded` — Admin hat PDF heruntergeladen

### Customer-Daten für Substitution
Für `getCustomerVars(customer_id)` — liest aus `customers`-Tabelle + Keycloak-User. Falls Keycloak-Live-Lookup aufwändig: Fallback auf gespeicherte `profile_*`-Felder in der `customers`-Tabelle (existing pattern).

---

## UI-Patterns (WEBSITE-STANDARDS-konform)

- Farb-Palette: `bg-dark`, `text-cream`, `border-dark-lighter`, Gold-Akzente für Primär-Buttons
- Status-Badges: `pending` = gelb, `completed` = grün, `expired` = rot, `revoked` = grau
- PDF-Preview-Modal: Kein Modal nötig — neuer Browser-Tab (`target="_blank"`) ist UX-Standard für PDFs
- Pagination-Komponente: `PaginationControls` (sofern vorhanden) oder einfache Prev/Next-Buttons

---

## Sicherheit

- Alle neuen Admin-Endpoints: `isAdmin(session)` Gate (identisch zu anderen Admin-APIs)
- Audit-Log für alle PDF-Zugriffe (Admin + Portal)
- Kein unautorisierter Zugriff auf `signed_pdf` möglich
- Template-PDFs enthalten nur Muster-Daten — kein Datenleck möglich

---

## Playwright-Verfügbarkeit

`pdf-service.ts` nutzt einen singleton Browser-Prozess. On-the-fly-Generierung für Template-Preview ist teuer (~500ms). Akzeptabel für Admin-only Usage. Kein Queueing nötig im MVP.

---

## Test-Strategie

- **BATS/Unit:** `getAssignmentPdf()`, `substituteTemplatePlaceholders()` isoliert testen
- **Playwright E2E (optional):** Admin-Login → `/admin/dokumente` → PDF-Preview-Button klickt → neuer Tab mit PDF
- **Playwright-Projekt:** `admin` (mentolder-admin-user)

---

## Offene Fragen (entschieden)

| Frage | Entscheidung |
|-------|-------------|
| PDF.js oder nativer Browser-Viewer? | Nativ — kein Mehrwert durch PDF.js im Admin |
| Signed-PDF neu rendern oder BYTEA direkt? | BYTEA direkt (bereits vorhanden, Signature enthalten) |
| Kunden-Daten für pending Assignment? | Aus customers-Tabelle (profile_*-Felder) + Keycloak-Profil-Fallback |
| Caching? | Nein — Admin-Use ist selten, on-the-fly ist OK |
| Separate `/admin/dokumente`-Seite oder Tab in inhalte? | Separate Seite (bestehende dokumente.astro ausbauen statt Redirect) |
| Pagination? | 20 Einträge/Seite — einfach und ausreichend |
