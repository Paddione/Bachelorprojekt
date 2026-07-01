/**
 * Project Export & Meetings Database Module
 *
 * Manages CSV export and meeting-project relations.
 * Extracted from projects-db.ts to reduce file size.
 */

import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';
import { initMeetingProjectLink } from './meetings-db';
import type { MeetingWithDetails } from './meetings-db';
import {
  listSubProjects,
  listDirectTasks,
  listSubProjectTasks,
  type Project,
  type ProjectExportRow,
} from './projects-db';

function pmDateDE(d: Date | string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function exportProjectsFlat(brand: string): Promise<ProjectExportRow[]> {
  const { listProjects } = await import('./projects-db');
  await initTicketsSchema();
  const rows: ProjectExportRow[] = [];
  const projects = await listProjects({ brand });

  for (const p of projects) {
    rows.push({
      typ: 'Projekt', projekt: p.name, teilprojekt: '', name: p.name,
      status: p.status, prioritaet: p.priority, kunde: p.customerName ?? '',
      erfasst: pmDateDE(p.createdAt), start: pmDateDE(p.startDate), faelligkeit: pmDateDE(p.dueDate),
      beschreibung: p.description ?? '', notizen: p.notes ?? '',
    });
    const sps = await listSubProjects(p.id);
    for (const sp of sps) {
      rows.push({
        typ: 'Teilprojekt', projekt: p.name, teilprojekt: sp.name, name: sp.name,
        status: sp.status, prioritaet: sp.priority, kunde: sp.customerName ?? '',
        erfasst: pmDateDE(sp.createdAt), start: pmDateDE(sp.startDate), faelligkeit: pmDateDE(sp.dueDate),
        beschreibung: sp.description ?? '', notizen: sp.notes ?? '',
      });
      const spTasks = await listSubProjectTasks(sp.id);
      for (const t of spTasks) {
        rows.push({
          typ: 'Aufgabe', projekt: p.name, teilprojekt: sp.name, name: t.name,
          status: t.status, prioritaet: t.priority, kunde: t.customerName ?? '',
          erfasst: pmDateDE(t.createdAt), start: pmDateDE(t.startDate), faelligkeit: pmDateDE(t.dueDate),
          beschreibung: t.description ?? '', notizen: t.notes ?? '',
        });
      }
    }
    const direct = await listDirectTasks(p.id);
    for (const t of direct) {
      rows.push({
        typ: 'Aufgabe', projekt: p.name, teilprojekt: '', name: t.name,
        status: t.status, prioritaet: t.priority, kunde: t.customerName ?? '',
        erfasst: pmDateDE(t.createdAt), start: pmDateDE(t.startDate), faelligkeit: pmDateDE(t.dueDate),
        beschreibung: t.description ?? '', notizen: t.notes ?? '',
      });
    }
  }
  return rows;
}

export async function listMeetingsForProject(projectId: string): Promise<MeetingWithDetails[]> {
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
  await initTicketsSchema();
  const result = await pool.query(
    `SELECT id, title AS name FROM tickets.tickets
     WHERE type='project' AND parent_id IS NULL
       AND brand = $1 AND title ILIKE $2
     ORDER BY CASE status
       WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
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
