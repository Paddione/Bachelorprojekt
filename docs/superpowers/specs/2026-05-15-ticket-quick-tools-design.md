# Ticket Quick Tools — Design Spec
**Datum:** 2026-05-15  
**Branch:** feature/ticket-quick-tools  
**Status:** Genehmigt

---

## Überblick

Zwei bestehende Floating-Widgets werden zu fokussierten Ticket-Werkzeugen umgebaut:

| Alt | Neu | Zweck |
|-----|-----|-------|
| `BugReportWidget.svelte` | `TicketQuickCreate.svelte` | Ticket schnell anlegen (alle Typen) |
| `HelpPanel.svelte` | `TicketQuickEdit.svelte` | Ticket suchen und inline bearbeiten |

Beide Widgets bleiben kontextsensitiv (Admin vs. Portal) und teilen denselben physischen Bereich in der unteren rechten Ecke — jedoch **nebeneinander**, nicht übereinander.

---

## 1. Positionierung & Buttons

Beide Buttons sitzen horizontal nebeneinander, `fixed bottom-6 right-6`, `z-40`:

```
[ ✏️ ]  [ + Ticket erstellen ]
```

- **Quick Create** (rechts, primär): goldener Pill-Button mit Label `+ Ticket erstellen` — identisch zur bisherigen Optik des BugReportWidget
- **Quick Edit** (links davon, sekundär): runder indigo Button (40×40 px, `#4f46e5`) mit Stift-Icon (✏️), kein Label
- Abstand zwischen den Buttons: `gap-2` (8 px)
- Im Portal: Quick-Create-Button zeigt `Fehler melden` (eingeschränkter Scope), Quick-Edit-Button zeigt nur Kommentar-Modus

**Migration:** `HelpPanel`-Button wird entfernt (war `bottom-5.5rem right-6`). Beide Buttons kommen aus einem neuen Wrapper-Component `TicketWidgetBar.astro` der in `AdminLayout.astro` und `PortalLayout.astro` eingebunden wird.

---

## 2. TicketQuickCreate — Modal

### Admin-Kontext

Ruft `POST /api/admin/tickets` auf.

**Formularfelder:**
| Feld | Typ | Pflicht | Default |
|------|-----|---------|---------|
| Typ | Dropdown (bug/feature/task/project) | ja | bug |
| Titel | Text input | ja | — |
| Beschreibung | Textarea (max. 2000 Z.) | nein | — |
| Priorität | Radio/Toggle: hoch / mittel / niedrig | ja | mittel |
| Komponente | Text input (Freitext) | nein | — |

Nach Erfolg: Modal zeigt 2 Sek. `Ticket T000xxx angelegt` mit Link zur Detail-Seite, schließt sich dann automatisch. Escape / Klick außerhalb schließt das Modal (wenn nicht submitting).

### Portal-Kontext

Ruft `POST /api/bug-report` auf (unveränderte API). Formular identisch zum aktuellen BugReportWidget:
- E-Mail (Pflicht), Kategorie (Dropdown), Beschreibung, Screenshots (bis 3, je 5 MB)

Nur Button-Position und -Stil ändern sich (Wrapper-Component).

### Fehlerbehandlung
- Validierung client-seitig vor Submit
- Server-Fehler werden inline im Modal angezeigt
- Rate-Limit (429) zeigt spezifische Meldung

---

## 3. TicketQuickEdit — Slide-over Panel

Panel öffnet von rechts (320 px breit, Fullwidth auf Mobile), `z-62`.

### Admin-Kontext

**Header-Bereich:**
- Suchfeld: akzeptiert Ticket-ID (`T000xxx`) oder Stichwort (min. 2 Zeichen)
- Suche trifft `GET /api/admin/tickets?q=...&limit=5` (debounced 300 ms)
- Darunter: "Zuletzt aktualisiert" — 5 offene Tickets automatisch geladen beim Panel-Öffnen via `GET /api/admin/tickets?status=open&limit=5`

**Ticket-Ansicht (nach Auswahl):**

Kompakter Header: `[Typ-Badge] T000xxx — Titel` + "← Zurück"-Link zur Liste

Direkt bearbeitbare Felder:
| Feld | UI | API |
|------|----|-----|
| Status | Dropdown mit allen gültigen Zuständen | `POST /api/admin/tickets/:id/transition` |
| Priorität | 3-Way-Toggle: hoch / mittel / niedrig | `PATCH /api/admin/tickets/:id` |
| Komponente | Text input | `PATCH /api/admin/tickets/:id` |
| Notizen | Textarea (internes Feld, max. 1000 Z.) | `PATCH /api/admin/tickets/:id` |

*Assignee ist kein Quick-Edit-Feld* — setzt eine UUID-Auflösung via Kunden-Lookup voraus; bleibt der Detail-Seite vorbehalten.

**Speicher-Verhalten:**
- `onblur` pro Feld: sofort PATCH/Transition, Spinner im Feld, "✓" Bestätigung inline
- Panel-Close (`beforeClose`-Hook): falls ein Feld fokussiert ist, wird erst gespeichert, dann Panel geschlossen
- Fehler beim Speichern: roter Inline-Hinweis, Feld bleibt editierbar

**Statusübergänge:** Nicht alle Status sind von jedem Zustand aus erlaubbar — die Dropdown-Optionen werden serverseitig durch die `transitionTicket()`-Logik validiert. Client zeigt alle Optionen, Server lehnt ungültige Transitionen mit 400 ab.

### Portal-Kontext

Kein Suchfeld, keine Ticket-Liste. Stattdessen:

- Label: "Feedback zu einer Meldung?"
- Optionales Feld: Ticket-ID (Format `T######`)  
- Kommentar-Textarea (Pflicht, max. 1000 Z.)
- Submit: `POST /api/tickets/comment` (neuer public Endpunkt, rate-limited)
  - Body: `{ ticketId?: string, comment: string, source: 'portal' }`
  - Wenn `ticketId` gesetzt: fügt Kommentar mit `visibility: 'public'` hinzu
  - Wenn kein `ticketId`: legt Feedback-Ticket vom Typ `task` an

---

## 4. Neue Dateien & geänderte Dateien

### Neue Dateien
| Datei | Zweck |
|-------|-------|
| `website/src/components/TicketQuickCreate.svelte` | Neues Create-Widget (ersetzt BugReportWidget) |
| `website/src/components/TicketQuickEdit.svelte` | Neues Edit-Widget (ersetzt HelpPanel) |
| `website/src/components/TicketWidgetBar.astro` | Wrapper: positioniert beide Buttons nebeneinander |
| `website/src/pages/api/tickets/comment.ts` | Neuer public Kommentar-Endpunkt für Portal-Context |

### Geänderte Dateien
| Datei | Änderung |
|-------|---------|
| `website/src/layouts/AdminLayout.astro` | BugReportWidget + HelpPanel → TicketWidgetBar |
| `website/src/layouts/PortalLayout.astro` | HelpPanel → TicketWidgetBar |
| `website/src/pages/stripe/success.astro` | BugReportWidget → TicketQuickCreate (portal-Kontext) |

### Beibehaltene Dateien (keine Änderung)
- `website/src/pages/api/bug-report.ts` — bleibt unverändert (Portal-Pfad)
- `website/src/pages/api/admin/tickets/` — bleibt unverändert
- `website/src/lib/helpContent.ts` — wird nicht mehr referenziert, kann später gelöscht werden

---

## 5. Datenbankänderungen

Keine Schema-Änderungen. Der neue public Kommentar-Endpunkt nutzt die bestehende `tickets.comments`-Tabelle (via `transitionTicket` mit `note`-Parameter, `visibility: 'public'`).

---

## 6. Fehler & Edge Cases

- **Ticket nicht gefunden** (Suche): "Kein Ticket gefunden" Inline-Meldung, kein Fehler-State
- **Ungültige Transition**: Server gibt 400 zurück → Inline-Fehler, Dropdown zurückgesetzt zum vorherigen Wert
- **Netzwerkfehler beim Autosave**: Feld markiert sich rot, Retry-Button erscheint
- **Portal ohne Ticket-ID**: Feedback wird als neues Task-Ticket angelegt, kein Fehler

---

## 7. Testing

- Bestehende E2E-Tests für Bug-Meldung (`FA-*`) müssen weiterhin grün bleiben — die Portal-API ist unverändert
- Neue Unit-Tests: Quick-Create-Validierung (alle Typen, Pflichtfelder)
- Manueller Smoke-Test: Quick-Edit Statusübergang im Admin
