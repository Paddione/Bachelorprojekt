<div class="page-hero">
  <span class="page-hero-icon">📊</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Projektmanagement-Admin</div>
    <p class="page-hero-desc">Admin-Panel für Projekte, Teilprojekte und Aufgaben je Brand und Kunde. Buchungen, Termine und Nutzerverwaltung mit Keycloak OIDC.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Website &amp; Admin</span>
      <span class="page-hero-tag">OIDC-gesichert</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Projektmanagement-Admin

Das Admin-Panel unter `/admin/projekte` erlaubt die Verwaltung von Projekten, Teilprojekten
und Aufgaben je Brand und Kunde. Zugriff erfordert eine Admin-Rolle (Keycloak OIDC).

---

## Zugriff

| Brand | URL |
|-------|-----|
| mentolder | https://web.mentolder.de/admin/projekte |
| korczewski | https://web.korczewski.de/admin/projekte |
| Lokal | http://web.localhost/admin/projekte |

Berechtigung: Keycloak-Rolle `admin` oder `workspace-admin`. Ohne Login → Weiterleitung auf Keycloak SSO.

---

## Datenmodell

```
Kunde (customers)
 └── Projekt (projects)          brand-spezifisch
      ├── Teilprojekt (sub_projects)
      │    └── Aufgabe (project_tasks)
      └── Aufgabe (project_tasks)    direkt im Projekt
```

Aufgaben koennen einem Projekt direkt oder ueber ein Teilprojekt zugeordnet sein (`sub_project_id IS NULL` = direkt).

### Status-Lifecycle

`entwurf` → `wartend` → `geplant` → `aktiv` → `erledigt` → `archiviert`

### Prioritaeten

`hoch` | `mittel` | `niedrig`

---

## Funktionen

| Funktion | Beschreibung |
|---------|-------------|
| Projektliste | Alle Projekte des aktuellen Brands, sortiert nach Status und Faelligkeitsdatum |
| Filter | Nach Status, Prioritaet, Freitext (Name/Beschreibung) |
| Gantt-Diagramm | Zeitleiste aller terminierten Projekte (Start- bis Faelligkeitsdatum) |
| Statistik-Karten | Gesamt / Aktiv / Ueberfaellig / Erledigt |
| Anlegen | Projekt, Teilprojekt oder Aufgabe erstellen |
| Bearbeiten | Inline-Formular zum Aendern aller Felder |
| Loeschen | Projekt/Teilprojekt (kaskadiert auf Unterelemente) oder einzelne Aufgabe |
| Export | CSV-Export aller Projekte (`/api/admin/projekte/export`) |

---

## API-Routen

Alle Routen sind serverseitig mit Session-Pruefung und Admin-Rollencheck gesichert.

### Projekte

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/projekte/create` | POST | `{ name, brand, status, priority, customerId?, ... }` | Projekt anlegen |
| `/api/admin/projekte/update` | PUT | `{ id, ...felder }` | Projekt aendern |
| `/api/admin/projekte/delete` | DELETE | `?id=<uuid>` | Projekt loeschen (kaskadiert) |
| `/api/admin/projekte/export` | GET | `?brand=<brand>` | CSV-Export |

### Teilprojekte

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/subprojekte/create` | POST | `{ projectId, name, status, priority, ... }` | Teilprojekt anlegen |
| `/api/admin/subprojekte/update` | PUT | `{ id, ...felder }` | Teilprojekt aendern |
| `/api/admin/subprojekte/delete` | DELETE | `?id=<uuid>` | Teilprojekt loeschen |

### Aufgaben

| Route | Methode | Body / Parameter | Funktion |
|-------|---------|------------------|---------|
| `/api/admin/projekttasks/create` | POST | `{ projectId, subProjectId?, name, status, priority, ... }` | Aufgabe anlegen |
| `/api/admin/projekttasks/update` | PUT | `{ id, ...felder }` | Aufgabe aendern |
| `/api/admin/projekttasks/delete` | DELETE | `?id=<uuid>` | Aufgabe loeschen |

---

## Datenbankschema

Tabellen: `projects`, `sub_projects`, `project_tasks` — alle in der `website`-Datenbank.
Werden per `CREATE TABLE IF NOT EXISTS` beim ersten API-Aufruf angelegt.

Vollstaendiges Schema: [Datenbankmodelle → Projektmanagement](database.md#projektmanagement)

---

## Fehlerbehebung

**Seite zeigt "Datenbankfehler":**
```bash
task workspace:psql -- website
# Pruefen ob Tabellen existieren:
\dt projects
\dt sub_projects
\dt project_tasks
```

**403 / Weiterleitung auf /admin:**
- Keycloak-Rolle `admin` fehlt → im Keycloak Admin-Console zuweisen
- Session abgelaufen → erneut einloggen

**Projekt wird nicht gespeichert (API-Fehler):**
```bash
task workspace:logs -- website
```
