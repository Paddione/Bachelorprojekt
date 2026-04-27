# Inhalte-Editor — Design Spec

**Datum:** 2026-04-27
**Status:** Approved
**Phase:** 1 (Rechnungen-Tab in Phase 2)

## Ziel

Die bisher verstreute Admin-Inhaltsverwaltung (7 separate Astro-Seiten unter „Website" + „Dokumenteneditor" in der Sidebar) zu einer einzigen schnellen SPA-Oberfläche zusammenführen. Gleichzeitig wird die Grundlage für datenbankgetriebene Custom-Abschnitte gelegt, die der Admin-Nutzer ohne Entwickler-Eingriff hinzufügen kann.

## Kernentscheidungen

1. **Option B** — neue eigenständige „Inhalte"-Sektion, kein Überladen des bestehenden DokumentEditors.
2. **Vier primäre Tabs (Phase 1):** Website | Newsletter | Fragebögen | Verträge. Rechnungen kommt in Phase 2.
3. **Kein Datenabriss** — bestehende Content-Tabellen bleiben unverändert; nur UI (Astro → Svelte) und API-Aufrufart (Form POST → JSON fetch) ändern sich.
4. **URL-State** via `?tab=` und `?section=` — Browser-Back und Direktlinks funktionieren.

---

## Architektur

### Was wegfällt

| Typ | Eintrag |
|-----|---------|
| Sidebar-Einträge | „Dokumenteneditor" (Betrieb), „Website" (System) |
| Astro-Seiten | `/admin/startseite`, `/admin/uebermich`, `/admin/angebote`, `/admin/faq`, `/admin/kontakt`, `/admin/referenzen`, `/admin/rechtliches`, `/admin/dokumente` |
| Komponente | `AdminWebsiteTabs.astro` |

### Was entsteht

| Typ | Eintrag |
|-----|---------|
| Sidebar-Eintrag | „Inhalte" (neue Gruppe) → `/admin/inhalte` |
| Astro-Seite | `src/pages/admin/inhalte.astro` |
| Haupt-Komponente | `src/components/admin/InhalteEditor.svelte` |
| Website-Sub-Komp. | `src/components/admin/inhalte/StartseiteSection.svelte` |
| | `src/components/admin/inhalte/UebermichSection.svelte` |
| | `src/components/admin/inhalte/AngeboteSection.svelte` |
| | `src/components/admin/inhalte/FaqSection.svelte` |
| | `src/components/admin/inhalte/KontaktSection.svelte` |
| | `src/components/admin/inhalte/ReferenzenSection.svelte` |
| | `src/components/admin/inhalte/RechtlichesSection.svelte` |
| | `src/components/admin/inhalte/CustomSection.svelte` |
| API-Endpoints | `src/pages/api/admin/inhalte/custom/index.ts` (GET, POST) |
| | `src/pages/api/admin/inhalte/custom/[slug].ts` (PUT, DELETE) |
| DB-Migration | `website/db/migrations/<next-number>_website_custom_sections.sql` |

### Was geändert wird

| Datei | Änderung |
|-------|----------|
| `src/layouts/AdminLayout.astro` | Neue Gruppe „Inhalte", Website + Dokumenteneditor-Einträge entfernen |
| `src/pages/api/admin/startseite/save.ts` | JSON-Content-Type-Zweig ergänzen |
| `src/pages/api/admin/uebermich/save.ts` | dto. |
| `src/pages/api/admin/angebote/save.ts` | dto. |
| `src/pages/api/admin/faq/save.ts` | dto. |
| `src/pages/api/admin/kontakt/save.ts` | dto. |
| `src/pages/api/admin/referenzen/save.ts` | dto. |
| `src/pages/api/admin/rechtliches/save.ts` | dto. |

### Redirects (alte URLs → neue SPA)

| Alt | Neu |
|-----|-----|
| `/admin/startseite` | `/admin/inhalte?tab=website&section=startseite` |
| `/admin/uebermich` | `/admin/inhalte?tab=website&section=uebermich` |
| `/admin/angebote` | `/admin/inhalte?tab=website&section=angebote` |
| `/admin/faq` | `/admin/inhalte?tab=website&section=faq` |
| `/admin/kontakt` | `/admin/inhalte?tab=website&section=kontakt` |
| `/admin/referenzen` | `/admin/inhalte?tab=website&section=referenzen` |
| `/admin/rechtliches` | `/admin/inhalte?tab=website&section=rechtliches` |
| `/admin/dokumente` | `/admin/inhalte?tab=newsletter` |

---

## Navigation & UX

### Zweistufige Tab-Navigation

**Primäre Tabs** (eine Ebene, immer sichtbar):

| Tab | URL-Wert | Inhalt |
|-----|----------|--------|
| 🌐 Website | `website` | 7 Kern-Abschnitte + Custom-Sections |
| ✉️ Newsletter | `newsletter` | `NewsletterAdmin.svelte` (unverändert eingebettet) |
| 📋 Fragebögen | `fragebogen` | `QuestionnaireTemplateEditor.svelte` (unverändert eingebettet) |
| 📄 Verträge | `vertraege` | Vertragsvorlagen-Logik aus `DokumentEditor.svelte` (unverändert eingebettet) |

**Sekundäre Tabs** (nur unter „Website" sichtbar):

`Startseite | Über mich | Angebote | FAQ | Kontakt | Referenzen | Rechtliches | [Custom-Sections…] | + Abschnitt`

Custom-Sections werden nach den 7 Kern-Tabs per `sort_order` einsortiert und mit ★ markiert.

### URL-State

Die SPA liest `?tab=` und `?section=` beim Mount und schreibt sie bei Wechsel via `history.replaceState` zurück. Gültige Werte:

```
?tab=website&section=startseite    (default)
?tab=website&section=<slug>        (Custom-Section)
?tab=newsletter
?tab=fragebogen
?tab=vertraege
```

URL-State-Werte sind ASCII-only (keine Umlaute), damit `URLSearchParams` keine Encoding-Probleme erzeugt.

### Speichern-Verhalten

Jeder Website-Abschnitt hat seinen eigenen Speichern-Button (kein Auto-Save). Beim Tab-Wechsel mit ungespeicherten Änderungen erscheint ein Browser-`confirm()`-Dialog.

---

## Datenmodell

### Neue Tabelle: `website_custom_sections`

```sql
CREATE TABLE website_custom_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  title       TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  fields      JSONB       NOT NULL DEFAULT '[]',
  content     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

**`fields`** — Schema der Admin-definierten Felder:

```jsonc
[
  { "name": "headline", "label": "Überschrift", "type": "text",     "required": true  },
  { "name": "body",     "label": "Text",        "type": "textarea", "required": false }
]
```

Erlaubte Typen in Phase 1: `text`, `textarea`, `url`. Richtext und Bild-Upload kommen in Phase 2.

**`content`** — gespeicherte Werte:

```jsonc
{ "headline": "Mein Angebot 2026", "body": "Coaching für …" }
```

### API-Erweiterung bestehender Handler

Alle 7 `save.ts`-Handler erkennen den Content-Type und verarbeiten beide Varianten:

```typescript
const isJson = request.headers.get('content-type')?.includes('application/json');
const body = isJson ? await request.json() : Object.fromEntries(await request.formData());
```

Die Astro-Redirect-Seiten (POST-Formulare) und die neuen Svelte-`fetch`-Aufrufe funktionieren damit beide weiter.

### Neue Custom-Section-Endpoints

| Method | Path | Aktion |
|--------|------|--------|
| GET | `/api/admin/inhalte/custom` | Alle Custom-Sections laden |
| POST | `/api/admin/inhalte/custom` | Neue Section erstellen |
| PUT | `/api/admin/inhalte/custom/[slug]` | Felder-Schema oder Content speichern |
| DELETE | `/api/admin/inhalte/custom/[slug]` | Section löschen |

---

## Komponentenstruktur

```
InhalteEditor.svelte
├── activeTab: 'website' | 'newsletter' | 'fragebogen' | 'vertraege'
├── activeSection: string  (slug des aktiven Website-Sub-Tabs)
│
├── [Tab: website]
│   ├── StartseiteSection.svelte   — Initialdata als Prop von inhalte.astro (SSR), speichert via POST (JSON)
│   ├── UebermichSection.svelte
│   ├── AngeboteSection.svelte
│   ├── FaqSection.svelte
│   ├── KontaktSection.svelte
│   ├── ReferenzenSection.svelte
│   ├── RechtlichesSection.svelte
│   └── CustomSection.svelte ×N   — lädt/speichert via /api/admin/inhalte/custom/[slug]
│
├── [Tab: newsletter]
│   └── <NewsletterAdmin />         — unverändert
│
├── [Tab: fragebögen]
│   └── <QuestionnaireTemplateEditor />  — unverändert
│
└── [Tab: verträge]
    └── Vertragsvorlagen-Block       — aus DokumentEditor.svelte extrahiert, unverändert
```

Jede `*Section.svelte`-Komponente ist eigenständig: eigener Speicher-State, eigene Fehlermeldungen. Der Parent (`InhalteEditor`) verwaltet nur Tab/Section-Navigation und URL-State.

### Daten-Lade-Strategie

Die 7 Kern-Abschnitte haben aktuell **keine GET-API-Endpoints** — die Daten werden via SSR-Lib-Funktionen geladen (`getEffectiveHomepage()` etc.). Statt neue GET-Endpoints hinzuzufügen, nutzt `inhalte.astro` dieselben Lib-Funktionen serverseitig und serialisiert alle Initialwerte als JSON-Props an `InhalteEditor`:

```astro
const initialData = {
  startseite: await getEffectiveHomepage(),
  uebermich:  await getUebermich(),
  // …
  customSections: await getCustomSections(),
};
<InhalteEditor initialData={initialData} client:load />
```

Beim Speichern rufen die Svelte-Komponenten die bestehenden POST-Endpoints mit `Content-Type: application/json` auf. Ein Re-Load der Seite nach dem Speichern ist nicht nötig — der lokale State wird mit dem Server-Response-Body aktualisiert.

---

## Build-Reihenfolge

1. **DB-Migration** — `website_custom_sections` anlegen
2. **APIs erweitern** — 7× `save.ts` JSON-Modus + 2× neue Custom-Endpoints
3. **7 Website-Sektions-Komponenten** — Astro-Formularfelder nach Svelte portieren
4. **CustomSection.svelte + Endpoints** — DB-getriebene Custom-Abschnitte
5. **InhalteEditor.svelte** — alles zusammenführen, Tab-Navigation, URL-State
6. **inhalte.astro + AdminLayout.astro** — neue Seite, Sidebar anpassen
7. **Redirects + Cleanup** — 8 alte Seiten umbauen, `AdminWebsiteTabs.astro` löschen

---

## Abgrenzung Phase 2

Folgendes ist explizit **nicht** in Phase 1:

- Rechnungen-Tab (bestehende `/admin/rechnungen`-Seite)
- Richtext-Feldtyp für Custom-Sections
- Bild-Upload-Feldtyp für Custom-Sections
- Drag-and-Drop-Umsortierung von Custom-Sections
