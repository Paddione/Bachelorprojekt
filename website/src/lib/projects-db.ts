/**
 * Projects Database Module
 *
 * Manages Project, SubProject, ProjectTask entities and related operations.
 * Extracted from website-db.ts to reduce file size (G-SIZE03).
 */

import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';

// Re-export from related modules for convenience (but NOT project-export-db to avoid cycles)
export * from './project-attachments-db';
export * from './project-portal-db';

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

export interface ProjectExportRow {
  typ: string; projekt: string; teilprojekt: string; name: string;
  status: string; prioritaet: string; kunde: string;
  erfasst: string; start: string; faelligkeit: string;
  beschreibung: string; notizen: string;
}

// ── Status Mapping ────────────────────────────────────────────────────────────

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
         (SELECT COUNT(*)::int FROM tickets.tickets pt
            LEFT JOIN tickets.tickets sp ON sp.id = pt.parent_id AND sp.type = 'project'
           WHERE pt.type = 'task'
             AND (pt.parent_id = t.id OR sp.parent_id = t.id)) AS "taskCount",
         t.created_at   AS "createdAt",  t.updated_at AS "updatedAt"
  FROM tickets.tickets t
  LEFT JOIN customers c ON t.customer_id = c.id
  LEFT JOIN customers a ON t.assignee_id = a.id
`;

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
