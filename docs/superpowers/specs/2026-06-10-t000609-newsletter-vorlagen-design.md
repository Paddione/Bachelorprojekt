# Spec: Newsletter-Vorlagen-Bibliothek (T000609)

**Datum:** 2026-06-10  
**Ticket:** T000609  
**Branch:** feature/t000609-newsletter-vorlagen  
**Status:** staged

---

## Problemstellung

Der aktuelle Newsletter-Composer (`NewsletterAdmin.svelte`, Tab „Neue Kampagne") bietet nur ein leeres HTML-Textarea und einen Beispieltext als Einstieg. Wiederkehrende Strukturen — standardisierter Header-Block, Angebots-Sektionen, CTA-Button, Footer-Abschlusstext — müssen jedes Mal neu getippt werden. Es gibt keine Möglichkeit, häufig verwendete Blöcke zu speichern, zu benennen und beim Schreiben einer neuen Kampagne einzufügen.

---

## Lösung: Wiederverwendbare Inhaltsblöcke (Vorlagenbibliothek)

Statt einem vollständigen Template-System (das ganze Kampagnen speichert) werden granulare **Inhaltsblöcke** eingeführt — benannte HTML-Schnipsel, die in einen Draft eingefügt werden können. Das ist weniger komplex als ein "ganzes Layout als Template" und flexibler (man kann mehrere Blöcke kombinieren).

### Block-Typen (vordefiniert, nicht erweiterbar in V1)

| Typ | Bezeichnung | Zweck |
|-----|-------------|-------|
| `header` | Kopfzeile | Überschrift + Unterzeile für den Newsletter-Anfang |
| `angebot` | Angebots-Sektion | Titel + kurze Beschreibung + Preis/CTA |
| `cta` | Call-to-Action | Prominenter Button-Block |
| `text` | Textblock | Freitext-Abschnitt |
| `footer` | Abschluss | Signatur / Verabschiedungstext |

Der Block-Typ bestimmt das **Starter-HTML** beim Neu-Erstellen, ist aber nur ein Label — der HTML-Inhalt ist frei editierbar.

---

## Datenmodell

### Neue Tabelle: `newsletter_content_blocks`

Wird in `newsletter-db.ts` via `ensureTables()` angelegt (kein dediziertes SQL-Migrations-File nötig — Muster wie `newsletter_campaigns`).

```sql
CREATE TABLE IF NOT EXISTS newsletter_content_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  block_type  TEXT NOT NULL DEFAULT 'text',
  html_body   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Kein Fremdschlüssel auf `newsletter_campaigns` — Blöcke sind unabhängige Bibliotheks-Einträge.

---

## TypeScript-Typen (Erweiterung in `newsletter-db.ts`)

```typescript
export type NewsletterBlockType = 'header' | 'angebot' | 'cta' | 'text' | 'footer';

export interface NewsletterContentBlock {
  id: string;
  title: string;
  block_type: NewsletterBlockType;
  html_body: string;
  created_at: Date;
  updated_at: Date;
}
```

### CRUD-Funktionen (neu in `newsletter-db.ts`)

- `listContentBlocks(): Promise<NewsletterContentBlock[]>`
- `getContentBlock(id): Promise<NewsletterContentBlock | null>`
- `createContentBlock(params: { title, block_type, html_body }): Promise<NewsletterContentBlock>`
- `updateContentBlock(id, params: { title?, block_type?, html_body? }): Promise<NewsletterContentBlock | null>`
- `deleteContentBlock(id): Promise<void>`

---

## API-Endpunkte

### `/api/admin/newsletter/blocks/index.ts`
- `GET` → `listContentBlocks()` (auth: isAdmin)
- `POST` → `createContentBlock(...)` (Validierung: title + html_body nicht leer)

### `/api/admin/newsletter/blocks/[id].ts`
- `PUT` → `updateContentBlock(id, ...)` (nur title/block_type/html_body)
- `DELETE` → `deleteContentBlock(id)` (kein Rückfragepflicht in API)

---

## UI: NewsletterAdmin.svelte — Erweiterung

### Neuer 4. Tab: „Vorlagen"

Der Tab-Balken wird um einen vierten Eintrag erweitert:

```
Abonnenten | Kampagnen | Neue Kampagne | Vorlagen
```

Der `Vorlagen`-Tab rendert die neue Komponente **`NewsletterBlockLibrary.svelte`**.

### `NewsletterBlockLibrary.svelte`

Neue Datei: `website/src/components/admin/NewsletterBlockLibrary.svelte`

**Layout:**
- Linke Spalte: Liste aller gespeicherten Blöcke (Titel + Badge für Typ), darunter „+ Neuer Block"-Button
- Rechte Spalte: Editor für den selektierten Block (HtmlEditor + Typ-Picker + Titel-Input)

**Verhalten:**
- Klick auf einen Block in der Liste → Ladeformular rechts
- „Speichern" → PUT zu `[id].ts`
- „Löschen" → Bestätigungs-Inline (identisches Pattern wie in `NewsletterAdmin` für Subscriber-Löschung)
- „+ Neuer Block" → öffnet leeres Formular mit Typ-Auswahl; POST nach Bestätigung
- Beim Erstellen: je nach gewähltem `block_type` wird ein Starter-HTML vorausgefüllt (Konstante im Frontend, kein Server-Round-Trip)

### Starter-HTML-Konstantem (im Frontend)

```typescript
const BLOCK_STARTERS: Record<NewsletterBlockType, string> = {
  header: `<h1 style="color:#333;font-family:Georgia,serif;">Betreff-Zeile</h1>
<p style="color:#666;font-family:sans-serif;">Willkommens-/Intro-Satz.</p>`,
  angebot: `<div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin:16px 0;">
  <h2 style="color:#333;font-family:sans-serif;margin:0 0 8px;">Angebots-Titel</h2>
  <p style="color:#555;font-family:sans-serif;font-size:15px;">Kurze Beschreibung des Angebots.</p>
  <p style="font-family:sans-serif;"><strong>Preis: 0 €</strong></p>
</div>`,
  cta: `<div style="text-align:center;margin:24px 0;">
  <a href="https://LINK" style="background:#b8973a;color:#fff;padding:12px 28px;border-radius:6px;font-family:sans-serif;font-weight:bold;text-decoration:none;display:inline-block;">
    Jetzt buchen
  </a>
</div>`,
  text: `<p style="color:#555;font-family:sans-serif;font-size:16px;line-height:1.6;">
  Ihr Text hier.
</p>`,
  footer: `<p style="color:#888;font-family:sans-serif;font-size:14px;margin-top:32px;">
  Mit freundlichen Grüßen,<br>
  <strong>Ihr Name</strong>
</p>`,
};
```

### Einfügen in Compose-Tab

Im `compose`-Tab wird ein **„Block einfügen"-Button** neben dem HtmlEditor ergänzt. Ein kleines Overlay/Dropdown zeigt die Bibliothek (Titelzeilen + Typ-Badge). Klick auf einen Block appended sein `html_body` an den aktuellen `composeHtml`.

**Exakter Einfügemechanismus:** `composeHtml += '\n' + block.html_body` — kein Cursor-positioniertes Einfügen (zu komplex für V1, HtmlEditor ist ein `<textarea>`).

---

## Abgrenzung V1 / Out-of-scope

| Feature | V1? |
|---------|-----|
| Block-Typen benutzerdefiniert erweiterbar | Nein |
| Drag-and-Drop Reihenfolge der Blöcke in Kampagne | Nein |
| WYSIWYG-Editor statt Raw-HTML | Nein |
| Blöcke mehrsprachig | Nein |
| Block-Vorschau im Bibliotheks-Tab | Ja (kleiner inline iframe, identisch zu Compose-Preview) |
| Blöcke beim Kampagnen-Erstellen in Reihenfolge wählen (Composer-Assistent) | Nein |

---

## Test-Strategie

- Unit-Tests: `newsletter-db.test.ts` oder eigene `newsletter-blocks-db.test.ts` — CRUD-Funktionen mit pg-mem (Muster von coaching-templates-db.test.ts)
- **Kein E2E-Test in V1** (keine kritische Benutzerreise betroffen, BATS-Test nur für API-Endpunkt-Existenz in `tests/`)

---

## Playwright-Projekt

Kein neuer Playwright-Test nötig (keine kritische Nutzer-Journey; Feature ist admin-only und build-only). Falls in V2 hinzugefügt: Projekt `admin` (mentolder-brand, auth: admin).

---

## Dateien, die geändert werden

| Datei | Art |
|-------|-----|
| `website/src/lib/newsletter-db.ts` | Erweitert (Tabelle + CRUD-Funktionen) |
| `website/src/lib/newsletter-db.test.ts` oder neues `newsletter-blocks-db.test.ts` | Neu/Erweitert |
| `website/src/pages/api/admin/newsletter/blocks/index.ts` | Neu |
| `website/src/pages/api/admin/newsletter/blocks/[id].ts` | Neu |
| `website/src/components/admin/NewsletterBlockLibrary.svelte` | Neu |
| `website/src/components/admin/NewsletterAdmin.svelte` | Erweitert (neuer Tab + Einfügen-Button) |

**Nicht berührt:** `k3d/`, `scripts/factory/`, `brett/`, `newsletter-template.ts`, alle anderen Admin-Komponenten.

---

## Risiken / Entscheidungen

1. **`ensureTables()`-Muster vs. echte Migration:** Dieses Repo nutzt bisher das `ensureTables()`-Muster (lazy CREATE TABLE IF NOT EXISTS). Für Konsistenz mit `newsletter-db.ts` wird dasselbe Muster verwendet. Kein separates `.sql`-Migrations-File nötig.

2. **Append-only Einfügen:** Das Einfügen von Blöcken in den Compose-Tab ist bewusst simpel (append). Eine cursor-aware Einfügung würde einen Rich-Text-Editor oder CodeMirror erfordern — nicht verhältnismäßig für dieses Feature.

3. **Block-Typen als `TEXT` in DB:** Kein ENUM, damit spätere V2-Typen ohne `ALTER TYPE` hinzugefügt werden können.
