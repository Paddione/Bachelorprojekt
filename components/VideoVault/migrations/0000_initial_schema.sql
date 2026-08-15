-- Migration: 0000_initial_schema
-- Description: Create base tables for VideoVault (users, videos, directory_roots, app_settings, filter_presets, client_errors)
-- These tables were previously created by drizzle-kit push (dev-only tool, not available in production).

-- Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================
-- Users table (auth)
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

-- ========================================
-- Videos table (shared library)
-- ========================================
CREATE TABLE IF NOT EXISTS videos (
    id VARCHAR PRIMARY KEY,
    filename TEXT NOT NULL,
    display_name TEXT NOT NULL,
    path TEXT NOT NULL,
    size BIGINT NOT NULL,
    last_modified TIMESTAMP NOT NULL,
    metadata JSONB NOT NULL,
    categories JSONB NOT NULL,
    custom_categories JSONB NOT NULL,
    thumbnail JSONB,
    root_key TEXT,
    hash_fast TEXT,
    hash_perceptual TEXT
);

-- ========================================
-- Directory roots
-- ========================================
CREATE TABLE IF NOT EXISTS directory_roots (
    root_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    directories JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========================================
-- App settings (key-value)
-- ========================================
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========================================
-- Filter presets
-- ========================================
CREATE TABLE IF NOT EXISTS filter_presets (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========================================
-- Client error logs
-- ========================================
CREATE TABLE IF NOT EXISTS client_errors (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    error_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    message TEXT NOT NULL,
    code TEXT NOT NULL,
    severity TEXT NOT NULL,
    context JSONB DEFAULT NULL,
    user_agent TEXT,
    url TEXT,
    stack TEXT,
    request_id TEXT,
    ip TEXT
);
