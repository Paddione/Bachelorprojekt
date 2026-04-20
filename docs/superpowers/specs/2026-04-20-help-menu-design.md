# Help Menu — Design Spec

**Date:** 2026-04-20
**Scope:** Kontextsensitives Hilfemenü für Portal (Kundenkontext) und Admin (Staffkontext)

---

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Format | Slide-over Panel (von rechts) |
| Trigger | Floating `?`-Button, fixiert links unten |
| Inhalt | Kontextsensitiv — wechselt je nach aktiver Sektion |
| Struktur | Kurze Sektionsbeschreibung + klappbare Schritt-für-Schritt-Anleitungen |
| Architektur | Eine gemeinsame `HelpPanel.svelte` Komponente |

---

## Architektur

### Neue Dateien

**`website/src/components/HelpPanel.svelte`**
- Slide-over Panel, slides von rechts ein (`transform: translateX`)
- Props: `section: string`, `context: 'portal' | 'admin'`
- Liest Content aus `helpContent.ts` anhand von `context + section`
- Struktur pro Sektion:
  - Titel + Icon
  - Kurze Beschreibung (1–2 Sätze)
  - Liste „Was kann ich hier tun?" (Bullet-Punkte)
  - Klappbare Anleitungen (`<details>`/`<summary>`) für die 2–4 wichtigsten Aufgaben
- Schließen via ✕-Button oder Klick auf Backdrop
- Transition: 200ms ease-out

**`website/src/lib/helpContent.ts`**
- Zentrales Content-Objekt: `helpContent['portal']['nachrichten']`, `helpContent['admin']['clients']` etc.
- Typ: `Record<'portal'|'admin', Record<string, HelpSection>>`
- `HelpSection`: `{ title, description, actions: string[], guides: { title, steps: string[] }[] }`

### Geänderte Dateien

**`website/src/layouts/PortalLayout.astro`**
- Importiert `HelpPanel.svelte`
- Übergibt `section={section}` (kommt bereits als Prop) und `context="portal"`
- Fügt Floating-Button (fixiert, links unten, `z-index: 50`) hinzu
- Button toggle via Svelte store oder einfaches `bind:open`

**`website/src/layouts/AdminLayout.astro`**
- Importiert `HelpPanel.svelte`
- Leitet aktive Route (`path`) auf Sektion ab (z.B. `/admin/clients` → `clients`, `/admin` → `dashboard`)
- Übergibt `section` + `context="admin"`
- Gleiches Floating-Button-Muster wie Portal

---

## Portal-Sektionen & Inhalt

| Sektion | Beschreibung | Aktionen | Anleitungen |
|---|---|---|---|
| `overview` | Dein persönliches Dashboard | Nächste Termine einsehen, offene Rechnungen, Nachrichten lesen | — |
| `nachrichten` | Direktkommunikation mit deinem Coach | Nachricht senden, Datei anhängen, Raum wechseln | Erste Nachricht senden, Datei hochladen |
| `besprechungen` | Aufzeichnungen vergangener Meetings | Aufzeichnung abspielen, Transkript lesen | — |
| `dateien` | Geteilte Dokumente & Uploads | Datei hochladen, herunterladen, Ordner navigieren | Datei hochladen |
| `unterschriften` | Ausstehende Signaturdokumente | Dokument lesen, Unterschrift leisten | Dokument unterschreiben |
| `termine` | Deine Coaching-Sitzungen | Termin buchen, absagen, Erinnerung setzen | Neuen Termin buchen, Termin absagen |
| `rechnungen` | Rechnungen & Zahlungen | Rechnung herunterladen, online bezahlen, Status prüfen | Rechnung bezahlen |
| `projekte` | Gemeinsame Projektzusammenarbeit | Projekt-Status einsehen, Aufgaben kommentieren | — |
| `onboarding` | Einrichtungs-Checkliste | Schritt abhaken, Fortschritt sehen | Onboarding abschließen |
| `dienste` | Zugang zu externen Tools | Nextcloud öffnen, Wiki, Vaultwarden | Nextcloud aufrufen |
| `konto` | Kontoeinstellungen & Datenschutz | Passwort ändern, E-Mail ändern, Konto löschen | Passwort ändern |

---

## Admin-Sektionen & Inhalt

| Sektion | Beschreibung | Aktionen | Anleitungen |
|---|---|---|---|
| `dashboard` | KPI-Übersicht & offene Aufgaben | Bugs, Projekte, Follow-ups im Blick behalten | — |
| `bugs` | Fehlerberichte verwalten | Bug erstellen, Status ändern, archivieren | Bug lösen |
| `meetings` | Besprechungen transkribieren | Meeting erstellen, Transkript hochladen, finalisieren | Meeting transkribieren |
| `termine` | Terminverwaltung | Termin anlegen, bearbeiten, absagen | Termin für Klienten buchen |
| `clients` | Kundenverwaltung | Klient anlegen, bearbeiten, Passwort zurücksetzen | Neuen Klienten anlegen |
| `projekte` | Projektverwaltung | Projekt erstellen, Teilprojekte, Status setzen | Projekt anlegen |
| `zeiterfassung` | Zeiterfassung | Stunden erfassen, Bericht exportieren | Zeit erfassen |
| `rechnungen` | Rechnungen & Angebote | Rechnung erstellen, senden, als bezahlt markieren | Rechnung erstellen |
| `followups` | Wiedervorlagen | Follow-up erstellen, erledigen | Follow-up anlegen |
| `newsletter` | Newsletter-Kampagnen | Kampagne erstellen, Vorschau, versenden | Newsletter versenden |
| `kalender` | Kalenderansicht | Verfügbarkeit prüfen, Slots verwalten | — |
| `monitoring` | Systemgesundheit | Services prüfen, Deployment-Status lesen | — |
| `inbox` | E-Mail-Posteingang | Nachrichten lesen, beantworten, archivieren | — |
| `einstellungen/*` | Systemkonfiguration | Benachrichtigungen, E-Mail, Rechnungen, Branding | — |

---

## Floating Button

- Position: `fixed; bottom: 1.5rem; left: 1.5rem; z-index: 50`
- Größe: 40×40px, `border-radius: 50%`
- Farbe: `bg-indigo-600` (passend zu bestehender Brand-Farbe `#4f46e5`)
- Icon: `?` (geschlossen) → `✕` (geöffnet)
- Box-shadow: `0 2px 8px rgba(79,70,229,.4)`
- Kein Label-Text (Icon reicht, da Kontext klar)

---

## Panel-Layout

```
┌─────────────────────────────┐
│ Hilfe                    ✕  │  ← Header, sticky
├─────────────────────────────│
│ 💬 Nachrichten              │  ← Sektion-Titel + Icon
│ Kommuniziere direkt mit     │
│ deinem Coach.               │  ← Kurze Beschreibung
├─────────────────────────────│
│ WAS KANN ICH HIER TUN?      │  ← Uppercase-Label
│ ✦ Nachricht senden          │
│ ✦ Datei anhängen            │
│ ✦ Raum wechseln             │
├─────────────────────────────│
│ ANLEITUNGEN                 │  ← Uppercase-Label
│ ▶ Erste Nachricht senden    │  ← <details>/<summary>
│   1. Klicke auf das ...     │     (ausgeklappt)
│   2. Tippe deine ...        │
│ ▶ Datei hochladen           │
└─────────────────────────────┘
```

- Panel-Breite: `320px` (Desktop), `100vw` (Mobile < 640px)
- Backdrop: `rgba(0,0,0,0.3)` auf Mobile, keiner auf Desktop
- Scrollbar im Panel wenn Inhalt overflows

---

## Out of Scope

- Suchfunktion im Help-Panel (kann später ergänzt werden)
- Videos/GIFs in Anleitungen
- Mehrsprachigkeit (nur Deutsch)
- Persistenz (ob Panel offen war)
