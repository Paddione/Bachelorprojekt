# Design: Meeting-Projekt-Verknüpfung

**Datum:** 2026-04-15
**Status:** Genehmigt

## Ziel

Meetings sollen optional einem Projekt zugeordnet werden können, damit Meetinginhalte
(Transkript, KI-Insights, Artefakte) im Kontext des jeweiligen Projekts sichtbar sind.

---

## Datenmodell

### Änderung an `meetings`

```sql
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
```

- Nullable FK — ein Meeting kann keinem oder genau einem Projekt zugeordnet sein.
- `ON DELETE SET NULL`: Wird ein Projekt gelöscht, verlieren zugeordnete Meetings nur
  die Verknüpfung; die Meeting-Daten bleiben erhalten.

### Neue DB-Funktionen (`website/src/lib/website-db.ts`)

| Funktion | Beschreibung |
|----------|--------------|
| `listMeetingsForProject(projectId)` | Alle Meetings eines Projekts inkl. Transcripts, Insights, Artifacts |
| `assignMeetingToProject(meetingId, projectId \| null)` | Setzt oder löscht die Projektzuweisung |
| `getMeetingsForClient()` | Erweiterung: `project_id` im Rückgabe-Typ ergänzen |

---

## Slash-Command-Integration

**Datei:** `website/src/pages/api/mattermost/slash/meeting.ts`

Neues optionales Flag `--projekt=<Name>` am Ende des Kommandos:

```
/meeting Max Mustermann max@example.de Coaching --projekt=Webseite
```

- Flag wird per Regex aus dem `text`-Parameter geparst, bevor die übrige Argument-Verarbeitung läuft.
- Projekt-Lookup: `SELECT id FROM projects WHERE name ILIKE '%<flag-value>%' ORDER BY status` (aktivste zuerst).
- Bei mehreren Treffern: erster Treffer gewinnt.
- Bei keinem Treffer: Meeting läuft ohne Projektzuordnung, ephemere Warnung zurück an den User.
- `project_id` wird in den Request-Body an `/api/meeting/finalize` weitergegeben.

**Datei:** `website/src/pages/api/meeting/finalize.ts`

- Neuer optionaler Body-Parameter `projectId?: string`.
- Wird beim `createMeeting`-Aufruf als `project_id` gesetzt.
- Kein Breaking Change (optional).

---

## Admin-UI

### Retroaktive Zuweisung — `MeetingsAdminTab.astro`

Ort: `/admin/[clientId]?tab=meetings`

- Jede Meeting-Karte bekommt ein Projekt-Dropdown.
- Zeigt alle aktiven Projekte des Kunden (`customer_id` stimmt überein).
- Auswahl "Kein Projekt" oder ein konkretes Projekt.
- Änderung via `PATCH /api/meetings/[id]/project`.

### Neuer Tab im Projekt-Detail

Ort: `/admin/projekte/[id]?tab=meetings` (vierter Tab, neben den bestehenden)

Inhalt: Liste aller zugeordneten Meetings, je Meeting eine aufklappbare Karte:

```
▶ Coaching — 14.04.2026  [aktiv]  [Projekt entfernen]
  ├── Transkript (Volltext, scrollbar)
  ├── Insights: Zusammenfassung | Action Items | Themen | Sentiment | Coaching-Notizen
  └── Artefakte: Name + Typ je Datei
```

Über der Liste: "+ Meeting zuordnen"-Button → öffnet Modal mit nicht-zugeordneten
Meetings des Projektkunden (gefiltert nach `customer_id`, `project_id IS NULL`).

### Neuer API-Endpoint

`PATCH /api/meetings/[id]/project`

```ts
// Body
{ projectId: string | null }

// Verhalten
// - projectId: string  → setzt meetings.project_id = projectId
// - projectId: null    → setzt meetings.project_id = NULL
// - Auth: Admin only (getSession + isAdmin check)
```

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/website-db.ts` | `listMeetingsForProject`, `assignMeetingToProject`, `getMeetingsForClient` erweitern |
| `website/src/pages/api/mattermost/slash/meeting.ts` | `--projekt`-Flag parsen, `projectId` weiterleiten |
| `website/src/pages/api/meeting/finalize.ts` | `projectId` aus Body annehmen, an `createMeeting` übergeben |
| `website/src/pages/api/meetings/[id]/project.ts` | Neuer PATCH-Endpoint |
| `website/src/pages/admin/projekte/[id].astro` | Neuer "Besprechungen"-Tab |
| `website/src/components/portal/MeetingsAdminTab.astro` | Projekt-Dropdown je Meeting |
| `docs/database.md` + `k3d/docs-content/database.md` | `project_id` in meetings-Tabelle ergänzen |

---

## Out of Scope

- Client-Portal (`/portal?tab=meetings`): keine Änderung — Kunden sehen Meetings weiterhin ohne Projektkontext.
- Mehrfachzuordnung (Meeting → mehrere Projekte): bewusst ausgeschlossen.
- Sub-Projekt-Zuordnung: Meetings werden nur auf Projekt-Ebene verknüpft, nicht auf Teilprojekt-Ebene.
