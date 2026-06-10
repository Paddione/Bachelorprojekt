# Content-Hub UX Overhaul — Design Spec
**Datum:** 2026-06-10  
**Branch:** feature/content-hub-ux-overhaul  
**Ticket:** (wird nach Planung angelegt)

---

## Ziel

Der Content-Hub (`/admin/inhalte`) hat vier konkrete Probleme:

1. **Website-Tab unbrauchbar**: Zwei horizontale Tab-Reihen (14+ Abschnitte) — unübersichtlich, schwer navigierbar.
2. **Kein HTML-Editor mit Vorschau**: Newsletter-Compose und Vertrags-Editor nutzen einfache Textareas ohne gleichzeitige Vorschau.
3. **Newsletter zeigt keine Daten**: Erste Öffnung zeigt leere Liste ohne konkretes Beispiel zum Testen.
4. **Verträge/Rechnungen komplett kaputt**: `documents-db.ts` hat kein `ensureTables()` — der `document_templates`-Table fehlt in frischen Dev-Umgebungen → 500-Fehler auf allen Vertrags-Endpunkten.

---

## Design

### 1. Website-Tab — Linke Sidebar-Navigation

**Aktuell:** Zwei horizontale Tab-Reihen (primäre Tabs + sekundäre Sektions-Tabs mit Scroll).

**Neu:** Zweigeteiltes Layout innerhalb des Website-Tabs:
- **Linke Sidebar** (feste Breite ~180px): Vertikale Liste aller Abschnitte, gruppiert in Kategorien.
- **Rechter Inhaltsbereich**: Nimmt den restlichen horizontalen Platz ein.

**Sidebar-Kategorien:**
- SEO & Struktur: SEO, Stammdaten, Navigation, Footer
- Hauptseiten: Startseite, Über mich, Angebote, FAQ, Kontakt, Referenzen
- Services: Coaching, Führung & Pers., 50+ digital, KI-Transition, Beratung
- Rechtliches: Rechtliches
- Custom ★: Benutzerdefinierte Abschnitte (mit Neu-Button am Ende)

**Suche:** Kleines Suchfeld oben in der Sidebar — filtert die Liste live. Enter springt zum ersten Treffer.

**Aktiver Abschnitt:** Goldener Left-Border + heller Hintergrund.

**Implementierung:** `InhalteEditor.svelte` — das `{#if activeTab === 'website'}` Layout wird umgebaut. Die sekundäre horizontale Tab-Reihe entfällt komplett.

---

### 2. HTML-Editor-Komponente (`HtmlEditor.svelte`)

Neue wiederverwendbare Svelte-Komponente für alle HTML-Bearbeitungsfelder.

**Props:**
```typescript
{
  value: string;               // gebundener HTML-Inhalt
  previewMode: 'direct' | 'server';  // direct = srcdoc, server = API-Call
  previewUrl?: string;         // nur bei previewMode='server'
  previewBody?: () => object;  // Payload-Builder für Server-Preview
  placeholder?: string;
  rows?: number;               // Editor-Höhe (default: 20)
  label?: string;
}
```

**Layout:**
- **Toggle-Buttons** (oben rechts): `✏️ Editor` / `⬜ Split` / `👁 Vorschau`
- **Split-Modus (Standard):** 50% Textarea links, 50% iframe rechts
- **Editor-Modus:** Textarea in voller Breite, iframe versteckt
- **Vorschau-Modus:** iframe in voller Breite, Textarea versteckt

**Preview-Debounce:** 250ms nach letzter Änderung.

**Einsatzorte:**
- `NewsletterAdmin.svelte` → Compose-Tab (previewMode='server', URL='/api/admin/newsletter/preview')
- `VertragsvorlagenSection.svelte` → Compose-Form (previewMode='direct')

---

### 3. Newsletter — Beispiel-Draft beim ersten Öffnen

**Problem:** Leere Kampagnenliste beim ersten Öffnen — nichts zum Testen.

**Lösung:** Beim Laden des Newsletter-Tabs wird die Kampagnenliste abgerufen. Falls die Liste **leer ist**, wird automatisch ein Beispiel-Draft via POST `/api/admin/newsletter/campaigns` angelegt.

**Beispiel-Inhalt (HTML):** Realistischer mentolder-Newsletter:
- Betreff: `mentolder Newsletter #01 — Führung & digitaler Wandel`
- Inhalt: Branded HTML-E-Mail mit Begrüßung, zwei inhaltlichen Abschnitten (Führungsthema + KI-Transition), CTA-Button, Gruß-Signatur
- Platzhalter `{{AUSGABE}}` eingebaut
- Status: `draft` — wird nicht automatisch versendet

**Trigger:** Nur einmalig pro Component-Mount. Ein lokales `hasSeededExample = $state(false)` verhindert erneutes Seeding wenn der User später alle Kampagnen löscht und zurücknavigiert.

---

### 4. Verträge-Fix — `ensureTables()` in `documents-db.ts`

**Problem:** `documents-db.ts` verbindet sich mit der DB aber erstellt keine Tabellen automatisch. `newsletter-db.ts` hat `ensureTables()` — `documents-db.ts` nicht.

**Lösung:** Analog zu `newsletter-db.ts` eine `ensureTables()` Funktion hinzufügen:

```sql
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  html_body TEXT NOT NULL,
  docuseal_template_id INTEGER,
  stand_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  signature_data JSONB,
  signed_html TEXT,
  signed_pdf BYTEA,
  expires_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at TIMESTAMPTZ
);
```

`ensureTables()` wird beim ersten `listDocumentTemplates()`, `createDocumentTemplate()`, etc. aufgerufen (lazy, mit `tablesReady`-Flag wie in `newsletter-db.ts`).

---

### 5. Rechnungen — Verifizierung

Die `RechnungsvorlagenSection` erhält `initialData` bereits server-seitig (aus `getSiteSetting()`). Sie rendert immer mit Defaults. Der Save-Endpunkt `/api/admin/inhalte/rechnungsvorlagen/save.ts` existiert.

**Kein Code-Änderungsbedarf** — aber die Vorschau-Links öffnen sich in einem neuen Tab (`target="_blank"`). Falls diese 404 liefern, liegt es an fehlenden Daten (kein Breaking-Fix nötig, weil der Tab rendert und speichert).

---

## Dateien die sich ändern

| Datei | Änderung |
|-------|----------|
| `website/src/components/admin/InhalteEditor.svelte` | Sidebar-Layout für Website-Tab |
| `website/src/components/admin/HtmlEditor.svelte` | **NEU** — Split-View HTML-Editor |
| `website/src/components/admin/NewsletterAdmin.svelte` | HtmlEditor einbinden + Beispiel-Draft Seeding |
| `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte` | HtmlEditor einbinden |
| `website/src/lib/documents-db.ts` | `ensureTables()` hinzufügen |

---

## Nicht im Scope

- Monaco Editor / CodeMirror (zu schwer, einfache Textarea + Syntax-Highlighting reicht)
- Rechnungs-Preview-Endpunkte debuggen (separate Arbeit)
- Fragebogen-Tab Redesign
- Mobile-Responsive des Admin-Bereichs
