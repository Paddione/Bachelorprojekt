# Slot-Whitelist für Terminbuchung

**Ticket:** BR-20260415-d4be  
**Datum:** 2026-04-16  
**Status:** Approved

## Zusammenfassung

Der Admin muss Terminslots explizit freigeben, bevor Kunden sie buchen können (Whitelist-Modell). Slots werden weiterhin automatisch aus Nextcloud CalDAV + Arbeitszeitkonfiguration generiert, sind aber standardmäßig nicht buchbar. Wenn ein CalDAV-Eintrag mit einem freigegebenen Slot kollidiert, wird der Slot automatisch aus der Buchungsansicht entfernt (CalDAV hat Vorrang).

## Datenschicht

### Neue Tabelle `slot_whitelist`

```sql
CREATE TABLE IF NOT EXISTS slot_whitelist (
  brand      TEXT        NOT NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end   TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brand, slot_start)
);
```

### Neue Funktionen in `website/src/lib/website-db.ts`

- `getWhitelistedSlots(brand: string): Promise<{slot_start: Date, slot_end: Date}[]>` — alle Whitelist-Einträge ab jetzt
- `addSlotToWhitelist(brand: string, start: Date, end: Date): Promise<void>` — Slot freigeben
- `removeSlotFromWhitelist(brand: string, start: Date): Promise<void>` — Freigabe zurückziehen
- `isSlotWhitelisted(brand: string, start: Date): Promise<boolean>` — Einzelprüfung

### Änderung an `getAvailableSlots()` in `website/src/lib/caldav.ts`

Signatur: `getAvailableSlots(fromDate?: Date, brand?: string): Promise<DaySlots[]>`

- Ohne `brand`: Verhalten wie heute (alle konfliktfreien Slots) → für Admin-Ansicht
- Mit `brand`: Nur Slots zurückgeben die **sowohl** whitelisted **als auch** konfliktfrei sind → für öffentliche API und Buchungsformular

## API-Layer

### `POST /api/admin/slots/whitelist`

```
Body: { slotStart: string (ISO8601), slotEnd: string (ISO8601) }
Auth: Admin-Session erforderlich
Response: 200 OK | 401 | 400
```

Ruft `addSlotToWhitelist(brand, start, end)`.

### `DELETE /api/admin/slots/whitelist`

```
Body: { slotStart: string (ISO8601) }
Auth: Admin-Session erforderlich
Response: 200 OK | 401 | 400
```

Ruft `removeSlotFromWhitelist(brand, start)`.

### Änderung an `POST /api/booking.ts`

Vor dem Akzeptieren einer Buchung: `isSlotWhitelisted(brand, slotStart)` prüfen. Wenn nicht freigegeben → `400` mit Fehlermeldung "Dieser Termin ist leider nicht mehr verfügbar."

`brand` kommt aus `process.env.BRAND_NAME` (konsistent mit restlichem Code).

## Admin-UI (`website/src/pages/admin/termine.astro`)

- Server-seitig: Sowohl alle generierten Slots als auch alle Whitelist-Einträge werden beim Rendern geladen. Jeder Slot kennt seinen Freigabe-Status ohne extra Client-Request.
- **Nicht freigegebener Slot**: Ausgegraut, Button "Freigeben" (ruft POST-Endpoint)
- **Freigegebener Slot**: Gold-Styling, Button "×" (ruft DELETE-Endpoint)
- Toggle per `fetch()` + DOM-Update ohne Full-Page-Reload
- Header-Statistik: *"X generiert · Y freigegeben"* statt *"X verfügbar"*
- Kein Svelte nötig — Inline-Script reicht

## Nicht in Scope

- Ablauf-Automatisierung für alte Whitelist-Einträge (veraltete Einträge werden durch `slot_start < now()` Filter in `getWhitelistedSlots` ignoriert)
- Batch-Freigabe ganzer Tage/Wochen
- Whitelist/Blacklist-Modus-Umschalter
