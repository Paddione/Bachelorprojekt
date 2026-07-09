# Implementation Plan: Coaching-Studio-Dashboard — echte Sessions-Daten statt Platzhalter

## Ticket: T001659

## Beschreibung
Das Coaching Studio Dashboard (website/public/coaching-studio/) verwendet aktuell nur Platzhalterdaten. Ziel ist es, echte Sessions aus der Datenbank zu laden und dynamisch im Dashboard anzuzeigen.

## Changes

### 1. API Endpunkt für Coaching Sessions (`/api/admin/coaching/sessions`)
- Route: `GET /api/admin/coaching/sessions`
- Liest Sessions aus der DB (coaching_sessions, coaching_customers, coaching_profiles)
- Aggregiert Daten pro Kunde mit Sessions und Profilen
- Filterung nach Status (aktiv/pausiert/fertig)

### 2. Datenbank Migrations (`db/migrations/XXXX_add_coaching_real_data.sql`)
- Erstelle Views/Tabeln für Coaching-Sessions-Daten, falls noch nicht existierend
- Migration der bestehenden Platzhalter zu echten Daten

### 3. Dashboard Integration
- Ersetze `window.CUSTOMERS = []` durch API-Aufruf im data.jsx
- Lade echte Sessions-Daten beim Start
- Implementiere Fallback für leere Daten (wie aktuell)

## Tasks

1. **API: Coaching-Sessions Endpunkt erstellen**
   - Route `/api/admin/coaching/sessions` implementieren
   - DB-Abfrage für coaching_customers JOIN coaching_sessions
   - Aggregation nach Kunden

2. **Datenbank: Schema prüfen und erweitern**
   - Prüfung ob coaching_* Tabellen existieren
   - Falls nein: Migration erstellen

3. **Dashboard: Echte Daten integrieren**
   - data.jsx: Fetch API-Kalled beim Mount
   - CUSTOMERS mit echten Daten füllen
   - Fallback beibehalten für Testzwecke

4. **Tests schreiben**
   - Unit-Test für API Endpunkt (Mock DB)
   - E2E-Test: Dashboard zeigt echte Daten an

## Dependencies
- T001XXX: Coaching-Schema in Datenbank vorhanden
- Keine

## Acceptance Criteria
- ✅ Dashboard lädt echte Sessions-Daten statt Platzhalter
- ✅ API `/api/admin/coaching/sessions` existiert und funktioniert
- ✅ Fallback für leere DB vorhanden