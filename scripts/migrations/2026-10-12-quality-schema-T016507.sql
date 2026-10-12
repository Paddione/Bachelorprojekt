-- scripts/migrations/2026-10-12-quality-schema-T016507.sql
-- PostgreSQL migration: quality schema for Repo-Health goals and measurements (T016507)

CREATE SCHEMA IF NOT EXISTS quality;

CREATE TABLE IF NOT EXISTS quality.repo_health_goals (
    id VARCHAR(32) PRIMARY KEY,
    title TEXT NOT NULL,
    category VARCHAR(32) NOT NULL,
    priority CHAR(1) NOT NULL,
    direction VARCHAR(8) NOT NULL,
    baseline NUMERIC,
    target NUMERIC,
    unit VARCHAR(32) DEFAULT '',
    measurement_cmd TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quality.repo_health_measurements (
    id BIGSERIAL PRIMARY KEY,
    goal_id VARCHAR(32) NOT NULL REFERENCES quality.repo_health_goals(id) ON DELETE CASCADE,
    current_value NUMERIC,
    status VARCHAR(16) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    git_sha VARCHAR(64),
    git_branch VARCHAR(128),
    details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quality_measurements_goal_time 
    ON quality.repo_health_measurements(goal_id, measured_at DESC);

-- View für den schnellen Abruf der neuesten Messung je Ziel
CREATE OR REPLACE VIEW quality.v_repo_health_current AS
SELECT DISTINCT ON (g.id)
    g.id,
    g.title,
    g.category,
    g.priority,
    g.direction,
    g.baseline,
    g.target,
    g.unit,
    g.measurement_cmd,
    g.active,
    m.current_value AS current,
    COALESCE(m.status, 'unknown') AS status,
    m.measured_at,
    m.git_sha,
    m.git_branch,
    m.details
FROM quality.repo_health_goals g
LEFT JOIN quality.repo_health_measurements m ON g.id = m.goal_id
ORDER BY g.id, m.measured_at DESC NULLS LAST;
