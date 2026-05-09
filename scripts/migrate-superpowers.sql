CREATE SCHEMA IF NOT EXISTS superpowers;

CREATE TABLE IF NOT EXISTS superpowers.plans (
    id           SERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    domains      TEXT[] NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'archived')),
    pr_number    INTEGER,
    file_path    TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS superpowers.plan_sections (
    id           SERIAL PRIMARY KEY,
    plan_id      INTEGER NOT NULL REFERENCES superpowers.plans(id) ON DELETE CASCADE,
    section_type TEXT NOT NULL
                 CHECK (section_type IN ('overview','architecture','tasks','files','gotchas','data-flow','other')),
    content      TEXT NOT NULL,
    seq          INTEGER NOT NULL,
    UNIQUE (plan_id, seq)
);

CREATE INDEX IF NOT EXISTS plan_sections_plan_id_idx ON superpowers.plan_sections(plan_id);
CREATE INDEX IF NOT EXISTS plans_domains_idx ON superpowers.plans USING GIN(domains);
CREATE INDEX IF NOT EXISTS plans_status_idx ON superpowers.plans(status);
