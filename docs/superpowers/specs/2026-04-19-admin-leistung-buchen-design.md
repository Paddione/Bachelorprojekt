# Admin: Leistung für Nutzer buchen

**Datum:** 2026-04-19  
**Status:** Approved

## Zusammenfassung

Admin kann im Client-Detail-Tab und auf der Termine-Seite manuell eine Leistungsbuchung für einen Nutzer anlegen. Die Buchung landet als `inbox_items`-Eintrag (type: `booking`) mit Bestätigungs-E-Mail an den Client — identisch zur normalen Portal-Buchung, aber vom Admin initiiert.

## Architektur & Datenfluss

```
AdminBookingModal.svelte
  ├── Props: clientEmail, clientName, projects[]
  ├── GET /api/calendar/slots       (vorhanden — freie Slots)
  ├── GET /api/leistungen           (vorhanden — Leistungskategorien)
  └── POST /api/admin/bookings/create  (neu)
        ├── isAdmin() Guard → 403
        ├── Slot-Whitelist-Check (identisch zu /api/booking.ts)
        ├── createInboxItem({ type: 'booking', payload: { ...felder, adminCreated: true } })
        ├── Bestätigungs-E-Mail → clientEmail
        └── Notification-E-Mail → CONTACT_EMAIL
```

### Einstiegspunkte

| Seite | Einstieg | Client-Auswahl |
|-------|----------|----------------|
| `/admin/[clientId]` | Neuer Tab "Leistung buchen" | Vorbelegt aus URL |
| `/admin/termine` | Button "＋ Manuelle Buchung" oben rechts | Dropdown aller Keycloak-User mit E-Mail |

## Neue Dateien

- `website/src/components/admin/AdminBookingModal.svelte` — Modal-Komponente
- `website/src/pages/api/admin/bookings/create.ts` — API-Endpoint

## Geänderte Dateien

- `website/src/pages/admin/[clientId].astro` — neuer Tab "Leistung buchen"
- `website/src/pages/admin/termine.astro` — Button + Modal-Integration

## UI-Spezifikation

Modal folgt dem Muster von `CreateInvoiceModal.svelte` (dunkles Theme, Gold-Akzente).

```
[ Leistung buchen für: {clientName} ]

  Typ          [Dropdown: Erstgespräch / Meeting / Termin vor Ort / Rückruf]
  Leistung     [Dropdown: Kategorie → Service-Key]
  Projekt      [Dropdown: aus projects[], optional]

  --- wenn nicht Rückruf ---
  Datum        [Kalender-Picker → lädt Slots für gewählten Tag]
  Uhrzeit      [Slot-Buttons: 10:00 | 11:00 | 14:00 …]

  --- wenn Rückruf ---
  Telefon      [Text-Input]

  Nachricht    [Textarea, optional]

  [Abbrechen]  [Buchung anlegen →]
```

## API-Spezifikation

```
POST /api/admin/bookings/create
Authorization: Admin-Session (Cookie)

Body (JSON):
{
  clientEmail:  string        // Pflicht
  clientName:   string        // Pflicht
  type:         'erstgespraech' | 'callback' | 'meeting' | 'termin'  // Pflicht
  leistungKey:  string        // Pflicht
  projectId:    string | null // Optional
  slotStart:    string | null // ISO — Pflicht außer bei callback
  slotEnd:      string | null
  slotDisplay:  string | null
  date:         string | null // YYYY-MM-DD
  phone:        string | null // Pflicht bei callback
  message:      string | null
}

Responses:
  200  { success: true }
  400  { error: string }   — Validierungsfehler oder Slot nicht verfügbar
  401  { error: 'Unauthorized' }
  403  { error: 'Forbidden' }
  500  { error: string }
```

### Payload-Erweiterung

`adminCreated: true` wird im `inbox_items.payload` gesetzt. Bestehende Items ohne das Feld sind unberührt. Die Inbox kann damit optional "Admin-Buchung" als Badge anzeigen.

## Wiederverwendete Teile (keine Änderung)

- `isSlotWhitelisted()` — Slot-Validierung
- `createInboxItem()` — Inbox-Eintrag
- `sendEmail()` — E-Mail-Versand
- `/api/calendar/slots` — Slot-Abfrage
- `/api/leistungen` — Leistungskatalog

## Nicht im Scope

- CalDAV-Termin direkt anlegen (bleibt beim normalen Bestätigungs-Flow über Inbox)
- Buchung im Namen eines nicht-registrierten Nutzers
- Rückgängig-Funktion für Admin-Buchungen
