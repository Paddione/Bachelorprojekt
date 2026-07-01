# Proposal: t001359-size03-website-db

_Ticket: T001359_

## Why

`website/src/lib/website-db.ts` hat aktuell 2890 Zeilen und liegt damit nur 110 Zeilen unter dem 3000-Zeilen-Limit (G-SIZE03). Jeder neue DB-Zugriff riskiert den Gate-Bruch. Die Datei ist nach den früheren Extraktionen (appointments-db.ts, meetings-db.ts, tickets-db.ts, newsletter-db.ts, coaching-db.ts) immer noch ein God-File mit mehreren Domänen.

## What

Extraktion der **Projekt-Domäne** (Project/SubProject/ProjectTask/PortalProject + TimeEntry + ClientNote + FollowUp) aus `website-db.ts` in ein neues Modul `website/src/lib/projects-db.ts`. Diese Domäne umfasst ~600 Zeilen und schafft ausreichend Headroom (Ziel: ≤ 2300 Zeilen).

1. **`projects-db.ts` anlegen** — Project/SubProject/ProjectTask CRUD, PortalProject/PortalTask, ProjectAttachment, TimeEntry, ClientNote, FollowUp, Onboarding sowie Hilfsfunktionen (exportProjectsFlat, listMeetingsForProject, assignMeetingToProject, findProjectByName etc.) aus `website-db.ts` extrahieren.
2. **Import-Umstellung** — alle Aufrufer importieren Project-Symbole künftig aus `projects-db.ts` statt `website-db.ts`.
3. **`s1.ignore`-Eintrag prüfen** — nach erfolgreicher Extraktion sicherstellen, dass `website-db.ts` nicht mehr in `s1.ignore` steht.
4. **Validierung** — TypeScript-Check, `health-goals-check --only=G-SIZE03`, `task test:changed`, `task freshness:check`.

## Impact

**Neue Datei:** `website/src/lib/projects-db.ts` (~600 Zeilen)

**Geänderte Dateien:**
- `website/src/lib/website-db.ts` — Project/TimeEntry/ClientNote/FollowUp/Onboarding-Block entfernt; Ziel ≤ 2300 Zeilen
- Import-Stellen in `website/src/pages/api/`, `website/src/pages/admin/` und anderen Modulen, die Project-Symbole aus `website-db` importieren

**Risiken:**
- TypeScript-Compiler und Tests fangen fehlende Re-Exports ab
- `initDb`-Kaskade muss `initProjectsDb()` aufrufen

**Out-of-Scope:**
- Extraktion anderer Domänen (Content, BugTickets, ServiceConfig — bleiben in website-db.ts)
- Änderungen an der SQL-Struktur oder Datenbank-Schemas
