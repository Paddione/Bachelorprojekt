/**
 * Projects Database Module
 *
 * Manages Project, SubProject, ProjectTask, ProjectAttachment entities
 * and related Portal/customer access patterns.
 * Extracted from website-db.ts to reduce file size (G-SIZE03).
 */

import { pool } from './db-pool';
import type { Pool, PoolClient } from 'pg';
import { initTicketsSchema } from './tickets-schema';
import { initMeetingProjectLink } from './meetings-db';
import type { Customer } from './website-db';
import type { MeetingWithDetails } from './meetings-db';

// ── Type Definitions ──────────────────────────────────────────────────────────

export type ProjectStatus = 'entwurf' | 'wartend' | 'geplant' | 'aktiv' | 'erledigt' | 'archiviert';
export type ProjectPriority = 'hoch' | 'mittel' | 'niedrig';

export interface Project {
  id: string;
  brand: string;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  subProjectCount: number;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubProject {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  subProjectId: string | null;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectAttachment {
  id: string;
  projectId: string;
  filename: string;
  ncPath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
}

export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  tasks: PortalTask[];
}

export interface PortalTask {
  id: string;
  name: string;
  status: string;
  isUserTask: boolean;
}

export interface ProjectExportRow {
  typ: string; projekt: string; teilprojekt: string; name: string;
  status: string; prioritaet: string; kunde: string;
  erfasst: string; start: string; faelligkeit: string;
  beschreibung: string; notizen: string;
}

// ── Initialization & Helpers ─────────────────────────────────────────────────

// Customers table extensions used by the project module. Idempotent.
let customerExtsReady = false;
async function initCustomerProjectExts(): Promise<void> {
  if (customerExtsReady) return;
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_number TEXT UNIQUE`);
  customerExtsReady = true;
}

// ── Status Mapping ────────────────────────────────────────────────────────────

// Forward map — old project status → new ticket status + resolution.
// Used by createProject/updateProject/createSubProject/.../togglePortalTaskDone.
const STATUS_FWD: Record<string, { status: string; resolution: string | null }> = {
  entwurf:    { status: 'backlog',     resolution: null      },
  geplant:    { status: 'backlog',     resolution: null      },
  wartend:    { status: 'blocked',     resolution: null      },
  aktiv:      { status: 'in_progress', resolution: null      },
  erledigt:   { status: 'done',        resolution: 'shipped' },
  archiviert: { status: 'archived',    resolution: 'shipped' },
};

function mapStatusFwd(s: string): { status: string; resolution: string | null } {
  return STATUS_FWD[s] ?? { status: 'backlog', resolution: null };
}

// SQL fragment that maps `tickets.status` back to the old `ProjectStatus`.
// Centralised so SELECT constants stay readable. Identical to the
// tickets._project_status_back() Postgres function the back-compat views use.
const STATUS_BACK_SQL = `
  CASE __TBL__.status
    WHEN 'triage'      THEN 'entwurf'
    WHEN 'backlog'     THEN 'entwurf'
    WHEN 'in_progress' THEN 'aktiv'
    WHEN 'in_review'   THEN 'aktiv'
    WHEN 'blocked'     THEN 'wartend'
    WHEN 'done'        THEN 'erledigt'
    WHEN 'archived'    THEN 'archiviert'
    ELSE 'entwurf'
  END
`;

// ── SQL Fragments (SELECT & ORDER) ───────────────────────────────────────────

const PROJECT_SELECT = `
  SELECT t.id, t.brand, t.title AS name, t.description, t.notes,
         t.start_date   AS "startDate",  t.due_date   AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 't')}) AS status,
         t.priority,
         t.customer_id  AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         t.assignee_id  AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM tickets.tickets sp
            WHERE sp.parent_id = t.id AND sp.type = 'project') AS "subProjectCount",
         -- A task's parent is either the root project (pt.parent_id = t.id)
         -- or a sub-project (sp.parent_id = t.id). Those sets are disjoint per
         -- the parent_id model, so the OR doesn't double-count.
         (SELECT COUNT(*)::int FROM tickets.tickets pt
            LEFT JOIN tickets.tickets sp ON sp.id = pt.parent_id AND sp.type = 'project'
           WHERE pt.type = 'task'
             AND (pt.parent_id = t.id OR sp.parent_id = t.id)) AS "taskCount",
         t.created_at   AS "createdAt",  t.updated_at AS "updatedAt"
  FROM tickets.tickets t
  LEFT JOIN customers c ON t.customer_id = c.id
  LEFT JOIN customers a ON t.assignee_id = a.id
`;

// Status order: in_progress → backlog/geplant → blocked → triage/entwurf → done → archived.
const PROJECT_ORDER = `
  ORDER BY
    CASE t.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                  WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                  WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    t.due_date ASC NULLS LAST, t.created_at DESC
`;

const SUBPROJECT_SELECT = `
  SELECT sp.id, sp.parent_id AS "projectId", sp.title AS name, sp.description, sp.notes,
         sp.start_date AS "startDate", sp.due_date AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 'sp')}) AS status,
         sp.priority,
         sp.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         sp.assignee_id AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM tickets.tickets pt
            WHERE pt.type = 'task' AND pt.parent_id = sp.id) AS "taskCount",
         sp.created_at AS "createdAt", sp.updated_at AS "updatedAt"
  FROM tickets.tickets sp
  LEFT JOIN customers c ON sp.customer_id = c.id
  LEFT JOIN customers a ON sp.assignee_id = a.id
`;

const SUBPROJECT_ORDER = `
  ORDER BY
    CASE sp.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                   WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                   WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    sp.due_date ASC NULLS LAST
`;

const TASK_SELECT = `
  SELECT pt.id,
         COALESCE(parent.parent_id, pt.parent_id) AS "projectId",
         CASE WHEN parent.parent_id IS NOT NULL THEN pt.parent_id ELSE NULL END
           AS "subProjectId",
         pt.title AS name, pt.description, pt.notes,
         pt.start_date AS "startDate", pt.due_date AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
         pt.priority,
         pt.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         pt.assignee_id AS "adminId",
         a.name         AS "adminName",    a.email AS "adminEmail",
         pt.created_at AS "createdAt", pt.updated_at AS "updatedAt"
  FROM tickets.tickets pt
  LEFT JOIN tickets.tickets parent ON parent.id = pt.parent_id
  LEFT JOIN customers c ON pt.customer_id = c.id
  LEFT JOIN customers a ON pt.assignee_id = a.id
`;

const TASK_ORDER = `
  ORDER BY
    CASE pt.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                   WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                   WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    pt.due_date ASC NULLS LAST
`;

// ── Projects CRUD ─────────────────────────────────────────────────────────────

export async function listProjects(filters: {
  brand: string; status?: string; priority?: string; customerId?: string; q?: string;
}): Promise<Project[]> {
  await initTicketsSchema();
  const { brand, status, priority, customerId, q } = filters;
  // Caller passes status in the OLD enum (entwurf/aktiv/...). Translate forward
  // to the tickets enum for the WHERE clause; pass NULL when no filter set.
  const newStatus = status ? mapStatusFwd(status).status : null;
  const result = await pool.query(
    `${PROJECT_SELECT}
     WHERE t.type = 'project' AND t.parent_id IS NULL
       AND t.brand = $1
       AND ($2::text IS NULL OR t.status      = $2)
       AND ($3::text IS NULL OR t.priority    = $3)
       AND ($4::uuid IS NULL OR t.customer_id = $4)
       AND ($5::text IS NULL OR t.title       ILIKE '%'||$5||'%'
                              OR t.description ILIKE '%'||$5||'%')
     ${PROJECT_ORDER}`,
    [brand, newStatus, priority ?? null, customerId ?? null, q ?? null]
  );
  return result.rows;
}

export async function getProject(id: string): Promise<Project | null> {
  await initTicketsSchema();
  const result = await pool.query(
    `${PROJECT_SELECT} WHERE t.id = $1 AND t.type = 'project' AND t.parent_id IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createProject(params: {
  brand: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Spec §6 invariant: type='project' tickets must have customer_id.
  if (!params.customerId) {
    throw new Error('createProject: customerId is required for type=project tickets');
  }
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('project', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [params.brand, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteProject(id: string): Promise<void> {
  // ON DELETE CASCADE on parent_id wipes child sub_projects and tasks via
  // the tickets.tickets self-referential FK, plus ticket_attachments and
  // any time_entries (post-migration FK now points at tickets.tickets).
  await pool.query(
    `DELETE FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [id]
  );
}

// ── SubProjects CRUD ──────────────────────────────────────────────────────────

export async function listSubProjects(projectId: string): Promise<SubProject[]> {
  await initTicketsSchema();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.type='project' AND sp.parent_id=$1
     ${SUBPROJECT_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function getSubProject(id: string): Promise<SubProject | null> {
  await initTicketsSchema();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.id=$1 AND sp.type='project' AND sp.parent_id IS NOT NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSubProject(params: {
  projectId: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Inherit brand from the parent project ticket.
  const parent = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [params.projectId]);
  if (parent.rowCount === 0) throw new Error(`createSubProject: parent project ${params.projectId} not found`);
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, parent_id, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('project', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [params.projectId, parent.rows[0].brand, params.name,
     params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateSubProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='project' AND parent_id IS NOT NULL`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteSubProject(id: string): Promise<void> {
  await pool.query(
    `DELETE FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NOT NULL`,
    [id]
  );
}

// ── Project Tasks CRUD ────────────────────────────────────────────────────────

export async function listDirectTasks(projectId: string): Promise<ProjectTask[]> {
  await initTicketsSchema();
  // "Direct" tasks have parent = the root project (parent.parent_id IS NULL).
  const result = await pool.query(
    `${TASK_SELECT}
     WHERE pt.type='task'
       AND pt.parent_id = $1
       AND parent.parent_id IS NULL
     ${TASK_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function listSubProjectTasks(subProjectId: string): Promise<ProjectTask[]> {
  await initTicketsSchema();
  const result = await pool.query(
    `${TASK_SELECT}
     WHERE pt.type='task' AND pt.parent_id=$1
     ${TASK_ORDER}`,
    [subProjectId]
  );
  return result.rows;
}

export async function createProjectTask(params: {
  projectId: string; subProjectId?: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Parent is sub_project_id when set, else project_id. Brand inherits from
  // whichever ticket we're attaching to.
  const parentId = params.subProjectId || params.projectId;
  const parent = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id=$1 AND type='project'`, [parentId]);
  if (parent.rowCount === 0) throw new Error(`createProjectTask: parent ticket ${parentId} not found`);
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, parent_id, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('task', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [parentId, parent.rows[0].brand, params.name,
     params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProjectTask(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='task'`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteProjectTask(id: string): Promise<void> {
  await pool.query(`DELETE FROM tickets.tickets WHERE id=$1 AND type='task'`, [id]);
}

// ── Project Attachments ───────────────────────────────────────────────────────

export async function listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, ticket_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM tickets.ticket_attachments
     WHERE ticket_id = $1
     ORDER BY uploaded_at DESC`,
    [projectId]
  );
  return r.rows;
}

export async function getProjectAttachment(id: string): Promise<ProjectAttachment | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, ticket_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM tickets.ticket_attachments WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createProjectAttachment(params: {
  projectId: string; filename: string; ncPath: string; mimeType: string; fileSize: number;
}): Promise<string> {
  await initTicketsSchema();
  const r = await pool.query(
    `INSERT INTO tickets.ticket_attachments
       (ticket_id, filename, nc_path, mime_type, file_size)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [params.projectId, params.filename, params.ncPath, params.mimeType, params.fileSize]
  );
  return r.rows[0].id;
}

export async function deleteProjectAttachmentRecord(id: string): Promise<string | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `DELETE FROM tickets.ticket_attachments WHERE id = $1 RETURNING nc_path`,
    [id]
  );
  return r.rows[0]?.nc_path ?? null;
}

// ── Portal: user-scoped project access ───────────────────────────────────────

export async function listProjectsForCustomer(keycloakUserId: string): Promise<PortalProject[]> {
  await initTicketsSchema();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return [];
  const customerId = cust.rows[0].id;

  // Projects: customer's own, not archived. Surface OLD status for the
  // existing portal UI labels.
  const projects = await pool.query<{ id: string; name: string; description: string | null; status: string; due_date: Date | null }>(
    `SELECT id, title AS name, description,
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 't')}) AS status,
            due_date
       FROM tickets.tickets t
      WHERE type='project' AND parent_id IS NULL
        AND customer_id = $1 AND status <> 'archived'
      ORDER BY created_at DESC`,
    [customerId],
  );

  const result: PortalProject[] = [];
  for (const p of projects.rows) {
    // Tasks under this project: direct children OR children of any sub_project.
    const tasks = await pool.query<{ id: string; name: string; status: string; customer_id: string | null }>(
      `SELECT pt.id, pt.title AS name,
              (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
              pt.customer_id
         FROM tickets.tickets pt
         LEFT JOIN tickets.tickets sp ON sp.id = pt.parent_id AND sp.type = 'project'
        WHERE pt.type='task' AND (pt.parent_id = $1 OR sp.parent_id = $1)
        ORDER BY pt.created_at ASC`,
      [p.id],
    );
    result.push({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      dueDate: p.due_date,
      tasks: tasks.rows.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        isUserTask: t.customer_id === customerId,
      })),
    });
  }
  return result;
}

export async function togglePortalTaskDone(taskId: string, keycloakUserId: string): Promise<{ ok: boolean }> {
  await initTicketsSchema();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return { ok: false };
  const customerId = cust.rows[0].id;

  const task = await pool.query<{ status: string }>(
    `SELECT status FROM tickets.tickets WHERE id = $1 AND type='task' AND customer_id = $2`,
    [taskId, customerId],
  );
  if (!task.rows[0]) return { ok: false };

  // Toggle between done and in_progress (the new-enum equivalents of erledigt/aktiv).
  const flippingClosed = task.rows[0].status === 'done';
  const newStatus     = flippingClosed ? 'in_progress' : 'done';
  const newResolution = flippingClosed ? null          : 'shipped';
  await pool.query(
    `UPDATE tickets.tickets
        SET status = $1, resolution = $2,
            done_at = CASE WHEN $1 = 'done' THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $3 AND type='task'`,
    [newStatus, newResolution, taskId],
  );
  return { ok: true };
}

// ── Customer Functions (cross-cutting, re-exported from customers-db) ────────

export async function listAllCustomers(): Promise<Customer[]> {
  await initTicketsSchema();
  await initCustomerProjectExts();
  const result = await pool.query(
    `SELECT id, name, email, customer_number, is_admin, admin_number
     FROM customers
     WHERE is_admin = false OR is_admin IS NULL
     ORDER BY name ASC`
  );
  return result.rows;
}

export async function listAdminUsers(): Promise<Customer[]> {
  await initTicketsSchema();
  await initCustomerProjectExts();
  const result = await pool.query(
    `SELECT id, name, email, admin_number, is_admin
     FROM customers
     WHERE is_admin = true
     ORDER BY name ASC`
  );
  return result.rows;
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function pmDateDE(d: Date | string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function exportProjectsFlat(brand: string): Promise<ProjectExportRow[]> {
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

// ── Meeting Relations ──────────────────────────────────────────────────────────

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
  // Per-meeting fan-out: 3 parallel queries × N meetings.
  // Acceptable for small project meeting counts; revisit if projects regularly exceed ~20 meetings.
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

export async function getCustomerByEmail(
  email: string
): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, name, email, customer_number, admin_number, is_admin, phone, company FROM customers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}
