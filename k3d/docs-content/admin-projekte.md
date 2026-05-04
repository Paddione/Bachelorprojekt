# Projektmanagement-Admin

Das Admin-Panel unter `/admin/projekte` verwaltet Projekte, Teilprojekte und Aufgaben je Brand und Kunde. Der Zugriff erfordert eine Admin-Rolle (Single Sign-On über Keycloak).

---

## Zugriff

| Brand | URL |
|-------|-----|
| mentolder | `https://web.mentolder.de/admin/projekte` |
| korczewski | `https://web.korczewski.de/admin/projekte` |

> Entwicklungsumgebung: `http://web.localhost/admin/projekte` (lokales k3d).

Berechtigung: Workspace-Konto in der Gruppe `workspace-admins`. Ohne Login wirst Du auf Keycloak SSO weitergeleitet.

---

## Datenmodell

```
Kunde (customers)
 └── Projekt (projects)            brandspezifisch
      ├── Teilprojekt (sub_projects)
      │    └── Aufgabe (project_tasks)
      └── Aufgabe (project_tasks)  direkt im Projekt
```

Aufgaben können einem Projekt direkt oder über ein Teilprojekt zugeordnet sein (`sub_project_id IS NULL` = direkt).

### Status-Lifecycle

`entwurf` → `wartend` → `geplant` → `aktiv` → `erledigt` → `archiviert`

### Prioritäten

`hoch` | `mittel` | `niedrig`

---

## Funktionen

| Funktion | Beschreibung |
|---------|-------------|
| Projektliste | Alle Projekte des aktuellen Brands, sortiert nach Status und Fälligkeitsdatum |
| Filter | Nach Status, Priorität, Freitext (Name/Beschreibung) |
| Gantt-Diagramm | Zeitleiste aller terminierten Projekte (Start- bis Fälligkeitsdatum) |
| Statistik-Karten | Gesamt / Aktiv / Überfällig / Erledigt |
| Anlegen | Projekt, Teilprojekt oder Aufgabe erstellen |
| Bearbeiten | Inline-Formular zum Ändern aller Felder |
| Löschen | Projekt/Teilprojekt (kaskadiert auf Unterelemente) oder einzelne Aufgabe |
| Export | CSV-Export aller Projekte (`/api/admin/projekte/export`) |

---

## API-Routen

Alle Routen sind serverseitig mit Session-Prüfung und Admin-Rollencheck gesichert.

### Projekte

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/projekte/create` | POST | `{ name, brand, status, priority, customerId?, ... }` | Projekt anlegen |
| `/api/admin/projekte/update` | PUT | `{ id, ...felder }` | Projekt ändern |
| `/api/admin/projekte/delete` | DELETE | `?id=<uuid>` | Projekt löschen (kaskadiert) |
| `/api/admin/projekte/export` | GET | `?brand=<brand>` | CSV-Export |

### Teilprojekte

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/subprojekte/create` | POST | `{ projectId, name, status, priority, ... }` | Teilprojekt anlegen |
| `/api/admin/subprojekte/update` | PUT | `{ id, ...felder }` | Teilprojekt ändern |
| `/api/admin/subprojekte/delete` | DELETE | `?id=<uuid>` | Teilprojekt löschen |

### Aufgaben

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/projekttasks/create` | POST | `{ projectId, subProjectId?, name, status, priority, ... }` | Aufgabe anlegen |
| `/api/admin/projekttasks/update` | PUT | `{ id, ...felder }` | Aufgabe ändern |
| `/api/admin/projekttasks/delete` | DELETE | `?id=<uuid>` | Aufgabe löschen |

---

## Datenbankschema

Tabellen: `projects`, `sub_projects`, `project_tasks` — alle in der `website`-Datenbank. Sie werden per `CREATE TABLE IF NOT EXISTS` beim ersten API-Aufruf angelegt.

Vollständiges Schema: [Datenbankmodelle → Projektmanagement](database.md#projektmanagement)

---

## Fehlerbehebung

**Seite zeigt „Datenbankfehler":**
```bash
task workspace:psql -- website
# Prüfen, ob die Tabellen existieren:
\dt projects
\dt sub_projects
\dt project_tasks
```

**403 / Weiterleitung auf /admin:**
- Gruppe `workspace-admins` fehlt → in der Keycloak Admin-Console zuweisen
- Session abgelaufen → erneut einloggen

**Projekt wird nicht gespeichert (API-Fehler):**
```bash
task workspace:logs -- website
```
