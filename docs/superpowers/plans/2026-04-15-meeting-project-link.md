# Meeting-Projekt-Verknüpfung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meetings können optional einem Projekt zugeordnet werden; die Meetinginhalte (Transkript, Insights, Artefakte) sind im Projekt-Detail-Tab sichtbar.

**Architecture:** Nullable FK `project_id` in `meetings` (lazy migration via `initMeetingProjectLink()`). Neuer "Besprechungen"-Tab in der Projektdetailseite zeigt zugeordnete Meetings mit vollem Inhalt. Zuweisung per `/meeting`-Slash-Command-Flag `--projekt=<Name>` sowie nachträglich per Dropdown im Admin-Panel.

**Tech Stack:** TypeScript, Astro 4 (SSR), PostgreSQL 16 (pg-Pool), Tailwind CSS

---

## Dateiübersicht

| Datei | Änderung |
|-------|----------|
| `website/src/lib/website-db.ts` | Neue Funktionen + Typen + lazy Migration |
| `website/src/pages/api/meetings/[id]/project.ts` | Neuer PATCH-Endpoint |
| `website/src/pages/api/meeting/finalize.ts` | `projectId` aus Body entgegennehmen |
| `website/src/pages/api/mattermost/slash/meeting.ts` | `--projekt`-Flag parsen |
| `website/src/components/admin/ProjectMeetingsTab.astro` | Neuer Tab-Inhalt |
| `website/src/pages/admin/projekte/[id].astro` | Besprechungen-Tab einhängen |
| `website/src/components/portal/MeetingsAdminTab.astro` | Projekt-Dropdown je Meeting |
| `docs/database.md` + `k3d/docs-content/database.md` | `project_id` in meetings ergänzen |

---

## Task 1: DB-Funktionen und lazy Migration

**Modify:** `website/src/lib/website-db.ts`

- [ ] **Schritt 1: `MeetingWithDetails`-Interface und `initMeetingProjectLink` hinzufügen**

Füge nach dem `Meeting`-Interface (ca. Zeile 82) ein:

```typescript
export interface MeetingWithDetails {
  id: string;
  meetingType: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  releasedAt: Date | null;
  createdAt: Date;
  transcripts: Array<{
    id: string;
    fullText: string;
    language: string;
    durationSeconds: number | null;
  }>;
  insights: Array<{
    id: string;
    insightType: string;
    content: string;
    generatedBy: string;
  }>;
  artifacts: Array<{
    id: string;
    artifactType: string;
    name: string;
    contentText: string | null;
  }>;
}
```

Füge nach `initMeetingsDb` (ca. Zeile 73) eine neue Funktion ein:

```typescript
async function initMeetingProjectLink(): Promise<void> {
  await initProjectTables(); // projects-Tabelle muss vor der FK-Spalte existieren
  await pool.query(`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id)
  `);
}
```

- [ ] **Schritt 2: `Meeting`-Interface um `projectId` und `projectName` erweitern**

Ändere das `Meeting`-Interface (ca. Zeile 77):

```typescript
export interface Meeting {
  id: string;
  customerId: string;
  status: string;
  released_at: Date | null;
  projectId: string | null;
  projectName: string | null;
}
```

- [ ] **Schritt 3: `createMeeting` um optionales `projectId` erweitern**

Ersetze die gesamte `createMeeting`-Funktion:

```typescript
export async function createMeeting(params: {
  customerId: string;
  meetingType: string;
  scheduledAt?: Date;
  talkRoomToken?: string;
  projectId?: string;
}): Promise<Meeting> {
  const result = await pool.query(
    `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, talk_room_token, status, project_id)
     VALUES ($1, $2, $3, $4, 'scheduled', $5)
     RETURNING id, customer_id as "customerId", status, released_at,
               project_id as "projectId", NULL::text as "projectName"`,
    [params.customerId, params.meetingType, params.scheduledAt,
     params.talkRoomToken, params.projectId ?? null]
  );
  return result.rows[0];
}
```

- [ ] **Schritt 4: `getMeetingsForClient` mit JOIN auf projects erweitern**

Ersetze die gesamte `getMeetingsForClient`-Funktion:

```typescript
export async function getMeetingsForClient(
  clientEmail: string,
  onlyReleased = false
): Promise<Meeting[]> {
  const baseSelect = `
    SELECT m.id, m.customer_id as "customerId", m.status, m.released_at,
           m.project_id as "projectId", p.name as "projectName"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE c.email = $1`;

  const query = onlyReleased
    ? `${baseSelect} AND m.released_at IS NOT NULL ORDER BY m.created_at DESC`
    : `${baseSelect} ORDER BY m.created_at DESC`;

  const result = await pool.query(query, [clientEmail]);
  return result.rows;
}
```

- [ ] **Schritt 5: Drei neue Funktionen anhängen**

Füge am Ende der Datei vor dem letzten Export hinzu:

```typescript
// ── Meeting-Projekt-Verknüpfung ───────────────────────────────────────────────

export async function listMeetingsForProject(
  projectId: string
): Promise<MeetingWithDetails[]> {
  await initMeetingProjectLink();
  const meetings = await pool.query(
    `SELECT id, meeting_type AS "meetingType", status,
            scheduled_at AS "scheduledAt", started_at AS "startedAt",
            ended_at AS "endedAt", duration_seconds AS "durationSeconds",
            released_at AS "releasedAt", created_at AS "createdAt"
     FROM meetings WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );

  const result: MeetingWithDetails[] = [];
  for (const m of meetings.rows) {
    const [tRes, iRes, aRes] = await Promise.all([
      pool.query(
        `SELECT id, full_text AS "fullText", language,
                duration_seconds AS "durationSeconds"
         FROM transcripts WHERE meeting_id = $1`,
        [m.id]
      ),
      pool.query(
        `SELECT id, insight_type AS "insightType", content,
                generated_by AS "generatedBy"
         FROM meeting_insights WHERE meeting_id = $1
         ORDER BY created_at ASC`,
        [m.id]
      ),
      pool.query(
        `SELECT id, artifact_type AS "artifactType", name,
                content_text AS "contentText"
         FROM meeting_artifacts WHERE meeting_id = $1`,
        [m.id]
      ),
    ]);
    result.push({
      ...m,
      transcripts: tRes.rows,
      insights: iRes.rows,
      artifacts: aRes.rows,
    });
  }
  return result;
}

export async function assignMeetingToProject(
  meetingId: string,
  projectId: string | null
): Promise<void> {
  await initMeetingProjectLink();
  await pool.query(
    `UPDATE meetings SET project_id = $2, updated_at = now() WHERE id = $1`,
    [meetingId, projectId]
  );
}

export async function findProjectByName(
  brand: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  await initProjectTables();
  const result = await pool.query(
    `SELECT id, name FROM projects
     WHERE brand = $1 AND name ILIKE $2
     ORDER BY CASE status
       WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
       ELSE 3 END
     LIMIT 1`,
    [brand, `%${name}%`]
  );
  return result.rows[0] ?? null;
}

export async function listUnassignedMeetingsForCustomer(
  customerId: string
): Promise<Array<{ id: string; meetingType: string; status: string; createdAt: Date }>> {
  await initMeetingProjectLink();
  const result = await pool.query(
    `SELECT id, meeting_type AS "meetingType", status, created_at AS "createdAt"
     FROM meetings
     WHERE customer_id = $1 AND project_id IS NULL
     ORDER BY created_at DESC`,
    [customerId]
  );
  return result.rows;
}

export async function getCustomerByEmail(
  email: string
): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, name, email FROM customers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}
```

- [ ] **Schritt 6: Dev-Server starten und TypeScript-Fehler prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run dev 2>&1 | head -30
```

Erwartung: Keine TypeScript-Fehler, Server startet auf Port 4321.

- [ ] **Schritt 7: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/website-db.ts
git commit -m "feat(db): add project_id to meetings, listMeetingsForProject, assignMeetingToProject"
```

---

## Task 2: PATCH-Endpoint `/api/meetings/[id]/project`

**Create:** `website/src/pages/api/meetings/[id]/project.ts`

- [ ] **Schritt 1: Datei erstellen**

```bash
mkdir -p /home/patrick/Bachelorprojekt/website/src/pages/api/meetings/\[id\]
```

Erstelle `website/src/pages/api/meetings/[id]/project.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { assignMeetingToProject } from '../../../../lib/website-db';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const meetingId = params.id;
  if (!meetingId) {
    return new Response(JSON.stringify({ error: 'Missing meeting ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { projectId?: string | null };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await assignMeetingToProject(meetingId, body.projectId ?? null);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Schritt 2: Manuell testen (mit laufendem Dev-Server)**

```bash
# Als Admin eingeloggt sein, Cookie aus Browser-DevTools holen
curl -X PATCH http://localhost:4321/api/meetings/EINE-MEETING-UUID/project \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"projectId": null}'
# Erwartung: {"ok":true}
```

- [ ] **Schritt 3: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/meetings
git commit -m "feat(api): add PATCH /api/meetings/[id]/project endpoint"
```

---

## Task 3: `finalize.ts` um `projectId` erweitern

**Modify:** `website/src/pages/api/meeting/finalize.ts`

- [ ] **Schritt 1: Import erweitern**

Die Zeile mit `upsertCustomer, createMeeting, ...` ist bereits vorhanden. Kein neuer Import nötig, `createMeeting` akzeptiert `projectId` bereits nach Task 1.

- [ ] **Schritt 2: `projectId` aus dem Request-Body destructuren**

Finde die Destructuring-Zeile:
```typescript
const {
  customerName: _customerName,
  customerEmail,
  meetingType,
  meetingDate,
  transcript: providedTranscript,
  artifacts: providedArtifacts,
  channelId,
  roomToken,
} = await request.json();
```

Ersetze sie durch:
```typescript
const {
  customerName: _customerName,
  customerEmail,
  meetingType,
  meetingDate,
  transcript: providedTranscript,
  artifacts: providedArtifacts,
  channelId,
  roomToken,
  projectId,
} = await request.json();
```

- [ ] **Schritt 3: `projectId` an `createMeeting` übergeben**

Finde:
```typescript
meeting = await createMeeting({
  customerId: customer.id,
  meetingType: meetingType || 'Meeting',
  talkRoomToken: roomToken,
});
```

Ersetze durch:
```typescript
meeting = await createMeeting({
  customerId: customer.id,
  meetingType: meetingType || 'Meeting',
  talkRoomToken: roomToken,
  projectId: projectId ?? undefined,
});
```

- [ ] **Schritt 4: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/meeting/finalize.ts
git commit -m "feat(api): pass projectId through finalize pipeline"
```

---

## Task 4: Slash-Command `--projekt`-Flag

**Modify:** `website/src/pages/api/mattermost/slash/meeting.ts`

- [ ] **Schritt 1: Import von `findProjectByName` hinzufügen**

Finde die erste Zeile der Datei mit den Imports, die Funktionen aus `lib/talk` etc. importiert. Füge hinzu:

```typescript
import { findProjectByName } from '../../../../lib/website-db';
```

- [ ] **Schritt 2: Flag-Parsing vor der Argument-Verarbeitung einfügen**

Finde direkt nach:
```typescript
const text = (form.get('text') as string || '').trim();
const channelId = form.get('channel_id') as string || '';
```

Füge ein:
```typescript
// Extrahiere optionales --projekt=<Name>-Flag und bereinige den Text
const projektMatch = text.match(/--projekt=(\S+)/);
const projektFlag  = projektMatch ? decodeURIComponent(projektMatch[1]) : null;
const cleanText    = text.replace(/--projekt=\S+/, '').trim();
```

- [ ] **Schritt 3: `cleanText` statt `text` für die Argument-Verarbeitung verwenden**

Finde die nächste Zeile:
```typescript
const parts = text.split(/\s+/);
```

Ersetze durch:
```typescript
const parts = cleanText.split(/\s+/);
```

- [ ] **Schritt 4: Projekt-Lookup nach der Argument-Verarbeitung einbauen**

Finde den Block, der den `room` erstellt (`const room = await createTalkRoom(...)`). Füge **davor** ein:

```typescript
// Projekt-Lookup via --projekt-Flag
let projectId: string | undefined;
if (projektFlag) {
  const brand = import.meta.env.BRAND_NAME || 'mentolder';
  const found = await findProjectByName(brand, projektFlag);
  if (found) {
    projectId = found.id;
  } else {
    // Warnung: Projekt nicht gefunden, Meeting läuft ohne Zuordnung weiter
    await postToChannel(channelId,
      `:warning: Projekt "${projektFlag}" nicht gefunden — Meeting ohne Projektzuordnung.`
    );
  }
}
```

- [ ] **Schritt 5: `projectId` in den `postInteractiveMessage`-Context einbauen**

Finde:
```typescript
context: {
  customerName: customerName || 'Unbekannt',
  customerEmail: customerEmail || `adhoc-${Date.now()}@intern`,
  meetingType,
  meetingDate: dateFormatted,
  customerChannelId: targetChannelId,
  roomToken: room.token,
},
```

Ersetze durch:
```typescript
context: {
  customerName: customerName || 'Unbekannt',
  customerEmail: customerEmail || `adhoc-${Date.now()}@intern`,
  meetingType,
  meetingDate: dateFormatted,
  customerChannelId: targetChannelId,
  roomToken: room.token,
  projectId: projectId ?? null,
},
```

- [ ] **Schritt 6: Sicherstellen, dass `actions.ts` den `projectId`-Context weiterleitet**

Öffne `website/src/pages/api/mattermost/actions.ts`. Suche nach dem `finalize_meeting`-Handler. Der Context wird dort an `/api/meeting/finalize` weitergeleitet. Stelle sicher, dass `projectId` aus dem Context extrahiert und im Fetch-Body mitgegeben wird:

Finde den Block, der an `/api/meeting/finalize` postet (enthält `customerName`, `customerEmail` etc.). Ergänze `projectId: context.projectId ?? undefined` im Body:

```typescript
body: JSON.stringify({
  customerName:    context.customerName,
  customerEmail:   context.customerEmail,
  meetingType:     context.meetingType,
  meetingDate:     context.meetingDate,
  channelId:       context.customerChannelId,
  roomToken:       context.roomToken,
  projectId:       context.projectId ?? undefined,
}),
```

- [ ] **Schritt 7: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/mattermost/slash/meeting.ts \
        website/src/pages/api/mattermost/actions.ts
git commit -m "feat(slash): add --projekt flag to /meeting command"
```

---

## Task 5: `ProjectMeetingsTab`-Komponente

**Create:** `website/src/components/admin/ProjectMeetingsTab.astro`

- [ ] **Schritt 1: Komponentendatei erstellen**

```bash
mkdir -p /home/patrick/Bachelorprojekt/website/src/components/admin
```

Erstelle `website/src/components/admin/ProjectMeetingsTab.astro`:

```astro
---
import type { MeetingWithDetails } from '../../lib/website-db';

interface Props {
  meetings: MeetingWithDetails[];
  projectId: string;
  unassignedMeetings: Array<{ id: string; meetingType: string; status: string; createdAt: Date }>;
}

const { meetings, projectId, unassignedMeetings } = Astro.props;

const INSIGHT_LABELS: Record<string, string> = {
  summary:        'Zusammenfassung',
  action_items:   'Action Items',
  key_topics:     'Themen',
  sentiment:      'Sentiment',
  coaching_notes: 'Coaching-Notizen',
};

const STATUS_CLS: Record<string, string> = {
  scheduled:   'bg-blue-900/40 text-blue-300 border-blue-800',
  active:      'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  ended:       'bg-slate-900/40 text-slate-300 border-slate-700',
  transcribed: 'bg-purple-900/40 text-purple-300 border-purple-800',
  finalized:   'bg-green-900/40 text-green-300 border-green-800',
};

function fmtDate(d: Date | null | string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
---

<div data-testid="project-meetings-tab">
  <div class="flex items-center justify-between mb-6">
    <h3 class="text-lg font-semibold text-light">Besprechungen</h3>
    {unassignedMeetings.length > 0 && (
      <button
        id="open-assign-modal"
        class="px-4 py-2 bg-gold/20 text-gold border border-gold/30 text-sm font-medium rounded-lg hover:bg-gold/30 transition-colors"
      >
        + Meeting zuordnen
      </button>
    )}
  </div>

  {meetings.length === 0 ? (
    <p class="text-muted text-sm">Noch keine Besprechungen zugeordnet.</p>
  ) : (
    <div class="space-y-3">
      {meetings.map(meeting => (
        <details class="bg-dark rounded-xl border border-dark-lighter group" data-meeting-id={meeting.id}>
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-light text-sm font-medium">{meeting.meetingType}</span>
              <span class="text-muted text-xs">—</span>
              <span class="text-muted text-xs">{fmtDate(meeting.createdAt)}</span>
              <span class={`px-2 py-0.5 text-xs rounded-full border ${STATUS_CLS[meeting.status] ?? 'bg-dark border-dark-lighter text-muted'}`}>
                {meeting.status}
              </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="remove-meeting-btn px-3 py-1 text-xs text-red-400 border border-red-800 rounded-full hover:bg-red-900/20 transition-colors"
                data-meeting-id={meeting.id}
                onclick="event.stopPropagation()"
              >
                Entfernen
              </button>
              <span class="text-muted text-xs group-open:rotate-90 transition-transform inline-block">▶</span>
            </div>
          </summary>

          <div class="border-t border-dark-lighter px-4 pb-4 pt-4 space-y-5">

            {/* Transcripts */}
            {meeting.transcripts.length > 0 && (
              <div>
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Transkript</h4>
                {meeting.transcripts.map(t => (
                  <div class="bg-dark-lighter rounded-lg p-3 max-h-60 overflow-y-auto">
                    {t.durationSeconds && (
                      <p class="text-xs text-muted mb-2">{t.language.toUpperCase()} · {Math.round(Number(t.durationSeconds))}s</p>
                    )}
                    <pre class="text-xs text-light/80 whitespace-pre-wrap font-sans leading-relaxed">{t.fullText}</pre>
                  </div>
                ))}
              </div>
            )}

            {/* Insights */}
            {meeting.insights.length > 0 && (
              <div>
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">KI-Insights</h4>
                <div class="space-y-2">
                  {meeting.insights.map(insight => (
                    <div class="bg-dark-lighter rounded-lg p-3">
                      <p class="text-xs font-semibold text-gold mb-1">
                        {INSIGHT_LABELS[insight.insightType] ?? insight.insightType}
                      </p>
                      <p class="text-sm text-light/80 whitespace-pre-wrap">{insight.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Artifacts */}
            {meeting.artifacts.length > 0 && (
              <div>
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Artefakte</h4>
                <ul class="space-y-1">
                  {meeting.artifacts.map(a => (
                    <li class="flex items-center gap-2 text-sm">
                      <span class="px-2 py-0.5 text-xs bg-dark rounded border border-dark-lighter text-muted">
                        {a.artifactType}
                      </span>
                      <span class="text-light/80">{a.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.transcripts.length === 0 && meeting.insights.length === 0 && meeting.artifacts.length === 0 && (
              <p class="text-muted text-sm">Noch keine Inhalte für dieses Meeting.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  )}

  {/* Modal: Meeting zuordnen */}
  <dialog
    id="assign-meeting-modal"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg backdrop:bg-black/60"
  >
    <h3 class="text-lg font-semibold text-light mb-4">Meeting zuordnen</h3>
    {unassignedMeetings.length === 0 ? (
      <p class="text-muted text-sm">Alle Meetings sind bereits einem Projekt zugeordnet.</p>
    ) : (
      <div class="space-y-2 max-h-80 overflow-y-auto">
        {unassignedMeetings.map(m => (
          <button
            type="button"
            class="assign-meeting-btn w-full text-left p-3 rounded-lg border border-dark-lighter hover:border-gold/60 transition-colors"
            data-meeting-id={m.id}
            data-project-id={projectId}
          >
            <span class="text-sm text-light">{m.meetingType}</span>
            <span class="text-xs text-muted ml-2">{fmtDate(m.createdAt)}</span>
            <span class="text-xs text-muted ml-2 capitalize">{m.status}</span>
          </button>
        ))}
      </div>
    )}
    <div class="mt-4 flex justify-end">
      <button
        id="close-assign-modal"
        type="button"
        class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
      >
        Schließen
      </button>
    </div>
  </dialog>
</div>

<script>
  const modal = document.getElementById('assign-meeting-modal') as HTMLDialogElement | null;

  document.getElementById('open-assign-modal')?.addEventListener('click', () => modal?.showModal());
  document.getElementById('close-assign-modal')?.addEventListener('click', () => modal?.close());

  async function patchMeetingProject(meetingId: string, projectId: string | null): Promise<boolean> {
    const res = await fetch(`/api/meetings/${meetingId}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    return res.ok;
  }

  // Zuordnen
  document.querySelectorAll<HTMLButtonElement>('.assign-meeting-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { meetingId, projectId } = btn.dataset;
      if (!meetingId || !projectId) return;
      btn.disabled = true;
      btn.textContent = '...';
      const ok = await patchMeetingProject(meetingId, projectId);
      if (ok) window.location.reload();
      else {
        alert('Fehler beim Zuordnen.');
        btn.disabled = false;
      }
    });
  });

  // Entfernen
  document.querySelectorAll<HTMLButtonElement>('.remove-meeting-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const meetingId = btn.dataset.meetingId;
      if (!meetingId) return;
      if (!confirm('Meeting-Zuordnung aufheben?')) return;
      btn.disabled = true;
      const ok = await patchMeetingProject(meetingId, null);
      if (ok) window.location.reload();
      else {
        alert('Fehler beim Entfernen.');
        btn.disabled = false;
      }
    });
  });
</script>
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run dev 2>&1 | grep -i error | head -10
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/ProjectMeetingsTab.astro
git commit -m "feat(ui): add ProjectMeetingsTab component with full meeting details"
```

---

## Task 6: Besprechungen-Tab in Projektdetailseite einbauen

**Modify:** `website/src/pages/admin/projekte/[id].astro`

- [ ] **Schritt 1: Imports erweitern**

Finde die Import-Zeile (ca. Zeile 6):
```typescript
import {
  getProject, listSubProjects, listDirectTasks, listSubProjectTasks, listAllCustomers,
} from '../../../lib/website-db';
```

Ersetze durch:
```typescript
import {
  getProject, listSubProjects, listDirectTasks, listSubProjectTasks, listAllCustomers,
  listMeetingsForProject, listUnassignedMeetingsForCustomer,
} from '../../../lib/website-db';
import type { MeetingWithDetails } from '../../../lib/website-db';
import ProjectMeetingsTab from '../../../components/admin/ProjectMeetingsTab.astro';
```

- [ ] **Schritt 2: `tab`-Variable und Meetings-Laden in den Frontmatter einbauen**

Finde direkt nach:
```typescript
const errorMsg = Astro.url.searchParams.get('error') ?? '';
const saved    = Astro.url.searchParams.get('saved') ?? '';
```

Füge ein:
```typescript
const tab = Astro.url.searchParams.get('tab') ?? 'overview';

let projectMeetings: MeetingWithDetails[] = [];
let unassignedMeetings: Array<{ id: string; meetingType: string; status: string; createdAt: Date }> = [];

if (project && tab === 'meetings') {
  try {
    [projectMeetings, unassignedMeetings] = await Promise.all([
      listMeetingsForProject(project.id),
      project.customerId
        ? listUnassignedMeetingsForCustomer(project.customerId)
        : Promise.resolve([]),
    ]);
  } catch (err) {
    console.error('[admin/projekte/[id]] meetings load error:', err);
  }
}
```

- [ ] **Schritt 3: Tab-Navigation in das HTML einbauen**

Finde den Kommentar `{/* ── Project header ── */}` und das schließende `</div>` danach (nach dem `fmtDate(project.createdAt)...`-Absatz und dem "Bearbeiten"-Button, ca. Zeile 153).

Füge **nach** dem schließenden `</div>` des Header-Blocks, aber **vor** dem Edit-Formular-Block, diese Tab-Nav ein:

```astro
{/* ── Tab-Navigation ── */}
<nav class="flex gap-1 mb-6 border-b border-dark-lighter">
  {[
    { id: 'overview',  label: 'Übersicht' },
    { id: 'meetings',  label: 'Besprechungen' },
  ].map(t => (
    <a
      href={`/admin/projekte/${project!.id}?tab=${t.id}`}
      class={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
        tab === t.id
          ? 'text-gold border-b-2 border-gold'
          : 'text-muted hover:text-light'
      }`}
    >
      {t.label}
    </a>
  ))}
</nav>
```

- [ ] **Schritt 4: Vorhandene Sections unter `tab === 'overview'` ausblenden**

Finde den Block, der mit `{/* ── Edit project form (collapsible) ── */}` beginnt, und den letzten schließenden `</>` (Fragment-Ende nach `{/* ── Zeiterfassung ── */}`). Wickle alles dazwischen ein:

```astro
{tab === 'overview' && (
  <>
    {/* ── Edit project form (collapsible) ── */}
    ...  {/* bestehender Code unverändert */}
    {/* ── Zeiterfassung ── */}
    ...  {/* bestehender Code unverändert */}
  </>
)}
```

- [ ] **Schritt 5: Meetings-Tab-Inhalt hinzufügen**

Direkt nach dem `{tab === 'overview' && (...)}` Block füge ein:

```astro
{tab === 'meetings' && (
  <ProjectMeetingsTab
    meetings={projectMeetings}
    projectId={project!.id}
    unassignedMeetings={unassignedMeetings}
  />
)}
```

- [ ] **Schritt 6: Im Browser testen**

Starte Dev-Server falls nicht läuft:
```bash
cd /home/patrick/Bachelorprojekt/website && npm run dev
```

Öffne `http://localhost:4321/admin/projekte/<eine-projekt-id>?tab=meetings`

Erwartung:
- Tab-Navigation sichtbar ("Übersicht" | "Besprechungen")
- Meetings-Tab zeigt leere Liste oder vorhandene Meetings
- "Übersicht"-Tab zeigt weiterhin Teilprojekte und Aufgaben

- [ ] **Schritt 7: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/projekte/\[id\].astro
git commit -m "feat(admin): add Besprechungen tab to project detail page"
```

---

## Task 7: Projekt-Dropdown in `MeetingsAdminTab`

**Modify:** `website/src/components/portal/MeetingsAdminTab.astro`

- [ ] **Schritt 1: Imports und Props erweitern**

Ersetze den gesamten Frontmatter (`---`…`---`):

```typescript
---
import { getMeetingsForClient, getCustomerByEmail, listProjects } from '../../lib/website-db';
import type { Meeting } from '../../lib/website-db';

interface Props {
  clientEmail: string;
}
const { clientEmail } = Astro.props;

const brand = import.meta.env.BRAND_NAME || 'mentolder';

let meetings: Meeting[] = [];
let customerProjects: Array<{ id: string; name: string }> = [];

try {
  meetings = await getMeetingsForClient(clientEmail, false);
  const customer = await getCustomerByEmail(clientEmail);
  if (customer) {
    const allProjects = await listProjects({ brand, customerId: customer.id });
    customerProjects = allProjects
      .filter(p => !['archiviert', 'erledigt'].includes(p.status))
      .map(p => ({ id: p.id, name: p.name }));
  }
} catch {
  // DB unavailable
}
---
```

- [ ] **Schritt 2: Projekt-Dropdown zur Meeting-Karte hinzufügen**

Finde die Meeting-Karte in der `{meetings.map(meeting => (` Schleife. Die Karte sieht derzeit so aus:

```astro
<li class="p-4 bg-dark rounded-xl border border-dark-lighter" data-testid="meeting-admin-item">
  <div class="flex items-center justify-between">
    <div>
      <span class="text-sm text-muted">ID: {meeting.id}</span>
      ...
    </div>
    {!meeting.released_at && (
      <button ... >Freigeben</button>
    )}
  </div>
</li>
```

Ersetze es durch:

```astro
<li class="p-4 bg-dark rounded-xl border border-dark-lighter space-y-3" data-testid="meeting-admin-item">
  <div class="flex items-center justify-between">
    <div>
      <span class="text-sm text-muted">ID: {meeting.id}</span>
      <span class="ml-3 text-xs text-muted capitalize">{meeting.status}</span>
      {meeting.released_at ? (
        <span class="ml-3 text-xs text-green-400">
          Freigegeben: {new Date(meeting.released_at).toLocaleDateString('de-DE')}
        </span>
      ) : (
        <span class="ml-3 text-xs text-gold">Nicht freigegeben</span>
      )}
    </div>
    {!meeting.released_at && (
      <button
        type="button"
        data-testid="release-button"
        data-meeting-id={meeting.id}
        class="release-btn px-3 py-1 text-xs bg-gold text-dark rounded-full font-medium hover:bg-gold/80 transition-colors"
      >
        Freigeben
      </button>
    )}
  </div>

  {/* Projekt-Zuweisung */}
  <div class="flex items-center gap-2">
    <span class="text-xs text-muted">Projekt:</span>
    {customerProjects.length > 0 ? (
      <select
        class="project-select text-xs bg-dark border border-dark-lighter rounded px-2 py-1 text-light focus:border-gold/50 outline-none cursor-pointer"
        data-meeting-id={meeting.id}
      >
        <option value="" selected={!meeting.projectId}>— kein Projekt —</option>
        {customerProjects.map(p => (
          <option value={p.id} selected={meeting.projectId === p.id}>{p.name}</option>
        ))}
      </select>
    ) : (
      <span class="text-xs text-muted">
        {meeting.projectName ?? '— kein Projekt —'}
      </span>
    )}
  </div>
</li>
```

- [ ] **Schritt 3: Client-Script für Dropdown-Änderungen hinzufügen**

Finde das bestehende `<script>`-Tag mit der `release-btn`-Logik. Füge **am Ende** des `<script>`-Inhalts (vor dem schließenden `</script>`) hinzu:

```typescript
  // Projekt-Dropdown-Änderungen
  document.querySelectorAll<HTMLSelectElement>('.project-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const meetingId = sel.dataset.meetingId;
      if (!meetingId) return;
      const projectId = sel.value || null;

      sel.disabled = true;
      try {
        const res = await fetch(`/api/meetings/${meetingId}/project`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        if (!res.ok) throw new Error('Server error');
      } catch {
        alert('Fehler beim Speichern der Projektzuordnung.');
        window.location.reload();
      } finally {
        sel.disabled = false;
      }
    });
  });
```

- [ ] **Schritt 4: Im Browser testen**

Öffne `http://localhost:4321/admin/<clientId>?tab=meetings`

Erwartung:
- Jede Meeting-Karte zeigt ein Projekt-Dropdown
- Auswahl eines Projekts sendet PATCH an `/api/meetings/[id]/project`
- Seite zeigt gewähltes Projekt nach Reload

- [ ] **Schritt 5: Committen**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/portal/MeetingsAdminTab.astro
git commit -m "feat(admin): add project dropdown to MeetingsAdminTab"
```

---

## Task 8: Docs aktualisieren

**Modify:** `docs/database.md` und `k3d/docs-content/database.md`

- [ ] **Schritt 1: `project_id` in der meetings-Tabelle ergänzen**

In beiden Dateien die `meetings`-Tabellendefinition im Mermaid-Diagramm ändern:

Finde:
```
    meetings {
        uuid        id                  PK
        uuid        customer_id         FK
```

Ersetze durch:
```
    meetings {
        uuid        id                  PK
        uuid        customer_id         FK
        uuid        project_id          FK
```

- [ ] **Schritt 2: Relation ergänzen**

Finde:
```
    customers        ||--o{ meetings             : "hat"
```

Füge danach ein:
```
    projects         ||--o{ meetings             : "hat"
```

- [ ] **Schritt 3: Tabellenbeschreibung aktualisieren**

Finde in der Tabellenbeschreibung:
```
| `meetings` | Meeting-Verlauf mit Status-Lifecycle: `scheduled → active → ended → transcribed → finalized` |
```

Ersetze durch:
```
| `meetings` | Meeting-Verlauf mit Status-Lifecycle: `scheduled → active → ended → transcribed → finalized`; optional einem Projekt zugeordnet via `project_id` |
```

- [ ] **Schritt 4: Beide Dateien committen**

```bash
cd /home/patrick/Bachelorprojekt
git add docs/database.md k3d/docs-content/database.md
git commit -m "docs: update database diagram with meetings.project_id"
```

---

## Abschluss-Check

- [ ] Dev-Server starten und alle drei Wege manuell durchspielen:
  1. `/meeting Max max@test.de --projekt=TestProjekt` in Mattermost → Meeting erscheint im Projekt-Tab
  2. Admin `/admin/<clientId>?tab=meetings` → Dropdown wählen → Meeting erscheint im Projekt-Tab
  3. Im Projekt-Tab Meeting per "Entfernen"-Button abkoppeln → verschwindet aus Liste
- [ ] `task workspace:validate` ausführen — keine Manifest-Fehler
