# Auth auf GET /api/admin/coaching/sessions & Datenleck beheben

## Purpose
Sicherheitslücken schließen:
1. GET /api/admin/coaching/sessions hat keine Admin-Auth — jeder kann Coaching-Sessions einsehen
2. window.__COACHING_CUSTOMERS__ exponiert sensible Kundendaten global im Browser (Datenleck)

## ADDED Requirements
### Requirement: API-Auth
GET /api/admin/coaching/sessions muss isAdmin() prüfen und Auth-Fehler (403/401) zurückgeben

### Requirement: Data Leak fix
window.__COACHING_CUSTOMERS__ entfernen → Daten nur via API laden, nicht global exponieren

### Requirement: Client-Side fix
data.jsx darf keine window-Variable schreiben — lokale Variable verwenden
