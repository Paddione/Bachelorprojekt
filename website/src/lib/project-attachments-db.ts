/**
 * Project Attachments Database Module
 *
 * Manages ProjectAttachment entities.
 * Extracted from projects-db.ts to reduce file size.
 */

import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';

export interface ProjectAttachment {
  id: string;
  projectId: string;
  filename: string;
  ncPath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
}

export async function listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, project_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM public.customer_project_attachments
     WHERE project_id = $1
     ORDER BY uploaded_at DESC`,
    [projectId]
  );
  return r.rows;
}

export async function getProjectAttachment(id: string): Promise<ProjectAttachment | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, project_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM public.customer_project_attachments WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createProjectAttachment(params: {
  projectId: string; filename: string; ncPath: string; mimeType: string; fileSize: number;
}): Promise<string> {
  await initTicketsSchema();
  const r = await pool.query(
    `INSERT INTO public.customer_project_attachments
       (project_id, filename, nc_path, mime_type, file_size)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [params.projectId, params.filename, params.ncPath, params.mimeType, params.fileSize]
  );
  return r.rows[0].id;
}

export async function deleteProjectAttachmentRecord(id: string): Promise<string | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `DELETE FROM public.customer_project_attachments WHERE id = $1 RETURNING nc_path`,
    [id]
  );
  return r.rows[0]?.nc_path ?? null;
}
