// website/src/lib/schema/customer-projects-schema.ts
// Idempotente DDL fuer die Kundenprojekt-Tabellen AUSSERHALB des Schemas `tickets`
// (damit der naechste ADR-006-Freeze sie nicht wieder einfängt — design.md D2).
//
// Autoritativ; gespiegelt in scripts/migrations/2026-08-09-customer-projects-copy.sql.
// Mehrfach ausführbar (CREATE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

import type { PoolClient } from 'pg';

export async function initCustomerProjectsSchema(c: PoolClient): Promise<void> {
  await c.query(`CREATE TABLE IF NOT EXISTS public.customer_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.customer_projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('project','task')),
    brand TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    title TEXT NOT NULL, description TEXT, notes TEXT,
    start_date DATE, due_date DATE,
    status TEXT NOT NULL DEFAULT 'backlog', resolution TEXT,
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('hoch','mittel','niedrig')),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_parent_idx ON public.customer_projects(parent_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_brand_idx ON public.customer_projects(brand)`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_customer_idx ON public.customer_projects(customer_id) WHERE customer_id IS NOT NULL`);

  await c.query(`CREATE TABLE IF NOT EXISTS public.customer_project_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, nc_path TEXT, data_url TEXT,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream', file_size BIGINT,
    uploaded_by UUID REFERENCES customers(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL))`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_project_attachments_project_idx ON public.customer_project_attachments(project_id)`);
}
