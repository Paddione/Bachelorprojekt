# Auth auf GET /api/admin/coaching/sessions & Datenleck beheben

## Purpose
Sicherheitslücken schließen:
1. GET /api/admin/coaching/sessions hat keine Admin-Auth — jeder kann Coaching-Sessions einsehen
2. window.__COACHING_CUSTOMERS__ exponiert sensible Kundendaten global im Browser (Datenleck)

## Requirements
1. **API-Auth**: GET /api/admin/coaching/sessions muss isAdmin() prüfen und Auth-Fehler (403/401) zurückgeben
2. **Data Leak fix**: window.__COACHING_CUSTOMERS__ entfernen → Daten nur via API laden, nicht global exponieren
3. **Client-Side fix**: data.jsx darf keine window-Variable schreiben — lokale Variable verwenden

## Scenarios
### GIVEN: Admin besucht /api/admin/coaching/sessions
WHEN: Cookie enthält gültige Admin-Session
THEN: Admin erhält Sessions-Daten (200)

### GIVEN: Nicht-admin versucht GET /api/admin/coaching/sessions  
WHEN: Keine/ungültige Session im Cookie
THEN: 403 Forbidden oder leeres Array mit Fehler-Log

### GIVEN: Coaching Studio lädt Daten aus data.jsx  
WHEN: API Endpoint existiert
THEN: Kunden-Daten werden sicher über API geladen, nicht global exponiert
