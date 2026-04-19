# Design: Leistung + Stundensatz + Terminbuchung

**Datum:** 2026-04-19
**Ansatz:** A — JSONB-Erweiterung

## Überblick

Drei zusammenhängende Erweiterungen:
1. Leistungen bekommen einen numerischen Stundensatz (admin-pflegbar)
2. Zeiteinträge verknüpfen eine Leistung und frieren den Stundensatz ein
3. Terminbuchungen (Admin + Kundenportal) verknüpfen Leistung + Projekt atomar

---

## 1. Datenmodell

### `LeistungService` (config/types.ts)

Neues optionales Feld:

```typescript
stundensatz_cents?: number  // z.B. 6000 = 60 €/Std.
```

Optional für Rückwärtskompatibilität mit bestehenden Configs ohne Migration.

### `time_entries` Tabelle

Zwei neue Spalten:

```sql
leistung_key      TEXT,     -- z.B. "digital-cafe-einzel"
stundensatz_cents INTEGER   -- eingefroren bei Buchung, z.B. 6000 = 60 €
```

Beide nullable — bestehende Einträge ohne Leistung bleiben gültig.

### `booking_project_links` Tabelle

Eine neue Spalte:

```sql
leistung_key TEXT           -- welche Leistung wurde für diesen Termin gebucht
```

---

## 2. Admin — Stundensatz pflegen

**Wo:** Bestehendes Leistungen-Admin-UI

**Änderung:** Jede `LeistungService`-Zeile erhält ein numerisches Eingabefeld "Stundensatz (€/Std.)".

- Eingabe in Euro (z.B. `60`), Speicherung intern als Cents (`6000`)
- Gespeichert über den bestehenden `leistungen_config`-JSONB-Endpunkt
- Anzeige: `"60 € / Std."` neben dem Service-Namen in der UI

Kein neuer API-Endpunkt — der bestehende Config-Save-Flow wird erweitert.

---

## 3. Zeiterfassung — Leistung & Stundensatz

**Wo:** `/admin/zeiterfassung` — Zeiterfassungs-Formular

### Neue Felder im Formular

| Feld | Verhalten |
|------|-----------|
| **Leistung** | Dropdown, Optionen aus `getEffectiveLeistungen()`, nach Kategorie gruppiert |
| **Stundensatz** | Numerisch, wird bei Leistungsauswahl automatisch befüllt — manuell überschreibbar |

### Speicherverhalten

Beim Speichern eines Zeiteintrags werden `leistung_key` und `stundensatz_cents` auf dem Eintrag eingefroren. Spätere Änderungen am Leistungs-Stundensatz haben keinen Einfluss auf bestehende Einträge.

### Anzeige in der Übersicht

- Neue Spalte "Stundensatz" in der Zeiterfassungstabelle
- Neue Spalte "Betrag" pro Eintrag: `minutes / 60 × stundensatz_cents / 100`
- Gesamtsumme (abrechenbar) am Tabellenende

---

## 4. Terminbuchung — Leistung & Projekt

### 4a. Admin-Flow (`/admin/termine`)

Beim Erstellen oder Bestätigen eines Termins: zwei neue optionale Felder:

- **Projekt** — Dropdown aller aktiven Projekte
- **Leistung** — Dropdown aller Leistungen

Beide werden beim Speichern in `booking_project_links` mit `leistung_key` eingetragen.

Die CalDAV-Terminbeschreibung wird um Projekt- und Leistungsname ergänzt.

### 4b. Kundenportal-Flow (`BookingForm.svelte`)

Nur wenn eingeloggt: zwei neue optionale Felder im Buchungsformular:

- **Für welches Projekt?** — Dropdown der eigenen Projekte (via `/api/portal/projects`)
- **Welche Leistung?** — Dropdown aller Leistungen (via `getEffectiveLeistungen()`)

Der POST an `/api/booking` nimmt `project_id` und `leistung_key` entgegen und schreibt beide sofort in `booking_project_links` — kein nachträglicher Admin-Schritt mehr nötig.

Der CalDAV-Termin wird wie bisher erstellt. Leistung und Projekt erscheinen in der Terminbeschreibung.

---

## 5. Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/config/types.ts` | `stundensatz_cents?` zu `LeistungService` |
| `src/lib/website-db.ts` | Migration: neue Spalten `time_entries`, `booking_project_links`; DB-Funktionen erweitern |
| `src/pages/api/admin/zeiterfassung/create.ts` | `leistung_key` + `stundensatz_cents` verarbeiten |
| `src/pages/admin/zeiterfassung.astro` | Leistung-Dropdown + Stundensatz-Feld + Betragsspalte |
| `src/pages/admin/termine.astro` | Projekt + Leistung bei Terminbestätigung |
| `src/pages/api/booking.ts` | `project_id` + `leistung_key` entgegennehmen, in `booking_project_links` schreiben |
| `src/components/BookingForm.svelte` | Projekt + Leistung Dropdowns (nur eingeloggt) |
| `src/pages/api/portal/projects.ts` | Neuer Endpunkt: Projekte des eingeloggten Kunden |

---

## 6. Nicht im Scope

- Stundensatz pro Projekt überschreiben (global pro Leistung reicht)
- Automatische Rechnungserstellung aus Zeiteinträgen
- Kunden können gebuchte Termine nachträglich ändern/stornieren
- Wiederkehrende Buchungen
