---
title: "G-SIZE03: website-db.ts Refactoring — 2890/3000 Zeilen, Headroom schaffen"
ticket_id: T001359
domains: ["quality", "website", "size"]
status: completed
---

# t001359-size03-website-db — Implementation Plan

## File Structure

| Datei | Status |
|-------|--------|
| `website/src/lib/website-db.ts` | Geändert — Project/SubProject/ProjectTask/PortalProject/ProjectAttachment-Block (ca. Zeilen 848–1471) entfernt; Ziel ≤ 2300 Zeilen |
| `website/src/lib/projects-db.ts` | Neu — Project/SubProject/ProjectTask/PortalProject/ProjectAttachment CRUD + Portal-Logik |
| Import-Stellen in `website/src/pages/api/`, `website/src/pages/admin/` und Core-Modulen | Geändert — Imports von `projects-db` statt `website-db` |

---

## Task 1: Analyse und Baseline

Current state erfassen und die genauen Domänengrenzen dokumentieren.

- [ ] `wc -l < website/src/lib/website-db.ts` — aktuellen Wert dokumentieren (erwartet: 2890)
- [ ] Domänenblöcke in `website-db.ts` identifizieren und ihren Zeilenbereich dokumentieren:
  - BugTickets (ca. Zeilen 273–484)
  - ServiceConfig / LeistungenConfig (ca. Zeilen 500–614)
  - SiteSettings / JsonSettings / SEO (ca. Zeilen 626–707)
  - Legal / Referenzen (ca. Zeilen 729–834)
  - **Projects / SubProjects / ProjectTasks / PortalProject** (ca. Zeilen 848–1471) — primärer Extraktionskandidat
  - TimeEntries (ca. Zeilen 1525–1870)
  - ClientNotes / Onboarding / FollowUps (ca. Zeilen 1892–2135)
  - CustomSections (ca. Zeilen 2583–2680)
  - ContentRead/Write (ca. Zeilen 2711–2890)
- [ ] Extraktionsziel bestimmen: Projects-Domäne (~623 Zeilen) → website-db.ts reduziert sich auf ca. 2267 Zeilen

---

## Task 2: projects-db.ts anlegen — Projects-Domäne extrahieren

Alle Project/SubProject/ProjectTask/PortalProject/ProjectAttachment-Exports aus `website-db.ts` in ein neues Modul verschieben.

**Dateien:**
- `website/src/lib/projects-db.ts` — neu erstellen
- `website/src/lib/website-db.ts` — extrahierten Block entfernen

**Implementierung:**

`projects-db.ts` erhält denselben Pool-Import wie die anderen Split-Dateien:
```typescript
import { pool } from './db-pool';
import type { Pool, PoolClient } from 'pg';
```

Folgende Exports werden aus `website-db.ts` nach `projects-db.ts` verschoben:

- `ProjectStatus`, `ProjectPriority` (Type Aliases)
- `Project`, `SubProject`, `ProjectTask` (Interfaces)
- `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`
- `listSubProjects`, `getSubProject`, `createSubProject`, `updateSubProject`, `deleteSubProject`
- `listDirectTasks`, `listSubProjectTasks`, `createProjectTask`, `updateProjectTask`, `deleteProjectTask`
- `ProjectAttachment` (Interface), `listProjectAttachments`, `getProjectAttachment`, `createProjectAttachment`, `deleteProjectAttachmentRecord`
- `PortalProject`, `PortalTask` (Interfaces), `listProjectsForCustomer`, `togglePortalTaskDone`
- `listAllCustomers`, `listAdminUsers` (teilen sich Customer-Domäne — bleiben vorerst in website-db.ts mit Re-Export)
- `ProjectExportRow`, `exportProjectsFlat`
- `listMeetingsForProject`, `assignMeetingToProject`, `findProjectByName`, `listUnassignedMeetingsForCustomer`, `getCustomerByEmail`
- Hilfsfunktionen: `STATUS_FWD`, `mapStatusFwd`, `PROJECT_SELECT`, `PROJECT_ORDER`, `SUBPROJECT_SELECT`, `SUBPROJECT_ORDER`

Nach der Verschiebung: in `website-db.ts` einen temporären Barrel-Re-Export ergänzen, damit bestehende Importe nicht sofort brechen:
```typescript
// Temporär — wird in Task 3 entfernt
export * from './projects-db';
```

Zusätzlich müssen alle `init*`-Funktionen für Projects-Tabellen (sofern vorhanden) von `initDb` in `website-db.ts` aus aufgerufen werden.

---

## Task 3: Imports umstellen — alle Aufrufer auf projects-db zeigen

Jede Datei, die bisher Projects-Symbole aus `website-db` importierte, auf den direkten Import aus `projects-db` umstellen. Anschließend den temporären Re-Export aus `website-db.ts` entfernen.

**Import-Umstellung pro Datei:**

Für jede Datei, die Projects-Symbole aus `website-db` importiert:
- Einen zusätzlichen Import aus `'./projects-db'` hinzufügen — nur die Projects-Symbole
- Aus dem bestehenden `'website-db'`-Import die umgestellten Symbole entfernen
- Falls nach Entfernung keine Symbole mehr aus `website-db` übrig bleiben: den gesamten Import ersetzen

**Prüfung:**
```bash
cd website && npx tsc --noEmit
# expected: PASS — keine ungelösten Imports
```

---

## Task 4 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-SIZE03` — G-SIZE03 zeigt grün (Ziel ≤ 2300 Zeilen)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
