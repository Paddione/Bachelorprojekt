/**
 * Project Portal Database Module
 *
 * Manages Portal access patterns and customer functions.
 * Extracted from projects-db.ts to reduce file size.
 */

import { pool } from './db-pool';
import type { Customer } from './website-db';
import { initTicketsSchema } from './tickets-schema';

// SQL fragment for status mapping
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

export async function listProjectsForCustomer(keycloakUserId: string): Promise<PortalProject[]> {
  await initTicketsSchema();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return [];
  const customerId = cust.rows[0].id;

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

// Customers table extensions and functions
let customerExtsReady = false;
async function initCustomerProjectExts(): Promise<void> {
  if (customerExtsReady) return;
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_number TEXT UNIQUE`);
  customerExtsReady = true;
}

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

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, name, email, customer_number, admin_number, is_admin, phone, company FROM customers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}
