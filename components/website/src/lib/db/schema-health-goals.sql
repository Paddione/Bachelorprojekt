-- website/src/lib/db/schema-health-goals.sql
-- PostgreSQL migration for Service Health Checks and Goals

CREATE TABLE IF NOT EXISTS service_health_goals (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(64) NOT NULL UNIQUE,
    target_availability NUMERIC(5,2) NOT NULL DEFAULT 99.90,
    max_latency_ms INT NOT NULL DEFAULT 500,
    max_error_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0.10,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_health_checks (
    id BIGSERIAL PRIMARY KEY,
    service_name VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL, -- 'healthy', 'degraded', 'unhealthy'
    latency_ms INT NOT NULL,
    error_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    details JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_checks_service_time ON service_health_checks (service_name, checked_at DESC);
