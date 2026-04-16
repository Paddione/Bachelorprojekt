# Design: Admin-Sidebar + Website-Content-Management

**Datum:** 2026-04-16  
**Branch:** feature/admin-termine-usermanagement  
**Status:** Approved

---

## Ziel

Den Admin-Bereich der Mentolder-Website so umbauen, dass:

1. Die Navigation vollständig in eine persistente **Sidebar** wandert (kein Kachel-Dashboard mehr).
2. Alle bisher hardcoded Website-Inhalte (`mentolder.ts`) über den Admin editierbar werden.
3. Die Sidebar Website-Bereiche als eigene Gruppe "Website" unterhalb der bestehenden "Betrieb"-Gruppe zeigt.

---

## Architektur

### AdminLayout.astro (neu)

Ersetzt `Layout.astro` auf **allen** Admin-Seiten (`/admin`, `/admin/bugs`, `/admin/termine`, `/admin/angebote`, usw.).

Struktur:
```
┌─────────────────────────────────────────────────┐
│  Sidebar (180px fix)  │  Hauptinhalt (flex:1)   │
│                       │                          │
│  Admin                │  <slot />                │
│  ─────────────────    │                          │
│  Übersicht            │                          │
│    📊 Dashboard       │                          │
│                       │                          │
│  Betrieb              │                          │
│    🐛 Bugs            │                          │
│    📅 Termine         │                          │
│    👥 Clients         │                          │
│    💬 Mattermost      │                          │
│    📋 Projekte        │                          │
│    ⏱️ Zeiterfassung   │                          │
│    💶 Rechnungen      │                          │
│    🔔 Follow-ups      │                          │
│    🗓️ Kalender        │                          │
│                       │                          │
│  Website              │                          │
│    🏠 Startseite      │                          │
│    🙋 Über mich       │                          │
│    🛍️ Angebote        │                          │
│    ❓ FAQ             │                          │
│    ✉️ Kontakt         │                          │
│    🏆 Referenzen      │                          │
│    ⚖️ Rechtliches     │                          │
└─────────────────────────────────────────────────┘
```

- Aktiver Eintrag: goldfarben hervorgehoben, anhand `Astro.url.pathname` ermittelt.
- Bestehende "← Zurück"-Buttons auf allen Admin-Seiten werden entfernt.
- Das Kachel-Grid auf `/admin` fällt weg; der KPI-Banner bleibt.
- Mobile: Sidebar kollabiert zu einem Hamburger-Menü (optional, kann später kommen).

### Datenspeicherung

Alle neuen Inhalte nutzen die bestehende `site_settings`-Tabelle (`brand`, `key`, `value TEXT`). Werte werden als JSON-Strings gespeichert.

| key | Typ | Inhalt |
|-----|-----|--------|
| `homepage` | JSON | `{hero: {title, subtitle, tagline}, stats, servicesHeadline, servicesSubheadline, whyMeHeadline, whyMeIntro, whyMePoints, quote, quoteName}` |
| `uebermich` | JSON | `{pageHeadline, subheadline, introParagraphs, sections, milestones, notDoing, privateText}` |
| `faq` | JSON | `[{question, answer}, …]` |
| `kontakt` | JSON | `{intro, sidebarTitle, sidebarText, sidebarCta, showPhone}` |

Die statische Config in `mentolder.ts` bleibt als **Fallback**: DB-Wert schlägt Config-Wert, identisch zum bestehenden Muster bei Services/Leistungen.

### Neue DB-Funktionen in `website-db.ts`

```typescript
getHomepageContent(brand): Promise<HomepageOverride | null>
saveHomepageContent(brand, data): Promise<void>

getUebermichContent(brand): Promise<UebermichOverride | null>
saveUebermichContent(brand, data): Promise<void>

getFaqContent(brand): Promise<FaqItem[] | null>
saveFaqContent(brand, items): Promise<void>

getKontaktContent(brand): Promise<KontaktOverride | null>
saveKontaktContent(brand, data): Promise<void>
```

Alle nutzen intern `getSiteSetting` / `setSiteSetting`.

---

## Neue Admin-Seiten

### `/admin/startseite`

Felder:
- **Hero:** Titel, Untertitel, Tagline
- **Stats:** 4 Einträge mit Wert + Label (fest, kein Hinzufügen/Löschen)
- **Services-Sektion:** Überschrift, Unterüberschrift
- **Warum ich?:** Überschrift, Intro-Text, 3 Punkte (je Titel + Text; iconPath bleibt statisch)
- **Zitat:** Zitat-Text, Zitat-Name

### `/admin/uebermich`

Felder:
- Seiten-Headline, Subheadline
- Intro-Absätze (Textarea, eine pro Block — trennbar durch Leerzeile oder feste Felder)
- Abschnitte: Liste von {Titel, Text}, fest (2 Abschnitte wie im Config)
- Milestones: Liste von {Jahr, Titel, Beschreibung} — Einträge hinzufügen/löschen
- „Was ich nicht mache": Liste von {Titel, Text} — Einträge hinzufügen/löschen
- Privattext (ein Textarea, `{city}` wird weiterhin als Platzhalter unterstützt)

### `/admin/faq`

- Liste von {Frage, Antwort}
- Einträge hinzufügen, löschen, Reihenfolge per Auf-/Ab-Buttons ändern
- Einzelnes globales Formular, ein Speichern-Button

### `/admin/kontakt`

Felder:
- Intro-Text
- Sidebar-Titel
- Sidebar-Text
- Sidebar-CTA (Satz unter dem Formular)
- Toggle: Telefonnummer anzeigen (ja/nein)

---

## Neue API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| POST | `/api/admin/startseite/save` | Speichert `homepage`-JSON in site_settings |
| POST | `/api/admin/uebermich/save` | Speichert `uebermich`-JSON |
| POST | `/api/admin/faq/save` | Speichert `faq`-JSON-Array |
| POST | `/api/admin/kontakt/save` | Speichert `kontakt`-JSON |

Alle Endpunkte: Session-Check → isAdmin-Check → JSON zusammenbauen → `setSiteSetting` → Redirect mit `?saved=1`.

---

## Änderungen an bestehenden Dateien

| Datei | Änderung |
|-------|----------|
| `src/layouts/Layout.astro` | Unverändert (nur für öffentliche Seiten) |
| `src/pages/admin.astro` | Kachel-Grid entfernen, `AdminLayout` verwenden |
| `src/pages/admin/*.astro` | Alle auf `AdminLayout` umstellen, Zurück-Button entfernen |
| `src/pages/index.astro` | `getHomepageContent` aus DB mergen |
| `src/pages/ueber-mich.astro` | `getUebermichContent` aus DB mergen |
| `src/components/FAQ.svelte` | Unverändert |
| `src/lib/website-db.ts` | 8 neue Funktionen |
| `src/lib/content.ts` | `getEffectiveFaq`, `getEffectiveKontakt`, `getEffectiveHomepage`, `getEffectiveUebermich` |

---

## Nicht im Scope

- Mobile-Sidebar (Hamburger-Menü) — optional, später
- WYSIWYG-Editor für HTML-Felder (Rechtliches bleibt Textarea)
- Drag-and-drop Sortierung für FAQ/Milestones (Auf-/Ab-Buttons reichen)
- Änderungen an `korczewski.ts` (nur mentolder wird betroffen)
- Authentifizierungsänderungen
